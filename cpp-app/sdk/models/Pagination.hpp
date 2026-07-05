#pragma once

#include <cstdint>
#include <optional>

namespace mrright::sdk::models {

struct Pagination {
  std::optional<std::int64_t> page;
  std::optional<std::int64_t> limit;
  std::optional<std::int64_t> total;
  std::optional<std::int64_t> pages;
  std::optional<bool> hasNext;
  std::optional<bool> hasPrevious;
};

} // namespace mrright::sdk::models
