#include "sdk/core/ApiClient.hpp"
#include "sdk/core/EnvelopeParser.hpp"
#include "sdk/core/ProjectClient.hpp"
#include "sdk/network/HttpClient.hpp"

#include <iostream>
#include <memory>
#include <string>
#include <vector>

namespace {

using mrright::sdk::core::ApiClient;
using mrright::sdk::core::ApiClientOptions;
using mrright::sdk::core::ApiResult;
using mrright::sdk::core::JsonValue;
using mrright::sdk::core::parseResponseEnvelope;
using mrright::sdk::core::ProjectClient;
using mrright::sdk::models::ApiErrorCode;
using mrright::sdk::network::HttpResponse;
using mrright::sdk::network::MockHttpClient;

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

void testProjectClientPath() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, projectEnvelope()});

  ProjectClient client(mock);
  (void)client.listProjects();

  const auto request = mock->lastRequest();
  expect(request.has_value(), "MockHttpClient records request");
  expect(request->path == "/api/v1/projects", "ProjectClient constructs /api/v1 path");
  expect(request->path != "/api/projects", "ProjectClient does not construct legacy /api path");
}

void testAdminPathRejected() {
  auto mock = std::make_shared<MockHttpClient>();
  GuardProbeClient client(mock, ApiClientOptions{});

  const auto result = client.trySend("/admin/summary");
  expect(result.isError(), "ApiClient rejects admin paths");
  expect(mock->requests().empty(), "admin path rejection happens before HttpClient send");
}

} // namespace

int main() {
  testSuccessEnvelope();
  testErrorEnvelope();
  testUnknownErrorCode();
  testLegacyMirrorRejected();
  testProjectClientList();
  testProjectClientPath();
  testAdminPathRejected();

  if (failures != 0) {
    std::cerr << failures << " SDK contract test(s) failed.\n";
    return 1;
  }

  std::cout << "SDK contract tests passed.\n";
  return 0;
}
