#pragma once

#include "sdk/core/ApiResult.hpp"

#include <map>
#include <string>

namespace mrright::sdk::network {

struct HttpRequest {
  std::string method;
  std::string path;
  std::map<std::string, std::string> headers;
  std::string body;
};

struct HttpResponse {
  int status = 0;
  std::map<std::string, std::string> headers;
  std::string body;
};

class HttpClient {
 public:
  virtual ~HttpClient() = default;
  virtual core::ApiResult<HttpResponse> send(const HttpRequest& request) = 0;
};

class NullHttpClient final : public HttpClient {
 public:
  core::ApiResult<HttpResponse> send(const HttpRequest& request) override {
    (void)request;
    return core::ApiResult<HttpResponse>::err({
      "NETWORK_NOT_IMPLEMENTED",
      models::ApiErrorCode::Unknown,
      "HTTP backend is not implemented in the C++ skeleton.",
      0
    });
  }
};

} // namespace mrright::sdk::network
