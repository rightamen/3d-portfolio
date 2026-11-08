#include "App.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
namespace mr {
namespace {
std::wstring messageTime(const Json &j) {
  auto s = mr::text(j, "createdAt");
  unsigned y = 0, m = 0, d = 0, h = 0, min = 0, sec = 0;
  if (std::sscanf(s.c_str(), "%u-%u-%uT%u:%u:%u", &y, &m, &d, &h, &min, &sec) != 6)
    return wide(s);
  SYSTEMTIME utc{}, local{};
  utc.wYear = WORD(y);
  utc.wMonth = WORD(m);
  utc.wDay = WORD(d);
  utc.wHour = WORD(h);
  utc.wMinute = WORD(min);
  utc.wSecond = WORD(sec);
  if (!SystemTimeToTzSpecificLocalTime(nullptr, &utc, &local))
    local = utc;
  wchar_t result[32];
  std::swprintf(result, 32, L"%02u/%02u %02u:%02u", unsigned(local.wMonth), unsigned(local.wDay),
                unsigned(local.wHour), unsigned(local.wMinute));
  return result;
}
Json obj(const Json &j, const char *k) {
  auto i = j.find(k);
  return i != j.end() && i->is_object() ? *i : Json::object();
}
} // namespace
void App::spaceLayout() {
  bool discover = mode == 8 && space.tab == 5;
  float tabX = nav + 28, tabY = 190;
  if (discover) {
    for (auto key :
         {"friends", "friendRequests", "following", "followers", "outgoing", "discoverPeople"}) {
      float tw = measure(copy(key), 11) + 30;
      if (tabX + tw > nav + content - 28 && tabX > nav + 28) {
        tabX = nav + 28;
        tabY += 41;
      }
      tabX += tw + 8;
    }
    place(search, nav + 28, tabY + 49, content - 56, 34, true);
  }
  bool chat = mode == 6 && !token.empty() && space.thread.is_object();
  float left = nav + 28 + std::min(270.f, content * .32f) + 22;
  place(composer, left, height - 148, std::max(140.f, nav + content - left - 154), 72, chat);
  place(buttons[205], nav + content - 126, height - 148, 98, 72, chat);
  bool send = chat && canSendMessage(obj(space.thread, "thread")) && !space.busy;
  EnableWindow(composer, send);
  EnableWindow(buttons[205], send);
  place(folders, nav + 28, 193, std::min(280.f, content - 56), 220, mode == 5 && !token.empty());
  if (mode == 5) {
    auto selected = space.folder;
    SendMessageW(folders, CB_RESETCONTENT, 0, 0);
    SendMessageW(folders, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(copy("allFavorites").c_str()));
    int index = 0;
    for (size_t i = 0; i < space.folders.size(); i++) {
      auto &f = space.folders[i];
      auto name = wide(mr::text(f, "name")) + L"  " + std::to_wstring(number(f, "count"));
      SendMessageW(folders, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(name.c_str()));
      if (mr::text(f, "id") == selected)
        index = int(i) + 1;
    }
    SendMessageW(folders, CB_SETCURSEL, index, 0);
  }
}
void App::paintSpace() {
  float x = nav + 28, right = nav + content - 28, top = 190, bottom = height - 65, w = right - x;
  space.bodyTop = top;
  auto panel = [&](float y, float h) {
    auto r = D2D1::RectF(x, y, right, y + h);
    fill(r, colors.panel, 14);
    border(r, colors.line, 14);
    return r;
  };
  auto tag = [&](const char *k, float l, float y, Action a, int index = 0, float width = 100) {
    action(copy(k), D2D1::RectF(l, y, l + width, y + 34), a, index);
  };
  auto tabs = [&](const std::vector<const char *> &keys) {
    float l = x, y = top;
    for (size_t i = 0; i < keys.size(); i++) {
      float width = measure(copy(keys[i]), 11) + 30;
      if (l + width > right && l > x) {
        l = x;
        y += 41;
      }
      auto r = D2D1::RectF(l, y, l + width, y + 32);
      fill(r, space.tab == int(i) ? colors.raised : colors.bg, 8);
      border(r, space.tab == int(i) ? colors.accent : colors.line, 8);
      text(copy(keys[i]), D2D1::RectF(l + 14, y + 8, l + width - 7, y + 30), 11,
           space.tab == int(i) ? colors.text : colors.muted);
      hits.push_back({r, Action::Tab, int(i)});
      l += width + 8;
    }
    return y + 49;
  };
  if (token.empty() && !(mode == 8 && space.tab == 5)) {
    panel(top, 260);
    fill(D2D1::RectF(x + 24, top + 26, x + 70, top + 72), colors.raised, 12);
    text(L"MR", D2D1::RectF(x + 31, top + 37, x + 66, top + 67), 17, colors.accent, true);
    text(copy("workspaceGate"), D2D1::RectF(x + 25, top + 96, right - 24, top + 143), 26,
         colors.text, true);
    text(copy("workspaceGateBody"), D2D1::RectF(x + 26, top + 155, right - 220, top + 229), 13,
         colors.muted);
    action(copy("login"), D2D1::RectF(right - 183, top + 182, right - 25, top + 224),
           Action::Navigate, -1, true);
    maxScroll = 0;
    return;
  }
  if (mode == 5) {
    float y = 239;
    tag("folderNew", x, y, Action::FolderNew, 0, 120);
    if (!space.folder.empty()) {
      tag("rename", x + 130, y, Action::FolderRename, 0, 100);
      tag("deleteFolder", x + 240, y, Action::FolderDelete, 0, 110);
    }
    if (!space.error.empty())
      text(copy(space.error.c_str()), D2D1::RectF(x + 365, y + 7, right, y + 34), 11, colors.muted);
    return;
  }
  target->PushAxisAlignedClip(D2D1::RectF(x - 2, top, right + 2, bottom),
                              D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
  if (loading) {
    text(copy("loading"), D2D1::RectF(x, top + 35, right, top + 80), 17, colors.muted);
    target->PopAxisAlignedClip();
    return;
  }

  float y = top - scroll;
  if (mode == 4) {
    auto analytics = obj(space.data, "analytics"), totals = obj(analytics, "totals");
    panel(y, 139);
    text(copy("welcome") + L" " + wide(mr::text(loginUser, "displayName")),
         D2D1::RectF(x + 24, y + 20, right - 250, y + 62), 24, colors.text, true);
    text(copy("workspaceIntro"), D2D1::RectF(x + 25, y + 77, right - 245, y + 116), 12,
         colors.muted);
    action(copy("publish"), D2D1::RectF(right - 211, y + 48, right - 25, y + 91), Action::Navigate,
           101, true);
    y += 157;
    const char *labels[] = {"metricWorks", "metricFavorites", "metricDownloads", "metricOrders"};
    const char *keys[] = {"works", "favorites", "downloads", "paid"};
    float gap = 14, cw = (w - gap * 3) / 4;
    for (int i = 0; i < 4; i++) {
      float l = x + i * (cw + gap);
      fill(D2D1::RectF(l, y, l + cw, y + 118), colors.panel, 12);
      border(D2D1::RectF(l, y, l + cw, y + 118), colors.line, 12);
      text(copy(labels[i]), D2D1::RectF(l + 18, y + 17, l + cw - 10, y + 43), 11, colors.muted);
      text(std::to_wstring(number(totals, keys[i])),
           D2D1::RectF(l + 18, y + 53, l + cw - 10, y + 104), 34, colors.text, true);
    }
    y += 136;
    float h = 280;
    panel(y, h);
    text(copy("creatorGalaxy"), D2D1::RectF(x + 24, y + 20, right, y + 51), 16, colors.text, true);
    text(copy("galaxyHelp"), D2D1::RectF(x + 24, y + 56, right, y + 85), 11, colors.muted);
    float cx = x + w * .55f, cy = y + 166;
    double t = prefs.motion ? GetTickCount64() * .00012 : 0;
    brush->SetColor(D2D1::ColorF(colors.line));
    for (float radius : {90.f, 153.f, 211.f})
      target->DrawEllipse(
          D2D1::Ellipse(D2D1::Point2F(cx, cy), std::min(radius, w * .30f), radius * .27f), brush,
          .6f);
    for (int n = 0; n < 45; n++) {
      float sx = x + 20 + float((n * 139) % 997) / 997 * (w - 40),
            sy = y + 97 + float((n * 83) % 173);
      fill(D2D1::RectF(sx, sy, sx + 1, sy + 1), colors.muted, 0, .24f);
    }
    brush->SetColor(D2D1::ColorF(colors.accent, .12f));
    target->FillEllipse(D2D1::Ellipse(D2D1::Point2F(cx, cy), 47, 47), brush);
    brush->SetColor(D2D1::ColorF(colors.accent));
    target->DrawEllipse(D2D1::Ellipse(D2D1::Point2F(cx, cy), 29, 29), brush, 1.3f);
    text(std::to_wstring(number(totals, "works")), D2D1::RectF(cx - 18, cy - 16, cx + 23, cy + 20),
         23, colors.text, true);
    for (int i = 0; i < 4; i++) {
      float angle = float(t + i * 1.7), radius = std::min(118.f + i * 25, w * .29f),
            px = cx + std::cos(angle) * radius, py = cy + std::sin(angle) * radius * .34f;
      auto n = number(totals, keys[i]);
      float size = 6 + std::min(12.f, float(std::sqrt(double(n))));
      brush->SetColor(D2D1::ColorF(colors.accent, .14f));
      target->FillEllipse(D2D1::Ellipse(D2D1::Point2F(px, py), size + 8, size + 8), brush);
      brush->SetColor(D2D1::ColorF(colors.accent));
      target->FillEllipse(D2D1::Ellipse(D2D1::Point2F(px, py), size, size), brush);
      text(copy(labels[i]), D2D1::RectF(px + 16, py - 8, px + 140, py + 20), 10, colors.muted);
    }
    y += h + 18;
    panel(y, 242);
    text(copy("trend"), D2D1::RectF(x + 24, y + 20, right - 300, y + 52), 16, colors.text, true);
    int d[3] = {7, 30, 90};
    float l = right - 274;
    for (int i = 0; i < 3; i++) {
      auto rect = D2D1::RectF(l + i * 82, y + 17, l + i * 82 + 74, y + 48);
      fill(rect, space.days == d[i] ? colors.raised : colors.bg, 7);
      text(std::to_wstring(d[i]) + copy("days"),
           D2D1::RectF(rect.left + 12, rect.top + 8, rect.right, rect.bottom), 11, colors.muted);
      hits.push_back({rect, Action::Tab, d[i]});
    }
    auto series = analytics.value("series", Json::array());
    double peak = 1;
    for (auto &s : series)
      peak = std::max(peak, double(std::max(number(s, "orders"), number(s, "downloads"))));
    float bw = (w - 52) / std::max<size_t>(1, series.size());
    for (size_t i = 0; i < series.size(); i++) {
      float l = x + 26 + i * bw, b = y + 200;
      float a = float(number(series[i], "orders") / peak) * 126,
            c = float(number(series[i], "downloads") / peak) * 126;
      fill(D2D1::RectF(l, b - std::max(1.f, a), l + bw * .35f, b), 0xb8a681, 1);
      fill(D2D1::RectF(l + bw * .42f, b - std::max(1.f, c), l + bw * .78f, b), colors.accent, 1);
    }
    text(copy("trendLegend"), D2D1::RectF(x + 24, y + 211, right, y + 238), 10, colors.muted);
    y += 260;
    text(copy("performance"), D2D1::RectF(x, y, right, y + 31), 17, colors.text, true);
    y += 47;
    auto list = analytics.value("works", Json::array());
    for (size_t i = 0; i < list.size(); i++) {
      auto &w = list[i];
      auto m = obj(w, "metrics");
      fill(D2D1::RectF(x, y, right, y + 72), colors.panel, 10);
      bitmap(cover(w), D2D1::RectF(x + 12, y + 10, x + 66, y + 62), mr::text(w, "image"));
      text(title(w), D2D1::RectF(x + 82, y + 14, right - 280, y + 57), 13, colors.text, true);
      text(copy("metricFavorites") + L" " + std::to_wstring(number(m, "favorites")) + L"   " +
               copy("metricDownloads") + L" " + std::to_wstring(number(m, "downloads")),
           D2D1::RectF(right - 265, y + 24, right - 16, y + 52), 11, colors.muted);
      hits.push_back({D2D1::RectF(x, y, right, y + 72), Action::Card, int(i)});
      y += 84;
    }
    if (list.empty()) {
      text(copy("noWorksYet"), D2D1::RectF(x, y, right, y + 60), 14, colors.muted);
      y += 80;
    }
  } else if (mode == 6) {
    y = tabs({"inbox", "messageRequests"});
    tag("newMessage", right - 136, y - 49, Action::NewMessage, 0, 136);
    float split = x + std::min(270.f, content * .32f);
    auto threads = space.data.value("threads", Json::array());
    space.bodyTop = y;
    target->PushAxisAlignedClip(D2D1::RectF(x, y, split, bottom),
                                D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
    float listY = y - scroll;
    for (size_t i = 0; i < threads.size(); i++) {
      auto &t = threads[i];
      auto peer = obj(t, "peer");
      auto r = D2D1::RectF(x, listY, split - 12, listY + 86);
      fill(r, mr::text(t, "id") == space.threadId ? colors.raised : colors.panel, 10);
      border(r, colors.line, 10);
      text(wide(mr::text(peer, "displayName", utf8(copy("unavailable")))),
           D2D1::RectF(x + 14, listY + 12, split - 46, listY + 38), 13, colors.text, true);
      auto last = obj(t, "lastMessage");
      text(wide(mr::text(last, "body")), D2D1::RectF(x + 14, listY + 43, split - 25, listY + 75),
           11, colors.muted);
      if (number(t, "unread"))
        fill(D2D1::RectF(split - 35, listY + 17, split - 27, listY + 25), colors.accent, 4);
      hits.push_back({r, Action::Thread, int(i)});
      listY += 96;
    }
    if (threads.empty())
      text(copy("inboxEmpty"), D2D1::RectF(x, y + 25, split - 12, y + 125), 13, colors.muted);
    maxScroll = std::max(0.f, listY + scroll - bottom);
    target->PopAxisAlignedClip();
    float l = split + 10;
    if (space.threadLoading && space.thread.is_null())
      text(copy("loading"), D2D1::RectF(l, y + 26, right, y + 80), 14, colors.muted);
    else if (space.thread.is_object()) {
      auto thread = obj(space.thread, "thread"), peer = obj(thread, "peer");
      text(wide(mr::text(peer, "displayName", utf8(copy("unavailable")))),
           D2D1::RectF(l, y, right - 136, y + 33), 19, colors.text, true);
      tag(thread.value("blockedByMe", false) ? "unblockMessages" : "blockMessages", right - 122, y,
          Action::BlockMessage, 0, 122);
      float header = y + 44;
      if (mr::text(thread, "status") == "pending" && mr::text(thread, "direction") == "incoming" &&
          !thread.value("blocked", false)) {
        tag("accept", l, header, Action::AcceptMessage);
        tag("decline", l + 110, header, Action::DeclineMessage);
        header += 45;
      } else if (!canSendMessage(thread)) {
        text(copy("messageWaiting"), D2D1::RectF(l, header, right, header + 42), 11, colors.muted);
        header += 44;
      }
      if (space.thread.value("hasOlder", false)) {
        tag("olderMessages", l, header, Action::OlderMessages, 0, 150);
        header += 45;
      }
      auto messages = space.thread.value("messages", Json::array());
      float limit = height - 165, total = 0, maxWidth = std::max(90.f, (right - l) * .82f);
      for (auto &m : messages)
        total += std::max(32.f, textHeight(wide(mr::text(m, "body")), 13, maxWidth - 28)) + 48;
      space.threadMaxScroll = std::max(0.f, total - (limit - header));
      space.threadScroll = std::clamp(space.threadScroll, 0.f, space.threadMaxScroll);
      space.visibleSeq = 0;
      float sy = std::min(header, limit - total) + space.threadScroll;
      target->PushAxisAlignedClip(D2D1::RectF(l, header, right, limit),
                                  D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
      for (auto &m : messages) {
        auto body = wide(mr::text(m, "body"));
        float h = std::max(32.f, textHeight(body, 13, maxWidth - 28)),
              left = m.value("mine", false) ? right - maxWidth : l;
        fill(D2D1::RectF(left, sy, left + maxWidth, sy + h + 20),
             m.value("mine", false) ? colors.raised : colors.panel, 12);
        text(body, D2D1::RectF(left + 14, sy + 10, left + maxWidth - 13, sy + h + 16), 13,
             colors.text);
        auto stamp = messageTime(m);
        if (m.value("mine", false) && number(m, "seq") <= number(thread, "peerReadSeq"))
          stamp += L" · " + copy("messageRead");
        text(stamp, D2D1::RectF(left + 4, sy + h + 25, left + maxWidth, sy + h + 44), 9,
             colors.muted);
        if (sy >= header && sy + h + 20 <= limit)
          space.visibleSeq = std::max(space.visibleSeq, number(m, "seq"));
        sy += h + 48;
      }
      target->PopAxisAlignedClip();
      text(copy("sendHint"), D2D1::RectF(l, height - 72, right, height - 52), 9, colors.muted);
    } else
      text(copy("chooseConversation"), D2D1::RectF(l, y + 70, right, y + 140), 16, colors.muted);
    y = bottom;
  } else if (mode == 7) {
    y = tabs({"allUpdates", "workUpdates", "noticeUpdates", "postUpdates", "resourceUpdates"});
    tag("markRead", right - 140, y, Action::ReadFeed, 0, 140);
    y += 50;
    space.bodyTop = y;
    target->PushAxisAlignedClip(D2D1::RectF(x, y, right, bottom),
                                D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
    y -= scroll;
    auto list = space.data.value("items", Json::array());
    for (size_t i = 0; i < list.size(); i++) {
      auto &it = list[i];
      auto author = obj(it, "author");
      auto body = wide(mr::text(it, "body"));
      float h = std::min(100.f, textHeight(body, 13, w - 180));
      fill(D2D1::RectF(x, y, right, y + h + 116), colors.panel, 14);
      border(D2D1::RectF(x, y, right, y + h + 116), colors.line, 14);
      text(wide(mr::text(author, "displayName")) + L"  @" + wide(mr::text(author, "handle")),
           D2D1::RectF(x + 20, y + 17, right - 80, y + 42), 11, colors.muted);
      text(wide(mr::text(it, "title")), D2D1::RectF(x + 20, y + 48, right - 155, y + 83), 18,
           colors.text, true);
      text(body, D2D1::RectF(x + 20, y + 87, right - 155, y + 89 + h), 13, colors.muted);
      if (!mr::text(it, "image").empty())
        bitmap(mr::text(it, "image"), D2D1::RectF(right - 135, y + 49, right - 18, y + h + 93));
      if (it.value("unread", false))
        fill(D2D1::RectF(right - 30, y + 21, right - 23, y + 28), colors.accent, 4);
      hits.push_back({D2D1::RectF(x, y, right, y + h + 116), Action::FeedItem, int(i)});
      y += h + 132;
    }
    if (list.empty()) {
      text(copy("feedEmpty"), D2D1::RectF(x, y + 30, right, y + 100), 16, colors.muted);
      y += 120;
    }
    target->PopAxisAlignedClip();
  } else if (mode == 8) {
    y = tabs({"friends", "friendRequests", "following", "followers", "outgoing", "discoverPeople"});
    if (space.tab == 5)
      y += 46;
    space.bodyTop = y;
    target->PushAxisAlignedClip(D2D1::RectF(x, y, right, bottom),
                                D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
    y -= scroll;
    auto people = space.data.value(space.tab == 5 ? "creators" : "connections", Json::array());
    for (size_t i = 0; i < people.size(); i++) {
      auto &p = people[i];
      auto user = space.tab == 5 ? p : obj(p, "user");
      fill(D2D1::RectF(x, y, right, y + 100), colors.panel, 12);
      border(D2D1::RectF(x, y, right, y + 100), colors.line, 12);
      fill(D2D1::RectF(x + 17, y + 20, x + 71, y + 74), colors.raised, 27);
      bitmap(mr::text(user, "avatarUrl"), D2D1::RectF(x + 17, y + 20, x + 71, y + 74));
      auto name = wide(mr::text(user, "displayName", utf8(copy("unavailable"))));
      text(name, D2D1::RectF(x + 88, y + 20, right - 250, y + 48), 16, colors.text, true);
      text(L"@" + wide(mr::text(user, "handle")), D2D1::RectF(x + 88, y + 54, right - 250, y + 81),
           11, colors.muted);
      if (space.tab == 1) {
        tag("accept", right - 220, y + 32, Action::FriendAccept, int(i));
        tag("decline", right - 110, y + 32, Action::FriendDecline, int(i));
      } else if (space.tab == 4)
        tag("cancel", right - 110, y + 32, Action::FriendCancel, int(i));
      else
        tag("viewCreator", right - 150, y + 32, Action::Person, int(i), 132);
      y += 114;
    }
    if (people.empty()) {
      text(copy("connectionsEmpty"), D2D1::RectF(x, y + 30, right, y + 105), 15, colors.muted);
      y += 120;
    }
    target->PopAxisAlignedClip();
  } else if (mode == 9) {
    auto p = obj(space.data, "profile");
    panel(y, 270);
    text(wide(mr::text(p, "displayName")), D2D1::RectF(x + 26, y + 25, right - 220, y + 76), 29,
         colors.text, true);
    text(L"@" + wide(mr::text(p, "handle")), D2D1::RectF(x + 28, y + 89, right - 200, y + 120), 13,
         colors.accent);
    text(wide(mr::text(p, "bio")), D2D1::RectF(x + 28, y + 143, right - 200, y + 220), 14,
         colors.muted);
    tag("editProfile", right - 180, y + 34, Action::EditProfile, 0, 152);
    y += 290;
    panel(y, 150);
    text(copy("appearance"), D2D1::RectF(x + 25, y + 23, right, y + 55), 18, colors.text, true);
    text(copy("appearanceBody"), D2D1::RectF(x + 25, y + 76, right - 220, y + 127), 13,
         colors.muted);
    action(copy("settings"), D2D1::RectF(right - 190, y + 64, right - 25, y + 103),
           Action::Navigate, 103);
    y += 170;
  } else if (mode == 10) {
    y = tabs({"purchaseOrders", "salesOrders"});
    space.bodyTop = y;
    target->PushAxisAlignedClip(D2D1::RectF(x, y, right, bottom),
                                D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
    y -= scroll;
    auto list = space.data.value("orders", Json::array());
    for (size_t i = 0; i < list.size(); i++) {
      auto &o = list[i];
      fill(D2D1::RectF(x, y, right, y + 93), colors.panel, 12);
      text(wide(mr::text(o, "workTitle", mr::text(o, "id"))),
           D2D1::RectF(x + 20, y + 17, right - 210, y + 50), 15, colors.text, true);
      text(wide(mr::text(o, "status")), D2D1::RectF(x + 20, y + 56, right - 210, y + 82), 11,
           colors.muted);
      text(money(number(o, "amountCents"), mr::text(o, "currency")),
           D2D1::RectF(right - 185, y + 29, right - 20, y + 65), 17, colors.accent);
      hits.push_back({D2D1::RectF(x, y, right, y + 93), Action::OrderItem, int(i)});
      y += 107;
    }
    if (list.empty()) {
      text(copy("ordersEmpty"), D2D1::RectF(x, y + 30, right, y + 95), 15, colors.muted);
      y += 120;
    }
  }
  if (mode == 10)
    target->PopAxisAlignedClip();
  if (mode != 6)
    maxScroll = std::max(0.f, y + scroll - bottom + 16);
  target->PopAxisAlignedClip();
  if (!space.error.empty())
    text(copy(space.error.c_str()), D2D1::RectF(x + 120, height - 59, right - 120, height - 15), 11,
         0xd99b80);
}
} // namespace mr
