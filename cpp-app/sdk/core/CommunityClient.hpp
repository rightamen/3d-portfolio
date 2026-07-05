#pragma once

#include "sdk/core/ApiClient.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/models/Comment.hpp"
#include "sdk/models/CommunityPost.hpp"

#include <string>
#include <vector>

namespace mrright::sdk::core {

class CommunityClient : public ApiClient {
 public:
  using ApiClient::ApiClient;

  ApiResult<std::vector<models::CommunityPost>> listPosts() {
    return notImplemented<std::vector<models::CommunityPost>>();
  }

  ApiResult<std::vector<models::Comment>> listComments(const std::string& postId) {
    (void)postId;
    return notImplemented<std::vector<models::Comment>>();
  }

 private:
  static models::ApiError notImplementedError() {
    return {"CLIENT_NOT_IMPLEMENTED", models::ApiErrorCode::Unknown, "CommunityClient is an interface stub.", 0};
  }

  template <typename T>
  static ApiResult<T> notImplemented() {
    return ApiResult<T>::err(notImplementedError());
  }
};

} // namespace mrright::sdk::core
