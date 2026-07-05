#pragma once

#include "sdk/core/ApiResult.hpp"

#include <deque>
#include <map>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace mrright::sdk::network {

struct HttpRequest {
  std::string method;
  std::string path;
  std::map<std::string, std::string> headers;
  std::string body;
};

struct HttpResponse {
  int statusCode = 0;
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

class MockHttpClient final : public HttpClient {
 public:
  void enqueue(HttpResponse response) {
    responses_.push_back(std::move(response));
  }

  core::ApiResult<HttpResponse> send(const HttpRequest& request) override {
    requests_.push_back(request);
    if (responses_.empty()) {
      return core::ApiResult<HttpResponse>::err({
        "MOCK_RESPONSE_MISSING",
        models::ApiErrorCode::Unknown,
        "MockHttpClient has no queued response.",
        0
      });
    }

    auto response = std::move(responses_.front());
    responses_.pop_front();
    return core::ApiResult<HttpResponse>::ok(std::move(response));
  }

  [[nodiscard]] const std::vector<HttpRequest>& requests() const { return requests_; }
  [[nodiscard]] std::optional<HttpRequest> lastRequest() const {
    if (requests_.empty()) return std::nullopt;
    return requests_.back();
  }

 private:
  std::deque<HttpResponse> responses_;
  std::vector<HttpRequest> requests_;
};

} // namespace mrright::sdk::network
