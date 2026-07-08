#pragma once

#include <QObject>
#include <QString>

namespace mrright::app::ui::qt {

class AppController final : public QObject {
  Q_OBJECT
  Q_PROPERTY(QString appName READ appName CONSTANT)
  Q_PROPERTY(QString sdkVersion READ sdkVersion CONSTANT)
  Q_PROPERTY(QString apiPrefix READ apiPrefix CONSTANT)
  Q_PROPERTY(QString status READ status CONSTANT)

 public:
  explicit AppController(QObject* parent = nullptr);

  [[nodiscard]] QString appName() const;
  [[nodiscard]] QString sdkVersion() const;
  [[nodiscard]] QString apiPrefix() const;
  [[nodiscard]] QString status() const;
};

} // namespace mrright::app::ui::qt
