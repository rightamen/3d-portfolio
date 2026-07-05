# ADR: C++ SDK JSON Parsing Strategy

Date: 2026-07-05

Status: Accepted

## 1. Background

The C++ SDK currently targets only the strict `/api/v1/*` response contract.
Every API response must be decoded through the v1 envelope:

```json
{
  "data": {},
  "pagination": {},
  "error": null
}
```

The first SDK prototype added `JsonValue.hpp` as a dependency-free parser so
that `EnvelopeParser.hpp`, `MockHttpClient`, and typed clients could be tested
without Qt, libcurl, a Node server, or a package manager. That was useful for
early contract tests, but it is not a production JSON strategy.

The SDK core should stay independent from UI frameworks. Future Qt/QML code can
convert SDK models at the UI boundary, but JSON parsing for API contracts should
not require the UI layer.

## 2. Current JsonValue Parser Limitations

`cpp-app/sdk/core/JsonValue.hpp` is temporary prototype code. Its limits are
intentional:

- It only covers the JSON shapes used by current strict-envelope fixtures.
- Unicode escape handling is a placeholder and does not implement full UTF-16
  decoding or normalization.
- Number parsing stores values as `double`, which is not a complete long-term
  representation for typed API models.
- It has no streaming, schema validation, source location diagnostics, or
  mature edge-case coverage.
- It should not grow into a local production JSON library.

The parser may remain in the tree only while it is isolated behind
`EnvelopeParser.hpp` and typed model decoders.

## 3. Options Comparison

| Option | Cross-platform | CMake integration | Dependency size | Header-only convenience | Qt/QML compatibility | OpenAPI typed model fit | SDK core suitability | Windows/macOS/Linux CI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Keep current `JsonValue` parser | Excellent because it uses only the standard library | Already integrated | Very small | Yes | No conflict | Weak; too limited for real generated or hand-written model decoding | Acceptable only for early prototype tests | Excellent |
| `nlohmann/json` | Excellent; widely used on all target platforms | Straightforward through vcpkg, Conan, or a controlled CMake package | Moderate single-library dependency | Yes | No conflict; Qt conversion can stay at UI boundary | Strong DOM API and `from_json`/`to_json` mapping for typed models | Good fit for SDK core without UI dependencies | Good, if dependency manager/cache is explicit |
| Boost.JSON | Excellent | Easy if Boost is already required; heavier if it is only for JSON | Larger ecosystem dependency | No, requires Boost components | No conflict | Strong enough, but more verbose and heavier for this SDK stage | Technically good, strategically heavier than needed | Good, but CI dependency setup is heavier |
| Qt JSON | Excellent wherever Qt is present | Easy after Qt is installed | Tied to Qt runtime/modules | No | Native fit for Qt/QML | Usable, but would make core API parsing depend on Qt types | Poor for SDK core now; acceptable at UI/network boundary later | Good only after Qt CI is introduced |
| simdjson | Excellent | Reasonable with package manager | Moderate | No | No conflict | Best for high-throughput parsing, less ergonomic for small typed model mapping | Overkill for current envelope/client phase | Good after dependency strategy exists |

## 4. Decision

Short term: keep the current `JsonValue` parser as an internal temporary parser
for early SDK prototype tests only. Do not expand it into a production JSON
library and do not scatter JSON parsing into business clients.

Long term: adopt `nlohmann/json` through the future C++ dependency management
strategy, preferably vcpkg manifest mode or Conan after the project finalizes
the C++ dependency baseline. Do not vendor a large header and do not use
network-backed CMake `FetchContent` as a required default path.

This decision keeps the current build offline and dependency-free while giving
the SDK a clear migration target.

## 5. Short-Term Implementation Strategy

- Keep `JsonValue.hpp` in `sdk/core` as temporary prototype infrastructure.
- Keep `EnvelopeParser.hpp` as the single JSON boundary for strict `/api/v1`
  response envelopes.
- Keep typed clients focused on request construction and typed result decoding;
  they should not contain ad hoc JSON parsing logic.
- Keep CMake unchanged for this batch. Default builds must not fetch packages
  or require system JSON libraries.
- Continue validating behavior with `MockHttpClient` and fixed strict-envelope
  test fixtures.

## 6. Long-Term Implementation Strategy

- Introduce `nlohmann/json` only after the C++ dependency manager decision is
  implemented for CI and local development.
- Replace `JsonValue` parsing behind the existing `EnvelopeParser` boundary so
  business clients keep the same high-level API.
- Add typed model decode helpers for API models that preserve nullable fields
  with `std::optional`, arrays with `std::vector`, and unknown error-code
  strings.
- Compare OpenAPI-generated model/client output as a spike, but keep the SDK
  hand-written unless generation quality proves maintainable.
- Re-evaluate `simdjson` only if large asset manifests or bulk cache sync make
  JSON parsing a measured bottleneck.

## 7. CMake, CI, and SDK Model Impact

- This batch adds no new CMake dependency and does not change the default
  `cpp-app` build.
- Current Windows/macOS/Linux CI can continue building without network package
  downloads or Qt/libcurl.
- A future `nlohmann/json` migration should be added through the same C++
  dependency management mechanism used for other SDK dependencies.
- SDK model headers remain standard-library C++20 types. The JSON library is an
  implementation detail behind decoding helpers, not part of model ownership.
- Qt/QML integration remains free to use Qt JSON types internally, but SDK core
  responses should convert to SDK models before reaching UI code.

## 8. What Not To Do

- Do not make SDK core depend on Qt JSON just because the future UI will use Qt.
- Do not require libcurl, Qt, or network access to build JSON parsing tests.
- Do not commit a vendored copy of a large third-party JSON header in this
  batch.
- Do not use CMake `FetchContent` in a way that makes default local or CI builds
  fail when offline.
- Do not support legacy `/api/*` or admin endpoints through JSON parser work.
- Do not move JSON parsing into `AuthClient`, `ProjectClient`, or
  `CommunityClient`; keep `EnvelopeParser` as the boundary.
