#pragma once

#include "sdk/core/ApiClient.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/core/EnvelopeParser.hpp"
#include "sdk/core/JsonValue.hpp"
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
    const auto body = std::string("{\"email\":\"") + escapeJsonString(request.email) +
      "\",\"password\":\"" + escapeJsonString(request.password) + "\"}";
    auto response = sendJson("POST", "/auth/login", body);
    if (response.isError()) return ApiResult<LoginResponse>::err(*response.error());

    return parseResponseEnvelope<LoginResponse>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue& data, const models::Pagination&) {
        const auto* session = data.get("session");
        const auto* user = data.get("user");
        if (!session || !session->isObject() || !user || !user->isObject()) {
          return ApiResult<LoginResponse>::err(contractError("Login data must contain session and user."));
        }

        LoginResponse login;
        login.token = jsonString(*session, "token").value_or("");
        login.expiresAt = jsonString(*session, "expiresAt").value_or("");
        login.user = decodeUser(*user);
        return ApiResult<LoginResponse>::ok(std::move(login));
      }
    );
  }

  ApiResult<void> logout(const std::string& visitorToken) {
    auto response = sendJson("POST", "/auth/logout", "{}", bearerHeaders(visitorToken));
    if (response.isError()) return ApiResult<void>::err(*response.error());

    return parseResponseEnvelope<void>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue&, const models::Pagination&) {
        return ApiResult<void>::ok();
      }
    );
  }

  ApiResult<models::User> me(const std::string& visitorToken) {
    auto response = sendJson("GET", "/auth/me", {}, bearerHeaders(visitorToken));
    if (response.isError()) return ApiResult<models::User>::err(*response.error());

    return parseResponseEnvelope<models::User>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue& data, const models::Pagination&) {
        const auto* user = data.get("user");
        if (!user || user->isNull()) {
          return ApiResult<models::User>::ok(models::User{});
        }
        if (!user->isObject()) {
          return ApiResult<models::User>::err(contractError("Auth me data.user must be an object or null."));
        }
        return ApiResult<models::User>::ok(decodeUser(*user));
      }
    );
  }

 private:
  static std::map<std::string, std::string> bearerHeaders(const std::string& visitorToken) {
    if (visitorToken.empty()) return {};
    return {{"Authorization", "Bearer " + visitorToken}};
  }

  static models::User decodeUser(const JsonValue& value) {
    models::User user;
    user.id = jsonString(value, "id").value_or("");
    user.email = jsonString(value, "email").value_or("");
    user.displayName = jsonString(value, "displayName").value_or("");
    user.handle = jsonString(value, "handle").value_or("");
    user.avatarUrl = jsonString(value, "avatarUrl").value_or("");
    user.bannerUrl = jsonString(value, "bannerUrl").value_or("");
    user.bio = jsonString(value, "bio").value_or("");
    user.location = jsonString(value, "location").value_or("");
    user.website = jsonString(value, "website").value_or("");
    user.emailVerified = jsonBool(value, "emailVerified").value_or(false);
    user.profilePublic = jsonBool(value, "profilePublic").value_or(false);
    user.activityPublic = jsonBool(value, "activityPublic").value_or(false);
    user.profileAdminDisabled = jsonBool(value, "profileAdminDisabled").value_or(false);
    user.createdAt = jsonString(value, "createdAt").value_or("");
    return user;
  }
};

} // namespace mrright::sdk::core
