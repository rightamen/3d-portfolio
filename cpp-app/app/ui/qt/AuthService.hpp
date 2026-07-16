#pragma once

#include <QString>

namespace mrright::app::ui::qt {

struct AuthServiceResult {
  bool success = false;
  QString userLabel;
  QString message;
};

class AuthService {
 public:
  virtual ~AuthService() = default;

  virtual AuthServiceResult login(const QString& email, const QString& password) = 0;
  virtual void logout() = 0;

  [[nodiscard]] virtual bool isLoggedIn() const = 0;
  [[nodiscard]] virtual QString currentUserLabel() const = 0;
  [[nodiscard]] virtual QString lastMessage() const = 0;
  virtual void clearMessage() = 0;
};

} // namespace mrright::app::ui::qt
