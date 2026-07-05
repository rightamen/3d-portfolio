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
- Provide model/header placeholders that can later receive JSON parsing,
  HTTP backend, cache, download, and Qt/QML layers.

C++20 is used because the prototype already benefits from standard library
features with mature compiler support on the planned P0 platforms, including
`std::filesystem`, `std::optional`, and cleaner future room for concepts or
`std::span`. The current code avoids newer runtime dependencies and remains
plain standard-library C++.

Datetime fields are represented as ISO-8601 `std::string` placeholders in
this skeleton. A later SDK batch should choose either `std::chrono` for the
pure SDK layer or Qt date/time types at the UI binding boundary.

## Build

From the repository root:

```bash
cmake -S cpp-app -B cpp-app/build -DCMAKE_BUILD_TYPE=Debug
cmake --build cpp-app/build
./cpp-app/build/mrright_cpp_smoke
```

Or, with presets:

```bash
cmake --preset debug
cmake --build --preset debug
./cpp-app/build/debug/mrright_cpp_smoke
```

If the local machine does not have CMake or a C++20 compiler, do not install
new dependencies just for this skeleton batch. The follow-up CI matrix should
run configure/build on Windows, macOS, and Linux.

Current local note for this batch: this workspace had `c++` 13.3.0 available
but no `cmake` command, so the formal CMake configure/build could not be run
here. The smoke source was still syntax-checked with:

```bash
c++ -std=c++20 -Wall -Wextra -Wpedantic -Icpp-app \
  cpp-app/src/main.cpp cpp-app/app/platform/AppPaths.cpp \
  -o /tmp/mrright_cpp_smoke
/tmp/mrright_cpp_smoke
```

## What Is Included

- `sdk/models`: C++ model sketches for the strict v1 envelope, API errors,
  pagination, user/profile/project/community/comment/download request shapes,
  and the aspirational Asset model.
- `sdk/core`: `ApiResult`, `ApiClient`, `TokenStore`, and client stubs for
  Auth, Project, Community, and Asset workflows.
- `sdk/network`: an interface-only `HttpClient` plus a null implementation
  that never performs real HTTP requests.
- `app/platform`: `AppPaths` placeholders for config, cache, data, logs,
  downloads, and temp paths across Windows/macOS/Linux.
- `src/main.cpp`: a no-network smoke binary that constructs example
  `Pagination`, `ApiError`, and `ResponseEnvelope` values.

## What Is Not Included

- No Qt UI or QML.
- No real HTTP backend and no API calls.
- No JSON parser or generated OpenAPI client.
- No admin endpoints.
- No legacy `/api/*` support.
- No token persistence implementation and no plaintext token storage.
- No SQLite cache, download manager, Range/ETag handling, or packaging logic.

## Next Steps

1. Add an OpenAPI drift/validation tool to CI.
2. Implement a replaceable HTTP backend for `/api/v1/*`.
3. Add JSON serialization/deserialization tests against contract fixtures.
4. Integrate Qt/QML once the SDK boundary is stable.
5. Implement SQLite cache metadata and content-addressed blob storage.
6. Implement secure `TokenStore` providers:
   Windows Credential Manager, macOS Keychain, Linux Secret Service, then an
   explicitly marked encrypted-file fallback.
7. Add Windows/macOS/Linux CI configure/build matrix.
8. Spike packaging scripts for NSIS, dmg/notarization, and AppImage.
