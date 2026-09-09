# mrright.blog Architecture

Status: architecture direction for API-first platform migration. Updated
2026-09-07, when the site stopped being one person's portfolio.

mrright.blog is moving from a Web application into an API-first platform that can support the current Web client and a future C++ native App. The website remains the priority product surface, but the backend API should become the long-lived contract.

⚠️ **The product changed shape on 2026-09-07.** It is no longer a personal 3D
portfolio with a community area attached; it is a marketplace where anyone
publishes works and, once phase 7 lands, sells them. The architecture below
still holds — the change is what the API is *about*, not how it is built. See
`docs/adr/ADR_PLATFORM_PIVOT.md` for the decisions and their reasoning.

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

- **The homepage is the marketplace front door**, not a portfolio. Its
  catalogue reads `/api/works` -- every creator's, not the owner's -- and it
  says publishing is open to whoever is looking. The owner's About,
  Experience and Contact moved to `/u/<their handle>` on 2026-09-09; the
  homepage is a place people arrive at, not a person's page.
- **The marketplace**: browse at `/explore`, one work at `/w/:handle/:slug`,
  a creator's works on their profile. Publishing runs draft → review →
  published, with multi-file assets, per-account storage quotas and
  magic-byte validation, and is driven from `/account/works`.
- **Discussion on a work**: threaded one level, sorted by top or newest,
  likeable, pinnable by the work's owner.
- **Selling**, creator-direct: a creator lists how they want to be paid, a
  buyer orders, pays the creator outside the platform, and the **creator**
  confirms receipt. Entitlement then grants a single-use download ticket.
- **Per-creator themes**: an accent colour and two presets, applied to that
  creator's own work pages and profile.
- 3D model preview, reached deliberately rather than mounted with the page.
- Visitor account registration, login, verification, profile, comments.
- Public user profiles at `/u/:handle`. The site owner's carries their About,
  Experience and Contact as well -- identified by matching the account's email
  against `server/content.js`, because the bundled record IS the owner and no
  second place can then disagree with it. Only a boolean leaves the server;
  the email never does.
- Community posts, comments, and uploads.
- Admin dashboard for comments, likes, contact messages, download requests,
  projects, works, community, and visitor management.
- Admin moderation for public profile visibility and profile field cleanup.
- Audit trail through `admin_user_actions`.

⚠️ **`/projects/:slug` is a redirect, not a page.** Since 2026-09-07 it 301s
to `/w/:handle/:slug` whenever a published work records that slug as its
source. It still renders the old page when no such work exists, which is what
makes the change reversible. Anything new that needs to link to a work must
use the work URL, not the project URL.

⚠️ **The download-request flow is dormant, not removed.** Production held zero
rows across `download_requests`, `download_tickets` and `download_events` when
the redirect shipped, so it was left in place for `/projects/:slug` rather than
rebuilt on the work page. Works use the same ticket machinery through a
different door: `createWorkDownloadTicket` / `consumeWorkDownloadTicket`.

⚠️ **The platform never holds money.** Payment happens between two people
outside the system, so there is no merchant account, no settlement, and no
refund the platform can force. What it has instead is evidence — an
append-only `order_events` table and a `payment_snapshot` of what the buyer
was shown — and the ability to suspend an account. Anything that assumes the
platform can move money is wrong about this system; see
`docs/adr/ADR_PLATFORM_PIVOT.md` §6 for what it would take to change that.

⚠️ **One question decides every download**: `ordersStore.hasEntitlement`. Free
works, the creator's own works, and paid works with a paid order all resolve
there. A new download path that does not ask it is a bug, not a shortcut.

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
  Projects (legacy catalogue, redirecting to Works)
  Works, work assets, work comments, work likes
  Orders, entitlement, order events
  Creators, themes, payment info
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

### Derivative images (2026-09-10)

Uploads used to be stored at whatever size they arrived and served at that size
everywhere. Measured against production on 2026-09-10, the catalogue's four
tiles pulled **15.31 MB** of full-size PNGs — one of them 8.47 MB — and the
creator avatar rendered into a 17px circle was **1.75 MB**. That, not the CSS,
was why the grid looked empty for its first few seconds.

`server/images.js` now renders every stored image through one of three named
profiles (`avatar` 512², `banner` 1920×480, `workThumb` 720 inside), always to
WebP, always without enlarging, always dropping metadata — an avatar is a public
file and EXIF on a phone photo carries GPS. After the backfill, the same
catalogue page is **108.5 KB**.

Two rules decide whether an original is replaced or kept:

| Kind | Storage | Original |
| --- | --- | --- |
| Profile avatar / banner | `multer.memoryStorage()`, decoded and resized in memory | Never written to disk at all, so there is nothing to orphan |
| Work cover (`preview` asset) | On disk, unchanged | **Kept byte-for-byte.** It is listed under "Files included" and a buyer downloads it. The derivative is a separate file in `works.thumbnail` |

Consequences worth knowing:

- `sharp` is a **runtime dependency**, not a dev one, and it ships native
  binaries. `npm ci --omit=dev` must run on the target platform — the deploy
  already does this on the VPS.
- `renderDerivative` refuses any format but JPEG/PNG/WebP *before* the full
  decode. The uploader checks the file name and the browser-declared type;
  sharp reads the bytes, so a HEIC image called `photo.png` reaches the decoder
  regardless, and sharp's high-severity advisories live in exactly the exotic
  decoders this site has no use for.
- `cover` and `withoutEnlargement` do **not** compose: asked for 1920×480 from a
  1200×960 source, sharp clamps the width and returns a 2.5:1 banner without
  erroring. A cover box therefore shrinks proportionally when the source cannot
  fill it. This shipped wrong once; the tests now pin it.
- `scripts/backfill-image-derivatives.mjs` does the same for rows that predate
  the pipeline. Report-only unless `--apply`; single-row updates by primary key;
  it never deletes or overwrites a file.

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
- The per-route `<head>` of every HTML response.

That last one is worth spelling out, because it is the one place the server
renders something other than JSON. The client is single-page, so the built
`dist/index.html` is the same file for every URL. `server/seo.js` rewrites its
head per path before it is sent — title, description, canonical, Open Graph,
Twitter card, `noindex` on the private areas — appends a JSON-LD `@graph`
describing what the page is, and a `<noscript>` body for crawlers that run no
JavaScript. It is not React SSR and deliberately so;
see `docs/adr/ADR_WEB_SEO_RENDERING_STRATEGY.md`. Visibility is enforced there
as well as in the API: a profile that is private or admin-disabled, and a
project whose `is_public` is false, never reaches the HTML.

`server/seo.js` keeps its own route table (`resolveRoute`), which has to stay in
step with the `<Routes>` in `src/App.jsx`. A public route added on one side and
not the other still renders — it just gets the generic head and a `noindex`,
silently.

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
