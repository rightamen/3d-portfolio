# mrright.blog C++ App Skeleton

This directory is the first C++ cross-platform prototype skeleton for the
mrright.blog platform. It is intentionally small: a CMake project, SDK model
headers derived from `docs/openapi/api-v1.yaml` and
`docs/API_V1_MODEL_MAPPING.md`, interface-only API clients, a platform path
abstraction, and one CLI smoke binary.

## Current Goal

- Establish a compilable C++20 SDK/application layout under `cpp-app/`.
- Keep the SDK pointed at the strict `/api/v1` envelope contract only.
- Keep admin endpoints out of the public SDK surface.
- Provide model/header placeholders plus a first mock-driven JSON/envelope
  decoding layer that can later receive a real HTTP backend, cache, download,
  and Qt/QML layers.

C++20 is used because the prototype already benefits from standard library
features with mature compiler support on the planned P0 platforms, including
`std::filesystem`, `std::optional`, and cleaner future room for concepts or
`std::span`. The current code avoids newer runtime dependencies and remains
plain standard-library C++.

Datetime fields are represented as ISO-8601 `std::string` placeholders in
this skeleton. A later SDK batch should choose either `std::chrono` for the
pure SDK layer or Qt date/time types at the UI binding boundary.

## Build

Local builds require CMake 3.20+ and a C++20-capable compiler. The default
parser is nlohmann/json, so the default build should use the vcpkg toolchain
and `cpp-app/vcpkg.json` manifest. The temporary parser fallback still avoids
the JSON dependency by enabling `MRRIGHT_USE_TEMPORARY_JSON=ON`.

On Linux, the secure TokenStore backend is enabled by default and requires the
system `libsecret-1` development package plus pkg-config, for example
`libsecret-1-dev` on Ubuntu/Debian. Configure with
`-DMRRIGHT_ENABLE_LINUX_SECRET_SERVICE=OFF` only when you intentionally want
Linux secure token storage to be explicit unsupported.

From the repository root:

```bash
export VCPKG_ROOT=/path/to/vcpkg
cmake -S cpp-app -B cpp-app/build-json -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake
cmake --build cpp-app/build-json
ctest --test-dir cpp-app/build-json --output-on-failure
```

CTest runs `mrright_cpp_smoke`, `mrright_cpp_sdk_tests`, and
`mrright_cpp_nlohmann_json_tests`. The smoke binary verifies that the SDK
skeleton models, platform path abstraction, and no-network CLI compile and
execute. The SDK tests use `MockHttpClient` and fixed JSON bodies to verify
strict `/api/v1` envelope decoding and typed client behavior. They do not
perform real network I/O, read tokens, start the Node server, or touch a
database.

## CMake Presets

The project also supports CMakePresets:

```bash
cmake --preset debug
cmake --build --preset debug
ctest --test-dir cpp-app/build/debug --build-config Debug --output-on-failure
```

Available configure/build presets:

- `debug`
- `release`
- `relwithdebinfo`

The presets do not encode a vcpkg toolchain. Use them only in an environment
where CMake can already find `nlohmann_json`, or configure the fallback path
with `MRRIGHT_USE_TEMPORARY_JSON=ON`.

If the local machine does not have CMake, a C++20 compiler, or vcpkg, do not
install new dependencies just for fallback validation. Use the `C++ App
Skeleton` GitHub Actions workflow as the cross-platform validation entry; it
configures, builds, and runs the temporary parser fallback on Ubuntu, macOS,
and Windows.

Current local WSL fallback validation note: this workspace has completed a
Ninja Debug CMake configure/build/CTest pass from the repository root:

```bash
cmake -S cpp-app -B cpp-app/build -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DMRRIGHT_USE_TEMPORARY_JSON=ON
cmake --build cpp-app/build
ctest --test-dir cpp-app/build --output-on-failure
```

Both CTest targets passed: `mrright_cpp_smoke` and
`mrright_cpp_sdk_tests` (`2/2 tests passed`). `cpp-app/build/` is ignored and
must not be committed.

For minimal syntax checks without CMake, the same smoke and SDK test sources
can still be compiled directly with:

```bash
c++ -std=c++20 -Wall -Wextra -Wpedantic -Icpp-app \
  cpp-app/src/main.cpp cpp-app/app/platform/AppPaths.cpp \
  -o /tmp/mrright_cpp_smoke
/tmp/mrright_cpp_smoke

c++ -std=c++20 -Wall -Wextra -Wpedantic -Icpp-app \
  cpp-app/tests/unit/sdk_contract_tests.cpp \
  -o /tmp/mrright_cpp_sdk_tests
/tmp/mrright_cpp_sdk_tests
```

## What Is Included

- `sdk/models`: C++ model sketches for the strict v1 envelope, API errors,
  pagination, user/profile/project/community/comment/download request shapes,
  and the aspirational Asset model.
- `sdk/core`: `ApiResult`, `ApiClient`, `TokenStore`, and client stubs for
  Auth, Project, Community, and Asset workflows. `AuthClient::login`,
  `AuthClient::logout`, `AuthClient::me`, `ProjectClient::listProjects`,
  `ProjectClient::getProject`, `ProjectClient::likeProject`,
  `ProjectClient::createComment`, and first-pass community read/comment
  methods exercise the `HttpClient` abstraction against mock responses.
- `sdk/core/ApiClientConfig.hpp`: in-memory HTTP client configuration:
  `baseUrl`, `apiPrefix` (defaults to `/api/v1`), `timeoutMs`, `userAgent`,
  and optional bearer token. No production domain is hard-coded; for local
  development use a value such as `http://localhost:3000`. Tokens live only
  in memory here and are never persisted by the SDK.
- `sdk/core/TokenStore.hpp`: the SDK token storage boundary. Product builds
  must back this interface with platform secure credential storage.
- `sdk/core/MemoryTokenStore.hpp`: a test/dev-session implementation that
  stores a visitor token only in memory. It is not a production persistence
  backend.
- `sdk/core/AuthSession.hpp`: a lightweight mock-driven session orchestration
  layer that combines `AuthClient`, `TokenStore`, and `ApiClientConfig` for
  login/store-token, loading a stored token into request config, and
  logout/clear-session flows.
- `sdk/platform/SecureTokenStore.hpp`: a platform secure TokenStore factory.
  Windows returns a Credential Manager backend, macOS returns a Keychain
  backend, and Linux returns a Secret Service backend when compiled with
  `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON`.
- `sdk/core/JsonValue.hpp`: a deliberately small, dependency-free temporary
  JSON parser retained only as an explicit fallback for emergency
  no-dependency builds. It is internal to the SDK prototype and must stay
  behind `EnvelopeParser`.
- `sdk/core/NlohmannJsonValue.hpp` and `sdk/core/NlohmannEnvelopeParser.hpp`:
  the default nlohmann/json parser backend wired behind the same parser
  boundary.
- `sdk/core/EnvelopeParser.hpp`: strict `/api/v1` envelope decoding, including
  `ApiError`, `Pagination`, unknown error-code fallback, and rejection of
  legacy top-level mirrors. It selects nlohmann/json by default and the
  temporary parser only when `MRRIGHT_USE_TEMPORARY_JSON=ON`.
- `sdk/network`: an interface-only `HttpClient`, `NullHttpClient`, and
  `MockHttpClient` for typed client tests. `RealHttpClient` is present as a
  replaceable backend placeholder, but it intentionally returns
  `REAL_HTTP_BACKEND_NOT_ENABLED` and performs no network I/O in default
  builds. `CurlHttpClient` is the first concrete backend, but it is compiled
  only when `MRRIGHT_ENABLE_CURL_HTTP=ON`.
  The backend strategy is recorded in
  `docs/adr/ADR_CPP_HTTP_BACKEND_STRATEGY.md`: keep the abstraction, make
  libcurl optional, and defer Qt Network to the Qt/QML phase.
- `app/platform`: `AppPaths` placeholders for config, cache, data, logs,
  downloads, and temp paths across Windows/macOS/Linux.
- `app/ui/qt`: an opt-in Qt/QML desktop shell. It is compiled only when
  `MRRIGHT_ENABLE_QT_UI=ON`; the default SDK build does not find or link Qt.
- `src/main.cpp`: a no-network smoke binary that constructs example
  `Pagination`, `ApiError`, and `ResponseEnvelope` values.
- `tests/unit/sdk_contract_tests.cpp`: no-network SDK contract tests driven by
  fixed strict-envelope JSON responses.

## What Is Not Included

- No full Qt UI yet; only an opt-in shell can be built with
  `MRRIGHT_ENABLE_QT_UI=ON`.
- No real HTTP transport in the default build and no real API calls.
- No generated OpenAPI client.
- No admin endpoints.
- No legacy `/api/*` support.
- No plaintext token storage.
- No SQLite cache, download manager, Range/ETag handling, or packaging logic.

## Token Storage

The token storage strategy is recorded in
`docs/adr/ADR_CPP_TOKENSTORE_STRATEGY.md`.

The SDK keeps `TokenStore` as the boundary for visitor token persistence.
`MemoryTokenStore` is provided only for unit tests and short-lived development
sessions. It stores fake or development visitor tokens in process memory,
supports save/load/clear, and never writes files, reads environment variables,
prints tokens, or contacts the network.

Production token storage must use platform secure credential backends. The
first backend entrypoint is `createPlatformSecureTokenStore()` in
`sdk/platform/SecureTokenStore.hpp`. On Windows it returns a
`WindowsCredentialTokenStore` backed by Windows Credential Manager using the
credential target `mrright.blog.visitor_token`. CMake links `Advapi32` only on
Windows because the Credential Manager APIs live there.

On macOS, `createPlatformSecureTokenStore()` returns a
`MacOSKeychainTokenStore` backed by Security.framework Keychain Services using
service `mrright.blog` and account `visitor_token`. CMake links
Security.framework only on macOS.

On Linux, `createPlatformSecureTokenStore()` returns a
`LinuxSecretServiceTokenStore` backed by libsecret / Secret Service when
compiled with `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON` (the Linux default).
It uses schema `mrright.blog` and attribute `account=visitor_token`. The Linux
build uses the system `libsecret-1` development package discovered through
pkg-config; it does not add Qt or vcpkg dependencies. If `libsecret-1` headers
are unavailable while this option is enabled, CMake fails clearly instead of
pretending a secure backend exists. Developers can configure
`-DMRRIGHT_ENABLE_LINUX_SECRET_SERVICE=OFF` only to make Linux explicitly
unsupported for secure token storage.

At runtime, Linux Secret Service usually requires a desktop keyring provider
such as GNOME Keyring or KWallet plus a usable D-Bus session. In headless or
minimal environments the runtime round-trip test may return CTest skip code 77
with a clear message. That skip means the backend compiled and linked but the
runtime Secret Service session is unavailable; it must not be treated as a
plaintext or memory fallback.

On unsupported platforms, the secure-store factory returns `nullptr`; it does
not silently fall back to plaintext files or `MemoryTokenStore`. QtKeychain may
be evaluated during the Qt/QML phase as a wrapper over platform stores.

Plaintext token storage is forbidden. Do not write bearer tokens to normal
JSON/config files, logs, diagnostics, examples, `PROJECT_PROGRESS.md`, or crash
reports. Admin tokens must never enter the C++ SDK.

## Auth Session Flow

`AuthSession` provides the first SDK session orchestration layer. It composes
`AuthClient`, `TokenStore`, and `ApiClientConfig`; it does not depend on
`CurlHttpClient`, does not access the network directly, and does not persist
tokens by itself.

Current mock-driven coverage includes:

- `loginAndStoreToken(email, password)` calls `AuthClient::login` and saves the
  visitor token to the injected `TokenStore` only after a successful strict
  `/api/v1` envelope response.
- `configWithStoredToken()` copies a stored visitor token into
  `ApiClientConfig::bearerToken`, allowing `ApiClient` to inject the
  `Authorization` header during normal request construction.
- `clearSession()` clears the injected `TokenStore`.
- `logoutAndClearSession()` sends logout with the stored visitor token through
  `AuthClient` and clears the store after the logout attempt.

`MemoryTokenStore` remains only for tests and short-lived development sessions.
Production session persistence must use a supported platform secure
`TokenStore`; Windows Credential Manager, macOS Keychain, and Linux Secret
Service are currently supported. Tokens must not be written to plaintext files
or logs.

## Qt/QML Shell

The Qt/QML desktop shell is optional. Default SDK builds do not call
`find_package(Qt6)`, do not compile QML, and do not link Qt. The SDK core
remains Qt-free: Qt types stay under `app/ui/qt`, while the UI reads only small
SDK-facing constants such as `ApiClientConfig::apiPrefix`.

Enable the shell only in a separate build directory with a Qt 6 development
installation available to CMake:

```bash
export VCPKG_ROOT=/path/to/vcpkg
cmake -S cpp-app -B cpp-app/build-qt -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DMRRIGHT_ENABLE_QT_UI=ON \
  -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake
cmake --build cpp-app/build-qt --target mrright_qt_shell
ctest --test-dir cpp-app/build-qt --output-on-failure -R mrright_qt_appcontroller_tests
```

The shell creates a `QGuiApplication`, loads `Main.qml`, and exposes an
`AppController` for UI-only state. The controller publishes `appName`,
`sdkVersion`, `apiPrefix`, `status`, `isLoggedIn`, `currentUserLabel`, and
`loginMessage`, plus mock-only `mockLogin(email, password)`, `logout()`, and
`clearMessage()` actions. Authentication state and actions now pass through the
Qt-layer `AuthService` interface. `AppController` creates `MockAuthService` by
default and also accepts an injected `std::unique_ptr<AuthService>` for tests
and future adapters, so it no longer owns the complete mock authentication
implementation.

The current auth panel remains a mock UI flow only. `MockAuthService` validates
the entered email/password, trims the email for the displayed user label, and
maintains only mock signed-in state and UI messages. It does not call
`AuthSession`, create `CurlHttpClient`, access any API, read or write a
`TokenStore` (including `SecureTokenStore`), persist tokens, call admin
endpoints, read environment variables, or create local cache state. Neither
`MockAuthService` nor `AppController` stores or prints the password, and no
password or token property is exposed to QML.

When `MRRIGHT_ENABLE_QT_UI=ON`, CMake also builds
`mrright_qt_appcontroller_tests`. These unit tests directly exercise
`MockAuthService` state and validation, then inject a lightweight fake service
to verify controller delegation, property synchronization, and notify signals.
They use `QCoreApplication`, do not start a GUI window, do not perform real
login, do not access API endpoints, do not read or write TokenStore, and do not
persist tokens. Default SDK builds keep `MRRIGHT_ENABLE_QT_UI=OFF`, so they do
not find Qt, build the Qt shell, or build the Qt tests.

The next auth batch will add a real Qt `AuthService` adapter backed by
`AuthSession` and a supported secure platform `TokenStore`. That adapter is not
part of this batch. `AuthService` remains under `app/ui/qt`, and no Qt type or
dependency enters the SDK core public API.

## JSON Parser Backend

The default parser backend is nlohmann/json. JSON parsing remains behind
`JsonValue.hpp` / `EnvelopeParser.hpp`, so typed clients still construct
requests and decode typed models without taking a direct JSON dependency.

The default path uses vcpkg manifest mode and requires CMake to find
`nlohmann_json`. It does not contact production, does not start the Node server,
and does not read tokens.

From the repository root:

```bash
export VCPKG_ROOT=/path/to/vcpkg
cmake -S cpp-app -B cpp-app/build-json -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake
cmake --build cpp-app/build-json
ctest --test-dir cpp-app/build-json --output-on-failure
```

The nlohmann-enabled CTest path includes `mrright_cpp_sdk_tests` plus
`mrright_cpp_nlohmann_json_tests`, covering strict success/error envelopes,
pagination, unknown error-code preservation, invalid JSON, legacy mirror
rejection, project list decoding through `ProjectClient`, and minimal
auth/session decoding. It performs no network I/O and does not read tokens.

The temporary parser is retained as an explicit fallback. It avoids vcpkg and
nlohmann/json for emergency no-dependency validation only:

```bash
cmake -S cpp-app -B cpp-app/build -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DMRRIGHT_USE_TEMPORARY_JSON=ON
cmake --build cpp-app/build
ctest --test-dir cpp-app/build --output-on-failure
```

Fallback CTest runs `mrright_cpp_smoke` and `mrright_cpp_sdk_tests`, which keep
minimum compile and strict-envelope coverage for the temporary parser path.

## HTTP Backend Strategy

The SDK currently validates request construction and strict-envelope parsing
with `MockHttpClient`. `RealHttpClient` is still a no-network placeholder and
must not be treated as a production transport.

The accepted strategy is:

- Business clients depend only on `sdk/network/HttpClient`.
- The next real backend spike should be an optional libcurl backend controlled
  by CMake/dependency-manager configuration.
- Qt Network should be added later as a second backend during the Qt/QML UI
  prototype phase.
- SDK core should not directly depend on Qt.
- API smoke tests should point at a local/dev `baseUrl`, not production by
  default.
- Tokens must stay in memory or a future secure `TokenStore`; do not write
  bearer tokens to config files or logs.

### Optional libcurl Backend

`MRRIGHT_ENABLE_CURL_HTTP` defaults to `OFF`. With the default setting, CMake
does not search for libcurl, does not require vcpkg, and still builds
`mrright_cpp_smoke` plus `mrright_cpp_sdk_tests`.

To compile the optional `CurlHttpClient`, use a separate build directory and a
vcpkg toolchain or another CMake-visible libcurl development package:

```bash
export VCPKG_ROOT=/path/to/vcpkg
cmake -S cpp-app -B cpp-app/build-curl -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DMRRIGHT_ENABLE_CURL_HTTP=ON \
  -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake
cmake --build cpp-app/build-curl
ctest --test-dir cpp-app/build-curl --output-on-failure
```

If `vcpkg` is not already installed locally, do not install it just for the
default skeleton build. The normal build above remains dependency-free and the
GitHub Actions workflow has a separate `cpp-app-curl-vcpkg` job that bootstraps
vcpkg on Ubuntu, resolves the `cpp-app/vcpkg.json` manifest, configures CMake
with `MRRIGHT_ENABLE_CURL_HTTP=ON`, builds, and runs CTest.

`CurlHttpClient` sends `HttpRequest` values and returns raw `HttpResponse`
values. It supports GET, POST, PUT, DELETE, and PATCH, request headers, request
body, response status/body, best-effort response header capture, and timeout
configuration from `ApiClientConfig`. It does not parse business JSON, does
not know project/user/community models, does not save tokens, and does not
construct `/api/v1` paths; `ApiClient` remains responsible for path and header
construction.

The curl-enabled CTest path includes a compile/link-only
`mrright_cpp_curl_compile_tests` target. It verifies that the optional backend
is actually compiled and linked when the option is enabled, but it does not
perform network I/O or contact any real API.

Do not commit `cpp-app/build/`, `cpp-app/build-json/`,
`cpp-app/build-curl/`, `cpp-app/build-curl-smoke/`, `vcpkg_installed/`, or
dependency caches. Real API smoke tests are not part of this batch; when added,
they must point at a local/dev server and never production by default.

### Local API Smoke Test

The local API smoke test is opt-in and is not part of the default build or
normal CTest run. It performs real HTTP requests through `CurlHttpClient`, so
it requires both a local Web/API development server and a libcurl-enabled CMake
build.

Start the local Web/API dev server in a separate shell, then configure with
both curl and the local smoke option enabled:

```bash
export VCPKG_ROOT=/path/to/vcpkg
cmake -S cpp-app -B cpp-app/build-curl-smoke -G Ninja \
  -DCMAKE_BUILD_TYPE=Debug \
  -DMRRIGHT_ENABLE_CURL_HTTP=ON \
  -DMRRIGHT_ENABLE_LOCAL_API_SMOKE=ON \
  -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake
cmake --build cpp-app/build-curl-smoke
MRRIGHT_API_BASE_URL=http://127.0.0.1:3000 \
  ctest --test-dir cpp-app/build-curl-smoke --output-on-failure
```

`MRRIGHT_API_BASE_URL` is required at test runtime. The test refuses to run
unless the URL is loopback-only: `http://localhost`, `http://127.0.0.1`, or
`http://[::1]`, with an optional port. It does not read `.env`, does not use
tokens, does not call admin endpoints, does not perform writes, and does not
contact production.

Current coverage:

- `GET /api/v1/health`: HTTP 200, strict `data`/`pagination`/`error`
  envelope, `error: null`, and `data.ok === true`.
- `GET /api/v1/projects`: HTTP 200, or a strict API error envelope for a
  currently unavailable local store; rejects legacy top-level `projects`
  mirrors and exercises `ProjectClient::listProjects()` / `EnvelopeParser`.
- `GET /api/v1/projects/__mrright_cpp_smoke_missing_project__`: optional
  negative-path coverage for a 404 strict error envelope with `error.code` and
  `error.message`.

## Dependency Strategy

The current skeleton keeps SDK core tests available without network access or
production services. The default parser uses vcpkg-managed `nlohmann-json`, the
optional curl backend uses vcpkg-managed curl, and the Linux secure TokenStore
uses the system `libsecret-1` development package discovered through
pkg-config. The temporary parser fallback avoids the JSON dependency but still
compiles the Linux Secret Service backend unless
`MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=OFF` is configured explicitly.

The accepted dependency strategy is recorded in
`docs/adr/ADR_CPP_DEPENDENCY_MANAGER_STRATEGY.md`:

- Use vcpkg manifest mode as the preferred strategy for SDK/backend
  dependencies.
- `cpp-app/vcpkg.json` currently contains only the libcurl dependency needed
  for the optional backend plus `nlohmann-json` for the default parser
  backend.
- Manage future libcurl, `nlohmann-json`, sqlite3, and similar portable
  backend libraries through vcpkg unless a concrete blocker appears.
- Use the distro/system `libsecret-1` development package for Linux Secret
  Service; do not add Qt or a vcpkg dependency for this backend in the current
  CMake path.
- The optional Qt/QML shell is separate from SDK core. It can use an existing
  Qt SDK, distro Qt packages, the official Qt installer, or a future dedicated
  CI installer flow, but it is not required for default SDK builds.
- Do not commit `vcpkg_installed/`, dependency caches, build outputs, or
  vendored third-party source.

## Next Steps

1. Expand JSON serialization/deserialization tests against contract fixtures.
2. Spike OpenAPI-generated client/types only as a comparison point, not as the
   default SDK implementation.
3. Integrate the Qt login UI with `AuthSession` and secure TokenStore.
4. Add a project list UI backed by the strict `/api/v1` SDK clients.
5. Implement SQLite cache metadata and content-addressed blob storage.
6. Spike packaging scripts for NSIS, dmg/notarization, and AppImage.
