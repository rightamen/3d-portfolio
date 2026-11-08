#include "Exhibition.hpp"
#include <GL/gl.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <map>
#include <windowsx.h>
namespace mr {
namespace {
constexpr double pi = 3.141592653589793;
struct StageTexture {
  GLuint name = 0;
  float aspect = 1, uMax = 1, vMax = 1;
};
struct PanelHit {
  int index;
  float depth;
  std::array<POINT, 4> points;
};
struct Exhibition {
  HWND hwnd = nullptr;
  HDC dc = nullptr;
  HGLRC context = nullptr;
  Json works = Json::array();
  std::map<std::string, StageTexture> textures;
  std::vector<PanelHit> hits;
  int selected = 0, theme = 0, hover = -1, drag = 0;
  bool motion = true, moved = false, probe = false;
  float yaw = 0, pitch = 4, distance = 5.2f, travel = 0, targetTravel = 0;
  POINT last{}, origin{};
  uint64_t frames = 0, visualHash = 0;
  unsigned drawErrors = 0;
  ~Exhibition() {
    if (context) {
      wglMakeCurrent(dc, context);
      for (auto &[k, t] : textures)
        if (t.name)
          glDeleteTextures(1, &t.name);
      wglMakeCurrent(nullptr, nullptr);
      wglDeleteContext(context);
    }
    if (dc && hwnd)
      ReleaseDC(hwnd, dc);
  }
  std::string key(const Json &w) {
    auto t = text(w, "thumbnail");
    return t.empty() ? text(w, "image") : t;
  }
  void color(unsigned c, float a = 1) {
    glColor4f(float((c >> 16) & 255) / 255, float((c >> 8) & 255) / 255, float(c & 255) / 255, a);
  }
  void quad(float x, float y, float z, float w, float h, unsigned c) {
    color(c);
    glBegin(GL_QUADS);
    glVertex3f(x, y, z);
    glVertex3f(x + w, y, z);
    glVertex3f(x + w, y + h, z);
    glVertex3f(x, y + h, z);
    glEnd();
  }
  bool setup() {
    dc = GetDC(hwnd);
    PIXELFORMATDESCRIPTOR p{sizeof(p), 1};
    p.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
    p.iPixelType = PFD_TYPE_RGBA;
    p.cColorBits = 32;
    p.cDepthBits = 24;
    p.iLayerType = PFD_MAIN_PLANE;
    int f = ChoosePixelFormat(dc, &p);
    if (!f || !SetPixelFormat(dc, f, &p))
      return false;
    context = wglCreateContext(dc);
    return context && wglMakeCurrent(dc, context);
  }
  void image(const std::string &url, const Pixels &p) {
    bool used = false;
    for (auto &w : works)
      if (key(w) == url)
        used = true;
    if (!used || !p.width || !p.height)
      return;
    wglMakeCurrent(dc, context);
    auto &t = textures[url];
    if (t.name)
      glDeleteTextures(1, &t.name);
    std::vector<unsigned char> rgba(p.data);
    for (size_t i = 0; i + 3 < rgba.size(); i += 4) {
      auto a = rgba[i + 3], b = rgba[i], r = rgba[i + 2];
      rgba[i] = a ? BYTE(std::min(255u, unsigned(r) * 255 / a)) : 0;
      rgba[i + 1] = a ? BYTE(std::min(255u, unsigned(rgba[i + 1]) * 255 / a)) : 0;
      rgba[i + 2] = a ? BYTE(std::min(255u, unsigned(b) * 255 / a)) : 0;
    }
    glGenTextures(1, &t.name);
    glBindTexture(GL_TEXTURE_2D, t.name);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP);
    unsigned tw = 1, th = 1;
    while (tw < p.width)
      tw *= 2;
    while (th < p.height)
      th *= 2;
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, tw, th, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, p.width, p.height, GL_RGBA, GL_UNSIGNED_BYTE,
                    rgba.data());
    t.uMax = float(p.width) / tw;
    t.vMax = float(p.height) / th;
    t.aspect = float(p.width) / p.height;
    wglMakeCurrent(nullptr, nullptr);
    InvalidateRect(hwnd, nullptr, FALSE);
  }
  POINT project(float x, float y, float z, int width, int height, float &depth) {
    GLdouble m[16], p[16], v[4] = {x, y, z, 1}, a[4] = {}, b[4] = {};
    glGetDoublev(GL_MODELVIEW_MATRIX, m);
    glGetDoublev(GL_PROJECTION_MATRIX, p);
    for (int r = 0; r < 4; r++)
      for (int c = 0; c < 4; c++)
        a[r] += m[c * 4 + r] * v[c];
    for (int r = 0; r < 4; r++)
      for (int c = 0; c < 4; c++)
        b[r] += p[c * 4 + r] * a[c];
    double iw = std::abs(b[3]) > .0001 ? 1 / b[3] : 0;
    depth = float(b[2] * iw);
    return {LONG((b[0] * iw * .5 + .5) * width), LONG((.5 - b[1] * iw * .5) * height)};
  }
  void draw() {
    if (!context)
      return;
    RECT r{};
    GetClientRect(hwnd, &r);
    int w = std::max(1L, r.right), h = std::max(1L, r.bottom);
    wglMakeCurrent(dc, context);
    glViewport(0, 0, w, h);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_TEXTURE_2D);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glOrtho(0, 1, 0, 1, -1, 1);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glBegin(GL_QUADS);
    color(theme == 2 ? 0xe1dfe5 : theme == 1 ? 0x111b2e : 0x10121c);
    glVertex2f(0, 0);
    glVertex2f(1, 0);
    color(theme == 2 ? 0xf2f0f6 : theme == 1 ? 0x1b2741 : 0x242634);
    glVertex2f(1, 1);
    glVertex2f(0, 1);
    glEnd();
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glBegin(GL_POINTS);
    for (int n = 0; n < 50; n++) {
      color(theme == 2 ? 0x787181 : 0xb8b5d8, .22f);
      glVertex2f(float((n * 113) % 997) / 997, float((n * 67) % 503) / 503);
    }
    glEnd();
    glEnable(GL_DEPTH_TEST);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    double nearPlane = .1, half = nearPlane * std::tan(35 * pi / 360), aspect = double(w) / h;
    glFrustum(-half * aspect, half * aspect, -half, half, nearPlane, 60);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glTranslatef(0, .10f, -distance);
    glRotatef(pitch, 1, 0, 0);
    glRotatef(yaw, 0, 1, 0);
    glPushMatrix();
    glTranslatef(0, -1.4f, -1.2f);
    quad(-14, 0, -14, 28, 0, 0); // floor is drawn in the XZ plane below
    color(theme == 2 ? 0xdad8e0 : 0x0d1018);
    glBegin(GL_QUADS);
    glVertex3f(-20, 0, -20);
    glVertex3f(-20, 0, 20);
    glVertex3f(20, 0, 20);
    glVertex3f(20, 0, -20);
    glEnd();
    for (int ring = 0; ring < 3; ring++) {
      color(theme == 2 ? 0xa39cac : theme == 1 ? 0x5a7099 : 0x7c789b, ring == 0 ? .5f : .16f);
      glBegin(GL_LINE_LOOP);
      float radius = 4.0f + ring * .75f;
      for (int n = 0; n < 128; n++) {
        float a = float(n * 2 * pi / 128);
        glVertex3f(std::cos(a) * radius, .005f, std::sin(a) * radius);
      }
      glEnd();
    }
    glPopMatrix();
    hits.clear();
    int count = int(works.size());
    for (int index = 0; index < count; index++) {
      float offset = index - travel;
      while (offset > count / 2.f)
        offset -= count;
      while (offset < -count / 2.f)
        offset += count;
      if (std::abs(offset) > 2.2f)
        continue;
      float angle = offset * .69f;
      bool active = index == selected;
      float size = active ? 1.05f : .94f;
      float py = active ? .08f : -.06f;
      glPushMatrix();
      glTranslatef(std::sin(angle) * 3.8f, py, (std::cos(angle) - 1) * 3.8f);
      glRotatef(-angle * 180 / float(pi), 0, 1, 0);
      if (index == hover && motion)
        glRotatef(-1.3f, 1, 0, 0);
      glScalef(size, size, size);
      // Broad translucent contact shadow and a beveled metallic frame.
      glPushMatrix();
      glTranslatef(0, -1.36f, 0);
      glRotatef(-90, 1, 0, 0);
      color(0x000000, .16f);
      glBegin(GL_TRIANGLE_FAN);
      glVertex3f(0, 0, -.02f);
      for (int n = 0; n <= 48; n++) {
        float a = float(n * 2 * pi / 48);
        glVertex3f(std::cos(a) * 1.7f, std::sin(a) * .28f, -.02f);
      }
      glEnd();
      glPopMatrix();
      unsigned metal =
          active ? (theme == 1 ? 0x95b6df : 0xb4aecf) : (theme == 2 ? 0xa6a1b1 : 0x4b4e64);
      quad(-1.32f, -1.04f, -.08f, 2.64f, 2.08f, metal);
      quad(-1.285f, -1.005f, -.06f, 2.57f, 2.01f, theme == 2 ? 0xd3cfdf : 0x292c3a);
      quad(-1.255f, -.975f, -.04f, 2.51f, 1.95f, 0x080a10);
      auto it = textures.find(key(works[index]));
      if (it != textures.end() && it->second.name) {
        auto &t = it->second;
        float iw = 2.40f, ih = 1.84f;
        if (t.aspect > iw / ih)
          ih = iw / t.aspect;
        else
          iw = ih * t.aspect;
        glEnable(GL_TEXTURE_2D);
        glBindTexture(GL_TEXTURE_2D, t.name);
        color(active || index == hover ? 0xffffff : 0xb0b5cb);
        glBegin(GL_QUADS);
        glTexCoord2f(0, t.vMax);
        glVertex3f(-iw / 2, -ih / 2, 0);
        glTexCoord2f(t.uMax, t.vMax);
        glVertex3f(iw / 2, -ih / 2, 0);
        glTexCoord2f(t.uMax, 0);
        glVertex3f(iw / 2, ih / 2, 0);
        glTexCoord2f(0, 0);
        glVertex3f(-iw / 2, ih / 2, 0);
        glEnd();
        glDisable(GL_TEXTURE_2D);
      }
      if (active)
        quad(-.15f, -1.12f, 0, .30f, .018f, theme == 1 ? 0x9dc4ff : 0xd7cff5);
      PanelHit hit{};
      hit.index = index;
      float depth = 0;
      hit.points[0] = project(-1.32f, -1.04f, 0, w, h, depth);
      hit.points[1] = project(1.32f, -1.04f, 0, w, h, depth);
      hit.points[2] = project(1.32f, 1.04f, 0, w, h, depth);
      hit.points[3] = project(-1.32f, 1.04f, 0, w, h, depth);
      hit.depth = depth;
      hits.push_back(hit);
      glPopMatrix();
    }
    std::sort(hits.begin(), hits.end(), [](auto &a, auto &b) { return a.depth < b.depth; });
    if (probe) {
      std::array<unsigned char, 32 * 24 * 3> sample{};
      glReadPixels(std::max(0, w / 2 - 16), std::max(0, h / 2 - 12), std::min(32, w),
                   std::min(24, h), GL_RGB, GL_UNSIGNED_BYTE, sample.data());
      visualHash = 1469598103934665603ull;
      for (auto value : sample) {
        visualHash ^= value;
        visualHash *= 1099511628211ull;
      }
    }
    if (glGetError() != GL_NO_ERROR)
      drawErrors++;
    SwapBuffers(dc);
    wglMakeCurrent(nullptr, nullptr);
    frames++;
  }
  int hit(POINT p) {
    for (auto &h : hits) {
      bool positive = false, negative = false;
      for (int n = 0; n < 4; n++) {
        auto a = h.points[n], b = h.points[(n + 1) % 4];
        auto cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        positive |= cross > 0;
        negative |= cross < 0;
      }
      if (!(positive && negative))
        return h.index;
    }
    return -1;
  }
  void animate() {
    if (!motion) {
      travel = targetTravel;
      KillTimer(hwnd, 1);
    } else
      SetTimer(hwnd, 1, 16, nullptr);
    InvalidateRect(hwnd, nullptr, FALSE);
  }
  static LRESULT CALLBACK proc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    auto v = reinterpret_cast<Exhibition *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    if (msg == WM_NCCREATE) {
      v = static_cast<Exhibition *>(reinterpret_cast<CREATESTRUCTW *>(lp)->lpCreateParams);
      v->hwnd = hwnd;
      SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(v));
    }
    if (!v)
      return DefWindowProcW(hwnd, msg, wp, lp);
    switch (msg) {
    case WM_CREATE:
      return v->setup() ? 0 : -1;
    case WM_ERASEBKGND:
      return 1;
    case WM_PAINT: {
      PAINTSTRUCT ps{};
      BeginPaint(hwnd, &ps);
      v->draw();
      EndPaint(hwnd, &ps);
      return 0;
    }
    case WM_SIZE:
      InvalidateRect(hwnd, nullptr, FALSE);
      return 0;
    case WM_TIMER:
      if (!IsWindowVisible(hwnd) || !IsWindowEnabled(GetParent(hwnd)) ||
          IsIconic(GetParent(hwnd))) {
        KillTimer(hwnd, 1);
        return 0;
      }
      v->travel += (v->targetTravel - v->travel) * .2f;
      if (std::abs(v->travel - v->targetTravel) < .002f) {
        v->travel = v->targetTravel;
        KillTimer(hwnd, 1);
      }
      InvalidateRect(hwnd, nullptr, FALSE);
      return 0;
    case WM_LBUTTONDOWN:
      v->drag = 1;
      v->moved = false;
      v->last = v->origin = {GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
      SetFocus(hwnd);
      SetCapture(hwnd);
      return 0;
    case WM_MOUSEMOVE: {
      POINT p{GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
      if (v->drag) {
        float dx = float(p.x - v->last.x), dy = float(p.y - v->last.y);
        if (std::abs(p.x - v->origin.x) + std::abs(p.y - v->origin.y) > 5)
          v->moved = true;
        if (v->moved) {
          v->yaw = std::clamp(v->yaw + dx * .18f, -55.f, 55.f);
          v->pitch = std::clamp(v->pitch + dy * .16f, -18.f, 32.f);
          InvalidateRect(hwnd, nullptr, FALSE);
        }
        v->last = p;
      } else {
        int hover = v->hit(p);
        if (hover != v->hover) {
          v->hover = hover;
          InvalidateRect(hwnd, nullptr, FALSE);
        }
        TRACKMOUSEEVENT t{sizeof(t), TME_LEAVE, hwnd, 0};
        TrackMouseEvent(&t);
      }
      return 0;
    }
    case WM_MOUSELEAVE:
      v->hover = -1;
      InvalidateRect(hwnd, nullptr, FALSE);
      return 0;
    case WM_LBUTTONUP:
      if (v->drag && !v->moved) {
        int index = v->hit({GET_X_LPARAM(lp), GET_Y_LPARAM(lp)});
        if (index >= 0)
          SendMessageW(GetParent(hwnd), exhibitionMessage, index, 0);
      }
      v->drag = 0;
      ReleaseCapture();
      return 0;
    case WM_CAPTURECHANGED:
      v->drag = 0;
      return 0;
    case WM_MOUSEWHEEL:
      if (!(wp & MK_CONTROL)) {
        SendMessageW(GetParent(hwnd), msg, wp, lp);
        return 0;
      }
      v->distance =
          std::clamp(v->distance * std::pow(.91f, GET_WHEEL_DELTA_WPARAM(wp) / 120.f), 3.6f, 10.f);
      InvalidateRect(hwnd, nullptr, FALSE);
      return 0;
    case WM_KEYDOWN:
      if (wp == VK_LEFT || wp == VK_RIGHT) {
        int n = int(v->works.size());
        if (n)
          SendMessageW(GetParent(hwnd), exhibitionMessage,
                       (v->selected + (wp == VK_RIGHT ? 1 : n - 1)) % n, 0);
      } else
        SendMessageW(GetParent(hwnd), WM_KEYDOWN, wp, lp);
      return 0;
    case WM_GETDLGCODE:
      return DLGC_WANTARROWS;
    case WM_DESTROY:
      KillTimer(hwnd, 1);
      return 0;
    case WM_NCDESTROY:
      SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
      delete v;
      return DefWindowProcW(hwnd, msg, wp, lp);
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
  }
};
Exhibition *get(HWND h) {
  return h ? reinterpret_cast<Exhibition *>(GetWindowLongPtrW(h, GWLP_USERDATA)) : nullptr;
}
} // namespace
HWND createExhibition(HWND parent) {
  WNDCLASSW c{};
  c.style = CS_OWNDC;
  c.lpfnWndProc = Exhibition::proc;
  c.hInstance = GetModuleHandleW(nullptr);
  c.lpszClassName = L"MRSpatialExhibition";
  c.hCursor = LoadCursorW(nullptr, IDC_HAND);
  RegisterClassW(&c);
  return CreateWindowExW(0, c.lpszClassName, L"3D exhibition",
                         WS_CHILD | WS_CLIPSIBLINGS | WS_TABSTOP, 0, 0, 1, 1, parent, nullptr,
                         c.hInstance, new Exhibition);
}
void setExhibition(HWND h, const Json &works, int selected, int theme, bool motion) {
  if (auto v = get(h)) {
    bool changed = v->works != works;
    v->works = works;
    v->theme = theme;
    v->motion = motion;
    v->selected = std::clamp(selected, 0, std::max(0, int(works.size()) - 1));
    float target = float(v->selected);
    int n = int(works.size());
    if (n) {
      while (target - v->travel > n / 2.f)
        target -= n;
      while (target - v->travel < -n / 2.f)
        target += n;
    }
    v->targetTravel = target;
    if (changed)
      v->travel = target;
    for (auto it = v->textures.begin(); it != v->textures.end();) {
      bool used = false;
      for (auto &w : works)
        if (v->key(w) == it->first)
          used = true;
      if (!used) {
        wglMakeCurrent(v->dc, v->context);
        glDeleteTextures(1, &it->second.name);
        wglMakeCurrent(nullptr, nullptr);
        it = v->textures.erase(it);
      } else
        ++it;
    }
    v->animate();
  }
}
void exhibitionImage(HWND h, const std::string &key, const Pixels &p) {
  if (auto v = get(h))
    v->image(key, p);
}
bool exhibitionHasImage(HWND h, const std::string &key) {
  auto v = get(h);
  return v && v->textures.contains(key);
}
void resetExhibition(HWND h) {
  if (auto v = get(h)) {
    v->yaw = 0;
    v->pitch = 4;
    v->distance = 5.2f;
    InvalidateRect(h, nullptr, FALSE);
  }
}
void probeExhibition(HWND h, bool on) {
  if (auto v = get(h))
    v->probe = on;
}
Json exhibitionState(HWND h) {
  if (auto v = get(h))
    return {{"works", v->works.size()},    {"selected", v->selected},       {"yaw", v->yaw},
            {"pitch", v->pitch},           {"distance", v->distance},       {"frames", v->frames},
            {"visualHash", v->visualHash}, {"drawErrors", v->drawErrors},   {"theme", v->theme},
            {"motion", v->motion},         {"textures", v->textures.size()}};
  return Json::object();
}
} // namespace mr
