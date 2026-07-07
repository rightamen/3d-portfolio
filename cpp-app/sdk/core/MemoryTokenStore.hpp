#pragma once

#include "sdk/core/TokenStore.hpp"

#include <optional>
#include <string>
#include <utility>

namespace mrright::sdk::core {

// Test/dev-session implementation only. This class never persists tokens,
// reads environment variables, logs token values, or attempts platform secure
// storage. Production clients must use a platform credential backend.
class MemoryTokenStore final : public TokenStore {
 public:
  std::optional<std::string> loadVisitorToken() override {
    return visitorToken_;
  }

  void saveVisitorToken(const std::string& token) override {
    visitorToken_ = token;
  }

  void clearVisitorToken() override {
    visitorToken_.reset();
  }

  [[nodiscard]] bool hasVisitorToken() const {
    return visitorToken_.has_value();
  }

 private:
  std::optional<std::string> visitorToken_;
};

} // namespace mrright::sdk::core
