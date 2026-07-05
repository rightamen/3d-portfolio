#pragma once

#include <string>

namespace mrright::sdk::models {

enum class CommunityTopic {
  General,
  Showcase,
  Help,
  Feedback,
  Unknown
};

struct CommunityPost {
  std::string id;
  std::string title;
  std::string message;
  CommunityTopic topic = CommunityTopic::Unknown;
  std::string createdAt; // ISO-8601 string placeholder.
  std::string updatedAt; // ISO-8601 string placeholder.
};

} // namespace mrright::sdk::models
