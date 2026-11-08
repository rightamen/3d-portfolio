#pragma once
#include <atomic>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <memory>
#include <nlohmann/json.hpp>
#include <stdexcept>
#include <string>
#include <vector>
#include <windows.h>
namespace mr {
using Json = nlohmann::json;
std::string utf8(const std::wstring &);
std::wstring wide(const std::string &);
std::string encoded(const std::string &);
std::string text(const Json &, const char *, std::string fallback = {});
std::string localized(const Json &, const char *, int language);
class HttpError : public std::runtime_error {
public:
  int status;
  HttpError(int s, const std::string &m) : runtime_error(m), status(s) {}
};
class Http {
  std::wstring origin_;

public:
  explicit Http(std::wstring origin = L"https://mrright.blog");
  const std::wstring &origin() const {
    return origin_;
  }
  std::wstring absolute(const std::string &) const;
  std::vector<unsigned char> bytes(const std::string &, size_t maximum = 16 * 1024 * 1024) const;
  Json json(const std::string &method, const std::string &path, const std::string &token = {},
            const Json &body = nullptr) const;
  Json upload(const std::string &id, const std::string &kind, const std::filesystem::path &,
              const std::string &token,
              const std::function<void(uint64_t, uint64_t)> &progress) const;
  void download(const std::string &path, const std::filesystem::path &destination,
                const std::shared_ptr<std::atomic_bool> &cancel,
                const std::function<void(uint64_t, uint64_t)> &progress) const;
};
} // namespace mr
