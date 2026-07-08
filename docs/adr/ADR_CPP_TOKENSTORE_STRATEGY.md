# ADR: C++ SDK TokenStore Strategy

Date: 2026-07-07

Status: Accepted

## 1. Background

The C++ SDK already has `AuthClient` methods for login, logout, and `me`, plus
`ApiClientConfig::bearerToken` for passing a visitor token into request
headers. At this stage, tokens are only held in process memory and passed to
typed clients explicitly.

Upcoming auth work needs a clear token boundary for login, `me`, logout, and a
future refresh/session flow. That boundary must not make unsafe storage the
default. Visitor tokens must not be written to ordinary JSON files, config
files, logs, progress notes, crash reports, or examples.

Admin credentials are not part of the C++ SDK. Admin endpoints remain Web-only,
and admin tokens must never enter the distributed native client.

## 2. Options

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| In-memory only | Simple, testable, no disk persistence, no platform dependency | Token is lost when the process exits; not sufficient for product sign-in | Use short term for tests and dev sessions only |
| Plain config file | Easy to implement and inspect | Stores bearer tokens in ordinary app data; high leak risk through backups, support bundles, or accidental commits | Forbidden |
| Encrypted local file | Can work without platform services and may help headless fallback cases | Key management is hard; weak designs become plaintext with extra steps; needs threat-model-specific design | Defer to a separate ADR only as a last-resort fallback |
| Windows Credential Manager | Native secure storage on Windows | Platform-specific implementation and error handling | Product target for Windows |
| macOS Keychain | Native secure storage on macOS | Platform-specific implementation and entitlement/sandbox details later | Product target for macOS |
| Linux Secret Service | Native desktop credential storage via GNOME Keyring/KWallet-compatible services | Not always available in headless/minimal environments; requires clear fallback behavior | Product target for Linux desktop |
| QtKeychain | Cross-platform abstraction over Windows Credential Manager, macOS Keychain, and Linux Secret Service | Adds Qt-era dependency and needs evaluation with the UI/toolchain plan | Evaluate during Qt/QML phase |

## 3. Decision

Short term:

- Keep the existing `TokenStore` interface.
- Add `MemoryTokenStore` for unit tests and development sessions.
- Keep `MemoryTokenStore` in memory only. It must not write files, read
  environment variables, print tokens, or perform network operations.

Product-level storage:

- Use platform secure credential backends:
  - Windows Credential Manager on Windows.
  - macOS Keychain on macOS.
  - Linux Secret Service on Linux desktop.
- Evaluate QtKeychain during the Qt/QML phase as a possible cross-platform
  implementation layer over those platform stores.

Explicitly rejected:

- Plain JSON/config-file token persistence is forbidden.
- A fallback encrypted local file is not approved in this ADR. It may only be
  considered later with a dedicated ADR that covers key management, user
  warnings, backup behavior, and log/crash redaction.

## 4. Security Rules

- Do not print `Authorization` headers.
- Do not write tokens to logs, diagnostics, or crash reports.
- Do not write tokens into `PROJECT_PROGRESS.md`.
- Do not store tokens in ordinary JSON, INI, YAML, TOML, or config files.
- Do not put real tokens in source code, docs, tests, examples, fixtures, or
  commit messages.
- Do not read tokens from `.env` in the C++ SDK.
- Do not persist visitor tokens unless a platform secure credential backend is
  in use.
- Do not add admin token support to the C++ SDK.
- Do not call admin endpoints from the C++ SDK.

## 5. Testing Strategy

- Unit tests may use fake token strings with `MemoryTokenStore`.
- MemoryTokenStore tests must not access the network or depend on platform
  credential services.
- Secure platform backend tests may compile/link the OS credential backend and
  use fake-token guarded runtime round-trips. If the OS credential session is
  unavailable in CI, tests must clearly skip instead of falling back to memory
  or plaintext storage.
- TokenStore tests must assert save/load/clear/overwrite behavior and keep all
  implementations file-free.

## 6. Future Work

- Keep hardening platform secure TokenStore implementations after the first
  Windows/macOS/Linux backend pass.
- Decide whether QtKeychain is the right implementation layer during the
  Qt/QML prototype phase.
- If Linux Secret Service is unavailable, design any fallback in a separate
  ADR before implementation.
