#pragma once

#include "sdk/core/TokenStore.hpp"

#include <optional>
#include <string>

namespace mrright::sdk::platform {

class WindowsCredentialTokenStore final : public core::TokenStore {
 public:
  WindowsCredentialTokenStore();
  explicit WindowsCredentialTokenStore(std::wstring credentialTargetName);

  std::optional<std::string> loadVisitorToken() override;
  void saveVisitorToken(const std::string& token) override;
  void clearVisitorToken() override;

  [[nodiscard]] bool hasVisitorToken();

 private:
  std::wstring credentialTargetName_;
};

} // namespace mrright::sdk::platform
