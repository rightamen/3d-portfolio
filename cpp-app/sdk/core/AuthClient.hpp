#pragma once

#include "sdk/core/ApiClient.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/models/Profile.hpp"
#include "sdk/models/User.hpp"

#include <string>

namespace mrright::sdk::core {

struct LoginRequest {
  std::string email;
  std::string password;
};

struct LoginResponse {
  models::User user;
  std::string token;
  std::string expiresAt;
};

class AuthClient : public ApiClient {
 public:
  using ApiClient::ApiClient;

  ApiResult<LoginResponse> login(const LoginRequest& request) {
    (void)request;
    return notImplemented<LoginResponse>();
  }

  ApiResult<void> logout(const std::string& visitorToken) {
    (void)visitorToken;
    return ApiResult<void>::err(notImplementedError());
  }

  ApiResult<models::User> me(const std::string& visitorToken) {
    (void)visitorToken;
    return notImplemented<models::User>();
  }

 private:
  static models::ApiError notImplementedError() {
    return {"CLIENT_NOT_IMPLEMENTED", models::ApiErrorCode::Unknown, "AuthClient is an interface stub.", 0};
  }

  template <typename T>
  static ApiResult<T> notImplemented() {
    return ApiResult<T>::err(notImplementedError());
  }
};

} // namespace mrright::sdk::core
