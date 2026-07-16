#include "app/ui/qt/AuthSessionService.hpp"

#include "sdk/core/ApiResult.hpp"
#include "sdk/core/AuthClient.hpp"
#include "sdk/models/ApiError.hpp"
#include "sdk/models/User.hpp"

#include <QByteArray>
#include <QString>

#include <cstddef>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>

namespace mrright::app::ui::qt {
namespace {

QString signedOutLabel() {
  return QStringLiteral("Not signed in");
}

QString existingSessionLabel() {
  return QStringLiteral("Signed in");
}

QString errorMessage(const sdk::models::ApiError& error) {
  if (error.message.empty()) return QStringLiteral("Authentication failed.");
  return QString::fromUtf8(error.message.data(), static_cast<qsizetype>(error.message.size()));
}

QString userLabel(const sdk::models::User& user, const QString& fallbackEmail) {
  if (!user.displayName.empty()) {
    return QStringLiteral("Signed in as %1").arg(QString::fromStdString(user.displayName));
  }
  if (!user.handle.empty()) {
    return QStringLiteral("Signed in as @%1").arg(QString::fromStdString(user.handle));
  }
  if (!user.email.empty()) {
    return QStringLiteral("Signed in as %1").arg(QString::fromStdString(user.email));
  }
  if (!fallbackEmail.isEmpty()) {
    return QStringLiteral("Signed in as %1").arg(fallbackEmail);
  }
  return existingSessionLabel();
}

} // namespace

AuthSessionService::AuthSessionService(
  std::shared_ptr<sdk::network::HttpClient> httpClient,
  std::unique_ptr<sdk::core::TokenStore> tokenStore,
  sdk::core::ApiClientConfig config
)
  : httpClient_(std::move(httpClient)),
    tokenStore_(std::move(tokenStore)) {
  if (!httpClient_) throw std::invalid_argument("AuthSessionService requires an HttpClient.");
  if (!tokenStore_) throw std::invalid_argument("AuthSessionService requires a TokenStore.");

  config.bearerToken.reset();
  authSession_ = std::make_unique<sdk::core::AuthSession>(httpClient_, *tokenStore_, std::move(config));
  currentUserLabel_ = isLoggedIn() ? existingSessionLabel() : signedOutLabel();
}

AuthServiceResult AuthSessionService::login(const QString& email, const QString& password) {
  const QString trimmedEmail = email.trimmed();
  const QByteArray emailUtf8 = trimmedEmail.toUtf8();
  const QByteArray passwordUtf8 = password.toUtf8();
  const auto login = authSession_->loginAndStoreToken(
    std::string(emailUtf8.constData(), static_cast<std::size_t>(emailUtf8.size())),
    std::string(passwordUtf8.constData(), static_cast<std::size_t>(passwordUtf8.size()))
  );

  if (login.isError()) {
    lastMessage_ = errorMessage(*login.error());
    if (!isLoggedIn()) currentUserLabel_ = signedOutLabel();
    return result(false);
  }
  if (!isLoggedIn()) {
    currentUserLabel_ = signedOutLabel();
    lastMessage_ = QStringLiteral("Authentication response did not create a session.");
    return result(false);
  }

  currentUserLabel_ = userLabel(login.value()->user, trimmedEmail);
  lastMessage_ = QStringLiteral("Signed in successfully.");
  return result(true);
}

void AuthSessionService::logout() {
  const auto logoutResult = authSession_->logoutAndClearSession();
  currentUserLabel_ = signedOutLabel();
  lastMessage_ = logoutResult.isError()
    ? errorMessage(*logoutResult.error())
    : QStringLiteral("Signed out successfully.");
}

bool AuthSessionService::isLoggedIn() const {
  return authSession_ && authSession_->hasSession();
}

QString AuthSessionService::currentUserLabel() const {
  return currentUserLabel_;
}

QString AuthSessionService::lastMessage() const {
  return lastMessage_;
}

void AuthSessionService::clearMessage() {
  lastMessage_.clear();
}

AuthServiceResult AuthSessionService::result(bool success) const {
  return {success, currentUserLabel_, lastMessage_};
}

} // namespace mrright::app::ui::qt
