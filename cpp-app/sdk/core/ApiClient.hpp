#pragma once

#include "sdk/core/ApiClientConfig.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/network/HttpClient.hpp"

#include <map>
#include <memory>
#include <string>
#include <string_view>
#include <utility>

namespace mrright::sdk::core {

class ApiClient {
 public:
  explicit ApiClient(
    std::shared_ptr<network::HttpClient> httpClient,
    ApiClientConfig config = {}
  )
    : httpClient_(std::move(httpClient)),
      config_(std::move(config)) {}

  [[nodiscard]] const ApiClientConfig& config() const { return config_; }
  [[nodiscard]] const std::string& apiPrefix() const { return config_.apiPrefix; }

 protected:
  ApiResult<network::HttpResponse> sendJson(
    std::string method,
    std::string_view path,
    std::string body = {},
    std::map<std::string, std::string> headers = {}
  ) const {
    const auto pathResult = buildPath(path);
    if (pathResult.isError()) return ApiResult<network::HttpResponse>::err(*pathResult.error());

    headers.emplace("Accept", "application/json");
    headers.emplace("User-Agent", config_.userAgent);
    if (!body.empty() && (method == "POST" || method == "PUT" || method == "PATCH")) {
      headers.emplace("Content-Type", "application/json");
    }
    if (config_.bearerToken && !config_.bearerToken->empty()) {
      headers.emplace("Authorization", "Bearer " + *config_.bearerToken);
    }

    return httpClient().send({
      std::move(method),
      *pathResult.value(),
      std::move(headers),
      std::move(body),
    });
  }

  [[nodiscard]] ApiResult<std::string> buildPath(std::string_view path) const {
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
    if (config_.apiPrefix.empty() || config_.apiPrefix == "/api" || config_.apiPrefix.starts_with("/api/") == false) {
      return ApiResult<std::string>::err({
        "CLIENT_CONFIG_INVALID",
        models::ApiErrorCode::Unknown,
        "SDK apiPrefix must be /api/v1 or another explicit versioned /api/v* prefix.",
        0
      });
    }
    if (config_.apiPrefix != "/api/v1") {
      return ApiResult<std::string>::err({
        "CLIENT_CONFIG_INVALID",
        models::ApiErrorCode::Unknown,
        "This SDK build only supports the strict /api/v1 prefix.",
        0
      });
    }
    return ApiResult<std::string>::ok(config_.baseUrl + config_.apiPrefix + relativePath);
  }

  [[nodiscard]] network::HttpClient& httpClient() const { return *httpClient_; }

 private:
  std::shared_ptr<network::HttpClient> httpClient_;
  ApiClientConfig config_;
};

} // namespace mrright::sdk::core
