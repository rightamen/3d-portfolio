#pragma once

#include "sdk/core/ApiClientConfig.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/core/AuthClient.hpp"
#include "sdk/core/TokenStore.hpp"
#include "sdk/network/HttpClient.hpp"

#include <memory>
#include <optional>
#include <string>
#include <utility>

namespace mrright::sdk::core {

// Lightweight auth-session orchestration for tests/dev sessions and future
// secure TokenStore backends. It performs no network I/O itself; AuthClient and
// the injected HttpClient abstraction remain responsible for requests.
class AuthSession {
 public:
  AuthSession(
    std::shared_ptr<network::HttpClient> httpClient,
    TokenStore& tokenStore,
    ApiClientConfig config = {}
  )
    : httpClient_(std::move(httpClient)),
      tokenStore_(tokenStore),
      config_(std::move(config)) {}

  ApiResult<LoginResponse> loginAndStoreToken(const std::string& email, const std::string& password) {
    AuthClient auth(httpClient_, config_);
    auto login = auth.login({email, password});
    if (login.isError()) return login;

    tokenStore_.saveVisitorToken(login.value()->token);
    return login;
  }

  [[nodiscard]] std::optional<std::string> loadToken() {
    return tokenStore_.loadVisitorToken();
  }

  [[nodiscard]] bool hasSession() {
    const auto token = tokenStore_.loadVisitorToken();
    return token.has_value() && !token->empty();
  }

  void clearSession() {
    tokenStore_.clearVisitorToken();
  }

  ApiResult<void> logoutAndClearSession() {
    const auto token = tokenStore_.loadVisitorToken();
    if (!token || token->empty()) {
      tokenStore_.clearVisitorToken();
      return ApiResult<void>::ok();
    }

    AuthClient auth(httpClient_, configWithStoredToken());
    auto logout = auth.logout();
    tokenStore_.clearVisitorToken();
    return logout;
  }

  [[nodiscard]] ApiClientConfig configWithStoredToken() {
    return withTokenStoreBearerToken(config_, tokenStore_);
  }

 private:
  std::shared_ptr<network::HttpClient> httpClient_;
  TokenStore& tokenStore_;
  ApiClientConfig config_;
};

} // namespace mrright::sdk::core
