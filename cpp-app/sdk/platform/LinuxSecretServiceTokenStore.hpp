#pragma once

#if defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)

#include "sdk/core/TokenStore.hpp"

#include <glib.h>

#include <optional>
#include <stdexcept>
#include <string>

namespace mrright::sdk::platform {

class LinuxSecretServiceError final : public std::runtime_error {
 public:
  LinuxSecretServiceError(const char* operation, std::string message, GQuark domain, int code);

  [[nodiscard]] GQuark domain() const;
  [[nodiscard]] int code() const;

 private:
  GQuark domain_;
  int code_;
};

class LinuxSecretServiceTokenStore final : public core::TokenStore {
 public:
  LinuxSecretServiceTokenStore();
  explicit LinuxSecretServiceTokenStore(std::string account);

  std::optional<std::string> loadVisitorToken() override;
  void saveVisitorToken(const std::string& token) override;
  void clearVisitorToken() override;

  [[nodiscard]] bool hasVisitorToken();

 private:
  std::string account_;
};

} // namespace mrright::sdk::platform

#endif // defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
