#pragma once

#include "sdk/models/ApiError.hpp"
#include "sdk/models/Pagination.hpp"

#include <optional>

namespace mrright::sdk::models {

template <typename T>
struct ResponseEnvelope {
  std::optional<T> data;
  Pagination pagination;
  std::optional<ApiError> error;
};

} // namespace mrright::sdk::models
