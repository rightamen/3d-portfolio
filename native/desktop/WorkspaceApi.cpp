#include "Workspace.hpp"
namespace mr {
namespace {
Json data(const Json &j) {
  return j.value("data", Json::object());
}
} // namespace
const char *modeLabel(int mode) {
  const char *names[] = {"library",     "curated",   "mine",     "downloads",
                         "workspace",   "favorites", "messages", "feed",
                         "connections", "profile",   "orders"};
  return names[mode >= 0 && mode <= 10 ? mode : 0];
}
bool canSendMessage(const Json &t) {
  if (!t.is_object() || t.value("blocked", false) ||
      !t.value("peer", Json::object()).value("available", false))
    return false;
  auto status = text(t, "status");
  return status == "active" ||
         (status == "pending" && text(t, "direction") == "outgoing" && t.value("lastSeq", 0) == 0);
}
Json fetchSpace(const Http &http, const std::string &token, const SpaceQuery &q) {
  std::string page = "&limit=20&page=" + std::to_string(q.page), path;
  switch (q.mode) {
  case 4:
    path = "/api/account/analytics?days=" + std::to_string(q.days) + page;
    break;
  case 5: {
    auto r =
        http.json("GET",
                  "/api/account/favorites?" +
                      (q.folder.empty() ? std::string() : "collection=" + encoded(q.folder) + "&") +
                      page.substr(1),
                  token);
    r["data"]["collections"] = data(http.json("GET", "/api/account/collections", token))
                                   .value("collections", Json::array());
    return r;
  }
  case 6:
    path = "/api/account/messages/threads?tab=" + std::string(q.tab ? "requests" : "inbox") + page;
    break;
  case 7: {
    const char *kinds[] = {"", "work", "notice", "post", "resource"};
    path = "/api/account/following-feed?kind=" +
           std::string(kinds[q.tab >= 0 && q.tab < 5 ? q.tab : 0]) + page;
    break;
  }
  case 8: {
    const char *tabs[] = {"friends", "incoming", "following", "followers", "outgoing"};
    if (q.tab == 5) {
      path = "/api/creators?q=" + encoded(q.search) + page;
    } else
      path =
          "/api/account/connections?tab=" + std::string(tabs[q.tab >= 0 && q.tab < 5 ? q.tab : 0]) +
          page;
    break;
  }
  case 9:
    path = "/api/account/profile";
    break;
  case 10:
    path = std::string(q.tab ? "/api/account/sales?" : "/api/account/orders?") + page.substr(1);
    break;
  default:
    throw std::runtime_error("Unknown workspace section");
  }
  auto result = http.json("GET", path, token);
  if (q.mode == 10 && q.tab)
    result["data"]["orders"] = result["data"].value("sales", Json::array());
  return result;
}
} // namespace mr
