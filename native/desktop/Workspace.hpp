#pragma once
#include "Http.hpp"
#include <map>
namespace mr {
struct SpaceQuery {
  int mode = 4, tab = 0, page = 1, days = 30;
  std::string folder, search;
};
Json fetchSpace(const Http &, const std::string &, const SpaceQuery &);
bool canSendMessage(const Json &);
const char *modeLabel(int);
struct SpaceState {
  Json data = Json::object(), folders = Json::array(), thread, summary = Json::object(),
       social = Json::object();
  std::map<std::string, std::string> drafts;
  std::string folder, threadId, retryId, retryBody, error;
  int tab = 0, days = 30, threadGeneration = 0;
  bool busy = false, threadLoading = false, polling = false;
  float threadScroll = 0, threadMaxScroll = 0, bodyTop = 190;
  uint64_t visibleSeq = 0, receiptSeq = 0;
};
} // namespace mr
