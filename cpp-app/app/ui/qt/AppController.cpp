#include "app/ui/qt/AppController.hpp"

#include "app/ui/qt/MockAuthService.hpp"
#include "sdk/core/ApiClientConfig.hpp"

#include <QString>

#include <memory>
#include <utility>

namespace mrright::app::ui::qt {

AppController::AppController(QObject* parent)
  : AppController(std::make_unique<MockAuthService>(), parent) {}

AppController::AppController(std::unique_ptr<AuthService> authService, QObject* parent)
  : QObject(parent),
    authService_(std::move(authService)) {
  if (!authService_) authService_ = std::make_unique<MockAuthService>();
}

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
  return isLoggedIn() ? QStringLiteral("Mock signed in, no network") : QStringLiteral("UI shell only, no network");
}

bool AppController::isLoggedIn() const {
  return authService_->isLoggedIn();
}

QString AppController::currentUserLabel() const {
  return authService_->currentUserLabel();
}

QString AppController::loginMessage() const {
  return authService_->lastMessage();
}

void AppController::mockLogin(const QString& email, const QString& password) {
  const AuthStateSnapshot previousState = authStateSnapshot();
  authService_->login(email, password);
  notifyAuthServiceChanges(previousState);
}

void AppController::logout() {
  const AuthStateSnapshot previousState = authStateSnapshot();
  authService_->logout();
  notifyAuthServiceChanges(previousState);
}

void AppController::clearMessage() {
  const AuthStateSnapshot previousState = authStateSnapshot();
  authService_->clearMessage();
  notifyAuthServiceChanges(previousState);
}

AppController::AuthStateSnapshot AppController::authStateSnapshot() const {
  return {isLoggedIn(), currentUserLabel(), loginMessage()};
}

void AppController::notifyAuthServiceChanges(const AuthStateSnapshot& previousState) {
  const bool loggedInChanged = previousState.isLoggedIn != isLoggedIn();
  const bool userLabelChanged = previousState.currentUserLabel != currentUserLabel();

  if (loggedInChanged) emit isLoggedInChanged();
  if (userLabelChanged) emit currentUserLabelChanged();
  if (loggedInChanged || userLabelChanged) emit authStateChanged();
  if (previousState.loginMessage != loginMessage()) emit loginMessageChanged();
}

} // namespace mrright::app::ui::qt
