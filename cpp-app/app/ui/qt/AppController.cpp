#include "app/ui/qt/AppController.hpp"

#include "sdk/core/ApiClientConfig.hpp"

namespace mrright::app::ui::qt {

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
  return QStringLiteral("UI shell only, no network");
}

} // namespace mrright::app::ui::qt
