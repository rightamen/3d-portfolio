#pragma once

#include <cstdint>
#include <optional>
#include <string>

namespace mrright::sdk::models {

enum class AssetType {
  Image,
  Model,
  Texture,
  File,
  Unknown
};

// Aspirational target model from API_V1_FREEZE_PLAN.md §11.
// No API endpoint returns this complete shape yet; fields that depend on the
// future controlled asset/download work stay optional until the server
// populates them in /api/v1.
struct Asset {
  std::string id;
  AssetType type = AssetType::Unknown;
  std::string url;
  std::optional<std::string> downloadUrl;
  std::optional<std::string> thumbnailUrl;
  std::optional<std::int64_t> fileSize;
  std::optional<std::string> mimeType;
  std::optional<std::string> checksum;
  std::optional<std::string> visibility;
  std::optional<std::string> downloadPolicy;
  std::string createdAt; // ISO-8601 string placeholder.
  std::optional<std::string> version;
  std::optional<std::string> etag;
  std::optional<std::string> expiresAt; // ISO-8601 string placeholder.
};

} // namespace mrright::sdk::models
