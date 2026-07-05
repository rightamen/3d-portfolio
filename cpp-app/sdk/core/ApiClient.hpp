#pragma once

#include "sdk/network/HttpClient.hpp"

#include <memory>
#include <string>
#include <string_view>
#include <utility>

namespace mrright::sdk::core {

struct ApiClientOptions {
  // Relative by default so callers provide their own host, e.g.
  // https://example.test + /api/v1. No production domain is hard-coded.
  std::string basePath = "/api/v1";
};

class ApiClient {
 public:
  explicit ApiClient(
    std::shared_ptr<network::HttpClient> httpClient,
    ApiClientOptions options = {}
  )
    : httpClient_(std::move(httpClient)),
      options_(std::move(options)) {}

  [[nodiscard]] const std::string& basePath() const { return options_.basePath; }

 protected:
  [[nodiscard]] std::string v1Path(std::string_view path) const {
    if (path.empty() || path.front() != '/') {
      return options_.basePath + "/" + std::string(path);
    }
    return options_.basePath + std::string(path);
  }

  [[nodiscard]] network::HttpClient& httpClient() const { return *httpClient_; }

 private:
  std::shared_ptr<network::HttpClient> httpClient_;
  ApiClientOptions options_;
};

} // namespace mrright::sdk::core
