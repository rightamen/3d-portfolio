#include "app/ui/qt/AppController.hpp"

#include <QCoreApplication>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <Qt>

#include <QObject>

int main(int argc, char* argv[]) {
  QGuiApplication app(argc, argv);
  QCoreApplication::setApplicationName(QStringLiteral("mrright.blog"));
  QCoreApplication::setApplicationVersion(QStringLiteral("0.1.0"));

  mrright::app::ui::qt::AppController controller;
  QQmlApplicationEngine engine;
  engine.rootContext()->setContextProperty(QStringLiteral("appController"), &controller);

  QObject::connect(
    &engine,
    &QQmlApplicationEngine::objectCreationFailed,
    &app,
    []() { QCoreApplication::exit(-1); },
    Qt::QueuedConnection
  );
  engine.loadFromModule("Mrright.QtShell", "Main");

  return app.exec();
}
