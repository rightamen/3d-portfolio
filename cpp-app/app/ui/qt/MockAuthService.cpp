#include "app/ui/qt/MockAuthService.hpp"

#include <QString>

namespace mrright::app::ui::qt {

AuthServiceResult MockAuthService::login(const QString& email, const QString& password) {
  const QString trimmedEmail = email.trimmed();
  if (trimmedEmail.isEmpty()) {
    lastMessage_ = QStringLiteral("Enter an email address for mock sign-in.");
    return result(false);
  }
  if (password.isEmpty()) {
    lastMessage_ = QStringLiteral("Enter any password text for the mock flow.");
    return result(false);
  }

  isLoggedIn_ = true;
  currentUserLabel_ = QStringLiteral("Signed in as %1").arg(trimmedEmail);
  lastMessage_ = QStringLiteral("Mock authentication only. No network request was sent and no token was persisted.");
  return result(true);
}

void MockAuthService::logout() {
  isLoggedIn_ = false;
  currentUserLabel_ = QStringLiteral("Not signed in");
  lastMessage_ = QStringLiteral("Signed out of the mock UI session.");
}

bool MockAuthService::isLoggedIn() const {
  return isLoggedIn_;
}

QString MockAuthService::currentUserLabel() const {
  return currentUserLabel_;
}

QString MockAuthService::lastMessage() const {
  return lastMessage_;
}

void MockAuthService::clearMessage() {
  lastMessage_.clear();
}

AuthServiceResult MockAuthService::result(bool success) const {
  return {success, currentUserLabel_, lastMessage_};
}

} // namespace mrright::app::ui::qt
