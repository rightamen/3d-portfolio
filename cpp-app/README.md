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
build has no Qt, libcurl, or other network dependencies.

From the repository root:

```bash
cmake -S cpp-app -B cpp-app/build -DCMAKE_BUILD_TYPE=Debug
cmake --build cpp-app/build --config Debug
ctest --test-dir cpp-app/build --build-config Debug --output-on-failure
```

CTest runs two binaries: `mrright_cpp_smoke` and `mrright_cpp_sdk_tests`.
The smoke binary verifies that the SDK skeleton models, platform path
abstraction, and no-network CLI compile and execute. The SDK tests use
`MockHttpClient` and fixed JSON bodies to verify strict `/api/v1` envelope
decoding and typed client behavior. They do not perform real network I/O,
read tokens, start the Node server, or touch a database.

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

If the local machine does not have CMake or a C++20 compiler, do not install
new dependencies just for this skeleton batch. Use the `C++ App Skeleton`
GitHub Actions workflow as the cross-platform validation entry; it configures,
builds, and runs the smoke test on Ubuntu, macOS, and Windows.

Current local WSL validation note: this workspace has completed a Ninja Debug
CMake configure/build/CTest pass from the repository root:

```bash
cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug
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
- `sdk/core/JsonValue.hpp`: a deliberately small, dependency-free temporary
  JSON parser used only to support current contract fixtures. It is internal to
  the early SDK prototype and must stay behind `EnvelopeParser`.
- `sdk/core/EnvelopeParser.hpp`: strict `/api/v1` envelope decoding, including
  `ApiError`, `Pagination`, unknown error-code fallback, and rejection of
  legacy top-level mirrors.
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
- `src/main.cpp`: a no-network smoke binary that constructs example
  `Pagination`, `ApiError`, and `ResponseEnvelope` values.
- `tests/unit/sdk_contract_tests.cpp`: no-network SDK contract tests driven by
  fixed strict-envelope JSON responses.

## What Is Not Included

- No Qt UI or QML.
- No real HTTP transport in the default build and no real API calls.
- No production-grade JSON dependency or generated OpenAPI client.
- No admin endpoints.
- No legacy `/api/*` support.
- No token persistence implementation and no plaintext token storage.
- No SQLite cache, download manager, Range/ETag handling, or packaging logic.

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

Do not commit `cpp-app/build/`, `cpp-app/build-curl/`, `vcpkg_installed/`, or
dependency caches. Real API smoke tests are not part of this batch; when added,
they must point at a local/dev server and never production by default.

## Dependency Strategy

The current skeleton has no external C++ runtime dependencies. It should keep
building with plain CMake and a C++20 compiler so `MockHttpClient` tests remain
available without package setup.

The accepted dependency strategy is recorded in
`docs/adr/ADR_CPP_DEPENDENCY_MANAGER_STRATEGY.md`:

- Use vcpkg manifest mode as the preferred strategy for SDK/backend
  dependencies.
- `cpp-app/vcpkg.json` currently contains only the libcurl dependency needed
  for the optional backend.
- Manage future libcurl, `nlohmann-json`, sqlite3, and similar backend
  libraries through vcpkg unless a concrete blocker appears.
- Evaluate Qt separately during the Qt/QML phase; it may use vcpkg, the
  official Qt installer, or aqtinstall.
- Do not commit `vcpkg_installed/`, dependency caches, build outputs, or
  vendored third-party source.

## Next Steps

1. Add local/dev API smoke coverage for the optional libcurl backend without
   contacting production services.
2. Replace the temporary JSON parser with `nlohmann/json` after the C++
   dependency manager is in place. The decision is recorded in
   `docs/adr/ADR_CPP_JSON_STRATEGY.md`; this batch intentionally does not
   vendor a large header or require CMake to fetch packages.
3. Expand JSON serialization/deserialization tests against contract fixtures.
4. Spike OpenAPI-generated client/types only as a comparison point, not as the
   default SDK implementation.
5. Integrate Qt/QML once the SDK boundary is stable.
6. Implement SQLite cache metadata and content-addressed blob storage.
7. Implement secure `TokenStore` providers:
   Windows Credential Manager, macOS Keychain, Linux Secret Service, then an
   explicitly marked encrypted-file fallback.
8. Spike packaging scripts for NSIS, dmg/notarization, and AppImage.
