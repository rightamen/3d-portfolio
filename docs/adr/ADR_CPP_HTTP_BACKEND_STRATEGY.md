# ADR: C++ SDK HTTP Backend Strategy

Date: 2026-07-05

Status: Accepted

## 1. Background

The C++ SDK already has the first network abstraction layer:

- `sdk/network/HttpClient.hpp` defines `HttpRequest`, `HttpResponse`, and the
  `HttpClient::send()` interface.
- `MockHttpClient` drives unit tests without network I/O.
- `RealHttpClient` exists as a replaceable placeholder and currently returns
  `REAL_HTTP_BACKEND_NOT_ENABLED`.
- `ApiClient` constructs `/api/v1`-only requests, rejects legacy `/api/*`
  paths, and rejects admin paths.
- `EnvelopeParser` decodes only the strict `/api/v1` envelope and rejects
  legacy top-level mirrors.
- There is currently no real HTTP backend.

The future native app must support Windows, macOS, and Linux. The SDK should
remain testable as a CLI/library layer before Qt/QML UI integration, while the
eventual Qt app should still be able to provide a Qt-native backend.

## 2. Decision Problem

This ADR answers:

- Should SDK core depend directly on Qt?
- Should the first real backend use libcurl?
- Should the project wait until the Qt/QML phase and use Qt Network first?
- Does the SDK need multiple backend implementations?
- How do business clients avoid depending on a concrete network library?
- Where should tokens, headers, timeouts, and error mapping live?

## 3. Options Comparison

### Option A: libcurl Backend First

Pros:

- Mature cross-platform HTTP/TLS stack.
- Does not depend on Qt UI or Qt event loop.
- Fits SDK core, CLI smoke tests, and non-UI SDK use.
- Easier to run in CI and unit/integration test contexts without UI.
- Supports TLS, headers, timeouts, upload, and download primitives needed for
  future Range / ETag / resume work.

Cons:

- Adds a native C/C++ dependency.
- Windows/macOS/Linux linking and packaging need explicit handling.
- CMake integration must choose `find_package`, vcpkg, or Conan clearly.
- Future Qt event-loop integration needs an async boundary rather than leaking
  blocking calls into UI code.

### Option B: Qt Network Backend First

Pros:

- Natural integration for the future Qt/QML app.
- Matches Qt event loop, signals/slots, and `QNetworkAccessManager`.
- Packaging can align with the rest of the Qt runtime.

Cons:

- Makes SDK core depend on Qt too early if used as the only backend path.
- Makes CLI, unit tests, and non-UI SDK use heavier.
- Weakens the current SDK/UI separation.
- The project is not yet in the Qt/QML phase, so this is early coupling.

### Option C: Keep Placeholder Until UI Phase

Pros:

- Zero new dependency.
- Safest current build path.
- Avoids premature technology lock-in.

Cons:

- SDK cannot perform real HTTP.
- Blocks end-to-end API smoke tests from the C++ layer.
- Keeps the prototype at the mock-only stage longer than necessary.

### Option D: Keep `HttpClient` Abstraction, Implement libcurl First, Add Qt Later

Pros:

- Business clients depend only on `HttpClient`, not libcurl or Qt.
- Satisfies CLI/SDK/API smoke needs before UI work.
- Lets the future Qt app swap in `QtHttpClient` without changing typed clients.
- Matches the existing `HttpClient` interface and `RealHttpClient`
  placeholder design.

Cons:

- The project may maintain two backend implementations.
- Backend-level error mapping must be unified.
- Capability differences must be hidden or modeled consistently.

## 4. Recommendation

Choose Option D.

Short term:

- Keep `HttpClient` as the only dependency of business clients.
- Keep `RealHttpClient` as a placeholder in this ADR batch.
- Implement an optional libcurl backend in the next backend spike.
- Gate libcurl through CMake, with `MRRIGHT_ENABLE_CURL_HTTP` remaining default
  safe for no-dependency mock builds until dependency management is settled.
- Do not make SDK core depend on Qt.
- Defer Qt Network to the Qt/QML UI prototype phase as a second backend.

Medium term:

- Manage libcurl with vcpkg manifest mode or Conan, not vendored binaries.
- Validate Windows/macOS/Linux CI matrix for configure, build, CTest, and a
  no-production real API smoke path.
- Point real API smoke tests at a local/dev server through `baseUrl`, never at
  production by default.

Long term:

- Qt/QML app code may use a `QtHttpClient` backend.
- CLI and SDK tests may continue using libcurl or `MockHttpClient`.
- Download manager work can extend the same backend boundary for Range, ETag,
  retry, resume, and cancellation semantics.

## 5. Backend Boundary

`ApiClient` owns:

- Constructing `/api/v1` paths.
- Rejecting legacy `/api/*` paths.
- Rejecting admin paths.
- Setting common headers.
- Injecting the in-memory bearer token header when configured.
- Applying `baseUrl`, `apiPrefix`, `timeoutMs`, and `userAgent` configuration.

`HttpClient` backends own:

- Sending `HttpRequest`.
- Returning `HttpResponse`.
- Mapping transport failures into backend-level `ApiError` values.
- Respecting timeout and transport configuration provided by the caller.

`HttpClient` backends must not:

- Parse business JSON.
- Know about Project, User, Community, or other API models.
- Persist tokens.
- Decode the strict response envelope.

`EnvelopeParser` owns:

- Strict `/api/v1` envelope decoding.
- `ApiError` and `Pagination` parsing.
- Preserving unknown API error-code strings.
- Rejecting legacy mirror shapes.

Typed clients own:

- Combining `ApiClient`, `HttpClient`, and `EnvelopeParser`.
- Returning `ApiResult<T>`.
- Avoiding direct dependencies on libcurl or Qt.
- Avoiding full URL construction outside `ApiClient`.

## 6. Error Mapping

Backend/network errors are local transport failures and do not come from the
server envelope. Expected examples:

- `NETWORK_NOT_IMPLEMENTED`
- `REAL_HTTP_BACKEND_NOT_ENABLED`
- `NETWORK_UNAVAILABLE`
- `REQUEST_TIMEOUT`
- `TLS_ERROR`
- `CONNECTION_FAILED`

API errors come from the `/api/v1` response envelope:

- The source is `error.code` in the strict envelope.
- The original code string must be preserved.
- Unknown codes map to `ApiErrorCode::Unknown` without losing the raw string.
- Business logic should branch on stable code/http status, not message text.

## 7. Security

- Tokens are provided only through in-memory `ApiClientConfig` or a future
  `TokenStore` abstraction.
- `HttpClient` implementations must not persist tokens.
- Plaintext token storage in config files is forbidden.
- Logs must never print `Authorization` headers or bearer tokens.
- Default configuration must not hard-code or contact the production domain.
- Real API smoke tests must default to a local/dev server supplied by `baseUrl`.

## 8. CMake and Dependency Strategy

- `MRRIGHT_ENABLE_CURL_HTTP` currently defaults to `OFF`.
- Introducing libcurl must not break the dependency-free mock build.
- Use vcpkg manifest mode or Conan for libcurl; do not vendor libcurl.
- Windows/macOS/Linux CI must cover the selected dependency path.
- If libcurl is unavailable, `MockHttpClient` and SDK unit tests must still
  configure, build, and run.
- CMake should make backend availability explicit instead of silently choosing
  a partial transport implementation.

## 9. Decision Outcome

Status: Accepted.

Current batch outcome:

- Do not implement a real backend in this ADR batch.
- Keep `RealHttpClient` as the no-network placeholder.
- Next backend batch should implement a libcurl backend spike behind the
  existing `HttpClient` interface.
- Qt Network backend is postponed to the Qt/QML prototype phase.

## 10. What Not To Do

- Do not implement libcurl in this ADR batch.
- Do not implement Qt Network in this ADR batch.
- Do not develop UI.
- Do not implement the download manager.
- Do not implement secure `TokenStore` providers here.
- Do not access a real API or production service by default.
- Do not add production configuration.
- Do not support legacy `/api/*` or admin endpoints from the C++ SDK.
