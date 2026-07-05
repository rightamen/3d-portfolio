#pragma once

#include "sdk/core/ApiClientConfig.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/network/HttpClient.hpp"

#include <string>
#include <utility>

namespace mrright::sdk::network {

// Replaceable real-backend placeholder. It owns endpoint-level transport
// configuration but intentionally performs no network I/O in this batch.
// Future implementations can use Qt Network or libcurl behind this same
// HttpClient interface without changing typed clients.
class RealHttpClient final : public HttpClient {
 public:
  explicit RealHttpClient(core::ApiClientConfig config = {})
    : config_(std::move(config)) {}

  core::ApiResult<HttpResponse> send(const HttpRequest& request) override {
    (void)request;
    return core::ApiResult<HttpResponse>::err({
      "REAL_HTTP_BACKEND_NOT_ENABLED",
      models::ApiErrorCode::Unknown,
      "Real HTTP transport is not implemented in this build. Use MockHttpClient for tests or add a Qt/libcurl backend later.",
      0
    });
  }

  [[nodiscard]] const core::ApiClientConfig& config() const { return config_; }

 private:
  core::ApiClientConfig config_;
};

} // namespace mrright::sdk::network
