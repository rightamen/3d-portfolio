#pragma once

#include "sdk/core/ApiClient.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/core/EnvelopeParser.hpp"
#include "sdk/core/InteractionTypes.hpp"
#include "sdk/core/JsonValue.hpp"
#include "sdk/models/Comment.hpp"
#include "sdk/models/CommunityPost.hpp"

#include <map>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace mrright::sdk::core {

class CommunityClient : public ApiClient {
 public:
  using ApiClient::ApiClient;

  ApiResult<std::vector<models::CommunityPost>> listPosts() {
    auto response = sendJson("GET", "/community/posts");
    if (response.isError()) return ApiResult<std::vector<models::CommunityPost>>::err(*response.error());

    return parseResponseEnvelope<std::vector<models::CommunityPost>>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue& data, const models::Pagination&) {
        const auto* posts = data.get("posts");
        const auto* array = posts ? posts->asArray() : nullptr;
        if (!array) {
          return ApiResult<std::vector<models::CommunityPost>>::err(contractError("Community list data must contain posts array."));
        }
        std::vector<models::CommunityPost> decoded;
        decoded.reserve(array->size());
        for (const auto& item : *array) {
          if (!item.isObject()) {
            return ApiResult<std::vector<models::CommunityPost>>::err(contractError("Community post list contains a non-object item."));
          }
          decoded.push_back(decodePost(item));
        }
        return ApiResult<std::vector<models::CommunityPost>>::ok(std::move(decoded));
      }
    );
  }

  ApiResult<models::CommunityPost> getPost(const std::string& postId) {
    auto response = sendJson("GET", "/community/posts/" + postId);
    if (response.isError()) return ApiResult<models::CommunityPost>::err(*response.error());

    return parseResponseEnvelope<models::CommunityPost>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue& data, const models::Pagination&) {
        const auto* post = data.get("post");
        if (!post || !post->isObject()) {
          return ApiResult<models::CommunityPost>::err(contractError("Community post detail data must contain post object."));
        }
        return ApiResult<models::CommunityPost>::ok(decodePost(*post));
      }
    );
  }

  ApiResult<std::vector<models::Comment>> listComments(const std::string& postId) {
    auto response = sendJson("GET", "/community/posts/" + postId + "/comments");
    if (response.isError()) return ApiResult<std::vector<models::Comment>>::err(*response.error());

    return parseResponseEnvelope<std::vector<models::Comment>>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue& data, const models::Pagination&) {
        const auto* comments = data.get("comments");
        const auto* array = comments ? comments->asArray() : nullptr;
        if (!array) {
          return ApiResult<std::vector<models::Comment>>::err(contractError("Community comments data must contain comments array."));
        }
        std::vector<models::Comment> decoded;
        decoded.reserve(array->size());
        for (const auto& item : *array) {
          if (!item.isObject()) {
            return ApiResult<std::vector<models::Comment>>::err(contractError("Community comment list contains a non-object item."));
          }
          decoded.push_back(decodeComment(item));
        }
        return ApiResult<std::vector<models::Comment>>::ok(std::move(decoded));
      }
    );
  }

  ApiResult<models::Comment> createComment(
    const std::string& postId,
    const std::string& message,
    const std::string& visitorToken,
    const std::optional<std::string>& parentId = std::nullopt
  ) {
    std::string body = "{\"message\":\"" + escapeJsonString(message) + "\"";
    if (parentId && !parentId->empty()) {
      body += ",\"parentId\":\"" + escapeJsonString(*parentId) + "\"";
    }
    body += "}";
    auto response = sendJson("POST", "/community/posts/" + postId + "/comments", body, bearerHeaders(visitorToken));
    if (response.isError()) return ApiResult<models::Comment>::err(*response.error());

    return parseResponseEnvelope<models::Comment>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue& data, const models::Pagination&) {
        const auto* comment = data.get("comment");
        if (!comment || !comment->isObject()) {
          return ApiResult<models::Comment>::err(contractError("Community create comment response must contain comment object."));
        }
        return ApiResult<models::Comment>::ok(decodeComment(*comment));
      }
    );
  }

  ApiResult<LikeResult> likeComment(const std::string& commentId, const std::string& visitorToken) {
    auto response = sendJson("POST", "/community/comments/" + commentId + "/like", "{}", bearerHeaders(visitorToken));
    if (response.isError()) return ApiResult<LikeResult>::err(*response.error());

    return parseResponseEnvelope<LikeResult>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue& data, const models::Pagination&) {
        return ApiResult<LikeResult>::ok({
          jsonBool(data, "liked").value_or(false),
          jsonInt(data, "likeCount").value_or(0),
        });
      }
    );
  }

 private:
  static models::CommunityTopic decodeTopic(const std::string& value) {
    if (value == "general") return models::CommunityTopic::General;
    if (value == "showcase") return models::CommunityTopic::Showcase;
    if (value == "help") return models::CommunityTopic::Help;
    if (value == "feedback") return models::CommunityTopic::Feedback;
    return models::CommunityTopic::Unknown;
  }

  static models::CommunityPost decodePost(const JsonValue& value) {
    models::CommunityPost post;
    post.id = jsonString(value, "id").value_or("");
    post.title = jsonString(value, "title").value_or("");
    post.message = jsonString(value, "message").value_or("");
    post.topic = decodeTopic(jsonString(value, "topic").value_or(""));
    post.createdAt = jsonString(value, "createdAt").value_or("");
    post.updatedAt = jsonString(value, "updatedAt").value_or("");
    return post;
  }

  static models::Comment decodeComment(const JsonValue& value) {
    models::Comment comment;
    comment.id = jsonString(value, "id").value_or("");
    comment.postId = jsonString(value, "postId");
    comment.author = jsonString(value, "author").value_or("");
    comment.message = jsonString(value, "message").value_or("");
    comment.parentId = jsonString(value, "parentId");
    comment.likeCount = jsonInt(value, "likeCount");
    comment.liked = jsonBool(value, "liked");
    comment.createdAt = jsonString(value, "createdAt").value_or("");
    comment.updatedAt = jsonString(value, "updatedAt");
    return comment;
  }

  static std::map<std::string, std::string> bearerHeaders(const std::string& visitorToken) {
    if (visitorToken.empty()) return {};
    return {{"Authorization", "Bearer " + visitorToken}};
  }
};

} // namespace mrright::sdk::core
