# API v1 Gaps

Status: living document. Tracks every place `docs/openapi/api-v1.yaml` could
not fully commit to a field, shape, or endpoint boundary without either
guessing or requiring a DB-backed sample this repo doesn't yet have wired up.
Nothing in the OpenAPI spec fabricates a field — where a shape was uncertain,
the spec either omits the field or points here.

Companion: `docs/API_V1_MODEL_MAPPING.md` (TS/C++ model mapping),
`docs/API_V1_FREEZE_PLAN.md` (frozen contract + checklist).

## 1. Endpoints missing a DB-backed sample

These routes are wired and tested for auth/error paths in
`tests/api/contract.spec.js`, but their 200-success payload shape has not
been asserted field-by-field against a real Postgres row in
`tests/api/contract.db.spec.js`:

- `POST /api/v1/community/comments/{id}/like` — `toggleCommentLike` return
  value is passed straight through via `sendData(response, result)` (see
  server/index.js). The exact field names of `result` (likely `liked` /
  `likeCount`, mirroring the project-level toggle) are not yet pinned by a
  DB-backed test. **Action**: add a `contract.db.spec.js` case that creates a
  comment, toggles its like, and asserts the exact key set.
- `GET /api/v1/account/comments` — `interactionsStore.listUserComments(user.id)`
  row shape is not enumerated in the OpenAPI spec (marked as an opaque
  `object` there). **Action**: DB-backed sample + explicit schema.
- `GET /api/v1/profile` — static `server/content.js` `profile`/`skills`
  objects are stable but not yet field-enumerated in the spec (kept as loose
  `object`/array). Low priority: this is static site-owner content, not user
  data, and is unlikely to be consumed by the C++ App at all.
- `GET /api/v1/experience` — same as above (static content array, loose
  typing in the spec).

## 2. Admin routes not fully enumerated in the OpenAPI spec

`docs/openapi/api-v1.yaml` documents a representative subset of
`/api/v1/admin/*` (summary, visitors list, visitor detail,
profile-visibility) in full detail, tagged `Admin (Web-only)` /
`x-cpp-sdk: false`. The remaining ~25 admin handlers in `server/index.js`
follow the identical `requireAdmin` + strict-envelope pattern and are
**intentionally not each individually spec'd**, since:

1. None of them are C++ SDK surface (see §3/§9 of the freeze plan).
2. Duplicating ~25 near-identical admin CRUD operations into the spec adds
   maintenance weight without adding SDK value.

Full admin route inventory for reference (all Web-only, all
`x-cpp-sdk: false` if ever added to the spec):

- `GET /api/admin/comments`, `/likes`, `/contact-messages`,
  `/download-requests`, `/projects`, `/community-uploads`,
  `/community-posts`, `/community-comments`
- `GET /api/admin/visitors/{id}/{comments,posts,uploads,download-requests,actions}`
  (paginated sub-pages, `sendPage`)
- `PATCH /api/admin/visitors/{id}`, `/profile-moderation`,
  `/email-verification`; `DELETE /api/admin/visitors/{id}`
- `PATCH /api/admin/community-uploads/{id}`; `POST /api/admin/uploads`
  (multipart, includes model→GLB conversion)
- `POST /api/admin/projects`; `PATCH`/`DELETE /api/admin/projects/{slug}`
- `PATCH /api/admin/download-requests/{id}`;
  `DELETE /api/admin/{comments,contact-messages,download-requests,community-uploads,community-posts,community-comments}/{id}`

**If a future change makes any admin capability part of the C++ App** (it
should not — see freeze plan §3/§9), that endpoint must be pulled OUT of
"Web-only" and given full spec treatment plus its own auth model discussion,
not silently left under the admin token.

## 3. Asset / download fields still missing (blocks the unified Asset Model)

Per `docs/API_V1_FREEZE_PLAN.md` §7/§11 and `docs/CPP_APP_MIGRATION_PLAN.md`
§16, no endpoint today returns the frozen target Asset Model shape. Current
reality, field by field:

| Field | Community upload | Admin upload (`/api/admin/uploads`) | Project image/model | Avatar/banner |
| --- | --- | --- | --- | --- |
| stable `id` | ✅ (`upload.id`) | ❌ (no id, just `file.url`) | ❌ (embedded string only) | ❌ |
| `type` | ✅ (`fileType`: image\|model) | ✅ (`file.type`) | ❌ (implicit from field name) | ❌ (implicit) |
| `url` | ✅ (`fileUrl`) | ✅ (`file.url`) | ✅ (`image`/`modelUrl`) | ✅ (`avatarUrl`/`bannerUrl`) |
| `downloadUrl` (controlled) | ❌ | ❌ | ❌ | n/a (public assets) |
| `fileSize` | ✅ (owner/admin scope only) | ✅ (`file.size`) | ❌ | ❌ |
| `mimeType` | ❌ (only file extension) | ❌ | ❌ | ❌ |
| `checksum` (sha256) | ❌ | ❌ | ❌ | ❌ |
| `visibility` | ❌ (only `status`: pending/approved/rejected) | n/a | ❌ (only `isPublic`) | n/a |
| `downloadPolicy` (enum) | n/a | n/a | ❌ (free-text string today, not the frozen enum) | n/a |
| `version` / `etag` | ❌ | ❌ | ❌ | ❌ |

**Action** (tracked as freeze checklist #6/#7, not part of this batch):
design the controlled download endpoint (`GET /api/v1/assets/{id}/download`)
and the checksum/mimeType backfill plan before any Asset Model field is
frozen in the OpenAPI spec as stable.

## 4. `Project.downloadPolicy` is not yet the frozen enum

`server/content.js` and the admin project-override table store
`downloadPolicy` as free text (e.g. `"Authorization required"`, `"Open access"`)
that the server parses at request time via `getPolicyAccessLevel()` regex
matching (`server/index.js`). The OpenAPI spec documents `Project.downloadPolicy`
as a loose `string`, NOT the `public | member | approved | disabled` enum from
freeze plan §10/§11 — that enum does not exist in the data yet. Enum-izing
this is additive (checklist item, not yet scheduled) and must not change the
current regex-matched behavior until the migration is scripted.

## 5. Pagination gaps (tracked, not fixed this batch)

Per freeze plan §8, only `/api/admin/visitors` and its visitor detail
sub-pages return real `sendPage` pagination today. All of the following
return their full list with `pagination: {}` and are explicitly documented
as "not yet paginated" in the OpenAPI spec rather than inventing a pagination
shape that doesn't exist:

- `GET /projects`
- `GET /community/posts`
- `GET /community/uploads`
- `GET /account/downloads`
- `GET /account/comments`
- `GET /users/{handle}/resources|posts|activity`

## 6. Token lifecycle (freeze checklist #5, still open)

`bearerAuth` in the OpenAPI spec documents the transport (`Authorization:
Bearer <token>`) and the property that the server never returns a token it
can reverse (hash-only storage). It does **not** assert an expiry duration,
refresh flow, or revocation semantics, because `API_V1_FREEZE_PLAN.md` §9
explicitly lists these as an open decision, not yet written into the
contract. Do not add `expiresIn`/refresh fields to the spec until that
checklist item closes.

## 7. Endpoints intentionally excluded from the C++ SDK surface

Not gaps — deliberate boundaries, listed here so they're not mistaken for
missing coverage:

- All `/api/v1/admin/*` (see §2 above and freeze plan §3/§9). Web-only,
  authenticated by static `ADMIN_TOKEN`, `x-cpp-sdk: false`.
- Visitor **registration/email-verification UX** is in the SDK's `AuthClient`
  scope per `CPP_APP_MIGRATION_PLAN.md` §15, but the plan also notes the App
  may choose to defer registration/verification to an in-app browser rather
  than reimplement the flow — that product decision is out of scope for this
  contract-extraction batch and does not change the spec (the endpoints are
  documented either way since they exist and are usable).
