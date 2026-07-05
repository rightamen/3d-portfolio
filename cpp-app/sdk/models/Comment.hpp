#pragma once

#include <cstdint>
#include <optional>
#include <string>

namespace mrright::sdk::models {

struct Comment {
  std::string id;
  std::optional<std::string> postId;
  std::optional<std::string> projectSlug;
  std::string author;
  std::string message;
  std::optional<std::string> parentId;
  std::optional<std::int64_t> likeCount;
  std::optional<bool> liked;
  std::string createdAt;                // ISO-8601 string placeholder.
  std::optional<std::string> updatedAt; // ISO-8601 string placeholder.
};

} // namespace mrright::sdk::models
