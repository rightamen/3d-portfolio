#pragma once

#include "app/ui/qt/AuthService.hpp"

#include <QString>

namespace mrright::app::ui::qt {

class MockAuthService final : public AuthService {
 public:
  AuthServiceResult login(const QString& email, const QString& password) override;
  void logout() override;

  [[nodiscard]] bool isLoggedIn() const override;
  [[nodiscard]] QString currentUserLabel() const override;
  [[nodiscard]] QString lastMessage() const override;
  void clearMessage() override;

 private:
  [[nodiscard]] AuthServiceResult result(bool success) const;

  bool isLoggedIn_ = false;
  QString currentUserLabel_ = QStringLiteral("Not signed in");
  QString lastMessage_;
};

} // namespace mrright::app::ui::qt
