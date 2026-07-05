#include "sdk/core/ApiClient.hpp"
#include "sdk/core/AuthClient.hpp"
#include "sdk/core/EnvelopeParser.hpp"
#include "sdk/core/ProjectClient.hpp"
#include "sdk/core/ProjectClient.hpp"
#include "sdk/network/HttpClient.hpp"
#include "sdk/network/RealHttpClient.hpp"

#include <iostream>
#include <memory>
#include <string>
#include <vector>

namespace {

using mrright::sdk::core::ApiClient;
using mrright::sdk::core::ApiClientConfig;
using mrright::sdk::core::AuthClient;
using mrright::sdk::core::ApiResult;
using mrright::sdk::core::JsonValue;
using mrright::sdk::core::parseResponseEnvelope;
using mrright::sdk::core::ProjectClient;
using mrright::sdk::models::ApiErrorCode;
using mrright::sdk::network::HttpResponse;
using mrright::sdk::network::MockHttpClient;
using mrright::sdk::network::RealHttpClient;

int failures = 0;

void expect(bool condition, const std::string& message) {
  if (condition) return;
  ++failures;
  std::cerr << "FAIL: " << message << '\n';
}

ApiResult<std::string> decodeOk(const JsonValue& data, const mrright::sdk::models::Pagination&) {
  const auto* ok = data.get("ok");
  const auto* text = ok ? ok->asString() : nullptr;
  if (!text) {
    return ApiResult<std::string>::err({"TEST_DECODE_ERROR", ApiErrorCode::Unknown, "missing ok", 0});
  }
  return ApiResult<std::string>::ok(*text);
}

std::string projectEnvelope() {
  return R"json({
    "data": {
      "projects": [
        {
          "slug": "asset-one",
          "title": "Asset One",
          "summary": "Summary",
          "workflow": "Workflow",
          "image": "/uploads/one.jpg",
          "modelUrl": "/uploads/one.glb",
          "format": "GLB",
          "modelSize": "1 MB",
          "downloadPolicy": "Authorization required",
          "assetCategory": "generic",
          "viewerFeatures": ["orbit", "wireframe"],
          "stack": ["Blender"],
          "year": "2026",
          "isPublic": true
        }
      ]
    },
    "pagination": {},
    "error": null
  })json";
}

std::string loginEnvelope() {
  return R"json({
    "data": {
      "session": {"token": "session-token", "expiresAt": "2026-12-31T00:00:00Z"},
      "user": {
        "id": "user-1",
        "email": "visitor@example.test",
        "displayName": "Visitor",
        "handle": "visitor",
        "emailVerified": true,
        "profilePublic": true,
        "activityPublic": true,
        "profileAdminDisabled": false,
        "createdAt": "2026-01-01T00:00:00Z"
      }
    },
    "pagination": {},
    "error": null
  })json";
}

class GuardProbeClient : public ApiClient {
 public:
  using ApiClient::ApiClient;

  ApiResult<HttpResponse> trySend(std::string path) const {
    return sendJson("GET", path);
  }
};

void testSuccessEnvelope() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":{"ok":"yes"},"pagination":{"page":1,"limit":20,"total":1,"pages":1,"hasNext":false,"hasPrevious":false},"error":null})json",
    200,
    decodeOk
  );

  expect(result.isOk(), "success envelope parses as ok");
  expect(result.value().has_value() && *result.value() == "yes", "success envelope decodes data");
}

void testErrorEnvelope() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":null,"pagination":{},"error":{"code":"AUTH_REQUIRED","message":"Authentication required"}})json",
    401,
    decodeOk
  );

  expect(result.isError(), "error envelope returns ApiResult error");
  expect(result.error()->knownCode == ApiErrorCode::AuthRequired, "known error code maps to enum");
  expect(result.error()->httpStatus == 401, "error envelope preserves HTTP status");
}

void testUnknownErrorCode() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":null,"pagination":{},"error":{"code":"FUTURE_CODE","message":"Future failure"}})json",
    499,
    decodeOk
  );

  expect(result.isError(), "unknown error code returns ApiResult error");
  expect(result.error()->knownCode == ApiErrorCode::Unknown, "unknown error code maps to Unknown");
  expect(result.error()->code == "FUTURE_CODE", "unknown error code preserves raw string");
}

void testLegacyMirrorRejected() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":{"ok":"yes"},"ok":"yes","pagination":{},"error":null})json",
    200,
    decodeOk
  );

  expect(result.isError(), "legacy top-level mirror key is rejected");
  expect(result.error()->code == "RESPONSE_CONTRACT_ERROR", "legacy mirror rejection is a contract error");
}

void testProjectClientList() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {{"Content-Type", "application/json"}}, projectEnvelope()});

  ProjectClient client(mock);
  const auto result = client.listProjects();

  expect(result.isOk(), "ProjectClient::listProjects decodes mock response");
  expect(result.value()->size() == 1, "ProjectClient::listProjects decodes one project");
  expect(result.value()->at(0).slug == "asset-one", "ProjectClient::listProjects decodes project slug");
  expect(result.value()->at(0).viewerFeatures.size() == 2, "ProjectClient::listProjects decodes string arrays");
}

void testDefaultConfig() {
  const ApiClientConfig config;
  expect(config.apiPrefix == "/api/v1", "ApiClientConfig defaults apiPrefix to /api/v1");
  expect(config.baseUrl.empty(), "ApiClientConfig does not hard-code production baseUrl");
}

void testProjectClientPath() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, projectEnvelope()});

  ProjectClient client(mock);
  (void)client.listProjects();

  const auto request = mock->lastRequest();
  expect(request.has_value(), "MockHttpClient records request");
  expect(request->path == "/api/v1/projects", "ProjectClient constructs /api/v1 path");
  expect(request->path != "/api/projects", "ProjectClient does not construct legacy /api path");
  expect(request->headers.at("Accept") == "application/json", "GET request sets Accept header");
  expect(request->headers.at("User-Agent") == "mrright-cpp-sdk/0.1", "request sets default User-Agent");
}

void testAuthLoginRequest() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, loginEnvelope()});

  AuthClient client(mock);
  const auto result = client.login({"visitor@example.test", "password"});
  const auto request = mock->lastRequest();

  expect(result.isOk(), "AuthClient::login decodes mock response");
  expect(result.value()->token == "session-token", "AuthClient::login decodes session token in memory");
  expect(request.has_value(), "AuthClient::login sends request");
  expect(request->method == "POST", "AuthClient::login uses POST");
  expect(request->path == "/api/v1/auth/login", "AuthClient::login uses /api/v1/auth/login");
  expect(request->headers.at("Content-Type") == "application/json", "POST request sets Content-Type");
}

void testBearerHeaderFromConfig() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, projectEnvelope()});

  ApiClientConfig config;
  config.bearerToken = "in-memory-token";
  ProjectClient client(mock, config);
  (void)client.listProjects();

  const auto request = mock->lastRequest();
  expect(request.has_value(), "request with config bearer token is sent");
  expect(request->headers.at("Authorization") == "Bearer in-memory-token", "bearer token is sent only as Authorization header");
}

void testBearerHeaderFromMethod() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, R"json({"data":{"liked":true,"likeCount":3},"pagination":{},"error":null})json"});

  ProjectClient client(mock);
  const auto result = client.likeProject("asset-one", "visitor-id", "method-token");
  const auto request = mock->lastRequest();

  expect(result.isOk(), "ProjectClient::likeProject decodes like response");
  expect(request.has_value(), "ProjectClient::likeProject sends request");
  expect(request->path == "/api/v1/projects/asset-one/like", "ProjectClient::likeProject uses v1 like path");
  expect(request->headers.at("Authorization") == "Bearer method-token", "method token is sent as Authorization header");
  expect(request->headers.at("Content-Type") == "application/json", "like POST sets Content-Type");
}

void testAdminPathRejected() {
  auto mock = std::make_shared<MockHttpClient>();
  GuardProbeClient client(mock, ApiClientConfig{});

  const auto result = client.trySend("/admin/summary");
  expect(result.isError(), "ApiClient rejects admin paths");
  expect(mock->requests().empty(), "admin path rejection happens before HttpClient send");
}

void testLegacyPathRejected() {
  auto mock = std::make_shared<MockHttpClient>();
  GuardProbeClient client(mock, ApiClientConfig{});

  const auto result = client.trySend("/api/projects");
  expect(result.isError(), "ApiClient rejects legacy /api paths");
  expect(mock->requests().empty(), "legacy path rejection happens before HttpClient send");
}

void testTypedClientErrorEnvelope() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({401, {}, R"json({"data":null,"pagination":{},"error":{"code":"AUTH_REQUIRED","message":"Authentication required"}})json"});

  ProjectClient client(mock);
  const auto result = client.listProjects();

  expect(result.isError(), "typed client returns ApiResult error for error envelope");
  expect(result.error()->knownCode == ApiErrorCode::AuthRequired, "typed client maps error envelope code");
}

void testTypedClientInvalidJson() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, R"json({"projects":[]})json"});

  ProjectClient client(mock);
  const auto result = client.listProjects();

  expect(result.isError(), "typed client rejects non-envelope JSON");
  expect(result.error()->code == "RESPONSE_CONTRACT_ERROR", "non-envelope JSON returns contract error");
}

void testRealHttpClientPlaceholder() {
  RealHttpClient client;
  const auto result = client.send({"GET", "/api/v1/projects", {}, {}});

  expect(result.isError(), "RealHttpClient placeholder returns an error");
  expect(result.error()->code == "REAL_HTTP_BACKEND_NOT_ENABLED", "RealHttpClient reports backend not enabled");
}

} // namespace

int main() {
  testSuccessEnvelope();
  testErrorEnvelope();
  testUnknownErrorCode();
  testLegacyMirrorRejected();
  testProjectClientList();
  testDefaultConfig();
  testProjectClientPath();
  testAuthLoginRequest();
  testBearerHeaderFromConfig();
  testBearerHeaderFromMethod();
  testAdminPathRejected();
  testLegacyPathRejected();
  testTypedClientErrorEnvelope();
  testTypedClientInvalidJson();
  testRealHttpClientPlaceholder();

  if (failures != 0) {
    std::cerr << failures << " SDK contract test(s) failed.\n";
    return 1;
  }

  std::cout << "SDK contract tests passed.\n";
  return 0;
}
