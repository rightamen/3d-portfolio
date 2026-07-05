#pragma once

#include "sdk/models/User.hpp"

#include <cstdint>
#include <map>
#include <optional>
#include <string>

namespace mrright::sdk::models {

struct ContactLink {
  bool isPublic = false;
  std::string url;
  std::string value;
};

struct ProfileStats {
  std::int64_t commentCount = 0;
  std::int64_t downloadRequestCount = 0;
  std::int64_t likeCount = 0;
  std::int64_t postCount = 0;
  std::int64_t uploadCount = 0;
};

struct Profile : User {
  std::map<std::string, ContactLink> contactLinks;
  bool contactsPublic = false;
  std::string publicEmail;
  std::optional<std::string> lastLoginAt; // ISO-8601 string placeholder.
  std::optional<std::string> updatedAt;   // ISO-8601 string placeholder.
  ProfileStats stats;
};

} // namespace mrright::sdk::models
