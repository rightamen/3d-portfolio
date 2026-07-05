#pragma once

#include "sdk/core/ApiClient.hpp"
#include "sdk/core/ApiResult.hpp"
#include "sdk/core/EnvelopeParser.hpp"
#include "sdk/core/JsonValue.hpp"
#include "sdk/models/Comment.hpp"
#include "sdk/models/Project.hpp"

#include <string>
#include <vector>

namespace mrright::sdk::core {

class ProjectClient : public ApiClient {
 public:
  using ApiClient::ApiClient;

  ApiResult<std::vector<models::Project>> listProjects() {
    auto response = sendJson("GET", "/projects");
    if (response.isError()) return ApiResult<std::vector<models::Project>>::err(*response.error());

    return parseResponseEnvelope<std::vector<models::Project>>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue& data, const models::Pagination&) {
        const auto* projects = data.get("projects");
        const auto* array = projects ? projects->asArray() : nullptr;
        if (!array) {
          return ApiResult<std::vector<models::Project>>::err(contractError("Project list data must contain projects array."));
        }

        std::vector<models::Project> decoded;
        decoded.reserve(array->size());
        for (const auto& item : *array) {
          if (!item.isObject()) {
            return ApiResult<std::vector<models::Project>>::err(contractError("Project list contains a non-object item."));
          }
          decoded.push_back(decodeProject(item));
        }
        return ApiResult<std::vector<models::Project>>::ok(std::move(decoded));
      }
    );
  }

  ApiResult<models::Project> getProject(const std::string& slug) {
    auto response = sendJson("GET", "/projects/" + slug);
    if (response.isError()) return ApiResult<models::Project>::err(*response.error());

    return parseResponseEnvelope<models::Project>(
      response.value()->body,
      response.value()->statusCode,
      [](const JsonValue& data, const models::Pagination&) {
        const auto* project = data.get("project");
        if (!project || !project->isObject()) {
          return ApiResult<models::Project>::err(contractError("Project detail data must contain project object."));
        }
        return ApiResult<models::Project>::ok(decodeProject(*project));
      }
    );
  }

  ApiResult<std::vector<models::Comment>> listComments(const std::string& slug) {
    (void)slug;
    return notImplemented<std::vector<models::Comment>>();
  }

 private:
  static models::ApiError notImplementedError() {
    return {"CLIENT_NOT_IMPLEMENTED", models::ApiErrorCode::Unknown, "ProjectClient method is not implemented in this batch.", 0};
  }

  template <typename T>
  static ApiResult<T> notImplemented() {
    return ApiResult<T>::err(notImplementedError());
  }

  static models::AssetCategory decodeAssetCategory(const std::string& value) {
    if (value == "generic") return models::AssetCategory::Generic;
    if (value == "next-gen-prop") return models::AssetCategory::NextGenProp;
    if (value == "next-gen-character") return models::AssetCategory::NextGenCharacter;
    if (value == "next-gen-scene") return models::AssetCategory::NextGenScene;
    if (value == "hand-painted-character") return models::AssetCategory::HandPaintedCharacter;
    if (value == "hand-painted-scene") return models::AssetCategory::HandPaintedScene;
    return models::AssetCategory::Unknown;
  }

  static std::vector<std::string> decodeStringArray(const JsonValue& object, std::string_view key) {
    std::vector<std::string> values;
    const auto* child = object.get(key);
    const auto* array = child ? child->asArray() : nullptr;
    if (!array) return values;
    for (const auto& item : *array) {
      if (const auto* value = item.asString()) values.push_back(*value);
    }
    return values;
  }

  static models::Project decodeProject(const JsonValue& value) {
    models::Project project;
    project.slug = jsonString(value, "slug").value_or("");
    project.title = jsonString(value, "title").value_or("");
    project.titleZh = jsonString(value, "titleZh").value_or("");
    project.titleEn = jsonString(value, "titleEn").value_or("");
    project.titleJa = jsonString(value, "titleJa").value_or("");
    project.summary = jsonString(value, "summary").value_or("");
    project.summaryZh = jsonString(value, "summaryZh").value_or("");
    project.summaryEn = jsonString(value, "summaryEn").value_or("");
    project.summaryJa = jsonString(value, "summaryJa").value_or("");
    project.workflow = jsonString(value, "workflow").value_or("");
    project.image = jsonString(value, "image").value_or("");
    project.modelUrl = jsonString(value, "modelUrl").value_or("");
    project.format = jsonString(value, "format").value_or("");
    project.modelSize = jsonString(value, "modelSize").value_or("");
    project.downloadPolicy = jsonString(value, "downloadPolicy").value_or("");
    project.assetCategory = decodeAssetCategory(jsonString(value, "assetCategory").value_or(""));
    project.viewerFeatures = decodeStringArray(value, "viewerFeatures");
    project.stack = decodeStringArray(value, "stack");
    project.year = jsonString(value, "year").value_or("");
    project.isPublic = jsonBool(value, "isPublic").value_or(false);
    return project;
  }
};

} // namespace mrright::sdk::core
