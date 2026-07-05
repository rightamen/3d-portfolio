#pragma once

#include "sdk/core/ApiClient.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/models/Comment.hpp"
#include "sdk/models/Project.hpp"

#include <string>
#include <vector>

namespace mrright::sdk::core {

class ProjectClient : public ApiClient {
 public:
  using ApiClient::ApiClient;

  ApiResult<std::vector<models::Project>> listProjects() {
    return notImplemented<std::vector<models::Project>>();
  }

  ApiResult<models::Project> getProject(const std::string& slug) {
    (void)slug;
    return notImplemented<models::Project>();
  }

  ApiResult<std::vector<models::Comment>> listComments(const std::string& slug) {
    (void)slug;
    return notImplemented<std::vector<models::Comment>>();
  }

 private:
  static models::ApiError notImplementedError() {
    return {"CLIENT_NOT_IMPLEMENTED", models::ApiErrorCode::Unknown, "ProjectClient is an interface stub.", 0};
  }

  template <typename T>
  static ApiResult<T> notImplemented() {
    return ApiResult<T>::err(notImplementedError());
  }
};

} // namespace mrright::sdk::core
