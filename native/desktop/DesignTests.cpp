#include "App.hpp"
#include <fstream>
#include <windowsx.h>
namespace mr {
LRESULT CALLBACK procedure(HWND, UINT, WPARAM, LPARAM);
Json studioFixture(const std::filesystem::path &);
int designTests(const std::filesystem::path &configPath, const std::filesystem::path &report) {
  Json result = {{"ok", false}, {"revision", MR_REVISION}};
  int assertions = 0, layouts = 0;
  auto check = [&](bool ok, const char *label) {
    assertions++;
    if (!ok)
      throw std::runtime_error(label);
  };
  std::unique_ptr<App> app;
  try {
    auto config = studioFixture(configPath);
    app = std::make_unique<App>(wide(text(config, "server")));
    app->prefs.motion = false;
    WNDCLASSW c{};
    c.lpfnWndProc = procedure;
    c.hInstance = GetModuleHandleW(nullptr);
    c.lpszClassName = L"MRDesignRegression";
    c.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    RegisterClassW(&c);
    auto window = CreateWindowExW(0, c.lpszClassName, L"Native design regression",
                                  WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN, 0, 0, 1440, 960, nullptr,
                                  nullptr, c.hInstance, app.get());
    check(window != nullptr, "native design window");
    ShowWindow(window, SW_SHOWNOACTIVATE);
    UpdateWindow(window);
    auto pump = [&](auto ready) {
      auto deadline = GetTickCount64() + 25000;
      do {
        MSG m{};
        while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE))
          if (m.message != WM_QUIT && !app->translate(m)) {
            TranslateMessage(&m);
            DispatchMessageW(&m);
          }
        if (ready())
          return;
        if (GetTickCount64() > deadline)
          throw std::runtime_error("design wait timed out");
        MsgWaitForMultipleObjects(0, nullptr, FALSE, 10, QS_ALLINPUT);
      } while (true);
    };
    pump([&] { return !app->loading && !app->exhibitionLoading; });
    check(app->mode == 11 && app->nav == 0, "website layout is the default public home");
    check(app->featured.size() >= 3 && app->works.size() > app->featured.size(),
          "qualified exhibition is separate from general discovery");
    check(IsWindow(app->exhibition), "embedded OpenGL exhibition created");
    probeExhibition(app->exhibition, true);
    pump([&] { return app->pendingImages.empty(); });
    SendMessageW(app->exhibition, WM_PAINT, 0, 0);
    auto initial = exhibitionState(app->exhibition);
    check(number(initial, "textures") > 0, "actual artwork pixels uploaded to native OpenGL");
    check(number(initial, "frames") > 0 && number(initial, "drawErrors") == 0,
          "spatial frame renders without OpenGL errors");
    SendMessageW(app->exhibition, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM(180, 140));
    SendMessageW(app->exhibition, WM_MOUSEMOVE, MK_LBUTTON, MAKELPARAM(310, 185));
    SendMessageW(app->exhibition, WM_LBUTTONUP, 0, MAKELPARAM(310, 185));
    SendMessageW(app->exhibition, WM_PAINT, 0, 0);
    auto rotated = exhibitionState(app->exhibition);
    check(rotated["yaw"] != initial["yaw"], "drag changes actual exhibition camera");
    check(rotated["visualHash"] != initial["visualHash"],
          "camera interaction changes rendered artwork pixels");
    SendMessageW(app->exhibition, WM_MOUSEWHEEL, MAKEWPARAM(MK_CONTROL, 120), 0);
    check(exhibitionState(app->exhibition)["distance"] < initial["distance"],
          "control wheel zooms the embedded scene");
    app->activate({{}, Action::ExhibitionSelect, 1});
    check(number(exhibitionState(app->exhibition), "selected") == 1,
          "native selection updates the 3D stage");
    app->activate({{}, Action::ExhibitionReset});
    check(exhibitionState(app->exhibition)["yaw"] == 0, "reset restores camera");
    app->activate({{}, Action::ExhibitionFocus});
    app->paint();
    check(app->exhibitionFocus && app->stageBounds.top >= 82,
          "focus view stays below fixed navigation");
    app->message(WM_KEYDOWN, VK_ESCAPE, 0);
    check(!app->exhibitionFocus, "escape exits focus view");
    auto featured = app->featured;
    app->featured = Json::array();
    app->synchronizeExhibition();
    app->layout();
    app->paint();
    check(!(GetWindowLongPtrW(app->exhibition, GWL_STYLE) & WS_VISIBLE),
          "empty curated section never substitutes ordinary works");
    check(app->stageBounds.bottom - app->stageBounds.top < 150,
          "empty exhibition uses compact layout");
    app->featured = featured;
    app->synchronizeExhibition();
    app->layout();
    for (int page : {11, 1, 12}) {
      if (page == 12)
        app->openPortfolio("native-creator");
      else
        app->navigate(page);
      pump([&] { return !app->loading && !app->exhibitionLoading; });
      check(app->lastError.empty(), "public design page loads");
      for (int theme = 0; theme < 3; theme++)
        for (int language = 0; language < 3; language++)
          for (int width : {1000, 1280, 1600}) {
            app->prefs.theme = theme;
            app->prefs.language = language;
            app->preferences();
            RECT size{0, 0, int(width * app->scale), int(860 * app->scale)};
            AdjustWindowRectEx(&size, WS_OVERLAPPEDWINDOW, FALSE, 0);
            SetWindowPos(window, nullptr, 0, 0, size.right - size.left, size.bottom - size.top,
                         SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
            app->layout();
            app->paint();
            layouts++;
            check(app->nav == 0 && app->width >= 999, "public canvas uses full window width");
            RECT last{}, settings{}, publish{}, login{};
            GetWindowRect(app->buttons[111], &last);
            GetWindowRect(app->buttons[103], &settings);
            GetWindowRect(app->buttons[101], &publish);
            GetWindowRect(app->buttons[100], &login);
            check(last.right < settings.left, "top navigation never overlaps settings");
            check(publish.right < login.left, "publish and account controls never overlap");
            check(!(GetWindowLongPtrW(app->search, GWL_STYLE) & WS_VISIBLE),
                  "home and portfolio have no stray legacy inputs");
            if (page != 12)
              check(number(exhibitionState(app->exhibition), "theme") == unsigned(theme),
                    "3D palette follows interface theme");
            if (app->maxScroll > 0) {
              app->scroll = std::min(420.f, app->maxScroll);
              app->layoutShowcase();
              app->paint();
              if (GetWindowLongPtrW(app->exhibition, GWL_STYLE) & WS_VISIBLE) {
                HRGN region = CreateRectRgn(0, 0, 0, 0);
                GetWindowRgn(app->exhibition, region);
                RECT bounds{}, child{};
                GetRgnBox(region, &bounds);
                GetWindowRect(app->exhibition, &child);
                POINT p{child.left, child.top};
                ScreenToClient(window, &p);
                check((p.y + bounds.top) / app->scale >= 81,
                      "scrolled 3D child clips below header");
                DeleteObject(region);
              }
              app->scroll = 0;
              app->layoutShowcase();
            }
          }
    }
    check(app->mode == 12 && !app->works.empty(),
          "native creator portfolio contains real published work");
    app->openPortfolio("native-peer");
    pump([&] { return !app->loading; });
    check(app->works.size() == 24 && app->pagination.value("hasNext", false),
          "large creator portfolio exposes actual server pagination");
    std::set<std::string> firstPage;
    for (auto &w : app->works)
      firstPage.insert(text(w, "id"));
    app->activate({{}, Action::PublicPage, 1});
    pump([&] { return !app->loading; });
    check(app->page == 2 && !app->works.empty(), "next portfolio page loads remaining works");
    bool disjoint = true;
    for (auto &w : app->works)
      if (firstPage.contains(text(w, "id")))
        disjoint = false;
    check(disjoint, "portfolio pages do not repeat first-page records");
    app->activate({{}, Action::PublicPage, -1});
    pump([&] { return !app->loading; });
    check(app->page == 1, "portfolio previous page navigation works");
    app->token = "expired-native-fixture-session";
    app->openPortfolio("native-peer");
    pump([&] { return !app->loading && app->token.empty(); });
    check(!app->works.empty() && app->lastError.empty(),
          "expired optional session does not block a public portfolio");
    Http client(wide(text(config, "server")));
    auto login = payload(
        client.json("POST", "/api/auth/login", "",
                    {{"email", text(config, "email")}, {"password", text(config, "password")}}));
    auto auth = text(login["session"], "token");
    auto original = payload(client.json("GET", "/api/account/profile", auth))["profile"];
    auto hidden = original;
    hidden["profilePublic"] = false;
    client.json("PUT", "/api/account/profile", auth, hidden);
    app->openPortfolio("native-creator");
    pump([&] { return !app->loading; });
    bool privateHidden = app->works.empty() && !app->portfolio.value("profilePublic", true);
    client.json("PUT", "/api/account/profile", auth, original);
    client.json("POST", "/api/auth/logout", auth);
    check(privateHidden, "private creator profile never renders its public work wall");
    app->navigate(11);
    pump([&] { return !app->loading && !app->exhibitionLoading; });
    app->exhibitionIndex = 0;
    for (size_t n = 0; n < app->featured.size(); n++)
      if (text(app->featured[n], "id") == "native-model")
        app->exhibitionIndex = int(n);
    app->activate({{}, Action::ExhibitionOpen});
    pump([&] { return !app->detailLoading; });
    check(app->workroom(), "selected exhibition work opens the wide native workroom");
    // Pick the genuine Draco fixture for an in-window model preview.
    int model = -1;
    for (size_t i = 0; i < app->works.size(); i++)
      if (text(app->works[i], "id") == "native-model")
        model = int(i);
    check(model >= 0, "real model fixture found");
    app->select(model);
    pump([&] { return !app->detailLoading; });
    app->model();
    pump([&] { return app->previewGeneration == -1; });
    check(IsWindow(app->workPreview) && (GetWindowLongPtrW(app->workPreview, GWL_STYLE) & WS_CHILD),
          "real model renderer embeds in the workroom");
    check(GetFocus() == app->workPreview, "embedded model receives keyboard focus after opening");
    check(SendMessageW(app->workPreview, WM_GETDLGCODE, 0, 0) & DLGC_WANTARROWS,
          "embedded model keeps arrow keys for 3D interaction");
    RECT modelRect{};
    GetWindowRect(app->workPreview, &modelRect);
    POINT origin{modelRect.right, modelRect.top};
    ScreenToClient(window, &origin);
    check(origin.x / app->scale <= app->width - app->aside,
          "model preview does not cover file metadata");
    app->message(WM_KEYDOWN, VK_ESCAPE, 0);
    check(!app->workPreview && app->detail.is_object(),
          "escape closes inline model and preserves selected work");
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
  result["layoutCases"] = layouts;
  std::ofstream out(report);
  out << result.dump(2);
  return result.value("ok", false) ? 0 : 1;
}
} // namespace mr
