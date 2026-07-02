# mrright.blog Architecture

Status: architecture direction for API-first platform migration.

mrright.blog is moving from a Web application into an API-first platform that can support the current Web client and a future C++ native App. The website remains the priority product surface, but the backend API should become the long-lived contract.

## Current System

Current runtime shape:

```text
React / Vite / Three.js Web client
        |
        v
Node / Express API
        |
        v
PostgreSQL and file uploads
        |
        v
VPS: systemd service + nginx
```

Current major product areas:

- Public portfolio pages.
- Project listing and project detail.
- 3D model preview.
- Visitor account registration, login, verification, profile, downloads, comments.
- Public user profiles at `/u/:handle`.
- Community posts, comments, and uploads.
- Admin dashboard for comments, likes, contact messages, download requests, projects, community, and visitor management.
- Admin moderation for public profile visibility and profile field cleanup.
- Audit trail through `admin_user_actions`.

## Target Platform Shape

The platform should evolve toward:

```text
apps/web
  React Web client
  Public site
  Account center
  Admin dashboard

apps/native-cpp
  Future C++ App
  Visitor login
  Project browsing
  Asset cache
  Native 3D viewer

server
  Express API
  Auth
  Projects
  Visitors
  Public profiles
  Community
  Assets
  Admin
  Moderation
  Audit

shared-contracts
  API contract
  Error codes
  Asset model
  Permission model
```

The repository does not need to be physically reorganized immediately. This diagram is the architectural boundary to preserve while the website is completed.

## Core Principles

- API-first: Web and native clients consume the same server API.
- Backend authority: all authentication, authorization, visibility, moderation, and asset access decisions are made by the backend.
- Stable contract: response shape, error codes, pagination, and assets must be predictable.
- Client separation: the C++ App is a regular visitor client, not an admin client.
- Admin isolation: admin token and admin-only workflows remain in Web admin tools and server-side logic.
- No database clients: Web and native clients must never connect directly to PostgreSQL.
- No message-based logic: clients must not branch on human-readable error messages.
- Auditable operations: moderation and destructive admin operations must be written by the server to audit logs.

## API Boundary

All clients talk to the server through HTTP JSON APIs.

Required response envelope:

```json
{
  "data": {},
  "pagination": {},
  "error": {
    "code": "STRING_CODE",
    "message": "human readable"
  }
}
```

See:

- `docs/API_CONTRACT.md`
- `docs/API_ERRORS.md`

## Permission Model

Actors:

| Actor | Description | Token |
| --- | --- | --- |
| Public | Anonymous website or app visitor. | None |
| Visitor | Registered account user. | Visitor session token |
| Approved visitor | Visitor with elevated access level for downloads/resources. | Visitor session token |
| Admin | Site owner/operator. | Admin token, Web admin only |

Rules:

- Public clients can read only public content.
- Visitor clients can manage their own account, profile, comments, posts, uploads, and download requests.
- Approved visitor access is evaluated by the backend per resource or project policy.
- Admin operations require admin authorization and must not be available through the regular C++ App.
- `profile_admin_disabled` overrides user-controlled public profile settings.
- Public profile endpoints must enforce admin-disabled state server-side.
- Audit records must be created server-side for admin moderation actions.

## Asset Model

The Asset Model is the platform-level resource shape for images, models, textures, and downloadable files.

```json
{
  "id": "asset-id",
  "type": "image",
  "url": "/uploads/images/example.png",
  "thumbnailUrl": "/uploads/images/example-thumb.png",
  "size": 123456,
  "mimeType": "image/png",
  "checksum": "sha256:...",
  "visibility": "public",
  "downloadPolicy": "public",
  "createdAt": "2026-07-01T00:00:00.000Z"
}
```

Required fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable asset id. |
| `type` | string | yes | One of `image`, `model`, `texture`, `file`. |
| `url` | string | yes | Server-provided URL. Clients should not build paths manually. |
| `thumbnailUrl` | string or null | yes | Preview image when available. |
| `size` | number or null | yes | Size in bytes when known. |
| `mimeType` | string or null | yes | MIME type when known. |
| `checksum` | string or null | yes | Integrity value for native cache validation. Prefer SHA-256 once available. |
| `visibility` | string | yes | One of `public`, `private`, `unlisted`, `admin`. |
| `downloadPolicy` | string | yes | One of `public`, `member`, `approved`, `admin`, `disabled`. |
| `createdAt` | string | yes | ISO-8601 timestamp. |

Asset rules:

- Clients must use server-provided URLs.
- Download permission is determined server-side.
- Native clients may cache assets using `id`, `url`, `size`, `checksum`, and `createdAt`.
- Asset URLs should remain stable for a release, but clients must handle refreshed URLs.
- Model assets should prefer GLB/GLTF for cross-platform consumption.

Current implementation gaps:

- Project image/model fields are still embedded as project strings.
- Community uploads expose file-specific fields such as `fileUrl`, `fileSize`, and `fileType`.
- Admin uploads return `file` and `conversion`, not a normalized `asset`.
- Checksums are not currently exposed.
- MIME type is not consistently returned.

## Web Client Role

The Web client remains the primary product surface until the site is complete.

Responsibilities:

- Public portfolio and SEO-visible pages.
- Project detail and Web model preview.
- Account and public profile management.
- Community browsing and posting.
- Admin dashboard.
- Fast product iteration.

The Web client should gradually adopt the API envelope while keeping compatibility with legacy responses during migration.

## Future C++ Native App Role

The future C++ App should be a native visitor client, not a replacement for the website.

Recommended first scope:

- Visitor login.
- Project list.
- Project detail.
- Asset download.
- Local asset cache.
- Native model preview prototype.

Recommended later scope:

- Account profile.
- Download history.
- Favorites or saved projects.
- Offline browsing.
- Community reading.
- Community posting.
- Advanced 3D viewer and local studio workflows.

Suggested technical direction:

```text
Qt 6 + C++ + QML
```

Possible native modules:

```text
ApiClient
SessionManager
TokenStore
ProjectService
AssetService
AssetCache
ModelViewer
ErrorMapper
SQLiteCache
```

Native client restrictions:

- Do not embed admin token logic.
- Do not duplicate server permission decisions.
- Do not connect to the database.
- Do not infer file permissions from URLs alone.
- Use stable error codes and typed response data.

## Server Role

The server is the authority for:

- Authentication.
- Visitor session validation.
- Admin authorization.
- Project visibility.
- Public profile visibility.
- `profile_admin_disabled`.
- Download policy.
- Community ownership checks.
- Upload validation.
- Asset conversion and metadata.
- Moderation actions.
- Audit logs.

Future server improvements should focus on response helpers, error code normalization, and asset normalization before large feature additions.

## Current API Drift

The current API is production-usable but not yet API-first:

- Success responses use resource-specific top-level keys.
- Errors often use raw `{ error: "message" }`.
- Only some errors expose stable `code`.
- Pagination shape exists for admin visitors, but is not globally standardized.
- Upload responses are not normalized into the Asset Model.
- Frontend API client reads `payload.error` as message and `payload.code` separately.

These are expected migration targets, not blockers for the current site.

## Migration Phases

### Phase 1: Documentation and contract

Status: this document set.

- Define response envelope.
- Define global error codes.
- Define Asset Model.
- Mark current drift.
- Keep production behavior unchanged.

### Phase 2: Compatibility helpers

- Add server response helpers.
- Add client parser support for envelope plus legacy payload.
- Add tests for envelope helpers.
- Do not change all routes at once.

### Phase 3: Read-only API migration

- Migrate health, profile, projects, experience.
- Add E2E/API assertions for new envelope.
- Keep Web client compatibility.

### Phase 4: Auth and account migration

- Migrate auth responses.
- Migrate account profile, uploads, downloads, comments.
- Normalize auth errors.

### Phase 5: Public profile and community migration

- Migrate `/api/users/:handle` family.
- Migrate community posts/comments/uploads.
- Introduce normalized asset objects for uploads.

### Phase 6: Admin migration

- Migrate admin endpoints to envelope.
- Preserve existing admin token flow.
- Preserve audit behavior.
- Extend admin visitor E2E to assert envelope after migration.

### Phase 7: Native App prototype

- Build a small C++ client prototype against the stable API.
- Start with login, project list, project detail, asset download, and local cache.

## Non-goals For This Round

- No UI changes.
- No new business features.
- No database schema changes.
- No deployment.
- No authentication logic changes.
- No new dependencies.
- No C++ implementation yet.
