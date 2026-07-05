#pragma once

#include <string>

namespace mrright::sdk::models {

enum class AccessLevel {
  Guest,
  Member,
  Approved,
  Unknown
};

struct User {
  std::string id;
  std::string email;
  std::string displayName;
  AccessLevel accessLevel = AccessLevel::Unknown;
  bool emailVerified = false;
  std::string handle;
  std::string avatarUrl;
  std::string bannerUrl;
  std::string bio;
  std::string location;
  std::string website;
  bool profilePublic = false;
  bool activityPublic = false;
  bool profileAdminDisabled = false;
  std::string createdAt; // ISO-8601 string placeholder; chrono parsing is a later SDK decision.
};

} // namespace mrright::sdk::models
