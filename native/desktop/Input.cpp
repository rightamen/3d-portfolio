#include "Input.hpp"
#include <algorithm>
#include <commctrl.h>
namespace mr {
namespace {
constexpr UINT_PTR subclassId = 0x4d52494e;
int lineHeight(HWND edit) {
  HDC dc = GetDC(edit);
  if (!dc)
    return 18;
  auto font = reinterpret_cast<HFONT>(SendMessageW(edit, WM_GETFONT, 0, 0));
  auto previous = font ? SelectObject(dc, font) : nullptr;
  TEXTMETRICW metrics{};
  GetTextMetricsW(dc, &metrics);
  if (previous)
    SelectObject(dc, previous);
  ReleaseDC(edit, dc);
  return std::max(1, int(metrics.tmHeight)) + 2;
}
void paintPadding(HWND edit) {
  HDC dc = GetWindowDC(edit);
  if (!dc)
    return;
  RECT outer{}, client{};
  GetWindowRect(edit, &outer);
  GetClientRect(edit, &client);
  POINT origin{};
  ClientToScreen(edit, &origin);
  OffsetRect(&client, origin.x - outer.left, origin.y - outer.top);
  OffsetRect(&outer, -outer.left, -outer.top);
  ExcludeClipRect(dc, client.left, client.top, client.right, client.bottom);
  auto brush = reinterpret_cast<HBRUSH>(SendMessageW(GetParent(edit), WM_CTLCOLOREDIT,
                                                     reinterpret_cast<WPARAM>(dc),
                                                     reinterpret_cast<LPARAM>(edit)));
  FillRect(dc, &outer, brush ? brush : GetSysColorBrush(COLOR_WINDOW));
  ReleaseDC(edit, dc);
}
LRESULT CALLBACK inputProcedure(HWND edit, UINT message, WPARAM wp, LPARAM lp, UINT_PTR,
                                DWORD_PTR) {
  switch (message) {
  case WM_NCCALCSIZE: {
    auto result = DefSubclassProc(edit, message, wp, lp);
    auto rect =
        wp ? &reinterpret_cast<NCCALCSIZE_PARAMS *>(lp)->rgrc[0] : reinterpret_cast<RECT *>(lp);
    int padding = std::max(0, (int(rect->bottom - rect->top) - lineHeight(edit)) / 2);
    rect->top += padding;
    rect->bottom -= padding;
    return result;
  }
  case WM_NCPAINT:
    paintPadding(edit);
    return 0;
  case WM_NCHITTEST:
    return HTCLIENT;
  case WM_SETFONT: {
    auto result = DefSubclassProc(edit, message, wp, lp);
    SetWindowPos(edit, nullptr, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    return result;
  }
  case WM_THEMECHANGED:
  case WM_SYSCOLORCHANGE: {
    auto result = DefSubclassProc(edit, message, wp, lp);
    RedrawWindow(edit, nullptr, nullptr, RDW_INVALIDATE | RDW_FRAME);
    return result;
  }
  case WM_NCDESTROY:
    RemoveWindowSubclass(edit, inputProcedure, subclassId);
    break;
  }
  return DefSubclassProc(edit, message, wp, lp);
}
} // namespace
void centerInput(HWND edit) {
  SetWindowSubclass(edit, inputProcedure, subclassId, 0);
  SetWindowPos(edit, nullptr, 0, 0, 0, 0,
               SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
}
} // namespace mr
