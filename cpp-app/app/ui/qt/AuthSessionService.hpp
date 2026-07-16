#pragma once

#include "app/ui/qt/AuthService.hpp"
#include "sdk/core/ApiClientConfig.hpp"
#include "sdk/core/AuthSession.hpp"
#include "sdk/core/TokenStore.hpp"
#include "sdk/network/HttpClient.hpp"

#include <QString>

#include <memory>

namespace mrright::app::ui::qt {

class AuthSessionService final : public AuthService {
 public:
  AuthSessionService(
    std::shared_ptr<sdk::network::HttpClient> httpClient,
    std::unique_ptr<sdk::core::TokenStore> tokenStore,
    sdk::core::ApiClientConfig config = {}
  );

  AuthServiceResult login(const QString& email, const QString& password) override;
  void logout() override;

  [[nodiscard]] bool isLoggedIn() const override;
  [[nodiscard]] QString currentUserLabel() const override;
  [[nodiscard]] QString lastMessage() const override;
  void clearMessage() override;

 private:
  [[nodiscard]] AuthServiceResult result(bool success) const;

  std::shared_ptr<sdk::network::HttpClient> httpClient_;
  std::unique_ptr<sdk::core::TokenStore> tokenStore_;
  std::unique_ptr<sdk::core::AuthSession> authSession_;
  QString currentUserLabel_;
  QString lastMessage_;
};

} // namespace mrright::app::ui::qt
