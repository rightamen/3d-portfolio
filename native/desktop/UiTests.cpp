#include "App.hpp"
#include <algorithm>
#include <commctrl.h>
#include <fstream>
namespace mr {
LRESULT CALLBACK procedure(HWND, UINT, WPARAM, LPARAM);
int uiTests(const std::wstring &server, const std::filesystem::path &report) {
  Json result = {{"ok", false}, {"revision", MR_REVISION}};
  int assertions = 0;
  auto check = [&](bool ok, const char *label) {
    ++assertions;
    if (!ok)
      throw std::runtime_error(label);
  };
  App app(server);
  try {
    WNDCLASSW c{};
    c.lpfnWndProc = procedure;
    c.hInstance = GetModuleHandleW(nullptr);
    c.lpszClassName = L"MRStudioRegression";
    c.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    RegisterClassW(&c);
    auto window = CreateWindowExW(0, c.lpszClassName, L"Studio regression", WS_OVERLAPPEDWINDOW, 0,
                                  0, 1280, 850, nullptr, nullptr, c.hInstance, &app);
    check(window != nullptr, "create native window");
    auto pump = [&](auto ready) {
      auto deadline = GetTickCount64() + 20000;
      while (!ready()) {
        MSG m{};
        while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) {
          if (m.message != WM_QUIT && !app.translate(m)) {
            TranslateMessage(&m);
            DispatchMessageW(&m);
          }
        }
        if (GetTickCount64() > deadline)
          throw std::runtime_error("UI wait timed out");
        MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
      }
    };
    pump([&] { return !app.loading; });
    check(!app.works.empty(), "real catalogue loads");
    Event failed;
    failed.operation = Operation::Detail;
    failed.generation = app.detailGen;
    failed.ok = false;
    failed.status = 503;
    app.selectedIndex = 0;
    app.detailLoading = true;
    app.event(failed);
    app.paint();
    check(!app.works.empty() && app.lastError.empty() && app.aside > 0,
          "detail failure preserves the catalogue");
    check(std::any_of(app.hits.begin(), app.hits.end(),
                      [](const Hit &h) { return h.action == Action::RetryDetail; }),
          "failed detail offers a retry action");
    check(std::any_of(app.hits.begin(), app.hits.end(),
                      [](const Hit &h) { return h.action == Action::Card; }),
          "failed detail leaves catalogue cards interactive");
    app.clearSelection();
    app.cppReady = true;
    app.healthPending = true;
    Event unavailable;
    unavailable.operation = Operation::Health;
    unavailable.key = "catalogue";
    unavailable.generation = app.generation;
    unavailable.ok = false;
    app.event(unavailable);
    check(!app.cppReady && !app.healthPending,
          "failed health check shows offline instead of connecting forever");
    Event staleHealth;
    staleHealth.operation = Operation::Health;
    staleHealth.key = "catalogue";
    staleHealth.generation = app.generation - 1;
    staleHealth.value = {{"runtime", "cpp20"}};
    app.event(staleHealth);
    check(!app.cppReady, "stale health success does not replace current network status");
    staleHealth.generation = app.generation;
    app.event(staleHealth);
    check(app.cppReady, "successful refresh restores connection status");

    app.wall = true;
    app.mode = 0;
    app.tracking = true;
    app.prefs.motion = true;
    app.mouse = {LONG((app.nav + app.content / 2) * app.scale),
                 LONG(((app.gridTop + app.height - 65) / 2) * app.scale)};
    ValidateRect(window, nullptr);
    auto initialX = app.worldX, initialY = app.worldY;
    app.message(WM_TIMER, 2, 0);
    check(app.worldX == initialX && app.worldY == initialY &&
              !GetUpdateRect(window, nullptr, FALSE),
          "wall at rest does not repaint");
    app.mouse.x = LONG((app.nav + 40) * app.scale);
    app.message(WM_TIMER, 2, 0);
    check(app.worldX != initialX, "wall still follows pointer away from center");
    app.prefs.motion = false;
    initialX = app.worldX;
    initialY = app.worldY;
    app.message(WM_TIMER, 2, 0);
    check(app.worldX == initialX && app.worldY == initialY,
          "motion preference stops automatic panning");
    app.wall = false;
    app.tracking = false;
    app.prefs.motion = true;
    app.type = "model";
    app.subject = std::string(modelCategories[0]);
    app.query = "Native";
    for (int language = 0; language < 3; ++language)
      for (int theme = 0; theme < 3; ++theme) {
        app.prefs.language = language;
        app.prefs.theme = theme;
        app.preferences();
        check(app.subject == modelCategories[0] &&
                  SendMessageW(app.subjects, CB_GETCURSEL, 0, 0) == 1,
              "theme/language preserves visible model filter");
        check(app.query == "Native", "theme/language preserves query");
        wchar_t cue[128]{};
        check(SendMessageW(app.search, EM_GETCUEBANNER, reinterpret_cast<WPARAM>(cue), 128) != 0 &&
                  std::wstring(cue) == app.copy("search"),
              "localized search cue exists");
        for (int clientWidth : {1000, 1280, 1600}) {
          app.detail = app.works[0];
          app.detail["assets"] = Json::array({{{"id", "fixture"},
                                               {"kind", "source"},
                                               {"fileName", std::string(150, 'a') + "-文件名.zip"},
                                               {"bytes", 123456},
                                               {"protected", true}}});
          RECT size{0, 0, int(clientWidth * app.scale), int(820 * app.scale)};
          AdjustWindowRectEx(&size, WS_OVERLAPPEDWINDOW, FALSE, 0);
          SetWindowPos(window, nullptr, 0, 0, size.right - size.left, size.bottom - size.top,
                       SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
          app.paint();
          for (int id : {102, 107, 300, 301, 302, 303, 304, 305, 306, 307}) {
            RECT r{};
            GetWindowRect(app.buttons[id], &r);
            MapWindowPoints(nullptr, window, reinterpret_cast<POINT *>(&r), 2);
            check(r.right / app.scale <= app.nav + app.content + 1,
                  "filters do not overlap detail panel");
          }
          for (const auto &hit : app.hits)
            if (hit.action == Action::Download)
              check(hit.rect.top > 0 && hit.rect.right <= app.width,
                    "long filename keeps download in panel");
        }
      }
    app.wall = true;
    app.button(111);
    wchar_t buttonLabel[100]{};
    GetWindowTextW(app.buttons[107], buttonLabel, 100);
    check(!app.wall && std::wstring(buttonLabel) == app.copy("wall"),
          "navigation updates wall toggle label");
    int previousGeneration = app.generation;
    MSG refresh{};
    refresh.hwnd = app.search;
    refresh.message = WM_KEYDOWN;
    refresh.wParam = VK_F5;
    check(app.translate(refresh) && app.generation == previousGeneration + 1,
          "F5 works from search edit");
    app.wall = true;
    MSG escape = refresh;
    escape.wParam = VK_ESCAPE;
    check(app.translate(escape) && !app.wall, "Escape works from child control");
    app.detail = {
        {"title", "Preview fixture"}, {"resourceType", "model"}, {"modelUrl", "/fixture.glb"}};
    app.previewGeneration = app.detailGen;
    app.loading = false;
    app.lastError.clear();
    app.layout();
    app.paint();
    check(std::none_of(app.hits.begin(), app.hits.end(),
                       [](const Hit &h) { return h.action == Action::Model; }),
          "loading model button cannot queue duplicate previews");
    Event stale;
    stale.operation = Operation::Model;
    stale.generation = app.detailGen - 1;
    app.event(stale);
    check(app.previewGeneration == -1, "stale model completion releases preview state");
    result["layoutCases"] = 27;
    result["assertions"] = assertions;
    result["ok"] = true;
  } catch (const std::exception &e) {
    result["error"] = e.what();
    result["assertions"] = assertions;
  }
  if (IsWindow(app.hwnd))
    DestroyWindow(app.hwnd);
  std::ofstream out(report);
  out << result.dump(2);
  return result.value("ok", false) ? 0 : 1;
}
} // namespace mr
