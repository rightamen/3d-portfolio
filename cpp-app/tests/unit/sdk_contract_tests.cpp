#include "sdk/core/ApiClient.hpp"
#include "sdk/core/AuthClient.hpp"
#include "sdk/core/CommunityClient.hpp"
#include "sdk/core/EnvelopeParser.hpp"
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
using mrright::sdk::core::CommunityClient;
using mrright::sdk::core::JsonValue;
using mrright::sdk::core::parseResponseEnvelope;
using mrright::sdk::core::ProjectClient;
using mrright::sdk::models::AccessLevel;
using mrright::sdk::models::ApiErrorCode;
using mrright::sdk::models::CommunityTopic;
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

// POST /auth/login answers with server/postgres/mappers.js
// toAccountUserRecord (via authStore.getAccountProfile), so the session user
// carries accessLevel exactly like the GET /auth/me user does.
std::string loginEnvelope() {
  return R"json({
    "data": {
      "session": {"token": "session-token", "expiresAt": "2026-12-31T00:00:00Z"},
      "user": {
        "id": "user-1",
        "email": "visitor@example.test",
        "displayName": "Visitor",
        "accessLevel": "approved",
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

// Matches server/postgresStores.js toPublicUser (docs/openapi/api-v1.yaml
// components.schemas.User), the GET /auth/me shape.
std::string authMeEnvelope() {
  return R"json({
    "data": {
      "user": {
        "id": "user-1",
        "email": "visitor@example.test",
        "displayName": "Visitor",
        "accessLevel": "member",
        "emailVerified": true,
        "handle": "visitor",
        "avatarUrl": "/uploads/avatar.png",
        "bannerUrl": "/uploads/banner.png",
        "bio": "Hello",
        "location": "Earth",
        "website": "https://example.test",
        "profilePublic": true,
        "activityPublic": false,
        "profileAdminDisabled": false,
        "createdAt": "2026-01-01T00:00:00Z"
      }
    },
    "pagination": {},
    "error": null
  })json";
}

std::string authMeUnauthenticatedEnvelope() {
  return R"json({
    "data": {"user": null},
    "pagination": {},
    "error": null
  })json";
}

// Same GET /auth/me user shape as authMeEnvelope, with the one field under
// test substituted. docs/openapi/api-v1.yaml components.schemas.AccessLevel is
// [guest, member, approved] and server/index.js normalizeAccessLevel holds
// visitor_users.access_level to that set, so those three plus a level this SDK
// build does not know are the whole input space.
std::string authMeEnvelopeWithAccessLevel(const std::string& accessLevel) {
  return R"json({
    "data": {
      "user": {
        "id": "user-1",
        "email": "visitor@example.test",
        "displayName": "Visitor",
        "accessLevel": ")json" + accessLevel + R"json(",
        "emailVerified": true,
        "handle": "visitor",
        "profilePublic": true,
        "activityPublic": false,
        "profileAdminDisabled": false,
        "createdAt": "2026-01-01T00:00:00Z"
      }
    },
    "pagination": {},
    "error": null
  })json";
}

// accessLevel absent entirely: not a shape the current server emits, but the
// decoder must not read it as Guest if a future response ever drops it.
std::string authMeEnvelopeWithoutAccessLevel() {
  return R"json({
    "data": {
      "user": {
        "id": "user-1",
        "email": "visitor@example.test",
        "displayName": "Visitor",
        "emailVerified": true,
        "handle": "visitor",
        "createdAt": "2026-01-01T00:00:00Z"
      }
    },
    "pagination": {},
    "error": null
  })json";
}

// Matches server/postgres/mappers.js toCommunityPost (docs/openapi/api-v1.yaml
// components.schemas.CommunityPost). imageUrl is present on the wire but not
// modeled on the C++ CommunityPost struct yet; decoding must not choke on it.
std::string communityListPostsEnvelope() {
  return R"json({
    "data": {
      "posts": [
        {
          "id": "post-1",
          "title": "Hello Community",
          "message": "First post",
          "imageUrl": "/uploads/images/cover.png",
          "topic": "showcase",
          "createdAt": "2026-01-01T00:00:00Z",
          "updatedAt": "2026-01-02T00:00:00Z"
        }
      ]
    },
    "pagination": {},
    "error": null
  })json";
}

std::string communityListPostsEmptyEnvelope() {
  return R"json({
    "data": {"posts": []},
    "pagination": {},
    "error": null
  })json";
}

std::string communityGetPostEnvelope() {
  return R"json({
    "data": {
      "post": {
        "id": "post-1",
        "title": "Hello Community",
        "message": "First post",
        "topic": "general",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z"
      }
    },
    "pagination": {},
    "error": null
  })json";
}

std::string communityPostNotFoundEnvelope() {
  return R"json({
    "data": null,
    "pagination": {},
    "error": {"code": "COMMUNITY_POST_NOT_FOUND", "message": "Community post not found."}
  })json";
}

// Matches server/postgres/mappers.js toCommunityComment
// (docs/openapi/api-v1.yaml components.schemas.CommunityComment). One
// top-level comment with every optional field present, one reply with
// likeCount/liked/updatedAt absent to exercise the Comment model's optional
// fields.
std::string communityListCommentsEnvelope() {
  return R"json({
    "data": {
      "comments": [
        {
          "id": "comment-1",
          "postId": "post-1",
          "author": "Visitor One",
          "message": "Nice work",
          "parentId": null,
          "likeCount": 2,
          "liked": true,
          "createdAt": "2026-01-01T00:00:00Z",
          "updatedAt": "2026-01-01T01:00:00Z"
        },
        {
          "id": "comment-2",
          "postId": "post-1",
          "author": "Visitor Two",
          "message": "Replying here",
          "parentId": "comment-1",
          "createdAt": "2026-01-01T02:00:00Z"
        }
      ]
    },
    "pagination": {},
    "error": null
  })json";
}

std::string communityCreateCommentEnvelope() {
  return R"json({
    "data": {
      "comment": {
        "id": "comment-3",
        "postId": "post-1",
        "author": "Visitor Three",
        "message": "New comment",
        "parentId": null,
        "likeCount": 0,
        "liked": false,
        "createdAt": "2026-01-03T00:00:00Z"
      }
    },
    "pagination": {},
    "error": null
  })json";
}

std::string communityLikeCommentEnvelope() {
  return R"json({
    "data": {"liked": true, "likeCount": 5},
    "pagination": {},
    "error": null
  })json";
}

// Matches docs/openapi/api-v1.yaml components.schemas.ProjectComment
// (server/interactionsStore.js addComment): only id/author/message/createdAt.
std::string projectCreateCommentEnvelope() {
  return R"json({
    "data": {
      "comment": {
        "id": "project-comment-1",
        "author": "Guest Visitor",
        "message": "Great asset",
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

void testPaginationMissingEntirely() {
  const auto result = parseResponseEnvelope<std::string>(
    R"json({"data":{"ok":"yes"},"error":null})json",
    200,
    decodeOk
  );

  expect(result.isError(), "envelope missing pagination key entirely is rejected");
  expect(result.error()->code == "RESPONSE_CONTRACT_ERROR", "missing pagination is a contract error, not a decode crash");
}

void testProjectClientGetProject() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, R"json({
    "data": {
      "project": {
        "slug": "asset-one",
        "title": "Asset One",
        "summary": "Summary",
        "workflow": "Workflow",
        "image": "/uploads/one.jpg",
        "modelUrl": "/uploads/one.glb",
        "format": "GLB",
        "modelSize": "1 MB",
        "downloadPolicy": "Authorization required",
        "assetCategory": "next-gen-prop",
        "viewerFeatures": ["orbit"],
        "stack": ["Blender"],
        "year": "2026",
        "isPublic": true
      }
    },
    "pagination": {},
    "error": null
  })json"});

  ProjectClient client(mock);
  const auto result = client.getProject("asset-one");
  const auto request = mock->lastRequest();

  expect(result.isOk(), "ProjectClient::getProject decodes mock response");
  expect(result.value()->slug == "asset-one", "ProjectClient::getProject decodes slug");
  expect(result.value()->assetCategory == mrright::sdk::models::AssetCategory::NextGenProp, "ProjectClient::getProject decodes assetCategory enum");
  expect(request.has_value() && request->path == "/api/v1/projects/asset-one", "ProjectClient::getProject uses /api/v1/projects/{slug} path");
}

void testProjectClientCreateComment() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({201, {}, projectCreateCommentEnvelope()});

  ProjectClient client(mock);
  const auto result = client.createComment("asset-one", {"Guest Visitor", "Great asset"});
  const auto request = mock->lastRequest();

  expect(result.isOk(), "ProjectClient::createComment decodes mock response");
  expect(result.value()->id == "project-comment-1", "ProjectClient::createComment decodes comment id");
  expect(result.value()->author == "Guest Visitor", "ProjectClient::createComment decodes comment author");
  expect(!result.value()->postId.has_value(), "ProjectComment shape has no postId field");
  expect(request.has_value() && request->path == "/api/v1/projects/asset-one/comments", "ProjectClient::createComment uses /api/v1 comments path");
  expect(request->method == "POST", "ProjectClient::createComment uses POST");
}

void testAuthMeDecodesUser() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, authMeEnvelope()});

  AuthClient client(mock);
  const auto result = client.me("visitor-token");
  const auto request = mock->lastRequest();

  expect(result.isOk(), "AuthClient::me decodes mock response");
  expect(result.value()->id == "user-1", "AuthClient::me decodes user id");
  expect(result.value()->handle == "visitor", "AuthClient::me decodes handle");
  expect(result.value()->avatarUrl == "/uploads/avatar.png", "AuthClient::me decodes avatarUrl");
  expect(result.value()->bio == "Hello", "AuthClient::me decodes bio");
  expect(result.value()->accessLevel == AccessLevel::Member, "AuthClient::me decodes accessLevel");
  expect(request.has_value() && request->path == "/api/v1/auth/me", "AuthClient::me uses /api/v1/auth/me path");
  expect(request->headers.at("Authorization") == "Bearer visitor-token", "AuthClient::me sends bearer token");
}

void testAuthMeUnauthenticatedReturnsDefaultUser() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, authMeUnauthenticatedEnvelope()});

  AuthClient client(mock);
  const auto result = client.me();

  expect(result.isOk(), "AuthClient::me with data.user null still decodes as ok");
  expect(result.value()->id.empty(), "AuthClient::me returns a default-constructed User when unauthenticated");
  expect(result.value()->accessLevel == AccessLevel::Unknown, "an unauthenticated User keeps accessLevel Unknown, not Guest");
}

void testAuthMeDecodesEveryAccessLevel() {
  const struct {
    const char* wire;
    AccessLevel expected;
    const char* label;
  } cases[] = {
    {"guest", AccessLevel::Guest, "guest"},
    {"member", AccessLevel::Member, "member"},
    {"approved", AccessLevel::Approved, "approved"},
  };

  for (const auto& testCase : cases) {
    auto mock = std::make_shared<MockHttpClient>();
    mock->enqueue({200, {}, authMeEnvelopeWithAccessLevel(testCase.wire)});

    AuthClient client(mock);
    const auto result = client.me("visitor-token");

    expect(result.isOk(), std::string("AuthClient::me decodes the ") + testCase.label + " user");
    expect(
      result.isOk() && result.value()->accessLevel == testCase.expected,
      std::string("AuthClient::me maps accessLevel \"") + testCase.wire + "\" to its enum value"
    );
  }
}

void testAuthMeUnknownAccessLevelFallsBackToUnknown() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, authMeEnvelopeWithAccessLevel("curator")});

  AuthClient client(mock);
  const auto result = client.me("visitor-token");

  expect(result.isOk(), "an unrecognised accessLevel still decodes the rest of the user");
  expect(result.value()->id == "user-1", "an unrecognised accessLevel does not abort user decoding");
  expect(result.value()->accessLevel == AccessLevel::Unknown, "a server-side level this SDK does not know maps to Unknown");
  expect(result.value()->accessLevel != AccessLevel::Guest, "an unrecognised accessLevel must not silently become Guest");
}

void testAuthMeMissingAccessLevelFallsBackToUnknown() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, authMeEnvelopeWithoutAccessLevel()});

  AuthClient client(mock);
  const auto result = client.me("visitor-token");

  expect(result.isOk(), "a user object without accessLevel still decodes as ok");
  expect(result.value()->handle == "visitor", "a missing accessLevel does not disturb the other fields");
  expect(result.value()->accessLevel == AccessLevel::Unknown, "a missing accessLevel maps to Unknown, not Guest");
}

void testAuthLoginDecodesAccessLevel() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, loginEnvelope()});

  AuthClient client(mock);
  const auto result = client.login({"visitor@example.test", "password"});

  expect(result.isOk(), "AuthClient::login decodes the session user");
  expect(result.value()->user.accessLevel == AccessLevel::Approved, "AuthClient::login decodes accessLevel on the session user");
}

void testAuthLogoutRequest() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, R"json({"data":{"ok":true},"pagination":{},"error":null})json"});

  AuthClient client(mock);
  const auto result = client.logout("visitor-token");
  const auto request = mock->lastRequest();

  expect(result.isOk(), "AuthClient::logout decodes mock response");
  expect(request.has_value(), "AuthClient::logout sends request");
  expect(request->method == "POST", "AuthClient::logout uses POST");
  expect(request->path == "/api/v1/auth/logout", "AuthClient::logout uses /api/v1/auth/logout");
  expect(request->headers.at("Authorization") == "Bearer visitor-token", "AuthClient::logout sends bearer token");
}

void testCommunityClientListPosts() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, communityListPostsEnvelope()});

  CommunityClient client(mock);
  const auto result = client.listPosts();
  const auto request = mock->lastRequest();

  expect(result.isOk(), "CommunityClient::listPosts decodes mock response");
  expect(result.value()->size() == 1, "CommunityClient::listPosts decodes one post");
  expect(result.value()->at(0).id == "post-1", "CommunityClient::listPosts decodes post id");
  expect(result.value()->at(0).topic == CommunityTopic::Showcase, "CommunityClient::listPosts decodes topic enum");
  expect(result.value()->at(0).updatedAt == "2026-01-02T00:00:00Z", "CommunityClient::listPosts decodes updatedAt");
  expect(request.has_value() && request->path == "/api/v1/community/posts", "CommunityClient::listPosts uses /api/v1 path");
}

void testCommunityClientListPostsEmpty() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, communityListPostsEmptyEnvelope()});

  CommunityClient client(mock);
  const auto result = client.listPosts();

  expect(result.isOk(), "CommunityClient::listPosts decodes an empty posts array as ok");
  expect(result.value()->empty(), "CommunityClient::listPosts returns no posts when store is unconfigured");
}

void testCommunityClientGetPost() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, communityGetPostEnvelope()});

  CommunityClient client(mock);
  const auto result = client.getPost("post-1");
  const auto request = mock->lastRequest();

  expect(result.isOk(), "CommunityClient::getPost decodes mock response");
  expect(result.value()->title == "Hello Community", "CommunityClient::getPost decodes title");
  expect(result.value()->topic == CommunityTopic::General, "CommunityClient::getPost decodes general topic");
  expect(request.has_value() && request->path == "/api/v1/community/posts/post-1", "CommunityClient::getPost uses /api/v1/community/posts/{id} path");
}

void testCommunityClientGetPostNotFound() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({404, {}, communityPostNotFoundEnvelope()});

  CommunityClient client(mock);
  const auto result = client.getPost("missing-post");

  expect(result.isError(), "CommunityClient::getPost returns an error for a 404 envelope");
  expect(result.error()->knownCode == ApiErrorCode::CommunityPostNotFound, "CommunityClient::getPost maps COMMUNITY_POST_NOT_FOUND");
  expect(result.error()->httpStatus == 404, "CommunityClient::getPost preserves HTTP status");
}

void testCommunityClientListComments() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, communityListCommentsEnvelope()});

  CommunityClient client(mock);
  const auto result = client.listComments("post-1");
  const auto request = mock->lastRequest();

  expect(result.isOk(), "CommunityClient::listComments decodes mock response");
  expect(result.value()->size() == 2, "CommunityClient::listComments decodes two comments");

  const auto& top = result.value()->at(0);
  expect(top.parentId.has_value() == false, "top-level comment has no parentId");
  expect(top.likeCount.has_value() && *top.likeCount == 2, "top-level comment decodes likeCount");
  expect(top.liked.has_value() && *top.liked, "top-level comment decodes liked");

  const auto& reply = result.value()->at(1);
  expect(reply.parentId.has_value() && *reply.parentId == "comment-1", "reply comment decodes parentId");
  expect(!reply.likeCount.has_value(), "reply comment leaves likeCount unset when absent from the wire");
  expect(!reply.liked.has_value(), "reply comment leaves liked unset when absent from the wire");
  expect(!reply.updatedAt.has_value(), "reply comment leaves updatedAt unset when absent from the wire");

  expect(request.has_value() && request->path == "/api/v1/community/posts/post-1/comments", "CommunityClient::listComments uses /api/v1 comments path");
}

void testCommunityClientCreateCommentWithParent() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({201, {}, communityCreateCommentEnvelope()});

  CommunityClient client(mock);
  const auto result = client.createComment("post-1", "New comment", "visitor-token", std::string("comment-1"));
  const auto request = mock->lastRequest();

  expect(result.isOk(), "CommunityClient::createComment decodes mock response");
  expect(result.value()->id == "comment-3", "CommunityClient::createComment decodes new comment id");
  expect(request.has_value(), "CommunityClient::createComment sends request");
  expect(request->body.find("\"parentId\":\"comment-1\"") != std::string::npos, "CommunityClient::createComment includes parentId in request body when replying");
  expect(request->headers.at("Authorization") == "Bearer visitor-token", "CommunityClient::createComment sends bearer token");
}

void testCommunityClientCreateCommentWithoutParent() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({201, {}, communityCreateCommentEnvelope()});

  CommunityClient client(mock);
  (void)client.createComment("post-1", "New comment", "visitor-token");
  const auto request = mock->lastRequest();

  expect(request.has_value(), "CommunityClient::createComment sends request");
  expect(request->body.find("parentId") == std::string::npos, "CommunityClient::createComment omits parentId from request body for a top-level comment");
}

void testCommunityClientLikeComment() {
  auto mock = std::make_shared<MockHttpClient>();
  mock->enqueue({200, {}, communityLikeCommentEnvelope()});

  CommunityClient client(mock);
  const auto result = client.likeComment("comment-1", "visitor-token");
  const auto request = mock->lastRequest();

  expect(result.isOk(), "CommunityClient::likeComment decodes mock response");
  expect(result.value()->liked, "CommunityClient::likeComment decodes liked");
  expect(result.value()->likeCount == 5, "CommunityClient::likeComment decodes likeCount");
  expect(request.has_value() && request->path == "/api/v1/community/comments/comment-1/like", "CommunityClient::likeComment uses /api/v1 like path");
  expect(request->method == "POST", "CommunityClient::likeComment uses POST");
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
  testPaginationMissingEntirely();
  testProjectClientGetProject();
  testProjectClientCreateComment();
  testAuthMeDecodesUser();
  testAuthMeUnauthenticatedReturnsDefaultUser();
  testAuthMeDecodesEveryAccessLevel();
  testAuthMeUnknownAccessLevelFallsBackToUnknown();
  testAuthMeMissingAccessLevelFallsBackToUnknown();
  testAuthLoginDecodesAccessLevel();
  testAuthLogoutRequest();
  testCommunityClientListPosts();
  testCommunityClientListPostsEmpty();
  testCommunityClientGetPost();
  testCommunityClientGetPostNotFound();
  testCommunityClientListComments();
  testCommunityClientCreateCommentWithParent();
  testCommunityClientCreateCommentWithoutParent();
  testCommunityClientLikeComment();

  if (failures != 0) {
    std::cerr << failures << " SDK contract test(s) failed.\n";
    return 1;
  }

  std::cout << "SDK contract tests passed.\n";
  return 0;
}
