#pragma once

#include "sdk/core/ApiClient.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/models/Asset.hpp"

#include <string>

namespace mrright::sdk::core {

struct AssetDownloadDescriptor {
  std::string assetId;
  std::string downloadUrl;
  std::string etag;
};

class AssetClient : public ApiClient {
 public:
  using ApiClient::ApiClient;

  ApiResult<models::Asset> getAsset(const std::string& assetId) {
    (void)assetId;
    return notImplemented<models::Asset>();
  }

  ApiResult<AssetDownloadDescriptor> getDownloadDescriptor(
    const std::string& assetId,
    const std::string& visitorToken
  ) {
    (void)assetId;
    (void)visitorToken;
    return notImplemented<AssetDownloadDescriptor>();
  }

 private:
  static models::ApiError notImplementedError() {
    return {"CLIENT_NOT_IMPLEMENTED", models::ApiErrorCode::Unknown, "AssetClient is an interface stub.", 0};
  }

  template <typename T>
  static ApiResult<T> notImplemented() {
    return ApiResult<T>::err(notImplementedError());
  }
};

} // namespace mrright::sdk::core
