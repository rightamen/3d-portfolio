#include "Windows.hpp"
#include "Input.hpp"
#include <algorithm>
#include <array>
#include <commdlg.h>
#include <cstring>
#include <dwmapi.h>
#include <fstream>
#include <shellapi.h>
#include <shlobj.h>
#include <sstream>
#include <uxtheme.h>
#include <webp/decode.h>
#include <wincodec.h>
namespace mr {
namespace {
struct Copy {
  const char *key;
  const wchar_t *value[3];
};
static const Copy copies[] = {
    {"cancelling", {L"正在取消…", L"Cancelling…", L"中止しています…"}},
    {"connected", {L"资源库已连接", L"Library connected", L"ライブラリ接続済み"}},
    {"connecting", {L"正在连接资源库", L"Connecting to library", L"ライブラリに接続中"}},
    {"cancelled", {L"已取消", L"Cancelled", L"キャンセル済み"}},
    {"uploadCancelled",
     {L"上传已取消，已创建的草稿和已完成的附件会保留。",
      L"Upload cancelled. Your draft and completed attachments have been kept.",
      L"アップロードを中止しました。下書きと完了済みの添付ファイルは保持されます。"}},
    {"preparing3d", {L"正在准备 3D 预览…", L"Preparing 3D preview…", L"3D プレビューを準備中…"}},
    {"library", {L"资源库", L"Library", L"ライブラリ"}},
    {"curated", {L"精选展览", L"Exhibition", L"厳選展示"}},
    {"mine", {L"我的作品", L"My works", L"自分の作品"}},
    {"downloads", {L"下载任务", L"Downloads", L"ダウンロード"}},
    {"settings", {L"应用设置", L"Settings", L"設定"}},
    {"publish", {L"发布资源", L"Publish resource", L"リソースを公開"}},
    {"login", {L"登录账号", L"Sign in", L"ログイン"}},
    {"logout", {L"退出登录", L"Sign out", L"ログアウト"}},
    {"headline",
     {L"让灵感，成为下一份作品。", L"Make room for your next idea.",
      L"次の作品につながる発想を。"}},
    {"subhead",
     {L"浏览、预览与收集创作者的数字资源。", L"Discover, preview and collect creator resources.",
      L"クリエイターのデジタル素材を探す。"}},
    {"search", {L"搜索作品、素材或创作者", L"Search resources", L"リソースを検索"}},
    {"all", {L"全部资源", L"All resources", L"すべて"}},
    {"empty",
     {L"这里还没有作品。试试其他类型或搜索词。", L"No works here. Try another type or search.",
      L"作品がありません。条件を変更してください。"}},
    {"loading", {L"正在连接资源库…", L"Connecting to the library…", L"ライブラリに接続中…"}},
    {"retry", {L"重新连接", L"Retry", L"再試行"}},
    {"view3d", {L"交互式 3D 预览", L"Interactive 3D", L"3D プレビュー"}},
    {"openweb", {L"在线详情 ↗", L"Online details ↗", L"オンライン詳細 ↗"}},
    {"download", {L"下载此文件", L"Download file", L"ファイルを保存"}},
    {"preview", {L"系统播放器预览", L"System media preview", L"システムプレーヤー"}},
    {"imageview", {L"放大图片", L"View image", L"画像を拡大"}},
    {"cancel", {L"取消", L"Cancel", L"キャンセル"}},
    {"reset", {L"重置视角", L"Reset view", L"視点リセット"}},
    {"free", {L"免费", L"Free", L"無料"}},
    {"author", {L"创作者", L"Creator", L"クリエイター"}},
    {"format", {L"格式", L"Format", L"形式"}},
    {"size", {L"大小", L"Size", L"サイズ"}},
    {"license", {L"许可", L"License", L"ライセンス"}},
    {"close", {L"关闭", L"Close", L"閉じる"}},
    {"previous", {L"上一页", L"Previous", L"前へ"}},
    {"next", {L"下一页", L"Next", L"次へ"}},
    {"refresh", {L"刷新", L"Refresh", L"更新"}},
    {"title", {L"作品标题", L"Title", L"作品タイトル"}},
    {"email", {L"邮箱", L"Email", L"メール"}},
    {"password", {L"密码", L"Password", L"パスワード"}},
    {"choose", {L"选择文件", L"Choose files", L"ファイル選択"}},
    {"source",
     {L"原文件 / 下载素材（可多选）", L"Original download files (multiple)",
      L"配布用ファイル（複数可）"}},
    {"cover", {L"封面图（可选）", L"Cover image (optional)", L"カバー画像（任意）"}},
    {"publicPreview",
     {L"公开预览（文件可公开访问）", L"Public preview (publicly accessible)",
      L"公開プレビュー（公開アクセス）"}},
    {"submitReview",
     {L"上传后提交审核", L"Submit for review after uploading", L"アップロード後に審査へ提出"}},
    {"createUpload", {L"保存并上传", L"Save and upload", L"保存してアップロード"}},
    {"required",
     {L"请填写完整信息，并选择原文件。", L"Complete the fields and choose original files.",
      L"必須項目と配布ファイルを指定してください。"}},
    {"modelPreviewRequired",
     {L"模型提交审核需要封面或公开预览；也可取消提交审核，先保存草稿。",
      L"A model needs a cover or public preview for review. Uncheck review to save a draft.",
      L"モデルの審査にはカバーまたは公開プレビューが必要です。草稿保存もできます。"}},
    {"transfer", {L"传输中", L"Transferring", L"転送中"}},
    {"uploading", {L"正在上传资源", L"Uploading resources", L"アップロード中"}},
    {"draftSaved", {L"草稿已保存", L"Draft saved", L"草稿を保存しました"}},
    {"reviewSent", {L"已提交审核", L"Submitted for review", L"審査へ提出しました"}},
    {"error",
     {L"操作未完成，请重试。", L"The operation did not finish. Please retry.",
      L"操作が完了しませんでした。再試行してください。"}},
    {"noHandle",
     {L"请先打开左下角“个人资料”，设置用户名后再发布作品。",
      L"Choose a handle in Your profile before publishing.",
      L"「プロフィール」でユーザー名を設定してください。"}},
    {"modelFailed",
     {L"此模型暂不支持原生预览，可按权限下载原文件。",
      L"This model could not be previewed natively. You can download the original with permission.",
      L"このモデルを表示できません。権限があれば原本をダウンロードできます。"}},
    {"modelHelp",
     {L"拖动旋转 · 右键平移 · 滚轮缩放 · F 线框 · M 材质 · R 重置",
      L"Drag to orbit · Right drag to pan · Wheel to zoom · F wireframe · M material · R reset",
      L"ドラッグで回転・右ドラッグで移動・ホイールでズーム・F ワイヤー・M 材質・R リセット"}},
    {"native", {L"C++ 原生工作室", L"C++ Native Studio", L"C++ ネイティブスタジオ"}},
    {"signedIn", {L"登录成功", L"Signed in", L"ログインしました"}},
    {"notSigned", {L"请先登录账号", L"Sign in to continue", L"ログインしてください"}},
    {"downloadComplete", {L"下载完成", L"Download complete", L"保存しました"}},
    {"theme", {L"界面主题", L"Theme", L"テーマ"}},
    {"dark", {L"石墨鸢尾", L"Graphite iris", L"グラファイト・アイリス"}},
    {"blue", {L"午夜蓝", L"Midnight blue", L"ミッドナイト"}},
    {"paper", {L"暖纸白", L"Warm paper", L"ペーパー"}},
    {"language", {L"界面语言", L"Language", L"言語"}},
    {"motion", {L"启用交互特效", L"Interaction effects", L"操作エフェクト"}},
    {"localPrefs",
     {L"这些设置仅保存在此设备。", L"Preferences are saved on this device.",
      L"設定はこの端末に保存されます。"}},
    {"onlineWorkspace", {L"在线工作台 ↗", L"Online workspace ↗", L"オンラインワークスペース ↗"}},
    {"files", {L"包含文件", L"Included files", L"ファイル"}},
    {"type", {L"资源类型", L"Resource type", L"リソース種類"}},
    {"status", {L"状态", L"Status", L"状態"}},
    {"draft", {L"草稿", L"Draft", L"草稿"}},
    {"review", {L"审核中", L"In review", L"審査中"}},
    {"published", {L"已发布", L"Published", L"公開済み"}},
    {"hidden", {L"已下架", L"Offline", L"公開停止"}},
    {"rejected", {L"未通过", L"Rejected", L"却下"}},
    {"continueUpload",
     {L"继续上传 / 提交审核", L"Continue upload / review", L"続けてアップロード"}},
    {"uploadKept",
     {L"上传未完成，已创建的草稿已保留，可从“我的作品”继续。",
      L"The upload did not finish. Your draft is preserved in My works.",
      L"アップロードは未完了です。草稿は自分の作品に保存されています。"}},
    {"noDownloads",
     {L"下载完成后，会在这里显示。", L"Completed downloads appear here.",
      L"保存したファイルがここに表示されます。"}},
    {"folder", {L"打开文件夹", L"Open folder", L"フォルダーを開く"}},
    {"paid",
     {L"此资源需要购买，请在在线详情完成交易后再下载。",
      L"Complete the purchase in online details before downloading.",
      L"オンライン詳細で購入後にダウンロードしてください。"}},
    {"offline", {L"连接暂时不可用", L"Connection unavailable", L"接続できません"}},
    {"list", {L"网格浏览", L"Grid view", L"グリッド"}},
    {"wall", {L"无限展墙", L"Infinite wall", L"無限ウォール"}},
    {"wallHelp",
     {L"鼠标引导视野 · 拖动浏览 · Esc 返回网格",
      L"Move the pointer to explore · Drag to pan · Esc for grid",
      L"マウスで探索・ドラッグで移動・Esc でグリッド"}},
    {"resourceModel", {L"3D 模型", L"3D models", L"3D モデル"}},
    {"resourceImage", {L"图片与插画", L"Images & illustration", L"画像・イラスト"}},
    {"resourceVideo", {L"视频与动画", L"Video & animation", L"動画・アニメ"}},
    {"resourceAudio", {L"音频与音效", L"Audio & sound", L"音声・効果音"}},
    {"resourceMaterial", {L"素材与工程包", L"Materials & projects", L"素材・プロジェクト"}},
    {"resourceDocument", {L"文档与资料", L"Documents", L"文書・資料"}},
    {"resourceOther", {L"其他资源", L"Other resources", L"その他"}},
    {"imageHelp",
     {L"滚轮缩放 · 拖动平移 · R 适应窗口", L"Wheel to zoom · Drag to pan · R to fit",
      L"ホイールで拡大・ドラッグで移動・R で全体表示"}},
    {"signinFailed",
     {L"登录失败，请检查邮箱、密码或网络连接。",
      L"Sign-in failed. Check your credentials and connection.",
      L"ログインできません。メール、パスワード、接続を確認してください。"}},
};
COLORREF color(unsigned rgb) {
  return RGB((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
}
std::wstring content(HWND h, int id) {
  HWND c = GetDlgItem(h, id);
  int n = GetWindowTextLengthW(c);
  std::wstring s(n + 1, L'\0');
  GetWindowTextW(c, s.data(), n + 1);
  s.resize(n);
  return s;
}
class Form {
public:
  HWND hwnd = nullptr, parent = nullptr;
  int lang = 0, theme = 0;
  float scale = 1;
  HFONT font = nullptr;
  HBRUSH bg = nullptr, input = nullptr;
  bool accepted = false;
  std::wstring title;
  int width, height;
  Form(HWND p, int l, int t, std::wstring name, int w, int h)
      : parent(p), lang(l), theme(t), title(std::move(name)), width(w), height(h) {}
  virtual ~Form() {
    if (font)
      DeleteObject(font);
    if (bg)
      DeleteObject(bg);
    if (input)
      DeleteObject(input);
  }
  virtual void build() = 0;
  virtual void command(int id, int code) = 0;
  int px(int x) {
    return int(x * scale);
  }
  HWND control(const wchar_t *cls, const std::wstring &text, int id, int x, int y, int w, int h,
               DWORD style = 0) {
    auto c = CreateWindowExW(0, cls, text.c_str(), WS_CHILD | WS_VISIBLE | style, px(x), px(y),
                             px(w), px(h), hwnd, reinterpret_cast<HMENU>(INT_PTR(id)),
                             GetModuleHandleW(nullptr), nullptr);
    SendMessageW(c, WM_SETFONT, reinterpret_cast<WPARAM>(font), TRUE);
    if (_wcsicmp(cls, L"COMBOBOX") == 0)
      SetWindowTheme(c, L"", L"");
    else if (theme != 2)
      SetWindowTheme(c, L"DarkMode_Explorer", nullptr);
    if (_wcsicmp(cls, L"EDIT") == 0 && !(style & ES_MULTILINE))
      centerInput(c);
    if (_wcsicmp(cls, L"EDIT") == 0) {
      auto region = CreateRoundRectRgn(0, 0, px(w) + 1, px(h) + 1, px(12), px(12));
      if (!SetWindowRgn(c, region, FALSE))
        DeleteObject(region);
    }
    return c;
  }
  void labelAt(const char *key, int y) {
    control(L"STATIC", mr::label(lang, key), 0, 28, y, width - 60, 24);
  }
  HWND edit(int id, int y, bool password = false) {
    auto c = control(L"EDIT", L"", id, 28, y, width - 60, 34,
                     WS_TABSTOP | ES_AUTOHSCROLL | (password ? ES_PASSWORD : 0));
    SendMessageW(c, EM_SETMARGINS, EC_LEFTMARGIN | EC_RIGHTMARGIN, MAKELPARAM(10, 10));
    SendMessageW(c, EM_SETLIMITTEXT, 512, 0);
    return c;
  }
  HWND button(const char *key, int id, int x, int y, int w = 150) {
    return control(L"BUTTON", mr::label(lang, key), id, x, y, w, 38, WS_TABSTOP | BS_OWNERDRAW);
  }
  void end(bool ok) {
    accepted = ok;
    DestroyWindow(hwnd);
  }
  bool run() {
    static bool registered = false;
    if (!registered) {
      WNDCLASSW c{};
      c.lpfnWndProc = procedure;
      c.hInstance = GetModuleHandleW(nullptr);
      c.lpszClassName = L"MRNativeForm";
      c.hCursor = LoadCursorW(nullptr, IDC_ARROW);
      RegisterClassW(&c);
      registered = true;
    }
    scale = GetDpiForWindow(parent) / 96.f;
    RECT r{};
    GetWindowRect(parent, &r);
    RECT size{0, 0, px(width), px(height)};
    AdjustWindowRectEx(&size, WS_CAPTION | WS_SYSMENU | WS_POPUP, FALSE, 0);
    EnableWindow(parent, FALSE);
    hwnd =
        CreateWindowExW(WS_EX_DLGMODALFRAME, L"MRNativeForm", title.c_str(),
                        WS_CAPTION | WS_SYSMENU | WS_POPUP | WS_CLIPCHILDREN,
                        (r.left + r.right - (size.right - size.left)) / 2,
                        (r.top + r.bottom - (size.bottom - size.top)) / 2, size.right - size.left,
                        size.bottom - size.top, parent, nullptr, GetModuleHandleW(nullptr), this);
    if (!hwnd) {
      EnableWindow(parent, TRUE);
      return false;
    }
    BOOL dark = theme != 2;
    DwmSetWindowAttribute(hwnd, 20, &dark, sizeof(dark));
    ShowWindow(hwnd, SW_SHOW);
    MSG m{};
    while (IsWindow(hwnd) && GetMessageW(&m, nullptr, 0, 0) > 0) {
      if (!IsDialogMessageW(hwnd, &m)) {
        TranslateMessage(&m);
        DispatchMessageW(&m);
      }
    }
    EnableWindow(parent, TRUE);
    SetForegroundWindow(parent);
    return accepted;
  }
  static LRESULT CALLBACK procedure(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    auto f = reinterpret_cast<Form *>(GetWindowLongPtrW(h, GWLP_USERDATA));
    if (msg == WM_NCCREATE) {
      f = static_cast<Form *>(reinterpret_cast<CREATESTRUCTW *>(lp)->lpCreateParams);
      SetWindowLongPtrW(h, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(f));
      f->hwnd = h;
    }
    if (!f)
      return DefWindowProcW(h, msg, wp, lp);
    if (msg == WM_CREATE) {
      f->font = CreateFontW(-f->px(14), 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                            OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                            DEFAULT_PITCH, L"Segoe UI");
      f->bg = CreateSolidBrush(color(palette(f->theme).bg));
      f->input = CreateSolidBrush(color(palette(f->theme).raised));
      f->build();
      return 0;
    }
    if (msg == WM_CLOSE) {
      f->end(false);
      return 0;
    }
    if (msg == WM_COMMAND) {
      if (LOWORD(wp) == IDCANCEL) {
        f->end(false);
        return 0;
      }
      f->command(LOWORD(wp), HIWORD(wp));
      return 0;
    }
    if (msg == WM_CTLCOLORSTATIC || msg == WM_CTLCOLOREDIT || msg == WM_CTLCOLORLISTBOX) {
      HDC dc = reinterpret_cast<HDC>(wp);
      SetTextColor(dc, color(palette(f->theme).text));
      SetBkColor(dc, color(msg == WM_CTLCOLOREDIT || msg == WM_CTLCOLORLISTBOX
                               ? palette(f->theme).raised
                               : palette(f->theme).bg));
      return reinterpret_cast<LRESULT>(
          msg == WM_CTLCOLOREDIT || msg == WM_CTLCOLORLISTBOX ? f->input : f->bg);
    }
    if (msg == WM_ERASEBKGND) {
      RECT r{};
      GetClientRect(h, &r);
      FillRect(reinterpret_cast<HDC>(wp), &r, f->bg);
      return 1;
    }
    if (msg == WM_DRAWITEM) {
      auto item = reinterpret_cast<DRAWITEMSTRUCT *>(lp);
      auto theme = palette(f->theme);
      FillRect(item->hDC, &item->rcItem, f->bg);
      auto fill = CreateSolidBrush(color(item->CtlID == IDOK ? theme.accent : theme.raised));
      auto pen = CreatePen(PS_SOLID, 1, color(item->CtlID == IDOK ? theme.accent : theme.line));
      auto previousBrush = SelectObject(item->hDC, fill),
           previousPen = SelectObject(item->hDC, pen);
      RoundRect(item->hDC, item->rcItem.left, item->rcItem.top, item->rcItem.right,
                item->rcItem.bottom, f->px(12), f->px(12));
      SelectObject(item->hDC, previousBrush);
      SelectObject(item->hDC, previousPen);
      DeleteObject(fill);
      DeleteObject(pen);
      SetBkMode(item->hDC, TRANSPARENT);
      SetTextColor(item->hDC, color(item->CtlID == IDOK ? theme.onAccent : theme.text));
      auto previousFont = SelectObject(item->hDC, f->font);
      wchar_t t[160]{};
      GetWindowTextW(item->hwndItem, t, 160);
      DrawTextW(item->hDC, t, -1, &item->rcItem, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
      SelectObject(item->hDC, previousFont);
      if (item->itemState & ODS_FOCUS)
        DrawFocusRect(item->hDC, &item->rcItem);
      return TRUE;
    }
    return DefWindowProcW(h, msg, wp, lp);
  }
};
std::vector<std::filesystem::path> choose(HWND h, bool multi, const wchar_t *filter) {
  std::vector<wchar_t> buffer(65536);
  OPENFILENAMEW o{sizeof(o)};
  o.hwndOwner = h;
  o.lpstrFilter = filter;
  o.lpstrFile = buffer.data();
  o.nMaxFile = DWORD(buffer.size());
  o.Flags = OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR |
            (multi ? OFN_ALLOWMULTISELECT : 0);
  if (!GetOpenFileNameW(&o))
    return {};
  std::filesystem::path first = buffer.data();
  const wchar_t *next = buffer.data() + wcslen(buffer.data()) + 1;
  if (!*next)
    return {first};
  std::vector<std::filesystem::path> out;
  while (*next) {
    out.push_back(first / next);
    next += wcslen(next) + 1;
    if (out.size() > 18)
      break;
  }
  return out;
}
struct LoginForm : Form {
  std::optional<LoginData> result;
  LoginForm(HWND p, int l, int t) : Form(p, l, t, mr::label(l, "login"), 480, 280) {}
  void build() override {
    labelAt("email", 24);
    edit(10, 50);
    labelAt("password", 104);
    edit(11, 130, true);
    button("cancel", IDCANCEL, 28, 214, 125);
    button("login", IDOK, 280, 214, 170);
    SetFocus(GetDlgItem(hwnd, 10));
  }
  void command(int id, int) override {
    if (id != IDOK)
      return;
    auto mail = content(hwnd, 10), pass = content(hwnd, 11);
    if (mail.empty() || pass.empty()) {
      MessageBoxW(hwnd, mr::label(lang, "required"), title.c_str(), MB_ICONINFORMATION);
      return;
    }
    result = LoginData{utf8(mail), utf8(pass)};
    SecureZeroMemory(pass.data(), pass.size() * sizeof(wchar_t));
    end(true);
  }
};
struct PublishForm : Form {
  PublishData data;
  std::optional<PublishData> result;
  PublishForm(HWND p, int l, int t, const Json &work)
      : Form(p, l, t, mr::label(l, "publish"), 610, 600) {
    data.type = text(work, "resourceType", "model");
    data.title = text(work, "title");
    data.existingId = text(work, "id");
    data.slug = text(work, "slug");
    if (work.contains("creator"))
      data.handle = text(work["creator"], "handle");
  }
  void build() override {
    labelAt("title", 20);
    auto titleInput = edit(10, 44);
    SendMessageW(titleInput, EM_SETLIMITTEXT, 160, 0);
    SetWindowTextW(titleInput, wide(data.title).c_str());
    labelAt("type", 90);
    auto combo = control(L"COMBOBOX", L"", 12, 28, 114, 550, 230,
                         CBS_DROPDOWNLIST | WS_TABSTOP | WS_VSCROLL);
    const char *types[] = {"model", "image", "video", "audio", "material", "document", "other"};
    int index = 0;
    for (int i = 0; i < 7; i++) {
      auto s = resourceLabel(lang, types[i]);
      SendMessageW(combo, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(s.c_str()));
      if (data.type == types[i])
        index = i;
    }
    SendMessageW(combo, CB_SETCURSEL, index, 0);
    if (!data.existingId.empty()) {
      EnableWindow(titleInput, FALSE);
      EnableWindow(combo, FALSE);
    }
    labelAt("source", 166);
    button("choose", 20, 28, 192, 145);
    control(L"STATIC", L"—", 21, 190, 198, 380, 30);
    labelAt("cover", 246);
    button("choose", 22, 28, 272, 145);
    control(L"STATIC", L"—", 23, 190, 278, 380, 30);
    labelAt("publicPreview", 326);
    button("choose", 24, 28, 352, 145);
    control(L"STATIC", L"—", 25, 190, 358, 380, 30);
    auto check = control(L"BUTTON", mr::label(lang, "submitReview"), 26, 28, 428, 550, 30,
                         BS_AUTOCHECKBOX | WS_TABSTOP);
    SendMessageW(check, BM_SETCHECK, BST_CHECKED, 0);
    button("cancel", IDCANCEL, 28, 530, 125);
    button("createUpload", IDOK, 350, 530, 230);
  }
  void command(int id, int code) override {
    static const char *types[] = {"model",    "image",    "video", "audio",
                                  "material", "document", "other"};
    if (id == 12 && code == CBN_SELCHANGE) {
      int n = int(SendDlgItemMessageW(hwnd, 12, CB_GETCURSEL, 0, 0));
      if (n >= 0 && n < 7)
        data.type = types[n];
      data.preview.clear();
      SetDlgItemTextW(hwnd, 25, L"—");
    }
    if (id == 20) {
      auto paths = choose(hwnd, true,
                          L"Resources\0*.jpg;*.jpeg;*.png;*.webp;*.gif;*.tif;*.tiff;*.svg;*.psd;*."
                          L"glb;*.gltf;*.fbx;*.obj;*.blend;*.zip;*.7z;*.rar;*.mp4;*.webm;*.mov;*."
                          L"mp3;*.wav;*.ogg;*.flac;*.pdf;*.txt;*.csv\0\0");
      if (!paths.empty()) {
        data.sources = std::move(paths);
        auto value =
            std::to_wstring(data.sources.size()) + L" · " + data.sources[0].filename().wstring();
        SetDlgItemTextW(hwnd, 21, value.c_str());
      }
    }
    if (id == 22) {
      auto paths = choose(hwnd, false, L"Images\0*.jpg;*.jpeg;*.png;*.webp;*.gif\0\0");
      if (!paths.empty()) {
        data.cover = paths[0];
        SetDlgItemTextW(hwnd, 23, data.cover.filename().c_str());
      }
    }
    if (id == 24) {
      auto paths = choose(hwnd, false,
                          data.type == "model"   ? L"3D previews\0*.glb;*.gltf;*.fbx;*.obj\0\0"
                          : data.type == "video" ? L"Video\0*.mp4;*.webm;*.mov\0\0"
                          : data.type == "audio" ? L"Audio\0*.mp3;*.wav;*.ogg;*.flac\0\0"
                                                 : L"Images\0*.jpg;*.jpeg;*.png;*.webp;*.gif\0\0");
      if (!paths.empty()) {
        data.preview = paths[0];
        SetDlgItemTextW(hwnd, 25, data.preview.filename().c_str());
      }
    }
    if (id != IDOK)
      return;
    if (data.existingId.empty())
      data.title = utf8(content(hwnd, 10));
    data.review = SendDlgItemMessageW(hwnd, 26, BM_GETCHECK, 0, 0) == BST_CHECKED;
    if (data.title.empty() || data.sources.empty()) {
      MessageBoxW(hwnd, mr::label(lang, "required"), title.c_str(), MB_ICONINFORMATION);
      return;
    }
    if (data.type == "model" && data.review && data.cover.empty() && data.preview.empty() &&
        data.existingId.empty()) {
      MessageBoxW(hwnd, mr::label(lang, "modelPreviewRequired"), title.c_str(), MB_ICONINFORMATION);
      return;
    }
    result = data;
    end(true);
  }
};
struct TextForm : Form {
  std::vector<TextField> fields;
  std::optional<std::vector<std::string>> result;
  TextForm(HWND p, int l, int t, const char *key, std::vector<TextField> f)
      : Form(p, l, t, mr::label(l, key), 560, 120), fields(std::move(f)) {
    for (auto &f : fields)
      height += f.multiline ? 146 : 82;
  }
  void build() override {
    int y = 22;
    for (size_t i = 0; i < fields.size(); i++) {
      auto &f = fields[i];
      labelAt(f.key.c_str(), y);
      HWND e =
          f.multiline
              ? control(L"EDIT", wide(f.value), int(10 + i), 28, y + 26, 500, 105,
                        WS_TABSTOP | ES_MULTILINE | ES_AUTOVSCROLL | WS_VSCROLL | ES_WANTRETURN)
              : edit(int(10 + i), y + 26);
      SetWindowTextW(e, wide(f.value).c_str());
      SendMessageW(e, EM_SETLIMITTEXT, f.limit, 0);
      y += f.multiline ? 146 : 82;
    }
    button("cancel", IDCANCEL, 28, height - 66, 125);
    button("save", IDOK, 365, height - 66, 165);
  }
  void command(int id, int) override {
    if (id != IDOK)
      return;
    std::vector<std::string> v;
    for (size_t i = 0; i < fields.size(); i++)
      v.push_back(utf8(content(hwnd, int(10 + i))));
    result = std::move(v);
    end(true);
  }
};
struct ChoiceForm : Form {
  std::vector<std::wstring> items;
  std::optional<int> result;
  ChoiceForm(HWND p, int l, int t, const char *key, std::vector<std::wstring> v)
      : Form(p, l, t, mr::label(l, key), 500, 215), items(std::move(v)) {}
  void build() override {
    auto c =
        control(L"COMBOBOX", L"", 10, 28, 30, 444, 220, WS_TABSTOP | CBS_DROPDOWNLIST | WS_VSCROLL);
    for (auto &s : items)
      SendMessageW(c, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(s.c_str()));
    SendMessageW(c, CB_SETCURSEL, 0, 0);
    button("cancel", IDCANCEL, 28, 142, 125);
    button("save", IDOK, 307, 142, 165);
  }
  void command(int id, int) override {
    if (id == IDOK) {
      int n = int(SendDlgItemMessageW(hwnd, 10, CB_GETCURSEL, 0, 0));
      if (n >= 0) {
        result = n;
        end(true);
      }
    }
  }
};
struct SettingsForm : Form {
  Preferences prefs;
  std::optional<Preferences> result;
  SettingsForm(HWND p, Preferences v)
      : Form(p, v.language, v.theme, mr::label(v.language, "settings"), 480, 400), prefs(v) {}
  void build() override {
    labelAt("language", 24);
    auto l = control(L"COMBOBOX", L"", 10, 28, 50, 420, 180, CBS_DROPDOWNLIST | WS_TABSTOP);
    for (auto s : {L"中文", L"English", L"日本語"})
      SendMessageW(l, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(s));
    SendMessageW(l, CB_SETCURSEL, prefs.language, 0);
    labelAt("theme", 106);
    auto t = control(L"COMBOBOX", L"", 11, 28, 132, 420, 180, CBS_DROPDOWNLIST | WS_TABSTOP);
    for (auto key : {"dark", "blue", "paper"})
      SendMessageW(t, CB_ADDSTRING, 0, reinterpret_cast<LPARAM>(mr::label(lang, key)));
    SendMessageW(t, CB_SETCURSEL, prefs.theme, 0);
    auto c = control(L"BUTTON", mr::label(lang, "motion"), 12, 28, 214, 420, 30,
                     WS_TABSTOP | BS_AUTOCHECKBOX);
    SendMessageW(c, BM_SETCHECK, prefs.motion ? BST_CHECKED : BST_UNCHECKED, 0);
    control(L"STATIC", mr::label(lang, "localPrefs"), 0, 28, 266, 420, 30);
    button("cancel", IDCANCEL, 28, 334, 120);
    button("settings", IDOK, 278, 334, 170);
  }
  void command(int id, int) override {
    if (id != IDOK)
      return;
    prefs.language = int(SendDlgItemMessageW(hwnd, 10, CB_GETCURSEL, 0, 0));
    prefs.theme = int(SendDlgItemMessageW(hwnd, 11, CB_GETCURSEL, 0, 0));
    prefs.motion = SendDlgItemMessageW(hwnd, 12, BM_GETCHECK, 0, 0) == BST_CHECKED;
    result = prefs;
    end(true);
  }
};
} // namespace
const wchar_t *studioLabel(int, const char *);
const wchar_t *label(int language, const char *key) {
  if (auto studio = studioLabel(language, key))
    return studio;
  for (const auto &c : copies)
    if (std::string_view(c.key) == key)
      return c.value[std::clamp(language, 0, 2)];
  return L"mrright";
}
std::wstring resourceLabel(int l, const std::string &type) {
  static const char *types[] = {"model",    "image",    "video", "audio",
                                "material", "document", "other"};
  static const char *keys[] = {"resourceModel", "resourceImage",    "resourceVideo",
                               "resourceAudio", "resourceMaterial", "resourceDocument",
                               "resourceOther"};
  for (int i = 0; i < 7; i++)
    if (type == types[i])
      return label(l, keys[i]);
  return label(l, "resourceOther");
}
std::optional<std::vector<std::string>> textDialog(HWND h, int l, int t, const char *k,
                                                   const std::vector<TextField> &v) {
  TextForm f(h, l, t, k, v);
  f.run();
  return f.result;
}
std::optional<int> choiceDialog(HWND h, int l, int t, const char *k,
                                const std::vector<std::wstring> &v) {
  if (v.empty())
    return {};
  ChoiceForm f(h, l, t, k, v);
  f.run();
  return f.result;
}
std::optional<LoginData> loginDialog(HWND h, int l, int t) {
  LoginForm f(h, l, t);
  f.run();
  return f.result;
}
std::optional<PublishData> publishDialog(HWND h, int l, int t, const Json &j) {
  PublishForm f(h, l, t, j);
  f.run();
  return f.result;
}
std::optional<Preferences> settingsDialog(HWND h, const Preferences &p) {
  SettingsForm f(h, p);
  f.run();
  return f.result;
}
std::filesystem::path appFolder() {
  PWSTR p = nullptr;
  if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &p)))
    throw std::runtime_error("Application folder unavailable");
  std::filesystem::path dir = std::filesystem::path(p) / L"mrright" / L"Studio";
  CoTaskMemFree(p);
  std::filesystem::create_directories(dir);
  return dir;
}
std::optional<std::filesystem::path> saveFile(HWND h, const std::wstring &name) {
  std::wstring safe = std::filesystem::path(name).filename().wstring();
  for (auto &c : safe)
    if (c < 32 || wcschr(L"<>:\"/\\|?*", c))
      c = L'_';
  if (safe.empty())
    safe = L"resource";
  std::vector<wchar_t> b(32768);
  wcsncpy(b.data(), safe.c_str(), b.size() - 1);
  OPENFILENAMEW o{sizeof(o)};
  o.hwndOwner = h;
  o.lpstrFile = b.data();
  o.nMaxFile = DWORD(b.size());
  o.lpstrFilter = L"All files\0*.*\0\0";
  o.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
  if (!GetSaveFileNameW(&o))
    return {};
  return std::filesystem::path(b.data());
}
void openWeb(const Http &http, const std::string &path) {
  auto url = http.absolute(path);
  ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
}
void openFolder(const std::filesystem::path &file) {
  PIDLIST_ABSOLUTE id = nullptr;
  SFGAOF flags = 0;
  if (SUCCEEDED(SHParseDisplayName(file.c_str(), nullptr, &id, 0, &flags))) {
    SHOpenFolderAndSelectItems(id, 0, nullptr, 0);
    CoTaskMemFree(id);
  }
}
Pixels decodeImage(const std::vector<unsigned char> &bytes, UINT maximum) {
  if (bytes.empty() || bytes.size() > 32 * 1024 * 1024)
    throw std::runtime_error("Invalid image");
  Pixels p;
  if (bytes.size() > 12 && std::memcmp(bytes.data(), "RIFF", 4) == 0 &&
      std::memcmp(bytes.data() + 8, "WEBP", 4) == 0) {
    WebPDecoderConfig config;
    if (!WebPInitDecoderConfig(&config) ||
        WebPGetFeatures(bytes.data(), bytes.size(), &config.input) != VP8_STATUS_OK)
      throw std::runtime_error("Invalid WebP");
    int w = config.input.width, h = config.input.height;
    if (w < 1 || h < 1 || w > 32768 || h > 32768)
      throw std::runtime_error("Image dimensions unsupported");
    float scale = std::min(1.f, std::min(float(maximum) / w, float(maximum) / h));
    p.width = std::max(1, int(w * scale));
    p.height = std::max(1, int(h * scale));
    p.data.resize(size_t(p.width) * p.height * 4);
    config.output.colorspace = MODE_bgrA;
    config.output.is_external_memory = 1;
    config.output.u.RGBA.rgba = p.data.data();
    config.output.u.RGBA.stride = int(p.width * 4);
    config.output.u.RGBA.size = p.data.size();
    config.options.use_scaling = 1;
    config.options.scaled_width = int(p.width);
    config.options.scaled_height = int(p.height);
    auto status = WebPDecode(bytes.data(), bytes.size(), &config);
    WebPFreeDecBuffer(&config.output);
    if (status != VP8_STATUS_OK)
      throw std::runtime_error("Image decode failed");
    return p;
  }
  IWICImagingFactory *factory = nullptr;
  IWICStream *stream = nullptr;
  IWICBitmapDecoder *decoder = nullptr;
  IWICBitmapFrameDecode *frame = nullptr;
  IWICBitmapScaler *scaler = nullptr;
  IWICFormatConverter *convert = nullptr;
  auto cleanup = [&]() {
    if (convert)
      convert->Release();
    if (scaler)
      scaler->Release();
    if (frame)
      frame->Release();
    if (decoder)
      decoder->Release();
    if (stream)
      stream->Release();
    if (factory)
      factory->Release();
  };
  try {
    if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
                                IID_PPV_ARGS(&factory))))
      throw std::runtime_error("Image decoder unavailable");
    if (FAILED(factory->CreateStream(&stream)) ||
        FAILED(
            stream->InitializeFromMemory(const_cast<BYTE *>(bytes.data()), DWORD(bytes.size()))) ||
        FAILED(factory->CreateDecoderFromStream(stream, nullptr, WICDecodeMetadataCacheOnDemand,
                                                &decoder)) ||
        FAILED(decoder->GetFrame(0, &frame)))
      throw std::runtime_error("Invalid image");
    UINT w = 0, h = 0;
    frame->GetSize(&w, &h);
    if (!w || !h || w > 32768 || h > 32768)
      throw std::runtime_error("Image dimensions unsupported");
    float factor = std::min(1.f, std::min(float(maximum) / w, float(maximum) / h));
    p.width = std::max(1u, UINT(w * factor));
    p.height = std::max(1u, UINT(h * factor));
    p.data.resize(size_t(p.width) * p.height * 4);
    if (FAILED(factory->CreateBitmapScaler(&scaler)) ||
        FAILED(scaler->Initialize(frame, p.width, p.height, WICBitmapInterpolationModeFant)) ||
        FAILED(factory->CreateFormatConverter(&convert)) ||
        FAILED(convert->Initialize(scaler, GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone,
                                   nullptr, 0, WICBitmapPaletteTypeCustom)) ||
        FAILED(convert->CopyPixels(nullptr, p.width * 4, UINT(p.data.size()), p.data.data())))
      throw std::runtime_error("Image decode failed");
  } catch (...) {
    cleanup();
    throw;
  }
  cleanup();
  return p;
}
} // namespace mr
