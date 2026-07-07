#pragma once

#ifdef __APPLE__

#include "sdk/core/TokenStore.hpp"

#include <Security/Security.h>

#include <optional>
#include <stdexcept>
#include <string>

namespace mrright::sdk::platform {

class MacOSKeychainError final : public std::runtime_error {
 public:
  MacOSKeychainError(const char* operation, OSStatus status);

  [[nodiscard]] OSStatus status() const;

 private:
  OSStatus status_;
};

class MacOSKeychainTokenStore final : public core::TokenStore {
 public:
  MacOSKeychainTokenStore();
  MacOSKeychainTokenStore(std::string service, std::string account);

  std::optional<std::string> loadVisitorToken() override;
  void saveVisitorToken(const std::string& token) override;
  void clearVisitorToken() override;

  [[nodiscard]] bool hasVisitorToken();

 private:
  std::string service_;
  std::string account_;
};

} // namespace mrright::sdk::platform

#endif // __APPLE__
