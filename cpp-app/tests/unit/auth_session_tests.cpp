#include "sdk/core/AuthSession.hpp"
#include "sdk/core/MemoryTokenStore.hpp"
#include "sdk/core/ProjectClient.hpp"
#include "sdk/network/HttpClient.hpp"

#include <iostream>
#include <memory>
#include <string>

namespace {

using mrright::sdk::core::ApiClientConfig;
using mrright::sdk::core::AuthSession;
using mrright::sdk::core::MemoryTokenStore;
using mrright::sdk::core::ProjectClient;
using mrright::sdk::models::ApiErrorCode;
using mrright::sdk::network::MockHttpClient;

int failures = 0;

void expect(bool condition, const std::string& message) {
  if (condition) return;
  ++failures;
  std::cerr << "FAIL: " << message << '\n';
}

std::string loginEnvelope(std::string token) {
  return std::string(R"json({
    "data": {
      "session": {"token": ")json") + token + R"json(", "expiresAt": "2026-12-31T00:00:00Z"},
      "user": {
        "id": "user-1",
        "email": "visitor@example.test",
        "displayName": "Visitor",
        "handle": "visitor",
        "emailVerified": true,
        "profilePublic": true,
        "activityPublic": true,
        "profileAdminDisabled": false,
        "createdAt": "2026-01-01T00:00:00Z"
      }
    },
    "pagination": {},
    "error": null
  })json";
}

std::string projectEnvelope() {
  return R"json({
    "data": {
      "projects": [
        {
          "slug": "asset-one",
          "title": "Asset One",
          "summary": "Summary",
          "workflow": "Workflow",
          "image": "/uploads/one.jpg",
          "modelUrl": "/uploads/one.glb",
          "format": "GLB",
          "modelSize": "1 MB",
          "downloadPolicy": "Authorization required",
          "assetCategory": "generic",
          "viewerFeatures": ["orbit"],
          "stack": ["Blender"],
          "year": "2026",
          "isPublic": true
        }
      ]
    },
    "pagination": {},
    "error": null
  })json";
}

void testLoginStoresToken() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, loginEnvelope("stored-session-token")});
  MemoryTokenStore store;
  AuthSession session(mock, store);

  const auto result = session.loginAndStoreToken("visitor@example.test", "password");

  expect(result.isOk(), "loginAndStoreToken returns login response");
  expect(session.hasSession(), "loginAndStoreToken creates session");
  expect(store.loadVisitorToken().value_or("") == "stored-session-token", "loginAndStoreToken saves visitor token");
}

void testLoginFailureDoesNotStoreToken() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({401, {}, R"json({"data":null,"pagination":{},"error":{"code":"AUTH_REQUIRED","message":"Authentication required"}})json"});
  MemoryTokenStore store;
  AuthSession session(mock, store);

  const auto result = session.loginAndStoreToken("visitor@example.test", "wrong-password");

  expect(result.isError(), "loginAndStoreToken returns error on strict error envelope");
  expect(result.error()->knownCode == ApiErrorCode::AuthRequired, "login failure maps strict envelope error");
  expect(!session.hasSession(), "login failure does not create session");
  expect(!store.loadVisitorToken().has_value(), "login failure does not save token");
}

void testStoredTokenInjectsAuthorizationHeader() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, projectEnvelope()});
  MemoryTokenStore store;
  store.saveVisitorToken("stored-session-token");

  AuthSession session(mock, store);
  ProjectClient projects(mock, session.configWithStoredToken());
  const auto result = projects.listProjects();
  const auto request = mock->lastRequest();

  expect(result.isOk(), "typed client succeeds with stored token config");
  expect(request.has_value(), "typed client sends request");
  expect(request->headers.at("Authorization") == "Bearer stored-session-token", "stored token is injected as Authorization header");
  expect(request->path.find("stored-session-token") == std::string::npos, "stored token is not placed in URL");
  expect(request->body.find("stored-session-token") == std::string::npos, "stored token is not placed in request body");
  expect(request->path == "/api/v1/projects", "authenticated request remains on /api/v1 public SDK path");
}

void testClearSessionRemovesToken() {
  auto mock = std::make_shared<MockHttpClient>();
  MemoryTokenStore store;
  store.saveVisitorToken("stored-session-token");
  AuthSession session(mock, store);

  session.clearSession();

  expect(!session.hasSession(), "clearSession clears session");
  expect(!store.loadVisitorToken().has_value(), "clearSession clears TokenStore");
}

void testLogoutSuccessClearsToken() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, R"json({"data":{},"pagination":{},"error":null})json"});
  MemoryTokenStore store;
  store.saveVisitorToken("stored-session-token");
  AuthSession session(mock, store);

  const auto result = session.logoutAndClearSession();
  const auto request = mock->lastRequest();

  expect(result.isOk(), "logoutAndClearSession returns ok on success envelope");
  expect(!session.hasSession(), "logoutAndClearSession clears session on success");
  expect(request.has_value(), "logout sends request when token exists");
  expect(request->path == "/api/v1/auth/logout", "logout uses strict /api/v1 path");
  expect(request->headers.at("Authorization") == "Bearer stored-session-token", "logout sends stored token in Authorization header");
  expect(request->path.find("stored-session-token") == std::string::npos, "logout token is not placed in URL");
  expect(request->body.find("stored-session-token") == std::string::npos, "logout token is not placed in body");
}

void testLogoutErrorStillClearsToken() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({401, {}, R"json({"data":null,"pagination":{},"error":{"code":"AUTH_REQUIRED","message":"Authentication required"}})json"});
  MemoryTokenStore store;
  store.saveVisitorToken("stored-session-token");
  AuthSession session(mock, store);

  const auto result = session.logoutAndClearSession();

  expect(result.isError(), "logoutAndClearSession returns strict envelope error");
  expect(result.error()->knownCode == ApiErrorCode::AuthRequired, "logout error maps strict envelope error");
  expect(!session.hasSession(), "logoutAndClearSession clears token even on error");
}

} // namespace

int main() {
  testLoginStoresToken();
  testLoginFailureDoesNotStoreToken();
  testStoredTokenInjectsAuthorizationHeader();
  testClearSessionRemovesToken();
  testLogoutSuccessClearsToken();
  testLogoutErrorStillClearsToken();

  if (failures != 0) {
    std::cerr << failures << " auth session test(s) failed.\n";
    return 1;
  }

  std::cout << "Auth session tests passed.\n";
  return 0;
}
