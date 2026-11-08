#include "App.hpp"
#include <algorithm>
#include <cmath>
namespace mr {
void App::gradient(D2D1_RECT_F r, uint32_t a, uint32_t b, bool vertical) {
  D2D1_GRADIENT_STOP stops[] = {{0, D2D1::ColorF(a)}, {1, D2D1::ColorF(b)}};
  ID2D1GradientStopCollection *collection = nullptr;
  ID2D1LinearGradientBrush *g = nullptr;
  if (SUCCEEDED(target->CreateGradientStopCollection(stops, 2, &collection))) {
    target->CreateLinearGradientBrush(
        D2D1::LinearGradientBrushProperties(
            D2D1::Point2F(r.left, r.top),
            D2D1::Point2F(vertical ? r.left : r.right, vertical ? r.bottom : r.top)),
        collection, &g);
    if (g) {
      target->FillRectangle(r, g);
      g->Release();
    }
    collection->Release();
  }
}
void App::coverBitmap(const std::string &key, D2D1_RECT_F r, const std::string &fallback) {
  image(key, fallback);
  auto it = images.find(key);
  if (it == images.end())
    return;
  auto size = it->second->GetSize();
  float wanted = (r.right - r.left) / (r.bottom - r.top), actual = size.width / size.height;
  D2D1_RECT_F source = D2D1::RectF(0, 0, size.width, size.height);
  if (actual > wanted) {
    float sw = size.height * wanted;
    source.left = (size.width - sw) / 2;
    source.right = source.left + sw;
  } else {
    float sh = size.width / wanted;
    source.top = (size.height - sh) / 2;
    source.bottom = source.top + sh;
  }
  float blend = hover >= 0 && prefs.motion
                    ? std::clamp(float(GetTickCount64() - hoverStart) / 180, 0.f, 1.f)
                    : 1.f;
  if (hover >= 0 && tracking && mouse.x / scale >= r.left && mouse.x / scale <= r.right &&
      mouse.y / scale >= r.top && mouse.y / scale <= r.bottom) {
    float inset = (source.right - source.left) * .012f * blend;
    source.left += inset;
    source.right -= inset;
    source.top += inset;
    source.bottom -= inset;
  }
  target->DrawBitmap(it->second, r, 1, D2D1_BITMAP_INTERPOLATION_MODE_LINEAR, source);
}
void App::avatarBitmap(const std::string &key, D2D1_RECT_F r) {
  if (key.empty())
    return;
  ID2D1RoundedRectangleGeometry *mask = nullptr;
  float radius = (r.bottom - r.top) / 2;
  if (SUCCEEDED(
          factory->CreateRoundedRectangleGeometry(D2D1::RoundedRect(r, radius, radius), &mask))) {
    auto layer = D2D1::LayerParameters();
    layer.geometricMask = mask;
    target->PushLayer(layer, nullptr);
    coverBitmap(key, r);
    target->PopLayer();
    mask->Release();
  } else
    bitmap(key, r);
}
void App::paintChrome() {
  if (publicPage()) {
    fill(D2D1::RectF(0, 0, width, 79), colors.bg);
    fill(D2D1::RectF(0, 78, width, 79), colors.line);
    fill(D2D1::RectF(32, 24, 62, 54), colors.accent, 7);
    text(L"M", D2D1::RectF(37, 25, 62, 54), 22, colors.onAccent, true);
    text(L"mrright", D2D1::RectF(74, 27, 150, 57), 20, colors.text, true);
    text(L".blog", D2D1::RectF(144, 30, 195, 57), 15, colors.muted);
  } else {
    fill(D2D1::RectF(0, 0, nav, height), colors.panel);
    fill(D2D1::RectF(nav - 1, 0, nav, height), colors.line);
    fill(D2D1::RectF(nav, 65, width, 66), colors.line);
    fill(D2D1::RectF(23, 24, 53, 54), colors.accent, 8);
    text(L"M", D2D1::RectF(29, 24, 54, 54), 23, colors.onAccent, true);
    text(L"mrright", D2D1::RectF(65, 22, nav - 12, 48), 19, colors.text, true);
    text(L"CREATOR STUDIO", D2D1::RectF(65, 46, nav - 12, 65), 8, colors.muted);
    float step = std::min(42.f, std::max(31.f, (height - 300) / 10));
    text(copy("exploreGroup"), D2D1::RectF(27, 110, nav - 16, 123), 9, colors.muted);
    text(copy("createGroup"), D2D1::RectF(27, 124 + step * 2 - 3, nav - 16, 124 + step * 2 + 16), 9,
         colors.muted);
    text(copy("connectGroup"), D2D1::RectF(27, 140 + step * 5 - 3, nav - 16, 140 + step * 5 + 16),
         9, colors.muted);
    text(L"STUDIO 0.3.0", D2D1::RectF(24, height - 37, nav - 10, height - 12), 10, colors.muted);
    text(L"● " + copy(cppReady        ? "connected"
                      : healthPending ? "connecting"
                                      : "offline"),
         D2D1::RectF(nav + 28, 27, width - 340, 54), 10, cppReady ? colors.accent : colors.muted);
  }
}
void App::paintScrollBar() {
  if (maxScroll <= 0 || workroom() || mode == 6 || exhibitionFocus)
    return;
  float top = publicPage() ? 94.f : 190.f, bottom = height - 65, track = bottom - top;
  float h = std::max(35.f, track * track / (track + maxScroll)),
        y = top + (track - h) * std::clamp(scroll / maxScroll, 0.f, 1.f);
  fill(D2D1::RectF(width - 10, top, width - 7, bottom), colors.panel, 2);
  fill(D2D1::RectF(width - 10, y, width - 7, y + h), scrollBarDrag ? colors.accent : colors.muted,
       2, .6f);
}
float App::publicPager(float y) {
  bool previous = pagination.value("hasPrevious", false), next = pagination.value("hasNext", false);
  if (!previous && !next && page == 1)
    return y;
  float x = std::max(32.f, (width - 1320) / 2), right = width - x;
  if (previous)
    action(copy("previous"), D2D1::RectF(x, y, x + 112, y + 38), Action::PublicPage, -1);
  if (next)
    action(copy("next"), D2D1::RectF(right - 112, y, right, y + 38), Action::PublicPage, 1);
  text(std::to_wstring(page) + L" / " + std::to_wstring(number(pagination, "pages", 1)),
       D2D1::RectF(width / 2 - 45, y + 11, width / 2 + 45, y + 38), 12, colors.muted);
  return y + 54;
}
void App::paintHome() {
  float x = std::max(32.f, (width - 1320) / 2), right = width - x, w = right - x;
  target->PushAxisAlignedClip(D2D1::RectF(x - 1, 82, right + 1, height - 38),
                              D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
  if (!exhibitionFocus) {
    float y = 110 - scroll;
    text(L"●  MRRIGHT / CREATOR PLATFORM", D2D1::RectF(x, y, right, y + 24), 10, colors.accent);
    if (mode == 11) {
      float fs = std::clamp(width * .044f, 42.f, 62.f), line = fs * 1.25f;
      text(copy("heroLineOne"), D2D1::RectF(x, y + 35, x + w * .60f, y + 35 + line), fs,
           colors.text, true);
      text(copy("heroLineTwo"), D2D1::RectF(x, y + 35 + line, x + w * .60f, y + 40 + line * 2), fs,
           colors.accent, true);
      float support = x + w * .65f;
      text(copy("heroDescription"), D2D1::RectF(support, y + 40, right, y + 119), 14, colors.muted);
      action(copy("exploreAction") + L"  ↗", D2D1::RectF(support, y + 133, support + 150, y + 177),
             Action::BrowseHome, 0, true);
      action(copy("publish") + L"  +", D2D1::RectF(support + 163, y + 133, right, y + 177),
             Action::Navigate, 101);
    } else {
      text(copy("exhibitionHeadline"), D2D1::RectF(x, y + 34, right, y + 94), 43, colors.text,
           true);
      text(copy("exhibitionDescription"), D2D1::RectF(x, y + 108, right, y + 155), 13,
           colors.muted);
    }
  }
  auto &list = mode == 1 ? works : featured;
  auto stage = stageBounds;
  float top = stage.top - 53, bottom = stage.bottom + (list.empty() ? 12 : 158);
  fill(D2D1::RectF(x, top, right, bottom), colors.panel, 18);
  border(D2D1::RectF(x, top, right, bottom), colors.line, 18);
  text(copy("curatedKicker"), D2D1::RectF(x + 23, top + 19, right - 300, top + 43), 10,
       colors.accent);
  text(std::to_wstring(list.empty() ? 0 : exhibitionIndex + 1) + L"  /  " +
           std::to_wstring(list.size()),
       D2D1::RectF(right - 240, top + 19, right - 150, top + 45), 11, colors.muted);
  if (!list.empty())
    action(copy(exhibitionFocus ? "exitFocus" : "focusMode"),
           D2D1::RectF(right - 135, top + 10, right - 18, top + 43), Action::ExhibitionFocus);
  if (list.empty()) {
    gradient(stage, colors.raised, colors.bg);
    text(copy(exhibitionLoading || loading ? "loading"
              : exhibitionFailed           ? "offline"
                                           : "exhibitionEmpty"),
         D2D1::RectF(x + 24, stage.top + 15, right - 24, stage.bottom - 8), 18, colors.text, true);
  } else {
    auto &work = list[std::min(size_t(exhibitionIndex), list.size() - 1)];
    if (!exhibition) {
      gradient(stage, colors.raised, colors.bg);
      bitmap(cover(work),
             D2D1::RectF(x + w * .25f, stage.top + 25, right - w * .25f, stage.bottom - 25));
      text(copy("noSpatial"), D2D1::RectF(x + 20, stage.bottom - 30, right - 20, stage.bottom), 10,
           colors.muted);
    }
    float y = stage.bottom + 16;
    text(resourceLabel(prefs.language, mr::text(work, "resourceType", "model")),
         D2D1::RectF(x + 24, y, right - 400, y + 21), 10, colors.accent);
    text(title(work), D2D1::RectF(x + 23, y + 24, right - 390, y + 65), 26, colors.text, true);
    auto creator = work.value("creator", Json::object());
    text(wide(mr::text(creator, "displayName", mr::text(creator, "handle"))),
         D2D1::RectF(x + 24, y + 70, right - 390, y + 95), 12, colors.muted);
    text(copy("curatedSeal"), D2D1::RectF(right - 358, y + 32, right - 205, y + 60), 11,
         colors.accent);
    action(copy("openWork") + L"  ↗", D2D1::RectF(right - 184, y + 22, right - 23, y + 68),
           Action::ExhibitionOpen, 0, true);
    float by = stage.bottom + 107;
    action(L"←", D2D1::RectF(x + 23, by, x + 63, by + 33), Action::ExhibitionSelect,
           (exhibitionIndex + int(list.size()) - 1) % int(list.size()));
    action(L"→", D2D1::RectF(x + 72, by, x + 112, by + 33), Action::ExhibitionSelect,
           (exhibitionIndex + 1) % int(list.size()));
    float thumbX = x + w / 2 - std::min(size_t(6), list.size()) * 28;
    for (size_t i = 0; i < std::min(size_t(6), list.size()); i++) {
      auto r = D2D1::RectF(thumbX + i * 56, by - 1, thumbX + i * 56 + 47, by + 34);
      fill(r, colors.raised, 5);
      border(r, int(i) == exhibitionIndex ? colors.accent : colors.line, 5);
      bitmap(cover(list[i]), D2D1::RectF(r.left + 3, r.top + 3, r.right - 3, r.bottom - 3));
      hits.push_back({r, Action::ExhibitionSelect, int(i)});
    }
    action(copy("reset"), D2D1::RectF(right - 135, by, right - 23, by + 33),
           Action::ExhibitionReset);
  }
  if (!list.empty() && exhibition)
    text(copy("nativeStageHint"), D2D1::RectF(x + 190, top + 20, right - 270, top + 43), 9,
         colors.muted);
  if (exhibitionFocus) {
    maxScroll = 0;
    target->PopAxisAlignedClip();
    return;
  }
  if (mode == 1) {
    bottom = publicPager(bottom + 18);
    maxScroll = std::max(0.f, bottom + scroll + 30 - (height - 38));
    target->PopAxisAlignedClip();
    return;
  }
  float y = bottom + 52;
  text(L"LATEST / DISCOVER", D2D1::RectF(x, y, right, y + 24), 10, colors.accent);
  text(copy("discoverHeadline"), D2D1::RectF(x, y + 33, right - 290, y + 90), 36, colors.text,
       true);
  action(copy(homeWall ? "wall" : "list"), D2D1::RectF(right - 145, y + 40, right, y + 77),
         Action::BrowseHome, -1);
  y += 108;
  float wallTop = y, wallBottom = y + 520;
  browseBounds = D2D1::RectF(x, wallTop, right, wallBottom);
  gridTop = std::max(82.f, wallTop);
  fill(D2D1::RectF(x, wallTop, right, wallBottom), colors.panel, 14);
  border(D2D1::RectF(x, wallTop, right, wallBottom), colors.line, 14);
  if (wallTop < height - 38 && wallBottom > 82) {
    target->PushAxisAlignedClip(D2D1::RectF(x + 1, std::max(82.f, wallTop + 1), right - 1,
                                            std::min(height - 38, wallBottom - 1)),
                                D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
    if (loading || !lastError.empty() || works.empty()) {
      text(copy(loading             ? "loading"
                : lastError.empty() ? "empty"
                                    : "offline"),
           D2D1::RectF(x + 25, y + 35, right - 25, y + 115), 18, colors.muted);
    } else if (homeWall) {
      float cw = 280, ch = 228, gap = 24;
      float ox = std::fmod(worldX, cw + gap), oy = std::fmod(worldY, ch + gap);
      int cellX = int(std::floor(worldX / (cw + gap))),
          cellY = int(std::floor(worldY / (ch + gap)));
      for (int row = -1; row < 4; row++)
        for (int col = -1; col < int(w / (cw + gap)) + 2; col++) {
          float l = x + col * (cw + gap) + ox + (row % 2 ? 90 : 0), t = y + row * (ch + gap) + oy;
          if (l + cw < x || l > right || t + ch < wallTop || t > wallBottom)
            continue;
          int index = ((row - cellY) * 11 + col - cellX) % int(works.size());
          if (index < 0)
            index += int(works.size());
          card(works[index], D2D1::RectF(l, t, l + cw, t + ch), index);
        }
    } else {
      float gap = 24;
      int cols = std::max(1, int(w / 290));
      float cw = (w - gap * (cols - 1)) / cols, ch = cw * .78f;
      for (size_t i = 0; i < works.size(); i++) {
        float l = x + (i % cols) * (cw + gap), t = y + (i / cols) * (ch + gap);
        if (t > wallBottom)
          break;
        card(works[i], D2D1::RectF(l, t, l + cw, t + ch), int(i));
      }
    }
    target->PopAxisAlignedClip();
  }
  action(copy("viewLibrary") + L"  ↗", D2D1::RectF(x, wallBottom + 25, x + 190, wallBottom + 68),
         Action::BrowseHome);
  text(L"MRRIGHT / DIGITAL CREATION",
       D2D1::RectF(right - 280, wallBottom + 39, right, wallBottom + 70), 10, colors.muted);
  maxScroll = std::max(0.f, wallBottom + scroll + 110 - (height - 38));
  target->PopAxisAlignedClip();
}
void App::paintPortfolio() {
  float x = std::max(32.f, (width - 1320) / 2), right = width - x, w = right - x, y = 116 - scroll;
  target->PushAxisAlignedClip(D2D1::RectF(x, 82, right, height - 38),
                              D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
  if (loading || !lastError.empty() || !portfolio.value("profilePublic", false)) {
    text(copy(loading ? "loading" : "profileUnavailable"), D2D1::RectF(x, y + 60, right, y + 160),
         28, colors.text, true);
    maxScroll = 0;
    target->PopAxisAlignedClip();
    return;
  }
  gradient(D2D1::RectF(x, y, right, y + 238), colors.panel, colors.bg, false);
  fill(D2D1::RectF(x + 26, y + 34, x + 112, y + 120), colors.raised, 43);
  auto avatar = mr::text(portfolio, "avatarUrl");
  if (!avatar.empty())
    avatarBitmap(avatar, D2D1::RectF(x + 28, y + 36, x + 110, y + 118));
  else
    text(L"M", D2D1::RectF(x + 52, y + 55, x + 110, y + 110), 36, colors.accent, true);
  text(wide(mr::text(portfolio, "displayName", portfolioHandle)),
       D2D1::RectF(x + 140, y + 34, right - 260, y + 91), 36, colors.text, true);
  text(L"@" + wide(portfolioHandle), D2D1::RectF(x + 143, y + 97, right - 260, y + 125), 13,
       colors.accent);
  auto bio = mr::text(portfolio, "bio");
  if (bio.empty())
    bio = utf8(copy("portfolioLead"));
  text(wide(bio), D2D1::RectF(x + 143, y + 146, right - 250, y + 221), 14, colors.muted);
  if (portfolioHandle == mr::text(loginUser, "handle"))
    action(copy("editProfile"), D2D1::RectF(right - 195, y + 49, right - 22, y + 93),
           Action::Navigate, 9, true);
  else {
    action(copy(space.social.value("following", false) ? "unfollow" : "follow"),
           D2D1::RectF(right - 195, y + 49, right - 22, y + 93), Action::Follow, 0, true);
    action(copy("chat"), D2D1::RectF(right - 195, y + 107, right - 22, y + 148), Action::Chat);
  }
  y += 279;
  text(copy("portfolioWorks"), D2D1::RectF(x, y, right - 270, y + 51), 30, colors.text, true);
  text(std::to_wstring(number(pagination, "total", works.size())) + L"  /  " +
           copy("publishedWorks"),
       D2D1::RectF(right - 400, y + 14, right - 170, y + 44), 12, colors.muted);
  y += 78;
  gridTop = std::max(82.f, y);
  action(copy(portfolioWall ? "wall" : "list"), D2D1::RectF(right - 145, y - 71, right, y - 34),
         Action::BrowseHome, -2);
  if (works.empty()) {
    text(copy("noWorksYet"), D2D1::RectF(x, y + 35, right, y + 100), 16, colors.muted);
    y += 140;
  } else if (portfolioWall) {
    browseBounds = D2D1::RectF(x, y, right, y + 520);
    fill(browseBounds, colors.panel, 14);
    border(browseBounds, colors.line, 14);
    if (y < height - 38 && y + 520 > 82) {
      target->PushAxisAlignedClip(
          D2D1::RectF(x + 1, std::max(82.f, y + 1), right - 1, std::min(height - 38, y + 519)),
          D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
      float cw = 280, ch = 228, gap = 24, ox = std::fmod(worldX, cw + gap),
            oy = std::fmod(worldY, ch + gap);
      int cellX = int(std::floor(worldX / (cw + gap))),
          cellY = int(std::floor(worldY / (ch + gap)));
      for (int row = -1; row < 4; row++)
        for (int col = -1; col < int(w / (cw + gap)) + 2; col++) {
          float l = x + col * (cw + gap) + ox + (row % 2 ? 90 : 0), t = y + row * (ch + gap) + oy;
          if (l + cw < x || l > right || t + ch < y || t > y + 520)
            continue;
          int i = ((row - cellY) * 11 + col - cellX) % int(works.size());
          if (i < 0)
            i += int(works.size());
          card(works[i], D2D1::RectF(l, t, l + cw, t + ch), i);
        }
      target->PopAxisAlignedClip();
    }
    y += 520;
  } else {
    float gap = 24;
    int cols = std::max(1, int(w / 300));
    float cw = (w - gap * (cols - 1)) / cols, ch = cw * .8f;
    for (size_t i = 0; i < works.size(); i++) {
      float l = x + (i % cols) * (cw + gap), t = y + (i / cols) * (ch + gap);
      if (t + ch < 82 || t > height - 38)
        continue;
      card(works[i], D2D1::RectF(l, t, l + cw, t + ch), int(i));
    }
    y += std::ceil(float(works.size()) / cols) * (ch + gap);
  }
  y = publicPager(y + 24);
  maxScroll = std::max(0.f, y + scroll + 45 - (height - 38));
  target->PopAxisAlignedClip();
}
void App::paintWorkroom() {
  float x = nav + 32, right = width - aside - 26, top = 166, bottom = height - 104;
  action(L"←  " + copy("backToWorks"), D2D1::RectF(x, 100, x + 155, 137), Action::Close);
  text(resourceLabel(prefs.language, mr::text(detail, "resourceType", "model")),
       D2D1::RectF(x + 175, 110, right, 137), 11, colors.muted);
  gradient(D2D1::RectF(x, top, right, bottom), colors.panel, colors.raised);
  border(D2D1::RectF(x, top, right, bottom), colors.line, 14);
  if (!workPreview)
    bitmap(cover(detail), D2D1::RectF(x + 24, top + 24, right - 24, bottom - 24),
           mr::text(detail, "image"));
  auto modelUrl = mr::text(detail, "modelUrl");
  float w = right - x;
  if (!modelUrl.empty() && !workPreview && previewGeneration != detailGen)
    action(copy("view3d") + L"  ↗",
           D2D1::RectF(x, bottom + 19, x + std::min(245.f, w), bottom + 63), Action::Model, 0,
           true);
  else if (previewGeneration == detailGen)
    text(copy("preparing3d"), D2D1::RectF(x, bottom + 30, right, bottom + 65), 13, colors.accent);
  else if (!cover(detail).empty() && !workPreview)
    action(copy("imageview"), D2D1::RectF(x, bottom + 19, x + std::min(220.f, w), bottom + 63),
           Action::Picture, 0, true);
  text(copy(workPreview ? "nativeModelHint" : "workroomHint"),
       D2D1::RectF(x + std::min(270.f, w), bottom + 31, right, bottom + 68), 11, colors.muted);
  details();
  maxScroll = 0;
}
} // namespace mr
