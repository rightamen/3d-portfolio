#include "App.hpp"
#include <algorithm>
namespace mr {
void App::synchronizeExhibition() {
  auto &list = mode == 1 ? works : featured;
  exhibitionIndex = std::clamp(exhibitionIndex, 0, std::max(0, int(list.size()) - 1));
  if (!exhibition)
    return;
  setExhibition(exhibition, list, exhibitionIndex, prefs.theme, prefs.motion);
  for (auto &w : list) {
    auto key = cover(w), fallback = mr::text(w, "image");
    if (key.empty() || exhibitionHasImage(exhibition, key) || pendingImages.contains(key) ||
        failedImages.contains(key))
      continue;
    pendingImages.insert(key);
    auto client = http;
    dispatch(imageIO, hwnd, Operation::Image, 0, 0, false, [=](Event &e) {
      e.key = key;
      std::vector<unsigned char> bytes;
      try {
        bytes = client.bytes(key);
      } catch (...) {
        if (fallback.empty() || fallback == key)
          throw;
        bytes = client.bytes(fallback);
      }
      e.pixels = decodeImage(bytes, 1000);
    });
  }
}
void App::openPortfolio(const std::string &handle) {
  if (handle.empty())
    return;
  portfolioHandle = handle;
  portfolio = Json::object();
  type.clear();
  navigate(12);
}
bool App::showcaseEvent(Event &e) {
  if (e.operation == Operation::Exhibition) {
    if (e.generation != generation)
      return true;
    exhibitionLoading = false;
    exhibitionFailed = !e.ok;
    featured = e.ok ? payload(e.value).value("works", Json::array()) : Json::array();
    synchronizeExhibition();
    layout();
    return true;
  }
  if (e.operation == Operation::Portfolio) {
    if (e.generation != generation)
      return true;
    if (e.ok && e.value.value("expiredSession", false)) {
      clearLogin(false);
      return true;
    }
    loading = false;
    if (!e.ok) {
      lastError = "profileUnavailable";
      layout();
      return true;
    }
    portfolio = e.value.value("profile", Json::object());
    space.social = payload(e.value.value("relationship", Json::object()));
    auto catalogue = e.value.value("catalogue", Json::object());
    works = payload(catalogue).value("works", Json::array());
    pagination = catalogue.value("pagination", Json::object());
    counts = payload(catalogue).value("resourceCounts", Json::object());
    layout();
    return true;
  }
  return false;
}
bool App::showcaseAction(Hit h) {
  auto &list = mode == 1 ? works : featured;
  switch (h.action) {
  case Action::PublicPage:
    if ((h.index > 0 && pagination.value("hasNext", false)) || (h.index < 0 && page > 1)) {
      page += h.index;
      load();
    }
    return true;
  case Action::ExhibitionSelect:
    if (h.index >= 0 && size_t(h.index) < list.size()) {
      exhibitionIndex = h.index;
      synchronizeExhibition();
      repaint();
    }
    return true;
  case Action::ExhibitionReset:
    resetExhibition(exhibition);
    return true;
  case Action::ExhibitionFocus:
    exhibitionFocus = !exhibitionFocus;
    layout();
    return true;
  case Action::ExhibitionOpen:
    if (!list.empty()) {
      auto target = list[exhibitionIndex];
      int index = -1;
      for (size_t n = 0; n < works.size(); n++)
        if (mr::text(works[n], "id") == mr::text(target, "id"))
          index = int(n);
      if (index < 0) {
        index = int(works.size());
        works.push_back(target);
      }
      exhibitionFocus = false;
      select(index);
    }
    return true;
  case Action::BrowseHome:
    if (h.index == -2) {
      portfolioWall = !portfolioWall;
      repaint();
    } else if (h.index == -1) {
      homeWall = !homeWall;
      repaint();
    } else {
      type.clear();
      navigate(0);
    }
    return true;
  case Action::Portfolio: {
    auto creator = detail.is_object() ? detail.value("creator", Json::object()) : loginUser;
    openPortfolio(mr::text(creator, "handle"));
    return true;
  }
  default:
    return false;
  }
}
void App::layoutShowcase() {
  float x = std::max(32.f, (width - 1320) / 2), w = width - x * 2;
  bool show = (mode == 11 || mode == 1) && !aside;
  float top = mode == 1 ? 330.f : 350.f;
  float stageHeight = std::clamp((height - 78) * .47f, 290.f, 420.f);
  if ((mode == 1 ? works.empty() : featured.empty()) && !exhibitionLoading && !loading)
    stageHeight = mode == 11 ? 64.f : 128.f;
  if (exhibitionFocus) {
    top = 154;
    stageHeight = height - 332;
  }
  float y = top - scroll;
  stageBounds = D2D1::RectF(x, y, x + w, y + stageHeight);
  // Clip the OpenGL child below the fixed top navigation when the page scrolls.
  bool visible = show && !((mode == 11 && featured.empty()) || (mode == 1 && works.empty())) &&
                 y + stageHeight > 82 && y < height - 44;
  place(exhibition, x + 1, y, w - 2, stageHeight, visible);
  if (exhibition && visible) {
    auto region = CreateRectRgn(0, int(std::max(0.f, 82 - y) * scale), int((w - 2) * scale),
                                int(std::min(stageHeight, height - 44 - y) * scale));
    if (!SetWindowRgn(exhibition, region, FALSE))
      DeleteObject(region);
  }
  if (workPreview) {
    auto left = nav + 32, right = width - aside - 26;
    place(workPreview, left, 166, std::max(1.f, right - left), std::max(1.f, height - 270),
          workroom());
  }
  if (mode == 11 || mode == 1 || mode == 12) {
    place(search, 0, 0, 1, 1, false);
    place(subjects, 0, 0, 1, 1, false);
    for (int i = 0; i < 8; i++)
      place(buttons[300 + i], 0, 0, 1, 1, false);
    place(buttons[107], 0, 0, 1, 1, false);
    place(buttons[102], 0, 0, 1, 1, false);
    place(buttons[105], 0, 0, 1, 1, false);
    place(buttons[106], 0, 0, 1, 1, false);
  }
  if (workroom()) {
    place(search, 0, 0, 1, 1, false);
    place(subjects, 0, 0, 1, 1, false);
    for (int i = 0; i < 8; i++)
      place(buttons[300 + i], 0, 0, 1, 1, false);
    for (int id : {102, 105, 106, 107})
      place(buttons[id], 0, 0, 1, 1, false);
  }
}
} // namespace mr
