# mrright.blog API Error Codes

Status: draft global error-code registry.

This document defines stable machine-readable API error codes. Web and future C++ clients must use these codes for control flow. Human-readable messages are for display and logging only.

## Error Envelope

All API errors should use:

```json
{
  "data": null,
  "pagination": {},
  "error": {
    "code": "STRING_CODE",
    "message": "human readable"
  }
}
```

Rules:

- `error.code` is stable and global.
- `error.message` can change without a client release.
- Clients must not parse or compare `error.message`.
- The server must set an HTTP status consistent with the error code.
- The server should avoid leaking internal implementation details in messages.

## Required Global Codes

These codes are mandatory for the API-first platform.

| Code | HTTP status | Meaning | Client behavior |
| --- | ---: | --- | --- |
| `AUTH_REQUIRED` | 401 | The endpoint requires an authenticated visitor or admin and no usable credential was supplied. | Show sign-in or admin-token prompt depending on client context. |
| `INVALID_TOKEN` | 401 | A token was supplied but is invalid, expired, malformed, or revoked. | Clear local session and ask user to sign in again. |
| `PROFILE_ADMIN_DISABLED` | 403 | An administrator disabled the public profile. | Show the administrator-disabled profile state. Do not offer user-side restore controls as a fix. |
| `RESOURCE_FORBIDDEN` | 403 | The resource exists, but the current actor is not allowed to access or modify it. | Hide or disable the action; do not retry automatically. |
| `PROJECT_NOT_FOUND` | 404 | The requested project slug does not resolve to an available project. | Show project-not-found state. |
| `VALIDATION_ERROR` | 400 | The request body, query, upload, or path parameter is invalid. | Show field-level or request-level validation UI. |
| `RATE_LIMITED` | 429 | The actor has exceeded a request limit. | Back off and show a retry-after state if provided by headers. |

## Existing Codes To Preserve

Current implementation already uses these codes in some responses. They should be preserved and moved under the standard `error.code` envelope.

| Code | Suggested HTTP status | Current usage |
| --- | ---: | --- |
| `PROFILE_ADMIN_DISABLED` | 403 | Public profile, resources, posts, and activity endpoints. |
| `EMAIL_NOT_VERIFIED` | 403 | Login before email verification. |
| `HANDLE_TAKEN` | 409 | Account profile handle conflict. |

## Recommended Additional Codes

These are not mandatory for the first API-first pass, but they will reduce ambiguity for Web and native clients.

| Code | HTTP status | Use case |
| --- | ---: | --- |
| `SERVICE_UNAVAILABLE` | 503 | Optional store or subsystem is not configured. |
| `COMMUNITY_POST_NOT_FOUND` | 404 | Missing community post. |
| `COMMUNITY_COMMENT_NOT_FOUND` | 404 | Missing community comment. |
| `COMMUNITY_UPLOAD_NOT_FOUND` | 404 | Missing community upload/resource. |
| `VISITOR_NOT_FOUND` | 404 | Missing admin visitor record. |
| `DOWNLOAD_REQUEST_NOT_FOUND` | 404 | Missing download request. |
| `CONTACT_MESSAGE_NOT_FOUND` | 404 | Missing contact message. |
| `SLUG_CONFLICT` | 409 | Admin project slug already exists. |
| `UNSUPPORTED_FILE_TYPE` | 400 | Upload file type is not supported. |
| `FILE_TOO_LARGE` | 400 | Upload exceeds size limit. |

## Mapping From Current Responses

The current API often returns `{ "error": "message" }`. These should be migrated as follows.

### Authentication and Authorization

| Current condition | Target code |
| --- | --- |
| Missing visitor session for account endpoints | `AUTH_REQUIRED` |
| Invalid or expired visitor token | `INVALID_TOKEN` |
| Missing or invalid admin token for `/api/admin/*` | `AUTH_REQUIRED` or `INVALID_TOKEN` |
| Email not verified during login | `EMAIL_NOT_VERIFIED` |
| Visitor accounts store not configured | `SERVICE_UNAVAILABLE` |
| Admin data store not configured | `SERVICE_UNAVAILABLE` |

### Profile and Account

| Current condition | Target code |
| --- | --- |
| Public profile not found | `RESOURCE_FORBIDDEN` or future `USER_NOT_FOUND` |
| Public profile disabled by admin | `PROFILE_ADMIN_DISABLED` |
| Account profile validation failure | `VALIDATION_ERROR` |
| Handle already taken | `HANDLE_TAKEN` |
| Avatar/banner file missing | `VALIDATION_ERROR` |
| Avatar/banner file invalid or too large | `UNSUPPORTED_FILE_TYPE` or `FILE_TOO_LARGE` |

### Projects

| Current condition | Target code |
| --- | --- |
| Project not found | `PROJECT_NOT_FOUND` |
| Project comment body invalid | `VALIDATION_ERROR` |
| Download request body invalid | `VALIDATION_ERROR` |
| Visitor id missing for like request | `VALIDATION_ERROR` |
| Admin project slug invalid | `VALIDATION_ERROR` |
| Admin project slug exists | `SLUG_CONFLICT` |
| Admin project payload missing required fields | `VALIDATION_ERROR` |

### Community

| Current condition | Target code |
| --- | --- |
| Community store not configured | `SERVICE_UNAVAILABLE` |
| Posting without auth | `AUTH_REQUIRED` |
| Commenting without auth | `AUTH_REQUIRED` |
| Liking without auth | `AUTH_REQUIRED` |
| Community post not found | `COMMUNITY_POST_NOT_FOUND` |
| Community comment not found | `COMMUNITY_COMMENT_NOT_FOUND` |
| Community upload not found | `COMMUNITY_UPLOAD_NOT_FOUND` |
| Missing post title/message | `VALIDATION_ERROR` |
| Missing comment message | `VALIDATION_ERROR` |
| Missing upload file/title/description | `VALIDATION_ERROR` |

### Admin

| Current condition | Target code |
| --- | --- |
| Admin visitor not found | `VISITOR_NOT_FOUND` |
| Invalid visitor access level | `VALIDATION_ERROR` |
| Invalid profile visibility payload | `VALIDATION_ERROR` |
| Invalid profile moderation fields | `VALIDATION_ERROR` |
| Invalid community upload status | `VALIDATION_ERROR` |
| Invalid download request status | `VALIDATION_ERROR` |
| Admin upload missing file | `VALIDATION_ERROR` |
| Admin upload too large | `FILE_TOO_LARGE` |

## HTTP Status Rules

| Status | Use |
| ---: | --- |
| 400 | Request syntax or validation failed. |
| 401 | Authentication is required or token is invalid. |
| 403 | Authenticated or public actor is forbidden by policy. |
| 404 | Resource is not found or intentionally not revealed. |
| 409 | State conflict, such as duplicate slug or handle. |
| 429 | Rate limited. |
| 500 | Unexpected server bug. Do not use for known validation or permission failures. |
| 503 | Required backend service or optional store is unavailable. |

## Client Handling Rules

Web and C++ clients must:

- Read `error.code` first.
- Use HTTP status only for broad fallback handling.
- Treat `error.message` as display text only.
- Keep localized display copy client-side when needed.
- Avoid duplicate business permission logic.
- Clear local credentials only for `INVALID_TOKEN`, not for every 401 automatically unless the endpoint requires auth.

## Testing Requirements

Every API-first migration should add or update tests to verify:

- Known auth failures return `AUTH_REQUIRED` or `INVALID_TOKEN`, not raw string-only errors.
- Admin-disabled profiles return `PROFILE_ADMIN_DISABLED`.
- Project misses return `PROJECT_NOT_FOUND`.
- Validation failures return `VALIDATION_ERROR`.
- Query parameters do not trigger 500.
- No response leaks sensitive token, password, session, or verification fields.
