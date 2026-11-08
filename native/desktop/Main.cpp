#include "App.hpp"
#include <algorithm>
#include <fstream>
#include <shellapi.h>
namespace mr {
Pool::Pool(int count) {
  for (int n = 0; n < count; n++)
    threads.emplace_back([this] {
      CoInitializeEx(nullptr, COINIT_MULTITHREADED);
      for (;;) {
        std::function<void()> job;
        {
          std::unique_lock lock(mutex);
          changed.wait(lock, [&] { return stop || !queue.empty(); });
          if (stop)
            break;
          job = std::move(queue.front());
          queue.pop_front();
        }
        try {
          job();
        } catch (...) {
        }
      }
      CoUninitialize();
    });
}
Pool::~Pool() {
  {
    std::lock_guard lock(mutex);
    stop = true;
    queue.clear();
  }
  changed.notify_all();
  for (auto &t : threads)
    if (t.joinable())
      t.join();
}
void Pool::add(std::function<void()> job) {
  {
    std::lock_guard lock(mutex);
    if (stop)
      return;
    queue.push_back(std::move(job));
  }
  changed.notify_one();
}
void post(HWND h, std::unique_ptr<Event> e) {
  if (PostMessageW(h, eventMessage, 0, reinterpret_cast<LPARAM>(e.get())))
    e.release();
}
Json payload(const Json &j) {
  return j.contains("data") && j["data"].is_object() ? j["data"] : j;
}
uint64_t number(const Json &j, const char *k, uint64_t fallback) {
  auto i = j.find(k);
  if (i == j.end() || !i->is_number_integer())
    return fallback;
  return uint64_t(std::max<int64_t>(0, i->get<int64_t>()));
}
std::string uniqueName() {
  GUID id{};
  CoCreateGuid(&id);
  wchar_t s[48];
  StringFromGUID2(id, s, 48);
  auto value = utf8(s);
  value.erase(
      std::remove_if(value.begin(), value.end(), [](char c) { return c == '{' || c == '}'; }),
      value.end());
  return value;
}
namespace {
std::wstring quote(const std::wstring &s) {
  std::wstring r = L"\"";
  size_t n = 0;
  for (auto c : s) {
    if (c == L'\\') {
      n++;
      continue;
    }
    if (c == L'"') {
      r.append(n * 2 + 1, L'\\');
      r += c;
      n = 0;
      continue;
    }
    r.append(n, L'\\');
    n = 0;
    r += c;
  }
  r.append(n * 2, L'\\');
  return r + L"\"";
}
std::wstring executable() {
  std::vector<wchar_t> b(32768);
  auto n = GetModuleFileNameW(nullptr, b.data(), DWORD(b.size()));
  return std::wstring(b.data(), n);
}
} // namespace
std::shared_ptr<Model> safeDecode(const std::vector<unsigned char> &bytes) {
  auto folder = appFolder() / L"previews";
  std::filesystem::create_directories(folder);
  auto name = wide(uniqueName());
  auto input = folder / (name + L".glb"), output = folder / (name + L".mrm");
  struct Cleanup {
    std::filesystem::path a, b;
    ~Cleanup() {
      std::error_code e;
      std::filesystem::remove(a, e);
      std::filesystem::remove(b, e);
    }
  } cleanup{input, output};
  {
    std::ofstream file(input, std::ios::binary);
    file.write(reinterpret_cast<const char *>(bytes.data()), bytes.size());
    if (!file)
      throw std::runtime_error("Could not prepare model");
  }
  auto exe = executable(), command = quote(exe) + L" --decode-model " + quote(input.wstring()) +
                                     L" " + quote(output.wstring());
  std::vector<wchar_t> cmd(command.begin(), command.end());
  cmd.push_back(0);
  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  if (!job)
    throw std::runtime_error("Decoder unavailable");
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limit{};
  limit.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_PROCESS_MEMORY |
                                           JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
                                           JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
  limit.BasicLimitInformation.ActiveProcessLimit = 1;
  limit.ProcessMemoryLimit = 512ull * 1024 * 1024;
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limit, sizeof(limit))) {
    CloseHandle(job);
    throw std::runtime_error("Decoder unavailable");
  }
  STARTUPINFOW start{sizeof(start)};
  PROCESS_INFORMATION process{};
  if (!CreateProcessW(exe.c_str(), cmd.data(), nullptr, nullptr, FALSE,
                      CREATE_NO_WINDOW | CREATE_SUSPENDED, nullptr, nullptr, &start, &process)) {
    CloseHandle(job);
    throw std::runtime_error("Decoder unavailable");
  }
  if (!AssignProcessToJobObject(job, process.hProcess)) {
    TerminateProcess(process.hProcess, 1);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    CloseHandle(job);
    throw std::runtime_error("Decoder unavailable");
  }
  ResumeThread(process.hThread);
  DWORD wait = WaitForSingleObject(process.hProcess, 30000), exit = 1;
  if (wait == WAIT_OBJECT_0)
    GetExitCodeProcess(process.hProcess, &exit);
  else
    TerminateJobObject(job, 1);
  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  CloseHandle(job);
  if (exit)
    throw std::runtime_error("Model decode failed");
  return std::make_shared<Model>(loadModel(output));
}
int decodeMode(const std::filesystem::path &input, const std::filesystem::path &output) {
  try {
    if (std::filesystem::file_size(input) > 128 * 1024 * 1024)
      return 3;
    std::ifstream file(input, std::ios::binary);
    std::vector<unsigned char> b((std::istreambuf_iterator<char>(file)), {});
    saveModel(decodeGlb(b), output);
    return 0;
  } catch (...) {
    return 3;
  }
}
LRESULT CALLBACK procedure(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
  auto app = reinterpret_cast<App *>(GetWindowLongPtrW(h, GWLP_USERDATA));
  if (msg == WM_NCCREATE) {
    app = static_cast<App *>(reinterpret_cast<CREATESTRUCTW *>(lp)->lpCreateParams);
    app->hwnd = h;
    SetWindowLongPtrW(h, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(app));
  }
  if (!app)
    return DefWindowProcW(h, msg, wp, lp);
  try {
    return app->message(msg, wp, lp);
  } catch (...) {
    if (msg == WM_CREATE)
      return -1;
    return DefWindowProcW(h, msg, wp, lp);
  }
}
Json studioFixture(const std::filesystem::path &);
int designTests(const std::filesystem::path &, const std::filesystem::path &);
int studioTests(const std::filesystem::path &, const std::filesystem::path &);
int uiTests(const std::wstring &, const std::filesystem::path &);
int selfTest(const Http &, const std::filesystem::path &);
int integrationTest(const std::filesystem::path &, const std::filesystem::path &);
} // namespace mr
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int show) {
  using namespace mr;
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  int argc = 0;
  auto argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  int result = 0;
  if (argc == 4 && std::wstring(argv[1]) == L"--decode-model") {
    result = decodeMode(argv[2], argv[3]);
    LocalFree(argv);
    CoUninitialize();
    return result;
  }
  try {
    std::wstring server = L"https://mrright.blog";
    for (int n = 1; n + 1 < argc; n++)
      if (std::wstring(argv[n]) == L"--server")
        server = argv[++n];
    if (argc >= 3 && std::wstring(argv[1]) == L"--self-test") {
      result = selfTest(Http(server), argv[2]);
    } else if (argc >= 3 && std::wstring(argv[1]) == L"--ui-test") {
      result = uiTests(server, argv[2]);
    } else if (argc == 4 && std::wstring(argv[1]) == L"--integration-test") {
      result = integrationTest(argv[2], argv[3]);
    } else if (argc == 4 && std::wstring(argv[1]) == L"--design-test") {
      result = designTests(argv[2], argv[3]);
    } else if (argc == 4 && std::wstring(argv[1]) == L"--studio-test") {
      result = studioTests(argv[2], argv[3]);
    } else {
      Json fixture, user;
      if (argc == 3 && std::wstring(argv[1]) == L"--studio-preview") {
        fixture = studioFixture(argv[2]);
        server = wide(text(fixture, "server"));
        user = payload(Http(server).json(
            "POST", "/api/auth/login", "",
            {{"email", text(fixture, "email")}, {"password", text(fixture, "password")}}));
      }
      App app(server);
      if (user.is_object()) {
        app.token = text(user["session"], "token");
        app.loginUser = user["user"];
        app.mode = 4;
      }
      WNDCLASSW c{};
      c.lpfnWndProc = procedure;
      c.hInstance = instance;
      c.lpszClassName = L"MRStudioNative";
      c.hCursor = LoadCursorW(nullptr, IDC_ARROW);
      c.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
      RegisterClassW(&c);
      int w = std::min(1440, GetSystemMetrics(SM_CXSCREEN) - 90),
          h = std::min(960, GetSystemMetrics(SM_CYSCREEN) - 90);
      auto window = CreateWindowExW(0, L"MRStudioNative", L"mrright Studio",
                                    WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN, CW_USEDEFAULT,
                                    CW_USEDEFAULT, w, h, nullptr, nullptr, instance, &app);
      if (!window)
        throw std::runtime_error("Window unavailable");
      ShowWindow(window, show);
      UpdateWindow(window);
      MSG m{};
      while (GetMessageW(&m, nullptr, 0, 0) > 0) {
        if (!app.translate(m)) {
          TranslateMessage(&m);
          DispatchMessageW(&m);
        }
      }
      result = int(m.wParam);
    }
  } catch (...) {
    MessageBoxW(nullptr, L"mrright Studio could not start.", L"mrright Studio", MB_ICONERROR);
    result = 1;
  }
  LocalFree(argv);
  CoUninitialize();
  return result;
}
