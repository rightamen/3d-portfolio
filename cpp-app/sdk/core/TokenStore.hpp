#pragma once

#include <optional>
#include <string>

namespace mrright::sdk::core {

// Interface only. Platform implementations must use secure storage:
// Windows Credential Manager, macOS Keychain, Linux Secret Service, or an
// explicitly marked encrypted-file fallback. Writing visitor tokens in plain
// config files is forbidden.
class TokenStore {
 public:
  virtual ~TokenStore() = default;
  virtual std::optional<std::string> loadVisitorToken() = 0;
  virtual void saveVisitorToken(const std::string& token) = 0;
  virtual void clearVisitorToken() = 0;
};

} // namespace mrright::sdk::core
