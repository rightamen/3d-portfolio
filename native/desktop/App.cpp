#include "App.hpp"
#include <algorithm>
#include <fstream>
#include <shellapi.h>
namespace mr {
App::App(std::wstring origin) : http(std::move(origin)) {
  try {
    std::ifstream in(appFolder() / L"preferences.json");
    if (in) {
      auto p = Json::parse(in);
      prefs.language = std::clamp(p.value("language", 0), 0, 2);
      prefs.theme = std::clamp(p.value("theme", 0), 0, 2);
      prefs.motion = p.value("motion", true);
    }
  } catch (...) {
  }
  colors = palette(prefs.theme);
}
App::~App() {
  for (auto &j : jobs)
    j.cancel->store(true);
  for (auto &[key, p] : images)
    p->Release();
  for (auto &[key, p] : formats)
    p->Release();
  if (brush)
    brush->Release();
  if (target)
    target->Release();
  if (writer)
    writer->Release();
  if (factory)
    factory->Release();
  if (font)
    DeleteObject(font);
  if (editBrush)
    DeleteObject(editBrush);
  if (!token.empty())
    SecureZeroMemory(token.data(), token.size());
}
std::wstring App::copy(const char *k) const {
  return label(prefs.language, k);
}
std::wstring App::title(const Json &w) const {
  return wide(localized(w, "title", prefs.language));
}
void App::repaint() {
  InvalidateRect(hwnd, nullptr, FALSE);
}
void App::info(const char *k) {
  MessageBoxW(hwnd, copy(k).c_str(), L"mrright Studio", MB_ICONINFORMATION);
}
std::string App::cover(const Json &w) const {
  auto url = mr::text(w, "thumbnail");
  return url.empty() ? mr::text(w, "image") : url;
}
void App::clearSelection() {
  detail = nullptr;
  detailLoading = false;
  detailScroll = 0;
  ++detailGen;
  layout();
}
void App::load() {
  ++generation;
  scroll = 0;
  lastError.clear();
  works = Json::array();
  clearSelection();
  if (mode == 3) {
    loading = false;
    repaint();
    return;
  }
  if (mode == 2 && token.empty()) {
    loading = false;
    lastError = "notSigned";
    repaint();
    return;
  }
  loading = true;
  auto client = http;
  auto auth = token;
  int gen = generation, acc = account;
  bool mine = mode == 2;
  auto path = mine ? "/api/account/works?limit=24&page=" + std::to_string(page) +
                         "&resourceType=" + encoded(type)
                   : "/api/native/v1/works?limit=24&page=" + std::to_string(page) +
                         "&resourceType=" + encoded(type) + "&category=" + encoded(subject) +
                         "&q=" + encoded(query) + (mode == 1 ? "&exhibition=true" : "");
  dispatch(io, hwnd, Operation::Catalogue, gen, acc, mine,
           [=](Event &e) { e.value = client.json("GET", path, mine ? auth : ""); });
  repaint();
}
void App::select(int i) {
  if (i < 0 || size_t(i) >= works.size())
    return;
  detail = nullptr;
  detailLoading = true;
  detailScroll = 0;
  int gen = ++detailGen;
  auto w = works[i];
  auto creator = w.value("creator", Json::object());
  bool mine = mode == 2;
  auto path = std::string(mine ? "/api/works/" : "/api/native/v1/works/") +
              encoded(mr::text(creator, "handle")) + "/" + encoded(mr::text(w, "slug")),
       auth = mine ? token : "";
  auto client = http;
  dispatch(io, hwnd, Operation::Detail, gen, account, mine,
           [=](Event &e) { e.value = client.json("GET", path, auth); });
  layout();
}
void App::image(const std::string &url, const std::string &fallback) {
  if (url.empty() || images.contains(url) || pendingImages.contains(url) ||
      failedImages.contains(url))
    return;
  pendingImages.insert(url);
  auto client = http;
  dispatch(imageIO, hwnd, Operation::Image, 0, 0, false, [=](Event &e) {
    e.key = url;
    std::vector<unsigned char> b;
    try {
      b = client.bytes(url);
    } catch (...) {
      if (fallback.empty() || fallback == url)
        throw;
      b = client.bytes(fallback);
    }
    e.pixels = decodeImage(b, 1000);
  });
}
void App::signIn(int after) {
  if (authBusy)
    return;
  auto value = loginDialog(hwnd, prefs.language, prefs.theme);
  if (!value) {
    afterLogin = 0;
    return;
  }
  afterLogin = after;
  authBusy = true;
  auto client = http;
  auto credentials = *value;
  dispatch(io, hwnd, Operation::Auth, 0, account, false,
           [client, credentials = std::move(credentials)](Event &e) mutable {
             try {
               e.value =
                   client.json("POST", "/api/auth/login", "",
                               {{"email", credentials.email}, {"password", credentials.password}});
             } catch (...) {
               SecureZeroMemory(credentials.password.data(), credentials.password.size());
               throw;
             }
             SecureZeroMemory(credentials.password.data(), credentials.password.size());
           });
  repaint();
}
void App::clearLogin(bool remote) {
  auto old = token;
  if (!token.empty())
    SecureZeroMemory(token.data(), token.size());
  token.clear();
  loginUser = nullptr;
  account++;
  uploading = false;
  for (auto &j : jobs)
    j.cancel->store(true);
  jobs.clear();
  afterLogin = 0;
  pendingAsset.clear();
  pendingWork.clear();
  if (remote && !old.empty()) {
    auto client = http;
    dispatch(io, hwnd, Operation::Health, 0, account, false, [=](Event &e) {
      client.json("POST", "/api/auth/logout", old);
      e.value = nullptr;
    });
  }
  SetWindowTextW(buttons[100], copy("login").c_str());
  if (mode == 2)
    load();
  else
    repaint();
}
void App::publish(const Json &existing) {
  if (uploading)
    return;
  if (token.empty()) {
    signIn(1);
    return;
  }
  if (mr::text(loginUser, "handle").empty()) {
    info("noHandle");
    return;
  }
  auto value = publishDialog(hwnd, prefs.language, prefs.theme, existing);
  if (!value)
    return;
  auto p = *value;
  auto client = http;
  auto auth = token;
  int id = nextJob++, acc = account;
  uploading = true;
  Job job;
  job.id = id;
  job.title = copy("uploading");
  job.name = wide(p.title);
  jobs.push_back(job);
  auto h = hwnd;
  dispatch(transfers, h, Operation::Upload, 0, acc, true, [=](Event &e) {
    e.id = id;
    std::string workId = p.existingId;
    try {
      if (workId.empty()) {
        auto d = payload(client.json("POST", "/api/account/works", auth,
                                     {{"title", p.title}, {"resourceType", p.type}}));
        workId = mr::text(d.at("work"), "id");
      }
      if (workId.empty())
        throw std::runtime_error("Draft unavailable");
      size_t steps = p.sources.size() + (!p.cover.empty() ? 1 : 0) + (!p.preview.empty() ? 1 : 0),
             step = 0;
      auto upload = [&](const std::string &kind, const std::filesystem::path &file) {
        client.upload(workId, kind, file, auth, [&](uint64_t done, uint64_t total) {
          auto progress = std::make_unique<Event>();
          progress->operation = Operation::Progress;
          progress->id = id;
          progress->account = acc;
          progress->sensitive = true;
          progress->value = {
              {"progress", (step + double(done) / std::max<uint64_t>(1, total)) / steps}};
          post(h, std::move(progress));
        });
        step++;
      };
      if (!p.cover.empty())
        upload("preview", p.cover);
      if (!p.preview.empty())
        upload(p.type == "model"   ? "model"
               : p.type == "video" ? "video"
               : p.type == "audio" ? "audio"
                                   : "image",
               p.preview);
      for (auto &file : p.sources)
        upload("source", file);
      if (p.review)
        client.json("PATCH", "/api/account/works/" + encoded(workId) + "/status", auth,
                    {{"status", "review"}});
      e.key = p.review ? "reviewSent" : "draftSaved";
    } catch (const HttpError &error) {
      e.ok = false;
      e.status = error.status;
      e.key = workId.empty() ? "error" : "uploadKept";
    } catch (...) {
      e.ok = false;
      e.key = workId.empty() ? "error" : "uploadKept";
    }
  });
  repaint();
}
void App::download(int i) {
  auto assets = detail.value("assets", Json::array());
  if (i < 0 || size_t(i) >= assets.size())
    return;
  Json asset = assets[i];
  bool locked = asset.value("protected", false);
  if (locked && token.empty()) {
    pendingWork = mr::text(detail, "id");
    pendingAsset = mr::text(asset, "id");
    signIn(2);
    return;
  }
  auto chosen = saveFile(hwnd, wide(mr::text(asset, "fileName", "resource")));
  if (!chosen)
    return;
  auto path = *chosen;
  int id = nextJob++, acc = account;
  Job job;
  job.id = id;
  job.title = title(detail);
  job.name = path.filename().wstring();
  job.file = path;
  auto cancel = job.cancel;
  jobs.push_back(job);
  auto client = http;
  auto auth = token;
  auto w = detail;
  HWND h = hwnd;
  dispatch(transfers, h, Operation::Download, 0, acc, locked, [=](Event &e) {
    e.id = id;
    auto url = mr::text(asset, "fileUrl");
    if (locked) {
      auto c = w.value("creator", Json::object());
      auto ticket = payload(client.json("POST",
                                        "/api/works/" + encoded(mr::text(c, "handle")) + "/" +
                                            encoded(mr::text(w, "slug")) + "/download-ticket",
                                        auth, {{"assetId", mr::text(asset, "id")}}));
      url = mr::text(ticket.at("ticket"), "url");
    }
    client.download(url, path, cancel, [&](uint64_t done, uint64_t total) {
      auto p = std::make_unique<Event>();
      p->operation = Operation::Progress;
      p->id = id;
      p->account = acc;
      p->sensitive = locked;
      p->value = {{"progress", total ? std::min(1., double(done) / total) : 0.}};
      post(h, std::move(p));
    });
  });
  repaint();
}
void App::model() {
  auto url = mr::text(detail, "modelUrl");
  if (url.empty()) {
    info("modelFailed");
    return;
  }
  lastError = "model-loading";
  auto client = http;
  dispatch(transfers, hwnd, Operation::Model, detailGen, account, false,
           [=](Event &e) { e.model = safeDecode(client.bytes(url, 128 * 1024 * 1024)); });
  repaint();
}
void App::picture() {
  auto url = mr::text(detail, "image");
  if (url.empty())
    url = cover(detail);
  auto client = http;
  dispatch(imageIO, hwnd, Operation::Picture, detailGen, account, false,
           [=](Event &e) { e.pixels = decodeImage(client.bytes(url), 4096); });
}
void App::media() {
  std::string kind = mr::text(detail, "resourceType");
  Json asset;
  for (auto &a : detail.value("assets", Json::array()))
    if (mr::text(a, "kind") == kind && !a.value("protected", false) &&
        !mr::text(a, "fileUrl").empty()) {
      asset = a;
      break;
    }
  if (asset.is_null())
    return;
  auto url = mr::text(asset, "fileUrl");
  auto ext = std::filesystem::path(wide(url)).extension().wstring();
  std::transform(ext.begin(), ext.end(), ext.begin(), ::towlower);
  std::set<std::wstring> allowed = {L".mp4", L".webm", L".mov", L".mp3",
                                    L".wav", L".ogg",  L".flac"};
  if (!allowed.contains(ext))
    return;
  auto folder = appFolder() / L"previews";
  std::filesystem::create_directories(folder);
  auto file = folder / (wide(uniqueName()) + ext);
  auto client = http;
  dispatch(transfers, hwnd, Operation::Media, detailGen, account, false, [=](Event &e) {
    auto bytes = client.bytes(url, 128 * 1024 * 1024);
    std::ofstream out(file, std::ios::binary);
    out.write(reinterpret_cast<const char *>(bytes.data()), bytes.size());
    if (!out)
      throw std::runtime_error("Preview unavailable");
    e.file = file;
  });
}
void App::event(Event &e) {
  if (e.sensitive && e.account != account)
    return;
  if (e.operation == Operation::Image) {
    pendingImages.erase(e.key);
    if (!e.ok) {
      failedImages.insert(e.key);
      return;
    }
    if (target) {
      ID2D1Bitmap *b = nullptr;
      if (SUCCEEDED(
              target->CreateBitmap(D2D1::SizeU(e.pixels.width, e.pixels.height),
                                   e.pixels.data.data(), e.pixels.width * 4,
                                   D2D1::BitmapProperties(D2D1::PixelFormat(
                                       DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED)),
                                   &b))) {
        if (images.contains(e.key))
          images[e.key]->Release();
        images[e.key] = b;
        while (images.size() > 96) {
          auto i = images.begin();
          i->second->Release();
          images.erase(i);
        }
      }
    }
    repaint();
    return;
  }
  if (e.operation == Operation::Progress) {
    for (auto &j : jobs)
      if (j.id == e.id)
        j.progress = e.value.value("progress", 0.);
    repaint();
    return;
  }
  if (e.operation == Operation::Auth) {
    authBusy = false;
    if (e.account != account)
      return;
    if (!e.ok) {
      afterLogin = 0;
      info("signinFailed");
      return;
    }
    auto d = payload(e.value);
    if (!d.contains("session") || !d.contains("user")) {
      info("signinFailed");
      return;
    }
    token = mr::text(d["session"], "token");
    loginUser = d["user"];
    if (token.empty()) {
      info("signinFailed");
      return;
    }
    SetWindowTextW(buttons[100], copy("logout").c_str());
    int after = afterLogin;
    afterLogin = 0;
    if (after == 1)
      publish();
    else if (after == 2 && mr::text(detail, "id") == pendingWork) {
      auto assets = detail.value("assets", Json::array());
      for (size_t i = 0; i < assets.size(); i++)
        if (mr::text(assets[i], "id") == pendingAsset) {
          download(int(i));
          break;
        }
    } else if (mode == 2)
      load();
    repaint();
    return;
  }
  if (e.operation == Operation::Upload || e.operation == Operation::Download) {
    for (auto &j : jobs)
      if (j.id == e.id) {
        j.done = true;
        j.failed = !e.ok;
        if (e.ok)
          j.progress = 1;
      }
    if (e.operation == Operation::Upload) {
      uploading = false;
      info(e.key.empty() ? "error" : e.key.c_str());
      if (mode == 2)
        load();
    } else if (!e.ok)
      info(e.status == 403 ? "paid" : "error");
    if (!e.ok && e.sensitive && e.status == 401)
      clearLogin(false);
    repaint();
    return;
  }
  if (e.operation == Operation::Catalogue) {
    if (e.generation != generation)
      return;
    loading = false;
    if (!e.ok) {
      lastError = "offline";
      if (e.sensitive && e.status == 401) {
        clearLogin(false);
        lastError = "notSigned";
      }
      repaint();
      return;
    }
    auto d = payload(e.value);
    works = d.value("works", Json::array());
    if (!works.is_array())
      works = Json::array();
    pagination = e.value.value("pagination", Json::object());
    counts = d.value("resourceCounts", Json::object());
    lastError.clear();
    layout();
    return;
  }
  if (e.operation == Operation::Detail) {
    if (e.generation != detailGen)
      return;
    detailLoading = false;
    if (!e.ok) {
      lastError = "offline";
      if (e.sensitive && e.status == 401)
        clearLogin(false);
    } else
      detail = payload(e.value).value("work", Json{});
    layout();
    return;
  }
  if (e.operation == Operation::Health) {
    if (e.ok && e.value.is_object())
      cppReady = mr::text(payload(e.value), "runtime") == "cpp20";
    repaint();
    return;
  }
  if (e.generation != detailGen)
    return;
  if (e.operation == Operation::Model) {
    lastError.clear();
    if (e.ok)
      showModel(hwnd, e.model, title(detail));
    else
      info("modelFailed");
  }
  if (e.operation == Operation::Picture) {
    if (e.ok)
      showPicture(hwnd, e.pixels, title(detail));
    else
      info("error");
  }
  if (e.operation == Operation::Media) {
    if (e.ok)
      ShellExecuteW(hwnd, L"open", e.file.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    else
      info("error");
  }
  repaint();
}
void App::button(int id) {
  if (id == 100) {
    if (token.empty())
      signIn();
    else
      clearLogin(true);
  } else if (id == 101)
    publish();
  else if (id == 102) {
    failedImages.clear();
    load();
  } else if (id == 103) {
    auto result = settingsDialog(hwnd, prefs);
    if (result) {
      prefs = *result;
      try {
        std::ofstream out(appFolder() / L"preferences.json");
        out << Json{{"language", prefs.language}, {"theme", prefs.theme}, {"motion", prefs.motion}}
                   .dump(2);
      } catch (...) {
      }
      preferences();
    }
  } else if (id == 104)
    openWeb(http, "/account/works");
  else if (id == 105 && page > 1) {
    page--;
    load();
  } else if (id == 106 && pagination.value("hasNext", false)) {
    page++;
    load();
  } else if (id == 107) {
    wall = !wall;
    SetWindowTextW(buttons[107], copy(wall ? "list" : "wall").c_str());
    repaint();
  } else if (id >= 110 && id <= 113) {
    mode = id - 110;
    page = 1;
    wall = false;
    subject.clear();
    load();
    if (mode == 2 && token.empty())
      signIn();
  } else if (id >= 300 && id <= 307) {
    type = id == 300 ? "" : std::string(resourceTypes[id - 301]);
    subject.clear();
    page = 1;
    SendMessageW(subjects, CB_SETCURSEL, 0, 0);
    load();
  }
}
void App::activate(Hit h) {
  switch (h.action) {
  case Action::Card:
    select(h.index);
    break;
  case Action::Download:
    download(h.index);
    break;
  case Action::Model:
    model();
    break;
  case Action::Picture:
    picture();
    break;
  case Action::Media:
    media();
    break;
  case Action::Web:
    if (detail.is_object())
      openWeb(http, mr::text(detail, "url"));
    break;
  case Action::Continue:
    publish(detail);
    break;
  case Action::Close:
    clearSelection();
    break;
  case Action::Folder:
    if (size_t(h.index) < jobs.size())
      openFolder(jobs[h.index].file);
    break;
  case Action::Cancel:
    if (size_t(h.index) < jobs.size())
      jobs[h.index].cancel->store(true);
    break;
  }
}
} // namespace mr
