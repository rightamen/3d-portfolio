#include "sdk/core/AuthClient.hpp"
#include "sdk/core/EnvelopeParser.hpp"
#include "sdk/core/ProjectClient.hpp"
#include "sdk/network/HttpClient.hpp"

#include <iostream>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#ifndef MRRIGHT_USE_NLOHMANN_JSON
#error "mrright_cpp_nlohmann_json_tests must be built with MRRIGHT_USE_NLOHMANN_JSON."
#endif

namespace {

using mrright::sdk::core::ApiResult;
using mrright::sdk::core::AuthClient;
using mrright::sdk::core::JsonValue;
using mrright::sdk::core::ProjectClient;
using mrright::sdk::core::parseResponseEnvelope;
using mrright::sdk::models::ApiErrorCode;
using mrright::sdk::models::Pagination;
using mrright::sdk::network::MockHttpClient;

int failures = 0;

void expect(bool condition, const std::string& message) {
  if (condition) return;
  ++failures;
  std::cerr << "FAIL: " << message << '\n';
}

ApiResult<std::string> decodeOk(const JsonValue& data, const Pagination& pagination) {
  expect(pagination.page.has_value() && *pagination.page == 2, "pagination.page is decoded");
  expect(pagination.limit.has_value() && *pagination.limit == 10, "pagination.limit is decoded");
  expect(pagination.total.has_value() && *pagination.total == 11, "pagination.total is decoded");
  expect(pagination.pages.has_value() && *pagination.pages == 2, "pagination.pages is decoded");
  expect(pagination.hasNext.has_value() && !*pagination.hasNext, "pagination.hasNext is decoded");
  expect(pagination.hasPrevious.has_value() && *pagination.hasPrevious, "pagination.hasPrevious is decoded");

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

void testSuccessEnvelope() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":{"ok":"yes"},"pagination":{"page":2,"limit":10,"total":11,"pages":2,"hasNext":false,"hasPrevious":true},"error":null})json",
    200,
    decodeOk
  );

  expect(result.isOk(), "nlohmann success envelope parses as ok");
  expect(result.value().has_value() && *result.value() == "yes", "nlohmann success envelope decodes data");
}

void testErrorEnvelope() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":null,"pagination":{},"error":{"code":"AUTH_REQUIRED","message":"Authentication required"}})json",
    401,
    decodeOk
  );

  expect(result.isError(), "nlohmann error envelope returns ApiResult error");
  expect(result.error()->knownCode == ApiErrorCode::AuthRequired, "nlohmann known error code maps to enum");
  expect(result.error()->httpStatus == 401, "nlohmann error envelope preserves HTTP status");
}

void testUnknownErrorCode() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":null,"pagination":{},"error":{"code":"FUTURE_CODE","message":"Future failure"}})json",
    499,
    decodeOk
  );

  expect(result.isError(), "nlohmann unknown error code returns ApiResult error");
  expect(result.error()->knownCode == ApiErrorCode::Unknown, "nlohmann unknown error code maps to Unknown");
  expect(result.error()->code == "FUTURE_CODE", "nlohmann unknown error code preserves raw string");
}

void testLegacyMirrorRejected() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":{"ok":"yes"},"ok":"yes","pagination":{},"error":null})json",
    200,
    decodeOk
  );

  expect(result.isError(), "nlohmann backend rejects legacy top-level mirror key");
  expect(result.error()->code == "RESPONSE_CONTRACT_ERROR", "nlohmann legacy mirror rejection is a contract error");
}

void testProjectClientList() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {{"Content-Type", "application/json"}}, projectEnvelope()});

  ProjectClient client(mock);
  const auto result = client.listProjects();

  expect(result.isOk(), "ProjectClient::listProjects decodes mock response with nlohmann backend");
  expect(result.value()->size() == 1, "ProjectClient::listProjects decodes one project with nlohmann backend");
  expect(result.value()->at(0).slug == "asset-one", "ProjectClient::listProjects decodes project slug with nlohmann backend");
  expect(result.value()->at(0).viewerFeatures.size() == 2, "ProjectClient::listProjects decodes string arrays with nlohmann backend");
}

void testAuthLogin() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {{"Content-Type", "application/json"}}, loginEnvelope()});

  AuthClient client(mock);
  const auto result = client.login({"visitor@example.test", "password"});

  expect(result.isOk(), "AuthClient::login decodes session with nlohmann backend");
  expect(result.value()->token == "session-token", "AuthClient::login decodes session token with nlohmann backend");
  expect(result.value()->user.email == "visitor@example.test", "AuthClient::login decodes user email with nlohmann backend");
}

void testInvalidJsonRejected() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":{"ok":"yes"},"pagination":{},"error":null)json",
    200,
    decodeOk
  );

  expect(result.isError(), "nlohmann backend rejects invalid JSON");
  expect(result.error()->code == "JSON_PARSE_ERROR", "nlohmann invalid JSON returns parse error");
}

void testMissingStrictEnvelopeRejected() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":{"ok":"yes"},"pagination":{}})json",
    200,
    decodeOk
  );

  expect(result.isError(), "nlohmann backend rejects missing strict envelope field");
  expect(result.error()->code == "RESPONSE_CONTRACT_ERROR", "nlohmann missing envelope field returns contract error");
}

} // namespace

int main() {
  testSuccessEnvelope();
  testErrorEnvelope();
  testUnknownErrorCode();
  testLegacyMirrorRejected();
  testProjectClientList();
  testAuthLogin();
  testInvalidJsonRejected();
  testMissingStrictEnvelopeRejected();

  if (failures != 0) {
    std::cerr << failures << " nlohmann parser test(s) failed.\n";
    return 1;
  }

  std::cout << "nlohmann parser tests passed.\n";
  return 0;
}
