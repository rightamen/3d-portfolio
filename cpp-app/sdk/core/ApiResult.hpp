#pragma once

#include "sdk/models/ApiError.hpp"

#include <optional>
#include <utility>

namespace mrright::sdk::core {

template <typename T>
class ApiResult {
 public:
  static ApiResult ok(T value) {
    ApiResult result;
    result.value_ = std::move(value);
    return result;
  }

  static ApiResult err(models::ApiError error) {
    ApiResult result;
    result.error_ = std::move(error);
    return result;
  }

  [[nodiscard]] bool isOk() const { return value_.has_value(); }
  [[nodiscard]] bool isError() const { return error_.has_value(); }
  [[nodiscard]] const std::optional<T>& value() const { return value_; }
  [[nodiscard]] const std::optional<models::ApiError>& error() const { return error_; }

 private:
  std::optional<T> value_;
  std::optional<models::ApiError> error_;
};

template <>
class ApiResult<void> {
 public:
  static ApiResult ok() {
    ApiResult result;
    result.ok_ = true;
    return result;
  }

  static ApiResult err(models::ApiError error) {
    ApiResult result;
    result.error_ = std::move(error);
    return result;
  }

  [[nodiscard]] bool isOk() const { return ok_; }
  [[nodiscard]] bool isError() const { return error_.has_value(); }
  [[nodiscard]] const std::optional<models::ApiError>& error() const { return error_; }

 private:
  bool ok_ = false;
  std::optional<models::ApiError> error_;
};

} // namespace mrright::sdk::core
