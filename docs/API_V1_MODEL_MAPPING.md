# API v1 Model Mapping (Web / TypeScript sketch / C++ SDK)

Status: derived from `docs/openapi/api-v1.yaml` (the source of truth for
field shapes) and the frozen contract in `docs/API_V1_FREEZE_PLAN.md`. This
document does not introduce new fields — it maps the same shapes across
three consumers: the current Web client, a TypeScript sketch (not adopted —
this repo stays JS), and the future C++ SDK.

Companion docs: `docs/API_V1_GAPS.md` (what's still missing/unverified),
`docs/CPP_APP_MIGRATION_PLAN.md` §15/§16 (SDK architecture context).

## 1. How the current Web client relates to the strict v1 envelope

`src/lib/api.js`'s `normalizeApiPayload` currently does this:

```js
const normalizeApiPayload = (payload) => {
  if (!isPlainObject(payload) || !hasOwn(payload, 'data') || !hasOwn(payload, 'error')) {
    return payload
  }
  if (isPlainObject(payload.data)) {
    return { ...payload.data, ...payload }   // <- spreads data keys AND legacy top-level keys
  }
  return payload
}
```

This works **only because today's Web client calls legacy `/api/*`**, whose
responses always carry both the envelope (`data`/`pagination`/`error`) and
the top-level legacy mirror (`withLegacyData` in `server/responses.js`). The
second spread (`...payload`) is what makes `payload.projects`,
`payload.profile`, etc. available directly — those keys only exist because
legacy mode put them there.

**If the Web client ever calls `/api/v1/*` directly, this function silently
degrades**: `payload.data` still spreads fine, but there is no top-level
mirror to spread a second time, so any code path relying on the top-level
mirror (rather than `.data.<key>`) would need to already be reading through
`normalizeApiPayload`'s first spread (`...payload.data`), which is the part
that still works with a strict envelope. In other words: `normalizeApiPayload`
happens to be v1-compatible for the `...payload.data` spread, but was written
assuming legacy's belt-and-suspenders mirror — it was never exercised against
a strict-only payload. No code change is proposed here (out of scope for
this batch — this is a documentation/contract-extraction pass only); this
section exists so a future "switch Web to v1" effort starts from an accurate
understanding instead of assuming `normalizeApiPayload` already works there.

**Conclusion**: Web stays on legacy `/api/*` until a dedicated migration
batch. The C++ SDK is the only `/api/v1/*` consumer for now.

## 2. TypeScript type sketch (documentation only — this repo is NOT adopting TypeScript)

These types exist to give the C++ model mapping (§3) an unambiguous
intermediate reference, and to give a future OpenAPI-generated-TS-types tool
(freeze plan §18) something to diff against. They are not committed as `.ts`
files and no build step changes.

```ts
// Envelope
interface ApiResponse<T> {
  data: T | null
  pagination: Pagination
  error: ApiError | null
}

interface ApiError {
  code: ApiErrorCode   // string union of the 26 API_ERROR_CODES values
  message: string
}

interface Pagination {
  page?: number
  limit?: number
  total?: number
  pages?: number
  hasNext?: boolean
  hasPrevious?: boolean
  // {} (all fields absent) for non-paginated endpoints — see API_V1_GAPS.md §5
}

// Domain models (fields per docs/openapi/api-v1.yaml components.schemas)
interface User {
  id: string
  email: string
  displayName: string
  accessLevel: 'guest' | 'member' | 'approved'
  emailVerified: boolean
  handle: string
  avatarUrl: string
  bannerUrl: string
  bio: string
  location: string
  website: string
  profilePublic: boolean
  activityPublic: boolean
  profileAdminDisabled: boolean
  createdAt: string   // ISO-8601
}

interface AccountProfile extends User {
  contactLinks: Record<string, { public: boolean; url: string; value: string }>
  contactsPublic: boolean
  publicEmail: string
  lastLoginAt: string | null
  updatedAt: string | null
  stats: {
    commentCount: number
    downloadRequestCount: number
    likeCount: number
    postCount: number
    uploadCount: number
  }
}

interface Project {
  slug: string
  title: string
  titleZh?: string
  titleEn?: string
  titleJa?: string
  summary: string
  workflow: string
  image: string
  modelUrl: string
  format: string
  modelSize: string
  downloadPolicy: string   // free text today — NOT yet the frozen enum, see API_V1_GAPS.md §4
  assetCategory: AssetCategory
  viewerFeatures: string[]
  stack: string[]
  year: string
  isPublic: boolean
  // no stable `id` distinct from `slug` yet — see API_V1_GAPS.md §3/CPP_APP_MIGRATION_PLAN.md §16
}

type AssetCategory =
  | 'generic'
  | 'next-gen-prop'
  | 'next-gen-character'
  | 'next-gen-scene'
  | 'hand-painted-character'
  | 'hand-painted-scene'

// Asset: NOT a unified model yet. This is the aspirational shape from
// API_V1_FREEZE_PLAN.md §11 — no endpoint returns exactly this today. See
// API_V1_GAPS.md §3 for the field-by-field gap table across upload types.
interface Asset {
  id: string
  type: 'image' | 'model' | 'texture' | 'file'
  url: string
  downloadUrl: string | null   // controlled download endpoint — not implemented yet
  thumbnailUrl: string | null
  fileSize: number | null
  mimeType: string | null      // not populated today (extension-based type only)
  checksum: string | null      // sha256:... — not populated today
  visibility: 'public' | 'private' | 'unlisted' | 'admin' | null
  downloadPolicy: 'public' | 'member' | 'approved' | 'disabled' | null
  createdAt: string
  version: string | null
  etag: string | null
  expiresAt: string | null
}

interface CommunityPost {
  id: string
  title: string
  message: string
  topic: 'general' | 'showcase' | 'help' | 'feedback'
  createdAt: string
  updatedAt: string
}

interface Comment {
  id: string
  postId?: string          // present on CommunityComment, absent on ProjectComment
  projectSlug?: string     // present on ProjectComment/PublicComment, absent on CommunityComment
  author: string
  message: string
  parentId?: string | null
  likeCount?: number
  liked?: boolean
  createdAt: string
  updatedAt?: string
}

interface DownloadRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  projectSlug: string
  projectTitle: string
  purpose: string
  visitorAccessLevel: 'guest' | 'member' | 'approved'
  createdAt: string
}

interface UploadError extends ApiError {
  // code is one of: VALIDATION_ERROR | INVALID_FILE_TYPE | FILE_TOO_LARGE | FILE_UPLOAD_ERROR
  // see server/responses.js describeUploadError
}
```

## 3. C++ model mapping

Struct sketch matching `docs/CPP_APP_MIGRATION_PLAN.md` §15 (`sdk/core/models/`).
One JSON shape → one struct, no client-side renaming.

```cpp
// sdk/core/models/envelope.h
template <typename T>
struct ResponseEnvelope {
  std::optional<T> data;      // nullopt on failure
  Pagination pagination;      // always present, possibly all-default
  std::optional<ApiError> error;
};

struct ApiError {
  std::string code;           // raw string preserved even if unknown to the enum below
  ApiErrorCode knownCode;      // enum value, or ApiErrorCode::Unknown
  std::string message;        // display only — never branch on this
};

enum class ApiErrorCode {
  AdminAuthRequired, AuthRequired, CommentNotFound, CommunityCommentNotFound,
  CommunityPostNotFound, CommunityUploadNotFound, ContactMessageNotFound,
  DownloadRequestNotFound, EmailAlreadyRegistered, EmailAlreadyVerified,
  EmailNotRegistered, EmailNotVerified, FileTooLarge, FileUploadError,
  HandleTaken, InternalError, InvalidFileType, InvalidToken,
  ProfileAdminDisabled, ProjectNotFound, ProjectSlugTaken, RateLimited,
  RequestBodyInvalid, ResourceForbidden, ServiceUnavailable, ValidationError,
  VisitorNotFound,
  Unknown,   // any future code not in this enum — client must not crash
};

// sdk/core/models/pagination.h
struct Pagination {
  std::optional<int64_t> page;
  std::optional<int64_t> limit;
  std::optional<int64_t> total;
  std::optional<int64_t> pages;
  std::optional<bool> hasNext;
  std::optional<bool> hasPrevious;
  // all nullopt for non-paginated endpoints (server sends {})
};

// sdk/core/models/user.h
struct User {
  std::string id;
  std::string email;
  QString displayName;         // user-facing text -> QString for Qt Quick binding
  AccessLevel accessLevel;     // enum: Guest, Member, Approved
  bool emailVerified;
  std::string handle;
  std::string avatarUrl;
  std::string bannerUrl;
  QString bio;
  QString location;
  std::string website;
  bool profilePublic;
  bool activityPublic;
  bool profileAdminDisabled;
  QDateTime createdAt;         // parsed from ISO-8601
};

struct AccountProfile : User {
  // contactLinks: map key -> {public, url, value}; QVariantMap is the
  // pragmatic Qt Quick-facing choice over a hand-rolled struct map, since
  // the key set (wechat/telegram/twitter/github/bilibili/youtube/artstation)
  // is server-defined and additive.
  QVariantMap contactLinks;
  bool contactsPublic;
  std::string publicEmail;
  std::optional<QDateTime> lastLoginAt;
  std::optional<QDateTime> updatedAt;
  struct Stats {
    int64_t commentCount = 0;
    int64_t downloadRequestCount = 0;
    int64_t likeCount = 0;
    int64_t postCount = 0;
    int64_t uploadCount = 0;
  } stats;
};

// sdk/core/models/project.h
struct Project {
  std::string slug;            // only stable identifier today — see gaps below
  QString title;
  QString summary;
  QString workflow;
  std::string image;
  std::string modelUrl;
  std::string format;
  std::string modelSize;
  std::string downloadPolicy;  // free text today, NOT the frozen enum — see API_V1_GAPS.md §4
  AssetCategory assetCategory;
  std::vector<QString> viewerFeatures;
  std::vector<QString> stack;
  std::string year;
  bool isPublic;
};

enum class AssetCategory {
  Generic, NextGenProp, NextGenCharacter, NextGenScene,
  HandPaintedCharacter, HandPaintedScene,
};

// sdk/core/models/asset.h — ASPIRATIONAL, not yet returned by any endpoint.
// Defined now so DownloadManager/CacheManager can be built against a stable
// target shape; every field must be std::optional until the server actually
// starts populating it (see API_V1_GAPS.md §3).
struct Asset {
  std::string id;
  enum class Type { Image, Model, Texture, File } type;
  std::string url;
  std::optional<std::string> downloadUrl;
  std::optional<std::string> thumbnailUrl;
  std::optional<int64_t> fileSize;
  std::optional<std::string> mimeType;
  std::optional<std::string> checksum;      // "sha256:..."
  std::optional<std::string> visibility;
  std::optional<std::string> downloadPolicy;
  QDateTime createdAt;
  std::optional<std::string> version;
  std::optional<std::string> etag;
  std::optional<QDateTime> expiresAt;
};

// sdk/core/models/community.h
struct CommunityPost {
  std::string id;
  QString title;
  QString message;
  std::string topic;   // general | showcase | help | feedback
  QDateTime createdAt;
  QDateTime updatedAt;
};

struct Comment {
  std::string id;
  std::optional<std::string> postId;        // CommunityComment only
  std::optional<std::string> projectSlug;   // ProjectComment / PublicComment only
  QString author;
  QString message;
  std::optional<std::string> parentId;
  std::optional<int64_t> likeCount;
  std::optional<bool> liked;
  QDateTime createdAt;
  std::optional<QDateTime> updatedAt;
};

// sdk/core/models/download.h
struct DownloadRequest {
  std::string id;
  enum class Status { Pending, Approved, Rejected } status;
  std::string projectSlug;
  QString projectTitle;
  QString purpose;
  AccessLevel visitorAccessLevel;
  QDateTime createdAt;
};

// --- Client-local models (never round-trip through the API; sdk/cache + sdk/download only) ---

struct LocalAsset {
  std::string assetId;
  std::string cacheKey;      // = checksum (sha256); do not invent a second hash name
  std::string localPath;
  int64_t fileSize;
  std::string checksum;
  QDateTime downloadedAt;
  QDateTime lastVerifiedAt;
  SyncStatus syncStatus;
};

struct DownloadTask {
  std::string taskId;
  std::string assetId;
  std::string url;
  std::string tempPath;      // ".part" file during Range-resumable download
  int64_t bytesTotal = 0;
  int64_t bytesDone = 0;
  enum class State { Queued, Running, Paused, Failed, Done } state;
  int retryCount = 0;
  std::optional<ApiError> error;
};

enum class SyncStatus { Synced, Stale, Downloading, Failed };
```

## 4. Field type mapping table

| JSON type | Web (JS) | TypeScript sketch | C++ |
| --- | --- | --- | --- |
| string | `string` | `string` | `std::string` (internal/identifiers) or `QString` (user-facing/UI-bound text) |
| number (integer) | `number` | `number` | `int64_t` |
| number (float) | `number` | `number` | `double` |
| boolean | `boolean` | `boolean` | `bool` |
| ISO-8601 datetime string | `string` (parsed ad hoc with `new Date()` where needed) | `string` | `QDateTime` (Qt Quick binding) or `std::chrono::system_clock::time_point` (pure `sdk/core`, no Qt) |
| nullable field | `value \| null` | `T \| null` | `std::optional<T>` |
| array | `Array` | `T[]` | `std::vector<T>` (`sdk/core`) or `QList<T>` (types crossing into QML) |
| object (named resource) | plain object | `interface` | `struct`/`class` |
| unknown/未冻结字段 | ignored | `unknown` avoided — field omitted from the sketch until frozen | field omitted from the struct until frozen; deserializer ignores unknown JSON keys (forward-compatible) |

Parsing rules (mirrors `docs/CPP_APP_MIGRATION_PLAN.md` §15):

- Missing optional field → `std::optional` empty, never a sentinel value (no `""`/`-1`/`0` standing in for "absent").
- Unknown JSON keys → ignored, not an error (forward-compatible with additive server changes per freeze plan §13).
- Unknown `error.code` string → `ApiErrorCode::Unknown`, raw string preserved in `ApiError.code`; client must fall back to branching on HTTP status, never crash.

## 5. What the C++ SDK must NOT depend on

1. **Legacy top-level mirror fields** (`payload.projects`, `payload.profile`,
   top-level `code`/`message`, etc.). These exist ONLY on `/api/*` legacy and
   are explicitly excluded from `/api/v1/*` by the strict envelope (freeze
   plan §4/§14). The SDK's envelope unwrapping (`ResponseEnvelope<T>`) must
   read exclusively from `data`/`pagination`/`error`.
2. **Admin endpoints** (`/api/v1/admin/*`). Mechanically reachable via the
   dual mount but authenticated by a static Web-only `ADMIN_TOKEN`, not the
   visitor bearer token. `docs/openapi/api-v1.yaml` tags every admin
   operation `x-cpp-sdk: false`; the SDK's `ApiClient` should not even expose
   a method for them.

## 6. Upload/download error → local Result<T> mapping

Following `docs/CPP_APP_MIGRATION_PLAN.md` §15's "no exceptions across SDK
layers" rule, every upload/download call returns `Result<T, ApiError>` (or an
equivalent expected-type), not a thrown exception:

| Server `error.code` | HTTP | SDK mapping |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | `Result::Err(ApiError{code: ValidationError, ...})` — surfaced as a form/field error in `app/ui`, never auto-retried |
| `INVALID_FILE_TYPE` | 400 | Same as above; `DownloadManager`/upload flow shows "unsupported file type" without retry |
| `FILE_TOO_LARGE` | 413 | Same; UI should pre-check size client-side before upload where possible, but the server error is authoritative |
| `FILE_UPLOAD_ERROR` | 400 | Same; generic multipart failure, retry is allowed (transient multer-level issue) |
| `AUTH_REQUIRED` / `INVALID_TOKEN` | 401 | `TokenStore` cleared, session layer notified, UI routed to sign-in — matches Web's `createApiError` handling of these codes |
| `SERVICE_UNAVAILABLE` | 503 | Treated as transient; `DownloadManager`/`ApiClient` may retry with backoff |
| any other/unknown code | varies | Generic failure surfaced via HTTP status class (4xx = don't retry / show message, 5xx = retryable), never a crash |

Download-specific (once `GET /api/v1/assets/{id}/download` exists — see
`API_V1_GAPS.md` §3, not implemented yet): the same `Result<T, ApiError>`
convention applies, with `RESOURCE_FORBIDDEN` mapping to "policy denied this
download" (no retry, no local cache write) and network-level failures
(timeout, connection reset) mapped to `DownloadTask::State::Failed` with
`retryCount` incremented for `DownloadManager`'s exponential backoff.

## 7. Pagination → request/response model mapping

Request side (client builds the query string):

```cpp
struct PageRequest {
  int page = 1;
  int limit = 20;     // server clamps to its own max (100 for admin/visitors today)
  std::optional<std::string> query;
  std::optional<std::string> sort;
};
```

Response side: `Pagination` (§3) is populated only when the server actually
ran `sendPage` — today that's `/api/admin/visitors` and its visitor detail
sub-pages (admin-only, not SDK surface). For the public/account endpoints the
SDK will eventually paginate (freeze plan §8 backlog — `projects`,
`community/posts`, `community/uploads`, `account/downloads`,
`account/comments`, `users/{handle}/*`), `Pagination` will arrive all-nullopt
until that backlog closes; the SDK's list ViewModels must treat an
all-nullopt `Pagination` as "load everything the server returned, no more
pages" rather than assuming zero results.

## 8. Asset cache fields still missing (blocks `CacheManager`/`DownloadManager`)

Cross-referencing `API_V1_GAPS.md` §3, the fields `CacheManager` needs that no
endpoint yet returns:

- **`checksum`** (sha256) — required to verify a completed download before
  atomic rename into the blob store; without it, `LocalAsset.checksum` cannot
  be populated from the server and would have to be computed client-side
  post-download with no way to detect server-side corruption/tampering in
  transit until the whole file is already downloaded.
- **`fileSize`** — present on community/admin uploads today but not on
  project images/models or avatar/banner; needed up front for progress bars
  and disk-space preflight checks.
- **`mimeType`** — not populated anywhere (only file-extension-derived
  `fileType: image|model` on community uploads); needed to route the
  downloaded blob to the correct viewer/renderer without re-sniffing bytes.
- **`version` / `etag`** — needed for `SyncState` (freeze plan §11/§18) to
  detect server-side asset changes without re-downloading; currently no
  endpoint returns either.
- **stable `id` on `Project`** distinct from `slug` — `slug` is usable as a
  cache key today (it's already the stable route parameter), but the freeze
  plan's target Asset Model assumes assets are addressed by their own `id`,
  not their parent project's slug; this matters once a project can have more
  than one downloadable asset.

None of these are implemented in this batch — this section exists so
`CacheManager`/`DownloadManager` design work (Phase 2 of
`CPP_APP_MIGRATION_PLAN.md`) starts from the real gap list instead of
discovering it mid-implementation.
