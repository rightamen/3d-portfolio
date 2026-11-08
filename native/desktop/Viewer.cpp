#include "Windows.hpp"
#include <GL/gl.h>
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <dwmapi.h>
#include <memory>
#include <windowsx.h>
namespace mr {
namespace {
struct Viewer {
  HWND hwnd = nullptr;
  HDC dc = nullptr;
  HGLRC context = nullptr;
  std::shared_ptr<Model> model;
  Pixels picture;
  std::vector<GLuint> textures;
  ID2D1Factory *factory = nullptr;
  ID2D1HwndRenderTarget *target = nullptr;
  ID2D1Bitmap *bitmap = nullptr;
  float yaw = -25, pitch = 8, distance = 3.1f, panX = 0, panY = 0, zoom = 1;
  POINT last{};
  int drag = 0, lang = 0;
  bool wire = false, materials = true, embedded = false;
  ~Viewer() {
    if (context) {
      wglMakeCurrent(dc, context);
      for (auto t : textures)
        if (t)
          glDeleteTextures(1, &t);
      wglMakeCurrent(nullptr, nullptr);
      wglDeleteContext(context);
    }
    if (dc && hwnd)
      ReleaseDC(hwnd, dc);
    if (bitmap)
      bitmap->Release();
    if (target)
      target->Release();
    if (factory)
      factory->Release();
  }
  void setup() {
    if (!model)
      return;
    dc = GetDC(hwnd);
    PIXELFORMATDESCRIPTOR p{sizeof(p), 1};
    p.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
    p.iPixelType = PFD_TYPE_RGBA;
    p.cColorBits = 32;
    p.cDepthBits = 24;
    p.iLayerType = PFD_MAIN_PLANE;
    int format = ChoosePixelFormat(dc, &p);
    if (!format || !SetPixelFormat(dc, format, &p))
      throw std::runtime_error("OpenGL unavailable");
    context = wglCreateContext(dc);
    if (!context || !wglMakeCurrent(dc, context))
      throw std::runtime_error("OpenGL unavailable");
    glEnable(GL_DEPTH_TEST);
    glEnable(GL_NORMALIZE);
    glEnable(GL_LIGHT0);
    glEnable(GL_COLOR_MATERIAL);
    glColorMaterial(GL_FRONT_AND_BACK, GL_AMBIENT_AND_DIFFUSE);
    GLfloat ambient[] = {.35f, .38f, .42f, 1}, diffuse[] = {.86f, .9f, .9f, 1};
    glLightModelfv(GL_LIGHT_MODEL_AMBIENT, ambient);
    glLightfv(GL_LIGHT0, GL_DIFFUSE, diffuse);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glEnable(GL_ALPHA_TEST);
    glAlphaFunc(GL_GREATER, .05f);
    for (const auto &mesh : model->meshes) {
      GLuint texture = 0;
      if (!mesh.texture.empty())
        try {
          GLint maximum = 1024;
          glGetIntegerv(GL_MAX_TEXTURE_SIZE, &maximum);
          auto pixels = decodeImage(mesh.texture, unsigned(std::clamp(maximum, 1, 4096)));
          for (size_t n = 0; n < pixels.data.size(); n += 4) {
            auto b = pixels.data[n], r = pixels.data[n + 2], a = pixels.data[n + 3];
            pixels.data[n] = a ? BYTE(std::min(255u, unsigned(r) * 255 / a)) : 0;
            pixels.data[n + 1] =
                a ? BYTE(std::min(255u, unsigned(pixels.data[n + 1]) * 255 / a)) : 0;
            pixels.data[n + 2] = a ? BYTE(std::min(255u, unsigned(b) * 255 / a)) : 0;
          }
          glGenTextures(1, &texture);
          glBindTexture(GL_TEXTURE_2D, texture);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
          glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
          glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, int(pixels.width), int(pixels.height), 0, GL_RGBA,
                       GL_UNSIGNED_BYTE, pixels.data.data());
          if (glGetError() != GL_NO_ERROR) {
            glDeleteTextures(1, &texture);
            texture = 0;
          }
        } catch (...) {
          texture = 0;
        }
      textures.push_back(texture);
    }
  }
  void drawModel(int w, int h) {
    if (!context)
      return;
    wglMakeCurrent(dc, context);
    glViewport(0, 42, w, std::max(1, h - 42));
    auto appearance =
        palette(int(reinterpret_cast<INT_PTR>(GetPropW(GetParent(hwnd), L"MRTheme"))));
    glClearColor(float((appearance.bg >> 16) & 255) / 255, float((appearance.bg >> 8) & 255) / 255,
                 float(appearance.bg & 255) / 255, 1);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    double nearPlane = .01, half = nearPlane * std::tan(42.0 * 3.141592653589793 / 360),
           aspect = double(w) / std::max(1, h - 42);
    glFrustum(-half * aspect, half * aspect, -half, half, nearPlane, 100);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glTranslatef(panX, panY, -distance);
    glRotatef(pitch, 1, 0, 0);
    glRotatef(yaw, 0, 1, 0);
    glDisable(GL_LIGHTING);
    glDisable(GL_TEXTURE_2D);
    glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);
    glColor4f(float((appearance.line >> 16) & 255) / 255, float((appearance.line >> 8) & 255) / 255,
              float(appearance.line & 255) / 255, .7f);
    glBegin(GL_LINES);
    for (int n = -12; n <= 12; n++) {
      float x = n * .25f;
      glVertex3f(x, -1.03f, -3);
      glVertex3f(x, -1.03f, 3);
      glVertex3f(-3, -1.03f, x);
      glVertex3f(3, -1.03f, x);
    }
    glEnd();
    glEnable(GL_LIGHTING);
    GLfloat light[] = {3, 5, 4, 0};
    glLightfv(GL_LIGHT0, GL_POSITION, light);
    glScalef(1 / model->radius, 1 / model->radius, 1 / model->radius);
    glTranslatef(-model->center[0], -model->center[1], -model->center[2]);
    glPolygonMode(GL_FRONT_AND_BACK, wire ? GL_LINE : GL_FILL);
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_NORMAL_ARRAY);
    for (size_t i = 0; i < model->meshes.size(); i++) {
      const auto &m = model->meshes[i];
      if (m.vertices.empty())
        continue;
      if (materials && textures[i] && !wire) {
        glEnable(GL_TEXTURE_2D);
        glBindTexture(GL_TEXTURE_2D, textures[i]);
        glEnableClientState(GL_TEXTURE_COORD_ARRAY);
        glTexCoordPointer(2, GL_FLOAT, sizeof(Vertex), &m.vertices[0].u);
      } else {
        glDisable(GL_TEXTURE_2D);
        glDisableClientState(GL_TEXTURE_COORD_ARRAY);
      }
      if (materials && !wire)
        glColor4fv(m.color.data());
      else
        glColor4f(.76f, .77f, .84f, 1);
      glVertexPointer(3, GL_FLOAT, sizeof(Vertex), &m.vertices[0].x);
      glNormalPointer(GL_FLOAT, sizeof(Vertex), &m.vertices[0].nx);
      glDrawElements(GL_TRIANGLES, GLsizei(m.indices.size()), GL_UNSIGNED_INT, m.indices.data());
    }
    glDisableClientState(GL_VERTEX_ARRAY);
    glDisableClientState(GL_NORMAL_ARRAY);
    glDisableClientState(GL_TEXTURE_COORD_ARRAY);
    glDisable(GL_TEXTURE_2D);
    glDisable(GL_LIGHTING);
    glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);
    SwapBuffers(dc);
  }
  void drawPicture(int w, int h) {
    if (!factory && FAILED(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &factory)))
      return;
    if (!target) {
      if (FAILED(factory->CreateHwndRenderTarget(
              D2D1::RenderTargetProperties(),
              D2D1::HwndRenderTargetProperties(hwnd, D2D1::SizeU(w, h)), &target)))
        return;
      target->SetDpi(96, 96);
      if (FAILED(target->CreateBitmap(
              D2D1::SizeU(picture.width, picture.height), picture.data.data(), picture.width * 4,
              D2D1::BitmapProperties(
                  D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED)),
              &bitmap)))
        return;
    }
    target->Resize(D2D1::SizeU(w, h));
    target->BeginDraw();
    target->Clear(D2D1::ColorF(
        palette(int(reinterpret_cast<INT_PTR>(GetPropW(GetParent(hwnd), L"MRTheme")))).bg));
    float fit = std::min(float(w - 40) / picture.width, float(h - 80) / picture.height) * zoom;
    float iw = picture.width * fit, ih = picture.height * fit;
    target->DrawBitmap(bitmap,
                       D2D1::RectF((w - iw) / 2 + panX, (h - 42 - ih) / 2 + panY,
                                   (w + iw) / 2 + panX, (h - 42 + ih) / 2 + panY),
                       1, D2D1_BITMAP_INTERPOLATION_MODE_LINEAR);
    target->EndDraw();
  }
  static LRESULT CALLBACK proc(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    auto v = reinterpret_cast<Viewer *>(GetWindowLongPtrW(h, GWLP_USERDATA));
    if (msg == WM_NCCREATE) {
      v = static_cast<Viewer *>(reinterpret_cast<CREATESTRUCTW *>(lp)->lpCreateParams);
      v->hwnd = h;
      SetWindowLongPtrW(h, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(v));
    }
    if (!v)
      return DefWindowProcW(h, msg, wp, lp);
    switch (msg) {
    case WM_CREATE:
      try {
        v->setup();
      } catch (...) {
        return -1;
      }
      return 0;
    case WM_ERASEBKGND:
      return 1;
    case WM_PAINT: {
      PAINTSTRUCT p;
      auto dc = BeginPaint(h, &p);
      RECT r;
      GetClientRect(h, &r);
      if (v->model)
        v->drawModel(r.right, r.bottom);
      else
        v->drawPicture(r.right, r.bottom);
      RECT foot{0, r.bottom - 42, r.right, r.bottom};
      auto appearance = palette(int(reinterpret_cast<INT_PTR>(GetPropW(GetParent(h), L"MRTheme"))));
      auto brush = CreateSolidBrush(gdi(appearance.panel));
      FillRect(dc, &foot, brush);
      DeleteObject(brush);
      SetBkMode(dc, TRANSPARENT);
      SetTextColor(dc, gdi(appearance.muted));
      auto font =
          CreateFontW(-int(12 * GetDpiForWindow(h) / 96.f), 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                      DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
      auto old = SelectObject(dc, font);
      foot.left = 18;
      DrawTextW(dc, label(v->lang, v->model ? "modelHelp" : "imageHelp"), -1, &foot,
                DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS);
      SelectObject(dc, old);
      DeleteObject(font);
      EndPaint(h, &p);
      return 0;
    }
    case WM_SIZE:
      InvalidateRect(h, nullptr, FALSE);
      return 0;
    case WM_LBUTTONDOWN:
    case WM_RBUTTONDOWN:
      SetFocus(h);
      v->drag = msg == WM_LBUTTONDOWN ? 1 : 2;
      v->last = {GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
      SetCapture(h);
      return 0;
    case WM_LBUTTONUP:
    case WM_RBUTTONUP:
      v->drag = 0;
      ReleaseCapture();
      return 0;
    case WM_MOUSEMOVE:
      if (v->drag) {
        POINT p{GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
        float dx = float(p.x - v->last.x), dy = float(p.y - v->last.y);
        if (v->model && v->drag == 1) {
          v->yaw += dx * .5f;
          v->pitch = std::clamp(v->pitch + dy * .5f, -88.f, 88.f);
        } else if (v->model) {
          v->panX += dx * .003f * v->distance;
          v->panY -= dy * .003f * v->distance;
        } else {
          v->panX += dx;
          v->panY += dy;
        }
        v->last = p;
        InvalidateRect(h, nullptr, FALSE);
      }
      return 0;
    case WM_MOUSEWHEEL: {
      float amount = GET_WHEEL_DELTA_WPARAM(wp) / 120.f;
      if (v->model)
        v->distance = std::clamp(v->distance * std::pow(.88f, amount), .12f, 30.f);
      else
        v->zoom = std::clamp(v->zoom * std::pow(1.15f, amount), .1f, 20.f);
      InvalidateRect(h, nullptr, FALSE);
      return 0;
    }
    case WM_GETDLGCODE:
      return DLGC_WANTARROWS | DLGC_WANTCHARS;
    case WM_KEYDOWN:
      if (wp == VK_ESCAPE) {
        if (v->embedded) {
          SendMessageW(GetParent(h), WM_KEYDOWN, VK_ESCAPE, 0);
          return 0;
        }
        DestroyWindow(h);
        return 0;
      }
      if (wp == 'F')
        v->wire = !v->wire;
      if (wp == 'M')
        v->materials = !v->materials;
      if (wp == 'R') {
        v->yaw = -25;
        v->pitch = 8;
        v->distance = 3.1f;
        v->panX = v->panY = 0;
        v->zoom = 1;
      }
      if (wp == VK_LEFT)
        v->yaw -= 5;
      if (wp == VK_RIGHT)
        v->yaw += 5;
      if (wp == VK_UP)
        v->pitch -= 5;
      if (wp == VK_DOWN)
        v->pitch += 5;
      InvalidateRect(h, nullptr, FALSE);
      return 0;
    case WM_DPICHANGED: {
      auto r = reinterpret_cast<RECT *>(lp);
      SetWindowPos(h, nullptr, r->left, r->top, r->right - r->left, r->bottom - r->top,
                   SWP_NOZORDER);
      return 0;
    }
    case WM_NCDESTROY:
      SetWindowLongPtrW(h, GWLP_USERDATA, 0);
      delete v;
      return DefWindowProcW(h, msg, wp, lp);
    }
    return DefWindowProcW(h, msg, wp, lp);
  }
};
void launch(HWND parent, Viewer *v, const std::wstring &title) {
  static bool registered = false;
  if (!registered) {
    WNDCLASSW c{};
    c.style = CS_OWNDC;
    c.lpfnWndProc = Viewer::proc;
    c.hInstance = GetModuleHandleW(nullptr);
    c.lpszClassName = L"MRNativePreview";
    c.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    RegisterClassW(&c);
    registered = true;
  }
  v->lang = int(reinterpret_cast<INT_PTR>(GetPropW(parent, L"MRLanguage")));
  auto h = CreateWindowExW(0, L"MRNativePreview", title.c_str(), WS_OVERLAPPEDWINDOW, CW_USEDEFAULT,
                           CW_USEDEFAULT, 1100, 780, parent, nullptr, GetModuleHandleW(nullptr), v);
  if (!h)
    return;
  BOOL dark = TRUE;
  DwmSetWindowAttribute(h, 20, &dark, sizeof(dark));
  ShowWindow(h, SW_SHOW);
  UpdateWindow(h);
}
} // namespace
void showModel(HWND p, std::shared_ptr<Model> model, const std::wstring &title) {
  auto v = new Viewer;
  v->model = std::move(model);
  launch(p, v, title);
}
HWND createEmbeddedModel(HWND parent, std::shared_ptr<Model> model) {
  WNDCLASSW c{};
  c.style = CS_OWNDC;
  c.lpfnWndProc = Viewer::proc;
  c.hInstance = GetModuleHandleW(nullptr);
  c.lpszClassName = L"MRInlineModel";
  c.hCursor = LoadCursorW(nullptr, IDC_SIZEALL);
  RegisterClassW(&c);
  auto v = new Viewer;
  v->embedded = true;
  v->model = std::move(model);
  v->lang = int(reinterpret_cast<INT_PTR>(GetPropW(parent, L"MRLanguage")));
  return CreateWindowExW(0, c.lpszClassName, label(v->lang, "view3d"),
                         WS_CHILD | WS_CLIPSIBLINGS | WS_TABSTOP, 0, 0, 1, 1, parent, nullptr,
                         c.hInstance, v);
}
void showPicture(HWND p, const Pixels &pixels, const std::wstring &title) {
  auto v = new Viewer;
  v->picture = pixels;
  launch(p, v, title);
}
} // namespace mr
