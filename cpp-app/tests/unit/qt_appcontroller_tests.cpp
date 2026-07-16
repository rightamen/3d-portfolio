#include "app/ui/qt/AppController.hpp"
#include "app/ui/qt/AuthSessionService.hpp"
#include "app/ui/qt/AuthService.hpp"
#include "app/ui/qt/MockAuthService.hpp"
#include "sdk/core/MemoryTokenStore.hpp"
#include "sdk/network/HttpClient.hpp"

#include <QCoreApplication>
#include <QMetaObject>
#include <QString>
#include <Qt>

#include <iostream>
#include <memory>
#include <utility>

namespace {

using mrright::app::ui::qt::AppController;
using mrright::app::ui::qt::AuthSessionService;
using mrright::app::ui::qt::AuthService;
using mrright::app::ui::qt::AuthServiceResult;
using mrright::app::ui::qt::MockAuthService;
using mrright::sdk::core::MemoryTokenStore;
using mrright::sdk::network::MockHttpClient;

int fail(const char* message) {
  std::cerr << message << '\n';
  return 1;
}

bool containsCaseInsensitive(const QString& value, const QString& needle) {
  return value.contains(needle, Qt::CaseInsensitive);
}

class FakeAuthService final : public AuthService {
 public:
  AuthServiceResult login(const QString& email, const QString& password) override {
    ++loginCalls;
    lastEmail = email;
    sawNonEmptyPassword = !password.isEmpty();
    isLoggedIn_ = nextLoginResult.success;
    currentUserLabel_ = nextLoginResult.userLabel;
    lastMessage_ = nextLoginResult.message;
    return nextLoginResult;
  }

  void logout() override {
    ++logoutCalls;
    isLoggedIn_ = false;
    currentUserLabel_ = QStringLiteral("Fake signed out");
    lastMessage_ = QStringLiteral("Fake logout complete");
  }

  [[nodiscard]] bool isLoggedIn() const override {
    return isLoggedIn_;
  }

  [[nodiscard]] QString currentUserLabel() const override {
    return currentUserLabel_;
  }

  [[nodiscard]] QString lastMessage() const override {
    return lastMessage_;
  }

  void clearMessage() override {
    ++clearMessageCalls;
    lastMessage_.clear();
  }

  AuthServiceResult nextLoginResult;
  int loginCalls = 0;
  int logoutCalls = 0;
  int clearMessageCalls = 0;
  QString lastEmail;
  bool sawNonEmptyPassword = false;

 private:
  bool isLoggedIn_ = false;
  QString currentUserLabel_ = QStringLiteral("Fake initial user");
  QString lastMessage_;
};

int expectMockAuthServiceInitialState() {
  const MockAuthService service;

  if (service.isLoggedIn()) return fail("MockAuthService should initially be signed out");
  if (service.currentUserLabel() != QStringLiteral("Not signed in")) {
    return fail("MockAuthService should initially use the signed-out label");
  }
  if (!service.lastMessage().isEmpty()) return fail("MockAuthService should initially have no message");

  return 0;
}

int expectMockAuthServiceLoginSuccess() {
  MockAuthService service;
  const AuthServiceResult result = service.login(
    QStringLiteral("  visitor@example.test  "),
    QStringLiteral("mock-only-input")
  );

  if (!result.success || !service.isLoggedIn()) return fail("MockAuthService login should succeed");
  if (result.userLabel != QStringLiteral("Signed in as visitor@example.test")) {
    return fail("MockAuthService should trim email whitespace in its user label");
  }
  if (service.currentUserLabel() != result.userLabel || service.lastMessage() != result.message) {
    return fail("MockAuthService result should match its readable state");
  }
  if (!containsCaseInsensitive(result.message, QStringLiteral("mock authentication"))) {
    return fail("MockAuthService success message should describe mock authentication");
  }
  if (!containsCaseInsensitive(result.message, QStringLiteral("no network"))) {
    return fail("MockAuthService success message should state no network request was sent");
  }
  if (!containsCaseInsensitive(result.message, QStringLiteral("no token"))) {
    return fail("MockAuthService success message should state no token was persisted");
  }
  if (result.userLabel.contains(QStringLiteral("mock-only-input")) ||
      result.message.contains(QStringLiteral("mock-only-input"))) {
    return fail("MockAuthService must not reflect password input in readable state");
  }

  return 0;
}

int expectMockAuthServiceValidation() {
  {
    MockAuthService service;
    const AuthServiceResult result = service.login(
      QStringLiteral("   "),
      QStringLiteral("mock-only-input")
    );

    if (result.success || service.isLoggedIn()) return fail("empty email should not log in");
    if (service.currentUserLabel() != QStringLiteral("Not signed in")) {
      return fail("empty email should preserve the signed-out label");
    }
    if (!containsCaseInsensitive(result.message, QStringLiteral("email"))) {
      return fail("empty email should produce an email validation message");
    }
  }

  {
    MockAuthService service;
    const AuthServiceResult result = service.login(QStringLiteral("visitor@example.test"), QString());

    if (result.success || service.isLoggedIn()) return fail("empty password should not log in");
    if (service.currentUserLabel() != QStringLiteral("Not signed in")) {
      return fail("empty password should preserve the signed-out label");
    }
    if (!containsCaseInsensitive(result.message, QStringLiteral("password"))) {
      return fail("empty password should produce a password validation message");
    }
  }

  return 0;
}

int expectMockAuthServiceLogoutAndClearMessage() {
  MockAuthService service;
  service.login(QStringLiteral("visitor@example.test"), QStringLiteral("mock-only-input"));
  service.clearMessage();

  if (!service.lastMessage().isEmpty()) return fail("clearMessage should clear the service message");
  if (!service.isLoggedIn()) return fail("clearMessage should preserve the service login state");
  if (!service.currentUserLabel().contains(QStringLiteral("visitor@example.test"))) {
    return fail("clearMessage should preserve the service user label");
  }

  service.logout();
  if (service.isLoggedIn()) return fail("logout should clear the service login state");
  if (service.currentUserLabel() != QStringLiteral("Not signed in")) {
    return fail("logout should restore the service signed-out label");
  }
  if (!containsCaseInsensitive(service.lastMessage(), QStringLiteral("signed out"))) {
    return fail("logout should set a signed-out service message");
  }

  return 0;
}

int expectDefaultControllerUsesMockAuthService() {
  AppController controller;

  if (controller.isLoggedIn()) return fail("default controller should initially be signed out");
  if (controller.currentUserLabel() != QStringLiteral("Not signed in")) {
    return fail("default controller should expose MockAuthService initial state");
  }
  if (!controller.loginMessage().isEmpty()) return fail("default controller should initially have no message");

  controller.mockLogin(QStringLiteral("  visitor@example.test  "), QStringLiteral("mock-only-input"));
  if (!controller.isLoggedIn()) return fail("default controller mock login should succeed");
  if (controller.currentUserLabel() != QStringLiteral("Signed in as visitor@example.test")) {
    return fail("default controller should expose the mock service user label");
  }
  if (!containsCaseInsensitive(controller.loginMessage(), QStringLiteral("mock authentication"))) {
    return fail("default controller should expose the mock service success message");
  }
  if (!containsCaseInsensitive(controller.status(), QStringLiteral("no network"))) {
    return fail("default controller status should communicate no-network behavior");
  }

  return 0;
}

int expectInjectedControllerDelegates() {
  auto fake = std::make_unique<FakeAuthService>();
  FakeAuthService* fakeObserver = fake.get();
  fakeObserver->nextLoginResult = {
    true,
    QStringLiteral("Injected user"),
    QStringLiteral("Injected login succeeded")
  };
  AppController controller(std::move(fake));

  controller.mockLogin(QStringLiteral("injected@example.test"), QStringLiteral("do-not-record-this"));
  if (fakeObserver->loginCalls != 1) return fail("controller should delegate login to injected service");
  if (fakeObserver->lastEmail != QStringLiteral("injected@example.test")) {
    return fail("controller should pass email to injected service");
  }
  if (!fakeObserver->sawNonEmptyPassword) return fail("controller should pass password to injected service");
  if (!controller.isLoggedIn() || controller.currentUserLabel() != QStringLiteral("Injected user")) {
    return fail("controller should expose injected service login state");
  }
  if (controller.loginMessage() != QStringLiteral("Injected login succeeded")) {
    return fail("controller should expose injected service login message");
  }

  controller.logout();
  if (fakeObserver->logoutCalls != 1 || controller.isLoggedIn()) {
    return fail("controller should delegate logout to injected service");
  }
  if (controller.currentUserLabel() != QStringLiteral("Fake signed out")) {
    return fail("controller should expose injected service logout state");
  }

  controller.clearMessage();
  if (fakeObserver->clearMessageCalls != 1 || !controller.loginMessage().isEmpty()) {
    return fail("controller should delegate clearMessage to injected service");
  }

  return 0;
}

int expectInjectedFailureAndNotifySignals() {
  auto fake = std::make_unique<FakeAuthService>();
  FakeAuthService* fakeObserver = fake.get();
  fakeObserver->nextLoginResult = {
    false,
    QStringLiteral("Fake initial user"),
    QStringLiteral("Injected validation failed")
  };
  AppController controller(std::move(fake));

  int authStateSignals = 0;
  int loggedInSignals = 0;
  int userLabelSignals = 0;
  int messageSignals = 0;
  QObject::connect(&controller, &AppController::authStateChanged, [&authStateSignals]() { ++authStateSignals; });
  QObject::connect(&controller, &AppController::isLoggedInChanged, [&loggedInSignals]() { ++loggedInSignals; });
  QObject::connect(
    &controller,
    &AppController::currentUserLabelChanged,
    [&userLabelSignals]() { ++userLabelSignals; }
  );
  QObject::connect(&controller, &AppController::loginMessageChanged, [&messageSignals]() { ++messageSignals; });

  controller.mockLogin(QStringLiteral("invalid@example.test"), QStringLiteral("mock-only-input"));
  if (fakeObserver->loginCalls != 1 || controller.isLoggedIn()) {
    return fail("injected service failure should remain signed out");
  }
  if (controller.loginMessage() != QStringLiteral("Injected validation failed")) {
    return fail("controller should expose injected service failure message");
  }
  if (authStateSignals != 0 || loggedInSignals != 0 || userLabelSignals != 0 || messageSignals != 1) {
    return fail("failed login should notify only the changed message property");
  }

  controller.mockLogin(QStringLiteral("invalid@example.test"), QStringLiteral("mock-only-input"));
  if (messageSignals != 1) return fail("unchanged service state should not emit duplicate notify signals");

  fakeObserver->nextLoginResult = {
    true,
    QStringLiteral("Injected user"),
    QStringLiteral("Injected login succeeded")
  };
  controller.mockLogin(QStringLiteral("valid@example.test"), QStringLiteral("mock-only-input"));
  if (authStateSignals != 1 || loggedInSignals != 1 || userLabelSignals != 1 || messageSignals != 2) {
    return fail("successful login should notify each changed auth property once");
  }

  controller.clearMessage();
  controller.clearMessage();
  if (messageSignals != 3) return fail("clearMessage should notify only when the message changes");
  if (authStateSignals != 1 || loggedInSignals != 1 || userLabelSignals != 1) {
    return fail("clearMessage should not notify unchanged auth state properties");
  }

  controller.logout();
  if (fakeObserver->logoutCalls != 1) return fail("controller should delegate logout after injected login");
  if (authStateSignals != 2 || loggedInSignals != 2 || userLabelSignals != 2 || messageSignals != 4) {
    return fail("logout should notify each changed auth property once");
  }

  return 0;
}

int expectSensitivePropertiesAreNotExposed() {
  const AppController controller;
  if (controller.metaObject()->indexOfProperty("password") != -1) {
    return fail("password must not be exposed as an AppController property");
  }
  if (controller.metaObject()->indexOfProperty("token") != -1) {
    return fail("token must not be exposed as an AppController property");
  }
  if (controller.metaObject()->indexOfProperty("visitorToken") != -1) {
    return fail("visitorToken must not be exposed as an AppController property");
  }

  return 0;
}

int expectAuthSessionServiceInjection() {
  auto httpClient = std::make_shared<MockHttpClient>();
  httpClient->enqueue({200, {}, R"json({
    "data": {
      "session": {"token": "controller-adapter-fixture", "expiresAt": "2026-12-31T00:00:00Z"},
      "user": {"id": "controller-user", "email": "controller@example.test", "displayName": "Controller User"}
    },
    "pagination": {},
    "error": null
  })json"});
  auto service = std::make_unique<AuthSessionService>(
    httpClient,
    std::make_unique<MemoryTokenStore>()
  );
  AppController controller(std::move(service));

  controller.mockLogin(
    QStringLiteral("controller@example.test"),
    QStringLiteral("fixture-password")
  );

  if (!controller.isLoggedIn()) return fail("controller should accept an injected AuthSessionService");
  if (controller.currentUserLabel() != QStringLiteral("Signed in as Controller User")) {
    return fail("controller should expose injected AuthSessionService state through AuthService");
  }
  if (httpClient->requests().size() != 1 || httpClient->requests().front().path != "/api/v1/auth/login") {
    return fail("injected AuthSessionService should use only the mock strict-v1 request");
  }
  if (controller.metaObject()->indexOfProperty("authSessionService") != -1) {
    return fail("AuthSessionService-specific types must not be exposed to QML");
  }

  return 0;
}

} // namespace

int main(int argc, char** argv) {
  QCoreApplication app(argc, argv);

  if (const int result = expectMockAuthServiceInitialState(); result != 0) return result;
  if (const int result = expectMockAuthServiceLoginSuccess(); result != 0) return result;
  if (const int result = expectMockAuthServiceValidation(); result != 0) return result;
  if (const int result = expectMockAuthServiceLogoutAndClearMessage(); result != 0) return result;
  if (const int result = expectDefaultControllerUsesMockAuthService(); result != 0) return result;
  if (const int result = expectInjectedControllerDelegates(); result != 0) return result;
  if (const int result = expectInjectedFailureAndNotifySignals(); result != 0) return result;
  if (const int result = expectSensitivePropertiesAreNotExposed(); result != 0) return result;
  if (const int result = expectAuthSessionServiceInjection(); result != 0) return result;

  return 0;
}
