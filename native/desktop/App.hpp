#pragma once
#include "../common/Resources.hpp"
#include "Windows.hpp"
#include <condition_variable>
#include <d2d1helper.h>
#include <deque>
#include <functional>
#include <map>
#include <mutex>
#include <set>
#include <thread>
namespace mr {
constexpr UINT eventMessage = WM_APP + 31;
struct Pool {
  std::mutex mutex;
  std::condition_variable changed;
  std::deque<std::function<void()>> queue;
  bool stop = false;
  std::vector<std::thread> threads;
  explicit Pool(int);
  ~Pool();
  void add(std::function<void()>);
};
enum class Operation {
  Catalogue,
  Detail,
  Health,
  Image,
  Auth,
  Model,
  Picture,
  Media,
  Upload,
  Download,
  Progress
};
struct Event {
  Operation operation = Operation::Health;
  bool ok = true, sensitive = false;
  int generation = 0, account = 0, id = 0, status = 0;
  Json value;
  std::string key, error;
  Pixels pixels;
  std::shared_ptr<Model> model;
  std::filesystem::path file;
};
void post(HWND, std::unique_ptr<Event>);
template <class F>
void dispatch(Pool &pool, HWND h, Operation op, int gen, int account, bool sensitive, F fn) {
  pool.add([=]() mutable {
    auto e = std::make_unique<Event>();
    e->operation = op;
    e->generation = gen;
    e->account = account;
    e->sensitive = sensitive;
    try {
      fn(*e);
    } catch (const HttpError &x) {
      e->ok = false;
      e->status = x.status;
    } catch (...) {
      e->ok = false;
    }
    post(h, std::move(e));
  });
}
Json payload(const Json &);
uint64_t number(const Json &, const char *, uint64_t fallback = 0);
std::string uniqueName();
std::shared_ptr<Model> safeDecode(const std::vector<unsigned char> &);
struct Palette {
  uint32_t bg, panel, raised, text, muted, line, accent, onAccent;
};
Palette palette(int);
COLORREF gdi(uint32_t);
enum class Action {
  Card,
  Download,
  Model,
  Picture,
  Media,
  Web,
  Continue,
  Close,
  Folder,
  Cancel,
  RetryDetail
};
struct Hit {
  D2D1_RECT_F rect;
  Action action;
  int index = 0;
};
struct Job {
  int id = 0;
  std::wstring title, name;
  std::filesystem::path file;
  double progress = 0;
  bool done = false, failed = false, cancelled = false;
  std::shared_ptr<std::atomic_bool> cancel = std::make_shared<std::atomic_bool>(false);
};
class App {
public:
  HWND hwnd = nullptr, search = nullptr, subjects = nullptr;
  HFONT font = nullptr;
  HBRUSH editBrush = nullptr;
  std::map<int, HWND> buttons;
  ID2D1Factory *factory = nullptr;
  IDWriteFactory *writer = nullptr;
  ID2D1HwndRenderTarget *target = nullptr;
  ID2D1SolidColorBrush *brush = nullptr;
  std::map<int, IDWriteTextFormat *> formats;
  std::map<std::string, ID2D1Bitmap *> images;
  std::set<std::string> pendingImages, failedImages;
  Pool io{2}, imageIO{3}, transfers{2};
  Http http;
  Preferences prefs;
  Palette colors;
  Json works = Json::array(), detail, loginUser, pagination = Json::object(),
       counts = Json::object();
  std::vector<Hit> hits;
  std::vector<Job> jobs;
  std::string token, type, subject, query, lastError, detailError, pendingWork, pendingAsset;
  int mode = 0, page = 1, generation = 0, detailGen = 0, account = 0, nextJob = 1, hover = -1,
      afterLogin = 0, previewGeneration = -1, selectedIndex = -1;
  bool loading = false, detailLoading = false, uploading = false, authBusy = false,
       cppReady = false, healthPending = false, wall = false, tracking = false, dragging = false,
       down = false;
  float scale = 1, width = 1300, height = 900, nav = 202, content = 1098, aside = 0, gridTop = 300,
        scroll = 0, maxScroll = 0, detailScroll = 0, detailHeight = 0, worldX = 0, worldY = 0,
        downX = 0, downY = 0;
  POINT mouse{}, downPoint{};
  explicit App(std::wstring);
  ~App();
  std::wstring copy(const char *) const;
  std::wstring title(const Json &) const;
  bool translate(MSG &);
  void create();
  void preferences();
  void layout();
  void paint();
  void repaint();
  void load();
  void select(int);
  void clearSelection();
  void image(const std::string &, const std::string &fallback = {});
  void signIn(int after = 0);
  void clearLogin(bool);
  void publish(const Json &existing = Json{});
  void download(int);
  void model();
  void picture();
  void media();
  void event(Event &);
  void activate(Hit);
  void button(int);
  void info(const char *);
  LRESULT message(UINT, WPARAM, LPARAM);
  void place(HWND, float, float, float, float, bool visible = true);
  IDWriteTextFormat *format(float, bool bold = false);
  float measure(const std::wstring &, float size = 12);
  float textHeight(const std::wstring &, float, float);
  void text(const std::wstring &, D2D1_RECT_F, float, uint32_t, bool bold = false);
  void fill(D2D1_RECT_F, uint32_t, float radius = 0, float opacity = 1);
  void border(D2D1_RECT_F, uint32_t, float radius = 0, float thickness = 1);
  void action(const std::wstring &, D2D1_RECT_F, Action, int index = 0, bool primary = false);
  void bitmap(const std::string &, D2D1_RECT_F, const std::string &fallback = {});
  void card(const Json &, D2D1_RECT_F, int);
  void details();
  std::string cover(const Json &) const;
  std::optional<Hit> at(float, float);
};
} // namespace mr
