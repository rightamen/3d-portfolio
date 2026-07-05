# ADR: C++ Dependency Manager Strategy

Date: 2026-07-05

Status: Accepted

## 1. Background

`cpp-app` currently has a CMake skeleton with no external runtime
dependencies. The SDK builds a smoke binary and no-network SDK tests using
only the C++20 standard library.

Current related decisions:

- JSON parsing temporarily uses `JsonValue.hpp`; the long-term JSON ADR prefers
  `nlohmann/json` once dependency management is in place.
- HTTP backend strategy keeps `HttpClient` as the business-client boundary and
  chooses an optional libcurl backend spike next.
- `MRRIGHT_ENABLE_CURL_HTTP` exists but defaults to `OFF`; enabling it
  currently fails because no libcurl backend is implemented.

Future C++ work will likely need:

- libcurl for the first real HTTP backend spike.
- `nlohmann/json` for production JSON parsing and typed model decoding.
- SQLite for cache metadata.
- Qt for Qt/QML UI and possibly Qt Network backend.
- QtKeychain or platform credential libraries for secure token storage.
- Crash/logging libraries such as spdlog and possibly crashpad later.

The dependency strategy must preserve the current dependency-free mock build
while giving Windows, macOS, and Linux a reproducible path for real native
dependencies.

## 2. Decision Problem

This ADR answers:

- Should dependencies be managed by vcpkg, Conan, system packages,
  `FetchContent`, or vendoring?
- How should Windows/macOS/Linux CI install the same dependency graph?
- How can local development reproduce CI builds?
- How do we avoid breaking the no-dependency mock build?
- Should the project use a vcpkg manifest?
- Does the project need Conan profiles?
- Should Qt be managed by the same dependency manager?

## 3. Options Comparison

### Option A: vcpkg Manifest

Pros:

- Natural CMake integration through the vcpkg toolchain file.
- Strong Windows/MSVC experience, which matters for a P0 platform.
- Good GitHub Actions fit and straightforward local reproduction.
- Suitable for SDK/backend dependencies such as libcurl, `nlohmann-json`, and
  sqlite3.
- Manifest mode can keep dependencies explicit in repo metadata while keeping
  downloaded/build artifacts out of Git.

Cons:

- Requires bootstrap/setup in CI and local environments.
- Version baselines and overlays need maintenance.
- Building larger packages can add CI time.
- Qt via vcpkg can be heavy; the Qt/QML phase may still prefer the official Qt
  installer or aqtinstall.

### Option B: Conan

Pros:

- Mature C++ package manager with flexible profiles.
- Strong binary cache and remote package concepts.
- Good for complex multi-compiler dependency graphs.

Cons:

- Higher configuration complexity for the current small skeleton.
- Requires Conan profiles and more CI setup.
- Local developer onboarding is heavier than the immediate project needs.
- Adds another package-manager model before the SDK has real native
  dependencies.

### Option C: System Packages

Pros:

- Simple on Linux.
- No extra package manager on machines where dependencies are already
  installed.
- Useful as an emergency local fallback.

Cons:

- Inconsistent across Windows, macOS, and Linux.
- Versions drift by runner image and developer machine.
- Harder to reproduce CI locally.
- Windows packaging and linking are not solved.
- Not suitable as the primary strategy for cross-platform SDK dependencies.

### Option D: CMake FetchContent

Pros:

- CMake-native.
- Convenient for small header-only dependencies.
- Easy to prototype a single library quickly.

Cons:

- Default builds can unexpectedly download from the network.
- Version decisions become scattered across CMake files.
- Poor fit for libcurl, Qt, SQLite, and packaging-sensitive native
  dependencies.
- Makes offline/reproducible CI behavior harder unless heavily constrained.

### Option E: Vendoring

Pros:

- Offline stable once committed.
- No package manager bootstrap.

Cons:

- Bloats the repository.
- Makes updates and security fixes harder.
- Creates ownership ambiguity for third-party source.
- Poor fit for libcurl, Qt, SQLite, and credential libraries.
- Conflicts with the current lightweight skeleton direction.

## 4. Recommended Decision

Use vcpkg manifest mode as the primary dependency strategy for SDK/backend
native dependencies.

Short term:

- Do not introduce actual dependencies in this ADR batch.
- Keep the current CMake mock build dependency-free.
- Add `vcpkg.json` in the next libcurl backend spike, not here.
- Keep `MRRIGHT_ENABLE_CURL_HTTP` default `OFF` until the libcurl backend and
  dependency path are explicitly implemented.

Next dependency batch:

- Add a vcpkg manifest for libcurl.
- Wire CMake to find libcurl only when the backend option is enabled.
- Keep `MockHttpClient` and SDK unit tests buildable without vcpkg.
- Document local builds with
  `-DCMAKE_TOOLCHAIN_FILE=<vcpkg-root>/scripts/buildsystems/vcpkg.cmake`.

Future dependencies:

- Manage libcurl, `nlohmann-json`, sqlite3, and similar SDK/backend libraries
  through vcpkg manifest mode.
- Evaluate Qt separately during the Qt/QML phase. Qt may use vcpkg, the
  official Qt installer, or aqtinstall depending on CI speed, package size,
  and deployment requirements.
- Avoid Conan unless vcpkg becomes insufficient for a concrete cross-platform
  dependency need.

## 5. CMake and CI Strategy

- `cpp-app` must continue to configure, build, and run tests without external
  dependencies by default.
- libcurl backend code must be gated behind a CMake option.
- If the option is disabled, CMake must not require libcurl or vcpkg.
- GitHub Actions can later bootstrap/cache vcpkg and run a separate dependency
  build path for Windows, macOS, and Linux.
- Local development should mirror CI by using the same vcpkg manifest and
  toolchain file.
- Do not commit dependency build outputs, `vcpkg_installed/`, package caches,
  or generated binaries.
- Dependency updates should be explicit commits with verification notes.

## 6. Security and Maintainability

- Do not vendor large third-party source trees into this repository.
- Do not store tokens, secrets, credentials, or production URLs in dependency
  configuration.
- Do not make dependency installation access production services.
- Lock dependency baselines once a manifest is introduced, and review updates
  as normal code changes.
- Keep dependency changes separate from feature implementation when practical,
  especially for security-sensitive libraries.
- If a dependency has platform-specific TLS or credential behavior, document
  that behavior before using it for auth, download, or token storage.

## 7. Decision Outcome

Status: Accepted.

Current batch outcome:

- Do not change CMake dependency wiring in this ADR batch.
- Do not add `vcpkg.json` yet.
- Do not add Conan profiles.
- Do not add system package assumptions.
- Next backend batch should add the first vcpkg manifest alongside the optional
  libcurl backend spike.

## 8. What Not To Do

- Do not implement the libcurl backend in this ADR batch.
- Do not introduce Qt in this ADR batch.
- Do not introduce SQLite in this ADR batch.
- Do not replace `JsonValue.hpp` in this ADR batch.
- Do not commit third-party source or dependency build artifacts.
- Do not connect to a real API or production service.
- Do not change the existing C++ App Skeleton CI matrix except for future
  documentation or an explicit dependency-enabled job.
