#include "App.hpp"
#include <fstream>
#include <iostream>
namespace mr {
namespace {
void check(bool ok) {
  if (!ok)
    throw std::runtime_error("Native check failed");
}
std::vector<unsigned char> readBytes(const std::filesystem::path &p) {
  std::ifstream f(p, std::ios::binary);
  return std::vector<unsigned char>((std::istreambuf_iterator<char>(f)), {});
}
} // namespace
int selfTest(const Http &http, const std::filesystem::path &report) {
  Json result = {{"ok", false}, {"pointerBits", sizeof(void *) * 8}, {"revision", MR_REVISION}};
  try {
    auto health = payload(http.json("GET", "/api/native/v1/health"));
    check(text(health, "runtime") == "cpp20");
    result["cppBackend"] = true;
    auto catalog = payload(http.json("GET", "/api/native/v1/works?limit=24"));
    check(catalog["works"].is_array());
    result["catalogueWorks"] = catalog["works"].size();
    for (const auto &w : catalog["works"]) {
      auto creator = w.value("creator", Json::object());
      auto detail =
          payload(http.json("GET", "/api/native/v1/works/" + encoded(text(creator, "handle")) +
                                       "/" + encoded(text(w, "slug"))))["work"];
      auto image = text(detail, "image");
      if (!image.empty()) {
        auto p = decodeImage(http.bytes(image));
        check(p.width > 0 && p.height > 0);
        result["imageDecoder"] = true;
      }
      auto model = text(detail, "modelUrl");
      if (!model.empty() && model.ends_with(".glb")) {
        auto m = safeDecode(http.bytes(model, 128 * 1024 * 1024));
        check(m->triangles > 0);
        result["modelTriangles"] = m->triangles;
        result["draco"] = m->draco;
        bool decoded = false;
        for (auto &mesh : m->meshes)
          if (!mesh.texture.empty()) {
            auto p = decodeImage(mesh.texture, 2048);
            decoded = p.width > 0;
            break;
          }
        result["modelTexture"] = decoded;
        break;
      }
    }
    bool blocked = false;
    try {
      http.absolute("https://example.com/steal");
    } catch (...) {
      blocked = true;
    }
    check(blocked);
    result["externalUrlBlocked"] = true;
    for (const auto &invalid : {L"http://localhost:123@evil.example", L"https://mrright.blog/path",
                                L"https://mrright.blog?x=1", L"https://user:pass@mrright.blog"}) {
      bool denied = false;
      try {
        Http candidate(invalid);
      } catch (...) {
        denied = true;
      }
      check(denied);
    }
    result["invalidOriginsBlocked"] = true;

    check(catalog.dump().find("password") == std::string::npos);
    result["ok"] = true;
  } catch (...) {
    result["error"] = "Native runtime check failed";
  }
  std::ofstream out(report);
  out << result.dump(2);
  return result.value("ok", false) ? 0 : 1;
}
int integrationTest(const std::filesystem::path &configPath, const std::filesystem::path &report) {
  Json result = {{"ok", false}, {"revision", MR_REVISION}};
  try {
    std::ifstream in(configPath);
    Json config = Json::parse(in);
    Http http(wide(text(config, "server")));
    auto account = payload(
        http.json("POST", "/api/auth/login", "",
                  {{"email", text(config, "email")}, {"password", text(config, "password")}}));
    auto token = text(account["session"], "token");
    check(!token.empty());
    result["realLogin"] = true;
    auto created = payload(
        http.json("POST", "/api/account/works", token,
                  {{"title", "Native Windows integration"}, {"resourceType", "image"}}))["work"];
    auto id = text(created, "id"), slug = text(created, "slug"),
         handle = text(account["user"], "handle");
    auto png = std::filesystem::path(wide(text(config, "png"))),
         notes = std::filesystem::path(wide(text(config, "notes")));
    http.upload(id, "source", png, token, [](auto, auto) {});
    http.upload(id, "source", notes, token, [](auto, auto) {});
    http.json("PATCH", "/api/account/works/" + encoded(id) + "/status", token,
              {{"status", "review"}});
    http.json("PATCH", "/api/admin/works/" + encoded(id) + "/status", text(config, "admin"),
              {{"status", "published"}});
    auto detail = payload(
        http.json("GET", "/api/native/v1/works/" + encoded(handle) + "/" + encoded(slug)))["work"];
    auto assets = detail["assets"];
    check(assets.size() == 2);
    std::string assetId;
    for (auto &a : assets) {
      check(a["fileUrl"].is_null());
      check(a.value("protected", false));
      if (text(a, "fileName") == utf8(notes.filename().wstring()))
        assetId = text(a, "id");
    }
    check(!assetId.empty());
    result["nativeUnicodeUpload"] = true;
    result["protectedOriginals"] = true;
    auto ticket = payload(http.json(
        "POST", "/api/works/" + encoded(handle) + "/" + encoded(slug) + "/download-ticket", token,
        {{"assetId", assetId}}))["ticket"];
    auto dest = std::filesystem::path(wide(text(config, "download")));
    http.download(text(ticket, "url"), dest, std::make_shared<std::atomic_bool>(false),
                  [](auto, auto) {});
    check(readBytes(dest) == readBytes(notes));
    result["byteExactSelectedDownload"] = true;
    bool used = false;
    try {
      http.bytes(text(ticket, "url"));
    } catch (const HttpError &e) {
      used = e.status == 403;
    }
    check(used);
    result["singleUseTicket"] = true;

    result["stage"] = "transfer cancellation";
    auto caseFolder = dest.parent_path() / wide("transfer-cases-" + uniqueName());
    std::filesystem::create_directory(caseFolder);
    struct Cleanup {
      std::filesystem::path folder;
      ~Cleanup() {
        std::error_code ec;
        for (const auto &p : std::filesystem::directory_iterator(folder, ec))
          std::filesystem::remove(p.path(), ec);
        std::filesystem::remove(folder, ec);
      }
    } cleanup{caseFolder};
    auto original = caseFolder / L"原有文件.txt";
    auto sentinel = [&] {
      std::ofstream f(original, std::ios::binary);
      f << "keep existing file";
    };
    auto onlyOriginal = [&] {
      size_t count = 0;
      for (const auto &p : std::filesystem::directory_iterator(caseFolder)) {
        (void)p;
        ++count;
      }
      return count == 1;
    };
    sentinel();
    auto expected = readBytes(original);
    auto cancel = std::make_shared<std::atomic_bool>(true);
    bool cancelled = false;
    try {
      http.download("/native-fixtures/download", original, cancel, [](auto, auto) {});
    } catch (const TransferCancelled &) {
      cancelled = true;
    }
    check(cancelled && readBytes(original) == expected && onlyOriginal());
    result["preCancelledDownloadKeptOriginal"] = true;
    cancel->store(false);
    cancelled = false;
    try {
      http.download("/native-fixtures/download", original, cancel, [&](auto done, auto) {
        if (done)
          cancel->store(true);
      });
    } catch (const TransferCancelled &) {
      cancelled = true;
    }
    check(cancelled && readBytes(original) == expected && onlyOriginal());
    result["midDownloadCancelKeptOriginal"] = true;
    cancel->store(false);
    bool interrupted = false;
    try {
      http.download("/native-fixtures/truncated", original, cancel, [](auto, auto) {});
    } catch (const HttpError &) {
      interrupted = true;
    }
    check(interrupted && readBytes(original) == expected && onlyOriginal());
    result["interruptedDownloadKeptOriginal"] = true;
    http.download("/native-fixtures/download", original, cancel, [](auto, auto) {});
    auto complete = readBytes(original);
    check(complete.size() == 2 * 1024 * 1024 &&
          std::all_of(complete.begin(), complete.end(), [](auto c) { return c == 81; }) &&
          onlyOriginal());
    result["completedDownloadAtomicallyReplaced"] = true;
    auto draft = payload(
        http.json("POST", "/api/account/works", token,
                  {{"title", "Cancelled upload fixture"}, {"resourceType", "document"}}))["work"];
    auto uploadFile = caseFolder / L"取消上传.txt";
    {
      std::ofstream f(uploadFile, std::ios::binary);
      f.write(reinterpret_cast<const char *>(complete.data()), complete.size());
    }
    auto uploadCount = http.json("GET", "/native-fixtures/upload-count").at("files");
    cancel->store(false);
    cancelled = false;
    try {
      Http(wide(text(config, "legacyServer", text(config, "server"))))
          .upload(
              text(draft, "id"), "source", uploadFile, token,
              [&](auto done, auto) {
                if (done)
                  cancel->store(true);
              },
              cancel);
    } catch (const TransferCancelled &) {
      cancelled = true;
    }
    result["stage"] = "upload cancel raised";
    check(cancelled);
    Sleep(150);
    auto kept = payload(
        http.json("GET", "/api/works/" + encoded(handle) + "/" + encoded(text(draft, "slug")),
                  token))["work"];
    result["stage"] = "cancelled draft retained";
    check(text(kept, "status") == "draft" && kept["assets"].empty());
    result["stage"] = "orphan file cleanup";
    result["filesBeforeCancelledUpload"] = uploadCount;
    result["filesAfterCancelledUpload"] =
        http.json("GET", "/native-fixtures/upload-count").at("files");
    check(http.json("GET", "/native-fixtures/upload-count").at("files") == uploadCount);
    result["midUploadCancelKeptDraftNoPartialAsset"] = true;
    result["cancelledUploadLeavesNoOrphanFile"] = true;

    http.json("POST", "/api/auth/logout", token);
    bool revoked = false;
    try {
      http.json("GET", "/api/account/works", token);
    } catch (const HttpError &e) {
      revoked = e.status == 401;
    }
    check(revoked);
    result["logoutRevoked"] = true;
    result["ok"] = true;
    result.erase("stage");
    SecureZeroMemory(token.data(), token.size());
  } catch (...) {
    result["error"] = "Native integration check failed";
  }
  std::ofstream out(report);
  out << result.dump(2);
  return result.value("ok", false) ? 0 : 1;
}
} // namespace mr
