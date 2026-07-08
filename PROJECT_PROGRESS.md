# mrright.blog 项目进度记录

## 2026-07-08：C++ Qt AppController mock auth unit tests

结论：本轮为 optional Qt/QML mock auth flow 新增 `AppController` 单元测试。测试只覆盖 UI controller 状态逻辑，不接真实 `AuthSession`，不创建 `CurlHttpClient`，不访问 API，不读取或写入 TokenStore，不启动 GUI，不做真实登录。SDK core 继续 Qt-free；Qt tests 仅在 `MRRIGHT_ENABLE_QT_UI=ON` 时构建。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未改 Web/API 行为、未做 SQLite cache、未做 secure TokenStore 新实现、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/tests/unit/qt_appcontroller_tests.cpp`：
  - 使用 `QCoreApplication` 和简单断言测试 `AppController`，不使用 GUI window，不做 QML 自动化。
  - 覆盖初始 signed-out state、mock login success、空 email / 空 password validation、logout、clearMessage。
  - 验证 `password` 不作为 Qt property 暴露，mock input text 不反射到 controller properties。
- 更新 `cpp-app/CMakeLists.txt`：
  - `MRRIGHT_ENABLE_QT_UI=OFF` 默认保持不变；OFF 时不找 Qt、不构建 Qt shell、不构建 Qt tests。
  - ON 时构建 `mrright_qt_shell` 和 `mrright_qt_appcontroller_tests`，并注册 CTest。
  - Qt test 只链接 Qt Core 和 SDK core，不把 Qt 引入 SDK core。
- 更新 `.github/workflows/cpp-app.yml`：
  - 保留 existing C++ checks。
  - optional Qt/QML shell job 现在 configure/build 后运行 `mrright_qt_appcontroller_tests`，不启动 GUI shell。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 记录 Qt mock auth controller 状态测试已加入。
  - 明确测试不访问 API、不保存 token、SDK core 仍 Qt-free。

本轮本地验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`），按要求未安装新 Qt 依赖、未伪造成功。Qt AppController test build/run 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. real AuthSession integration in Qt UI
2. project list UI
3. local cache strategy
4. packaging strategy spike

## 2026-07-08：C++ Qt/QML mock auth UI flow 第一批

结论：本轮在 optional Qt/QML shell 基础上新增最小 mock auth UI flow。`AppController` 只维护 UI 状态，`Main.qml` 新增 email/password mock login form；mock login 只根据输入更新 UI，不访问网络、不读取 token、不写入 TokenStore、不调用真实 `AuthSession` login。SDK core 继续 Qt-free。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未改 Web/API 行为、未做 SQLite cache、未做 secure TokenStore 新实现、未做 packaging、未提交构建产物**。

完成内容：

- 更新 `cpp-app/app/ui/qt/AppController.hpp` / `.cpp`：
  - 保留 `appName`、`sdkVersion`、`apiPrefix`。
  - 新增 `status`、`isLoggedIn`、`currentUserLabel`、`loginMessage` UI 状态。
  - 新增 mock-only `mockLogin(email, password)`、`logout()`、`clearMessage()`。
  - `mockLogin` 只检查输入并更新 UI 状态；不访问网络、不读取或写入 TokenStore、不保存 token、不调用 `AuthSession`。
  - password 不保存为成员、不暴露为 property、不打印。
- 更新 `cpp-app/app/ui/qt/Main.qml`：
  - 显示 app name、SDK version、`/api/v1 strict`、status。
  - 新增 email/password input、Mock login button、Logout button。
  - 登录前显示 `Not signed in`，mock login 后显示 `Signed in as <email>`，logout 后回到未登录状态。
  - 明确 UI 文案：mock auth only、no network request、no token persisted。
- CMake / CI：
  - `MRRIGHT_ENABLE_QT_UI=OFF` 默认保持不变。
  - Qt target 仍只在 option ON 时构建。
  - 未新增 Qt 到 SDK core，未新增 vcpkg 依赖。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 记录 Qt/QML mock auth flow 第一批完成。
  - 说明 production login 后续通过 `AuthSession` + secure TokenStore。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。
- 本地 Qt build：本机没有 Qt6 CMake package，按要求不安装新 Qt 依赖；Qt target 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. real AuthSession integration in Qt UI
2. project list UI
3. local cache strategy
4. packaging strategy spike

## 2026-07-08：C++ Qt/QML desktop app shell 第一批

结论：本轮新增可选 C++ Qt/QML desktop app shell 第一批。默认 SDK build 仍不依赖 Qt；只有显式 `MRRIGHT_ENABLE_QT_UI=ON` 时才查找 Qt6 并构建 `mrright_qt_shell`。Qt/QML 代码仅位于 `cpp-app/app/ui/qt`，SDK core 保持 Qt-free。本批只做最小可启动窗口和架构边界，不做真实登录、项目列表、下载、本地缓存或 packaging。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 SQLite cache、未做 secure TokenStore 新实现、未做正式安装包、未提交构建产物**。

完成内容：

- 新增 `cpp-app/app/ui/qt/main_qt.cpp`：
  - 创建 `QGuiApplication` 和 `QQmlApplicationEngine`。
  - 通过 `loadFromModule("Mrright.QtShell", "Main")` 加载 QML。
  - 只注入只读 `AppController`，不创建网络 client，不读取 token，不调用 `AuthSession`。
- 新增 `cpp-app/app/ui/qt/Main.qml`：
  - 显示 app name、SDK version、API mode `/api/v1 strict`、status `UI shell only, no network`。
  - 不包含登录、项目列表、下载、缓存或 admin 功能。
- 新增 `cpp-app/app/ui/qt/AppController.hpp` / `.cpp`：
  - 暴露只读 `appName`、`sdkVersion`、`apiPrefix`、`status`。
  - 读取 `ApiClientConfig::apiPrefix` 作为 SDK 边界信息。
  - 不把 Qt 类型传入 SDK core public API。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_QT_UI=OFF` option。
  - 默认 OFF 时不调用 `find_package(Qt6)`，不构建 Qt target。
  - ON 时 `find_package(Qt6 COMPONENTS Core Gui Qml Quick REQUIRED)`，构建 `mrright_qt_shell` 并链接 `Qt6::Core`、`Qt6::Gui`、`Qt6::Qml`、`Qt6::Quick`。
- 更新 `.github/workflows/cpp-app.yml`：
  - 保留 existing C++ checks。
  - 新增独立 Ubuntu `optional Qt/QML shell` job，只安装 Qt dev 包并 configure/build `mrright_qt_shell`，不运行窗口、不上传构建产物、不读取 secrets、不访问 API。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明 Qt/QML shell opt-in、默认 build 不需要 Qt。
  - 说明 SDK core 与 Qt UI 分层边界。
  - 说明本批 Qt shell 不访问网络、不读取 token、不做缓存。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`），按要求未安装新 Qt 依赖。Qt build 由独立 CI job 验证。
- PR #17 初次 CI 失败原因：Ubuntu runner 使用 Qt 6.4.2，`QQmlApplicationEngine::loadFromModule()` 不可用，`mrright_qt_shell` 在 `main_qt.cpp` 编译时报错 `class QQmlApplicationEngine has no member named loadFromModule`。修复为 Qt 6.4 兼容的 `engine.load(QUrl("qrc:/qt/qml/Mrright/QtShell/Main.qml"))`，并在 CMake 中固定 `Main.qml` resource alias。

后续待办保留：

1. real Qt login screen
2. project list UI
3. local cache strategy
4. packaging strategy spike

## 2026-07-08：C++ Linux Secret Service TokenStore backend

结论：本轮新增 C++ SDK Linux Secret Service TokenStore backend，并更新 `SecureTokenStore` 工厂：Windows 继续返回 Windows Credential Manager backend，macOS 继续返回 Keychain backend，Linux 在 `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON` 且已编译 libsecret backend 时返回 Secret Service backend。`MemoryTokenStore` 仍仅用于 tests/dev session。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/sdk/platform/LinuxSecretServiceTokenStore.hpp` / `LinuxSecretServiceTokenStore.cpp`：
  - 仅在 `__linux__` 且 `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE` 下编译。
  - 使用 libsecret / Secret Service API 保存 visitor token。
  - 默认 schema 为 `mrright.blog`，attribute 为 `account=visitor_token`。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken`、`hasVisitorToken`。
  - 不写普通文件、不读环境变量、不打印 token、不保存 admin token。
- 更新 `cpp-app/sdk/platform/SecureTokenStore.cpp`：
  - Windows 返回 `WindowsCredentialTokenStore`。
  - macOS 返回 `MacOSKeychainTokenStore`。
  - Linux 返回 `LinuxSecretServiceTokenStore` when compiled/enabled。
  - unsupported 平台仍返回 `nullptr`，不降级到 `MemoryTokenStore` 或明文文件。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON` option。
  - Linux 下通过 pkg-config 查找 system `libsecret-1` 并链接 `PkgConfig::LIBSECRET`。
  - Linux option 开启但缺少 pkg-config 或 libsecret dev package 时 CMake 清晰失败。
  - Windows/macOS backend 条件编译和系统库链接保持不变。
- 更新 `cpp-app/tests/unit/secure_tokenstore_tests.cpp`：
  - 保留 Windows Credential Manager guarded test。
  - 保留 macOS Keychain guarded test。
  - Linux enabled build 验证 factory support，并用 fake token 覆盖 save/load/overwrite/clear。
  - 运行时 D-Bus session 或 desktop keyring 不可用时返回 CTest skip code 77 并输出清晰说明。
- 更新 `.github/workflows/cpp-app.yml`：
  - Ubuntu C++ jobs 安装 `libsecret-1-dev`，确保 compile/link 覆盖 Linux Secret Service backend。
  - 保留 temporary parser fallback、default nlohmann/json with vcpkg、libcurl backend with vcpkg checks。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明 secure TokenStore 当前支持 Windows Credential Manager、macOS Keychain、Linux Secret Service。
  - 说明 Linux 运行时可能需要 desktop keyring / D-Bus session。
  - 明确 `MemoryTokenStore` 仅用于 tests/dev session，禁止明文 token 落盘，admin token 不进入 C++ SDK。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。

后续待办保留：

1. local cache strategy
2. Qt/QML prototype
3. packaging strategy spike

## 2026-07-07：C++ macOS Keychain TokenStore backend

结论：本轮新增 C++ SDK macOS Keychain TokenStore backend，并更新 `SecureTokenStore` 工厂：Windows 继续返回 Windows Credential Manager backend，macOS 返回 Keychain backend，Linux 继续 explicit unsupported（返回 `nullptr`）。`MemoryTokenStore` 仍仅用于 tests/dev session。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 Linux Secret Service、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/sdk/platform/MacOSKeychainTokenStore.hpp` / `MacOSKeychainTokenStore.cpp`：
  - 仅在 `__APPLE__` 下编译。
  - 使用 Security.framework Keychain Services 保存 visitor token。
  - 默认 service 为 `mrright.blog`，account 为 `visitor_token`。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken`、`hasVisitorToken`。
  - 不写普通文件、不读环境变量、不打印 token、不保存 admin token。
- 更新 `cpp-app/sdk/platform/SecureTokenStore.cpp`：
  - Windows 返回 `WindowsCredentialTokenStore`。
  - macOS 返回 `MacOSKeychainTokenStore`。
  - Linux/其他平台继续返回 `nullptr`。
  - `isPlatformSecureTokenStoreSupported()` 在 Windows/macOS 为 true，Linux/其他平台为 false。
- 更新 `cpp-app/CMakeLists.txt`：
  - Windows 后端仍只在 `WIN32` 编译并链接 `Advapi32`。
  - macOS 后端只在 `APPLE` 编译并链接 `Security.framework`。
  - Linux 构建不新增平台后端源、不引入 Qt 或新 vcpkg 依赖。
- 更新 `cpp-app/tests/unit/secure_tokenstore_tests.cpp`：
  - Linux 继续验证 secure factory unsupported/nullptr。
  - Windows guarded Credential Manager test 保持可用。
  - macOS guarded Keychain test 使用独立 test service/account 和 fake token 覆盖 save/load/overwrite/clear。
  - macOS CI 遇到 Keychain interaction/permission 类限制时返回 CTest skip code 77 并输出清晰 skip 信息，不伪造 secure backend 成功。
- 更新 `cpp-app/README.md`：
  - 说明 secure TokenStore 当前支持 Windows Credential Manager 与 macOS Keychain。
  - 说明 Linux Secret Service 后续实现。
  - 说明 `MemoryTokenStore` 仅用于 tests/dev session。
  - 明确禁止明文 token 落盘，admin token 不进入 C++ SDK。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 macOS Keychain TokenStore backend 完成。
  - Linux Secret Service 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；5/5 tests passed）。

后续待办保留：

1. Linux Secret Service TokenStore
2. local cache strategy
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ secure platform TokenStore backend entrypoint

结论：本轮新增 C++ SDK secure platform TokenStore 第一批入口。`SecureTokenStore` 工厂位于 `cpp-app/sdk/platform`，Windows 下返回 Windows Credential Manager backend，非 Windows 平台明确 unsupported（返回 `nullptr`），不会静默降级到 `MemoryTokenStore` 或明文文件。`MemoryTokenStore` 继续保留为 tests/dev session 实现。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/sdk/platform/SecureTokenStore.hpp` / `SecureTokenStore.cpp`：
  - `createPlatformSecureTokenStore()` 返回平台 secure `TokenStore`。
  - `isPlatformSecureTokenStoreSupported()` 暴露当前平台是否支持 secure backend。
  - Windows 返回 `WindowsCredentialTokenStore`；macOS/Linux 当前返回 `nullptr`，明确 unsupported。
- 新增 `cpp-app/sdk/platform/WindowsCredentialTokenStore.hpp` / `WindowsCredentialTokenStore.cpp`：
  - 仅在 `_WIN32` 下编译。
  - 使用 Windows Credential Manager API 保存 visitor token。
  - 默认 credential target 为 `mrright.blog.visitor_token`。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken`、`hasVisitorToken`。
  - 不写普通文件、不读环境变量、不打印 token、不保存 admin token。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `mrright_sdk_platform_tokenstore` 静态库。
  - Windows 下额外编译 `WindowsCredentialTokenStore.cpp` 并条件链接 `Advapi32`。
  - 新增 `mrright_cpp_secure_tokenstore_tests` CTest target。
- 新增 `cpp-app/tests/unit/secure_tokenstore_tests.cpp`：
  - 非 Windows 验证 secure factory 明确 unsupported，不伪装为 MemoryTokenStore。
  - Windows guarded test 使用独立 test credential target 覆盖 fake token save/load/overwrite/clear，结束时 clear。
  - 不访问网络、不依赖 admin token、不读取 `.env`、不打印 token。
- 更新 `cpp-app/README.md`：
  - 说明 Windows Credential Manager 是第一批 secure backend。
  - 说明 macOS Keychain / Linux Secret Service 后续实现。
  - 说明 `MemoryTokenStore` 仍仅用于 tests/dev session。
  - 明确禁止明文 token 落盘，admin token 不进入 C++ SDK。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 secure TokenStore backend 第一批完成。
  - macOS/Linux secure backend 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；5/5 tests passed）。

后续待办保留：

1. macOS Keychain TokenStore
2. Linux Secret Service TokenStore
3. local cache strategy
4. Qt/QML prototype
5. packaging strategy spike

## 2026-07-07：C++ Auth session flow

结论：本轮新增 C++ SDK mock-driven Auth session flow。`AuthSession` 组合 `AuthClient`、`TokenStore`、`ApiClientConfig` 和 injected `HttpClient`；登录成功后可把 visitor token 保存到 `TokenStore`，后续 typed client 可通过 `configWithStoredToken()` 让 `ApiClient` 统一注入 `Authorization` header，logout/clear 后清理 `TokenStore`。全程只用 `MockHttpClient` 测试，不访问真实 API，不落盘、不打印 token、不调用 admin endpoints。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 secure platform TokenStore backend、未做 packaging**。

完成内容：

- 新增 `cpp-app/sdk/core/AuthSession.hpp`：
  - `loginAndStoreToken(email, password)`：调用 `AuthClient::login`，成功后保存 visitor token 到注入的 `TokenStore`。
  - `loadToken()` / `hasSession()` / `clearSession()`。
  - `logoutAndClearSession()`：使用 stored token 构造 bearer config，调用 `AuthClient::logout()`，然后清理 `TokenStore`。
  - `configWithStoredToken()`：从 `TokenStore` 读取 token 并写入 `ApiClientConfig::bearerToken`，让 `ApiClient` 统一注入 header。
- 更新 `cpp-app/sdk/core/ApiClientConfig.hpp`：
  - 新增 `withTokenStoreBearerToken(config, tokenStore)` helper。
- 更新 `cpp-app/sdk/core/AuthClient.hpp`：
  - 保留现有显式 token overload。
  - 新增 `logout()` / `me()` overload，用于通过 `ApiClientConfig.bearerToken` 走统一 Authorization header 注入。
- 新增 `cpp-app/tests/unit/auth_session_tests.cpp` 和 CTest target `mrright_cpp_auth_session_tests`：
  - login 成功后 token 保存到 `MemoryTokenStore`。
  - login 失败 strict envelope 不保存 token。
  - authenticated request 使用 stored token 构造 `Authorization` header。
  - token 不进入 request URL。
  - token 不进入 request body。
  - `clearSession()` 后 `hasSession()` false。
  - logout 成功后清理 token。
  - logout strict envelope error 时返回 `ApiResult` error 并清理 token。
  - 全部使用 `MockHttpClient`，不访问网络、不调用 admin endpoint。
- 更新 `cpp-app/README.md`：
  - 说明当前 Auth session flow 为 mock-driven SDK flow。
  - 说明 `MemoryTokenStore` 只用于 tests/dev session。
  - 说明 production secure TokenStore 仍后置。
  - 明确禁止明文 token 落盘。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 Auth session flow 第一批完成。
  - secure platform TokenStore implementation 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；5/5 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；4/4 tests passed）。

后续待办保留：

1. platform secure TokenStore implementation
2. local cache strategy
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ TokenStore strategy and MemoryTokenStore

结论：本轮明确 C++ SDK TokenStore strategy，并新增 test/dev-session only 的 `MemoryTokenStore`。当前 `TokenStore` 抽象保持不破坏；`MemoryTokenStore` 只在内存中保存 visitor token，不落盘、不读环境变量、不打印 token、不访问网络。生产级 token 存储后置到平台安全凭证库。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 secure TokenStore backend、未做 packaging**。

完成内容：

- 新增 `docs/adr/ADR_CPP_TOKENSTORE_STRATEGY.md`：
  - 短期使用 `MemoryTokenStore` 仅支持 tests/dev session。
  - 产品级存储目标为 Windows Credential Manager、macOS Keychain、Linux Secret Service。
  - Qt/QML 阶段可评估 QtKeychain。
  - 明文 JSON/config token persistence 禁止。
  - encrypted local file fallback 需要单独 ADR。
  - admin token 永远不进入 C++ SDK。
- 新增 `cpp-app/sdk/core/MemoryTokenStore.hpp`：
  - header-only。
  - 实现 `TokenStore` interface。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken` 和 `hasVisitorToken`。
  - 不落盘、不读环境变量、不打印 token。
- 新增 `cpp-app/tests/unit/tokenstore_tests.cpp` 和 CTest target `mrright_cpp_tokenstore_tests`：
  - 初始无 token。
  - save 后可 load。
  - clear 后不可 load。
  - 覆盖保存会替换旧 token。
  - 不创建 token 相关文件。
  - 不依赖网络或平台凭证库。
- 更新 `cpp-app/README.md`：
  - 说明 MemoryTokenStore 只用于 tests/dev session。
  - 说明生产 token 存储必须使用平台安全凭证库。
  - 明确禁止明文落盘。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 TokenStore strategy 已决策。
  - secure platform implementation 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；4/4 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；3/3 tests passed）。

后续待办保留：

1. platform secure TokenStore implementation
2. local cache strategy
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ nlohmann/json parser backend set as default

结论：本轮将 C++ SDK parser 默认路径切换为 nlohmann/json，并保留 temporary `JsonValue` parser 作为显式 fallback。默认 CMake 路径现在需要通过 vcpkg manifest 找到 `nlohmann_json`；如需 no-dependency emergency fallback，可显式配置 `MRRIGHT_USE_TEMPORARY_JSON=ON`。JSON 解析仍集中在 `JsonValue.hpp` / `EnvelopeParser.hpp` 边界，typed clients 不直接解析 JSON。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未做 Qt/QML、未做 SQLite cache、未做 secure TokenStore、未做 packaging、未改 Web/API 行为**。

完成内容：

- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_USE_TEMPORARY_JSON=OFF`。
  - 默认 OFF 时使用 nlohmann/json parser backend，执行 `find_package(nlohmann_json CONFIG REQUIRED)`。
  - fallback ON 时定义 `MRRIGHT_USE_TEMPORARY_JSON`，不查找 nlohmann/json，使用 temporary parser。
  - `mrright_cpp_nlohmann_json_tests` 现在随默认 parser path 构建。
- 更新 parser boundary：
  - `cpp-app/sdk/core/JsonValue.hpp` 默认 include `NlohmannJsonValue.hpp`。
  - `cpp-app/sdk/core/EnvelopeParser.hpp` 默认 include `NlohmannEnvelopeParser.hpp`。
  - `MRRIGHT_USE_TEMPORARY_JSON=ON` 时回到 temporary parser / envelope implementation。
- 更新 `.github/workflows/cpp-app.yml`：
  - Windows/macOS/Linux matrix 改为验证 temporary parser fallback no-dependency path。
  - Ubuntu nlohmann/vcpkg job 改为验证默认 nlohmann/json parser path。
  - 保留 Ubuntu libcurl/vcpkg regression job。
- 更新文档：
  - `cpp-app/README.md` 说明 nlohmann/json now default parser、temporary parser fallback、default vcpkg build 命令、fallback no-dependency build 命令。
  - `docs/CPP_APP_MIGRATION_PLAN.md` 标记 nlohmann/json default parser 完成，并保留后续待办。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；3/3 tests passed）。
- fallback/no-dependency CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- libcurl/vcpkg regression：
  - `cmake -S cpp-app -B cpp-app/build-curl -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_ENABLE_CURL_HTTP=ON -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-curl`：通过。
  - `ctest --test-dir cpp-app/build-curl --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；`mrright_cpp_curl_compile_tests` passed；4/4 tests passed）。

后续待办保留：

1. SQLite/local cache strategy
2. secure TokenStore
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ optional nlohmann/json parser backend

结论：本轮在现有 temporary `JsonValue` parser / `EnvelopeParser` 边界基础上，接入 optional nlohmann/json parser backend。默认 CMake build 仍不依赖 vcpkg/nlohmann/json，继续使用 temporary parser；显式开启 `MRRIGHT_USE_NLOHMANN_JSON=ON` 时才 `find_package(nlohmann_json CONFIG REQUIRED)`、定义 `MRRIGHT_USE_NLOHMANN_JSON`，并让 SDK tests 使用 nlohmann-backed parser boundary。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未做 Qt/QML、未做 SQLite cache、未做 secure TokenStore、未做 packaging、未改 Web/API 行为**。

完成内容：

- 更新 `cpp-app/vcpkg.json`：
  - 保留 `curl`。
  - 新增 `nlohmann-json`。
  - 未加入 sqlite3 或 Qt。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_USE_NLOHMANN_JSON=OFF`。
  - OFF 时不调用 `find_package(nlohmann_json)`，默认 no-dependency build 继续走 temporary parser。
  - ON 时查找 `nlohmann_json`、链接 `nlohmann_json::nlohmann_json`、定义 `MRRIGHT_USE_NLOHMANN_JSON`，并构建 `mrright_cpp_nlohmann_json_tests`。
  - 未破坏 `MRRIGHT_ENABLE_CURL_HTTP` 和 local API smoke 的 opt-in 边界。
- 新增 parser backend 文件：
  - `cpp-app/sdk/core/NlohmannJsonValue.hpp`
  - `cpp-app/sdk/core/NlohmannEnvelopeParser.hpp`
  - 解析 strict `/api/v1` envelope：`data` / `pagination` / `error`。
  - 保留 unknown `error.code` raw string。
  - 拒绝 invalid JSON、非 strict envelope、legacy mirror top-level key、缺少 `data`/`pagination`/`error` 的响应。
- 新增 `cpp-app/tests/unit/nlohmann_json_parser_tests.cpp`：
  - success envelope parse。
  - error envelope parse。
  - unknown error.code raw string 保留。
  - legacy mirror 被拒绝。
  - `ProjectClient::listProjects` 使用 nlohmann backend 解析 mock response。
  - invalid JSON 返回 parse error。
  - strict envelope 缺字段返回 contract error。
  - auth/session 最小字段通过 `AuthClient::login` 覆盖。
- 更新 `.github/workflows/cpp-app.yml`：
  - 保留默认 no-dependency Windows/macOS/Linux matrix。
  - 保留 libcurl/vcpkg job。
  - 新增 Ubuntu `cpp-app-nlohmann-vcpkg` job，验证 vcpkg manifest、`MRRIGHT_USE_NLOHMANN_JSON=ON` configure/build/CTest。
- 更新文档：
  - `cpp-app/README.md` 说明默认 temporary parser、optional nlohmann/json backend、启用命令和后续默认化决策。
  - `docs/CPP_APP_MIGRATION_PLAN.md` 记录 nlohmann/json parser backend 已进入验证，temporary parser 仍保留为 no-dependency fallback。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 no-dependency CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- nlohmann-enabled vcpkg CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_NLOHMANN_JSON=ON -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；3/3 tests passed）。
- libcurl/vcpkg CMake regression check：
  - `cmake -S cpp-app -B cpp-app/build-curl -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_ENABLE_CURL_HTTP=ON -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-curl`：通过。
  - `ctest --test-dir cpp-app/build-curl --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_curl_compile_tests` passed；3/3 tests passed）。

后续待办保留：

1. decide when to make nlohmann/json default
2. SQLite/local cache strategy
3. secure TokenStore
4. Qt/QML prototype
5. packaging strategy spike

## 2026-07-06：C++ local API smoke actual validation passed

结论：本地 C++ local API smoke 已实际跑通。本轮只记录验证结果，未改代码、未改 Web/API 行为、未改 C++ 实现、未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未提交构建产物。

本地 API server：

- 启动命令：`npm run dev:server`
- URL：`http://127.0.0.1:4173`

代理注意事项：

- 当前环境存在 `HTTP_PROXY` / `http_proxy`，会影响 localhost / 127.0.0.1 请求。
- curl 验证需要使用 `--noproxy '*'`。
- C++ smoke 需要 unset `HTTP_PROXY` / `http_proxy` / `HTTPS_PROXY` / `https_proxy` / `ALL_PROXY` / `all_proxy`，并设置：
  `NO_PROXY=localhost,127.0.0.1,::1`

curl 验证：

- 命令：`curl --noproxy '*' http://127.0.0.1:4173/api/v1/health`
- 返回 strict JSON envelope：
  - `data.ok: true`
  - `data.service: "mrright-portfolio"`
  - `pagination: {}`
  - `error: null`

C++ local smoke：

- `MRRIGHT_API_BASE_URL=http://127.0.0.1:4173`
- 命令：`ctest --test-dir cpp-app/build-curl-smoke --output-on-failure`
- 代理环境：unset HTTP/HTTPS/ALL proxy，并设置 `NO_PROXY=localhost,127.0.0.1,::1`
- 结果：
  - `mrright_cpp_smoke` passed
  - `mrright_cpp_sdk_tests` passed
  - `mrright_cpp_curl_compile_tests` passed
  - `mrright_cpp_local_api_smoke` passed
  - 4/4 tests passed

覆盖 endpoints：

- `GET /api/v1/health`
- `GET /api/v1/projects`
- missing project 404 strict envelope

安全说明：

- 未访问生产 API。
- 未部署 VPS。
- 未 push GitHub。
- 未改代码。
- 未改数据库、token、secret。
- 未提交 `cpp-app/build-curl-smoke`、`dist`、`build`、`node_modules`、`vcpkg_installed` 或其他构建产物。

## 2026-07-06：修复 /api/v1 dual mount rewrite

结论：本轮只修复本地 `/api/v1` dual mount rewrite 和相关 API contract 测试。发现普通本地请求中 `/api/v1/health` 曾落到 SPA fallback，表现为返回 `text/html` index，而不是进入 `/api/health` handler。已将 `/api/v1` rewrite 改为明确的字符串匹配逻辑，确保 `/api/v1/*` 进入同一套 `/api/*` handler，并通过 `request.apiVersion = 'v1'` 保持 strict envelope mode。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未运行 C++ local smoke、未改 C++ 代码、未改 Web 前端**。

完成内容：

- 修复 `server/index.js`：
  - `/api/v1/health` rewrite 到 `/api/health`。
  - `/api/v1/projects` rewrite 到 `/api/projects`。
  - `/api/v1?x=1` rewrite 到 `/api?x=1`。
  - `/api/v1x` 不 rewrite。
  - rewrite 命中时继续设置 `request.apiVersion = 'v1'`，由 `server/responses.js` 输出 strict envelope。
- 更新 `tests/api/contract.spec.js`：
  - 强化 `GET /api/v1/health` JSON content-type 和 strict top-level keys 检查。
  - 明确断言 `/api/v1/health` 不包含 legacy `ok` / `service` 顶层镜像。
  - 将 v1 前缀误匹配覆盖改为 `/api/v1x/health`。

本地 curl 验证：

- `curl --noproxy '*' -i http://127.0.0.1:4173/api/health`：返回 `application/json`，保留 legacy-compatible 顶层 `ok` / `service` 镜像。
- `curl --noproxy '*' -i http://127.0.0.1:4173/api/v1/health`：返回 `application/json` strict envelope，顶层只有 `data` / `pagination` / `error`。
- `curl --noproxy '*' -i http://127.0.0.1:4173/api/v1x/health`：未 rewrite，返回 SPA HTML fallback。

注意：当前 shell 设置了 `HTTP_PROXY` / `http_proxy`，且没有 `NO_PROXY`，普通 `curl http://127.0.0.1:4173/...` 可能经代理转发；本轮本地验证使用 `--noproxy '*'` 确认命中本机 dev server。

后续需要：

1. C++ local smoke 仍待下一步实际运行。

## 2026-07-05：C++ local API smoke actual run blocked by missing vcpkg

结论：本轮尝试实际运行 C++ local API smoke test，但在环境检查阶段被本地缺少 vcpkg 阻塞。当前仓库工作区开始时干净，后端本地启动命令已确认：`npm run dev:server`（`node server/index.js`）。按要求未自动安装 vcpkg、未修改代码绕过 libcurl/vcpkg、未启动本地 API server、未运行 C++ local smoke、未访问生产 API。**未部署、未 push、未改生产数据库、未读取或修改 `.env`/token/secret、未改 Web/API 行为、未做 Qt/QML、未做 SQLite、未做 TokenStore、未做 packaging**。

环境检查：

- `git status --short --branch`：开始时干净，当前分支 `test/cpp-run-local-api-smoke`。
- `package.json` scripts：
  - 优先后端/API 启动命令：`npm run dev:server` -> `node server/index.js`。
  - 全栈命令：`npm run dev:full`。
- vcpkg/libcurl toolchain 检查：
  - `which vcpkg`：未找到。
  - `VCPKG_ROOT`：空。
  - `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：不存在。
- 阻塞原因：缺少 vcpkg/toolchain，无法按要求配置
  `MRRIGHT_ENABLE_CURL_HTTP=ON` + `MRRIGHT_ENABLE_LOCAL_API_SMOKE=ON`
  的 `cpp-app/build-curl-smoke`。

未执行内容：

- 未启动 local API server。
- 未请求 `http://127.0.0.1:3000/api/v1/health`。
- 未配置 `cpp-app/build-curl-smoke`。
- 未运行 C++ local API smoke CTest。
- 未访问生产域名。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist/`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- C++ local API smoke：
  - 未配置 libcurl-enabled CMake。
  - 未运行 CTest。
  - 未覆盖 `/api/v1/health`、`/api/v1/projects`、missing project 404；原因是本地缺少 vcpkg/toolchain。

后续需要：

1. 安装或配置 vcpkg。
2. 设置 `VCPKG_ROOT` 指向 vcpkg 根目录。
3. 确认 `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake` 存在。
4. 重新运行 local API smoke actual validation。

## 2026-07-05：C++ SDK local dev server API smoke test entrypoint

结论：新增 C++ SDK local/dev API smoke test 入口，用于通过 `CurlHttpClient` 真实请求本地开发服务器的 `/api/v1` strict envelope API。该入口默认关闭，普通 no-dependency CMake build 和普通 CTest 不构建、不运行、不联网；只有显式开启 `MRRIGHT_ENABLE_CURL_HTTP=ON` 与 `MRRIGHT_ENABLE_LOCAL_API_SMOKE=ON` 时才构建并注册 CTest。运行时必须设置 `MRRIGHT_API_BASE_URL`，并且只允许 `http://localhost`、`http://127.0.0.1` 或 `http://[::1]`（可带端口）。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未实现 secure TokenStore、未替换 nlohmann/json、未做 packaging**。

完成内容：

- 新增 `cpp-app/tests/integration/local_api_smoke.cpp`：
  - 使用 `CurlHttpClient` 执行真实 HTTP 请求。
  - `MRRIGHT_API_BASE_URL` 未设置时以 CTest skip code `77` 跳过，并输出清晰说明。
  - `MRRIGHT_API_BASE_URL` 不是 loopback HTTP URL 时拒绝运行。
  - 不读取 `.env`，不使用 token，不登录、不注册、不上传、不调用 admin endpoint、不做写操作。
  - 覆盖 `GET /api/v1/health`：HTTP 200、strict `data`/`pagination`/`error` envelope、`error: null`、`data.ok === true`。
  - 覆盖 `GET /api/v1/projects`：允许 HTTP 200 或当前 local store 不可用时的明确 API error envelope；拒绝 legacy 顶层 `projects` 镜像，并通过 `ProjectClient::listProjects()` / `EnvelopeParser` 解析。
  - 覆盖不存在 project 的 `GET /api/v1/projects/__mrright_cpp_smoke_missing_project__`：验证 404 strict error envelope 且 `error.code` / `error.message` 存在。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_LOCAL_API_SMOKE=OFF`。
  - ON 时要求 `MRRIGHT_ENABLE_CURL_HTTP=ON`，否则 CMake fatal error。
  - ON 且 curl backend 可用时构建 `mrright_cpp_local_api_smoke` 并注册 CTest。
  - 默认 OFF 时不构建、不注册 local API smoke test，不破坏默认无依赖 build。
- 更新 `cpp-app/README.md`：
  - 增加 local API smoke 的配置、构建、运行命令。
  - 明确只允许 localhost/127.0.0.1/[::1]。
  - 明确不访问生产、不读取 `.env`、不做写操作。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 local/dev API smoke test 入口已加入。
  - 保留后续待办。

后续待办保留：

1. nlohmann/json replacement
2. SQLite cache
3. secure TokenStore
4. Qt/QML prototype
5. packaging strategy spike

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：首次在 fresh clone 环境中因缺少本地 `node_modules` 而调用系统 ESLint 6.4 失败；执行 `npm ci` 安装本地依赖后重跑通过。`node_modules/` 未提交。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist/`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- 本地 libcurl/local API smoke build：
  - 本机未发现可用 `vcpkg`，`VCPKG_ROOT` 为空，`$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake` 不存在。
  - 按要求未自动安装 vcpkg，未在仓库内创建 `build-curl-smoke`。
  - 额外尝试在 `/tmp/mrright-cpp-build-curl-smoke` 配置 opt-in smoke target；CMake 因缺少 `CURL::libcurl` 按预期失败并给出需要 vcpkg toolchain 或 curl development package 的错误。
  - `c++ -std=c++20 -Wall -Wextra -Wpedantic -Icpp-app -fsyntax-only cpp-app/tests/integration/local_api_smoke.cpp`：通过。
  - 未启动 local dev server，未访问生产 API。

安全说明：

- 未部署 VPS。
- 未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未访问生产 API。
- 未改 Web/API 行为。
- 未提交 `cpp-app/build`、`cpp-app/build-curl`、`cpp-app/build-curl-smoke`、`vcpkg_installed`、`dist`、`build`、`node_modules` 或其他构建产物。
- 未做下一步任务：Qt/QML、SQLite cache、secure TokenStore、nlohmann/json replacement、packaging。

## 2026-07-05：C++ libcurl-enabled build with vcpkg validation

结论：完成 optional libcurl backend 的 vcpkg validation 路径。本机未配置可用 `vcpkg`（`VCPKG_ROOT` 为空，未找到 `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`），按要求未自动安装；已改由独立 GitHub Actions job `cpp-app-curl-vcpkg` 在 Ubuntu runner 上 bootstrap vcpkg、解析 `cpp-app/vcpkg.json` manifest、以 `MRRIGHT_ENABLE_CURL_HTTP=ON` 配置/build/CTest。默认 no-dependency CMake build 保持独立路径。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未做 local API smoke test、未开发 UI、未做 SQLite cache、未替换 nlohmann/json、未实现 secure TokenStore、未做 packaging、未改 Web/API 行为**。

完成内容：

- 更新 `.github/workflows/cpp-app.yml`：
  - 保留原有 Windows/macOS/Linux 默认 no-dependency C++ skeleton matrix。
  - 新增 `cpp-app-curl-vcpkg` job，先覆盖 `ubuntu-latest`。
  - CI 手动 clone Microsoft vcpkg 到 `$RUNNER_TEMP/vcpkg`，bootstrap 后使用 vcpkg toolchain。
  - 使用 `cpp-app/vcpkg.json` manifest 解析 `curl`。
  - 以 `MRRIGHT_ENABLE_CURL_HTTP=ON` 配置 `cpp-app/build-curl`、构建并运行 CTest。
  - 不上传构建产物、不读取 secrets、不访问生产 API、不运行 local API smoke test。
- 更新 `cpp-app/CMakeLists.txt`：
  - `MRRIGHT_ENABLE_CURL_HTTP` 仍默认 `OFF`。
  - 默认 OFF 时仍不 `find_package(CURL)`，不需要 vcpkg/libcurl。
  - ON 时 `CurlHttpClient.cpp` 继续编译进 `mrright_sdk_curl_http`。
  - ON 时新增 no-network compile/link CTest binary `mrright_cpp_curl_compile_tests`，用于确认 curl backend 真实进入 target 构建链路。
- 新增 `cpp-app/tests/unit/curl_http_compile_tests.cpp`：
  - 只构造 `CurlHttpClient` 并检查 `ApiClientConfig` 保留。
  - 不发送请求、不访问真实 API、不读取 token。
- 更新 `cpp-app/README.md`：
  - 补充 `VCPKG_ROOT` + `MRRIGHT_ENABLE_CURL_HTTP=ON` 本地验证命令。
  - 说明默认 build 仍不需要 vcpkg/libcurl。
  - 说明 CI 有单独 `cpp-app-curl-vcpkg` job。
  - 说明 curl-enabled CTest 是 compile/link-only，不访问真实 API。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 libcurl-enabled build validation 已加入 CI。
  - 说明 CMake/CTest 会验证 optional backend 进入构建链路。

本地 vcpkg 状态：

- `which vcpkg`：未找到。
- `VCPKG_ROOT`：空。
- `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：不存在。
- 按要求未自动安装 vcpkg；本地 `build-curl` configure/build/CTest 未运行，改由 CI workflow 验证。

本轮验证结果：

- `git diff --check`：通过（仅提示既有前端文件 CRLF 将被 Git 规范化；本轮未修改这些文件）。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist/`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- libcurl-enabled CMake：
  - 本地因缺少 vcpkg 未运行。
  - 已加入 CI `cpp-app-curl-vcpkg` 验证 manifest、libcurl dependency resolve、`MRRIGHT_ENABLE_CURL_HTTP=ON` configure、build、CTest。

后续待办保留：

1. local dev server API smoke test
2. nlohmann/json replacement
3. SQLite cache
4. secure TokenStore
5. Qt/QML prototype
6. packaging strategy spike

安全说明：

- 未部署 VPS。
- 未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未访问生产 API。
- 未做 local API smoke test。
- 未提交 `cpp-app/build`、`cpp-app/build-curl`、`vcpkg_installed`、`dist`、`build`、`node_modules` 或其他构建产物。
- 未做下一步任务：nlohmann/json replacement、SQLite cache、secure TokenStore、Qt/QML prototype、packaging。

## 2026-07-05：C++ SDK skeleton branch pushed / PR ready

结论：当前分支 `feat/cpp-sdk-skeleton` 已成功 push 到 GitHub，并已设置 upstream：`origin/feat/cpp-sdk-skeleton`。GitHub 已提示可创建 PR：`https://github.com/rightamen/3d-portfolio/pull/new/feat/cpp-sdk-skeleton`。本轮只记录进度，**未改代码、未改 Web/API/C++ 实现、未改数据库、未部署、未 push**。

当前分支状态：

- 本地分支：`feat/cpp-sdk-skeleton`
- 远程 upstream：`origin/feat/cpp-sdk-skeleton`
- `git status --short --branch`：`## feat/cpp-sdk-skeleton...origin/feat/cpp-sdk-skeleton`
- 当前分支可创建 PR：`feat/cpp-sdk-skeleton -> main` 或对应目标分支。

当前阶段已完成：

- API v1 strict envelope
- OpenAPI contract extraction
- OpenAPI auto validation
- C++ cross-platform SDK skeleton
- C++ CMake skeleton
- GitHub Actions C++ skeleton workflow
- MockHttpClient
- strict envelope parser
- typed clients
- ApiClientConfig
- HTTP backend strategy ADR
- dependency manager strategy ADR
- optional libcurl backend spike

已验证：

- `npm run lint`
- `npm run build`
- `npm run test:api`
- `npm run test:api:db`
- `npm run test:openapi`
- local WSL CMake configure/build/CTest
- default no-dependency C++ build
- libcurl-enabled build 在缺少 libcurl 时按预期失败并给出清晰错误

当前仍未完成：

1. 等待 GitHub Actions 三平台 C++ workflow 结果
2. libcurl-enabled build with vcpkg
3. local dev server API smoke test
4. nlohmann/json replacement
5. SQLite cache
6. secure TokenStore implementation
7. Qt/QML prototype
8. packaging strategy spike

下一步建议：

1. 先检查 GitHub Actions 是否通过。
2. 再开 PR review。
3. PR 通过后再继续下一批：vcpkg/libcurl-enabled build 验证或 local API smoke test。

安全说明：

- 未部署 VPS。
- 未执行新的 push。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API/C++ 源码。
- 未提交 build/dist/node_modules/cpp-app/build/cpp-app/build-curl/vcpkg_installed 或其他构建产物。

## 2026-07-05：C++ optional libcurl HTTP backend spike

结论：完成 optional libcurl HTTP backend spike。新增 `cpp-app/vcpkg.json`（仅 `curl`）、可选 `CurlHttpClient` concrete backend，以及 `MRRIGHT_ENABLE_CURL_HTTP` CMake wiring。默认 build 仍为无外部依赖路径：不查找 libcurl、不要求 vcpkg、`MockHttpClient` 和 SDK tests 继续构建通过。**未做 local API smoke test、未访问生产 API、未接 Qt、未替换 JSON parser、未实现 SQLite cache、未实现 secure TokenStore、未开发 UI、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `cpp-app/vcpkg.json`：
  - package name：`mrright-cpp-app`。
  - 当前只声明 `curl` 依赖。
  - 未加入 `nlohmann-json`、sqlite3、Qt 或其他依赖。
- 更新 `cpp-app/CMakeLists.txt`：
  - `MRRIGHT_ENABLE_CURL_HTTP` 继续默认 `OFF`。
  - 默认 OFF 时不调用 `find_package(CURL)`，不链接 libcurl，默认 smoke/tests 保持无依赖构建。
  - ON 时先尝试 `find_package(CURL CONFIG QUIET)`，再尝试 `find_package(CURL QUIET)`。
  - 找不到 libcurl 时给出明确 fatal error，提示使用 vcpkg toolchain 或安装 curl development package。
  - ON 且找到 libcurl 时构建 `mrright_sdk_curl_http`，链接 `CURL::libcurl`。
- 新增 `cpp-app/sdk/network/CurlHttpClient.hpp` / `.cpp`：
  - 实现 `HttpClient::send(HttpRequest)`。
  - 支持 GET、POST、PUT、DELETE、PATCH。
  - 支持 request URL/path、headers、body、`ApiClientConfig.timeoutMs`。
  - 返回 `HttpResponse.statusCode`、body、best-effort response headers。
  - 网络错误通过 `ApiResult` 返回，不以 throw 作为主路径。
  - 不解析业务 JSON，不理解 Project/User/Community，不保存 token，不打印 `Authorization`，不写死 `/api/v1`。
  - `ApiClient` 仍负责 `/api/v1` path、legacy/admin path 拒绝、通用 headers 和 bearer token header。
- `RealHttpClient` 保持 placeholder：
  - 默认继续返回 `REAL_HTTP_BACKEND_NOT_ENABLED`。
  - 默认 build 下不依赖 libcurl。
- 更新 `.gitignore`：
  - 忽略 `cpp-app/build-curl/` 与 `cpp-app/vcpkg_installed/`。
- 更新 `cpp-app/README.md` 与 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明默认 build 不需要 libcurl。
  - 说明如何用 vcpkg toolchain 启用 optional libcurl backend。
  - 明确不提交 `vcpkg_installed`、`cpp-app/build`、`cpp-app/build-curl`。
  - 明确 real API smoke test 不是本批任务，后续必须指向 local/dev server。

仍未实现 / 后续待办：

1. local API smoke test against dev server
2. nlohmann/json replacement
3. SQLite cache
4. secure TokenStore
5. Qt/QML prototype
6. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- libcurl-enabled build：
  - 本机未发现可用 `vcpkg` / `curl-config` / pkg-config libcurl，未安装新依赖。
  - 已验证 `MRRIGHT_ENABLE_CURL_HTTP=ON` 且缺少 libcurl 时 CMake 给出清晰错误：需要 vcpkg toolchain 或 curl development package 提供 `CURL::libcurl`。
  - 因缺少本地 libcurl/vcpkg，未完成 `build-curl` 编译和 CTest；后续由 dependency-enabled 本地/CI 环境验证。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未访问生产 API。
- 未做 local API smoke test。
- 未提交 dist/build/node_modules/cpp-app/build/cpp-app/build-curl/vcpkg_installed 或其他构建/依赖产物。
- 未做 nlohmann/json replacement、SQLite cache、secure TokenStore、Qt/QML prototype、packaging 等下一步任务。

## 2026-07-05：C++ dependency manager strategy ADR

结论：完成 C++ dependency manager 策略 ADR。最终选择 vcpkg manifest mode 作为 SDK/backend native dependencies 的首选策略；本批不新增实际依赖、不新增 `vcpkg.json`、不改 CMake 依赖 wiring，继续保持当前无外部依赖 mock build。下一批 libcurl backend spike 时再引入 vcpkg manifest。**未实现 libcurl backend、未接 Qt、未替换 JSON parser、未改 C++ SDK 代码、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `docs/adr/ADR_CPP_DEPENDENCY_MANAGER_STRATEGY.md`：
  - 记录当前 `cpp-app` CMake skeleton 无外部 runtime 依赖。
  - 记录 JSON 长期倾向 `nlohmann/json`、HTTP backend 下一步倾向 libcurl。
  - 比较 vcpkg manifest、Conan、系统包、CMake `FetchContent`、vendoring。
  - 接受推荐方案：vcpkg manifest 管理 libcurl、nlohmann-json、sqlite3 等 SDK/backend 依赖。
  - 明确 Qt 在 Qt/QML 阶段单独评估，可用 vcpkg、Qt 官方安装器或 aqtinstall，但本批不引入。
  - 明确不提交 `vcpkg_installed/`、依赖缓存、第三方源码或构建产物。
- 更新 `cpp-app/README.md`：
  - 增加 dependency strategy 简述。
  - 说明当前 skeleton 无外部 C++ runtime 依赖。
  - 说明后续 libcurl / nlohmann-json / sqlite3 倾向 vcpkg manifest 管理。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 dependency manager strategy 已决策。
  - 下一步调整为 libcurl backend spike + vcpkg manifest。

仍未实现 / 后续待办：

1. libcurl backend spike
2. vcpkg manifest
3. local API smoke test
4. nlohmann/json replacement
5. SQLite cache
6. secure TokenStore
7. Qt/QML prototype

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
- `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
- `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ SDK HTTP backend strategy ADR

结论：完成 C++ SDK HTTP backend 策略 ADR。最终路线是继续保持 `HttpClient` abstraction，业务 client 不依赖具体网络库；短期 `RealHttpClient` 仍是 placeholder，不实现真实网络；下一批优先做可选 libcurl backend spike；Qt Network backend 后置到 Qt/QML prototype 阶段。**未实现真实 HTTP、未接 Qt、未接 libcurl、未开发 UI、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `docs/adr/ADR_CPP_HTTP_BACKEND_STRATEGY.md`：
  - 记录当前 `HttpClient` / `MockHttpClient` / `RealHttpClient` / `/api/v1` request construction / `EnvelopeParser` 状态。
  - 比较 libcurl first、Qt Network first、继续 placeholder、抽象 + libcurl first + Qt later 四种方案。
  - 接受推荐方案：`HttpClient` abstraction + optional libcurl backend first + Qt backend later。
  - 明确 `ApiClient`、`HttpClient backend`、`EnvelopeParser`、typed clients 的职责边界。
  - 明确 backend/network error 与 `/api/v1` envelope API error 的区别。
  - 明确 token 只通过内存配置或未来 `TokenStore`，`HttpClient` 不持久化 token，日志不得输出 `Authorization`。
  - 明确 `MRRIGHT_ENABLE_CURL_HTTP` 当前默认 OFF，后续 libcurl 通过 vcpkg manifest 或 Conan 管理，不 vendoring。
- 更新 `cpp-app/README.md`：
  - 说明 `RealHttpClient` 当前仍是 no-network placeholder。
  - 说明 `MockHttpClient` 用于 request construction 和 envelope parsing 测试。
  - 链接 HTTP backend strategy ADR。
  - 说明当前不访问生产 API，token 不写入配置文件或日志。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 HTTP backend strategy 已决策。
  - 下一步调整为 libcurl backend spike / dependency manager decision。

本地 WSL CMake 状态：

- 已记录并继续有效：`cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`、`cmake --build cpp-app/build`、`ctest --test-dir cpp-app/build --output-on-failure` 均已通过。
- 本批会重新运行 CMake configure/build/CTest；`cpp-app/build/` 不提交。

仍未实现 / 后续待办：

1. libcurl backend spike
2. dependency manager strategy：vcpkg vs Conan
3. real API smoke test against local dev server
4. JSON parser replacement with nlohmann/json
5. SQLite cache
6. secure TokenStore implementation
7. Qt/QML prototype

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
- `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
- `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ local WSL CMake validation

结论：已在 `/mnt/g/Code/3d-portfolio` 下完成 `cpp-app` 本地 WSL Ninja Debug CMake 验证。`mrright_cpp_smoke` 与 `mrright_cpp_sdk_tests` 均通过，CTest 结果为 `2/2 tests passed`。本批只更新验证记录文档，**未改代码、未改 Web/API 行为、未改数据库、未部署、未 push**。

执行记录：

- CMake configure：`cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`
- CMake build：`cmake --build cpp-app/build`
- CTest：`ctest --test-dir cpp-app/build --output-on-failure`

测试结果：

- `mrright_cpp_smoke`：passed。
- `mrright_cpp_sdk_tests`：passed。
- `2/2 tests passed`。

Git / 构建产物状态：

- `git status --short --branch` 保持干净：`## feat/cpp-sdk-skeleton`。
- `cpp-app/build/` 未提交，已由 `.gitignore` 忽略。
- 未提交 `dist` / `build` / `node_modules` / `cpp-app/build`。

验证结果：

- `git diff --check`：待运行。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。

## 2026-07-05：C++ SDK JSON parser dependency decision

结论：完成 C++ SDK JSON 解析策略决策。短期保留当前 `JsonValue.hpp` temporary parser，仅用于 early SDK prototype / mock-driven strict-envelope tests，并继续把 JSON 边界收敛在 `EnvelopeParser.hpp`；长期选择通过未来 C++ dependency manager 接入 `nlohmann/json`。本批不新增第三方依赖、不 vendored 大文件、不让 CMake 默认联网下载依赖。**未实现真实 HTTP、未开发 UI、未接 SQLite、未改 Web/API 行为、未改数据库、未部署、未 push**。

方案比较结论：

- 继续保留当前 `JsonValue` parser：跨平台和离线构建最好，适合当前 contract fixtures；但 Unicode、number、诊断、完整 JSON 兼容性不足，只能作为临时 parser。
- `nlohmann/json`：长期首选。跨平台成熟、header-only 使用方便、CMake/vcpkg/Conan 集成简单，适合 SDK core typed model decoding，不依赖 Qt UI，也不妨碍未来 Qt/QML。
- Boost.JSON：技术上可行，但为了 JSON 单独引入 Boost 生态偏重，不适合当前轻量 SDK 阶段。
- Qt JSON：适合未来 Qt UI/network 层，但现在接入会让 SDK core 过早依赖 Qt。
- simdjson：适合未来大规模 JSON 性能场景；当前 envelope/client 阶段过早。

完成内容：

- 新增 `docs/adr/ADR_CPP_JSON_STRATEGY.md`：
  - 记录背景、当前 parser 限制、方案比较、最终决策、短期/长期策略、CMake/CI/SDK model 影响，以及明确不做事项。
- 更新 `cpp-app/sdk/core/JsonValue.hpp`：
  - 增加注释，标明它是 early SDK contract tests 的 temporary prototype JSON boundary。
  - 明确不得扩展成 production JSON library，业务 client 不应直接散落 JSON 解析逻辑。
- 更新 `cpp-app/README.md`：
  - 说明当前 JSON 策略仍使用 temporary parser。
  - 说明长期目标是通过未来 C++ dependency manager 引入 `nlohmann/json`。
  - 说明本批不 vendored 大文件、不让 CMake 默认联网下载依赖。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 JSON parser strategy 已决策。
  - 保留后续真实 HTTP backend / Qt-vs-libcurl dependency strategy 作为下一步。

仍未实现 / 后续待办：

1. real libcurl or Qt Network backend
2. OpenAPI generated client spike
3. SQLite cache
4. secure TokenStore implementation
5. Qt/QML prototype
6. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `c++` 直接编译 smoke + SDK tests：通过（`SDK contract tests passed.`）。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ SDK HTTP client configuration / backend abstraction 第一批

结论：在现有 `MockHttpClient` / `EnvelopeParser` / typed clients 基础上，完成真实 HTTP backend 的可替换接口层第一批：新增 `ApiClientConfig`、统一请求构造、内存 bearer token header、`RealHttpClient` 占位实现、更多 typed client 方法和请求构造测试。默认构建仍不依赖 Qt/libcurl，不做真实联网。**未开发 UI、未接 SQLite、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `cpp-app/sdk/core/ApiClientConfig.hpp`：
  - `baseUrl`：默认空，不硬编码生产域名；README 示例使用 `http://localhost:3000`。
  - `apiPrefix`：默认 `/api/v1`。
  - `timeoutMs`：默认 30000。
  - `userAgent`：默认 `mrright-cpp-sdk/0.1`。
  - `bearerToken`：可选，仅内存配置，不落盘。
- 更新 `ApiClient`：
  - 所有业务 path 统一由 `ApiClient` 构造。
  - 自动拼接 `baseUrl + /api/v1 + path`。
  - 自动设置 `Accept: application/json`。
  - POST/PUT/PATCH 且 body 非空时自动设置 `Content-Type: application/json`。
  - `ApiClientConfig.bearerToken` 存在时自动设置 `Authorization: Bearer <token>`。
  - 继续拒绝 `/admin...` 与 legacy `/api/...` path。
  - 明确只支持 strict `/api/v1`，拒绝非 `/api/v1` prefix。
- 新增 `cpp-app/sdk/network/RealHttpClient.hpp`：
  - 可替换真实 backend 占位实现。
  - 当前不联网，返回 `REAL_HTTP_BACKEND_NOT_ENABLED`。
  - 后续可在同一 `HttpClient` interface 后接 Qt Network 或 libcurl。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_CURL_HTTP` option，默认 OFF。
  - 当前启用该 option 会明确失败，避免误以为 libcurl backend 已实现；默认构建不依赖外部 HTTP 包。
- typed clients 扩展：
  - `AuthClient::logout(token)`：mockable `POST /api/v1/auth/logout`。
  - `AuthClient::me(token)`：mockable `GET /api/v1/auth/me`。
  - `ProjectClient::likeProject(slug, visitorId, token)`：mockable `POST /api/v1/projects/{slug}/like`。
  - `ProjectClient::createComment(slug, request, token)`：mockable `POST /api/v1/projects/{slug}/comments`。
  - `CommunityClient::listPosts()`、`getPost(id)`、`listComments(postId)`、`createComment(...)`、`likeComment(...)` 第一批 mockable 方法。
  - 未实现不确定 endpoint 的完整业务流；未调用 admin；未编造 OpenAPI 未确认字段。
- 新增/扩展 C++ tests：
  - `ApiClientConfig` 默认 `apiPrefix == /api/v1`，`baseUrl` 不硬编码生产域名。
  - `ProjectClient::listProjects` 构造 `GET /api/v1/projects`。
  - `AuthClient::login` 构造 `POST /api/v1/auth/login`。
  - POST 请求设置 `Content-Type`。
  - bearer token 只进入 `Authorization` header。
  - legacy `/api` path 被拒绝。
  - `/admin` path 被拒绝。
  - error envelope 让 typed client 返回 `ApiResult` error。
  - invalid/non-envelope JSON 返回 contract error。
  - `RealHttpClient` 当前返回 backend-not-enabled error，不联网。

本地 CMake 状态：

- 本地仍无 `cmake` 命令；未安装新依赖，未执行正式 CMake configure/build/ctest。
- 使用直接 `c++` compile 验证：
  - `mrright_cpp_smoke`：通过。
  - `mrright_cpp_sdk_tests`：通过。
- CI workflow 负责三平台 CMake configure/build/smoke 验证；默认构建无 Qt/libcurl 依赖。

仍未实现 / 后续待办：

1. real libcurl or Qt Network backend
2. JSON parser dependency decision
3. OpenAPI generated client spike
4. SQLite cache
5. secure TokenStore implementation
6. Qt/QML prototype
7. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `c++` 直接编译 smoke + SDK tests：通过（`SDK contract tests passed.`）。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ SDK JSON / HTTP abstraction 第一批（mock-driven typed client）

结论：把 `cpp-app` SDK 从纯 skeleton 推进到可测试的 typed client 基础层。新增无外部依赖的最小 JSON/envelope decoding 边界、`HttpClient` mock、`AuthClient::login` / `ProjectClient::{listProjects,getProject}` 的 mock-driven 行为，以及 C++ unit test binary。**未实现真实 HTTP、未接 Qt/libcurl、未开发 UI、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `cpp-app/sdk/core/JsonValue.hpp`：
  - header-only 最小 JSON AST/parser，只覆盖当前 strict envelope contract fixture 需要的 object/array/string/number/bool/null。
  - 不引入第三方 JSON 库、不新增 npm 依赖、不 vendored 大文件、不依赖系统包。
  - Unicode escape 仅作为占位保留，真实 parser 作为后续 dependency strategy 决策。
- 新增 `cpp-app/sdk/core/EnvelopeParser.hpp`：
  - 统一解析 strict `/api/v1` envelope，业务 client 不直接散落 JSON 解析逻辑。
  - 支持成功 envelope：`data` object、`pagination` object、`error: null`。
  - 支持错误 envelope：`data: null`、`error.code` / `error.message`。
  - 支持 `Pagination` 六字段基础解析。
  - 未知 `error.code` 映射到 `ApiErrorCode::Unknown`，保留原始 code 字符串。
  - 非 strict envelope / legacy 顶层镜像返回 `RESPONSE_CONTRACT_ERROR`。
- 更新 `cpp-app/sdk/network/HttpClient.hpp`：
  - `HttpRequest`：`method`、`path`、`headers`、`body`。
  - `HttpResponse`：`statusCode`、`headers`、`body`。
  - `HttpClient::send(HttpRequest) -> ApiResult<HttpResponse>`。
  - `NullHttpClient` 保持不联网。
  - 新增 `MockHttpClient`：队列式固定响应、记录 requests，用于 typed client 单测。
- 更新 typed clients：
  - `ApiClient` 统一拼接 `/api/v1` path，拒绝 `/admin...` 与 `/api/...` path。
  - `AuthClient::login(...)` 通过 `HttpClient` 发送 mockable `POST /api/v1/auth/login`，解析 `session.token` / `expiresAt` / `user`。
  - `ProjectClient::listProjects()` 发送 `GET /api/v1/projects` 并解析 `projects[]`。
  - `ProjectClient::getProject(slug)` 发送 `GET /api/v1/projects/{slug}` 并解析 `project`。
  - 不实现 admin endpoint，不支持 legacy `/api/*`，不读取 token。
- 新增 `cpp-app/tests/unit/sdk_contract_tests.cpp`：
  - 成功 envelope 可以解析。
  - 错误 envelope 可以解析。
  - unknown `error.code` 保留原始字符串并映射 Unknown。
  - legacy mirror / 非 strict envelope 被拒绝。
  - `MockHttpClient` 能驱动 `ProjectClient::listProjects`。
  - `ProjectClient` 构造 `/api/v1/projects`，不是 legacy `/api/projects`。
  - admin path 在 `ApiClient` 层被拒绝，且不会调用 `HttpClient::send`。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `mrright_cpp_sdk_tests` binary。
  - CTest 增加 `mrright_cpp_sdk_tests`。
  - smoke binary 保留。
- 更新 `cpp-app/README.md` 与 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明当前支持 mock-driven typed client tests。
  - 说明尚无真实 HTTP backend。
  - 说明 JSON parser 当前为无依赖最小 parser，后续需做依赖策略决策。
  - 下一步为真实 HTTP backend / dependency strategy。

本地 CMake 状态：

- 本地仍无 `cmake` 命令；未安装新依赖，未执行正式 CMake configure/build/ctest。
- 使用直接 `c++` compile 尽量验证：
  - `mrright_cpp_smoke`：通过。
  - `mrright_cpp_sdk_tests`：通过。
- CI workflow 负责三平台 CMake configure/build/smoke 验证；本批新增 test binary 已接入 CMake/CTest，后续 CI 会一并构建运行。

仍未实现 / 后续待办：

1. Real HTTP backend
2. JSON parser dependency decision
3. OpenAPI generated client spike
4. SQLite cache
5. secure TokenStore implementation
6. Qt/QML prototype
7. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `c++` 直接编译 smoke + SDK tests：通过（`SDK contract tests passed.`）。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：OpenAPI 自动校验工具接入（API v1 freeze 工程化）

结论：把 `docs/openapi/api-v1.yaml` 从静态文档升级为可自动校验的 contract artifact。新增 `scripts/validate-openapi.mjs` 与 `npm run test:openapi`，校验 YAML、`$ref`、strict envelope、response envelope 使用方式以及 `API_ERROR_CODES` 与 OpenAPI enum 一致性。**未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新建 `scripts/validate-openapi.mjs`：
  - 使用项目现有依赖树中的 `js-yaml` 解析 `docs/openapi/api-v1.yaml`，不新增重量级依赖。
  - 校验 YAML 可解析。
  - 校验顶层 `openapi` 存在。
  - 校验 `paths` 存在且非空。
  - 校验 `components.schemas` 存在。
  - 校验 `components.schemas.ResponseEnvelope` / `ApiError` / `Pagination` 存在。
  - 遍历并解析全部本地 `$ref`，缺失路径会失败。
  - 校验所有 `application/json` response schema 必须通过 `ResponseEnvelope` 或 `ErrorEnvelope`，避免裸返回业务模型。
  - 校验 strict `/api/v1` envelope 顶层只允许 `data` / `pagination` / `error`，且 `additionalProperties: false`。
  - 从 `server/responses.js` 读取 `API_ERROR_CODES`，与 OpenAPI `components.schemas.ApiErrorCode.enum` 做集合一致性比对；缺失或多余 code 都会失败。
- 更新 `package.json`：
  - 新增 `"test:openapi": "node scripts/validate-openapi.mjs"`。
- 更新 `docs/API_V1_FREEZE_PLAN.md`：
  - §18 标记 OpenAPI 自动校验脚本已接入。
  - checklist #9 标记为 ✅，说明已校验 YAML、`$ref`、response envelope、strict envelope 顶层键、error code enum。
- CI 说明：
  - 当前仓库只有独立的 C++ App Skeleton workflow，没有现成 Web/API lint/build/test workflow；本批未混改 C++ workflow。
  - 后续新增 Web/API CI 时，应把 `npm run test:openapi` 与 lint/build/API contract tests 放入同一质量门。

仍未实现 / 后续待办：

1. C++ HTTP backend
2. JSON parser/serialization
3. Qt/QML UI prototype
4. SQLite cache
5. secure TokenStore implementation
6. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（YAML 可解析；200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ cross-platform skeleton 工程化验证批次（CI matrix / ignore / docs）

结论：在不实现真实 HTTP、不开发 UI、不改 Web/API 行为的前提下，完成 `cpp-app` skeleton 的工程化验证入口补强。新增三平台 GitHub Actions matrix、补 CMake 构建产物 ignore 规则，并更新 README / 迁移计划 / 进度记录。

CMake skeleton 审查结果：

- `cpp-app/CMakeLists.txt` 已包含 `app/platform/AppPaths.cpp`，并通过 `mrright_app_platform` 静态库链接到 `mrright_cpp_smoke`。
- include 目录使用 `${CMAKE_CURRENT_SOURCE_DIR}`，与当前 include 写法（`#include "sdk/..."`、`#include "app/..."`）匹配。
- C++20 设置清晰：`CMAKE_CXX_STANDARD 20`、`CMAKE_CXX_STANDARD_REQUIRED ON`、`CMAKE_CXX_EXTENSIONS OFF`，同时 `mrright_sdk_core` 暴露 `cxx_std_20`。
- warning flags 跨平台安全：MSVC 使用 `/W4 /utf-8`，其他编译器使用 `-Wall -Wextra -Wpedantic`。
- `CMakePresets.json` 保留 `debug`、`release`、`relwithdebinfo`，不强绑单一 generator，适合 Windows/macOS/Linux 用各自默认生成器。
- build 输出目录为 `cpp-app/build` 或 preset 下的 `cpp-app/build/<preset>`；本批已在 `.gitignore` 排除，不污染 git。
- README 构建命令已改为跨平台更稳的 `cmake --build ... --config Debug` + `ctest --test-dir ... --build-config Debug`，避免直接写死单配置生成器下的可执行文件路径。

完成内容：

- 新增 `.github/workflows/cpp-app.yml`：
  - workflow 名称：`C++ App Skeleton`
  - matrix：`ubuntu-latest`、`macos-latest`、`windows-latest`
  - 每个平台执行：
    - `cmake -S cpp-app -B cpp-app/build -DCMAKE_BUILD_TYPE=Debug`
    - `cmake --build cpp-app/build --config Debug`
    - `ctest --test-dir cpp-app/build --build-config Debug --output-on-failure`
  - 不部署、不读取 secrets、不 push、不上传构建产物。
- 更新 `.gitignore`：
  - `cpp-app/build/`
  - `cpp-app/out/`
  - `cpp-app/.cache/`
  - `CMakeFiles/`
  - `CMakeCache.txt`
  - `compile_commands.json`
- 更新 `cpp-app/README.md`：
  - 说明本地需要 CMake 3.20+ 与 C++20 compiler。
  - 说明无本地 CMake 时可用 GitHub Actions CI 验证。
  - 说明支持 CMakePresets：`debug`、`release`、`relwithdebinfo`。
  - 说明 smoke binary 只验证 SDK skeleton / platform paths / no-network CLI，不调用 `/api/v1`、不读取 token、不测试真实业务。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 C++ App Skeleton CI matrix 已加入。
  - 下一步明确为 HTTP backend / JSON parser / OpenAPI validation；Qt/QML 后置到 SDK 边界稳定后。

本地 CMake 状态：

- 本地仍无 `cmake` 命令；未安装新依赖，未执行正式 CMake configure/build。
- CI workflow 已提供 Windows/macOS/Linux 验证入口。

仍未实现 / 后续待办：

1. OpenAPI 自动校验工具接入
2. C++ HTTP backend
3. JSON parser/serialization
4. Qt/QML UI prototype
5. SQLite cache
6. secure TokenStore implementation
7. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 build/dist/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ cross-platform skeleton 第一批（SDK / CMake / smoke CLI）

结论：从零创建 `cpp-app/`，完成 C++ cross-platform prototype skeleton 第一批。范围严格限定为 SDK/架构骨架、CMake、平台路径抽象、TokenStore 接口和最小 smoke binary；**未开发正式 UI、未实现真实 HTTP、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新建 `cpp-app/` 目录结构：
  - `CMakeLists.txt`、`CMakePresets.json`、`README.md`
  - `cmake/`、`include/`
  - `src/main.cpp`
  - `sdk/core/`、`sdk/network/`、`sdk/models/`、`sdk/cache/`、`sdk/download/`
  - `app/platform/`、`app/ui/`
  - `tests/unit/`
  - `packaging/windows/`、`packaging/macos/`、`packaging/linux/`
- CMake：
  - 默认只构建 `mrright_cpp_smoke` CLI smoke binary，不引入 Qt UI。
  - `CMakePresets.json` 包含 `debug`、`release`、`relwithdebinfo`。
  - `ctest` 注册 smoke test（后续 CI 可直接跑 configure + build + test）。
- SDK model headers（来自 `docs/openapi/api-v1.yaml` 与 `docs/API_V1_MODEL_MAPPING.md`）：
  - `ApiError.hpp`、`Pagination.hpp`、`ResponseEnvelope.hpp`
  - `User.hpp`、`Profile.hpp`、`Project.hpp`
  - `Asset.hpp`、`CommunityPost.hpp`、`Comment.hpp`、`DownloadRequest.hpp`
  - nullable 使用 `std::optional`，array 使用 `std::vector`，datetime 暂用 ISO-8601 `std::string` 占位；README 说明后续再决定 `std::chrono` 或 Qt 边界类型。
  - `Asset` 明确标注 aspirational target model：受控 `downloadUrl`、`checksum`、`mimeType`、`etag` 等字段尚未由 API 完整实现。
  - 未把 admin-only model 放入 SDK public surface。
- SDK core/network interfaces：
  - `ApiResult.hpp`：Result-style 返回，不把 exception 作为主路径。
  - `ApiClient.hpp`：默认 base path 为相对 `/api/v1`，不硬编码生产域名。
  - `AuthClient.hpp`、`ProjectClient.hpp`、`CommunityClient.hpp`、`AssetClient.hpp`：只定义最小 stub，不发真实 HTTP。
  - `HttpClient.hpp`：网络抽象 + `NullHttpClient`，真实 backend 后续实现。
  - `TokenStore.hpp`：只定义接口；注释明确未来使用 Windows Credential Manager、macOS Keychain、Linux Secret Service 或显式加密文件降级；禁止普通配置文件明文存 token。
  - `ApiError` 保留 raw `code` 字符串，同时映射到 enum；未知错误码落 `ApiErrorCode::Unknown`。
- 平台路径抽象：
  - `app/platform/AppPaths.hpp/.cpp` 定义 `configDir()`、`cacheDir()`、`dataDir()`、`logDir()`、`downloadDir()`、`tempDir()`。
  - Windows/macOS/Linux 使用条件编译占位；当前基于 HOME/XDG/APPDATA/LOCALAPPDATA 的安全占位，不写死 Windows-only 路径。
  - README 说明后续替换为 Qt StandardPaths 或平台原生 API。
- `src/main.cpp`：
  - 打印 SDK skeleton 名称和版本。
  - 构造 `Pagination` / `ApiError` / `ResponseEnvelope` 示例。
  - 不联网、不读取 secret。

验证结果：

- `c++ -std=c++20 -Wall -Wextra -Wpedantic -Icpp-app cpp-app/src/main.cpp cpp-app/app/platform/AppPaths.cpp -o /tmp/mrright_cpp_smoke && /tmp/mrright_cpp_smoke`：通过。
- 本地 `cmake --version`：失败（当前环境无 `cmake` 命令），因此未执行正式 `cmake -S cpp-app -B cpp-app/build -DCMAKE_BUILD_TYPE=Debug` / `cmake --build cpp-app/build`。未安装新依赖；README 已记录后续本地/CI 验证方式。
- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。

修改文件：

- `cpp-app/`（新建）
- `docs/CPP_APP_MIGRATION_PLAN.md`
- `PROJECT_PROGRESS.md`

仍未实现 / 后续待办：

1. OpenAPI 自动校验工具接入
2. C++ HTTP backend
3. Qt/QML UI prototype
4. SQLite cache
5. secure TokenStore implementation
6. CI build matrix
7. packaging strategy spike

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 build/dist/node_modules 或 C++ build 产物。

## 2026-07-05：OpenAPI v1 初稿 + C++ SDK model mapping 抽取（freeze checklist #9/#10 初稿）

结论：把已被 `tests/api/contract.spec.js`/`tests/api/contract.db.spec.js` 锁住的 `/api/v1` strict envelope 契约，沉淀为正式 OpenAPI 规范初稿与 TS/C++ model mapping 文档。纯文档/契约抽取批次，**零 API 行为改动、零 C++ 代码、零 C++ UI**。

完成内容：

- 新建 `docs/openapi/api-v1.yaml`（OpenAPI 3.0.3）：
  - 38 paths / 42 operations，`servers` 均以 `/api/v1` 为 base path。
  - 覆盖 Health、Auth（register/login/logout/verify-email/resend-verification/me）、Projects（含 interactions/like/comments/download-requests）、Account（profile 读写、avatar/banner multipart 上传、community/downloads/comments 只读、删除 upload/post）、Community（posts/uploads 读写、comments、like、delete）、Users（profile/resources/posts/activity）、Contact；另加 4 个代表性 Admin 端点（summary、visitors 分页列表、visitor 详情、profile-visibility）演示 Web-only 边界。
  - 全部端点仅取自 `server/index.js` 真实路由 + 已被 contract 测试或 `src/lib/api.js` 实际消费的形状；不确定字段（如 `community/comments/:id/like` 精确返回 key、`account/comments` 行形状、`Project.downloadPolicy` 未来枚举）在 spec 中留白/注明，转记到新建的 `docs/API_V1_GAPS.md`，**不编造**。
  - `components.schemas.ApiErrorCode.enum`（27 个）与 `server/responses.js` 的 `API_ERROR_CODES` 用一次性脚本比对：逐一致，零缺失零多余。
  - 全部 admin operation 显式 `x-cpp-sdk: false`，独立 tag `Admin (Web-only)`；`adminToken` security scheme 的 description 明确写"SDK 不得实现或存储此凭证"。
  - strict envelope 规则在 `ResponseEnvelope`/`ErrorEnvelope` schema 中硬编码：顶层仅 `data`/`pagination`/`error`（`additionalProperties: false`）。
- 新建 `docs/API_V1_GAPS.md`：记录 7 类缺口——(1) 缺 DB-backed sample 的端点、(2) admin 路由未逐条枚举的清单与理由、(3) Asset/download 字段按上传类型的逐字段缺失对照表（checksum/mimeType/downloadUrl 等）、(4) `Project.downloadPolicy` 尚非冻结枚举、(5) pagination 缺口清单（与 freeze 文档 §8 一致）、(6) token 生命周期未定（freeze checklist #5）、(7) 刻意排除在 C++ SDK 外的端点边界（admin）。
- 新建 `docs/API_V1_MODEL_MAPPING.md`：
  - Web `normalizeApiPayload` 与 strict v1 envelope 关系说明（结论：该函数隐含依赖 legacy 顶层镜像做兼容展开，未针对纯 strict payload 验证过；Web 暂不切 v1，本轮不改前端代码）。
  - TypeScript 类型草图（`ApiResponse<T>`/`ApiError`/`Pagination`/`User`/`AccountProfile`/`Project`/`Asset`/`CommunityPost`/`Comment`/`DownloadRequest`/`UploadError`）——仅文档参考，不引入 TS 编译，不迁移前端。
  - C++ struct 草图（`ResponseEnvelope<T>`/`ApiError`+`ApiErrorCode` enum/`Pagination`/`User`/`AccountProfile`/`Project`/`Asset`(aspirational，标注未实现)/`CommunityPost`/`Comment`/`DownloadRequest`/`LocalAsset`/`DownloadTask`/`SyncStatus`），字段与 OpenAPI schema 一一对应。
  - 字段类型映射表（string/number/boolean/ISO datetime/nullable/array/object → JS/TS/C++ 三栏对照）。
  - 明确写死：SDK 不依赖 legacy 顶层镜像字段、不消费 admin 端点。
  - upload/download 错误 → `Result<T, ApiError>` 映射表；pagination → `PageRequest`/`Pagination` 请求响应模型映射；asset cache 仍缺失字段清单（与 API_V1_GAPS.md 交叉引用）。
- 更新 `docs/API_V1_FREEZE_PLAN.md`：§18/§19 补"已实现"说明；§21 checklist #9/#10 从 ❌ 改为 🟡（初稿完成，CI 自动漂移检测与"定稿"状态仍未达成，原因已注明）；关联文档列表补三个新文件。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：关联文档列表补三个新文件并注明 C++ Prototype 应从 model mapping 文档的 struct 草图开始而非重新设计；§22 优先级列表逐项标注当前完成状态（1/2 已完成，5/6 部分完成并注明剩余缺口，3/4 仍未开始）。

哪些接口进入了 `/api/v1`（C++ SDK public surface，`x-cpp-sdk: true`）：

- Health/Auth/Projects/Account/Profile Upload/Community/Users/Downloads/Contact 全部公开只读与已鉴权写接口，共 38 个 operation。

admin 是否进入 v1 SDK：**否**。`/api/v1/admin/*` 机械可达（双挂载天然覆盖）且 strict envelope 生效，但认证方式是 Web-only 静态 `ADMIN_TOKEN`，与 C++ App 使用的 visitor bearer token 完全不同凭证体系；spec 中所有 admin operation 标 `x-cpp-sdk: false`，SDK 的 `ApiClient` 不应实现任何 admin 方法。

C++ SDK model mapping 核心结论：

- 一个 JSON 形状对应一个 struct，不做客户端侧改名；`std::optional` 表达缺失字段，未知 JSON key 忽略（前向兼容），未知 `error.code` 落 `ApiErrorCode::Unknown` 且保留原始字符串。
- 统一 Asset Model 仍是"目标形状"而非"现状"——`Asset` struct 标注 aspirational，所有新字段（checksum/mimeType/downloadUrl/version/etag）在 SDK 落地前必须先等 freeze checklist #6/#7 完成。
- `Project` 暂无独立于 `slug` 的稳定 `id`；受控下载端点 `GET /api/v1/assets/:id/download` 尚未实现，SDK 的 `DownloadManager`/`CacheManager` 设计需以 `docs/API_V1_GAPS.md` §3/§8 的缺口表为起点，而非假设字段已存在。

仍缺哪些字段/sample（详见 `docs/API_V1_GAPS.md`）：

1. `community/comments/:id/like`、`account/comments` 的精确响应形状缺 DB-backed 断言。
2. Asset 统一模型：checksum、mimeType、downloadUrl、version、etag 全部端点均未populate。
3. `Project.downloadPolicy` 仍是自由文本，非冻结枚举。
4. 6 类公共列表端点仍无真实分页（与 freeze 文档 §8 待办一致）。
5. token 生命周期（过期/刷新/多设备）未定义（freeze checklist #5）。

修改文件：

- docs/openapi/api-v1.yaml（新建）
- docs/API_V1_MODEL_MAPPING.md（新建）
- docs/API_V1_GAPS.md（新建）
- docs/API_V1_FREEZE_PLAN.md
- docs/CPP_APP_MIGRATION_PLAN.md
- PROJECT_PROGRESS.md

commit：docs(api): extract v1 openapi and sdk model mapping（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（dist/ 构建产物已还原，未提交）
- npm run test:api：通过（38 passed，无 API 行为改动）
- npm run test:api:db：通过（18 passed，一次性集群已销毁）

OpenAPI 校验方式说明（未新增重量级依赖）：用项目已有的传递依赖 `js-yaml` 写了一次性脚本（`scripts/validate-openapi-tmp.mjs`，运行验证后已删除，未提交），确认：YAML 可解析、全部 `$ref` 可解析、`ApiErrorCode` 枚举与 `API_ERROR_CODES` 逐一致（27/27，零缺失零多余）。未安装 OpenAPI validator 类重量依赖。

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：本轮未连接、未修改任何数据库（含测试用一次性集群，仅复用既有 test:api:db 基础设施跑现有用例，未新增数据库写操作）。

待办事项（下一批，按优先级，延续 freeze checklist）：

1. OpenAPI CI 自动漂移检测接入（checklist #9 剩余部分——把本轮的一次性人工校验脚本变成可重复运行的 CI 步骤）
2. token storage 与 refresh 策略评估并文档化（checklist #5）
3. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
4. 公共列表 pagination 补齐方案（checklist #8）
5. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，完成后 1–5+11 齐备可宣告 freeze）
6. C++ SDK `sdk/core/models/*.h` 真实头文件骨架（本轮只有 markdown struct 草图，非可编译代码）
7. cpp-app/ 骨架 + 三平台 CI matrix
8. packaging strategy spike

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未改任何 API 行为（server/index.js、server/responses.js 均未改动，仅新增/修改文档）。
- 本轮未开发任何 C++ 代码或 C++ UI（仅 markdown 中的 struct 草图，非可编译产物，无 cpp-app/ 目录生成）。
- 本轮未提交 dist/ 或任何构建产物；临时验证脚本 `scripts/validate-openapi-tmp.mjs` 与临时 package.json script 均已在提交前删除/还原，未进入 git 历史。

## 2026-07-04：修复 avatar/banner upload 文件类型错误分类 bug（freeze 前错误码一致性）

结论：确认并修复 bug——avatar/banner 非法文件类型真实触发时会被误分类为 `INTERNAL_ERROR` 500，而非契约要求的 `INVALID_FILE_TYPE` 400。此风险在 2026-07-03 的技术备注中已记录（见下方历史记录），本轮排查确认属实并修复。不改任何业务行为，只修正错误分类；community/admin 上传现有行为不变。

Bug 确认：

- server/index.js 中两处 `fileFilter`：
  - 通用上传（community/admin，line ~138）拒绝时抛 `new Error('Unsupported file type.')`。
  - profile 头像/封面上传（`createProfileImageUpload`，line ~162）拒绝时抛 `new Error('Only JPG, PNG, and WebP images are allowed.')`——消息不同。
- server/responses.js 的 `describeUploadError` 此前只按 `error.message === 'Unsupported file type.'` 匹配，avatar/banner 分支永远匹配不到，`next(error)` 落到 index.js 末尾的 INTERNAL_ERROR 兜底 → 500，而不是 400 INVALID_FILE_TYPE。

修复方式：

- 不再依赖脆弱的 message 字符串。两处 `fileFilter` 拒绝时均附加稳定 `error.code = 'INVALID_FILE_TYPE'`（与 `API_ERROR_CODES.INVALID_FILE_TYPE` 同值），消息文案本身不变（仍分别是各自原有的用户可读文案）。
- `describeUploadError` 判定顺序调整为：MulterError 分支不变 → 新增 `error.code === 'INVALID_FILE_TYPE'` 判定（优先）→ 原 message 字符串匹配降级为兜底（保留，避免其他未打 code 的调用方漏判）。
- community/admin 上传现有行为逐字节不变（同一 error.code 命中同一分支，仍输出 400 + 原消息）。
- strict `/api/v1/*` 下该错误同样只输出 data/pagination/error 三个顶层键（复用 checklist #4 的 response mode 机制，未新增代码路径）。

新增测试：

- tests/api/contract.spec.js（+1 单测，37→38 total）：`describeUploadError` 对携带 `error.code = 'INVALID_FILE_TYPE'` 但消息文案不同（avatar/banner 文案）的错误正确分类，独立于 message 字符串。
- tests/api/contract.db.spec.js（+4 用例，14→18 total）：
  - avatar 非法文件类型 → legacy `/api/account/avatar` 400 INVALID_FILE_TYPE（非 500/INTERNAL_ERROR，`error` 非字符串）。
  - avatar 非法文件类型 → strict `/api/v1/account/avatar` 顶层仅 data/pagination/error，`error.code === INVALID_FILE_TYPE`。
  - banner 同上两条（legacy + strict v1）。
  - 均为端到端真实 multipart 触发（复用既有 DB-backed 环境，无需新增 fixture）。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- tests/api/contract.db.spec.js
- docs/API_V1_FREEZE_PLAN.md（§12 补已修复说明）
- PROJECT_PROGRESS.md

commit：fix(api): classify profile upload file type errors（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（dist/ 构建产物已还原，未提交）
- npm run test:api：通过（38 passed）
- npm run test:api:db：通过（18 passed，一次性集群已销毁）

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：仅 test:api:db 在临时目录一次性集群内写测试数据（含本轮新增的 avatar/banner 非法文件上传探针），跑完销毁。未连接、未修改生产库。

待办事项（下一批，按优先级，延续 freeze checklist）：

1. token storage 与 refresh 策略评估（checklist #5）
2. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
3. 公共列表 pagination 补齐方案（checklist #8）
4. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，完成后 1–5+11 齐备可宣告 freeze）
5. OpenAPI / typed client 抽取 + CI 漂移检测
6. C++ SDK data model extraction
7. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
8. CI build matrix 规划
9. packaging strategy spike

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未改任何业务行为，只修正错误分类逻辑（fileFilter 拒绝仍是同样的拒绝，仅错误对象多了一个 code 属性；describeUploadError 输出的 HTTP status/code 语义未变，只是让 avatar/banner 路径命中正确分支）。
- 本轮未混入 OpenAPI / C++ SDK / 新功能改动。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-04：/api/v1 双挂载 + strict envelope（无镜像）+ 反向镜像断言 — freeze checklist #4 完成

结论：`/api/v1/*` 稳定入口上线。`/api/*` 保持 legacy-compatible（顶层 data 镜像 + code/message 兼容镜像，Web 前端零影响）；`/api/v1/*` 使用 strict envelope，顶层键固定为 data/pagination/error 三个，成功与失败一致。两前缀共用同一 handler（URL-rewrite 双挂载），零业务复制、零行为分叉。C++ App 未来只消费 `/api/v1/*`。上一轮待办第 1 项完成。

实现方式：

- server/index.js：在 `express.json` 之前注册 v1 rewrite 中间件——命中 `^/api/v1(?=/|?|$)` 的请求打 `request.apiVersion = 'v1'` 标记并把 `request.url` 重写为 `/api/...`，之后走既有全部路由（含 upload 错误中间件与 REQUEST_BODY_INVALID/INTERNAL_ERROR 兜底）。`originalUrl` 保留 v1 前缀供日志。非精确前缀（如 `/api/v1x...`）不重写。这是本轮唯一 server/index.js 改动，无 handler 复制、无大重构。
- server/responses.js：`sendData/sendPage/sendError` 检测 `response.req.apiVersion === 'v1'` 走 strict 分支——不做 `withLegacyData` 顶层展开、不带顶层 code/message；分页对象原样保留在 envelope `pagination`，`items`/`visitors` 等 legacy 键不上顶层；runtime contract 校验以 `allowCompatibilityKeys=false, allowLegacyKeys=false` 运行。legacy 分支代码路径与行为完全不变。
- 进入 v1 的接口：全部 `/api/*` 路由自动获得 v1 别名（health、profile、projects+interactions、community、auth、account、users、download-requests、contact、experience、admin、uploads）。
- admin 边界结论：`/api/v1/admin/*` 因双挂载机械可达且 strict envelope 生效，但 admin 是 Web-only 面（静态 ADMIN_TOKEN 认证），**不属于 C++ App 可依赖的 v1 公开契约**；C++ SDK 不得调用 admin 端点。已写入 freeze 文档 §3。

反向镜像断言（防止 legacy mirror 回流 v1 / v1 模式误伤 legacy）：

- tests/api/contract.spec.js 新增 8 用例（28 → 36）：`expectReverseMirror` helper 对同一路径同时请求两前缀，断言 legacy 侧必须保留顶层镜像键、v1 侧顶层 keys 精确等于 `[data, error, pagination]`（`Object.keys` 排序全等）、两侧 data deep-equal（同 handler 无漂移）、status 一致。覆盖：health（ok/service）、projects、profile/experience/community/users-activity 只读、404 PROJECT_NOT_FOUND（code/message 镜像不入 v1）、503 SERVICE_UNAVAILABLE、contact 成功 201 + VALIDATION_ERROR 400、v1 malformed JSON → strict REQUEST_BODY_INVALID（验证中间件先于 body parser）、admin 401 strict envelope、`/api/v1x...` 非精确前缀不被重写。
- tests/api/contract.db.spec.js 新增 2 用例（12 → 14）：真实 `sendPage` 分页（admin/visitors limit=1、visitor posts 子分页）在 v1 下六字段 pagination 原样保留、顶层无 visitors/items 镜像、与 legacy 侧 pagination/data deep-equal。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- tests/api/contract.db.spec.js
- docs/API_V1_FREEZE_PLAN.md（§3 补已实现说明；§21 checklist #4 置 ✅）
- docs/CPP_APP_MIGRATION_PLAN.md（十大问题表 #2、#6 置已修复）
- PROJECT_PROGRESS.md

commit：refactor(api): add strict v1 envelope routes（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（dist/ 构建产物已还原，未提交）
- npm run test:api：通过（36 passed）
- npm run test:api:db：通过（14 passed，一次性集群已销毁）

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：仅 test:api:db 在临时目录一次性集群内写测试数据，跑完销毁。未连接、未修改生产库。

待办事项（下一批，按优先级）：

1. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档；checklist #5）
2. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
3. 公共列表 pagination 补齐方案（checklist #8）
4. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，完成后 1–5+11 齐备可宣告 freeze）
5. OpenAPI / typed client 抽取 + CI 漂移检测
6. C++ SDK data model extraction（从冻结表映射 struct 草案）
7. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
8. CI build matrix 规划（GitHub Actions win/mac/linux）
9. packaging strategy spike（NSIS / dmg+notarization / AppImage）

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未改任何业务行为/auth/权限判定（仅 API mounting + response mode + tests + docs；legacy /api/* 响应字节级不变）。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-03：DB-backed contract tests（一次性 PostgreSQL）— freeze checklist #2/#3 完成

结论：新增 `npm run test:api:db` DB-backed contract 套件（12 用例全通过），锁定此前不可达的三类路径：admin 200 成功形状 + 真实 sendPage pagination、真实 multipart multer 错误端到端、store 存在时的 AUTH_REQUIRED(401)。上一轮待办第 1、2 项完成（原 #1 admin 200 与 #2 upload E2E 合并在同一 suite），并顺带补掉历史遗留的"store 存在时 401 路径"。

完成内容：

- scripts/run-api-db-tests.mjs（新建）：一次性 PostgreSQL provisioner。
  - 未提供 `API_TEST_DATABASE_URL` 时：用本机 PostgreSQL 二进制（PG_TEST_BIN → /usr/lib/postgresql/<v>/bin → PATH）在 os.tmpdir 临时目录 `initdb` 一次性集群（loopback、随机空闲端口、trust auth、fsync=off；root 环境经 `su postgres` 执行），`createdb mrright_api_contract_test`，跑完 `pg_ctl stop -m immediate` 并删除整个集群目录。
  - 提供 `API_TEST_DATABASE_URL`（CI service container 场景）时直接使用，不 provisioning、不 teardown。
  - 双层安全闸（脚本与 suite 各自独立校验）：库名必须含 test/e2e/local/dev，且不得含 `mrright_portfolio`；不读取、不复用生产 DATABASE_URL。
- tests/api/contract.db.spec.js（新建，12 用例）：
  - seed 只经公开 API（register → verify-email devCode → login → community post → contact），不写直连 SQL；schema 由 server 启动 ensureSchema 自建；ADMIN_TOKEN 为进程内随机 throwaway 值，不落日志。
  - admin 200：summary / visitors 列表（pagination 六字段 hasNext/hasPrevious/limit/page/pages/total 精确断言 + limit=1 分页数学）/ visitor 详情 / 5 个详情子分页（items + 真实 pagination）/ 8 个列表端点（legacy 镜像 deep-equal，含 seed 数据非空断言）。
  - admin 写：PATCH profile-visibility 404 VISITOR_NOT_FOUND envelope + 对测试 visitor 的 disable→restore 200 往返（profileAdminDisabled 断言）。
  - store 存在时鉴权：错误 admin token → 401 ADMIN_AUTH_REQUIRED；/api/account/profile|downloads|comments 未登录 → 401 AUTH_REQUIRED（历史遗留补测）；登录后 profile → 200。
  - 真实 multer 错误 E2E：3MiB jpg 上传 avatar（限 2MiB）→ 413 FILE_TOO_LARGE envelope；.txt 上传 community uploads → 400 INVALID_FILE_TYPE envelope（error 非字符串）。
  - 无 `API_TEST_DATABASE_URL` 时整个文件 test.skip，不报错。
- playwright.api.db.config.js（新建）：独立 config，workers=1（共享 server + seed fixture）。
- playwright.api.config.js：`testIgnore: '**/contract.db.spec.js'`，`npm run test:api` 保持无 DB 基线。
- package.json：新增 `test:api:db` 脚本。
- docs/API_V1_FREEZE_PLAN.md：§17 补已实现说明；§21 checklist #1（上轮已完成的 INTERNAL_ERROR 兜底）、#2、#3 置 ✅。

修改文件：

- scripts/run-api-db-tests.mjs（新建）
- tests/api/contract.db.spec.js（新建）
- playwright.api.db.config.js（新建）
- playwright.api.config.js
- package.json
- docs/API_V1_FREEZE_PLAN.md
- PROJECT_PROGRESS.md

commit：test(api): add db-backed contract suite with disposable postgres（最终 hash 以 git log 为准）

build/lint/test 结果：

- npm run lint：通过
- npm run build：通过（dist/ 构建产物已 git restore/clean 还原，未提交）
- npm run test:api：通过（28 passed，基线不受影响）
- npm run test:api:db：通过（12 passed，一次性集群已销毁）
- git diff --check：通过

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：所有写操作仅发生在临时目录内一次性集群的 mrright_api_contract_test 库（seed 2 个测试 visitor、1 条社区帖、1 条联系消息、1 次 profile_admin_disabled 翻转并还原），测试结束整个集群目录已删除。未连接、未修改生产库。

待办事项（下一批，按优先级）：

1. /api/v1 双挂载 + 无镜像模式 + 反向镜像断言（freeze checklist #4）
2. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档；checklist #5）
3. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
4. 公共列表 pagination 补齐方案（checklist #8）
5. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，1–5+11 齐后可宣告 freeze）
6. OpenAPI / typed client 抽取 + CI 漂移检测
7. C++ SDK data model extraction（从冻结表映射 struct 草案）
8. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
9. CI build matrix 规划（GitHub Actions win/mac/linux，第一 commit 起；test:api:db 可用 postgres service container 直接接入）
10. packaging strategy spike（NSIS / dmg+notarization / AppImage 各走通一次）

技术备注（非本轮改动，供后续参考）：avatar/banner 的 fileFilter 错误消息（'Only JPG, PNG, and WebP images are allowed.'）不匹配 describeUploadError 的 'Unsupported file type.' 分支，会落到 INTERNAL_ERROR 500 而非 INVALID_FILE_TYPE 400；如需修正属 additive 语义微调，建议并入 checklist #11 复核时一起处理。

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret（测试用 ADMIN_TOKEN 为随机 throwaway 值，仅存在于测试进程内存）。
- 本轮未修改任何 server 业务代码/auth/admin/token 判定逻辑（仅测试、脚本与配置）。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-03：INTERNAL_ERROR / unhandled API errors envelope 兜底（freeze 前唯一服务端小改动）

结论：/api/* 未捕获异常与 JSON body parse 错误全部收敛到统一 envelope，Express 默认 HTML 500 不再可达。上一轮待办第 1 项完成。

完成内容：

- server/responses.js：API_ERROR_CODES 新增两个错误码（与 freeze 文档 26+1 冻结表对齐）：
  - `INTERNAL_ERROR`（未捕获 API 异常 → HTTP 500）
  - `REQUEST_BODY_INVALID`（JSON body parse 失败 → HTTP 400）
- server/index.js：在既有 upload error middleware 之后、express.static/SPA fallback 之前新增最终 API error-handling middleware：
  - 仅对 path 为 `/api` 或 `/api/*` 的请求生效；非 API 请求 `next(error)` 落回 Express 原有行为，静态资源与 SPA fallback 不受影响。
  - express.json 抛出的 parse 错误（`type === 'entity.parse.failed'` 或带 body 的 SyntaxError/400）→ `sendError(response, REQUEST_BODY_INVALID, ..., 400)`。
  - 其余未捕获错误 → server-side `console.error`（含完整 error/stack，仅落日志）+ `sendError(response, INTERNAL_ERROR, 'Internal server error.', 500)`；响应体不含 stack trace、SQL、路径等内部细节。
  - `headersSent` 时委托给 Express 默认处理，避免二次写响应。
  - 不改动既有 upload/multer error middleware（describeUploadError 命中仍优先返回 FILE_* envelope）。
- server/index.js：新增测试专用路由 `/api/__test__/throw`（同步 throw），仅 `NODE_ENV === 'test'` 时注册，production 不存在；代码注释注明仅供 contract test 使用。
- tests/api/contract.spec.js：主测试服务器改为 `NODE_ENV: 'test'` 启动；第二个服务器（admin 授权套件）显式 `NODE_ENV: 'production'`。新增 3 个测试（25 → 28）：
  1. malformed JSON POST /api/contact → 400 + data === null + pagination 为对象 + error.code === REQUEST_BODY_INVALID + error.message 非空 + error 非字符串。
  2. GET /api/__test__/throw（test 模式）→ 500 + INTERNAL_ERROR envelope + raw body 断言不含 stack 帧（`    at `）、原始错误文本、`server/index.js` 路径、HTML。
  3. GET /api/__test__/throw（production 模式服务器）→ 非 500 且不含 INTERNAL_ERROR，证明测试路由未在 production 注册。

非 API 行为确认：

- 静态资源仍由 `express.static(distDir)` 处理，未变。
- SPA fallback 仍 `sendFile(distIndexPath)`，未变。
- 非 /api/* 错误不强制 envelope（next(error) 透传）。
- /api/health 仍返回 envelope（contract test 覆盖，未变）。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- PROJECT_PROGRESS.md

commit：refactor(api): envelope unhandled API errors（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（构建产物 dist/ 已 git restore 还原，未提交）
- npm run test:api：通过（28 passed）

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

待办事项（下一批，按优先级）：

1. DB-backed admin 200 contract tests（一次性 PostgreSQL，绝不指向生产库）
2. DB-backed real upload multer error E2E（FILE_TOO_LARGE / INVALID_FILE_TYPE 端到端）
3. /api/v1 双挂载 + 无镜像模式 + 反向镜像断言
4. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档）
5. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全
6. OpenAPI / typed client 抽取 + CI 漂移检测
7. C++ SDK data model extraction（从冻结表映射 struct 草案）
8. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
9. CI build matrix 规划（GitHub Actions win/mac/linux，第一 commit 起）
10. packaging strategy spike（NSIS / dmg+notarization / AppImage 各走通一次）

安全说明：

- 本轮未部署 VPS、未 push GitHub、未修改数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未修改 auth/admin/token/db 判定逻辑。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-03：C++ 跨平台迁移前架构审查 + API v1 freeze 文档化

结论：纯文档轮次，零代码/零 API 行为改动。三项状态标记：

1. **API envelope migration 已完成**（2026-07-02 审计确认，全部业务路由经 sendData/sendPage/sendError，25 contract 测试通过）。
2. **当前进入 API v1 freeze 文档化阶段**（freeze 规范已定稿，freeze 本身未宣告，见 docs/API_V1_FREEZE_PLAN.md §21 checklist）。
3. **C++ App 迁移目标已升级为跨平台客户端**：Windows 10/11 / macOS (Apple Silicon + Intel) / Linux x86_64 三端 P0，从第一版起为架构约束（SDK、缓存、路径、token、下载、日志、打包、CI、3D viewer 全部按三端一致性设计），不是后期移植。

完成内容：

- 项目重新定位：以稳定 API 契约为核心的 3D 内容/资源/社区/账号权限平台；Web 负责展示、社区、账号中心与 admin；API 承载全部权限与分发决策；C++ 跨平台 App 负责高性能资源消费（模型查看、下载、本地缓存、离线库）。不是"用 C++ 重写网站"。
- 现有架构评分 7/10；识别十大问题，最高优先级三项：
  1. /uploads 为 express.static 公开直出，downloadPolicy 未在文件层执行（需受控下载端点 + Range/ETag）；
  2. 无 /api/v1 版本前缀；
  3. 未捕获异常仍落 Express 默认 HTML 500（无 INTERNAL_ERROR envelope 兜底，2026-07-02 待办复核确认未完成）。
- API v1 freeze 规范定稿：/api/v1 双挂载策略（v1 下不带 legacy 顶层镜像）、envelope/success/error 规范、26+1 错误码冻结表（含待实现 INTERNAL_ERROR）、pagination 六字段规范与补齐清单、auth token 生命周期决策项、permission/downloadPolicy 枚举化、Asset Model（含 checksum/downloadUrl）、upload 错误规范、additive-only 兼容策略、deprecation 策略、DB-backed contract test 方案、OpenAPI 漂移检测策略、C++ SDK model 映射规则、freeze 前 11 项 checklist。
- C++ 迁移五阶段路线图：Phase 1 API v1 freeze → Phase 2 三平台 prototype（登录/token 安全存储/项目/受控下载/缓存/日志，三平台 CI 第一 commit 起全绿）→ Phase 3 跨平台 3D viewer（GLB + Qt RHI）→ Phase 4 打包（NSIS/.dmg+notarization/AppImage）→ Phase 5 离线+同步。
- 技术栈结论：Qt 6.8 LTS + Qt Quick/QML；CMake + CMakePresets；vcpkg（manifest）；Qt Network（藏于可替换 HttpBackend 接口后）；SQLite + content-addressed 文件缓存；3D 走 Qt RHI（Quick 3D 起步）；tinygltf 起步（服务端统一转 GLB）、Assimp 后置；手写 C++ SDK（OpenAPI 仅作 spec/漂移检测）；QtKeychain（Credential Manager/Keychain/Secret Service，加密文件仅降级）；spdlog；crashpad 推迟 Phase 4；GitHub Actions 三平台 matrix。
- 跨平台设计：AppPaths/Config/Cache/Log/Download/Temp 六 provider 三平台路径映射（AppData/LocalAppData、Application Support/Caches/Logs、XDG）；token 禁止明文落盘；构建矩阵 MSVC/Clang/GCC + Debug/Release/RelWithDebInfo；20 项跨平台风险按严重度排序并附规避策略。
- 用户补充跨平台强制要求（P0 Win/macOS/Linux、P1 Steam Deck/portable、P2 移动端不承诺）逐条核对：技术栈 10 项、目录抽象、构建/打包矩阵、SDK 解耦、10 项风险、章节与五阶段路线图均已在文档中覆盖；唯一缺口为显式 "Phase-by-phase Platform Support" 章节，已补 §20.1（各阶段 × 各平台验收矩阵 + P1 不阻塞 P0 / P2 仅架构兼容规则）。

修改文件：

- docs/CPP_APP_MIGRATION_PLAN.md（新建）
- docs/API_V1_FREEZE_PLAN.md（新建）
- PROJECT_PROGRESS.md

commit：docs(api): define v1 freeze and cross-platform cpp app plan（最终 hash 以 git log 为准）

build/lint/test 结果：见下（验证通过后回填）。

- npm run lint：通过
- npm run build：通过
- npm run test:api：通过（25 passed）

是否部署 VPS：否（纯文档，无需备份）。

验证接口状态：未涉及线上，无变化。

待办事项（下一批，按优先级）：

1. INTERNAL_ERROR / unhandled API errors envelope 兜底（确认尚未完成；唯一 freeze 前服务端小改动）
2. DB-backed admin 200 contract tests（一次性 PostgreSQL，绝不指向生产库）
3. DB-backed real upload multer error E2E（FILE_TOO_LARGE / INVALID_FILE_TYPE 端到端）
4. /api/v1 双挂载 + 无镜像模式 + 反向镜像断言
5. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档）
6. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全
7. OpenAPI / typed client 抽取 + CI 漂移检测
8. C++ SDK data model extraction（从冻结表映射 struct 草案）
9. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
10. CI build matrix 规划（GitHub Actions win/mac/linux，第一 commit 起）
11. packaging strategy spike（NSIS / dmg+notarization / AppImage 各走通一次）

安全说明：

- 本轮未部署 VPS、未 push GitHub、未修改数据库、未修改任何 API 行为或业务代码。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未开发任何 C++ UI 代码（仅文档）。

## 2026-07-02：API envelope 最终审计（v1 freeze 准备）

结论：后端 API response envelope 化已完整闭环。本轮为审计 + 必要注释，无业务逻辑改动。

一、后端裸响应复查（server/index.js、server/responses.js、server/contracts）：

- `grep response.json / res.json / json({ / sendStatus / status(...).end / status(...).json`：
  - 全部业务响应均经 sendData / sendPage / sendError（内部统一 `response.status(x).json()`）。
  - 唯一 `json({` 命中为 `express.json({ limit: '96kb' })` body parser 配置，非响应。
  - 无 `sendStatus`；唯一 `.end(` 为 postgresStores.js 的 `pool.end()`（DB 连接池，非 Express response）。
- 非 API / 静态响应（保留，已加注释说明原因）：
  - `express.static(distDir, ...)` 与 SPA fallback `response.sendFile(distIndexPath)`：
    服务已构建的前端单页，不属于 API 契约，刻意不走 JSON envelope。本轮补注释说明。
  - 缓存头 setNoStoreHeaders / setStaticCacheHeaders：仅设 header，非响应体。
- `/api/health`：已用 sendData 输出 envelope（含 legacy ok/service 顶层镜像）。

二、错误码完整性复查（server/responses.js API_ERROR_CODES）：

- index.js 中所有 `sendError` 使用的 code 均存在于 API_ERROR_CODES（20 个在用）。
- 定义但当前未在 index.js 直接引用：FILE_TOO_LARGE / FILE_UPLOAD_ERROR / INVALID_FILE_TYPE
  （由 responses.js describeUploadError 使用）、INVALID_TOKEN / RATE_LIMITED（预留词表，
  保留不动，删除属 unrelated cleanup）。
- HTTP status ↔ code 语义核对：
  - 401：ADMIN_AUTH_REQUIRED、AUTH_REQUIRED
  - 403：RESOURCE_FORBIDDEN（部分）、PROFILE_ADMIN_DISABLED
  - 404：各 *_NOT_FOUND；`/api/users/:handle*` 刻意用 RESOURCE_FORBIDDEN + 404 防用户枚举
    （已有注释 server/index.js:954-958）
  - 409：HANDLE_TAKEN、PROJECT_SLUG_TAKEN
  - 413：FILE_TOO_LARGE（describeUploadError）
  - 400：VALIDATION_ERROR、FILE_UPLOAD_ERROR、INVALID_FILE_TYPE
  - 503：SERVICE_UNAVAILABLE
  - 均匹配，无语义不准的错误码复用。
  - 500：当前无显式 sendError(...,500)；未捕获异常经全局 error 中间件 `next(error)`
    落到 Express 默认处理（HTML 500）。见待办（freeze 前可加 INTERNAL_ERROR envelope 兜底）。

三、contract 测试复查（tests/api/contract.spec.js，25 用例）：

- 覆盖确认：GET 成功 envelope、GET 错误 envelope（404）、auth 错误 envelope（503）、
  visitor/community/contact 写接口 envelope（201/400/404/503）、admin 未授权 envelope（401）、
  admin 有 token 但 store 缺失（503）、upload/global error envelope（multipart 503 +
  describeUploadError 单测）、legacy 顶层字段镜像（payload.X === payload.data.X）、
  每个 payload 的 pagination 均断言为对象。
- 未新增测试：无低成本可达遗漏；剩余均为 DB 门禁路径（见待办）。

四、前端兼容性复查（src/lib/api.js、src/Admin.jsx）：

- `createApiError` 优先读 envelope `payload.error.message`，回退 legacy 字符串 →
  `payload.message` → fallback；上传错误 payload.error 由字符串变对象不影响。
- `normalizeApiPayload` 合并 data 顶层键 → legacy 顶层字段兼容。
- Admin.jsx 分页读顶层 `payload.pagination` / 子分页 pagination，sendPage 已保留，正常。
- 结论：前端无需改动。

修改文件：

- server/index.js（仅新增静态 / SPA fallback 注释，说明其刻意保留非 envelope；零逻辑改动）
- PROJECT_PROGRESS.md

验证结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，25 passed

commit：

- chore(api): audit envelope migration

待办事项（API v1 freeze 前）：

- DB-backed admin 200 contract tests：配置 DATABASE_URL 后补 admin 成功响应（200）与
  真实 pagination（sendPage）+ legacy 顶层字段镜像断言。
- DB-backed real upload multer error E2E：配置 DB + 通过 auth 门禁后，补真实 multipart
  触发 multer 错误（FILE_TOO_LARGE / INVALID_FILE_TYPE / FILE_UPLOAD_ERROR）端到端断言。
- 未捕获异常兜底：评估在全局 error 中间件为非 upload 错误加 INTERNAL_ERROR(500) envelope，
  替代当前落到 Express 默认 HTML 500 的行为（需权衡是否影响非 API 路径）。
- API v1 freeze docs：整理 envelope 契约 + 错误码表（API_ERROR_CODES）文档。
- SDK contract extraction：从 responses.js / contract 测试抽取 OpenAPI 或 typed client。
- store 缺失环境下 AUTH_REQUIRED(401) 路径补测（历史遗留）。

安全说明：

- 本轮未部署 VPS，无需备份。
- 本轮未 push GitHub。
- 本轮未修改数据库结构、登录判断、session 生成、visitor token、ADMIN_TOKEN、
  权限判定或任何生产配置（仅新增静态/ SPA fallback 注释）。
- 本轮未输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：统一错误处理收尾 — 全局 multer 上传错误 envelope 化

完成内容：

- 将 server/index.js 末尾共享的 multer / 全局上传错误中间件从裸响应
  `{ error: "字符串" }` 迁移到统一 envelope（sendError）。这是全项目最后一个
  `{ error: string }` 裸响应点，迁移后 server/index.js 已无裸 JSON 错误。
- 中间件不再直接返回 `response.status(400).json({ error })`，改为调用
  `describeUploadError(error)` 分类后走 `sendError(response, CODE, message, httpStatus)`。
- 按错误类型选用/新增语义准确的错误码（server/responses.js API_ERROR_CODES 新增）：
  - MulterError `LIMIT_FILE_SIZE` → FILE_TOO_LARGE，HTTP 413
  - 其它 MulterError（如 LIMIT_UNEXPECTED_FILE）→ FILE_UPLOAD_ERROR，HTTP 400
  - fileFilter 抛出的 `Unsupported file type.` → INVALID_FILE_TYPE，HTTP 400
  - 未匹配的错误仍 `next(error)`，行为不变（不吞其它错误）。
- 新增纯函数 `describeUploadError(error)`（server/responses.js），不 import multer，
  用 `error.name === 'MulterError'` + `error.code` 判定，便于无 DB / 无 multer 单测。
- 错误体统一为 `{ data: null, pagination: {}, error: { code, message } }`
  （含顶层 code/message 兼容镜像，与既有 sendError 一致）。
- 该中间件同时服务 community 上传、admin 上传、profile avatar/banner 上传，四处上传
  路由（/api/community/uploads、/api/admin/uploads、/api/account/avatar、
  /api/account/banner）共享同一处理，本次迁移对四处一致生效。

前端错误消费核查（未改前端）：

- src/lib/api.js 的 `createApiError` 已同时兼容 envelope（`payload.error.message`）
  与 legacy 字符串（`typeof payload.error === 'string'`），并回退 `payload.message`
  / fallbackMessage；上传 helper（uploadCommunityResource、uploadAccountImage、
  uploadAdminAsset）与 `request` 均通过 `createApiError` 构造 `error.message`。
- Admin.jsx / community 上传 / profile avatar-banner 上传均消费 `error.message`，
  不直接把 `payload.error` 当字符串展示。
- 结论：前端已通过 createApiError 兼容 error.message，无需改动，未做 UI 重构。

测试：

- tests/api/contract.spec.js：
  - 新增可达上传错误路径 contract 断言：multipart POST `/api/community/uploads`
    （无 DB，requireAuthStore 在 multer 前短路）→ 503 SERVICE_UNAVAILABLE，断言
    envelope（data===null、pagination 为对象、error.code/message 存在、
    `typeof payload.error !== 'string'`）。
  - 新增 `describeUploadError` 映射单测（直接测真实分类器，无需 DB/multipart）：
    FILE_TOO_LARGE/413、FILE_UPLOAD_ERROR/400、INVALID_FILE_TYPE/400、
    以及 null / 无关错误返回 null。
  - contract 覆盖从 20 增至 25 个用例。
- 说明：四个上传路由都在 multer 之前有 requireAuthStore/requireAdmin 门禁，无 DB
  环境下会先返回 503，真实 multer 上传错误（FILE_TOO_LARGE 等）通过路由不可达；
  故用纯函数单测覆盖真实映射逻辑，并保留可达路径（503）的 contract 断言。
  → 待办：配置 DATABASE_URL 的环境中补一条真实 multipart 触发 multer 错误的端到端断言。

修改文件：

- server/index.js（中间件迁移 + import describeUploadError）
- server/responses.js（新增 FILE_TOO_LARGE / FILE_UPLOAD_ERROR / INVALID_FILE_TYPE
  错误码 + describeUploadError 分类器）
- tests/api/contract.spec.js
- PROJECT_PROGRESS.md

验证结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，25 passed
- 全局复查：`grep -n "json({ *error:"`、`res\.json`、`response\.json` 于
  server/index.js 均无裸 JSON 错误命中（错误响应统一经 sendData/sendError/sendPage）。

commit：

- refactor(api): envelope global upload errors

待办事项：

- 配置 DATABASE_URL 的 adminStore/authStore 环境中：
  - 补 admin 真正 200 成功响应与 legacy 顶层字段镜像断言（上一批遗留）。
  - 补真实 multipart 触发 multer 上传错误（FILE_TOO_LARGE / INVALID_FILE_TYPE）的
    端到端 contract 断言（当前受门禁 + 无 DB 限制不可达）。
  - store 缺失环境下 AUTH_REQUIRED(401) 路径补测（上一批遗留）。

安全说明：

- 本轮未部署 VPS，无需备份。
- 本轮未 push GitHub。
- 本轮未修改数据库结构、登录判断、session 生成、visitor token、ADMIN_TOKEN 或
  任何权限判定逻辑（仅将上传错误响应体改为 envelope，中间件匹配范围与放行行为不变，
  MulterError LIMIT_FILE_SIZE 由 400 细化为 413 更贴合语义，非 2xx 前端行为不受影响）。
- 本轮未输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：Admin 管理接口 API envelope 迁移

完成内容：

- requireAdmin 中间件迁移到 sendError：
  - 缺 / 错 ADMIN_TOKEN → 401 ADMIN_AUTH_REQUIRED
  - adminStore 缺失 → 503 SERVICE_UNAVAILABLE
- 全部 /api/admin/* handler 的裸 response.json 迁移到 sendData/sendError，覆盖：
  - 只读列表：summary、comments、likes、contact-messages、download-requests、projects、community-uploads/posts/comments
  - 分页接口：visitors 列表、visitor 详情子分页（comments/posts/uploads/download-requests/actions）
  - 写操作：visitor access-level / email-verification / profile-visibility / profile-moderation / 删除、community-upload 状态更新与删除、community-post/comment 删除、admin 素材上传、project 创建/更新/删除、download-request 状态更新与删除、comment / contact-message 删除
- 分页接口改用 sendPage(response, data, pagination)：
  - 原因：sendData 会把 envelope 的 pagination 强制为 {}，会覆盖真实分页；admin 前端（Admin.jsx）依赖顶层 payload.pagination 做翻页。sendPage 保留真实 pagination，同时保留顶层 visitors/items legacy 镜像。
- 保留 admin 前端依赖的 legacy 顶层字段：visitors、visitor、recentActions、items、pagination、summary、file、conversion、project、upload、request、deleted、ok 等（api.js normalizeApiPayload 合并 data + 顶层，UI 读取不受影响）。
- server/responses.js 新增错误码：ADMIN_AUTH_REQUIRED、COMMENT_NOT_FOUND、CONTACT_MESSAGE_NOT_FOUND、DOWNLOAD_REQUEST_NOT_FOUND、PROJECT_SLUG_TAKEN、VISITOR_NOT_FOUND。
- 扩展 tests/api/contract.spec.js：新增 admin 用例，contract 覆盖从 15 增至 20 个用例。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- PROJECT_PROGRESS.md

验证结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，20 passed
- admin contract 覆盖：
  - 无 Authorization 访问 admin GET / 写操作：401 ADMIN_AUTH_REQUIRED
  - 错误 token 访问 admin GET：401 ADMIN_AUTH_REQUIRED
  - 有效 ADMIN_TOKEN 但 store 缺失（独立 server，DATABASE_URL 置空）：admin GET / 写操作 503 SERVICE_UNAVAILABLE

待办事项：

- admin 真正的 200 成功响应与 legacy 顶层字段镜像断言，需要配置了 DATABASE_URL 的 adminStore 环境补测（当前无 DB，成功路径不可达）。
- server/index.js 末尾的 multer 全局错误中间件仍返回 `{ error: string }`；它被 community 上传与 admin 上传共享，不属于 /api/admin/* handler，按"仅 admin、不动 community 写"约束本批未迁移，留作后续统一错误处理批次。

安全说明：

- 本轮没有部署 VPS，无需备份。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构、登录判断、session 生成、visitor token 或 ADMIN_TOKEN 逻辑（仅将 ADMIN_TOKEN 判定失败的响应体改为 envelope，判定逻辑不变）。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：换行符规范化 + Auth/写接口 API envelope 迁移

完成内容：

- 任务 A（换行符规范化，独立提交）：
  - 新增 `.gitattributes`，统一 `*.js/.jsx/.ts/.tsx/.json/.md/.css` 为 `eol=lf`。
  - 将 `server/index.js` 由 CRLF/LF 混用规范化为纯 LF（仅换行符，零逻辑改动，`git diff --ignore-space-at-eol` 无差异）。
  - 目的：让后续 envelope 迁移 diff 可读。
- 任务 B（auth 与写操作 envelope 迁移）：
  - 认证接口迁移到 sendData/sendError：register、resend-verification、login、verify-email、logout。
  - community 写操作迁移：create post、comment create、comment like、comment delete、post/upload delete、community upload。
  - profile/account 写操作迁移：profile PUT、avatar upload、banner upload。
  - 访客交互写接口迁移：project like、project comment、download-requests、contact。
  - 错误体统一为 `{ error: { code, message } }`（含顶层 code/message 兼容），不再返回 `{ error: '字符串' }`。
  - 成功响应保持 legacy 顶层字段兼容：user、session、verification、post、comment、profile、avatarUrl、bannerUrl、upload、request、access、ok。
  - `server/responses.js` 新增错误码：COMMUNITY_COMMENT_NOT_FOUND、COMMUNITY_UPLOAD_NOT_FOUND、EMAIL_ALREADY_REGISTERED、EMAIL_ALREADY_VERIFIED、EMAIL_NOT_REGISTERED、EMAIL_NOT_VERIFIED、HANDLE_TAKEN。前端依赖的 EMAIL_NOT_VERIFIED、HANDLE_TAKEN 已保留。
  - `/api/users/:handle*` 的 RESOURCE_FORBIDDEN + 404 补充防用户枚举说明注释（刻意对"不存在/非法 handle"统一返回，不泄露 handle 是否存在）。
  - `withLegacyData` 附近补注释：data 顶层展开可能与 data/pagination/error/code/message 保留字段名碰撞，新接口需避免。
  - 扩展 tests/api/contract.spec.js：新增 postJson helper 与写/认证接口用例，contract 覆盖从 10 增至 15 个用例。

修改文件：

- .gitattributes（新增）
- server/index.js
- server/responses.js
- tests/api/contract.spec.js

commit：

- 2049d5d feat(api): migrate read endpoints to envelope（上一轮读接口迁移，本轮先独立提交）
- 2d306e8 chore: normalize line endings
- cd5c207 refactor(api): migrate auth and write responses to envelope

验证结果：

- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，15 passed
- 本地 store 缺失环境 API 状态抽查：
  - POST /api/auth/register：503 SERVICE_UNAVAILABLE
  - POST /api/community/posts：503 SERVICE_UNAVAILABLE
  - POST /api/projects/:slug/comments：201（成功）/ 400 VALIDATION_ERROR / 404 PROJECT_NOT_FOUND
  - POST /api/projects/:slug/like：400 VALIDATION_ERROR / 404 PROJECT_NOT_FOUND
  - POST /api/contact：201（成功，ok:true）/ 400 VALIDATION_ERROR

待办事项：

- admin 管理接口块（约 40 个 handler，含 requireAdmin 中间件 401/503）仍为裸 response.json，尚未 envelope 化，作为下一批迁移。
- store 缺失环境下 requireAuthStore 会先于 auth 校验返回 503，未登录 AUTH_REQUIRED(401) 路径需在配置了 DATABASE_URL 的环境中补测。

安全说明：

- 本轮没有部署 VPS，无需备份。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构、登录判断、session 生成、visitor token 或 ADMIN_TOKEN 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：Auth 与 Account 只读 API envelope 迁移

完成内容：

- 继续推进 API-first response envelope 迁移，新增覆盖 auth/account 只读接口：
  - GET /api/auth/me
  - GET /api/account/profile
  - GET /api/account/community
  - GET /api/account/downloads
  - GET /api/account/comments
- 新增 requireUser() 小 helper，用于只读 account 接口统一返回 AUTH_REQUIRED envelope。
- requireAuthStore() 的 visitor account store 缺失错误迁移为 SERVICE_UNAVAILABLE envelope。
- account 只读接口成功响应继续保持 legacy 顶层字段兼容：
  - user
  - profile
  - posts
  - uploads
  - requests
  - comments
  - likeCount
- 扩展 tests/api/contract.spec.js，API contract 覆盖从 8 个用例增加到 10 个用例。

验证结果：

- npm run test:api：通过，10 passed
- npm run build：通过
- npm run lint：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/auth/me：200
  - GET /api/account/profile：503
  - GET /api/account/community：503
  - GET /api/account/downloads：503
  - GET /api/account/comments：503

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改登录判断、session 生成、visitor token 或 ADMIN_TOKEN 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：Community 公开只读 API envelope 迁移

完成内容：

- 继续推进 API-first response envelope 迁移，新增覆盖 community 公开只读接口：
  - GET /api/community/uploads
  - GET /api/community/posts
  - GET /api/community/posts/:id
  - GET /api/community/posts/:id/comments
- 保持 legacy 顶层字段兼容：
  - uploads
  - posts
  - post
  - comments
- API_ERROR_CODES 新增 COMMUNITY_POST_NOT_FOUND。
- 将 community post 详情的不存在错误迁移为 COMMUNITY_POST_NOT_FOUND envelope。
- 扩展 tests/api/contract.spec.js，API contract 覆盖从 7 个用例增加到 8 个用例。

验证结果：

- npm run test:api：通过，8 passed
- npm run build：通过
- npm run lint：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/community/uploads：200
  - GET /api/community/posts：200
  - GET /api/community/posts/not-a-real-post：404
  - GET /api/community/posts/not-a-real-post/comments：200

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 本轮没有修改 visitor token 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：公开只读 API envelope 第二批迁移

完成内容：

- 继续推进 API-first response envelope 迁移，新增覆盖低风险公开只读接口：
  - GET /api/experience
  - GET /api/projects/:slug/interactions
  - GET /api/users/:handle/resources
  - GET /api/users/:handle/posts
  - GET /api/users/:handle/activity
- 保持 legacy 顶层字段兼容：
  - experience
  - comments
  - likeCount
  - resources
  - posts
- 将 /api/projects/:slug/interactions 的项目不存在错误迁移为 PROJECT_NOT_FOUND envelope。
- 将公开用户 activity 子接口的公开主页禁用错误迁移为 PROFILE_ADMIN_DISABLED envelope。
- 扩展 tests/api/contract.spec.js，API contract 覆盖从 5 个用例增加到 7 个用例。

验证结果：

- npm run test:api：通过，7 passed
- npm run build：通过
- npm run lint：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/experience：200
  - GET /api/projects/not-a-real-project/interactions：404
  - GET /api/users/not-exist-test-handle/resources：200
  - GET /api/users/not-exist-test-handle/posts：200
  - GET /api/users/not-exist-test-handle/activity：200

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 本轮没有修改 visitor token 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：API envelope 版本提交到 GitHub

提交内容：

- 提交 API envelope/contract 第一阶段代码、文档、测试配置和进度记录。
- 同步当前分支 codex/check-project-and-fix-errors 到 GitHub。
- 首次 HTTPS push 因当前环境无 GitHub HTTPS 凭据失败，未重复提交、未 reset、未 force push。
- 已验证本机 GitHub SSH key 可用，并将 origin 改为 git@github.com:rightamen/3d-portfolio.git。
- 已通过 SSH push 成功。

提交前验证：

- npm run build：已通过
- npm run lint：已通过
- npm run test:api：已通过，5 passed
- npx playwright test tests/e2e/production-smoke.spec.js：部署后已通过，6 passed，1 skipped
- git diff --check：通过

提交信息：

- e01f721 feat(api): add response envelope contract
- 远端分支：origin/codex/check-project-and-fix-errors

安全说明：

- 本轮没有 force push。
- 本轮没有 reset。
- 本轮没有修改生产 env 文件内容。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：API envelope 版本部署到 VPS

部署内容：

- 将 API envelope/contract 第一阶段和前端兼容解析版本部署到 VPS。
- release 包：.deploy-tools/mrright-portfolio-release.tar.gz
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260702-042140
- 线上目录：/opt/mrright-portfolio
- 服务名：mrright-portfolio
- 服务状态：active

部署前验证：

- npm run build：通过
- npm run lint：通过
- npm run release:vps：通过

部署安全检查：

- ADMIN_TOKEN=[set]
- DATABASE_URL=[set]
- 未输出 env value、token、数据库密码。
- 已备份 /opt/mrright-portfolio 到 /opt/mrright-portfolio.backup-20260702-042140。
- 保留 /etc/mrright-portfolio.env、data、public/uploads、backup。
- 未修改生产数据库密码。
- 未删除数据库、表、上传文件或备份目录。

部署后验证：

- systemctl is-active mrright-portfolio：active
- local /api/health：200
- local admin_summary：200
- https://mrright.blog/api/health：200，包含 data、pagination、error envelope 字段
- remote admin_summary：200
- https://mrright.blog/admin：200
- https://mrright.blog/community：200
- https://mrright.blog/login?mode=login：200
- https://mrright.blog/account：200
- npx playwright test tests/e2e/production-smoke.spec.js：通过，6 passed，1 skipped

Skip 原因：

- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD。

回退说明：

- 当前可回退备份目录：/opt/mrright-portfolio.backup-20260702-042140
- 如需回退，应先备份当前 /opt/mrright-portfolio，再用该备份目录恢复线上目录并重启 mrright-portfolio。

安全说明：

- 本轮按用户要求部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改生产 env 文件内容。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-07-02：API envelope 自动化测试复跑

测试内容：

- 复跑 API envelope 相关自动化测试。
- 复跑本地前端页面 smoke，验证前端 API helper 可消费 envelope 响应。
- 直接校验本地 API 关键接口状态和 envelope 必填字段。

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:api：通过，5 passed
- 本地 API 服务：PORT=4194 npm run dev:server，启动成功
- 本地 Web 服务：VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174，启动成功
- npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/health：200
  - GET /api/profile：200
  - GET /api/projects：200
  - GET /api/projects/not-a-real-project：404
  - GET /api/users/not-exist-test-handle：404

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改业务代码，只更新自动化测试记录。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-07-02：API envelope 兼容层收尾与验证

完成内容：

- 补齐 Web 前端 API helper 的 envelope/legacy 双兼容解析：
  - 成功响应优先展开 data，保留现有调用读取 profile、projects、project 等顶层字段的方式。
  - 错误响应兼容 legacy 字符串 error 和新 envelope error.code/error.message。
  - fetch 与 XMLHttpRequest 上传路径统一使用同一套错误解析，避免新错误对象显示为 [object Object]。
- 修正文档与实现不一致：
  - 非分页响应 pagination 统一记录为 {}。
  - sendError 文档签名改为 sendError(response, code, message, status = 400)。
- 修正项目列表异常错误码：
  - API_ERROR_CODES 新增 SERVICE_UNAVAILABLE。
  - /api/projects store 异常返回 SERVICE_UNAVAILABLE 和 503，不再误用 RESOURCE_FORBIDDEN。
- 复查 API-first 文档：
  - docs/API_CONTRACT.md
  - docs/API_ERRORS.md
  - docs/ARCHITECTURE.md

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:api：通过，5 passed
- git diff --check：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js 使用 E2E_BASE_URL=http://127.0.0.1:5174：页面渲染 5 passed，1 个 API status 子测试失败，原因是该子测试按同源请求 /api/*，本地 Vite 与 API 分端口运行时会请求到 Vite 端口，不代表 API envelope 失败。
  - curl --noproxy '*' http://127.0.0.1:4194/api/health：返回 200 envelope。

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 本轮没有修改 visitor token 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-07-01：API contract 校验层与测试

完成内容：

- 新增 server/contracts/responseValidator.js：
  - validateResponseShape()
  - 校验 data、pagination、error 必填。
  - 校验错误响应必须有 error.code 和 error.message。
  - 校验 pagination 必须是对象。
  - 校验 undefined 字段。
  - 校验顶层 key 只允许 envelope、迁移期兼容 key 和声明的 legacy key。
  - 校验 legacy 顶层字段必须同时存在于 data 中。
- 在 server/responses.js 的 sendData、sendPage、sendError 中接入轻量 runtime contract 检查。
  - 校验失败只 console.warn，不阻断请求。
  - 成功响应包含 data、pagination、error:null。
  - 错误响应包含 data:null、pagination、error.code、error.message。
  - 继续保留迁移期 legacy 顶层字段，保证现有 Web 前端兼容。
- 新增 docs/API_CONTRACT.md、docs/API_ERRORS.md、docs/ARCHITECTURE.md，记录 API-first 响应 envelope、错误码、资产模型和迁移阶段。
- 新增 tests/api/contract.spec.js：
  - 启动本地 API server。
  - 验证 /api/health、/api/profile、/api/projects、/api/projects/:slug、/api/users/:handle。
  - 验证 envelope 必填字段、错误码、legacy 兼容字段和顶层 key 白名单。
- 新增 npm run test:api 脚本。

安全说明：

- 本轮没有修改业务逻辑。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 权限逻辑。
- 本轮没有修改前端 UI。
- 本轮没有修改 Three.js 渲染逻辑。
- 本轮没有新增 npm 依赖。
- 本轮没有部署 VPS。
- 本轮没有 push GitHub。

## 2026-07-01：API-first response 层最小侵入第一阶段

完成内容：

- 新增 server/responses.js 统一响应工具层：
  - sendData(response, data, httpStatus)
  - sendPage(response, data, pagination, httpStatus)
  - sendError(response, code, message, httpStatus)
  - API_ERROR_CODES 常量包含 AUTH_REQUIRED、INVALID_TOKEN、PROFILE_ADMIN_DISABLED、RESOURCE_FORBIDDEN、PROJECT_NOT_FOUND、VALIDATION_ERROR、RATE_LIMITED、SERVICE_UNAVAILABLE。
- 仅迁移低风险 API 到 response helper：
  - GET /api/health
  - GET /api/profile
  - GET /api/projects
  - GET /api/projects/:slug
  - GET /api/users/:handle
- 保持 legacy 顶层字段兼容：
  - ok
  - service
  - profile
  - skills
  - projects
  - project
- 错误响应新增 envelope error.code/error.message，同时保留迁移期顶层 code/message。

安全说明：

- 本轮没有修改业务逻辑。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 权限逻辑。
- 本轮没有修改前端 UI。
- 本轮没有修改 Three.js 渲染逻辑。
- 本轮没有新增依赖。
- 本轮没有部署 VPS。
- 本轮没有 push GitHub。

## 2026-07-01：后台访客管理 E2E 覆盖部署到 VPS

部署内容：

- 将后台访客管理 E2E 覆盖增强版本部署到 VPS。
- 部署 commit：f11546c
- release 包：.deploy-tools/mrright-portfolio-release.tar.gz
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260701-004849
- 服务名：mrright-portfolio
- 服务状态：active

部署前验证：

- npm run build：通过
- npm run lint：通过
- npm run release:vps：通过

部署安全检查：

- ADMIN_TOKEN=[set]
- DATABASE_URL=[set]
- 未输出 env value、token、数据库密码。
- 已备份 /opt/mrright-portfolio。
- 保留 /etc/mrright-portfolio.env、data、public/uploads、backup。
- 未修改生产数据库密码。
- 未删除数据库、表、上传文件或备份目录。

部署后验证：

- local /api/health：200
- local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog/admin：200
- https://mrright.blog/community：200
- https://mrright.blog/login?mode=login：200
- https://mrright.blog/account：200
- GET https://mrright.blog/api/admin/visitors 无 token：401
- GET https://mrright.blog/api/account/downloads 未登录：401
- GET https://mrright.blog/api/account/comments 未登录：401
- npx playwright test tests/e2e/production-smoke.spec.js：通过，6 passed，1 skipped
- npx playwright test tests/e2e/admin-visitors.spec.js：通过，4 passed，3 skipped

Skip 原因：

- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD。
- admin visitors 有 token API 只读测试：缺少 E2E_ADMIN_TOKEN。
- admin visitors 详情敏感字段只读测试：缺少 E2E_ADMIN_TOKEN。
- admin visitors 本地写闭环测试：生产环境按安全规则 skip。

注意：

- 本轮按用户要求部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改业务代码。
- 本轮没有修改认证系统或 /admin 权限逻辑。
- 本轮没有执行生产写测试。

## 2026-07-01：后台访客管理 E2E 闭环补全与稳定性验证

完成内容：

- 继续完善 tests/e2e/admin-visitors.spec.js，把后台访客管理从可用状态补强为可验证闭环。
- API 安全与权限覆盖增强：
  - GET /api/admin/visitors 未登录返回 401。
  - 新增 page、limit、query、sort 等筛选参数未登录请求覆盖，确认返回 401 且不报 500。
  - 有 admin token 的列表筛选和详情敏感字段检查仍保留为可选只读测试，缺少 E2E_ADMIN_TOKEN 时自动 skip。
- UI 稳定性覆盖保持：
  - /admin 加载不白屏。
  - Visitors 列表、搜索框、筛选、排序、分页、详情入口存在。
  - Visitor Detail 可打开。
  - Overview、Comments、Posts、Resources、Downloads、Moderation Log tabs 均存在。
  - 新增所有详情 tabs 逐个点击切换检查，确认任意 tab 不白屏且不触发 console/network 500 错误。
  - 空访客列表状态不白屏。
- 管理操作闭环测试补强：
  - 写闭环现在强制要求 E2E_ADMIN_VISITOR_WRITE=1、localhost/127.0.0.1 baseURL、本地 admin token、E2E_TEST_DATABASE_URL。
  - E2E_TEST_DATABASE_URL 必须指向名称明显包含 test/e2e/local/dev 的数据库，且不能是 mrright_portfolio。
  - 无 test DB 时自动 skip，不报错。
  - 覆盖 admin 禁用公开主页后公开接口 403 PROFILE_ADMIN_DISABLED。
  - 覆盖 admin 禁用/恢复后 /u/:handle 前端页面壳不返回 500；公开主页权限状态以 /api/users/:handle 数据接口验证。
  - 覆盖 admin 恢复公开主页后公开接口可访问。
  - 资料清理从 bio/contacts 扩展到 avatar/banner/bio/contacts。
  - 通过 test DB 直接确认 avatar_url、banner_url、bio、public_email、contact_links、contacts_public、profile_admin_disabled 等字段变更。
  - 通过 test DB 直接确认 admin_user_actions 写入 profile_disabled 和 profile_fields_cleared，并包含 avatar/banner/bio/contacts 字段记录。

修改文件：

- tests/e2e/admin-visitors.spec.js
- PROJECT_PROGRESS.md

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，10 passed，4 skipped
- git diff --check：通过

Skip 原因：

- admin visitors 有 token API 只读测试：缺少 E2E_ADMIN_TOKEN，按安全规则 skip。
- admin visitors 详情敏感字段只读测试：缺少 E2E_ADMIN_TOKEN，按安全规则 skip。
- admin visitors 本地写闭环测试：未设置 E2E_ADMIN_VISITOR_WRITE=1，且默认 baseURL 是生产站点；没有 E2E_TEST_DATABASE_URL 时也会自动 skip。
- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD，按既有规则 skip。

安全说明：

- 本轮没有部署 VPS。
- 本轮按用户要求提交并同步 GitHub 远端分支。
- 本轮没有修改业务代码。
- 本轮没有修改 /admin 权限认证逻辑。
- 本轮没有修改 visitor token 或认证系统。
- 本轮没有操作线上数据库，没有执行线上写操作。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-06-25：后台访客管理自动化测试补充

完成内容：

- 将 /admin 访客用户管理的一次性本地 Playwright review 扩展为可重复运行的正式 E2E 覆盖。
- 在 tests/e2e/admin-visitors.spec.js 中新增 admin visitors API 只读/权限测试：
  - GET /api/admin/visitors 无 admin token 返回 401，且不是 500。
  - 有 admin token 的列表分页、query、verified、profileStatus、accessLevel、sort 参数测试已加入，但默认缺少 E2E_ADMIN_TOKEN 时自动 skip。
  - 访客详情敏感字段泄露检查已加入，但默认缺少 E2E_ADMIN_TOKEN 或无访客数据时自动 skip。
- 扩展后台 UI mock 冒烟测试：
  - /admin 可打开。
  - Visitors 区域、搜索框、4 个筛选/排序控件、Search 按钮、分页控件存在。
  - 用户列表不白屏，点击用户详情不白屏。
  - 详情 tabs 覆盖 Overview、Comments、Posts、Resources、Downloads、Moderation Log。
  - 新增空访客列表状态测试，确认 No visitors match these filters. 正常显示且页面不白屏。
- 新增本地安全写操作闭环测试骨架：
  - 仅在 E2E_ADMIN_VISITOR_WRITE=1、baseURL 为 localhost/127.0.0.1、并提供本地 admin token 时运行。
  - 默认 npm run test:e2e 下自动 skip，不会写生产数据。
  - 覆盖专用测试用户创建、管理员禁用公开主页、公开接口 403 PROFILE_ADMIN_DISABLED、用户尝试恢复仍被管理员禁用、清理 bio/contacts、admin_user_actions 审计记录、恢复公开主页。
  - 如果本地非生产服务不返回 dev verification code，则该闭环自动 skip。

修改文件：

- tests/e2e/admin-visitors.spec.js
- PROJECT_PROGRESS.md

验证结果：

- npm run build：通过
- npm run lint：通过
- npx playwright test tests/e2e/admin-visitors.spec.js：通过，3 passed，3 skipped
- npm run test:e2e：通过，9 passed，4 skipped
- git diff --check：通过

Skip 原因：

- admin visitors 有 token API 只读测试：缺少 E2E_ADMIN_TOKEN，按安全规则 skip。
- admin visitors 本地写闭环测试：未设置 E2E_ADMIN_VISITOR_WRITE=1，且默认 baseURL 是生产站点，按安全规则 skip。
- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD，按既有规则 skip。

注意：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改 /admin 权限认证逻辑。
- 本轮没有修改 visitor token 或 ADMIN_TOKEN 认证逻辑。
- 本轮没有操作线上真实用户，没有连接线上数据库做写操作。
- 本轮没有覆盖 /etc/mrright-portfolio.env。
- 本轮没有删除数据库、表、上传文件或备份目录。
- npm run build 首次运行时发现本地 node_modules 缺少 Rollup optional native package；执行 npm install 补齐本地依赖后 build 通过，package.json 和 package-lock.json 未改变。

## 2026-06-24：/admin 访客用户管理功能上线

部署信息：

- 使用 commit：f49b6e6
- release 包：已生成并上传到 /tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260624-051010
- 服务状态：mrright-portfolio active
- nginx 状态：active
- 部署前 env 检查：ADMIN_TOKEN=[set]，DATABASE_URL=[set]

Schema：

- schema 安全扫描：通过
- schema ensure：成功
- visitor_users 4/4 个新增字段存在
- admin_user_actions 表存在

验证状态码：

- /api/health：200
- admin_summary：200
- https://mrright.blog/：200
- https://mrright.blog/admin：200
- https://mrright.blog/account：200
- https://mrright.blog/community：200
- https://mrright.blog/u/not-exist-test-handle：200，页面正常，不是 500

Admin Visitors 接口：

- GET /api/admin/visitors：200
- GET /api/admin/visitors?page=1&limit=30：200
- GET /api/admin/visitors?query=test：200
- GET /api/admin/visitors/:id：200
- 未提供 admin token：401，符合预期，未出现 500

Playwright 线上冒烟：

- /admin 可打开
- Visitors 区域可显示
- 搜索/筛选/分页 UI 存在
- 点击用户详情不白屏
- /account 不受影响
- /community 不受影响

截图路径，仅记录，不提交：

- G:\Code\3d-portfolio\test-results\admin-visitors-production-smoke
- admin-visitors.png
- admin-visitor-detail.png
- account.png
- community.png
- u_not-exist-test-handle.png

错误检查：

- network 500：0
- 非预期 console error：0
- 有 1 个预期 404：/api/users/not-exist-test-handle，这是缺失公开主页测试的正常结果，不是页面崩溃

备注：

- 如果浏览器还显示旧版 /admin，需要 Ctrl+Shift+R 强制刷新一次
- GitHub push 仍待后续凭证可用时执行

## 2026-06-23: Local admin visitor management implementation

Completed locally:

- Added paginated visitor search, verification/profile/access filters, and sorting.
- Added lazy-loaded visitor detail with Overview, Comments, Posts, Resources, Downloads, and Moderation Log tabs.
- Added admin profile disable/restore controls and profile-field moderation for avatar, banner, bio, and contacts.
- Added compatible visitor moderation columns and the admin_user_actions audit table.
- Added paginated admin APIs for visitor details and visitor-owned content.
- Public profile, resource, post, and activity APIs now respect administrator profile disable state.
- Added zh/en/ja copy for the friendly administrator-disabled public-profile state.
- Added a local Playwright visitor-management review with mocked administrator data.

Validation:

- npm run build: passed
- npm run lint: passed
- npm run test:e2e: passed (6 passed, 2 skipped)
- Local admin visitor Playwright review: passed (1 passed)
- git diff --check: passed
- Browser review: /admin opens; /account, /community, and missing public profile remain available; no console errors observed.

Notes:

- No VPS deployment was performed.
- No GitHub push was performed.
- No production database or environment file was modified.
- Review screenshot: test-results/admin-visitors-review/admin-visitors.png (ignored by Git).

## 项目信息

- 项目目录：/mnt/g/Code/3d-portfolio
- GitHub 仓库：rightamen/3d-portfolio
- 当前分支：codex/check-project-and-fix-errors
- 域名：https://mrright.blog
- VPS：147.79.20.232
- 部署目录：/opt/mrright-portfolio
- 服务名：mrright-portfolio
- 数据库：mrright_portfolio
- env 文件：/etc/mrright-portfolio.env

## 当前线上状态

- /api/health：200
- admin_summary：200
- /admin：200
- /community：200
- /login?mode=login：200
- /account：200
- /api/account/downloads：未登录 401，正常
- /api/account/comments：未登录 401，正常

## 最近完成

### 2026-06-18：模型预览优化上线

完成内容：

- 模型预览 UI 已优化并部署上线
- 新增专业 loading overlay：百分比、加载文案、loading ring、大模型慢加载提示
- 新增 ModelErrorBoundary：模型失败时显示友好错误卡片和 Reload Model 按钮
- 新增工具栏：重置视角、全屏、自动旋转、Studio/Dark/Grid、信息面板开关
- 新增模型信息面板：名称、格式、模型大小、顶点、三角面、材质、贴图、bounds、下载权限
- 优化相机适配：bounding box、自动居中、相机位置、Orbit target、reset 回到最佳视角
- 优化移动端：降低 DPR、关闭移动端阴影、工具栏适配、信息面板适配手机
- 优化资源释放：dispose cloned geometry/material/texture，并清理 useGLTF cache
- 保持 lazy loading，没有首页预加载全部模型

修改文件：

- src/components/ModelPreview.jsx
- src/index.css
- src/lib/i18n.js

部署信息：

- 使用 commit：a5f3d401bd2615e8cf8b5fb29e4089376055576a
- release 包：.deploy-tools/mrright-portfolio-release.tar.gz
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260618-121102
- 服务状态：active

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed, 1 skipped
- npm run release:vps：通过
- VPS local /api/health：200
- VPS local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog/：200
- https://mrright.blog/admin：200
- https://mrright.blog/account：200
- https://mrright.blog/community：200

线上 Playwright 模型预览冒烟测试：

- 首页正常
- 模型预览弹窗正常打开
- loading 截图已捕获
- Canvas、工具栏、模型信息面板存在
- 人为拦截模型资源后，错误态显示 LOAD FAILED 和 Reload Model，页面未崩溃
- 未发现生产 500
- console：正常预览未发现明显 error；错误态测试中有预期模型资源 404

截图路径，仅记录，不提交：

- test-results/model-viewer-production-smoke/home.png
- test-results/model-viewer-production-smoke/model-preview-loading.png
- test-results/model-viewer-production-smoke/model-preview.png
- test-results/model-viewer-production-smoke/model-preview-error.png
- test-results/model-viewer-production-smoke/admin.png
- test-results/model-viewer-production-smoke/account.png
- test-results/model-viewer-production-smoke/community.png

备注：

- 截图文件不提交
- 浏览器如仍看到旧样式，需要 Ctrl+Shift+R 强制刷新
- GitHub push 仍待后续凭证可用时执行

### 2026-06-18：UI 视觉升级已部署到 VPS

本地 commit：

- afc0838a8dc90f2fb572b08e02cb9c9ed6c32f00

完成内容：

- 将本地 UI 视觉升级 release 包上传到 VPS 并部署到 /opt/mrright-portfolio。
- 部署前按要求运行 npm run build、npm run lint、npm run test:e2e、npm run release:vps。
- 部署前仅检查 ADMIN_TOKEN 和 DATABASE_URL 为 [set]，未输出 value。
- 部署前已备份 /opt/mrright-portfolio。
- 部署未覆盖 /etc/mrright-portfolio.env，未修改数据库密码，未删除数据库、表、data、public/uploads 或备份目录。
- 本轮未重新 commit，未 push GitHub。

release 包：

- .deploy-tools/mrright-portfolio-release.tar.gz：生成成功
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz

备份路径：

- /opt/mrright-portfolio.backup-20260618-111302

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- npm run release:vps：通过
- VPS service active：active
- VPS local /api/health：200
- VPS local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog admin_summary：200
- https://mrright.blog/：200
- https://mrright.blog/account：200
- https://mrright.blog/login?mode=login：200
- https://mrright.blog/admin：200
- https://mrright.blog/community：200
- https://mrright.blog/u/not-exist-test-handle：200，页面显示缺失资料友好错误
- 线上 500 错误数量：0
- console error：仅 /u/not-exist-test-handle 缺失用户接口返回 404，属于预期缺失资料页场景

截图路径：

- test-results/ui-production-smoke/home.png
- test-results/ui-production-smoke/account.png
- test-results/ui-production-smoke/login.png
- test-results/ui-production-smoke/admin.png
- test-results/ui-production-smoke/community.png
- test-results/ui-production-smoke/public-profile-missing.png

注意：

- 截图文件未提交。
- 若用户浏览器仍看到旧 CSS/JS，可执行 Ctrl+Shift+R 强制刷新。

### 2026-06-18：本地 UI 视觉升级完成

本地 commit：

- 未提交

完成内容：

- 联网参考现代 3D portfolio、YouTube 频道页、YouTube Studio、Dribbble/Behance 深色 SaaS dashboard 风格后，完成本地 UI 视觉升级。
- 首页 /：增强 hero 层次、3D 氛围、按钮、标签、筛选和作品卡片质感。
- /account：升级为更接近 YouTube Studio + 个人资料中心的深色 dashboard 视觉。
- /u/:handle：增强频道页式封面、头像、handle、简介、链接、tabs 和内容卡片层级。
- /community：升级为现代社区流布局，优化帖子卡片、统计、上传区和资源卡片。
- /login?mode=login：升级为独立玻璃登录面板，统一品牌区、模式切换、输入框和按钮视觉。
- 未新增依赖，未修改服务端认证逻辑，未修改数据库 schema，未部署 VPS，未 push GitHub。

新增/修改文件：

- src/App.jsx
- src/components/HeroText.jsx
- src/index.css
- src/pages/AccountPage.jsx
- src/pages/AuthPage.jsx
- src/pages/CommunityPage.jsx
- src/pages/PublicProfilePage.jsx
- src/sections/Hero.jsx

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- git diff --check：通过
- 本地 Express 预览截图：通过，页面非白屏
- 本地截图检查 500：未发现 500
- console error：仅 /u/not-exist-test-handle 缺失用户接口返回 404，属于预期缺失资料页场景

截图路径：

- test-results/ui-review/home.png
- test-results/ui-review/community.png
- test-results/ui-review/login.png
- test-results/ui-review/account.png
- test-results/ui-review/public-profile-missing.png
- test-results/ui-review/mobile-home.png
- test-results/ui-review/mobile-community.png
- test-results/ui-review/mobile-login.png
- test-results/ui-review/mobile-account.png
- test-results/ui-review/mobile-public-profile-missing.png

注意：

- 本轮只做本地 UI 改版。
- 未写入任何真实用户数据。
- 未输出或修改 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。

### 2026-06-18：线上 Playwright 冒烟测试完成

本地 commit：

- 本次提交（最终 hash 以 git log 为准）

完成内容：

- 对线上 YouTube 式用户个人中心 / 公开主页功能完成 Playwright 冒烟测试。
- 测试过程未登录真实账号、未修改线上数据、未上传文件。
- 本轮测试未提交代码、未部署 VPS、未 push GitHub。

测试结果：

- https://mrright.blog/：打开成功，非白屏
- https://mrright.blog/community：打开成功，非白屏
- https://mrright.blog/login?mode=login：打开成功，登录表单正常
- https://mrright.blog/account：打开成功，未登录提示正常
- https://mrright.blog/u/not-exist-test-handle：打开成功，显示 Profile Not Found 友好错误
- /api/health：200
- /api/account/profile：未登录 401，正常
- /api/account/downloads：未登录 401，正常
- /api/account/comments：未登录 401，正常
- /api/users/not-exist-test-handle：404，正常
- 线上 500 错误数量：0

截图路径：

- test-results/smoke/home.png
- test-results/smoke/community.png
- test-results/smoke/login.png
- test-results/smoke/account.png
- test-results/smoke/public-profile-missing.png

注意：

- test-results/ 和 playwright-report/ 已加入 .gitignore。
- 截图文件未提交。

### 2026-06-18：新增正式 Playwright E2E 冒烟测试

本地 commit：

- 未提交

完成内容：

- 新增 Playwright 测试配置 playwright.config.js。
- 新增正式 E2E 测试 tests/e2e/production-smoke.spec.js。
- 新增 npm run test:e2e、npm run test:e2e:headed、npm run test:e2e:report 脚本。
- 新增 @playwright/test 开发依赖并更新 package-lock.json。
- E2E 覆盖：
  - 首页 /
  - /community
  - /login?mode=login
  - /account 未登录状态
  - /u/not-exist-test-handle 公开用户页 404/友好错误
  - /api/health 200
  - /api/account/profile 未登录 401
  - /api/account/downloads 未登录 401
  - /api/account/comments 未登录 401
  - /api/users/not-exist-test-handle 404
- 新增可选登录冒烟测试，仅使用 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD；未设置环境变量时自动 skip。

新增/修改文件：

- package.json
- package-lock.json
- playwright.config.js
- tests/e2e/production-smoke.spec.js

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- VPS 部署：未部署
- GitHub push：未执行

注意：

- 未写入真实账号或密码。
- 测试只做页面渲染和只读 API 状态检查，不登录、不上传、不修改线上数据。
- 首次运行 E2E 时安装了 Playwright Chromium 浏览器运行时。

### 2026-06-18：访客个人中心升级为公开资料中心

本地 commit：

- 74369497099d184b6ffef8e7e419eaab97628146

完成内容：

- 将 /account 设置页升级为类似 YouTube 频道资料中心，可编辑头像、封面图、显示名称、handle、简介、所在地、网站、公开邮箱、社交链接和隐私开关。
- 新增公开个人主页路由 /u/:handle，包含封面、头像、简介、公开联系方式、统计和 Overview/Resources/Posts/Comments/About tabs。
- 新增访客私有 API：
  - GET /api/account/profile
  - PUT /api/account/profile
  - POST /api/account/avatar
  - POST /api/account/banner
- 新增公开 API：
  - GET /api/users/:handle
  - GET /api/users/:handle/activity
  - GET /api/users/:handle/resources
  - GET /api/users/:handle/posts
- 兼容扩展 visitor_users 资料字段，使用 ALTER TABLE ADD COLUMN IF NOT EXISTS。

新增/修改文件：

- server/index.js
- server/postgresStores.js
- src/App.jsx
- src/lib/api.js
- src/lib/i18n.js
- src/pages/AccountPage.jsx
- src/pages/PublicProfilePage.jsx
- src/index.css

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run release:vps：通过
- git diff --check：通过
- VPS 部署：成功
- 服务重启：成功
- /api/health：200
- admin_summary：200
- /：200
- /account：200
- /login?mode=login：200
- /admin：200
- /community：200
- /api/account/profile：未登录 401，正常
- /api/account/downloads：未登录 401，正常
- /api/account/comments：未登录 401，正常
- /api/users/not-exist-test-handle：404，正常
- 线上 Playwright 冒烟测试：通过
- 线上 /：200，页面正常
- 线上 /community：页面正常
- 线上 /login?mode=login：页面正常
- 线上 /account：未登录提示正常
- 线上 /u/not-exist-test-handle：显示 Profile Not Found
- 线上 /api/health：200
- 线上 /api/account/profile：未登录 401，正常
- 线上 /api/account/downloads：未登录 401，正常
- 线上 /api/account/comments：未登录 401，正常
- 线上 /api/users/not-exist-test-handle：404，正常
- 线上 500 错误数量：0
- 线上冒烟测试截图路径：test-results/smoke/
- GitHub push：未执行

备份路径：

- /opt/mrright-portfolio.backup-20260618-053201

注意：

- 未修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 访客中心继续使用 visitor token。
- 公开接口不返回 visitor token，不默认暴露真实邮箱；只有 public_email 且 contacts_public 开启时才公开联系邮箱。
- 头像和封面上传保存到 public/uploads/avatars 与 public/uploads/banners，不删除旧文件。
- 部署时 env 仅检查 ADMIN_TOKEN 和 DATABASE_URL 为 [set]，未输出 value。

### 2026-06-18：项目规则、进度记录和 Claude 自动化命令本地提交

本地 commit：

- 本次提交（最终 hash 以 git log 为准）

完成内容：

- 新增项目协作规则 AGENTS.md。
- 新增 Claude 自动化规则 CLAUDE.md。
- 新增 PROJECT_PROGRESS.md 作为项目进度记录。
- 新增 .claude/commands/ 下的自动化命令。
- 将 .claude/settings.local.json 加入 .gitignore，避免提交本地设置。

验证结果：

- 敏感信息扫描：未发现实际 token、密码、ADMIN_TOKEN value、DATABASE_URL value、GitHub token 或 VPS 密码。
- npm run build：未运行（未修改业务代码）。
- npm run lint：未运行（未修改业务代码）。
- VPS 部署：未部署。
- GitHub push：未执行。

注意：

- 未提交 .claude/settings.local.json。
- 未修改业务代码。

### 2026-06-17：访客个人中心改版上线

本地 commit：

- 98cae36

完成内容：

- 将 /account 改成与 /admin 风格统一的访客版后台中心
- 新增访客只读接口：
  - GET /api/account/downloads
  - GET /api/account/comments
- 新增/修改文件：
  - server/postgresStores.js
  - server/index.js
  - src/lib/api.js
  - src/lib/i18n.js
  - src/pages/AccountPage.jsx
  - src/index.css

验证结果：

- npm run build：通过
- npm run lint：通过
- VPS 部署：成功
- 服务重启：成功
- 新版 /account：已上线

备份路径：

- /etc/mrright-portfolio.env.backup-20260617-045006
- /opt/mrright-portfolio.backup-20260617-045006

注意：

- GitHub push 跳过，因为当前环境无法读取 GitHub 凭证
- 后续本机有 GitHub 凭证时执行：
  git push origin codex/check-project-and-fix-errors

## 固定安全规则

1. 不要输出 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。
2. 不要覆盖 /etc/mrright-portfolio.env。
3. 不要重置数据库密码，除非用户明确要求。
4. 不要删除数据库、表、上传文件、备份目录。
5. 不要 force push。
6. 不要 reset，除非用户明确要求。
7. 修改代码后必须运行 npm run build 和 npm run lint。
8. 部署前必须备份 /opt/mrright-portfolio。
9. 部署前必须确认 ADMIN_TOKEN 和 DATABASE_URL 都是 [set]，但不要输出 value。
10. 部署后必须验证 /api/health、admin_summary、/admin、/community、/login、/account。
11. GitHub push 失败时，不要重复 commit，不要 reset，只说明原因。
