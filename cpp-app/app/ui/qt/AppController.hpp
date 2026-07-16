#pragma once

#include "app/ui/qt/AuthService.hpp"

#include <QObject>
#include <QString>

#include <memory>

namespace mrright::app::ui::qt {

class AppController final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QString appName READ appName CONSTANT)
  Q_PROPERTY(QString sdkVersion READ sdkVersion CONSTANT)
  Q_PROPERTY(QString apiPrefix READ apiPrefix CONSTANT)
  Q_PROPERTY(QString status READ status NOTIFY authStateChanged)
  Q_PROPERTY(bool isLoggedIn READ isLoggedIn NOTIFY isLoggedInChanged)
  Q_PROPERTY(QString currentUserLabel READ currentUserLabel NOTIFY currentUserLabelChanged)
  Q_PROPERTY(QString loginMessage READ loginMessage NOTIFY loginMessageChanged)

 public:
  explicit AppController(QObject* parent = nullptr);
  explicit AppController(std::unique_ptr<AuthService> authService, QObject* parent = nullptr);

  [[nodiscard]] QString appName() const;
  [[nodiscard]] QString sdkVersion() const;
  [[nodiscard]] QString apiPrefix() const;
  [[nodiscard]] QString status() const;
  [[nodiscard]] bool isLoggedIn() const;
  [[nodiscard]] QString currentUserLabel() const;
  [[nodiscard]] QString loginMessage() const;

  Q_INVOKABLE void mockLogin(const QString& email, const QString& password);
  Q_INVOKABLE void logout();
  Q_INVOKABLE void clearMessage();

 signals:
  void authStateChanged();
  void isLoggedInChanged();
  void currentUserLabelChanged();
  void loginMessageChanged();

 private:
  struct AuthStateSnapshot {
    bool isLoggedIn;
    QString currentUserLabel;
    QString loginMessage;
  };

  [[nodiscard]] AuthStateSnapshot authStateSnapshot() const;
  void notifyAuthServiceChanges(const AuthStateSnapshot& previousState);

  std::unique_ptr<AuthService> authService_;
};

} // namespace mrright::app::ui::qt
