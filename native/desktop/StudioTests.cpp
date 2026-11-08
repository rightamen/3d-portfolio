#include "App.hpp"
#include <fstream>
namespace mr {
LRESULT CALLBACK procedure(HWND, UINT, WPARAM, LPARAM);
Json studioFixture(const std::filesystem::path &path) {
  std::ifstream input(path);
  auto config = Json::parse(input);
  auto server = text(config, "server");
  if (!server.starts_with("http://127.0.0.1:") ||
      server.substr(17).find_first_not_of("0123456789") != std::string::npos)
    throw std::runtime_error("Studio fixtures require a loopback server");
  return config;
}
Json fixtureLogin(const Http &http, const Json &config, const std::string &prefix) {
  return payload(http.json("POST", "/api/auth/login", "",
                           {{"email", text(config, (prefix + "Email").c_str())},
                            {"password", text(config, (prefix + "Password").c_str())}}));
}
int studioTests(const std::filesystem::path &path, const std::filesystem::path &report) {
  Json result = {{"ok", false}, {"revision", MR_REVISION}};
  int assertions = 0, layoutCases = 0;
  auto check = [&](bool ok, const char *label) {
    ++assertions;
    if (!ok)
      throw std::runtime_error(label);
  };
  std::unique_ptr<App> app;
  try {
    auto config = studioFixture(path);
    Http http(wide(text(config, "server")));
    auto main = payload(
        http.json("POST", "/api/auth/login", "",
                  {{"email", text(config, "email")}, {"password", text(config, "password")}}));
    auto peer = fixtureLogin(http, config, "peer"),
         stranger = fixtureLogin(http, config, "stranger");
    auto token = text(main["session"], "token"), peerToken = text(peer["session"], "token"),
         strangerToken = text(stranger["session"], "token");
    auto get = [&](int mode, int tab = 0) {
      SpaceQuery q;
      q.mode = mode;
      q.tab = tab;
      return payload(fetchSpace(http, token, q));
    };
    check(get(4)["analytics"]["totals"]["works"].get<int>() >= 8, "real creator analytics");
    check(!get(5)["favorites"].empty(), "all favorites omits empty collection filter");
    auto folder = payload(http.json("POST", "/api/account/collections", token,
                                    {{"name", "Native UI 回归收藏夹"}}))["collection"];
    auto folderId = text(folder, "id");
    http.json("PUT", "/api/works/native-peer/native-peer-art/favorite", token, {{"saved", true}});
    http.json("PUT", "/api/account/collections/" + folderId + "/works/native-peer-art", token,
              {{"included", true}});
    SpaceQuery fq;
    fq.mode = 5;
    fq.folder = folderId;
    auto saved = payload(fetchSpace(http, token, fq));
    check(saved["favorites"].size() == 1, "collection filter uses actual memberships");
    check(saved["collections"].size() >= 2, "native collection list");
    http.json("PATCH", "/api/account/collections/" + folderId, token,
              {{"name", "Native renamed 收藏夹"}});
    check(!get(7)["items"].empty(), "following feed returns published peer work");
    auto profile = get(9)["profile"];
    profile["bio"] = "Native profile editing 测试";
    http.json("PUT", "/api/account/profile", token, profile);
    check(text(get(9)["profile"], "bio") == "Native profile editing 测试",
          "native profile editing persists");
    auto relation =
        payload(http.json("PUT", "/api/users/native-peer/friend", token, Json::object()));
    auto relationship = payload(http.json("GET", "/api/users/native-peer/relationship", peerToken));
    // The peer sees the requester via the main handle, not its own handle.
    relationship = payload(http.json("GET", "/api/users/native-creator/relationship", peerToken));
    check(text(relationship["friendship"], "direction") == "incoming", "friend request direction");
    http.json("PATCH", "/api/account/friends/" + text(relationship["friendship"], "id"), peerToken,
              {{"action", "accept"}});
    check(!get(8)["connections"].empty(), "accepted friend appears in connections");
    auto thread = payload(http.json("POST", "/api/account/messages/threads", token,
                                    {{"handle", "native-peer"}}))["thread"];
    auto threadId = text(thread, "id"), threadPath = "/api/account/messages/threads/" + threadId;
    check(canSendMessage(thread), "friends may chat immediately");
    Json outgoing = {{"body", "Native 你好，作品很棒！"},
                     {"clientId", "native-studio-idempotent-001"}};
    auto sent = payload(http.json("POST", threadPath + "/messages", token, outgoing))["message"];
    auto retry = payload(http.json("POST", threadPath + "/messages", token, outgoing))["message"];
    check(text(sent, "id") == text(retry, "id"), "retry cannot duplicate messages");
    http.json("POST", threadPath + "/messages", peerToken,
              {{"body", "谢谢！期待交流创作思路。"}, {"clientId", "native-studio-reply-001"}});
    auto request = payload(http.json("POST", "/api/account/messages/threads", strangerToken,
                                     {{"handle", "native-peer"}}))["thread"];
    auto requestPath = "/api/account/messages/threads/" + text(request, "id");
    check(canSendMessage(request), "outgoing requester may send first message");
    http.json("POST", requestPath + "/messages", strangerToken,
              {{"body", "初次见面，请问可以交流吗？"}, {"clientId", "native-studio-request-001"}});
    auto waiting = payload(http.json("GET", requestPath, strangerToken))["thread"];
    check(!canSendMessage(waiting), "pending request prevents repeated messages");
    bool forbidden = false;
    try {
      http.json("POST", requestPath + "/messages", strangerToken,
                {{"body", "Second"}, {"clientId", "native-studio-request-002"}});
    } catch (const HttpError &e) {
      forbidden = e.status == 403 || e.status == 409;
    }
    check(forbidden, "server enforces pending request limit");
    http.json("PATCH", requestPath, peerToken, {{"action", "accept"}});
    check(canSendMessage(payload(http.json("GET", requestPath, strangerToken))["thread"]),
          "accepted request enables chat");
    for (int i = 0; i < 55; i++)
      http.json("POST", threadPath + "/messages", i % 2 ? peerToken : token,
                {{"body", "历史消息 History " + std::to_string(i)},
                 {"clientId", "native-studio-history-" + std::to_string(i)}});
    check(money(1999, "usd") == L"usd 19.99", "amount display preserves cents");
    check(get(10).contains("orders") && get(10, 1).contains("orders"), "purchase and sales DTOs");
    check(!get(8, 5)["creators"].empty(), "native creator discovery");
    app = std::make_unique<App>(wide(text(config, "server")));
    app->token = token;
    app->loginUser = main["user"];
    app->mode = 4;
    app->prefs.motion = false;
    WNDCLASSW c{};
    c.lpfnWndProc = procedure;
    c.hInstance = GetModuleHandleW(nullptr);
    c.lpszClassName = L"MRStudioWorkspaceTests";
    c.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    RegisterClassW(&c);
    auto window = CreateWindowExW(0, c.lpszClassName, L"Studio isolated tests",
                                  WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN, 0, 0, 1440, 960, nullptr,
                                  nullptr, c.hInstance, app.get());
    check(window != nullptr, "native workspace window");
    auto pump = [&](auto ready) {
      auto deadline = GetTickCount64() + 20000;
      while (!ready()) {
        MSG m{};
        while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE))
          if (m.message != WM_QUIT && !app->translate(m)) {
            TranslateMessage(&m);
            DispatchMessageW(&m);
          }
        if (GetTickCount64() > deadline)
          throw std::runtime_error("workspace wait timed out");
        MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
      }
    };
    pump([&] { return !app->loading; });
    check(app->space.error.empty(), "dashboard loads through native event pipeline");
    app->spaceAction({{}, Action::Tab, 7});
    pump([&] { return !app->loading; });
    check(app->space.days == 7 && app->space.data["analytics"]["days"] == 7,
          "dashboard range updates query");
    for (int mode = 4; mode <= 10; mode++) {
      app->navigate(mode);
      pump([&] { return !app->loading; });
      check(app->space.error.empty(), "workspace section loads");
      if (mode == 5) {
        check(!app->works.empty(), "saved works render in the native library");
        check(GetWindowLongPtrW(app->buttons[206], GWL_STYLE) & WS_VISIBLE,
              "collection selector follows the shared button style");
        check(!(GetWindowLongPtrW(app->folders, GWL_STYLE) & WS_VISIBLE),
              "legacy collection dropdown does not overlap styled selector");
      }
      for (auto size : {SIZE{980, 760}, SIZE{1280, 850}, SIZE{1600, 1000}}) {
        MoveWindow(window, 0, 0, size.cx, size.cy, FALSE);
        for (int theme = 0; theme < 3; theme++)
          for (int lang = 0; lang < 3; lang++) {
            app->prefs.theme = theme;
            app->prefs.language = lang;
            app->preferences();
            app->layout();
            app->paint();
            layoutCases++;
            wchar_t caption[128];
            GetWindowTextW(app->buttons[114], caption, 128);
            check(std::wstring(caption) == app->copy("workspace"),
                  "workspace navigation follows selected language");
            check(app->content > 400, "workspace content remains readable");
            for (int id : {114, 115, 116, 117, 118, 119}) {
              RECT r{};
              GetWindowRect(app->buttons[id], &r);
              POINT p{r.left, r.top};
              ScreenToClient(window, &p);
              check(r.bottom > r.top && p.x >= 0 &&
                        p.x + r.right - r.left <= int(app->nav * app->scale) + 2,
                    "navigation stays inside sidebar");
            }
          }
      }
    }
    app->navigate(5);
    pump([&] { return !app->loading; });
    Event missing;
    missing.operation = Operation::Space;
    missing.generation = app->generation;
    missing.account = app->account;
    missing.sensitive = true;
    missing.value = {{"data",
                      {{"favorites", Json::array({{{"workId", "unavailable-fixture"},
                                                   {"available", false},
                                                   {"work", nullptr}}})},
                       {"collections", Json::array()}}}};
    app->event(missing);
    check(app->works.size() == 1, "unavailable saved entries remain manageable");
    app->select(0);
    app->paint();
    check(!app->detail.value("available", true) && !app->detailLoading,
          "unavailable favorite has a native remove view");
    app->navigate(6);
    pump([&] { return !app->loading; });
    app->loadThread(threadId);
    pump([&] { return !app->space.threadLoading; });
    check(app->space.thread.value("hasOlder", false), "older conversation pages available");
    app->loadThread(threadId, true);
    pump([&] { return !app->space.threadLoading; });
    auto count = app->space.thread["messages"].size();
    check(count > 50, "older messages merge into native conversation");
    app->loadThread(threadId);
    pump([&] { return !app->space.threadLoading; });
    check(app->space.thread["messages"].size() == count, "polling retains loaded history");
    auto incoming = payload(http.json("POST", "/api/account/messages/threads", token,
                                      {{"handle", "native-stranger"}}))["thread"];
    SetWindowTextW(app->composer, L"未发送的会话草稿");
    app->loadThread(text(incoming, "id"));
    pump([&] { return !app->space.threadLoading; });
    check(!IsWindowEnabled(app->composer), "incoming request cannot compose before acceptance");
    app->loadThread(threadId);
    pump([&] { return !app->space.threadLoading; });
    wchar_t draft[128];
    GetWindowTextW(app->composer, draft, 128);
    check(std::wstring(draft) == L"未发送的会话草稿", "switching conversations retains draft");
    check(IsWindowVisible(app->composer) ||
              GetWindowLongPtrW(app->composer, GWL_STYLE) & WS_VISIBLE,
          "native chat composer present");
    SetWindowTextW(app->composer, L"原生输入框发送 · Unicode 🌌\r\n第二行");
    app->sendMessage();
    pump([&] { return !app->space.busy && !app->space.threadLoading; });
    auto messages = payload(http.json("GET", threadPath, peerToken))["messages"];
    check(text(messages.back(), "body").find("原生输入框发送") != std::string::npos,
          "native composer dispatches real Unicode message");
    check(GetWindowTextLengthW(app->composer) == 0, "successful send clears composer");
    auto lastSeq = number(messages.back(), "seq");
    http.json("PUT", threadPath + "/read", peerToken, {{"seq", lastSeq}});
    check(number(payload(http.json("GET", threadPath, token))["thread"], "peerReadSeq") == lastSeq,
          "read receipt persists");
    app->space.threadScroll = 100000;
    app->paint();
    check(app->space.threadScroll <= app->space.threadMaxScroll, "chat history scroll clamps");
    Event old;
    old.operation = Operation::Space;
    old.account = app->account;
    old.sensitive = true;
    old.generation = app->generation;
    old.value = {{"data", {{"profile", {{"bio", "stale"}}}}}};
    app->clearLogin(false);
    app->event(old);
    check(app->token.empty() && app->space.thread.is_null() && app->space.data.empty(),
          "logout clears private data and rejects stale events");
    app->paint();
    http.json("DELETE", "/api/account/collections/" + folderId, token);
    result["ok"] = true;
    DestroyWindow(window);
    app.reset();
  } catch (const std::exception &e) {
    result["error"] = e.what();
    if (app && IsWindow(app->hwnd))
      DestroyWindow(app->hwnd);
    app.reset();
  }
  result["assertions"] = assertions;
  result["layoutCases"] = layoutCases;
  std::ofstream output(report);
  output << result.dump(2);
  return result.value("ok", false) ? 0 : 1;
}
} // namespace mr
