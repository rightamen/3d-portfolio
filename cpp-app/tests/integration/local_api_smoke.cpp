#include "sdk/core/ApiClientConfig.hpp"
#include "sdk/core/EnvelopeParser.hpp"
#include "sdk/core/JsonValue.hpp"
#include "sdk/core/ProjectClient.hpp"
#include "sdk/network/CurlHttpClient.hpp"

#include <cstdlib>
#include <iostream>
#include <memory>
#include <set>
#include <string>
#include <string_view>

namespace {

using mrright::sdk::core::ApiClientConfig;
using mrright::sdk::core::ApiResult;
using mrright::sdk::core::JsonValue;
using mrright::sdk::core::ProjectClient;
using mrright::sdk::core::contractError;
using mrright::sdk::core::parseJson;
using mrright::sdk::core::parseResponseEnvelope;
using mrright::sdk::network::CurlHttpClient;
using mrright::sdk::network::HttpRequest;
using mrright::sdk::network::HttpResponse;

constexpr int kSkip = 77;

bool startsWith(std::string_view value, std::string_view prefix) {
  return value.substr(0, prefix.size()) == prefix;
}

bool isDigits(std::string_view value) {
  if (value.empty()) return false;
  for (const char ch : value) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

bool hostMatchesWithOptionalPort(std::string_view authority, std::string_view host) {
  if (authority == host) return true;
  if (!startsWith(authority, host) || authority.size() <= host.size() || authority[host.size()] != ':') {
    return false;
  }
  return isDigits(authority.substr(host.size() + 1));
}

std::string withoutTrailingSlash(std::string value) {
  while (value.size() > std::string("http://x").size() && value.back() == '/') {
    value.pop_back();
  }
  return value;
}

bool isAllowedLocalBaseUrl(std::string_view rawUrl) {
  constexpr std::string_view scheme = "http://";
  if (!startsWith(rawUrl, scheme)) return false;

  const std::string_view afterScheme = rawUrl.substr(scheme.size());
  const auto slash = afterScheme.find('/');
  if (slash != std::string_view::npos) return false;
  const std::string_view authority = afterScheme.substr(0, slash);
  if (authority.empty()) return false;

  if (hostMatchesWithOptionalPort(authority, "localhost")) return true;
  if (hostMatchesWithOptionalPort(authority, "127.0.0.1")) return true;
  if (hostMatchesWithOptionalPort(authority, "[::1]")) return true;
  return false;
}

int fail(std::string_view message) {
  std::cerr << "local_api_smoke failed: " << message << '\n';
  return 1;
}

ApiResult<JsonValue> strictEnvelopeData(const HttpResponse& response, int expectedStatus) {
  if (response.statusCode != expectedStatus) {
    return ApiResult<JsonValue>::err(contractError(
      "Unexpected HTTP status " + std::to_string(response.statusCode) +
      ", expected " + std::to_string(expectedStatus),
      response.statusCode
    ));
  }

  return parseResponseEnvelope<JsonValue>(
    response.body,
    response.statusCode,
    [](const JsonValue& data, const mrright::sdk::models::Pagination&) {
      return ApiResult<JsonValue>::ok(data);
    }
  );
}

ApiResult<void> assertOnlyStrictTopLevelKeys(const std::string& body) {
  const auto parsed = parseJson(body);
  if (parsed.isError()) return ApiResult<void>::err(*parsed.error());

  const auto* root = parsed.value()->asObject();
  if (!root) return ApiResult<void>::err(contractError("Response root must be a JSON object."));

  const std::set<std::string> allowed = {"data", "pagination", "error"};
  for (const auto& [key, ignored] : *root) {
    (void)ignored;
    if (!allowed.contains(key)) {
      return ApiResult<void>::err(contractError("Unexpected legacy top-level key: " + key));
    }
  }
  return ApiResult<void>::ok();
}

ApiResult<void> assertNoTopLevelProjectsMirror(const std::string& body) {
  const auto parsed = parseJson(body);
  if (parsed.isError()) return ApiResult<void>::err(*parsed.error());

  const auto* root = parsed.value()->asObject();
  if (!root) return ApiResult<void>::err(contractError("Projects response root must be a JSON object."));
  if (root->contains("projects")) {
    return ApiResult<void>::err(contractError("Strict /api/v1/projects must not expose a legacy top-level projects mirror."));
  }
  return ApiResult<void>::ok();
}

ApiResult<HttpResponse> get(CurlHttpClient& http, std::string path) {
  return http.send(HttpRequest{
    "GET",
    std::move(path),
    {
      {"Accept", "application/json"},
      {"User-Agent", "mrright-cpp-sdk-local-smoke/0.1"},
    },
    {},
  });
}

} // namespace

int main() {
  const char* rawBaseUrl = std::getenv("MRRIGHT_API_BASE_URL");
  if (rawBaseUrl == nullptr || std::string_view(rawBaseUrl).empty()) {
    std::cout << "Skipping local API smoke: MRRIGHT_API_BASE_URL is not set.\n";
    return kSkip;
  }

  std::string baseUrl = withoutTrailingSlash(rawBaseUrl);
  if (!isAllowedLocalBaseUrl(baseUrl)) {
    return fail("MRRIGHT_API_BASE_URL must be http://localhost, http://127.0.0.1, or http://[::1]. Refusing non-local API target.");
  }

  ApiClientConfig config;
  config.baseUrl = baseUrl;
  config.timeoutMs = 5000;
  config.userAgent = "mrright-cpp-sdk-local-smoke/0.1";

  auto http = std::make_shared<CurlHttpClient>(config);

  const auto health = get(*http, "/api/v1/health");
  if (health.isError()) return fail("GET /api/v1/health transport error: " + health.error()->message);

  const auto healthKeys = assertOnlyStrictTopLevelKeys(health.value()->body);
  if (healthKeys.isError()) return fail("GET /api/v1/health strict key check failed: " + healthKeys.error()->message);

  const auto healthData = strictEnvelopeData(*health.value(), 200);
  if (healthData.isError()) return fail("GET /api/v1/health envelope parse failed: " + healthData.error()->message);

  const auto* ok = healthData.value()->get("ok");
  if (ok == nullptr || !ok->isBool() || ok->asBool() == nullptr || !*ok->asBool()) {
    return fail("GET /api/v1/health data.ok must be true.");
  }

  const auto projectsRaw = get(*http, "/api/v1/projects");
  if (projectsRaw.isError()) return fail("GET /api/v1/projects transport error: " + projectsRaw.error()->message);
  if (projectsRaw.value()->statusCode != 200 && projectsRaw.value()->statusCode != 503) {
    return fail("GET /api/v1/projects returned unexpected HTTP status " + std::to_string(projectsRaw.value()->statusCode));
  }

  const auto projectsKeys = assertOnlyStrictTopLevelKeys(projectsRaw.value()->body);
  if (projectsKeys.isError()) return fail("GET /api/v1/projects strict key check failed: " + projectsKeys.error()->message);

  const auto projectKeys = assertNoTopLevelProjectsMirror(projectsRaw.value()->body);
  if (projectKeys.isError()) return fail("GET /api/v1/projects strict mirror check failed: " + projectKeys.error()->message);

  ProjectClient projectClient(http, config);
  const auto projects = projectClient.listProjects();
  if (projectsRaw.value()->statusCode == 200 && projects.isError()) {
    return fail("ProjectClient::listProjects could not parse /api/v1/projects: " + projects.error()->message);
  }
  if (projectsRaw.value()->statusCode == 503 && !projects.isError()) {
    return fail("ProjectClient::listProjects unexpectedly succeeded for a 503 envelope.");
  }

  const auto missingProject = get(*http, "/api/v1/projects/__mrright_cpp_smoke_missing_project__");
  if (missingProject.isError()) return fail("GET missing project transport error: " + missingProject.error()->message);
  const auto missingKeys = assertOnlyStrictTopLevelKeys(missingProject.value()->body);
  if (missingKeys.isError()) return fail("GET missing project strict key check failed: " + missingKeys.error()->message);

  const auto missingData = strictEnvelopeData(*missingProject.value(), 404);
  if (!missingData.isError()) return fail("GET missing project must return an error envelope.");
  if (missingData.error()->code.empty() || missingData.error()->message.empty()) {
    return fail("GET missing project error envelope must include error.code and error.message.");
  }

  std::cout << "local API smoke passed for " << baseUrl << " using strict /api/v1 envelopes.\n";
  return 0;
}
