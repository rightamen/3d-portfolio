#include "App.hpp"
#include <algorithm>
#include <cmath>
#include <dwmapi.h>
#include <sstream>
#include <uxtheme.h>
#include <windowsx.h>
namespace mr {
Palette palette(int t) {
  if (t == 2)
    return {0xf1eee5, 0xfffdf7, 0xe5e1d6, 0x27392f, 0x758074, 0xd6d7cc, 0x287d61, 0xffffff};
  if (t == 1)
    return {0x0e1423, 0x151f32, 0x202f46, 0xe0e9f6, 0x95a8c0, 0x2b3950, 0x88b7ff, 0x101e34};
  return {0x0b1116, 0x141d24, 0x1d2a31, 0xe3ece8, 0x96a8a4, 0x28363c, 0x6ed4b6, 0x0d2b21};
}
COLORREF gdi(uint32_t c) {
  return RGB(c >> 16, (c >> 8) & 255, c & 255);
}
void App::create() {
  D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &factory);
  DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory),
                      reinterpret_cast<IUnknown **>(&writer));
  if (!factory || !writer)
    throw std::runtime_error("Graphics unavailable");
  scale = GetDpiForWindow(hwnd) / 96.f;
  font = CreateFontW(-int(13 * scale), 0, 0, 0, FW_MEDIUM, FALSE, FALSE, FALSE, DEFAULT_CHARSET, 0,
                     0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
  auto make = [&](int id, const char *key) {
    auto b = CreateWindowExW(
        0, L"BUTTON", copy(key).c_str(), WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_OWNERDRAW, 0, 0, 1,
        1, hwnd, reinterpret_cast<HMENU>(INT_PTR(id)), GetModuleHandleW(nullptr), nullptr);
    SendMessageW(b, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
    buttons[id] = b;
  };
  for (auto [id, key] : std::vector<std::pair<int, const char *>>{{100, "login"},
                                                                  {101, "publish"},
                                                                  {102, "refresh"},
                                                                  {103, "settings"},
                                                                  {104, "onlineWorkspace"},
                                                                  {105, "previous"},
                                                                  {106, "next"},
                                                                  {107, "wall"},
                                                                  {110, "library"},
                                                                  {111, "curated"},
                                                                  {112, "mine"},
                                                                  {113, "downloads"}})
    make(id, key);
  search =
      CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_AUTOHSCROLL, 0, 0, 1,
                      1, hwnd, reinterpret_cast<HMENU>(201), GetModuleHandleW(nullptr), nullptr);
  SendMessageW(search, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
  SendMessageW(search, EM_SETLIMITTEXT, 120, 0);
  SendMessageW(search, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN, MAKELPARAM(12, 12));
  for (int i = 0; i < 8; i++)
    make(300 + i, "all");
  subjects = CreateWindowExW(
      0, L"COMBOBOX", L"", WS_CHILD | WS_TABSTOP | CBS_DROPDOWNLIST | WS_VSCROLL, 0, 0, 1, 1, hwnd,
      reinterpret_cast<HMENU>(202), GetModuleHandleW(nullptr), nullptr);
  SendMessageW(subjects, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
  SetWindowTheme(subjects, L"", L"");
  preferences();
  load();
}
void App::preferences() {
  colors = palette(prefs.theme);
  if (editBrush)
    DeleteObject(editBrush);
  editBrush = CreateSolidBrush(gdi(colors.raised));
  BOOL dark = prefs.theme != 2;
  DwmSetWindowAttribute(hwnd, 20, &dark, sizeof(dark));
  SetPropW(hwnd, L"MRLanguage", reinterpret_cast<HANDLE>(INT_PTR(prefs.language)));
  for (auto [id, key] :
       std::vector<std::pair<int, const char *>>{{100, token.empty() ? "login" : "logout"},
                                                 {101, "publish"},
                                                 {102, "refresh"},
                                                 {103, "settings"},
                                                 {104, "onlineWorkspace"},
                                                 {105, "previous"},
                                                 {106, "next"},
                                                 {107, wall ? "list" : "wall"},
                                                 {110, "library"},
                                                 {111, "curated"},
                                                 {112, "mine"},
                                                 {113, "downloads"}})
    SetWindowTextW(buttons[id], copy(key).c_str());
  SendMessageW(search, EM_SETCUEBANNER, 0, reinterpret_cast<LPARAM>(copy("search").c_str()));
  SendMessageW(subjects, CB_RESETCONTENT, 0, 0);
  const wchar_t *zh[] = {L"全部模型", L"道具", L"角色", L"场景", L"手绘角色", L"手绘场景", L"综合"};
  const wchar_t *en[] = {L"All models",         L"Props",          L"Characters", L"Scenes",
                         L"Painted characters", L"Painted scenes", L"General"};
  const wchar_t *ja[] = {L"すべてのモデル", L"小物",       L"キャラクター", L"背景",
                         L"手描きキャラ",   L"手描き背景", L"総合"};
  for (int i = 0; i < 7; i++)
    SendMessageW(subjects, CB_ADDSTRING, 0,
                 reinterpret_cast<LPARAM>(prefs.language == 0   ? zh[i]
                                          : prefs.language == 1 ? en[i]
                                                                : ja[i]));
  int selected = 0;
  for (size_t i = 0; i < modelCategories.size(); ++i)
    if (subject == modelCategories[i])
      selected = int(i) + 1;
  SendMessageW(subjects, CB_SETCURSEL, selected, 0);
  layout();
  repaint();
}
void App::place(HWND h, float x, float y, float w, float hgt, bool visible) {
  ShowWindow(h, visible ? SW_SHOW : SW_HIDE);
  if (visible)
    SetWindowPos(h, nullptr, int(x * scale), int(y * scale), std::max(1, int(w * scale)),
                 std::max(1, int(hgt * scale)), SWP_NOZORDER | SWP_NOACTIVATE);
}
IDWriteTextFormat *App::format(float size, bool bold) {
  int key = int(size * 10) + (bold ? 10000 : 0);
  auto i = formats.find(key);
  if (i != formats.end())
    return i->second;
  IDWriteTextFormat *f = nullptr;
  writer->CreateTextFormat(
      L"Segoe UI", nullptr, bold ? DWRITE_FONT_WEIGHT_SEMI_BOLD : DWRITE_FONT_WEIGHT_NORMAL,
      DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL, size, L"zh-cn", &f);
  if (f) {
    f->SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);
    formats[key] = f;
  }
  return f;
}
float App::measure(const std::wstring &s, float size) {
  IDWriteTextLayout *l = nullptr;
  writer->CreateTextLayout(s.c_str(), UINT32(s.size()), format(size), 2000, 200, &l);
  DWRITE_TEXT_METRICS m{};
  if (l) {
    l->GetMetrics(&m);
    l->Release();
  }
  return m.widthIncludingTrailingWhitespace;
}
float App::textHeight(const std::wstring &s, float size, float width) {
  IDWriteTextLayout *l = nullptr;
  writer->CreateTextLayout(s.c_str(), UINT32(s.size()), format(size), std::max(1.f, width), 2000,
                           &l);
  DWRITE_TEXT_METRICS m{};
  if (l) {
    l->GetMetrics(&m);
    l->Release();
  }
  return m.height;
}
void App::layout() {
  RECT r{};
  GetClientRect(hwnd, &r);
  float nextScale = GetDpiForWindow(hwnd) / 96.f;
  if (std::abs(scale - nextScale) > .01f) {
    auto previous = font;
    font = CreateFontW(-int(13 * nextScale), 0, 0, 0, FW_MEDIUM, FALSE, FALSE, FALSE,
                       DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
    for (auto &[id, button] : buttons)
      SendMessageW(button, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
    SendMessageW(search, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
    SendMessageW(subjects, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
    if (previous)
      DeleteObject(previous);
  }
  scale = nextScale;
  width = r.right / scale;
  height = r.bottom / scale;
  nav = width < 1000 ? 168.f : 202.f;
  aside = (!detail.is_null() || detailLoading || !detailError.empty())
              ? std::min(388.f, width - nav - 44)
              : 0;
  content = width - nav - aside;
  place(buttons[100], width - 151, 20, 123, 36);
  place(buttons[101], width - 316, 20, 150, 36);
  for (int n = 0; n < 4; n++)
    place(buttons[110 + n], 16, 126 + n * 51, nav - 32, 41);
  place(buttons[103], 16, height - 151, nav - 32, 37);
  place(buttons[104], 16, height - 100, nav - 32, 37);
  place(buttons[102], nav + content - 134, 82, 106, 32, mode != 3);
  place(buttons[107], nav + content - 165, 190, 137, 34, mode < 2);
  place(search, nav + 28, 190, std::max(100.f, content - 225), 34, mode < 2);
  uint64_t total = 0;
  if (counts.is_object())
    for (auto i = counts.begin(); i != counts.end(); ++i)
      if (i.value().is_number())
        total += i.value().get<uint64_t>();
  float x = nav + 28, y = mode == 2 ? 195.f : 244.f;
  for (int n = 0; n < 8; n++) {
    std::string key = n ? std::string(resourceTypes[n - 1]) : "";
    auto name = n ? resourceLabel(prefs.language, key) : copy("all"), value = name;
    if (mode < 2)
      value += L"  " + std::to_wstring(n ? number(counts, key.c_str()) : total);
    SetWindowTextW(buttons[300 + n], value.c_str());
    float w = measure(name) + 56;
    if (x + w > nav + content - 28 && x > nav + 28) {
      x = nav + 28;
      y += 42;
    }
    place(buttons[300 + n], x, y, w, 32, mode != 3);
    x += w + 7;
  }
  gridTop = mode == 3 ? 190 : y + 53;
  bool cat = type == "model" && mode < 2;
  place(subjects, nav + 28, gridTop, 210, 260, cat);
  if (cat)
    gridTop += 47;
  bool prev = pagination.value("hasPrevious", false), next = pagination.value("hasNext", false);
  place(buttons[105], nav + 28, height - 51, 100, 32, mode != 3 && (prev || next));
  place(buttons[106], nav + content - 128, height - 51, 100, 32, mode != 3 && (prev || next));
  EnableWindow(buttons[105], prev);
  EnableWindow(buttons[106], next);
  for (auto &[id, h] : buttons)
    InvalidateRect(h, nullptr, FALSE);
  if (target) {
    target->SetDpi(96 * scale, 96 * scale);
    target->Resize(D2D1::SizeU(UINT(r.right), UINT(r.bottom)));
  }
  repaint();
}
void App::text(const std::wstring &s, D2D1_RECT_F r, float size, uint32_t c, bool bold) {
  auto f = format(size, bold);
  if (!f)
    return;
  brush->SetColor(D2D1::ColorF(c));
  target->DrawText(s.c_str(), UINT32(s.size()), f, r, brush, D2D1_DRAW_TEXT_OPTIONS_CLIP);
}
void App::fill(D2D1_RECT_F r, uint32_t c, float radius, float opacity) {
  brush->SetColor(D2D1::ColorF(c, opacity));
  if (radius)
    target->FillRoundedRectangle(D2D1::RoundedRect(r, radius, radius), brush);
  else
    target->FillRectangle(r, brush);
}
void App::border(D2D1_RECT_F r, uint32_t c, float radius, float thickness) {
  brush->SetColor(D2D1::ColorF(c));
  if (radius)
    target->DrawRoundedRectangle(D2D1::RoundedRect(r, radius, radius), brush, thickness);
  else
    target->DrawRectangle(r, brush, thickness);
}
void App::action(const std::wstring &s, D2D1_RECT_F r, Action a, int index, bool primary) {
  fill(r, primary ? colors.accent : colors.raised, 7);
  if (!primary)
    border(r, colors.line, 7);
  text(s, D2D1::RectF(r.left + 12, r.top + 10, r.right - 10, r.bottom), 12,
       primary ? colors.onAccent : colors.text, true);
  hits.push_back({r, a, index});
}
void App::bitmap(const std::string &key, D2D1_RECT_F r, const std::string &fallback) {
  image(key, fallback);
  auto i = images.find(key);
  if (i == images.end())
    return;
  auto size = i->second->GetSize();
  float scale = std::min((r.right - r.left) / size.width, (r.bottom - r.top) / size.height),
        w = size.width * scale, h = size.height * scale, x = (r.left + r.right - w) / 2,
        y = (r.top + r.bottom - h) / 2;
  target->DrawBitmap(i->second, D2D1::RectF(x, y, x + w, y + h), 1,
                     D2D1_BITMAP_INTERPOLATION_MODE_LINEAR);
}
void App::card(const Json &w, D2D1_RECT_F r, int index) {
  fill(r, colors.panel, 12);
  border(r, index == hover ? colors.accent : colors.line, 12, index == hover ? 1.5f : 1);
  auto coverRect = D2D1::RectF(r.left + 8, r.top + 8, r.right - 8, r.bottom - 86);
  fill(coverRect, colors.raised, 8);
  bitmap(cover(w), coverRect, mr::text(w, "image"));
  auto cents = number(w, "priceCents");
  std::wstring price =
      cents == 0 ? copy("free")
                 : wide(mr::text(w, "currency", "usd")) + L" " + std::to_wstring(cents / 100);
  float pw = measure(price, 10) + 18;
  fill(D2D1::RectF(coverRect.right - pw - 8, coverRect.bottom - 31, coverRect.right - 8,
                   coverRect.bottom - 9),
       0x0b151b, 5, .88f);
  text(price,
       D2D1::RectF(coverRect.right - pw, coverRect.bottom - 28, coverRect.right - 12,
                   coverRect.bottom - 9),
       10, 0xd8eae3);
  text(title(w), D2D1::RectF(r.left + 16, r.bottom - 74, r.right - 14, r.bottom - 36), 15,
       colors.text, true);
  auto creator = w.value("creator", Json::object());
  text(L"@" + wide(mr::text(creator, "handle")),
       D2D1::RectF(r.left + 16, r.bottom - 29, r.right - 100, r.bottom - 7), 11, colors.muted);
  text(resourceLabel(prefs.language, mr::text(w, "resourceType", "model")),
       D2D1::RectF(r.right - 119, r.bottom - 29, r.right - 13, r.bottom - 7), 10, colors.accent);
  hits.push_back({r, Action::Card, index});
}
void App::details() {
  if (!aside)
    return;
  float left = width - aside;
  target->PushAxisAlignedClip(D2D1::RectF(left, 66, width, height),
                              D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
  fill(D2D1::RectF(left, 66, width, height), colors.panel);
  border(D2D1::RectF(left, 66, width, height), colors.line);
  float x = left + 24, w = aside - 48, y = 86 - detailScroll;
  action(L"×", D2D1::RectF(width - 54, 78, width - 20, 112), Action::Close);
  if (detailLoading) {
    text(copy("loading"), D2D1::RectF(x, 138, x + w, 188), 14, colors.muted);
    target->PopAxisAlignedClip();
    return;
  }
  if (!detailError.empty()) {
    text(copy("offline"), D2D1::RectF(x, 138, x + w, 193), 14, colors.muted);
    action(copy("refresh"), D2D1::RectF(x, 207, x + w, 246), Action::RetryDetail);
    target->PopAxisAlignedClip();
    return;
  }
  if (!detail.is_object()) {
    target->PopAxisAlignedClip();
    return;
  }
  text(resourceLabel(prefs.language, mr::text(detail, "resourceType", "model")),
       D2D1::RectF(x, y + 5, x + w - 35, y + 28), 11, colors.accent);
  y += 43;
  auto name = title(detail);
  float th = std::max(32.f, textHeight(name, 24, w));
  text(name, D2D1::RectF(x, y, x + w, y + th + 3), 24, colors.text, true);
  y += th + 14;
  auto creator = detail.value("creator", Json::object());
  text(L"@" + wide(mr::text(creator, "handle")), D2D1::RectF(x, y, x + w, y + 23), 12,
       colors.muted);
  y += 35;
  auto r = D2D1::RectF(x, y, x + w, y + 190);
  fill(r, colors.raised, 10);
  bitmap(cover(detail), r, mr::text(detail, "image"));
  hits.push_back({r, Action::Picture});
  y += 207;
  auto type = mr::text(detail, "resourceType", "model");
  if (type == "model" && !mr::text(detail, "modelUrl").empty()) {
    auto previewRect = D2D1::RectF(x, y, x + w, y + 42);
    if (previewGeneration != -1) {
      fill(previewRect, colors.raised, 7);
      text(copy("preparing3d"), D2D1::RectF(x + 12, y + 10, x + w - 10, y + 42), 12, colors.muted);
    } else
      action(copy("view3d"), previewRect, Action::Model, 0, true);
    y += 53;
  }
  if (type == "video" || type == "audio") {
    bool playable = false;
    for (auto &a : detail.value("assets", Json::array()))
      if (mr::text(a, "kind") == type && !mr::text(a, "fileUrl").empty())
        playable = true;
    if (playable) {
      action(copy("preview"), D2D1::RectF(x, y, x + w, y + 42), Action::Media, 0, true);
      y += 53;
    }
  }
  action(copy("openweb"), D2D1::RectF(x, y, x + w, y + 39), Action::Web);
  y += 59;
  auto summary = wide(localized(detail, "summary", prefs.language));
  if (!summary.empty()) {
    float h = std::min(230.f, textHeight(summary, 12, w) + 2);
    text(summary, D2D1::RectF(x, y, x + w, y + h), 12, colors.muted);
    y += h + 25;
  }
  auto format = wide(mr::text(detail, "format"));
  if (!format.empty()) {
    text(copy("format") + L" · " + format, D2D1::RectF(x, y, x + w, y + 45), 11, colors.muted);
    y += 51;
  }
  if (mode == 2 &&
      (mr::text(detail, "status") == "draft" || mr::text(detail, "status") == "rejected" ||
       mr::text(detail, "status") == "hidden")) {
    action(copy("continueUpload"), D2D1::RectF(x, y, x + w, y + 42), Action::Continue);
    y += 58;
  }
  text(copy("files"), D2D1::RectF(x, y, x + w, y + 27), 15, colors.text, true);
  y += 38;
  auto assets = detail.value("assets", Json::array());
  for (size_t i = 0; i < assets.size(); i++) {
    auto &a = assets[i];
    auto kind = mr::text(a, "kind");
    auto file = wide(mr::text(a, "fileName"));
    fill(D2D1::RectF(x, y, x + w, y + 1), colors.line);
    y += 13;
    auto kt = kind == "source" ? copy("source")
              : kind == "model" || kind == "video" || kind == "audio"
                  ? resourceLabel(prefs.language, kind)
                  : copy("cover");
    text(kt, D2D1::RectF(x, y, x + w - 65, y + 38), 10, colors.muted);
    std::wostringstream size;
    size.precision(1);
    size << std::fixed << number(a, "bytes") / (1024. * 1024.) << L" MB";
    text(size.str(), D2D1::RectF(x + w - 62, y, x + w, y + 23), 10, colors.muted);
    y += 36;
    float h = std::max(24.f, textHeight(file, 12, w));
    text(file, D2D1::RectF(x, y, x + w, y + h + 2), 12, colors.text);
    y += h + 13;
    action(copy("download"), D2D1::RectF(x, y, x + w, y + 37), Action::Download, int(i));
    y += 57;
  }
  detailHeight = y + detailScroll + 20;
  target->PopAxisAlignedClip();
}
void App::paint() {
  if (!target) {
    RECT r;
    GetClientRect(hwnd, &r);
    if (FAILED(factory->CreateHwndRenderTarget(
            D2D1::RenderTargetProperties(),
            D2D1::HwndRenderTargetProperties(hwnd, D2D1::SizeU(r.right, r.bottom)), &target)))
      return;
    target->SetDpi(96 * scale, 96 * scale);
    if (FAILED(target->CreateSolidColorBrush(D2D1::ColorF(0xffffff), &brush)))
      return;
  }
  hits.clear();
  target->BeginDraw();
  target->Clear(D2D1::ColorF(colors.bg));
  fill(D2D1::RectF(0, 0, nav, height), colors.panel);
  fill(D2D1::RectF(nav - 1, 0, nav, height), colors.line);
  fill(D2D1::RectF(nav, 65, width, 66), colors.line);
  fill(D2D1::RectF(23, 24, 53, 54), colors.accent, 8);
  text(L"MR", D2D1::RectF(27, 30, 53, 53), 13, colors.onAccent, true);
  text(L"mrright", D2D1::RectF(65, 22, nav - 12, 48), 19, colors.text, true);
  text(L"STUDIO / NATIVE", D2D1::RectF(65, 46, nav - 12, 65), 8, colors.muted);
  text(L"0.1.1 · C++20", D2D1::RectF(24, height - 37, nav - 10, height - 12), 10, colors.muted);
  text(L"● " + copy(cppReady        ? "connected"
                    : healthPending ? "connecting"
                                    : "offline"),
       D2D1::RectF(nav + 28, 27, width - 340, 54), 10, cppReady ? colors.accent : colors.muted);
  auto heading = mode == 0 ? "library" : mode == 1 ? "curated" : mode == 2 ? "mine" : "downloads";
  text(copy(heading), D2D1::RectF(nav + 28, 88, nav + content - 156, 133), 31, colors.text, true);
  text(copy(mode == 3 ? "noDownloads" : "subhead"),
       D2D1::RectF(nav + 28, 142, nav + content - 28, 175), 12, colors.muted);
  float right = nav + content - 28, bottom = height - 65;
  target->PushAxisAlignedClip(D2D1::RectF(nav + 18, gridTop, right + 10, bottom),
                              D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
  if (mode == 3) {
    float y = gridTop - scroll;
    for (size_t i = 0; i < jobs.size(); i++) {
      auto &j = jobs[i];
      auto r = D2D1::RectF(nav + 28, y, right, y + 125);
      fill(r, colors.panel, 10);
      border(r, colors.line, 10);
      text(j.title, D2D1::RectF(r.left + 18, y + 15, r.right - 130, y + 42), 15, colors.text, true);
      text(j.name, D2D1::RectF(r.left + 18, y + 48, r.right - 130, y + 73), 11, colors.muted);
      fill(D2D1::RectF(r.left + 18, y + 89, r.right - 145, y + 93), colors.line, 2);
      fill(D2D1::RectF(r.left + 18, y + 89,
                       r.left + 18 + (r.right - r.left - 163) * float(j.progress), y + 93),
           j.cancelled ? colors.muted
           : j.failed  ? 0xd99b80
                       : colors.accent,
           2);
      if (!j.done && j.cancel->load())
        text(copy("cancelling"), D2D1::RectF(right - 128, y + 38, right - 18, y + 90), 11,
             colors.muted);
      else if (!j.done)
        action(copy("cancel"), D2D1::RectF(right - 123, y + 40, right - 18, y + 79), Action::Cancel,
               int(i));
      else if (!j.file.empty() && !j.failed && !j.cancelled)
        action(copy("folder"), D2D1::RectF(right - 123, y + 40, right - 18, y + 79), Action::Folder,
               int(i));
      else
        text(j.cancelled ? copy("cancelled")
             : j.failed  ? copy("error")
                         : copy("downloadComplete"),
             D2D1::RectF(right - 128, y + 38, right - 18, y + 90), 11, colors.muted);
      y += 141;
    }
    maxScroll = std::max(0.f, y + scroll - bottom + 20);
  } else if (loading)
    text(copy("loading"), D2D1::RectF(nav + 30, gridTop + 40, right, gridTop + 90), 17,
         colors.muted);
  else if (!lastError.empty())
    text(copy(lastError == "notSigned" ? "notSigned" : "offline"),
         D2D1::RectF(nav + 30, gridTop + 35, right, gridTop + 85), 17, colors.muted);
  else if (works.empty())
    text(copy("empty"), D2D1::RectF(nav + 30, gridTop + 35, right, gridTop + 95), 17, colors.muted);
  else if (wall && mode < 2) {
    float cw = 260, ch = 250, gap = 26, ww = right - nav - 28, hh = bottom - gridTop;
    int cols = int(ww / (cw + gap)) + 3, rows = int(hh / (ch + gap)) + 3;
    float ox = std::fmod(worldX, cw + gap), oy = std::fmod(worldY, ch + gap);
    int cellX = int(std::floor(worldX / (cw + gap))), cellY = int(std::floor(worldY / (ch + gap)));
    for (int row = -1; row < rows; row++)
      for (int col = -1; col < cols; col++) {
        float x = nav + 28 + col * (cw + gap) + ox, y = gridTop + row * (ch + gap) + oy;
        int i = ((row - cellY) * 11 + col - cellX) % int(works.size());
        if (i < 0)
          i += int(works.size());
        if (x + cw < nav + 20 || x > right || y + ch < gridTop || y > bottom)
          continue;
        card(works[i], D2D1::RectF(x, y, x + cw, y + ch), i);
      }
  } else {
    float available = content - 56, gap = 20;
    int cols = std::max(1, int((available + gap) / 270));
    float cw = (available - gap * (cols - 1)) / cols, ch = cw * .63f + 92;
    for (size_t i = 0; i < works.size(); i++) {
      float x = nav + 28 + (int(i) % cols) * (cw + gap),
            y = gridTop + (int(i) / cols) * (ch + gap) - scroll;
      if (y + ch < gridTop || y > bottom)
        continue;
      card(works[i], D2D1::RectF(x, y, x + cw, y + ch), int(i));
    }
    maxScroll =
        std::max(0.f, std::ceil(float(works.size()) / cols) * (ch + gap) - (bottom - gridTop));
  }
  target->PopAxisAlignedClip();
  if (wall && mode < 2)
    text(copy("wallHelp"), D2D1::RectF(nav + 30, height - 48, nav + content - 30, height - 12), 10,
         colors.muted);
  else if (mode != 3) {
    auto value = std::to_wstring(page) + L" / " +
                 std::to_wstring(std::max<uint64_t>(1, number(pagination, "pages", 1)));
    text(value,
         D2D1::RectF(nav + content / 2 - 30, height - 43, nav + content / 2 + 60, height - 12), 11,
         colors.muted);
  }
  details();
  if (target->EndDraw() == static_cast<HRESULT>(D2DERR_RECREATE_TARGET)) {
    for (auto &[key, img] : images)
      img->Release();
    images.clear();
    brush->Release();
    brush = nullptr;
    target->Release();
    target = nullptr;
    repaint();
  }
}
std::optional<Hit> App::at(float x, float y) {
  for (auto i = hits.rbegin(); i != hits.rend(); ++i) {
    if (i->action == Action::Card &&
        (x < nav + 18 || x > nav + content - 18 || y < gridTop || y > height - 65))
      continue;
    if (i->action != Action::Card && aside && i->rect.left >= width - aside &&
        (y < 66 || y > height))
      continue;
    if (x >= i->rect.left && x <= i->rect.right && y >= i->rect.top && y <= i->rect.bottom)
      return *i;
  }
  return {};
}
bool App::translate(MSG &message) {
  if (message.message == WM_KEYDOWN && (message.hwnd == hwnd || IsChild(hwnd, message.hwnd))) {
    bool control = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
    auto key = message.wParam;
    bool global =
        key == VK_F5 || key == VK_ESCAPE || (control && (key == 'F' || key == 'U' || key == 'L'));
    bool gallery = message.hwnd == hwnd && (key == VK_LEFT || key == VK_RIGHT || key == VK_UP ||
                                            key == VK_DOWN || key == VK_RETURN);
    if (global || gallery) {
      SendMessageW(hwnd, WM_KEYDOWN, key, message.lParam);
      return true;
    }
  }
  return IsDialogMessageW(hwnd, &message) != FALSE;
}
LRESULT App::message(UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
  case WM_CREATE:
    create();
    return 0;
  case WM_SIZE:
    layout();
    return 0;
  case WM_DPICHANGED: {
    auto r = reinterpret_cast<RECT *>(lp);
    SetWindowPos(hwnd, nullptr, r->left, r->top, r->right - r->left, r->bottom - r->top,
                 SWP_NOZORDER);
    layout();
    return 0;
  }
  case WM_GETMINMAXINFO: {
    auto p = reinterpret_cast<MINMAXINFO *>(lp);
    p->ptMinTrackSize = {int(1000 * scale), int(620 * scale)};
    return 0;
  }
  case WM_ERASEBKGND:
    return 1;
  case WM_PAINT: {
    PAINTSTRUCT p;
    BeginPaint(hwnd, &p);
    try {
      paint();
    } catch (...) {
    }
    EndPaint(hwnd, &p);
    return 0;
  }
  case WM_CTLCOLORSTATIC:
  case WM_CTLCOLOREDIT:
  case WM_CTLCOLORLISTBOX:
    SetTextColor(reinterpret_cast<HDC>(wp), gdi(colors.text));
    SetBkColor(reinterpret_cast<HDC>(wp), gdi(colors.raised));
    return reinterpret_cast<LRESULT>(editBrush);
  case WM_DRAWITEM: {
    auto i = reinterpret_cast<DRAWITEMSTRUCT *>(lp);
    int id = int(i->CtlID);
    bool active = (id >= 110 && id <= 113 && mode == id - 110) ||
                  (id >= 300 && id <= 307 &&
                   type == (id == 300 ? "" : std::string(resourceTypes[id - 301]))),
         primary = id == 101;
    auto p = CreatePen(PS_SOLID, 1, gdi(active ? colors.accent : colors.line));
    auto b = CreateSolidBrush(gdi(primary ? colors.accent : active ? colors.raised : colors.panel));
    auto background = CreateSolidBrush(
        gdi((id >= 110 && id <= 113) || id == 103 || id == 104 ? colors.panel : colors.bg));
    FillRect(i->hDC, &i->rcItem, background);
    DeleteObject(background);
    auto op = SelectObject(i->hDC, p), ob = SelectObject(i->hDC, b);
    RoundRect(i->hDC, i->rcItem.left, i->rcItem.top, i->rcItem.right, i->rcItem.bottom, 12, 12);
    SelectObject(i->hDC, op);
    SelectObject(i->hDC, ob);
    DeleteObject(p);
    DeleteObject(b);
    SetBkMode(i->hDC, TRANSPARENT);
    SetTextColor(i->hDC, gdi(primary ? colors.onAccent : active ? colors.text : colors.muted));
    SelectObject(i->hDC, font);
    wchar_t s[256];
    GetWindowTextW(i->hwndItem, s, 256);
    RECT r = i->rcItem;
    r.left += 10;
    r.right -= 8;
    DrawTextW(i->hDC, s, -1, &r, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS);
    if (i->itemState & ODS_FOCUS)
      DrawFocusRect(i->hDC, &i->rcItem);
    return TRUE;
  }
  case WM_COMMAND:
    if (LOWORD(wp) == 201 && HIWORD(wp) == EN_CHANGE) {
      KillTimer(hwnd, 1);
      SetTimer(hwnd, 1, 350, nullptr);
    } else if (LOWORD(wp) == 202 && HIWORD(wp) == CBN_SELCHANGE) {
      int n = int(SendMessageW(subjects, CB_GETCURSEL, 0, 0));
      subject = n > 0 && n <= 6 ? std::string(modelCategories[n - 1]) : "";
      page = 1;
      load();
    } else
      button(LOWORD(wp));
    return 0;
  case WM_TIMER:
    if (wp == 1) {
      KillTimer(hwnd, 1);
      int n = GetWindowTextLengthW(search);
      std::wstring s(n + 1, L'\0');
      GetWindowTextW(search, s.data(), n + 1);
      s.resize(n);
      query = utf8(s);
      page = 1;
      load();
    } else if (wp == 2 && wall && mode < 2 && tracking && !down && prefs.motion) {
      float x = mouse.x / scale, y = mouse.y / scale;
      if (x > nav && x < nav + content && y > gridTop && y < height - 65) {
        float dx = nav + content / 2 - x, dy = (gridTop + height - 65) / 2 - y;
        if (std::abs(dx) > 8 || std::abs(dy) > 8) {
          worldX += dx * .015f;
          worldY += dy * .015f;
          repaint();
        }
      }
    }
    return 0;
  case WM_MOUSEMOVE: {
    mouse = {GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
    if (!tracking) {
      tracking = true;
      TRACKMOUSEEVENT t{sizeof(t), TME_LEAVE, hwnd, 0};
      TrackMouseEvent(&t);
      SetTimer(hwnd, 2, 33, nullptr);
    }
    float x = mouse.x / scale, y = mouse.y / scale;
    if (down && wall) {
      if (std::abs(mouse.x - downPoint.x) + std::abs(mouse.y - downPoint.y) > 6)
        dragging = true;
      if (dragging) {
        worldX = downX + (mouse.x - downPoint.x) / scale;
        worldY = downY + (mouse.y - downPoint.y) / scale;
        repaint();
      }
    }
    auto h = at(x, y);
    int now = h && h->action == Action::Card ? h->index : -1;
    if (now != hover) {
      hover = now;
      repaint();
    }
    return 0;
  }
  case WM_MOUSELEAVE:
    tracking = false;
    hover = -1;
    KillTimer(hwnd, 2);
    repaint();
    return 0;
  case WM_LBUTTONDOWN:
    down = true;
    dragging = false;
    downPoint = {GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
    downX = worldX;
    downY = worldY;
    SetCapture(hwnd);
    SetFocus(hwnd);
    return 0;
  case WM_LBUTTONUP: {
    bool click = !dragging;
    down = false;
    ReleaseCapture();
    if (click) {
      auto h = at(GET_X_LPARAM(lp) / scale, GET_Y_LPARAM(lp) / scale);
      if (h)
        activate(*h);
    }
    return 0;
  }
  case WM_CAPTURECHANGED:
    down = false;
    return 0;
  case WM_MOUSEWHEEL: {
    POINT p{GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
    ScreenToClient(hwnd, &p);
    float delta = GET_WHEEL_DELTA_WPARAM(wp) / 120.f;
    if (aside && p.x / scale > width - aside)
      detailScroll =
          std::clamp(detailScroll - delta * 70, 0.f, std::max(0.f, detailHeight - height + 24));
    else if (wall && mode < 2)
      worldY += delta * 75;
    else
      scroll = std::clamp(scroll - delta * 85, 0.f, maxScroll);
    repaint();
    return 0;
  }
  case WM_KEYDOWN:
    if ((GetKeyState(VK_CONTROL) & 0x8000) && wp == 'F') {
      SetFocus(search);
      return 0;
    }
    if ((GetKeyState(VK_CONTROL) & 0x8000) && wp == 'U') {
      publish();
      return 0;
    }
    if ((GetKeyState(VK_CONTROL) & 0x8000) && wp == 'L') {
      signIn();
      return 0;
    }
    if (wp == VK_F5) {
      load();
      return 0;
    }
    if (wp == VK_ESCAPE) {
      if (!detail.is_null() || detailLoading)
        clearSelection();
      else {
        wall = false;
        preferences();
      }
      return 0;
    }
    if (wp == VK_DOWN || wp == VK_RIGHT) {
      hover = std::min(int(works.size()) - 1, hover + 1);
      repaint();
      return 0;
    }
    if (wp == VK_UP || wp == VK_LEFT) {
      hover = std::max(0, hover - 1);
      repaint();
      return 0;
    }
    if (wp == VK_RETURN && hover >= 0) {
      select(hover);
      return 0;
    }
    return 0;
  case eventMessage: {
    std::unique_ptr<Event> e(reinterpret_cast<Event *>(lp));
    event(*e);
    return 0;
  }
  case WM_CLOSE:
    for (auto &j : jobs)
      j.cancel->store(true);
    DestroyWindow(hwnd);
    return 0;
  case WM_DESTROY:
    KillTimer(hwnd, 1);
    KillTimer(hwnd, 2);
    RemovePropW(hwnd, L"MRLanguage");
    PostQuitMessage(0);
    return 0;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}
} // namespace mr
