#pragma once

#include "sdk/core/TokenStore.hpp"

#include <optional>
#include <string>

namespace mrright::sdk::core {

struct ApiClientConfig {
  // Empty by default: tests and embedders can use relative paths. Real HTTP
  // backends should set this to values such as "http://localhost:3000".
  std::string baseUrl;
  std::string apiPrefix = "/api/v1";
  int timeoutMs = 30000;
  std::string userAgent = "mrright-cpp-sdk/0.1";
  std::optional<std::string> bearerToken;
};

inline ApiClientConfig withTokenStoreBearerToken(ApiClientConfig config, TokenStore& tokenStore) {
  const auto token = tokenStore.loadVisitorToken();
  if (token && !token->empty()) {
    config.bearerToken = *token;
  } else {
    config.bearerToken.reset();
  }
  return config;
}

} // namespace mrright::sdk::core
