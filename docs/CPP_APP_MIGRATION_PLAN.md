# C++ 跨平台 Native App 迁移计划

Status: 迁移前架构审查结论 + 跨平台客户端设计基线（2026-07-03）。

关联文档：

- `docs/API_V1_FREEZE_PLAN.md` — API v1 冻结规范（本计划 Phase 1 的执行标准）
- `docs/API_CONTRACT.md` — 现行 API 契约
- `docs/API_ERRORS.md` — 错误码注册表
- `docs/ARCHITECTURE.md` — 平台架构方向
- `docs/openapi/api-v1.yaml` — v1 端点 OpenAPI 初稿；**C++ SDK 开工前的机器可读契约起点**
- `docs/API_V1_MODEL_MAPPING.md` — TS/C++ model mapping 初稿；**C++ Prototype（Phase 2）的 `sdk/core/models/` 应直接从此文档的 struct 草图开始，不再重新设计字段**
- `docs/API_V1_GAPS.md` — 尚未冻结/未验证字段清单；Phase 2 动工前必须先看这份，避免把 gap 当成已定形状写死进编译产物
- `cpp-app/` — C++ cross-platform prototype skeleton（CMake + SDK headers + smoke CLI），已创建；当前不含真实 HTTP、Qt UI、缓存、下载器或打包实现
- `.github/workflows/cpp-app.yml` — C++ App Skeleton CI matrix，已加入 Windows/macOS/Linux configure + build + smoke test 入口；不部署、不读取 secrets、不上传构建产物

---

## 1. 项目重新定位（一句话）

**mrright.blog 是一个以稳定 API 契约为核心的个人 3D 内容 / 资源 / 社区 / 账号权限平台：Web 端负责展示、社区互动、账号中心与 admin 管理；API 层承载全部账号、权限、内容、资源与下载决策；C++ 跨平台 App（Windows / macOS / Linux）负责高性能资源消费——模型查看、资产下载、本地缓存与未来的离线库。**

这不是"把 React 网站重写成 C++"。Web 不会被替代；C++ App 是同一平台上的第二个客户端。

## 2. 项目最终目标

1. **解决什么问题**：3D 作品与资源（模型、贴图、可下载资产）目前只能通过浏览器消费——大文件下载不可断点续传、无本地缓存、Web 端 3D 预览受浏览器性能与格式限制。平台要让同一份账号、内容、权限体系同时服务浏览器与原生客户端。
2. **用户为什么需要它**：
   - 访客/社区用户：浏览作品、参与社区、申请并下载资源。
   - 被批准的资源用户：需要可靠的大文件下载、本地资源库、原生 3D 查看性能。
   - 站长（admin）：一处管理内容、用户、审核、下载审批。
3. **项目类型判定**（对应产品定位选项）：是 **2 + 3 + 4 + 6 的组合** —— 资源/模型内容平台 + 社区平台 + 账号权限系统，最终形态是"跨平台内容资源客户端的服务端平台"。纯"作品展示网站"（选项 1）只是 Web 端的其中一个职责，不再是项目定义。

## 3. Web / API / C++ App 职责边界

| 职责 | Web | API (server) | C++ App |
| --- | :-: | :-: | :-: |
| 公开作品展示 / SEO | ✅ 唯一 | 数据源 | ❌ |
| 注册 / 邮箱验证 | ✅ 唯一 | 决策 | ❌（引导到 Web） |
| 登录 / 登出 / 会话 | ✅ | ✅ 唯一权威 | ✅ |
| 账号资料编辑 | ✅ 首选 | 决策 | 后期可选 |
| 社区发帖 / 评论写入 | ✅ | 决策 | 后期可选（先只读） |
| admin 管理 / 审核 / 审计 | ✅ 唯一 | 决策 + 审计写入 | ❌ 永不进入 |
| 项目 / 资源浏览 | ✅ | 数据源 | ✅ |
| 资产下载 / 断点续传 | 基础 | 授权 + 分发 | ✅ 核心 |
| 本地缓存 / 离线库 | ❌ | 元数据 | ✅ 核心 |
| 高性能 3D viewer | 基础预览 | 模型资产 | ✅ 核心 |
| 权限 / 可见性 / 下载策略判定 | ❌ | ✅ 唯一 | ❌ |

明确回答关键问题：

- **admin 是否进入 C++ App：否，永不。** admin token 是静态站长凭证，进入分发出去的客户端二进制等于泄露攻击面；admin 工作流（审核、审计、可见性管理）保持 Web-only。
- **只存在于 Web 的功能**：注册/邮箱验证流程、admin 全部功能、账号资料的完整编辑、SEO 页面、社区写入（第一阶段）。
- **进入 C++ App 的功能**：登录/登出、项目列表/详情、资产下载、本地缓存、下载进度/断点续传、3D viewer、离线库、社区只读（可选）。
- **必须由 API 统一承载**：认证、会话、权限等级（guest/member/approved）、profile 可见性（含 `PROFILE_ADMIN_DISABLED`）、下载策略、资产元数据（url/size/checksum）、错误码。
- **现在不应该做（防范围膨胀）**：C++ App 内的社区写入、C++ 内账号编辑、Android/iOS、插件系统、支付/授权证书、多站长/多租户、实时通知（WebSocket）、Web 端离线缓存。

## 4. 当前架构评分：7 / 10

理由（基于 2026-07-03 代码审查）：

**加分项**

- Response envelope（`data / pagination / error`）已 100% 覆盖全部业务路由（`sendData/sendPage/sendError`，`server/responses.js`），并有开发期 shape 校验（`server/contracts/responseValidator.js`）。
- 26 个稳定错误码（`API_ERROR_CODES`），HTTP status 与语义核对完成。
- 25 个 contract 测试（`tests/api/contract.spec.js`）覆盖成功/错误/auth/upload envelope，并断言 legacy 顶层镜像一致性。
- 前端已通过 `normalizeApiPayload / createApiError` 双向兼容，客户端不 branch 在 error.message 上。
- 权限决策全部在服务端（accessLevel 排序、`PROFILE_ADMIN_DISABLED` 覆盖、admin 审计表 `admin_user_actions`）。
- 反枚举设计（`/api/users/:handle` 用 `RESOURCE_FORBIDDEN` + 404）。

**扣分项**（详见下节十大问题）：无版本前缀、无 INTERNAL_ERROR 兜底、上传文件静态直出无权限、无 Asset Model、绝大多数列表无分页、无 OpenAPI、token 生命周期未定义、大文件下载无 Range 支持。

## 5. 当前最大 10 个问题（按对 C++ App 的影响排序）

| # | 问题 | 影响 | 修复时机 |
| - | --- | --- | --- |
| 1 | **`/uploads` 是 `express.static` 公开直出**（server/index.js:94）。downloadPolicy 只挡"申请"不挡"文件"；知道 URL 即可下载任何已上传文件 | C++ App 的授权下载、断点续传、缓存校验都无处落脚 | v1 freeze 前设计、Phase 2 前实现受控下载端点 |
| 2 | **无 `/api/v1` 前缀**。冻结的对象没有版本身份，未来破坏性变更无处安放 | SDK 无法声明兼容目标 | ✅ 已修复（2026-07-04）：`/api/v1/*` 双挂载上线，strict envelope（无 legacy 镜像），C++ App 只消费 `/api/v1/*`；admin 端点虽机械可达但**不进入** C++ v1 契约。详见 API_V1_FREEZE_PLAN.md §3 |
| 3 | **未捕获异常落到 Express 默认 HTML 500**（error 中间件只分类 upload 错误后 `next(error)`）。无 `INTERNAL_ERROR` 码 | C++ 客户端遇 500 时解析 HTML 失败，错误处理链路断裂 | v1 freeze 前（已在待办） |
| 4 | **无统一 Asset Model**。community 上传暴露 `fileUrl/fileSize/fileType/previewUrl`，admin 上传返回 `file+conversion`，项目图片/模型是内嵌字符串；无 checksum、mimeType 不稳定 | 本地缓存无法做完整性校验，SDK 模型无法固化 | v1 freeze 定义，实现可分批 |
| 5 | **列表接口普遍无分页**（projects、community posts/uploads、account 列表全量返回；仅 admin visitors 有真实 `sendPage`） | C++ 列表页 / 增量同步没有稳定翻页语义 | v1 freeze 定义 spec，公共列表接口补齐 |
| 6 | **legacy 顶层镜像**（`withLegacyData` 把 data 键摊到顶层）。有保留字碰撞风险（data/pagination/error/code/message），payload 体积翻倍 | SDK 若照抄顶层字段会把迁移债固化进原生客户端 | ✅ 已修复（2026-07-04）：`/api/v1/*` 下不镜像（顶层固定 data/pagination/error），legacy `/api/*` 维持镜像供 Web 使用；反向镜像断言防止镜像回流 v1 |
| 7 | **token 生命周期未定义**：不透明 session token（服务端 hash 存储，设计正确），但无文档化过期、无 refresh、无多设备会话管理语义 | C++ App 是长驻进程，必须知道 token 何时失效、401 后如何恢复 | v1 freeze 评估并文档化 |
| 8 | **无 OpenAPI / typed contract**。契约只存在于 markdown + 测试断言中 | C++ SDK 只能手抄字段，漂移无法机器检测 | freeze 后立即抽取 |
| 9 | **contract 测试无 DB 路径**：admin 200 成功响应、真实 multer 错误（FILE_TOO_LARGE 等）不可达，未被断言 | 冻结的"成功形状"实际未被测试锁定 | freeze 前（已在待办） |
| 10 | **大文件下载无 HTTP Range / ETag / resume 语义**（120MB 上传上限意味着同量级下载） | C++ DownloadManager 的断点续传无协议基础 | Phase 2 前，与问题 1 一并解决 |

## 6. C++ App MVP 功能清单（Phase 2 验收范围）

1. 登录 / 登出（visitor token，永不涉及 admin token）
2. token 安全存储（平台凭证库，见 §14）
3. 项目列表 + 项目详情（envelope 解析、error.code 分支）
4. 资产下载（受控下载端点 + 进度 + 断点续传 + 失败重试）
5. 本地缓存（SQLite 元数据 + 文件系统 blob + checksum 校验）
6. 基础设置页（服务器地址、缓存位置、缓存清理）
7. 基础日志（分级、滚动、可导出）
8. community 只读浏览（可选，砍掉不影响验收）

UI 允许简陋；三平台编译运行 + SDK 分层是硬性验收标准。

## 7. 跨平台目标与支持平台

**Cross-platform Goals**：跨平台不是后期补丁，而是第一版架构约束。任何 SDK、缓存、路径、token、下载、日志、打包、CI、3D viewer 设计，都必须从 Windows / macOS / Linux 三端一致性出发。单平台特性只能出现在 `app/platform` 抽象层之下。

| 优先级 | 平台 | 说明 |
| --- | --- | --- |
| P0 | Windows 10/11 x64 | MSVC |
| P0 | macOS Apple Silicon + Intel | universal binary 或双构建 |
| P0 | Linux x86_64 | glibc 主流发行版 |
| P1 | Steam Deck / Linux handheld | 复用 Linux 构建，验证手柄/分辨率 |
| P1 | Windows portable（zip） | 复用 Windows 构建，路径改随身模式 |
| P2 | Android / iOS | 不做承诺；SDK 层（core/cache/download 不依赖桌面 API）保持自然可移植 |

**验收铁律**：从第一个 commit 起，任何 PR 必须在三个 P0 平台 CI 全绿才能合并。不允许"先 Windows 跑通再移植"。

## 8. Platform Abstraction Layer

所有平台差异收敛到两处：`app/platform`（应用级 OS 集成）与 `sdk` 内的少量 provider 接口。业务代码与 UI 永不直接调用平台 API。

统一路径抽象（接口全部返回绝对路径并保证目录存在）：

```text
AppPaths                 // 聚合入口，注入其余 provider
├── ConfigPathProvider   // 配置文件目录
├── CachePathProvider    // 资产缓存目录（可被用户重定向）
├── LogPathProvider      // 日志目录
├── DownloadPathProvider // 用户可见的导出/下载目录
└── TempPathProvider     // 临时文件（下载中的 .part 文件等）
```

各平台映射（appId = `mrright-app`）：

| Provider | Windows | macOS | Linux (XDG) |
| --- | --- | --- | --- |
| Config | `%APPDATA%\mrright-app\` | `~/Library/Application Support/mrright-app/` | `$XDG_CONFIG_HOME/mrright-app/`（默认 `~/.config/...`） |
| Cache | `%LOCALAPPDATA%\mrright-app\cache\` | `~/Library/Caches/mrright-app/` | `$XDG_CACHE_HOME/mrright-app/`（默认 `~/.cache/...`） |
| Data（本地库索引） | `%LOCALAPPDATA%\mrright-app\data\` | `~/Library/Application Support/mrright-app/data/` | `$XDG_DATA_HOME/mrright-app/`（默认 `~/.local/share/...`） |
| Logs | `%LOCALAPPDATA%\mrright-app\logs\` | `~/Library/Logs/mrright-app/` | `$XDG_STATE_HOME/mrright-app/logs/` |
| Downloads | `Known Folder: Downloads` | `~/Downloads`（sandbox 下走用户选择的 bookmark） | `xdg-user-dir DOWNLOAD` |
| Temp | Cache 下 `tmp/`（与缓存同卷，保证 rename 原子性） | 同左 | 同左 |

规则：

- Temp 与 Cache 必须同一文件系统卷，`.part` → 最终文件用原子 rename。
- Windows portable 模式：全部 provider 重定向到可执行文件旁的 `./data/`。
- macOS 若未来上 App Store sandbox：Downloads 需 security-scoped bookmark；第一版不进沙盒，但 provider 接口现在就为此留出。
- 路径全用 UTF-8 内部表示，Windows 边界转换 UTF-16（Qt `QString` 天然解决）。

## 9. Build Matrix

| 平台 | 编译器 | 生成器 | 说明 |
| --- | --- | --- | --- |
| Windows | MSVC (VS2022) | Ninja | /W4，UTF-8 源码 flag |
| macOS | Apple Clang | Ninja | arm64 + x86_64（先分开构建，打包期评估 universal） |
| Linux | GCC 13+（CI 基线）+ Clang（本地静态分析） | Ninja | 用较老 LTS 容器构建以放宽 glibc 下限 |

CMake 组织：

- `CMakePresets.json` 定义 `win-msvc-{debug,release,relwithdebinfo}`、`mac-{debug,release,relwithdebinfo}`、`linux-gcc-{debug,release,relwithdebinfo}`。
- Debug：断言 + sanitizers（Linux/macOS ASan/UBSan）；Release：分发；RelWithDebInfo：生成分发用符号（Windows PDB、macOS dSYM、Linux split debug info），配合 crash 上报。
- GitHub Actions matrix CI：**需要，且从第一个 commit 开始**。`os: [windows-latest, macos-latest, ubuntu-22.04]`，每平台跑 configure + build + ctest。这是"跨平台是第一版约束"的机器化执行。

## 10. Packaging Strategy

| 平台 | 首选 | 备选/可选 | 理由 |
| --- | --- | --- | --- |
| Windows | NSIS 安装包 | zip portable（P1）；MSIX 暂缓 | NSIS 与 Qt 生态成熟；MSIX 签名/商店链路复杂，收益低 |
| macOS | `.app` → `.dmg` + codesign + notarization | — | 无公证的 dmg 在现代 macOS 基本不可用，**公证是 P0 不是可选** |
| Linux | AppImage | deb（P1）、rpm / Flatpak（P2） | AppImage 单文件覆盖最多发行版且自带 Qt 依赖 |

- 打包脚本入 `cpp-app/packaging/{windows,macos,linux}/`，由 CI release job 调用。
- macOS 需要 Apple Developer ID 证书（年费）；这是唯一的外部账号依赖，Phase 4 前办理即可，但 Phase 2 就应在无签名模式下验证 `.app` 结构。

## 11. Secure Token Storage

| 平台 | 机制 |
| --- | --- |
| Windows | Credential Manager（`CredWrite/CredRead`） |
| macOS | Keychain Services |
| Linux | Secret Service（libsecret，GNOME Keyring / KWallet） |
| 降级 | 加密文件（机器绑定密钥派生），**仅当 Secret Service 不可用**（headless / 精简发行版 / Steam Deck 游戏模式），且 UI 必须提示降级状态 |

实现：`TokenStore` 接口在 `sdk/core`，平台实现经 **QtKeychain**（已封装以上三者）放在 `app/platform`。禁止：token 明文写入任何配置文件、日志、崩溃转储；日志层对 `Authorization` header 做统一脱敏。

## 12. Logging and Diagnostics

- 库：**spdlog**（SDK 层，无 Qt 依赖）+ Qt message handler 桥接（UI 层日志汇入同一 sink）。
- 落盘：`LogPathProvider` 目录，按大小滚动（如 5MB × 5 个），级别可在设置页调整。
- 崩溃：Phase 2 只做本地 minidump/backtrace 落盘 + "导出诊断包"按钮（日志 + 系统信息 + GPU 信息，人工发给站长）；**crashpad 服务端上报推迟到 Phase 4**——单人项目先不养 crash 收集服务。
- 禁止事项：日志不落 token、不落完整下载 URL 中的签名参数、不落用户邮箱明文。

## 13. Auto Update Strategy

- Phase 2–3：**只做版本检查**。App 启动时调 `GET /api/v1/app/releases/latest`（后端新增的极简只读端点，返回 version + 各平台下载 URL + sha256），提示用户手动下载。
- Phase 4：Windows/Linux 评估内置更新器（下载 + 校验 + 替换/AppImage 自替换）；macOS 用 Sparkle（成熟、支持公证应用）。
- 不做静默自动安装；更新永远用户确认。

## 14. 推荐技术栈（结论）

| 领域 | 结论 | 理由 |
| --- | --- | --- |
| UI 框架 | **Qt 6.8 LTS + Qt Quick/QML** | 三平台一致、GPU 加速 UI、与 3D viewer（Qt Quick 3D 候选）同框架；Widgets 更适合密集表单类工具，本 App 是内容消费型 UI |
| 构建 | **CMake（唯一构建系统）** + CMakePresets | 生态事实标准，qmake 排除 |
| 依赖管理 | **vcpkg**（manifest 模式） | 与 CMake/GitHub Actions 集成最顺，MSVC 支持最好；Conan 功能相当但学习成本更高。Qt 本体用官方安装（aqtinstall in CI），不经 vcpkg 编译 |
| 网络 | **Qt Network** 实现，藏在 `sdk/network` 的 `HttpBackend` 接口后 | 避免引入 libcurl + TLS 配置负担；接口可替换保住 P2 移动端可能性 |
| 本地缓存 DB | **SQLite**（经 Qt SQL 或直接 C API，SDK 层用 C API 保持无 Qt） | 单文件、零运维、全平台一致 |
| 文件缓存 | content-addressed：`cache/blobs/<sha256前2>/<sha256>`，SQLite 存映射 | 天然去重 + 校验即寻址 |
| 3D 渲染 | **Qt RHI 路线**（Qt Quick 3D 起步）：Windows→D3D11、macOS→Metal、Linux→OpenGL/Vulkan 由 RHI 选择 | 手写三后端是本项目最大的不必要复杂度；RHI 把差异下沉给 Qt。若 Qt Quick 3D 能力不够，退路是自绘 OpenGL item，最后才考虑裸 Vulkan |
| 模型加载 | **tinygltf 起步**（平台已倾向 GLB/GLTF），Assimp 作为后续多格式扩展（体积大、按需引入） | 服务端已有 modelConverter，优先让服务端统一转 GLB，客户端只吃一种格式 |
| API SDK | **手写 C++ client SDK**（薄层），OpenAPI spec 用于文档/漂移检测/未来代码生成，而非现在就上 generator | openapi-generator 的 C++ 输出质量不稳，API 面积（~30 端点、App 用到 ~15）手写完全可控 |
| Token 存储 | **QtKeychain**（封装 Credential Manager / Keychain / Secret Service） | 见 §11 |
| 日志 | **spdlog**（SDK）+ Qt 桥接 | 见 §12 |
| Crash | Phase 2 本地 dump；**crashpad 推迟 Phase 4** | 见 §12 |
| CI | **GitHub Actions matrix（win/mac/linux），第一 commit 起** | 见 §9 |

## 15. C++ SDK 架构

铁律：**SDK 与 UI 解耦**。`sdk/core`、`sdk/cache`、`sdk/download` 不 include 任何 Qt GUI/QML 头；`sdk/network` 允许 QtCore/QtNetwork。UI 永不直接发 HTTP。

```text
┌────────────────────────────────────────────────┐
│ app/ui (Qt Quick/QML)                          │  视图、交互；只消费 SDK 类型
├────────────────────────────────────────────────┤
│ app/platform                                   │  AppPaths、TokenStore 实现、日志落盘、
│                                                │  自动更新、文件打开、OS 集成
├────────────────────────────────────────────────┤
│ sdk/download   DownloadManager, DownloadTask   │  断点续传、进度、重试、取消、并发控制
│ sdk/cache      CacheManager, LocalAsset index  │  SQLite 元数据 + blob 存储 + checksum 校验
├────────────────────────────────────────────────┤
│ sdk/core                                       │  ApiClient 接口、AuthClient、ProjectClient、
│   models/: ResponseEnvelope<T>, ApiError,      │  AssetClient、CommunityClient、DownloadClient、
│   Pagination, User, Profile, Project, Asset,   │  TokenStore 接口、错误码 enum
│   Comment, CommunityPost, DownloadRequest,     │
│   LocalAsset, DownloadTask, CacheEntry,        │
│   SyncState                                    │
├────────────────────────────────────────────────┤
│ sdk/network    QtHttpBackend : HttpBackend     │  唯一碰 HTTP 的地方；未来可替换实现
└────────────────────────────────────────────────┘
```

各 client 职责：

- `ApiClient`：base URL、公共 header、envelope 解包（`data/pagination/error` → `Result<T>`）、错误码映射、401 时通知会话层。
- `AuthClient`：login/logout/me；注册与邮箱验证不实现（引导浏览器打开 Web）。
- `ProjectClient`：项目列表/详情/interactions。
- `AssetClient`：资产元数据、受控下载 URL 获取。
- `CommunityClient`：只读 posts/uploads（可选模块）。
- `DownloadClient`：download-requests 的申请与状态查询。
- `CacheManager`：cacheKey → 本地路径解析、checksum 校验、LRU/配额清理、孤儿 blob 回收。
- `DownloadManager`：任务队列、HTTP Range 续传、指数退避重试、进度回调、取消；产物交 `CacheManager` 落库。
- `TokenStore`：接口在 core，平台实现在 app/platform（测试用内存实现）。

错误处理约定：所有 client 返回 `Result<T, ApiError>`（不用异常跨层）；`ApiError` 携带 `code`（enum + 原始 string 双轨，未知码不崩）、`message`（仅展示）、`httpStatus`。客户端逻辑只 branch 在 code 与 httpStatus 上——与 Web 端同一契约纪律。

目录结构：

```text
cpp-app/
  CMakeLists.txt
  CMakePresets.json
  cmake/               # 工具链、依赖查找模块
  src/main.cpp
  include/
  sdk/
    core/              # 纯 C++17/20：接口、models、error、pagination、envelope
    network/           # QtNetwork HttpBackend 实现
    cache/             # SQLite + blob 存储 + 校验
    download/          # 断点续传下载器
    models/            # （或并入 core/models）
  app/
    ui/                # QML + viewmodel
    platform/          # AppPaths/TokenStore/日志/更新 的平台实现
    resources/
  tests/
    unit/              # sdk 单测（无网络：mock HttpBackend）
    integration/       # 对本地 dev server 跑真实 contract
  packaging/
    windows/  macos/  linux/
  docs/
```

放置位置：建议独立仓库或本仓库 `cpp-app/` 子目录（monorepo 便于契约联动，第一版可接受；发布节奏分化后再拆）。

## 16. 数据模型审查与字段建议

现状 → 建议（完整字段冻结表见 `API_V1_FREEZE_PLAN.md` §20）：

| 模型 | 现状 | v1 必须补 | v1 预留（可 null） | 不暴露给 App / admin-only |
| --- | --- | --- | --- | --- |
| User | id, email, displayName, accessLevel, emailVerified | — | — | 密码/验证码相关、session 内部、internalId |
| Profile | handle, displayName, bio, 可见性开关, contactLinks | — | — | `profileAdminDisabled` 原因、审核字段（admin-only） |
| Project | slug, title, desc, tags, 内嵌图片/模型字符串, downloadPolicy 文本 | **id**（slug 之外的稳定 id）、**assets[]（Asset 数组）**、**downloadPolicy 枚举化**、createdAt/updatedAt | version | project_overrides 内部结构、deleted 标记 |
| Asset | 无统一模型（fileUrl/fileSize/fileType 或 file+conversion） | **id, type, url, downloadUrl, fileSize, mimeType, checksum(sha256), createdAt, visibility, downloadPolicy, thumbnailUrl** | version, etag, expiresAt（签名 URL 时启用） | 磁盘物理路径、上传者内部 id |
| DownloadRequest | id, status, purpose, 项目关联 | status 枚举冻结（pending/approved/rejected） | expiresAt | 审批人、admin 备注 |
| CommunityPost | id, title, message, topic, createdAt | pagination 支持 | — | 内部审核状态 |
| Comment | id, message, author, createdAt, projectSlug | — | — | 内部 id 关联 |
| Pagination | page/limit/total（仅 admin visitors 完整） | **page, limit, total, pages, hasNext, hasPrevious 全量冻结** | cursor（预留字段名，不实现） | — |
| ApiError | code + message（已冻结形状） | — | details[]（字段级校验错误，预留） | 堆栈、内部错误 |
| ResponseEnvelope | data/pagination/error（已完成） | v1 下去掉 legacy 顶层镜像 | — | — |

纯客户端模型（不进 API，只进 SDK/SQLite）：

- `LocalAsset`：assetId, cacheKey(=sha256), localPath, fileSize, checksum, downloadedAt, lastVerifiedAt, syncStatus
- `DownloadTask`：taskId, assetId, url, tempPath, bytesTotal/bytesDone, state(queued/running/paused/failed/done), retryCount, error
- `CacheEntry`：cacheKey, refCount, sizeBytes, lastAccessAt（LRU 依据）
- `SyncState`：scope, lastSyncedAt, etag/cursor, status

字段逐项判定（用户列出的 25 个）：`id/slug/handle/title/description/url/thumbnailUrl/fileSize/mimeType/checksum/createdAt/updatedAt/visibility/downloadPolicy/downloadUrl/ownerId` —— **v1 必须**（checksum 与受控 downloadUrl 是缓存与授权下载的前提）；`version/etag/expiresAt/permissions` —— **v1 预留可 null**（permissions 以服务端布尔决策形式给出，如 `canDownload`，不下发规则表）；`cacheKey/localPath/syncStatus/lastSyncedAt/contentHash` —— **客户端本地字段，不进 API**（contentHash 与 checksum 合并，不要两个名字）。

## 17. Asset / Download / Cache 设计

1. **受控下载端点**（后端新增，v1 内）：`GET /api/v1/assets/:id/download` —— Bearer token → 服务端判 downloadPolicy → 302 到带签名的短时效 URL 或直接流式返回；必须支持 `Range` 与 `If-None-Match/ETag`。`/uploads` 静态直出保留给公开图片（头像、预览图），受策略保护的资产文件迁出静态目录。
2. **下载流程**：AssetClient 取元数据（含 checksum）→ DownloadManager 建任务 → temp `.part` 文件 + Range 续传 → 完成后 sha256 校验 → 原子 rename 进 blob store → SQLite 登记 LocalAsset。
3. **缓存**：content-addressed blob + SQLite 索引；配额 + LRU 清理；启动时惰性校验（访问时验 checksum，后台低优先级全量巡检可选）。

## 18. Offline / Sync 后续设计（Phase 5，只定方向）

- 离线库：LocalAsset + 项目元数据快照（SQLite），无网时可浏览已缓存内容。
- 增量同步：优先服务端支持 `updatedAt` 过滤 / ETag；否则客户端全量拉列表 diff（当前数据量可接受）。
- retry queue：下载失败任务持久化，网络恢复自动重试。
- syncStatus 用户可见（每资产：synced / stale / downloading / failed）。

## 19. Cross-platform Risks（按严重程度排序）

| # | 风险 | 严重度 | 规避策略 |
| - | --- | :-: | --- |
| 1 | API 不稳定，SDK 跟着漂移 | 高 | 先 freeze 后开工（本计划 Phase 1 硬前置）；OpenAPI 漂移检测入 CI |
| 2 | auth/token 安全（泄露、明文落盘） | 高 | §11 平台凭证库 + 日志脱敏 + token 生命周期文档化；admin token 永不进 App |
| 3 | 文件下载中断/恢复不可靠 | 高 | 服务端 Range/ETag 支持（v1 内）；客户端 .part + 原子 rename + checksum 终验 |
| 4 | Web/admin 与 App 权限边界被侵蚀 | 高 | admin 功能 Web-only 写入契约；App 仅 visitor token；服务端唯一决策 |
| 5 | macOS codesign/notarization 复杂 | 高 | 视为 P0 打包需求提前办证书；CI 里先跑无签名构建验证 .app 结构 |
| 6 | GPU/驱动差异（尤其 Linux） | 中高 | Qt RHI 下沉差异；viewer 提供软件渲染降级开关；收集 GPU 信息进诊断包 |
| 7 | 3D 模型格式兼容 | 中高 | 服务端统一转 GLB（已有 modelConverter），客户端只支持 GLB；Assimp 后置 |
| 8 | 大文件缓存占满磁盘 | 中 | 配额 + LRU + 设置页手动清理；下载前检查剩余空间 |
| 9 | 离线模式复杂度失控 | 中 | 整体推迟 Phase 5；Phase 2 只做"已缓存文件可打开" |
| 10 | 三平台打包差异 | 中 | 打包脚本从 Phase 2 的 CI artifact 就开始演练，不留到 Phase 4 一次性做 |
| 11 | Linux 发行版差异（glibc、桌面环境） | 中 | AppImage + 老 LTS 容器构建；Secret Service 缺失走加密文件降级 |
| 12 | 自动更新跨平台复杂 | 中 | Phase 2-3 只做版本检查提示；Phase 4 再分平台实现 |
| 13 | token 安全存储平台差异 | 中 | QtKeychain 统一封装 + 降级路径明确（§11） |
| 14 | crash/logging 差异 | 中 | spdlog 统一格式；RelWithDebInfo 符号三平台都保存；crashpad 推迟 |
| 15 | CI matrix 维护成本 | 中 | 只维护 3 个 P0 job；P1 平台复用 artifact 不加 job |
| 16 | Qt 体积过大 | 低中 | 只链接所需模块；AppImage/installer 压缩；接受 ~40-80MB 的桌面现实 |
| 17 | HiDPI/DPI scaling 差异 | 低中 | Qt 6 默认 per-monitor DPI；QML 布局全部用逻辑像素 + 早期三平台截图对比 |
| 18 | 文件路径/权限差异（UTF-8、长路径、只读挂载） | 低中 | §8 路径抽象唯一入口；Windows 开长路径 manifest；路径全走 QString/UTF-8 |
| 19 | 字体渲染差异 | 低 | UI 随系统字体，不追求像素一致；CJK 回退链三平台各验一次 |
| 20 | 本地缓存清理策略平台差异（OS 自动清 Caches） | 低 | macOS Caches 可被系统清——可重新下载的 blob 放 Caches 语义正确；索引 DB 放 Application Support |

## 20. 迁移路线图（五阶段）

**Phase 1 — API v1 Freeze**（与平台无关，见 `API_V1_FREEZE_PLAN.md`）
契约固化、错误码表、pagination/auth/asset/download 规范、INTERNAL_ERROR 兜底、DB-backed contract tests、OpenAPI 抽取、SDK model mapping。
出口条件：freeze checklist 全绿。

**Phase 2 — C++ Cross-platform Prototype**
三平台 CI 从第一个 commit 全绿；登录/登出、token 安全存储、项目列表/详情、受控资产下载（进度/续传）、本地缓存、设置页、日志；community 只读可选。
出口条件：三平台各产出一个可运行构建，SDK 单测 + 对 dev server 的集成测试通过。

**Phase 3 — Cross-platform 3D Viewer**
GLB 加载（tinygltf/Qt Quick 3D）、asset cache 打通、本地资源库 UI、完整性校验、GPU 兼容测试（含 Linux 多驱动）、大模型加载策略（流式/LOD 评估）。

**Phase 4 — Product Packaging**
NSIS + portable zip、.app/.dmg + codesign + notarization、AppImage + deb、自动更新（版本检查 → 分平台更新器）、crashpad 评估、诊断包导出完善。

**Phase 5 — Offline + Sync**
离线库、增量同步、retry queue、下载恢复完善、缓存清理策略、syncStatus UI、本地索引巡检。

### 20.1 Phase-by-phase Platform Support

各阶段的平台支持验收标准（✅ = 硬性验收；◐ = 尽力而为/复用构建；— = 不涉及）：

| 阶段 | Windows 10/11 | macOS (ARM+Intel) | Linux x86_64 | Steam Deck (P1) | Win portable (P1) | Android/iOS (P2) |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Phase 1 — API v1 Freeze | — | — | — | — | — | —（与平台无关） |
| Phase 2 — Prototype | ✅ CI 编译+单测+可运行 | ✅ 同左（arm64+x86_64 均编译） | ✅ 同左 | — | — | —（仅保证 sdk/core/cache/download 无桌面 API 依赖） |
| Phase 3 — 3D Viewer | ✅ D3D11 via RHI | ✅ Metal via RHI | ✅ OpenGL/Vulkan via RHI + 多驱动实测 | ◐ 复用 Linux 构建做一次手动验证 | — | — |
| Phase 4 — Packaging | ✅ NSIS 安装包 | ✅ .dmg + codesign + notarization | ✅ AppImage（deb ◐） | ◐ AppImage 验证手柄/分辨率 | ◐ zip portable（路径随身模式） | — |
| Phase 5 — Offline + Sync | ✅ | ✅ | ✅ | ◐ | ◐ | —（架构自然兼容即可，不投入） |

规则：

- P0 三平台在每个涉及代码的阶段都是同一验收标准，任何阶段不允许"单平台先行、其余后补"。
- P1 平台永不阻塞 P0 验收；P1 只复用 P0 构建产物做验证，不新增 CI job（对应 §19 风险 15）。
- P2 移动端唯一的当期约束：`sdk/core / sdk/cache / sdk/download` 不引入桌面专属 API（见 §7、§15），除此之外零投入。

## 21. 哪些事情现在不要做

- 不重写 Web 为 C++；不做 C++ 内 admin。
- 不做 Android/iOS、不为其增加当前工作量。
- 不上 openapi-generator 生成 C++ 客户端（质量不可控），OpenAPI 只做 spec/检测。
- 不自建 crash 收集服务、不做实时通知、不做插件系统、不做支付/license。
- 不在 freeze 完成前写任何 C++ 业务代码。
- 不把 legacy 顶层镜像带进 /api/v1。

## 22. 哪些事情必须优先做（顺序即优先级）

1. `INTERNAL_ERROR` 全局 envelope 兜底（唯一的 freeze 前服务端代码改动，小而关键）。✅
2. `API_V1_FREEZE_PLAN.md` checklist 执行：DB-backed admin 200 contract tests + 真实 multer 错误 E2E。✅
3. 受控资产下载端点设计定稿（含 Range/ETag/checksum），写入 v1 契约。❌（checklist #6，仍待办）
4. token 生命周期（过期/刷新/多设备）评估并文档化。❌（checklist #5，仍待办）
5. OpenAPI spec 抽取 + CI 漂移检测。🟡 spec 初稿已完成（`docs/openapi/api-v1.yaml`），**CI 自动漂移检测尚未接入**——仍是本项剩余工作。
6. C++ SDK model 头文件草案（从 §16 冻结表直接映射）。✅ 已创建第一批可编译头文件骨架：`cpp-app/sdk/models/*.hpp`、`sdk/core/ApiResult.hpp`、`ApiClient`/各 client stub；不含 JSON parser 或真实网络。
7. cpp-app 骨架 + 三平台 CI matrix（哪怕只编译一个 hello-sdk target）。✅ `cpp-app/` CMake skeleton + smoke CLI 已创建；`.github/workflows/cpp-app.yml` 已加入 Windows/macOS/Linux configure + build + smoke test。
8. 下一步：HTTP backend / JSON parser / OpenAPI validation。HTTP backend 必须只消费 `/api/v1/*` strict envelope；JSON parser/serialization 需用 contract fixture 锁定 envelope 与 model mapping；OpenAPI 自动校验需进入 CI 以防 spec 与实现漂移。Qt/QML 应在 SDK 边界稳定后接入。
