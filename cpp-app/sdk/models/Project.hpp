#pragma once

#include <string>
#include <vector>

namespace mrright::sdk::models {

enum class AssetCategory {
  Generic,
  NextGenProp,
  NextGenCharacter,
  NextGenScene,
  HandPaintedCharacter,
  HandPaintedScene,
  Unknown
};

struct Project {
  std::string slug; // Only stable identifier today; no separate project id is in API v1 yet.
  std::string title;
  std::string titleZh;
  std::string titleEn;
  std::string titleJa;
  std::string summary;
  std::string summaryZh;
  std::string summaryEn;
  std::string summaryJa;
  std::string workflow;
  std::string image;
  std::string modelUrl;
  std::string format;
  std::string modelSize;
  std::string downloadPolicy; // Free text today, not the future frozen enum.
  AssetCategory assetCategory = AssetCategory::Unknown;
  std::vector<std::string> viewerFeatures;
  std::vector<std::string> stack;
  std::string year;
  bool isPublic = false;
};

} // namespace mrright::sdk::models
