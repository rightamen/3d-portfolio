#pragma once

#include "sdk/core/ApiResult.hpp"
#include "sdk/core/NlohmannJsonValue.hpp"
#include "sdk/models/Pagination.hpp"

#include <set>
#include <string>
#include <utility>

namespace mrright::sdk::core {

inline models::ApiError contractError(std::string message, int httpStatus = 0) {
  return {"RESPONSE_CONTRACT_ERROR", models::ApiErrorCode::Unknown, std::move(message), httpStatus};
}

inline models::Pagination parsePagination(const JsonValue& value) {
  models::Pagination pagination;
  pagination.page = jsonInt(value, "page");
  pagination.limit = jsonInt(value, "limit");
  pagination.total = jsonInt(value, "total");
  pagination.pages = jsonInt(value, "pages");
  pagination.hasNext = jsonBool(value, "hasNext");
  pagination.hasPrevious = jsonBool(value, "hasPrevious");
  return pagination;
}

inline ApiResult<models::ApiError> parseApiError(const JsonValue& value, int httpStatus) {
  const auto code = jsonString(value, "code");
  const auto message = jsonString(value, "message");
  if (!code || !message) {
    return ApiResult<models::ApiError>::err(contractError("API error must contain string code and message.", httpStatus));
  }

  return ApiResult<models::ApiError>::ok({
    *code,
    models::apiErrorCodeFromString(*code),
    *message,
    httpStatus,
  });
}

template <typename T, typename DecodeData>
ApiResult<T> parseResponseEnvelope(const std::string& body, int httpStatus, DecodeData decodeData) {
  const auto parsed = parseJson(body);
  if (parsed.isError()) return ApiResult<T>::err(*parsed.error());

  const auto* root = parsed.value()->asObject();
  if (!root) return ApiResult<T>::err(contractError("Response body must be a JSON object.", httpStatus));

  const std::set<std::string> allowedKeys = {"data", "pagination", "error"};
  for (const auto& [key, ignored] : *root) {
    (void)ignored;
    if (!allowedKeys.contains(key)) {
      return ApiResult<T>::err(contractError("Response envelope contains a non-v1 top-level key: " + key, httpStatus));
    }
  }

  const auto* data = parsed.value()->get("data");
  const auto* pagination = parsed.value()->get("pagination");
  const auto* error = parsed.value()->get("error");
  if (!data || !pagination || !error) {
    return ApiResult<T>::err(contractError("Response envelope must contain data, pagination, and error.", httpStatus));
  }
  if (!pagination->isObject()) {
    return ApiResult<T>::err(contractError("Response envelope pagination must be an object.", httpStatus));
  }

  if (!error->isNull()) {
    if (!error->isObject()) {
      return ApiResult<T>::err(contractError("Response envelope error must be null or an object.", httpStatus));
    }
    auto parsedError = parseApiError(*error, httpStatus);
    if (parsedError.isError()) return ApiResult<T>::err(*parsedError.error());
    return ApiResult<T>::err(*parsedError.value());
  }

  if (data->isNull()) {
    return ApiResult<T>::err(contractError("Successful response envelope data must not be null.", httpStatus));
  }

  return decodeData(*data, parsePagination(*pagination));
}

} // namespace mrright::sdk::core
