#pragma once

#include <filesystem>

namespace mrright::app::platform {

class AppPaths {
 public:
  [[nodiscard]] std::filesystem::path configDir() const;
  [[nodiscard]] std::filesystem::path cacheDir() const;
  [[nodiscard]] std::filesystem::path dataDir() const;
  [[nodiscard]] std::filesystem::path logDir() const;
  [[nodiscard]] std::filesystem::path downloadDir() const;
  [[nodiscard]] std::filesystem::path tempDir() const;
};

} // namespace mrright::app::platform
