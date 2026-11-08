#pragma once
#include "../common/Resources.hpp"
#include <string>
#include <vector>
namespace mr {
class Catalogue {
  std::string database_;
  std::string execute(const std::string &sql, const std::vector<std::string> &values) const;

public:
  explicit Catalogue(std::string database) : database_(std::move(database)) {}
  std::string list(const Filters &) const;
  std::string detail(const std::string &handle, const std::string &slug) const;
  bool ready() const;
};
} // namespace mr
