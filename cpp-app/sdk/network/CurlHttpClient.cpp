#include "sdk/network/CurlHttpClient.hpp"

#include <curl/curl.h>

#include <algorithm>
#include <cctype>
#include <cstddef>
#include <memory>
#include <sstream>
#include <string>
#include <string_view>
#include <utility>

namespace mrright::sdk::network {
namespace {

using mrright::sdk::core::ApiResult;
using mrright::sdk::models::ApiError;
using mrright::sdk::models::ApiErrorCode;

ApiError networkError(std::string code, std::string message) {
  return {std::move(code), ApiErrorCode::Unknown, std::move(message), 0};
}

std::size_t writeBody(char* ptr, std::size_t size, std::size_t nmemb, void* userdata) {
  auto* body = static_cast<std::string*>(userdata);
  body->append(ptr, size * nmemb);
  return size * nmemb;
}

std::string trim(std::string_view value) {
  auto begin = value.begin();
  auto end = value.end();
  while (begin != end && std::isspace(static_cast<unsigned char>(*begin)) != 0) ++begin;
  while (begin != end && std::isspace(static_cast<unsigned char>(*(end - 1))) != 0) --end;
  return std::string(begin, end);
}

std::size_t writeHeader(char* buffer, std::size_t size, std::size_t nitems, void* userdata) {
  auto* headers = static_cast<std::map<std::string, std::string>*>(userdata);
  const std::string_view line(buffer, size * nitems);
  const auto separator = line.find(':');
  if (separator == std::string_view::npos) return size * nitems;

  const auto key = trim(line.substr(0, separator));
  const auto value = trim(line.substr(separator + 1));
  if (!key.empty()) {
    (*headers)[key] = value;
  }
  return size * nitems;
}

std::string methodUpper(std::string method) {
  std::transform(method.begin(), method.end(), method.begin(), [](unsigned char ch) {
    return static_cast<char>(std::toupper(ch));
  });
  return method;
}

std::string curlMessage(CURLcode code) {
  return curl_easy_strerror(code);
}

/*
 * libcurl needs process-level initialization before easy handles are used.
 * This intentionally stays inside the optional backend so the default mock
 * build has no libcurl dependency or side effect.
 */
CURLcode ensureCurlGlobal() {
  static const CURLcode initialized = curl_global_init(CURL_GLOBAL_DEFAULT);
  return initialized;
}

bool startsWithHttpScheme(std::string_view value) {
  return value.starts_with("http://") || value.starts_with("https://");
}

} // namespace

CurlHttpClient::CurlHttpClient(core::ApiClientConfig config)
  : config_(std::move(config)) {}

ApiResult<HttpResponse> CurlHttpClient::send(const HttpRequest& request) {
  const CURLcode globalInit = ensureCurlGlobal();
  if (globalInit != CURLE_OK) {
    return ApiResult<HttpResponse>::err(networkError("NETWORK_UNAVAILABLE", "libcurl global initialization failed: " + curlMessage(globalInit)));
  }

  if (request.path.empty()) {
    return ApiResult<HttpResponse>::err(networkError("CLIENT_PATH_INVALID", "CurlHttpClient request path must not be empty."));
  }

  std::unique_ptr<CURL, decltype(&curl_easy_cleanup)> curl(curl_easy_init(), &curl_easy_cleanup);
  if (!curl) {
    return ApiResult<HttpResponse>::err(networkError("NETWORK_UNAVAILABLE", "libcurl could not create an easy handle."));
  }

  std::string url = request.path;
  if (!startsWithHttpScheme(url)) {
    if (url.front() != '/' || config_.baseUrl.empty()) {
      return ApiResult<HttpResponse>::err(networkError("CLIENT_CONFIG_INVALID", "CurlHttpClient requires a full URL or a baseUrl for absolute paths."));
    }
    url = config_.baseUrl + url;
  }

  std::string responseBody;
  std::map<std::string, std::string> responseHeaders;
  curl_slist* rawHeaders = nullptr;
  for (const auto& [key, value] : request.headers) {
    const std::string header = key + ": " + value;
    curl_slist* next = curl_slist_append(rawHeaders, header.c_str());
    if (!next) {
      curl_slist_free_all(rawHeaders);
      return ApiResult<HttpResponse>::err(networkError("NETWORK_UNAVAILABLE", "libcurl could not allocate request headers."));
    }
    rawHeaders = next;
  }
  std::unique_ptr<curl_slist, decltype(&curl_slist_free_all)> headerList(rawHeaders, &curl_slist_free_all);

  const auto method = methodUpper(request.method);
  if (method == "GET") {
    curl_easy_setopt(curl.get(), CURLOPT_HTTPGET, 1L);
  } else if (method == "POST") {
    curl_easy_setopt(curl.get(), CURLOPT_POST, 1L);
    curl_easy_setopt(curl.get(), CURLOPT_POSTFIELDS, request.body.c_str());
    curl_easy_setopt(curl.get(), CURLOPT_POSTFIELDSIZE, static_cast<long>(request.body.size()));
  } else if (method == "PUT" || method == "PATCH" || method == "DELETE") {
    curl_easy_setopt(curl.get(), CURLOPT_CUSTOMREQUEST, method.c_str());
    if (!request.body.empty()) {
      curl_easy_setopt(curl.get(), CURLOPT_POSTFIELDS, request.body.c_str());
      curl_easy_setopt(curl.get(), CURLOPT_POSTFIELDSIZE, static_cast<long>(request.body.size()));
    }
  } else {
    return ApiResult<HttpResponse>::err(networkError("REQUEST_METHOD_UNSUPPORTED", "CurlHttpClient does not support HTTP method: " + request.method));
  }

  curl_easy_setopt(curl.get(), CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl.get(), CURLOPT_HTTPHEADER, headerList.get());
  curl_easy_setopt(curl.get(), CURLOPT_WRITEFUNCTION, writeBody);
  curl_easy_setopt(curl.get(), CURLOPT_WRITEDATA, &responseBody);
  curl_easy_setopt(curl.get(), CURLOPT_HEADERFUNCTION, writeHeader);
  curl_easy_setopt(curl.get(), CURLOPT_HEADERDATA, &responseHeaders);
  curl_easy_setopt(curl.get(), CURLOPT_FOLLOWLOCATION, 0L);
  curl_easy_setopt(curl.get(), CURLOPT_TIMEOUT_MS, static_cast<long>(config_.timeoutMs));
  curl_easy_setopt(curl.get(), CURLOPT_NOSIGNAL, 1L);

  const CURLcode performed = curl_easy_perform(curl.get());
  if (performed != CURLE_OK) {
    std::string code = "CONNECTION_FAILED";
    if (performed == CURLE_OPERATION_TIMEDOUT) code = "REQUEST_TIMEOUT";
    if (performed == CURLE_SSL_CONNECT_ERROR || performed == CURLE_PEER_FAILED_VERIFICATION) code = "TLS_ERROR";
    if (performed == CURLE_COULDNT_CONNECT || performed == CURLE_COULDNT_RESOLVE_HOST) code = "NETWORK_UNAVAILABLE";
    return ApiResult<HttpResponse>::err(networkError(std::move(code), "libcurl request failed: " + curlMessage(performed)));
  }

  long statusCode = 0;
  curl_easy_getinfo(curl.get(), CURLINFO_RESPONSE_CODE, &statusCode);

  return ApiResult<HttpResponse>::ok({
    static_cast<int>(statusCode),
    std::move(responseHeaders),
    std::move(responseBody),
  });
}

} // namespace mrright::sdk::network
