#include "app/ui/qt/AppController.hpp"

#include "sdk/core/ApiClientConfig.hpp"

#include <QString>

namespace mrright::app::ui::qt {
namespace {

QString normalizedEmail(const QString& email) {
  return email.trimmed();
}

} // namespace

AppController::AppController(QObject* parent)
  : QObject(parent) {}

QString AppController::appName() const {
  return QStringLiteral("mrright.blog");
}

QString AppController::sdkVersion() const {
  return QStringLiteral("0.1.0");
}

QString AppController::apiPrefix() const {
  const mrright::sdk::core::ApiClientConfig config;
  return QString::fromStdString(config.apiPrefix);
}

QString AppController::status() const {
  return isLoggedIn_ ? QStringLiteral("Mock signed in, no network") : QStringLiteral("UI shell only, no network");
}

bool AppController::isLoggedIn() const {
  return isLoggedIn_;
}

QString AppController::currentUserLabel() const {
  return currentUserLabel_;
}

QString AppController::loginMessage() const {
  return loginMessage_;
}

void AppController::mockLogin(const QString& email, const QString& password) {
  const QString trimmedEmail = normalizedEmail(email);
  if (trimmedEmail.isEmpty()) {
    loginMessage_ = QStringLiteral("Enter an email address for mock sign-in.");
    emit loginMessageChanged();
    return;
  }
  if (password.isEmpty()) {
    loginMessage_ = QStringLiteral("Enter any password text for the mock flow.");
    emit loginMessageChanged();
    return;
  }

  isLoggedIn_ = true;
  currentUserLabel_ = QStringLiteral("Signed in as %1").arg(trimmedEmail);
  loginMessage_ = QStringLiteral("Mock auth only. No network request was sent and no token was persisted.");
  emit authStateChanged();
  emit loginMessageChanged();
}

void AppController::logout() {
  isLoggedIn_ = false;
  currentUserLabel_ = QStringLiteral("Not signed in");
  loginMessage_ = QStringLiteral("Signed out of the mock UI session.");
  emit authStateChanged();
  emit loginMessageChanged();
}

void AppController::clearMessage() {
  if (loginMessage_.isEmpty()) return;
  loginMessage_.clear();
  emit loginMessageChanged();
}

} // namespace mrright::app::ui::qt
