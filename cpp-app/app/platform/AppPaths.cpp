#include "app/platform/AppPaths.hpp"

#include <cstdlib>
#include <string>

namespace mrright::app::platform {
namespace {

constexpr const char* appId = "mrright-app";

std::filesystem::path envPath(const char* name) {
  if (const char* value = std::getenv(name); value != nullptr && std::string(value).size() > 0) {
    return std::filesystem::path(value);
  }
  return {};
}

std::filesystem::path homeDir() {
#if defined(_WIN32)
  auto profile = envPath("USERPROFILE");
  if (!profile.empty()) return profile;
  auto drive = envPath("HOMEDRIVE");
  auto path = envPath("HOMEPATH");
  if (!drive.empty() && !path.empty()) return drive / path.relative_path();
#else
  auto home = envPath("HOME");
  if (!home.empty()) return home;
#endif
  return std::filesystem::current_path();
}

std::filesystem::path appDataRoot() {
#if defined(_WIN32)
  auto appData = envPath("APPDATA");
  return appData.empty() ? homeDir() / "AppData" / "Roaming" : appData;
#elif defined(__APPLE__)
  return homeDir() / "Library" / "Application Support";
#else
  auto xdgConfig = envPath("XDG_CONFIG_HOME");
  return xdgConfig.empty() ? homeDir() / ".config" : xdgConfig;
#endif
}

std::filesystem::path localDataRoot() {
#if defined(_WIN32)
  auto localAppData = envPath("LOCALAPPDATA");
  return localAppData.empty() ? homeDir() / "AppData" / "Local" : localAppData;
#elif defined(__APPLE__)
  return homeDir() / "Library" / "Application Support";
#else
  auto xdgData = envPath("XDG_DATA_HOME");
  return xdgData.empty() ? homeDir() / ".local" / "share" : xdgData;
#endif
}

std::filesystem::path cacheRoot() {
#if defined(_WIN32)
  return localDataRoot();
#elif defined(__APPLE__)
  return homeDir() / "Library" / "Caches";
#else
  auto xdgCache = envPath("XDG_CACHE_HOME");
  return xdgCache.empty() ? homeDir() / ".cache" : xdgCache;
#endif
}

std::filesystem::path stateRoot() {
#if defined(_WIN32)
  return localDataRoot();
#elif defined(__APPLE__)
  return homeDir() / "Library" / "Logs";
#else
  auto xdgState = envPath("XDG_STATE_HOME");
  return xdgState.empty() ? homeDir() / ".local" / "state" : xdgState;
#endif
}

} // namespace

std::filesystem::path AppPaths::configDir() const {
  return appDataRoot() / appId;
}

std::filesystem::path AppPaths::cacheDir() const {
  return cacheRoot() / appId / "cache";
}

std::filesystem::path AppPaths::dataDir() const {
  return localDataRoot() / appId / "data";
}

std::filesystem::path AppPaths::logDir() const {
#if defined(__APPLE__)
  return stateRoot() / appId;
#else
  return stateRoot() / appId / "logs";
#endif
}

std::filesystem::path AppPaths::downloadDir() const {
  // TODO: replace with Qt StandardPaths or native APIs:
  // Known Folders on Windows, security-scoped bookmark handling on macOS,
  // and xdg-user-dir DOWNLOAD on Linux.
  return homeDir() / "Downloads";
}

std::filesystem::path AppPaths::tempDir() const {
  // Keep temp files under cache so future .part -> final renames can stay on
  // the same filesystem volume.
  return cacheDir() / "tmp";
}

} // namespace mrright::app::platform
