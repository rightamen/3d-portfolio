#pragma once

#include "sdk/core/ApiClientConfig.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/network/HttpClient.hpp"

namespace mrright::sdk::network {

// Optional concrete HttpClient backed by libcurl.
// It is compiled only when MRRIGHT_ENABLE_CURL_HTTP=ON. It sends transport
// requests and returns raw HTTP responses; business JSON/envelope parsing stays
// in sdk/core.
class CurlHttpClient final : public HttpClient {
 public:
  explicit CurlHttpClient(core::ApiClientConfig config = {});

  core::ApiResult<HttpResponse> send(const HttpRequest& request) override;

  [[nodiscard]] const core::ApiClientConfig& config() const { return config_; }

 private:
  core::ApiClientConfig config_;
};

} // namespace mrright::sdk::network
