#pragma once
#include <array>
#include <charconv>
#include <stdexcept>
#include <string>
#include <string_view>
namespace mr {
inline constexpr std::array<std::string_view, 7> resourceTypes = {
    "model", "image", "video", "audio", "material", "document", "other"};
inline constexpr std::array<std::string_view, 6> modelCategories = {
    "next-gen-prop",          "next-gen-character", "next-gen-scene",
    "hand-painted-character", "hand-painted-scene", "generic"};
inline bool resourceType(std::string_view value) {
  for (auto type : resourceTypes)
    if (type == value)
      return true;
  return false;
}
inline bool category(std::string_view value) {
  for (auto type : modelCategories)
    if (type == value)
      return true;
  return false;
}
inline int integer(std::string_view value, int fallback, int low, int high) {
  if (value.empty())
    return fallback;
  int n = 0;
  auto [p, e] = std::from_chars(value.data(), value.data() + value.size(), n);
  if (e != std::errc{} || p != value.data() + value.size() || n < low || n > high)
    throw std::invalid_argument("Invalid pagination");
  return n;
}
struct Filters {
  std::string type, category, query, creator;
  int page = 1, limit = 24;
  bool exhibition = false;
};
inline void validate(const Filters &f) {
  if (!f.type.empty() && !resourceType(f.type))
    throw std::invalid_argument("Unknown resource type");
  if (!f.category.empty() && !category(f.category))
    throw std::invalid_argument("Unknown model category");
  if (f.query.size() > 480 || f.creator.size() > 60)
    throw std::invalid_argument("Filter too long");
  if (f.limit < 1 || f.limit > 60 || f.page < 1 || f.page > 10000)
    throw std::invalid_argument("Invalid pagination");
}
} // namespace mr
