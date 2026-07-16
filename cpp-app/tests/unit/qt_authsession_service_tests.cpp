#include "app/ui/qt/AuthSessionService.hpp"
#include "app/ui/qt/AuthService.hpp"
#include "sdk/core/ApiClientConfig.hpp"
#include "sdk/core/MemoryTokenStore.hpp"
#include "sdk/network/HttpClient.hpp"

#include <QCoreApplication>
#include <QString>

#include <cstddef>
#include <iostream>
#include <memory>
#include <string>
#include <utility>

namespace {

using mrright::app::ui::qt::AuthSessionService;
using mrright::app::ui::qt::AuthService;
using mrright::app::ui::qt::AuthServiceResult;
using mrright::sdk::core::ApiClientConfig;
using mrright::sdk::core::MemoryTokenStore;
using mrright::sdk::network::HttpRequest;
using mrright::sdk::network::MockHttpClient;

constexpr auto kFixtureToken = "qt-adapter-session-fixture";

int fail(const char* message) {
  std::cerr << message << '\n';
  return 1;
}

std::string loginEnvelope(
  const std::string& displayName = "Adapter User",
  const std::string& email = "adapter@example.test"
) {
  return std::string(R"json({
    "data": {
      "session": {"token": ")json") + kFixtureToken + R"json(", "expiresAt": "2026-12-31T00:00:00Z"},
      "user": {
        "id": "user-adapter",
        "email": ")json" + email + R"json(",
        "displayName": ")json" + displayName + R"json(",
        "handle": "adapter-user",
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

std::string logoutEnvelope() {
  return R"json({"data":{},"pagination":{},"error":null})json";
}

std::string strictErrorEnvelope(const std::string& message) {
  return std::string(R"json({"data":null,"pagination":{},"error":{"code":"VALIDATION_ERROR","message":")json") +
    message + R"json("}})json";
}

struct ServiceFixture {
  std::shared_ptr<MockHttpClient> httpClient = std::make_shared<MockHttpClient>();
  MemoryTokenStore* tokenStore = nullptr;
  std::unique_ptr<AuthSessionService> service;

  explicit ServiceFixture(bool withExistingSession = false) {
    auto store = std::make_unique<MemoryTokenStore>();
    tokenStore = store.get();
    if (withExistingSession) store->saveVisitorToken(kFixtureToken);
    service = std::make_unique<AuthSessionService>(httpClient, std::move(store), ApiClientConfig{});
  }
};

bool requestContainsAdminPath(const HttpRequest& request) {
  return request.path.find("/admin") != std::string::npos;
}

bool resultContainsFixtureToken(const AuthServiceResult& result) {
  const QString token = QString::fromLatin1(kFixtureToken);
  return result.userLabel.contains(token) || result.message.contains(token);
}

int expectInitialState() {
  ServiceFixture fixture;

  if (fixture.service->isLoggedIn()) return fail("adapter should initially be signed out");
  if (fixture.service->currentUserLabel() != QStringLiteral("Not signed in")) {
    return fail("adapter should initially expose the signed-out label");
  }
  if (!fixture.service->lastMessage().isEmpty()) return fail("adapter should initially have no message");
  if (!fixture.httpClient->requests().empty()) return fail("adapter construction should not send a request");

  return 0;
}

int expectLoginSuccess() {
  auto httpClient = std::make_shared<MockHttpClient>();
  httpClient->enqueue({200, {}, loginEnvelope()});
  auto store = std::make_unique<MemoryTokenStore>();
  MemoryTokenStore* tokenStore = store.get();
  ApiClientConfig config;
  config.bearerToken = "stale-config-bearer-fixture";
  AuthSessionService service(httpClient, std::move(store), std::move(config));

  const AuthServiceResult result = service.login(
    QStringLiteral("  adapter@example.test  "),
    QStringLiteral("fixture-password")
  );
  const auto request = httpClient->lastRequest();

  if (!result.success || !service.isLoggedIn()) return fail("strict login success should create a session");
  if (!tokenStore->hasVisitorToken()) return fail("strict login success should save a visitor token");
  if (tokenStore->loadVisitorToken().value_or("") != kFixtureToken) {
    return fail("strict login success should save the response token in MemoryTokenStore");
  }
  if (result.userLabel != QStringLiteral("Signed in as Adapter User")) {
    return fail("login should use the returned non-sensitive display name");
  }
  if (result.message != QStringLiteral("Signed in successfully.")) {
    return fail("login should expose a stable success message");
  }
  if (!request.has_value()) return fail("login should send one mock request");
  if (request->method != "POST" || request->path != "/api/v1/auth/login") {
    return fail("login should use POST on the strict v1 auth path");
  }
  if (request->path.find("/api/auth/login") != std::string::npos || requestContainsAdminPath(*request)) {
    return fail("login must not use legacy or admin paths");
  }
  if (request->headers.contains("Authorization")) {
    return fail("login must not send a stored Authorization header");
  }
  if (request->body != R"json({"email":"adapter@example.test","password":"fixture-password"})json") {
    return fail("login body should contain only the submitted auth fields");
  }
  if (request->path.find(kFixtureToken) != std::string::npos ||
      request->body.find(kFixtureToken) != std::string::npos ||
      resultContainsFixtureToken(result)) {
    return fail("login response token must not enter URL, request body, or UI state");
  }

  return 0;
}

int expectLoginFailurePreservesExistingSession() {
  ServiceFixture fixture(true);
  fixture.httpClient->enqueue({401, {}, strictErrorEnvelope("New credentials were rejected.")});

  const AuthServiceResult result = fixture.service->login(
    QStringLiteral("other@example.test"),
    QStringLiteral("wrong-fixture-password")
  );

  if (result.success) return fail("failed replacement login should report failure");
  if (!fixture.service->isLoggedIn() || !fixture.tokenStore->hasVisitorToken()) {
    return fail("failed replacement login should preserve the existing AuthSession token");
  }
  if (fixture.service->currentUserLabel() != QStringLiteral("Signed in")) {
    return fail("failed replacement login should preserve the generic existing-session label");
  }
  if (result.message != QStringLiteral("New credentials were rejected.")) {
    return fail("failed replacement login should still expose the SDK error message");
  }
  if (resultContainsFixtureToken(result)) {
    return fail("failed replacement login must not expose the existing token in UI state");
  }

  return 0;
}

int expectLoginStrictError() {
  ServiceFixture fixture;
  fixture.httpClient->enqueue({400, {}, strictErrorEnvelope("Email or password is invalid.")});

  const AuthServiceResult result = fixture.service->login(
    QStringLiteral("adapter@example.test"),
    QStringLiteral("wrong-fixture-password")
  );

  if (result.success || fixture.service->isLoggedIn()) return fail("strict login error must not create a session");
  if (fixture.tokenStore->hasVisitorToken()) return fail("strict login error must not save a token");
  if (result.message != QStringLiteral("Email or password is invalid.")) {
    return fail("strict login error should map the SDK ApiError message");
  }
  if (result.message.contains(QStringLiteral("VALIDATION_ERROR")) || resultContainsFixtureToken(result)) {
    return fail("strict login error should not expose raw code or token data");
  }

  return 0;
}

int expectInvalidResponsesAreSafe() {
  {
    ServiceFixture fixture;
    fixture.httpClient->enqueue({200, {}, R"json({"not":"valid")json"});
    const AuthServiceResult result = fixture.service->login(
      QStringLiteral("adapter@example.test"),
      QStringLiteral("fixture-password")
    );

    if (result.success || fixture.service->isLoggedIn() || fixture.tokenStore->hasVisitorToken()) {
      return fail("invalid JSON must not create a session");
    }
    if (result.message.isEmpty() || result.message.contains(QStringLiteral("{\"not\""))) {
      return fail("invalid JSON should map to a safe message without raw response data");
    }
  }

  {
    ServiceFixture fixture;
    fixture.httpClient->enqueue({200, {}, R"json({"data":{}})json"});
    const AuthServiceResult result = fixture.service->login(
      QStringLiteral("adapter@example.test"),
      QStringLiteral("fixture-password")
    );

    if (result.success || fixture.service->isLoggedIn() || fixture.tokenStore->hasVisitorToken()) {
      return fail("non-envelope response must not create a session");
    }
    if (result.message.isEmpty() || result.message.contains(QStringLiteral("{\"data\""))) {
      return fail("contract error should map to a safe message without raw response data");
    }
  }

  {
    ServiceFixture fixture;
    std::string response = loginEnvelope();
    const std::size_t tokenStart = response.find(kFixtureToken);
    response.erase(tokenStart, std::string(kFixtureToken).size());
    fixture.httpClient->enqueue({200, {}, std::move(response)});
    const AuthServiceResult result = fixture.service->login(
      QStringLiteral("adapter@example.test"),
      QStringLiteral("fixture-password")
    );

    if (result.success || fixture.service->isLoggedIn()) {
      return fail("strict success without a usable token must not report a session");
    }
    if (result.message != QStringLiteral("Authentication response did not create a session.")) {
      return fail("strict success without a usable token should map to a safe adapter error");
    }
  }

  {
    ServiceFixture fixture;
    const AuthServiceResult result = fixture.service->login(
      QStringLiteral("adapter@example.test"),
      QStringLiteral("fixture-password")
    );

    if (result.success || result.message.isEmpty() || fixture.service->isLoggedIn()) {
      return fail("transport abstraction error should remain a visible safe failure");
    }
  }

  return 0;
}

int expectExistingSessionUsesSafeFallback() {
  ServiceFixture fixture(true);

  if (!fixture.service->isLoggedIn()) return fail("stored visitor token should restore session state");
  if (fixture.service->currentUserLabel() != QStringLiteral("Signed in")) {
    return fail("restored session without profile data should use the generic signed-in label");
  }
  if (!fixture.service->lastMessage().isEmpty()) return fail("restored session should not invent a message");
  if (fixture.service->currentUserLabel().contains(QString::fromLatin1(kFixtureToken))) {
    return fail("restored session label must not expose stored token content");
  }
  if (!fixture.httpClient->requests().empty()) return fail("restoring session state should not send a request");

  return 0;
}

int expectLogoutSuccess() {
  ServiceFixture fixture;
  fixture.httpClient->enqueue({200, {}, loginEnvelope()});
  fixture.service->login(QStringLiteral("adapter@example.test"), QStringLiteral("fixture-password"));
  fixture.httpClient->enqueue({200, {}, logoutEnvelope()});

  fixture.service->logout();

  if (fixture.service->isLoggedIn() || fixture.tokenStore->hasVisitorToken()) {
    return fail("successful logout should clear adapter and TokenStore session state");
  }
  if (fixture.service->currentUserLabel() != QStringLiteral("Not signed in") ||
      fixture.service->lastMessage() != QStringLiteral("Signed out successfully.")) {
    return fail("successful logout should restore signed-out UI state");
  }
  if (fixture.httpClient->requests().size() != 2) return fail("login and logout should send two mock requests");

  const HttpRequest& request = fixture.httpClient->requests().back();
  const auto authorization = request.headers.find("Authorization");
  if (request.method != "POST" || request.path != "/api/v1/auth/logout") {
    return fail("logout should use POST on the strict v1 auth path");
  }
  if (authorization == request.headers.end() || authorization->second != std::string("Bearer ") + kFixtureToken) {
    return fail("logout should place the stored token only in the Authorization header");
  }
  if (request.path.find(kFixtureToken) != std::string::npos ||
      request.body.find(kFixtureToken) != std::string::npos ||
      requestContainsAdminPath(request)) {
    return fail("logout must not place token in URL/body or use an admin path");
  }

  return 0;
}

int expectLogoutStrictErrorStillClearsSession() {
  ServiceFixture fixture(true);
  fixture.httpClient->enqueue({401, {}, strictErrorEnvelope("Session is no longer valid.")});

  fixture.service->logout();

  if (fixture.service->isLoggedIn() || fixture.tokenStore->hasVisitorToken()) {
    return fail("logout strict error should still clear session per AuthSession contract");
  }
  if (fixture.service->currentUserLabel() != QStringLiteral("Not signed in")) {
    return fail("logout strict error should still restore the signed-out label");
  }
  if (fixture.service->lastMessage() != QStringLiteral("Session is no longer valid.")) {
    return fail("logout strict error should map the SDK ApiError message");
  }
  if (fixture.service->lastMessage().contains(QString::fromLatin1(kFixtureToken))) {
    return fail("logout strict error message must not expose token content");
  }

  return 0;
}

int expectClearMessagePreservesSession() {
  ServiceFixture fixture;
  fixture.httpClient->enqueue({200, {}, loginEnvelope()});
  fixture.service->login(QStringLiteral("adapter@example.test"), QStringLiteral("fixture-password"));
  const QString label = fixture.service->currentUserLabel();

  fixture.service->clearMessage();

  if (!fixture.service->lastMessage().isEmpty()) return fail("clearMessage should clear only the UI message");
  if (!fixture.service->isLoggedIn() || !fixture.tokenStore->hasVisitorToken()) {
    return fail("clearMessage should preserve AuthSession and TokenStore state");
  }
  if (fixture.service->currentUserLabel() != label) return fail("clearMessage should preserve user label");

  return 0;
}

int expectAuthServicePolymorphism() {
  auto httpClient = std::make_shared<MockHttpClient>();
  httpClient->enqueue({200, {}, loginEnvelope()});
  std::unique_ptr<AuthService> service = std::make_unique<AuthSessionService>(
    httpClient,
    std::make_unique<MemoryTokenStore>(),
    ApiClientConfig{}
  );

  const AuthServiceResult result = service->login(
    QStringLiteral("adapter@example.test"),
    QStringLiteral("fixture-password")
  );
  if (!result.success || !service->isLoggedIn()) {
    return fail("AuthSessionService should be usable through AuthService polymorphism");
  }

  return 0;
}

} // namespace

int main(int argc, char** argv) {
  QCoreApplication app(argc, argv);

  if (const int result = expectInitialState(); result != 0) return result;
  if (const int result = expectLoginSuccess(); result != 0) return result;
  if (const int result = expectLoginStrictError(); result != 0) return result;
  if (const int result = expectLoginFailurePreservesExistingSession(); result != 0) return result;
  if (const int result = expectInvalidResponsesAreSafe(); result != 0) return result;
  if (const int result = expectExistingSessionUsesSafeFallback(); result != 0) return result;
  if (const int result = expectLogoutSuccess(); result != 0) return result;
  if (const int result = expectLogoutStrictErrorStillClearsSession(); result != 0) return result;
  if (const int result = expectClearMessagePreservesSession(); result != 0) return result;
  if (const int result = expectAuthServicePolymorphism(); result != 0) return result;

  return 0;
}
