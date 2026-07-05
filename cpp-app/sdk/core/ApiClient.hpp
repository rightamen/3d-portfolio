#pragma once

#include "sdk/core/ApiResult.hpp"
#include "sdk/network/HttpClient.hpp"

#include <map>
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
  ApiResult<network::HttpResponse> sendJson(
    std::string method,
    std::string_view path,
    std::string body = {},
    std::map<std::string, std::string> headers = {}
  ) const {
    const auto pathResult = v1Path(path);
    if (pathResult.isError()) return ApiResult<network::HttpResponse>::err(*pathResult.error());

    if (!body.empty()) headers.emplace("Content-Type", "application/json");

    return httpClient().send({
      std::move(method),
      *pathResult.value(),
      std::move(headers),
      std::move(body),
    });
  }

  [[nodiscard]] ApiResult<std::string> v1Path(std::string_view path) const {
    if (path.empty() || path.front() != '/') {
      path = std::string_view{};
    }
    const std::string relativePath(path);
    if (relativePath.starts_with("/admin") || relativePath.starts_with("/api/")) {
      return ApiResult<std::string>::err({
        "CLIENT_PATH_FORBIDDEN",
        models::ApiErrorCode::Unknown,
        "SDK clients may only construct public /api/v1 paths.",
        0
      });
    }
    if (relativePath.empty()) {
      return ApiResult<std::string>::err({
        "CLIENT_PATH_INVALID",
        models::ApiErrorCode::Unknown,
        "SDK path must be an absolute v1-relative path such as /projects.",
        0
      });
    }
    return ApiResult<std::string>::ok(options_.basePath + relativePath);
  }

  [[nodiscard]] network::HttpClient& httpClient() const { return *httpClient_; }

 private:
  std::shared_ptr<network::HttpClient> httpClient_;
  ApiClientOptions options_;
};

} // namespace mrright::sdk::core
