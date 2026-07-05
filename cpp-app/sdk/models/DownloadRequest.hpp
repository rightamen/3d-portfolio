#pragma once

#include "sdk/models/User.hpp"

#include <string>

namespace mrright::sdk::models {

enum class DownloadRequestStatus {
  Pending,
  Approved,
  Rejected,
  Unknown
};

struct DownloadRequest {
  std::string id;
  DownloadRequestStatus status = DownloadRequestStatus::Unknown;
  std::string projectSlug;
  std::string projectTitle;
  std::string purpose;
  AccessLevel visitorAccessLevel = AccessLevel::Unknown;
  std::string createdAt; // ISO-8601 string placeholder.
};

} // namespace mrright::sdk::models
