#include "Http.hpp"
#include <algorithm>
#include <array>
#include <cctype>
#include <fstream>
#include <limits>
#include <sstream>
#include <winhttp.h>
namespace mr {
std::string utf8(const std::wstring &s) {
  if (s.empty())
    return {};
  int n = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, s.data(), int(s.size()), nullptr, 0,
                              nullptr, nullptr);
  if (!n)
    throw std::runtime_error("Invalid text");
  std::string r(n, 0);
  WideCharToMultiByte(CP_UTF8, 0, s.data(), int(s.size()), r.data(), n, nullptr, nullptr);
  return r;
}
std::wstring wide(const std::string &s) {
  if (s.empty())
    return {};
  int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(), int(s.size()), nullptr, 0);
  if (!n)
    return L"?";
  std::wstring r(n, 0);
  MultiByteToWideChar(CP_UTF8, 0, s.data(), int(s.size()), r.data(), n);
  return r;
}
std::string encoded(const std::string &s) {
  std::string r;
  constexpr char hex[] = "0123456789ABCDEF";
  for (unsigned char c : s) {
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' ||
        c == '_' || c == '.' || c == '~')
      r += char(c);
    else {
      r += '%';
      r += hex[c >> 4];
      r += hex[c & 15];
    }
  }
  return r;
}
std::string text(const Json &j, const char *k, std::string fallback) {
  auto i = j.find(k);
  return i != j.end() && i->is_string() ? i->get<std::string>() : fallback;
}
std::string localized(const Json &j, const char *k, int l) {
  std::string name = k;
  name += (l == 0 ? "Zh" : l == 2 ? "Ja" : "En");
  auto s = text(j, name.c_str());
  return s.empty() ? text(j, k) : s;
}
namespace {
struct Internet {
  HINTERNET h = nullptr;
  Internet() = default;
  explicit Internet(HINTERNET p) : h(p) {
    if (!p)
      throw HttpError(0, "Network connection failed");
  }
  ~Internet() {
    if (h)
      WinHttpCloseHandle(h);
  }
  Internet(const Internet &) = delete;
};
struct Call {
  Internet session, connection, request;
  DWORD status = 0;
  Call(const Http &client, const std::string &method, const std::string &path,
       const std::string &token)
      : session(WinHttpOpen(L"mrright-Studio/0.1 (native C++)", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                            WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0)) {
    auto url = client.absolute(path);
    URL_COMPONENTS parts{sizeof(parts)};
    parts.dwHostNameLength = DWORD(-1);
    parts.dwUrlPathLength = DWORD(-1);
    parts.dwExtraInfoLength = DWORD(-1);
    if (!WinHttpCrackUrl(url.c_str(), DWORD(url.size()), 0, &parts))
      throw HttpError(0, "Invalid service URL");
    std::wstring host(parts.lpszHostName, parts.dwHostNameLength),
        target(parts.lpszUrlPath, parts.dwUrlPathLength);
    if (parts.dwExtraInfoLength)
      target.append(parts.lpszExtraInfo, parts.dwExtraInfoLength);
    WinHttpSetTimeouts(session.h, 5000, 8000, 30000, 30000);
    connection.h = WinHttpConnect(session.h, host.c_str(), parts.nPort, 0);
    if (!connection.h)
      throw HttpError(0, "Network connection failed");
    request.h =
        WinHttpOpenRequest(connection.h, wide(method).c_str(), target.c_str(), nullptr,
                           WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                           parts.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0);
    if (!request.h)
      throw HttpError(0, "Network request failed");
    DWORD policy = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    WinHttpSetOption(request.h, WINHTTP_OPTION_REDIRECT_POLICY, &policy, sizeof(policy));
    std::wstring headers = L"Accept: application/json\r\n";
    if (!token.empty())
      headers += L"Authorization: Bearer " + wide(token) + L"\r\n";
    if (!WinHttpAddRequestHeaders(request.h, headers.c_str(), DWORD(-1), WINHTTP_ADDREQ_FLAG_ADD))
      throw HttpError(0, "Network request failed");
  }
  void send(const std::wstring &headers, const void *body, DWORD length, DWORD total = 0) {
    if (!WinHttpSendRequest(request.h,
                            headers.empty() ? WINHTTP_NO_ADDITIONAL_HEADERS : headers.c_str(),
                            headers.empty() ? 0 : DWORD(headers.size()), const_cast<void *>(body),
                            length, total ? total : length, 0))
      throw HttpError(0, "Could not send request");
  }
  void receive() {
    if (!WinHttpReceiveResponse(request.h, nullptr))
      throw HttpError(0, "The service did not respond");
    DWORD n = sizeof(status);
    if (!WinHttpQueryHeaders(request.h, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                             nullptr, &status, &n, nullptr))
      throw HttpError(0, "Invalid service response");
  }
  std::vector<unsigned char> read(size_t max) {
    std::vector<unsigned char> data;
    std::array<unsigned char, 65536> b;
    for (;;) {
      DWORD n = 0;
      if (!WinHttpReadData(request.h, b.data(), DWORD(b.size()), &n))
        throw HttpError(0, "Transfer interrupted");
      if (!n)
        break;
      if (data.size() + n > max)
        throw HttpError(0, "Response exceeds the supported limit");
      data.insert(data.end(), b.data(), b.data() + n);
    }
    return data;
  }
};
Json parse(Call &c) {
  auto bytes = c.read(8 * 1024 * 1024);
  Json data;
  try {
    data = Json::parse(bytes);
  } catch (...) {
    throw HttpError(int(c.status), "Invalid service response");
  }
  if (c.status < 200 || c.status >= 300) {
    std::string message = "The operation failed";
    if (data.contains("error") && data["error"].is_object())
      message = text(data["error"], "message", message);
    throw HttpError(int(c.status), message.substr(0, 300));
  }
  return data;
}
} // namespace
Http::Http(std::wstring origin) : origin_(std::move(origin)) {
  while (!origin_.empty() && origin_.back() == L'/')
    origin_.pop_back();
  URL_COMPONENTS parts{sizeof(parts)};
  parts.dwHostNameLength = DWORD(-1);
  parts.dwUserNameLength = DWORD(-1);
  parts.dwPasswordLength = DWORD(-1);
  parts.dwUrlPathLength = DWORD(-1);
  parts.dwExtraInfoLength = DWORD(-1);
  if (!WinHttpCrackUrl(origin_.c_str(), DWORD(origin_.size()), 0, &parts))
    throw std::runtime_error("Invalid service URL");
  std::wstring host(parts.lpszHostName, parts.dwHostNameLength);
  bool secure = parts.nScheme == INTERNET_SCHEME_HTTPS;
  bool local =
      parts.nScheme == INTERNET_SCHEME_HTTP && (host == L"127.0.0.1" || host == L"localhost");
  if ((!secure && !local) || host.empty() || parts.dwUserNameLength || parts.dwPasswordLength ||
      parts.dwUrlPathLength || parts.dwExtraInfoLength)
    throw std::runtime_error("A valid HTTPS origin is required");
}
std::wstring Http::absolute(const std::string &path) const {
  auto p = wide(path);
  if (p.find(L'\r') != std::wstring::npos || p.find(L'\n') != std::wstring::npos ||
      p.find(L'\\') != std::wstring::npos)
    throw HttpError(0, "Invalid resource address");
  if (!p.empty() && p.front() == L'/' && (p.size() < 2 || p[1] != L'/'))
    return origin_ + p;
  if (p.rfind(origin_ + L"/", 0) == 0)
    return p;
  throw HttpError(0, "External resource address is not allowed");
}
Json Http::json(const std::string &method, const std::string &path, const std::string &token,
                const Json &body) const {
  Call c(*this, method, path, token);
  std::string raw = body.is_null() ? "" : body.dump();
  c.send(raw.empty() ? L"" : L"Content-Type: application/json\r\n",
         raw.empty() ? nullptr : raw.data(), DWORD(raw.size()));
  c.receive();
  return parse(c);
}
std::vector<unsigned char> Http::bytes(const std::string &path, size_t maximum) const {
  Call c(*this, "GET", path, {});
  c.send(L"", nullptr, 0);
  c.receive();
  if (c.status != 200)
    throw HttpError(int(c.status), "Preview unavailable");
  return c.read(maximum);
}
Json Http::upload(const std::string &id, const std::string &kind, const std::filesystem::path &file,
                  const std::string &token, const std::function<void(uint64_t, uint64_t)> &progress,
                  const std::shared_ptr<std::atomic_bool> &cancel) const {
  auto checkpoint = [&] {
    if (cancel && cancel->load())
      throw TransferCancelled();
  };
  checkpoint();
  uint64_t size = std::filesystem::file_size(file);
  if (!size || size > 120ull * 1024 * 1024)
    throw HttpError(0, "File limit: 120 MiB");
  std::string ext = utf8(file.extension().wstring());
  std::transform(ext.begin(), ext.end(), ext.begin(),
                 [](unsigned char c) { return char(std::tolower(c)); });
  const bool image =
      ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".gif";
  if (image && size > 16ull * 1024 * 1024)
    throw HttpError(0, "Image limit: 16 MiB");
  const std::string boundary = "----mrrightNativeBoundary5f05e5f8",
                    name = utf8(file.filename().wstring());
  if (name.find_first_of("\r\n") != std::string::npos)
    throw HttpError(0, "Invalid filename");
  std::string first =
      "--" + boundary + "\r\nContent-Disposition: form-data; name=\"kind\"\r\n\r\n" + kind +
      "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"displayName\"\r\n\r\n" +
      name + "\r\n--" + boundary +
      "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"resource" + ext +
      "\"\r\nContent-Type: application/octet-stream\r\n\r\n";
  std::string last = "\r\n--" + boundary + "--\r\n";
  uint64_t total = first.size() + size + last.size();
  if (total > std::numeric_limits<DWORD>::max())
    throw HttpError(0, "File too large");
  Call c(*this, "POST", "/api/account/works/" + encoded(id) + "/assets?kind=" + encoded(kind),
         token);
  c.send(L"Content-Type: multipart/form-data; boundary=" + wide(boundary) + L"\r\n", nullptr, 0,
         DWORD(total));
  auto write = [&](const void *p, DWORD n) {
    checkpoint();
    DWORD done = 0;
    if (!WinHttpWriteData(c.request.h, p, n, &done) || done != n)
      throw HttpError(0, "Upload interrupted");
  };
  write(first.data(), DWORD(first.size()));
  std::ifstream in(file, std::ios::binary);
  if (!in)
    throw HttpError(0, "Could not read file");
  std::array<char, 65536> b;
  uint64_t sent = 0;
  while (in && sent < size) {
    in.read(b.data(), std::streamsize(std::min<uint64_t>(b.size(), size - sent)));
    auto n = DWORD(in.gcount());
    if (!n)
      throw HttpError(0, "File changed during upload");
    write(b.data(), n);
    sent += n;
    progress(sent, size);
  }
  checkpoint();
  write(last.data(), DWORD(last.size()));
  c.receive();
  return parse(c);
}
void Http::download(const std::string &path, const std::filesystem::path &destination,
                    const std::shared_ptr<std::atomic_bool> &cancel,
                    const std::function<void(uint64_t, uint64_t)> &progress) const {
  if (cancel && cancel->load())
    throw TransferCancelled();
  Call c(*this, "GET", path, {});
  c.send(L"", nullptr, 0);
  c.receive();
  if (c.status != 200)
    throw HttpError(int(c.status), "Download not available");
  wchar_t header[64]{};
  DWORD len = sizeof(header);
  uint64_t total = 0;
  if (WinHttpQueryHeaders(c.request.h, WINHTTP_QUERY_CONTENT_LENGTH, nullptr, header, &len,
                          nullptr))
    total = _wcstoui64(header, nullptr, 10);
  wchar_t tmp[MAX_PATH];
  auto dir = destination.parent_path().wstring();
  if (!GetTempFileNameW(dir.c_str(), L"MR", 0, tmp))
    throw HttpError(0, "Could not create download file");
  std::filesystem::path part = tmp;
  try {
    std::ofstream out(part, std::ios::binary | std::ios::trunc);
    if (!out)
      throw HttpError(0, "Could not write file");
    std::array<char, 65536> b;
    uint64_t done = 0, reported = 0;
    for (;;) {
      if (cancel && cancel->load())
        throw TransferCancelled();
      DWORD n = 0;
      if (!WinHttpReadData(c.request.h, b.data(), DWORD(b.size()), &n))
        throw HttpError(0, "Download interrupted");
      if (!n)
        break;
      done += n;
      if (done > 512ull * 1024 * 1024)
        throw HttpError(0, "Download exceeds supported limit");
      out.write(b.data(), n);
      if (!out)
        throw HttpError(0, "Could not write file");
      if (done - reported >= 1024 * 1024) {
        progress(done, total);
        reported = done;
      }
    }
    if (total && done != total)
      throw HttpError(0, "Incomplete download");
    out.flush();
    if (!out)
      throw HttpError(0, "Could not finish writing file");
    out.close();
    if (!out)
      throw HttpError(0, "Could not close completed file");
    if (cancel && cancel->load())
      throw TransferCancelled();
    if (!MoveFileExW(part.c_str(), destination.c_str(),
                     MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
      throw HttpError(0, "Could not save completed file");
    progress(done, done);
  } catch (...) {
    std::error_code ignored;
    std::filesystem::remove(part, ignored);
    throw;
  }
}
} // namespace mr
