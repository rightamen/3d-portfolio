#include "app/ui/qt/AppController.hpp"

#include <QCoreApplication>
#include <QMetaObject>
#include <QString>
#include <Qt>

#include <iostream>

namespace {

int fail(const char* message) {
  std::cerr << message << '\n';
  return 1;
}

bool containsCaseInsensitive(const QString& value, const QString& needle) {
  return value.contains(needle, Qt::CaseInsensitive);
}

int expectInitialState() {
  const mrright::app::ui::qt::AppController controller;

  if (controller.isLoggedIn()) return fail("initial state should not be logged in");
  if (controller.currentUserLabel() != QStringLiteral("Not signed in")) {
    return fail("initial user label should show signed-out state");
  }
  if (!containsCaseInsensitive(controller.status(), QStringLiteral("no network"))) {
    return fail("initial status should communicate no-network behavior");
  }
  if (!controller.loginMessage().isEmpty()) {
    return fail("initial login message should be empty");
  }
  if (controller.metaObject()->indexOfProperty("password") != -1) {
    return fail("password must not be exposed as an AppController property");
  }

  return 0;
}

int expectMockLoginSuccess() {
  mrright::app::ui::qt::AppController controller;
  const QString email = QStringLiteral("  visitor@example.test  ");
  const QString inputText = QStringLiteral("mock-only-input");

  controller.mockLogin(email, inputText);

  if (!controller.isLoggedIn()) return fail("mock login should mark controller as logged in");
  if (!controller.currentUserLabel().contains(QStringLiteral("visitor@example.test"))) {
    return fail("mock login should expose the trimmed email in the user label");
  }
  if (!containsCaseInsensitive(controller.loginMessage(), QStringLiteral("mock auth"))) {
    return fail("mock login success message should describe mock auth");
  }
  if (!containsCaseInsensitive(controller.loginMessage(), QStringLiteral("no network"))) {
    return fail("mock login success message should state no network request was sent");
  }
  if (!containsCaseInsensitive(controller.loginMessage(), QStringLiteral("no token"))) {
    return fail("mock login success message should state no token was persisted");
  }
  if (controller.currentUserLabel().contains(inputText) || controller.loginMessage().contains(inputText)) {
    return fail("mock input text must not be reflected in controller properties");
  }
  if (controller.metaObject()->indexOfProperty("password") != -1) {
    return fail("password must not be exposed after mock login");
  }

  return 0;
}

int expectMockLoginValidation() {
  {
    mrright::app::ui::qt::AppController controller;
    controller.mockLogin(QStringLiteral("   "), QStringLiteral("mock-only-input"));

    if (controller.isLoggedIn()) return fail("empty email should not log in");
    if (controller.currentUserLabel() != QStringLiteral("Not signed in")) {
      return fail("empty email should keep signed-out label");
    }
    if (!containsCaseInsensitive(controller.loginMessage(), QStringLiteral("email"))) {
      return fail("empty email should produce an email validation message");
    }
  }

  {
    mrright::app::ui::qt::AppController controller;
    controller.mockLogin(QStringLiteral("visitor@example.test"), QString());

    if (controller.isLoggedIn()) return fail("empty password should not log in");
    if (controller.currentUserLabel() != QStringLiteral("Not signed in")) {
      return fail("empty password should keep signed-out label");
    }
    if (!containsCaseInsensitive(controller.loginMessage(), QStringLiteral("password"))) {
      return fail("empty password should produce a password validation message");
    }
  }

  return 0;
}

int expectLogout() {
  mrright::app::ui::qt::AppController controller;
  controller.mockLogin(QStringLiteral("visitor@example.test"), QStringLiteral("mock-only-input"));
  controller.logout();

  if (controller.isLoggedIn()) return fail("logout should clear logged-in state");
  if (controller.currentUserLabel() != QStringLiteral("Not signed in")) {
    return fail("logout should restore signed-out label");
  }
  if (!containsCaseInsensitive(controller.status(), QStringLiteral("no network"))) {
    return fail("logout status should remain no-network");
  }
  if (!containsCaseInsensitive(controller.loginMessage(), QStringLiteral("signed out"))) {
    return fail("logout should set a signed-out message");
  }

  return 0;
}

int expectClearMessage() {
  mrright::app::ui::qt::AppController controller;
  controller.mockLogin(QStringLiteral("visitor@example.test"), QStringLiteral("mock-only-input"));

  if (!controller.isLoggedIn()) return fail("precondition failed: controller should be logged in");
  if (controller.loginMessage().isEmpty()) return fail("precondition failed: message should exist");

  controller.clearMessage();

  if (!controller.loginMessage().isEmpty()) return fail("clearMessage should clear loginMessage");
  if (!controller.isLoggedIn()) return fail("clearMessage should not affect logged-in state");
  if (!controller.currentUserLabel().contains(QStringLiteral("visitor@example.test"))) {
    return fail("clearMessage should not affect current user label");
  }

  return 0;
}

} // namespace

int main(int argc, char** argv) {
  QCoreApplication app(argc, argv);

  if (const int result = expectInitialState(); result != 0) return result;
  if (const int result = expectMockLoginSuccess(); result != 0) return result;
  if (const int result = expectMockLoginValidation(); result != 0) return result;
  if (const int result = expectLogout(); result != 0) return result;
  if (const int result = expectClearMessage(); result != 0) return result;

  return 0;
}
