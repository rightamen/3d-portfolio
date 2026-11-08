#include "App.hpp"
#include <algorithm>
namespace mr {
namespace {
std::string inputValue(HWND edit) {
  int n = GetWindowTextLengthW(edit);
  std::wstring s(n + 1, 0);
  GetWindowTextW(edit, s.data(), n + 1);
  s.resize(n);
  return utf8(s);
}
std::string workPath(const Json &w) {
  return "/api/works/" + encoded(text(w.value("creator", Json::object()), "handle")) + "/" +
         encoded(text(w, "slug"));
}
} // namespace
void App::navigate(int destination) {
  if (destination == -1) {
    signIn();
    return;
  }
  if (destination == 101) {
    button(101);
    return;
  }
  if (destination == 103) {
    button(103);
    return;
  }
  if (!space.threadId.empty())
    space.drafts[space.threadId] = inputValue(composer);
  exhibitionFocus = false;
  if (destination == 1 || destination == 11 || destination == 12)
    type.clear();
  mode = destination;
  query.clear();
  SetWindowTextW(search, L"");
  KillTimer(hwnd, 1);
  page = 1;
  scroll = 0;
  wall = false;
  subject.clear();
  space.tab = 0;
  space.folder.clear();
  space.thread = nullptr;
  space.threadId.clear();
  space.threadLoading = false;
  space.threadGeneration++;
  space.error.clear();
  SetWindowTextW(composer, L"");
  SetWindowTextW(buttons[107], copy("wall").c_str());
  load();
}
void App::loadSpace() {
  space.data = Json::object();
  space.error.clear();
  loading = false;
  if (token.empty() && !(mode == 8 && space.tab == 5)) {
    lastError = "notSigned";
    layout();
    return;
  }
  loading = true;
  auto client = http;
  auto auth = token;
  SpaceQuery q{mode, space.tab, page, space.days, space.folder, query};
  dispatch(io, hwnd, Operation::Space, generation, account, true,
           [=](Event &e) { e.value = fetchSpace(client, auth, q); });
  layout();
}
void App::mutate(const std::string &method, const std::string &path, const Json &body,
                 const std::string &key) {
  if (space.busy)
    return;
  if (token.empty()) {
    signIn();
    return;
  }
  space.busy = true;
  space.error.clear();
  auto client = http;
  auto auth = token;
  auto thread = space.threadId;
  dispatch(io, hwnd, Operation::Mutation, generation, account, true, [=](Event &e) {
    e.key = key;
    e.value = client.json(method, path, auth, body);
    if (key == "send")
      e.value["studioThreadId"] = thread;
  });
  repaint();
}
void App::loadRelationship() {
  if (token.empty() || !detail.is_object())
    return;
  space.social = Json::object();
  auto client = http;
  auto auth = token;
  auto w = detail;
  dispatch(io, hwnd, Operation::Relationship, detailGen, account, true, [=](Event &e) {
    Json social = Json::object();
    auto handle = mr::text(w.value("creator", Json::object()), "handle");
    if (!handle.empty())
      try {
        social =
            payload(client.json("GET", "/api/users/" + encoded(handle) + "/relationship", auth));
      } catch (const HttpError &x) {
        if (x.status == 401)
          throw;
      }
    if (!mr::text(w, "id").empty())
      try {
        social["saved"] =
            payload(client.json("GET", workPath(w) + "/favorite", auth)).value("saved", false);
      } catch (const HttpError &x) {
        if (x.status == 401)
          throw;
      }
    e.value = std::move(social);
  });
}
void App::loadThread(const std::string &id, bool older) {
  if (id.empty() || token.empty() || space.threadLoading)
    return;
  if (id != space.threadId) {
    if (!space.threadId.empty())
      space.drafts[space.threadId] = inputValue(composer);
    space.thread = nullptr;
    space.threadId = id;
    space.threadScroll = 0;
    space.visibleSeq = space.receiptSeq = 0;
    space.retryId.clear();
    space.retryBody.clear();
    SetWindowTextW(composer, wide(space.drafts[id]).c_str());
  }
  space.threadLoading = true;
  int gen = ++space.threadGeneration;
  auto client = http;
  auto auth = token;
  std::string path = "/api/account/messages/threads/" + encoded(id);
  if (older && space.thread.is_object()) {
    auto list = space.thread.value("messages", Json::array());
    if (!list.empty())
      path += "?before=" + std::to_string(number(list.front(), "seq"));
  }
  dispatch(io, hwnd, Operation::Conversation, gen, account, true, [=](Event &e) {
    e.key = older ? "older" : "latest";
    e.value = client.json("GET", path, auth);
  });
  layout();
}
void App::sendMessage() {
  if (space.busy || !space.thread.is_object() ||
      !canSendMessage(space.thread.value("thread", Json::object())))
    return;
  auto body = inputValue(composer);
  if (body.find_first_not_of(" \r\n\t") == std::string::npos)
    return;
  if (space.retryId.empty() || body != space.retryBody) {
    space.retryId = uniqueName();
    space.retryBody = body;
  }
  mutate("POST", "/api/account/messages/threads/" + encoded(space.threadId) + "/messages",
         {{"body", body}, {"clientId", space.retryId}}, "send");
  layout();
}
void App::spaceTimer() {
  if (token.empty() || space.polling || !IsWindowVisible(hwnd) || !IsWindowEnabled(hwnd) ||
      IsIconic(hwnd))
    return;
  auto client = http;
  auto auth = token;
  space.polling = true;
  dispatch(io, hwnd, Operation::Summary, 0, account, true, [=](Event &e) {
    e.value = client.json("GET", "/api/account/communication/summary", auth);
  });
  if (mode == 6 && space.thread.is_object() && space.visibleSeq > space.receiptSeq &&
      GetForegroundWindow() == hwnd && space.threadScroll <= 0) {
    auto seq = space.visibleSeq;
    space.receiptSeq = seq;
    auto id = space.threadId;
    auto path = "/api/account/messages/threads/" + encoded(id) + "/read";
    dispatch(io, hwnd, Operation::Receipt, space.threadGeneration, account, true, [=](Event &e) {
      e.key = id;
      e.value = client.json("PUT", path, auth, {{"seq", seq}});
    });
  }
  if (mode == 6 && !space.threadId.empty() && !space.threadLoading && !space.busy &&
      space.threadScroll <= 0)
    loadThread(space.threadId);
}
bool App::spaceEvent(Event &e) {
  if (e.operation == Operation::Receipt) {
    if (!e.ok && e.key == space.threadId)
      space.receiptSeq = 0;
    return true;
  }
  if (e.operation == Operation::Summary) {
    space.polling = false;
    if (e.ok)
      space.summary = payload(e.value);
    else if (e.status == 401)
      clearLogin(false);
    InvalidateRect(buttons[116], nullptr, FALSE);
    InvalidateRect(buttons[117], nullptr, FALSE);
    repaint();
    return true;
  }
  if (e.operation == Operation::Relationship) {
    if (e.generation == detailGen) {
      if (e.ok)
        space.social = e.value;
      else if (e.status == 401)
        clearLogin(false);
      repaint();
    }
    return true;
  }
  if (e.operation == Operation::Space) {
    if (e.generation != generation)
      return true;
    loading = false;
    if (!e.ok) {
      space.error = "offline";
      if (e.status == 401) {
        clearLogin(false);
        lastError = "notSigned";
      }
      layout();
      return true;
    }
    space.data = payload(e.value);
    pagination = e.value.value("pagination", Json::object());
    if (mode == 4)
      works = space.data.value("analytics", Json::object()).value("works", Json::array());
    if (mode == 5) {
      space.folders = space.data.value("collections", Json::array());
      works = Json::array();
      for (auto &f : space.data.value("favorites", Json::array()))
        if (f.value("available", false) && f["work"].is_object())
          works.push_back(f["work"]);
        else
          works.push_back({{"id", mr::text(f, "workId")},
                           {"available", false},
                           {"title", utf8(copy("unavailable"))},
                           {"resourceType", "other"},
                           {"creator", Json::object()}});
    }
    layout();
    return true;
  }
  if (e.operation == Operation::Conversation) {
    if (e.generation != space.threadGeneration)
      return true;
    space.threadLoading = false;
    if (!e.ok) {
      space.error = "offline";
      if (e.status == 401)
        clearLogin(false);
      layout();
      return true;
    }
    auto received = payload(e.value);
    if (space.thread.is_object()) {
      auto prior = space.thread.value("messages", Json::array());
      auto fresh = received.value("messages", Json::array());
      auto merged = Json::array();
      for (auto &m : prior) {
        bool exists = false;
        for (auto &n : fresh)
          if (number(m, "seq") == number(n, "seq"))
            exists = true;
        if (!exists)
          merged.push_back(m);
      }
      for (auto &m : fresh)
        merged.push_back(m);
      std::sort(merged.begin(), merged.end(),
                [](const Json &a, const Json &b) { return number(a, "seq") < number(b, "seq"); });
      received["messages"] = std::move(merged);
      if (e.key != "older" && !prior.empty() && !fresh.empty() &&
          number(prior.front(), "seq") < number(fresh.front(), "seq"))
        received["hasOlder"] = space.thread.value("hasOlder", false);
    }
    space.thread = std::move(received);
    space.error.clear();
    layout();
    return true;
  }
  if (e.operation != Operation::Mutation)
    return false;
  space.busy = false;
  if (e.generation != generation) {
    layout();
    return true;
  }
  if (!e.ok) {
    space.error = e.status == 403 ? "notAllowed" : e.status == 429 ? "slowDown" : "operationFailed";
    if (e.status == 401)
      clearLogin(false);
    layout();
    return true;
  }
  auto d = payload(e.value);
  if (e.key == "openChat") {
    auto thread = d.value("thread", Json::object());
    mode = 6;
    space.tab = 0;
    space.threadId.clear();
    space.thread = nullptr;
    page = 1;
    generation++;
    clearSelection();
    loadSpace();
    loadThread(mr::text(thread, "id"));
  } else if (e.key == "chooseFolders") {
    if (mr::text(d.value("target", Json::object()), "id") != mr::text(detail, "id"))
      return true;
    auto list = d.value("collections", Json::array());
    space.folders = list;
    std::vector<std::wstring> names;
    auto memberships = d.value("memberships", Json::array());
    for (auto &f : list) {
      bool included = false;
      for (auto &m : memberships)
        if (mr::text(m, "id") == mr::text(f, "id"))
          included = m.value("included", false);
      names.push_back(std::wstring(included ? L"−  " : L"+  ") + wide(mr::text(f, "name")));
    }
    if (names.empty()) {
      space.error = "noCollections";
    } else {
      auto selected = choiceDialog(hwnd, prefs.language, prefs.theme, "organize", names);
      if (selected) {
        auto target = detail;
        auto folderId = mr::text(list[*selected], "id");
        bool included = false;
        for (auto &m : memberships)
          if (mr::text(m, "id") == folderId)
            included = m.value("included", false);
        auto client = http;
        auto auth = token;
        space.busy = true;
        dispatch(io, hwnd, Operation::Mutation, generation, account, true, [=](Event &result) {
          result.key = "favorite";
          client.json("PUT", workPath(target) + "/favorite", auth, {{"saved", true}});
          result.value = client.json("PUT",
                                     "/api/account/collections/" + encoded(folderId) + "/works/" +
                                         encoded(mr::text(target, "id")),
                                     auth, {{"included", !included}});
        });
      }
    }
  } else if (e.key == "send") {
    auto sentThread = mr::text(e.value, "studioThreadId");
    space.drafts.erase(sentThread);
    if (sentThread != space.threadId) {
      layout();
      return true;
    }
    space.threadScroll = 0;
    space.retryId.clear();
    space.retryBody.clear();
    SetWindowTextW(composer, L"");
    if (space.thread.is_object() && d.contains("message")) {
      auto &messages = space.thread["messages"];
      if (!messages.is_array())
        messages = Json::array();
      auto id = mr::text(d["message"], "id");
      if (std::none_of(messages.begin(), messages.end(),
                       [&](const Json &m) { return mr::text(m, "id") == id; }))
        messages.push_back(d["message"]);
    }
    if (mode == 6)
      loadThread(space.threadId);
  } else if (e.key == "threadChange") {
    if (mode == 6)
      loadThread(space.threadId);
  } else if (e.key == "relationship" || e.key == "favorite") {
    if (!detail.is_null())
      loadRelationship();
    if (mode == 5 || mode == 12)
      load();
  } else if (e.key == "profile") {
    loginUser["displayName"] =
        d.value("profile", Json::object()).value("displayName", mr::text(loginUser, "displayName"));
    loginUser["handle"] =
        d.value("profile", Json::object()).value("handle", mr::text(loginUser, "handle"));
    load();
  } else if (e.key == "work") {
    if (mode == 2)
      load();
  } else if (e.key == "report") {
    space.error = "reportSent";
  } else {
    load();
  }
  spaceTimer();
  layout();
  return true;
}
void App::editProfile() {
  auto profile = space.data.value("profile", Json::object());
  if (profile.empty())
    return;
  auto result = textDialog(hwnd, prefs.language, prefs.theme, "editProfile",
                           {{"displayName", mr::text(profile, "displayName"), 40},
                            {"handle", mr::text(profile, "handle"), 30},
                            {"bio", mr::text(profile, "bio"), 300, true},
                            {"location", mr::text(profile, "location"), 120}});
  if (!result)
    return;
  profile["displayName"] = (*result)[0];
  profile["handle"] = (*result)[1];
  profile["bio"] = (*result)[2];
  profile["location"] = (*result)[3];
  mutate("PUT", "/api/account/profile", profile, "profile");
}
void App::editWork() {
  if ((mode != 2 && mode != 4) || !detail.is_object())
    return;
  auto result = textDialog(hwnd, prefs.language, prefs.theme, "editWork",
                           {{"title", mr::text(detail, "title"), 160},
                            {"summary", mr::text(detail, "summary"), 2000, true},
                            {"format", mr::text(detail, "format"), 160}});
  if (result)
    mutate("PATCH", "/api/account/works/" + encoded(mr::text(detail, "id")),
           {{"title", (*result)[0]}, {"summary", (*result)[1]}, {"format", (*result)[2]}}, "work");
}
void App::spaceAction(Hit hit) {
  if (space.busy && hit.action != Action::Navigate && hit.action != Action::Thread &&
      hit.action != Action::Tab && hit.action != Action::Person && hit.action != Action::FeedItem)
    return;
  auto items = space.data.value(mode == 6   ? "threads"
                                : mode == 7 ? "items"
                                : mode == 8 ? (space.tab == 5 ? "creators" : "connections")
                                            : "orders",
                                Json::array());
  auto item =
      hit.index >= 0 && size_t(hit.index) < items.size() ? items[hit.index] : Json::object();
  auto creator = detail.is_object() ? detail.value("creator", Json::object())
                 : mode == 12       ? portfolio
                                    : Json::object();
  auto handle = mr::text(creator, "handle");
  switch (hit.action) {
  case Action::Navigate:
    navigate(hit.index);
    break;
  case Action::Tab:
    if (mode == 4)
      space.days = hit.index;
    else
      space.tab = hit.index;
    page = 1;
    load();
    break;
  case Action::NewMessage: {
    auto r = textDialog(hwnd, prefs.language, prefs.theme, "newMessage", {{"handle", "", 30}});
    if (r)
      mutate("POST", "/api/account/messages/threads", {{"handle", r->front()}}, "openChat");
    break;
  }
  case Action::Thread:
    loadThread(mr::text(item, "id"));
    break;
  case Action::SendMessage:
    sendMessage();
    break;
  case Action::OlderMessages:
    loadThread(space.threadId, true);
    break;
  case Action::BlockMessage: {
    auto thread = space.thread.value("thread", Json::object());
    mutate("PATCH", "/api/account/messages/threads/" + encoded(space.threadId),
           {{"action", thread.value("blockedByMe", false) ? "unblock" : "block"}}, "threadChange");
    break;
  }
  case Action::AcceptMessage:
  case Action::DeclineMessage:
    mutate("PATCH", "/api/account/messages/threads/" + encoded(space.threadId),
           {{"action", hit.action == Action::AcceptMessage ? "accept" : "decline"}},
           "threadChange");
    break;
  case Action::FolderNew:
  case Action::FolderRename: {
    Json folder;
    for (auto &f : space.folders)
      if (mr::text(f, "id") == space.folder)
        folder = f;
    auto r = textDialog(hwnd, prefs.language, prefs.theme, "folderName",
                        {{"folderName", mr::text(folder, "name"), 50},
                         {"description", mr::text(folder, "description"), 300, true}});
    if (r)
      mutate(hit.action == Action::FolderNew ? "POST" : "PATCH",
             "/api/account/collections" +
                 (hit.action == Action::FolderNew ? "" : "/" + encoded(space.folder)),
             {{"name", (*r)[0]}, {"description", (*r)[1]}}, "folder");
    break;
  }
  case Action::FolderDelete:
    if (!space.folder.empty() &&
        MessageBoxW(hwnd, copy("deleteFolderQuestion").c_str(), copy("favorites").c_str(),
                    MB_YESNO | MB_ICONQUESTION) == IDYES) {
      auto id = space.folder;
      space.folder.clear();
      mutate("DELETE", "/api/account/collections/" + encoded(id), nullptr, "folder");
    }
    break;
  case Action::FolderChoose: {
    if (token.empty()) {
      signIn();
      break;
    }
    auto client = http;
    auto auth = token;
    auto target = detail;
    space.busy = true;
    dispatch(io, hwnd, Operation::Mutation, generation, account, true, [=](Event &e) {
      e.key = "chooseFolders";
      e.value = client.json("GET", "/api/account/collections", auth);
      e.value["data"]["target"] = target;
      e.value["data"]["memberships"] =
          payload(client.json("GET",
                              "/api/account/favorites/" + encoded(mr::text(target, "id")) +
                                  "/collections",
                              auth))
              .value("memberships", Json::array());
    });
    break;
  }
  case Action::Favorite:
    if (token.empty()) {
      signIn();
      break;
    }
    if (space.social.value("saved", false))
      mutate("DELETE", "/api/account/favorites/" + encoded(mr::text(detail, "id")), nullptr,
             "favorite");
    else
      mutate("PUT", workPath(detail) + "/favorite", {{"saved", true}}, "favorite");
    break;
  case Action::Follow:
    mutate("PUT", "/api/users/" + encoded(handle) + "/follow",
           {{"following", !space.social.value("following", false)}}, "relationship");
    break;
  case Action::Friend: {
    auto f = space.social.value("friendship", Json::object());
    if (f.is_object() && mr::text(f, "status") == "accepted") {
      if (MessageBoxW(hwnd, copy("removeFriendQuestion").c_str(), copy("connections").c_str(),
                      MB_YESNO | MB_ICONQUESTION) == IDYES)
        mutate("PATCH", "/api/account/friends/" + encoded(mr::text(f, "id")),
               {{"action", "remove"}}, "relationship");
    } else if (f.is_object() && mr::text(f, "status") == "pending" &&
               mr::text(f, "direction") == "outgoing")
      mutate("PATCH", "/api/account/friends/" + encoded(mr::text(f, "id")), {{"action", "cancel"}},
             "relationship");
    else if (f.is_object() && mr::text(f, "direction") == "incoming")
      mutate("PATCH", "/api/account/friends/" + encoded(mr::text(f, "id")), {{"action", "accept"}},
             "relationship");
    else
      mutate("PUT", "/api/users/" + encoded(handle) + "/friend", Json::object(), "relationship");
    break;
  }
  case Action::Chat:
    mutate("POST", "/api/account/messages/threads", {{"handle", handle}}, "openChat");
    break;
  case Action::Person: {
    auto p = space.tab == 5 ? item : item.value("user", Json::object());
    auto name = mr::text(p, "handle");
    if (name.empty())
      break;
    openPortfolio(name);
    break;
  }
  case Action::FriendAccept:
  case Action::FriendDecline:
  case Action::FriendCancel: {
    auto id = mr::text(item, "id");
    auto action = hit.action == Action::FriendAccept    ? "accept"
                  : hit.action == Action::FriendDecline ? "decline"
                                                        : "cancel";
    mutate("PATCH", "/api/account/friends/" + encoded(id), {{"action", action}}, "connections");
    break;
  }
  case Action::EditProfile:
    editProfile();
    break;
  case Action::EditWork:
    editWork();
    break;
  case Action::ReviewWork:
    mutate("PATCH", "/api/account/works/" + encoded(mr::text(detail, "id")) + "/status",
           {{"status", "review"}}, "work");
    break;
  case Action::FeedItem: {
    auto url = mr::text(item, "url");
    if (mr::text(item, "kind") == "work" && url.rfind("/w/", 0) == 0) {
      auto path = "/api/native/v1/works/" + url.substr(3);
      auto client = http;
      detail = nullptr;
      detailLoading = true;
      dispatch(io, hwnd, Operation::Detail, ++detailGen, account, false,
               [=](Event &e) { e.value = client.json("GET", path); });
    } else {
      detail = {{"title", mr::text(item, "title", copy("feed").empty() ? "" : "Update")},
                {"summary", mr::text(item, "body")},
                {"resourceType", "image"},
                {"image", mr::text(item, "image")},
                {"creator", item.value("author", Json::object())},
                {"assets", Json::array()}};
      detailGen++;
    }
    layout();
    break;
  }
  case Action::ReadFeed: {
    Json keys = Json::array();
    for (auto &i : items)
      keys.push_back({{"kind", mr::text(i, "kind")}, {"id", mr::text(i, "id")}});
    if (!keys.empty())
      mutate("PUT", "/api/account/following-feed/read", {{"items", keys}}, "feed");
    break;
  }
  case Action::Report: {
    auto result =
        textDialog(hwnd, prefs.language, prefs.theme, "report", {{"description", "", 2000, true}});
    if (result)
      mutate("POST", "/api/reports",
             {{"targetType", "work"},
              {"targetId", mr::text(detail, "id")},
              {"reason", "other"},
              {"details", result->front()}},
             "report");
    break;
  }
  case Action::OrderItem: {
    auto r = item;
    auto body = mr::text(r, "status") + "\n" +
                utf8(money(number(r, "amountCents"), mr::text(r, "currency")));
    MessageBoxW(hwnd, wide(body).c_str(), copy("orders").c_str(), MB_OK);
    break;
  }
  default:
    break;
  }
}
} // namespace mr
