#pragma once

#include <cstdint>
#include <string>

namespace mrright::sdk::core {

struct LikeResult {
  bool liked = false;
  std::int64_t likeCount = 0;
};

struct ProjectCommentRequest {
  std::string author;
  std::string message;
};

} // namespace mrright::sdk::core
