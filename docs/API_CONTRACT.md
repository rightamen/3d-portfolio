# mrright.blog API Contract

Status: draft target contract for API-first migration.

This document defines the stable API shape that the Web client and future C++ native clients should consume. It is a target contract, not a statement that every current endpoint already follows it. Current drift and follow-up migration work are listed below.

## Goals

- Make every API response predictable for Web, C++ native, and future clients.
- Keep business decisions on the server, especially authentication, authorization, profile visibility, and asset access.
- Stop client logic from depending on human-readable error messages.
- Provide stable pagination, resource, error, and asset shapes.
- Allow the current Web app to migrate incrementally without breaking production.

## Response Envelope

Every JSON API response should use this top-level shape:

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

For successful non-paginated responses:

```json
{
  "data": {
    "project": {}
  },
  "pagination": {},
  "error": null
}
```

For successful paginated responses:

```json
{
  "data": {
    "items": []
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "pages": 1,
    "hasNext": false,
    "hasPrevious": false
  },
  "error": null
}
```

For errors:

```json
{
  "data": null,
  "pagination": {},
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Please sign in to continue."
  }
}
```

Rules:

- `data` is always present.
- `pagination` is always present. Use `{}` when the endpoint is not paginated.
- `error` is always present. Use `null` on success.
- `error.code` is the only stable machine-readable error signal.
- `error.message` is human-readable and may change. Web and native clients must not branch on it.
- HTTP status remains meaningful and must match the error class.

## Pagination Contract

Paginated endpoints should use the same query names:

```text
page
limit
query
sort
```

Additional filters are endpoint-specific but must be documented and validated server-side.

Pagination response:

```json
{
  "page": 1,
  "limit": 20,
  "total": 120,
  "pages": 6,
  "hasNext": true,
  "hasPrevious": false
}
```

Rules:

- `page` is 1-based.
- `limit` must have a server-side maximum.
- Unknown or invalid filters must not cause 500 responses.
- Invalid filters should either normalize to defaults or return `VALIDATION_ERROR`.
- Pagination belongs at top-level `pagination`, not inside `data`.

## Authentication Contract

Bearer token header:

```text
Authorization: Bearer <token>
```

Client types:

- Public clients: no token, read public content only.
- Visitor clients: visitor session token, used by Web account pages and future C++ App.
- Admin client: admin token, only used by Web admin tools and server-side operations. Admin logic must not be embedded in the regular native App.

Rules:

- Missing required visitor token returns `AUTH_REQUIRED`.
- Invalid or expired visitor token returns `INVALID_TOKEN`.
- Missing or invalid admin token returns `AUTH_REQUIRED` or `INVALID_TOKEN`, depending on what the server can safely distinguish.
- Clients must not attempt to infer permissions from local state only.
- All permission decisions must be enforced by the backend.

## Endpoint Groups

### Health

Current:

```text
GET /api/health
```

Target:

```json
{
  "data": {
    "ok": true,
    "service": "mrright-portfolio"
  },
  "pagination": {},
  "error": null
}
```

### Auth

Current:

```text
GET  /api/auth/me
POST /api/auth/register
POST /api/auth/resend-verification
POST /api/auth/login
POST /api/auth/verify-email
POST /api/auth/logout
```

Target data keys:

```text
user
session
verification
ok
```

Migration needs:

- Wrap all current `{ user }`, `{ session, user }`, `{ verification }`, and `{ ok }` responses in `data`.
- Convert string-only auth errors to stable error codes.
- Keep development-only verification code behavior out of production responses.

### Public Site Content

Current:

```text
GET /api/profile
GET /api/projects
GET /api/projects/:slug
GET /api/projects/:slug/interactions
GET /api/experience
```

Target data keys:

```text
profile
skills
projects
project
comments
likeCount
experience
```

Migration needs:

- Convert `PROJECT_NOT_FOUND` cases from `{ error: "Project not found." }` to envelope errors.
- Keep project assets in an App-ready shape with explicit model and image asset fields over time.

### Project Interactions

Current:

```text
POST /api/projects/:slug/like
POST /api/projects/:slug/comments
POST /api/projects/:slug/download-requests
```

Target data keys:

```text
liked
likeCount
comment
request
access
ok
```

Migration needs:

- Return `PROJECT_NOT_FOUND` for unknown projects.
- Return `VALIDATION_ERROR` for invalid visitor id, author, message, name, email, or purpose.
- Keep access decisions in the server response so clients do not duplicate policy logic.

### Community

Current:

```text
GET    /api/community/uploads
POST   /api/community/uploads
GET    /api/community/posts
POST   /api/community/posts
GET    /api/community/posts/:id
GET    /api/community/posts/:id/comments
POST   /api/community/posts/:id/comments
POST   /api/community/comments/:id/like
DELETE /api/community/comments/:id
```

Target data keys:

```text
uploads
posts
post
comments
comment
result
ok
```

Migration needs:

- Convert not-found cases to stable codes. Use `RESOURCE_FORBIDDEN` for private or unauthorized resources.
- Uploaded resources should expose an `asset` object matching the Asset Model.
- Upload errors must use `VALIDATION_ERROR` where the request is malformed or unsupported.

### Account

Current:

```text
GET    /api/account/profile
PUT    /api/account/profile
POST   /api/account/avatar
POST   /api/account/banner
GET    /api/account/community
GET    /api/account/downloads
GET    /api/account/comments
DELETE /api/account/community/uploads/:id
DELETE /api/account/community/posts/:id
```

Target data keys:

```text
profile
avatar
banner
posts
uploads
requests
comments
likeCount
ok
```

Migration needs:

- Convert all auth failures to `AUTH_REQUIRED` or `INVALID_TOKEN`.
- Convert profile validation errors to `VALIDATION_ERROR`.
- Convert handle conflicts to a stable conflict code, such as `HANDLE_TAKEN`.
- Account avatar and banner uploads should return an `asset` object in addition to compatibility fields during migration.

### Public User Profiles

Current:

```text
GET /api/users/:handle
GET /api/users/:handle/resources
GET /api/users/:handle/posts
GET /api/users/:handle/activity
```

Target data keys:

```text
profile
resources
posts
comments
```

Required behavior:

- Admin-disabled profiles return `PROFILE_ADMIN_DISABLED`.
- Private profiles return a minimal profile object, not hidden internal fields.
- Public profile resources and activity are filtered server-side.

Migration needs:

- Convert not-found profile responses to a stable code, for example `RESOURCE_FORBIDDEN` for hidden/private access and a future `USER_NOT_FOUND` if introduced.
- Keep `PROFILE_ADMIN_DISABLED` stable. This is already used by the Web client and E2E tests.

### Admin

Current:

```text
GET    /api/admin/summary
GET    /api/admin/comments
GET    /api/admin/likes
GET    /api/admin/contact-messages
GET    /api/admin/download-requests
GET    /api/admin/projects
GET    /api/admin/visitors
GET    /api/admin/visitors/:id
GET    /api/admin/visitors/:id/comments
GET    /api/admin/visitors/:id/posts
GET    /api/admin/visitors/:id/uploads
GET    /api/admin/visitors/:id/download-requests
GET    /api/admin/visitors/:id/actions
PATCH  /api/admin/visitors/:id
PATCH  /api/admin/visitors/:id/email-verification
PATCH  /api/admin/visitors/:id/profile-visibility
PATCH  /api/admin/visitors/:id/profile-moderation
DELETE /api/admin/visitors/:id
GET    /api/admin/community-uploads
GET    /api/admin/community-posts
GET    /api/admin/community-comments
PATCH  /api/admin/community-uploads/:id
POST   /api/admin/uploads
POST   /api/admin/projects
PATCH  /api/admin/projects/:slug
DELETE /api/admin/projects/:slug
PATCH  /api/admin/download-requests/:id
DELETE /api/admin/comments/:id
DELETE /api/admin/contact-messages/:id
DELETE /api/admin/download-requests/:id
DELETE /api/admin/community-uploads/:id
DELETE /api/admin/community-posts/:id
DELETE /api/admin/community-comments/:id
```

Target data keys:

```text
summary
comments
likes
messages
requests
projects
visitors
visitor
recentActions
items
upload
file
asset
conversion
deleted
ok
```

Migration needs:

- Admin endpoints should use the same envelope even though they are Web-only.
- Admin visitor pagination already has a good `pagination` object but needs top-level envelope migration.
- Admin upload responses should adopt the Asset Model.
- Admin moderation and audit operations must keep server-side authorization and audit writing.

## Current Response Drift

The current implementation has these response styles:

| Style | Example | Migration target |
| --- | --- | --- |
| Success resource wrapper | `{ "project": {} }` | `{ "data": { "project": {} }, "pagination": {}, "error": null }` |
| Success list wrapper | `{ "projects": [] }` | `{ "data": { "projects": [] }, "pagination": {}, "error": null }` |
| Paginated list | `{ "visitors": [], "pagination": {} }` | `{ "data": { "visitors": [] }, "pagination": {}, "error": null }` |
| Boolean success | `{ "ok": true }` | `{ "data": { "ok": true }, "pagination": {}, "error": null }` |
| String error | `{ "error": "Project not found." }` | `{ "data": null, "pagination": {}, "error": { "code": "PROJECT_NOT_FOUND", "message": "Project not found." } }` |
| Mixed code error | `{ "code": "PROFILE_ADMIN_DISABLED", "error": "..." }` | `{ "data": null, "pagination": {}, "error": { "code": "PROFILE_ADMIN_DISABLED", "message": "..." } }` |

## Migration Plan

Recommended implementation order:

1. Add server response helpers only:
   - `sendData(response, data, status = 200)`
   - `sendPage(response, data, pagination, status = 200)`
   - `sendError(response, code, message, status = 400)`
2. Add compatibility-aware client parsing in `src/lib/api.js`:
   - Prefer envelope when present.
   - Fall back to legacy payload during migration.
3. Convert low-risk read-only endpoints first:
   - `/api/health`
   - `/api/profile`
   - `/api/projects`
   - `/api/projects/:slug`
   - `/api/experience`
4. Convert auth and account endpoints.
5. Convert public user profile endpoints.
6. Convert community and project interaction endpoints.
7. Convert admin endpoints.
8. Update Playwright tests to assert the envelope for migrated endpoints.
9. Remove legacy parsing only after all clients are migrated.

## Native Client Rules

Future C++ clients should:

- Treat the envelope as mandatory.
- Branch only on `error.code`, HTTP status, and typed `data` fields.
- Never branch on `error.message`.
- Never store or use admin tokens.
- Never directly access the database.
- Cache assets using `url`, `checksum`, `size`, and `createdAt`.
- Expect permissions to be determined by server responses, not local heuristics.
