# API v1 Freeze Plan

Status: freeze 规范定稿（2026-07-03）。freeze 本身尚未执行——见 §21 checklist。

关联文档：

- `docs/API_CONTRACT.md` — 现行契约与迁移历史
- `docs/API_ERRORS.md` — 错误码语义与映射
- `docs/CPP_APP_MIGRATION_PLAN.md` — C++ 跨平台客户端计划（本 freeze 是其 Phase 1）
- `server/responses.js` — envelope 实现 + `API_ERROR_CODES`
- `tests/api/contract.spec.js` — contract 测试（当前 25 用例）

---

## 1. Freeze 目标

把 API 从"跟随 Web 迭代的内部接口"升级为"多客户端共享的稳定平台层"。frozen 之后：

- Web、C++ App、未来任何客户端消费同一契约；
- 服务端可以自由改实现，但不能破坏 v1 契约；
- C++ SDK 的 models 与错误处理可以安全固化进编译产物。

## 2. 为什么要 freeze

C++ App 是编译分发的原生二进制，发布后无法像 Web 一样随服务端热更新。任何字段改名、错误码变更、分页语义调整都会直接破坏已安装的客户端。因此：**先冻结契约，再写第一行 C++ 业务代码**。当前 envelope 迁移已 100% 完成、contract 测试已覆盖主要路径（PROJECT_PROGRESS 2026-07-02 审计），正是冻结的正确时点。

## 3. /api/v1 路由策略

- 新增前缀 `/api/v1/*`，与现有 `/api/*` **共用同一 handler 实现**（Express 层双挂载或薄适配），不复制业务代码。
- `/api/v1` 下的响应 **不携带 legacy 顶层镜像**（见 §15）——这是两个前缀唯一的行为差异。
- 现有 `/api/*` 全部保留原行为（含镜像），标记为 legacy alias，供现行 Web 前端继续使用；Web 前端后续按自身节奏切到 v1。
- C++ SDK **只允许消费 `/api/v1`**。
- URL 命名规范（v1 下强制）：
  - 资源名复数、kebab-case：`/api/v1/projects`、`/api/v1/download-requests`、`/api/v1/community/posts`。
  - 路径参数为稳定标识：项目用 `:slug`，其余用 `:id`。
  - 动作用子资源表达（`POST /projects/:slug/like`），不用动词端点。
  - admin 一律在 `/api/v1/admin/*`，与公共面隔离。

## 4. Response envelope 规范（冻结）

```json
{
  "data": {},
  "pagination": {},
  "error": null
}
```

- 三个顶层键**永远同时存在**。
- `data`：成功时为对象（不允许顶层数组）；失败时为 `null`。
- `pagination`：始终为对象；非分页端点为 `{}`。
- `error`：成功时为 `null`；失败时为 `{ code, message }` 对象。
- v1 下顶层不允许出现任何其他键（`code`/`message` 兼容镜像与 legacy data 镜像仅存在于 `/api/*` legacy 前缀）。
- 由 `server/contracts/responseValidator.js` 语义在测试中强制（v1 模式即 `allowCompatibilityKeys=false, allowLegacyKeys=false`）。

## 5. Success response 规范（冻结）

- `data` 内使用**具名资源键**：`{ "project": {...} }`、`{ "projects": [...] }`、`{ "ok": true }`。
- 键名一旦冻结不得改名；新增键允许（additive change，见 §13）。
- 保留字：`data`、`pagination`、`error`、`code`、`message` 不得作为 `data` 的键名。
- HTTP status：200 读取 / 幂等写、201 创建、204 不使用（envelope 必须有 body）。

## 6. Error response 规范（冻结）

```json
{
  "data": null,
  "pagination": {},
  "error": { "code": "STRING_CODE", "message": "human readable" }
}
```

- `error.code` 是唯一稳定的机器可读信号；客户端禁止 branch 在 `error.message` 上。
- HTTP status 必须与错误类别一致（见 §7 表）。
- v1 预留（不实现、不承诺）：`error.details[]` 字段级校验错误数组——未来 additive 添加。

## 7. Error code 表（v1 冻结集，26 个 = `API_ERROR_CODES` 全量 + INTERNAL_ERROR）

| Code | HTTP | 语义 | 公开契约 |
| --- | :-: | --- | :-: |
| `AUTH_REQUIRED` | 401 | 需要 visitor 认证而未提供可用凭证 | ✅ |
| `ADMIN_AUTH_REQUIRED` | 401 | 需要 admin 凭证（Web admin 专用） | ✅（App 不应遇到） |
| `INVALID_TOKEN` | 401 | token 无效/过期/被吊销 → 清本地会话重新登录 | ✅ |
| `EMAIL_NOT_VERIFIED` | 403 | 登录时邮箱未验证 | ✅ |
| `PROFILE_ADMIN_DISABLED` | 403 | 公开主页被管理员禁用 | ✅ |
| `RESOURCE_FORBIDDEN` | 403/404 | 无权访问；`/api/users/:handle` 反枚举场景配 404 | ✅ |
| `PROJECT_NOT_FOUND` | 404 | 项目 slug 不存在 | ✅ |
| `COMMENT_NOT_FOUND` | 404 | 项目评论不存在 | ✅ |
| `COMMUNITY_POST_NOT_FOUND` | 404 | 社区帖不存在 | ✅ |
| `COMMUNITY_COMMENT_NOT_FOUND` | 404 | 社区评论不存在 | ✅ |
| `COMMUNITY_UPLOAD_NOT_FOUND` | 404 | 社区资源不存在 | ✅ |
| `DOWNLOAD_REQUEST_NOT_FOUND` | 404 | 下载申请不存在 | ✅ |
| `CONTACT_MESSAGE_NOT_FOUND` | 404 | 留言不存在 | admin |
| `VISITOR_NOT_FOUND` | 404 | 访客记录不存在 | admin |
| `EMAIL_ALREADY_REGISTERED` | 409 | 邮箱已注册 | ✅ |
| `EMAIL_ALREADY_VERIFIED` | 409 | 邮箱已验证 | ✅ |
| `EMAIL_NOT_REGISTERED` | 404/400 | 邮箱未注册 | ✅ |
| `HANDLE_TAKEN` | 409 | handle 冲突 | ✅ |
| `PROJECT_SLUG_TAKEN` | 409 | 项目 slug 冲突 | admin |
| `VALIDATION_ERROR` | 400 | body/query/path/upload 校验失败 | ✅ |
| `FILE_TOO_LARGE` | 413 | 上传超限（multer LIMIT_FILE_SIZE） | ✅ |
| `INVALID_FILE_TYPE` | 400 | 上传类型不支持（fileFilter） | ✅ |
| `FILE_UPLOAD_ERROR` | 400 | 其他 multer 错误 | ✅ |
| `RATE_LIMITED` | 429 | 限流（预留，未启用） | ✅ |
| `SERVICE_UNAVAILABLE` | 503 | 依赖的 store/子系统未配置或不可用 | ✅ |
| `INTERNAL_ERROR` | 500 | **未捕获异常兜底（待实现，freeze 阻塞项）** | ✅ |

规则：codes 只增不删不改义；App/SDK 遇到未知 code 必须按 HTTP status 类别降级处理，不得崩溃。

## 8. Pagination 规范（冻结）

请求：`page`（1 起）、`limit`（服务端上限强制，默认 20）、`query`、`sort`（端点自定义但必须文档化 + 校验）。
响应（`pagination` 键，来自 `sendPage`）：

```json
{ "page": 1, "limit": 20, "total": 120, "pages": 6, "hasNext": true, "hasPrevious": false }
```

- 非法分页参数归一化到默认值或返回 `VALIDATION_ERROR`，绝不 500。
- 现状：仅 `/api/admin/visitors` 族有完整分页。**v1 需补分页的公共端点**：`GET /projects`（低优先，量小）、`GET /community/posts`、`GET /community/uploads`、`GET /account/downloads`、`GET /account/comments`、`GET /users/:handle/{resources,posts,activity}`。补齐方式为 additive（无分页参数时保持现行为），不破坏现有客户端。
- `cursor` 字段名预留给未来增量同步，v1 不实现。

## 9. Auth token 规范

- 传递：`Authorization: Bearer <token>`，仅此一种（不支持 cookie/query token）。
- visitor token：不透明随机串；服务端只存 hash（现行实现正确，冻结此性质——token 永不可由服务端泄露反查）。
- **freeze 前必须评估并写死以下语义**（当前未定义，是 checklist 项）：
  1. token 有效期（建议：长期有效 + 服务端可吊销，或 30–90 天滑动过期）；
  2. 过期/吊销后的行为：一律 `INVALID_TOKEN` 401，客户端清凭证回登录页；
  3. 是否提供 refresh 端点：v1 建议**不做 refresh token**（复杂度不配收益），用长效 token + 重新登录；`expiresAt` 在 login 响应中预留可 null；
  4. 多设备：每设备一个 session（现行 visitor_sessions 表天然支持），logout 只吊销当前 token。
- admin token：静态 Bearer，Web admin 专用，**不进入 v1 公共契约、不进入 C++ SDK**。

## 10. Permission / role 规范（冻结）

| 角色 | 凭证 | 能力 |
| --- | --- | --- |
| public | 无 | 公开内容只读 |
| visitor (member) | visitor token | 自己的账号/评论/帖子/上传/下载申请 |
| approved | visitor token（accessLevel=approved） | 受策略保护资源的下载 |
| admin | admin token（Web only） | 全部管理与审核 |

- accessLevel 语义（guest < member < approved）由服务端 `canAccess` 唯一判定；客户端不复制规则。
- downloadPolicy v1 枚举化：`public | member | approved | disabled`（现为自由文本正则匹配，见 §11）。
- 服务端以布尔决策下发（如 download-request 响应中的 `access`），客户端不解析策略文本。

## 11. Asset / Download API 规范（v1 目标形状）

统一 Asset Model（所有出现文件的地方——community uploads、admin uploads、项目图片/模型、头像/banner——逐步收敛到此形状）：

```json
{
  "id": "asset-id",
  "type": "image | model | texture | file",
  "url": "/uploads/...",
  "downloadUrl": "/api/v1/assets/asset-id/download",
  "thumbnailUrl": null,
  "fileSize": 123456,
  "mimeType": "model/gltf-binary",
  "checksum": "sha256:...",
  "visibility": "public | private | unlisted | admin",
  "downloadPolicy": "public | member | approved | disabled",
  "createdAt": "ISO-8601",
  "version": null,
  "etag": null,
  "expiresAt": null
}
```

- 公开展示文件（头像、预览图）继续走 `/uploads` 静态直出（`url`）。
- **受策略保护的资产必须走受控下载端点** `GET /api/v1/assets/:id/download`：Bearer → 服务端判策略 → 流式返回或 302 短时签名 URL；必须支持 `Range`（断点续传）与 `ETag/If-None-Match`；策略拒绝返回 `RESOURCE_FORBIDDEN`。这是当前架构第 1 号问题（`/uploads` 全公开）的修复路径，属于 additive 新端点，不改现有行为。
- `checksum` 上传时计算并入库（新上传强制，存量回填任务化）。

## 12. Upload API 规范（冻结）

- multipart/form-data，字段名 `file`；错误统一经 `describeUploadError` 映射：
  - `LIMIT_FILE_SIZE` → `FILE_TOO_LARGE` 413
  - 其他 MulterError → `FILE_UPLOAD_ERROR` 400
  - fileFilter 拒绝 → `INVALID_FILE_TYPE` 400
  - 缺文件/字段校验失败 → `VALIDATION_ERROR` 400
- 上传成功响应逐步补 `asset` 对象（§11），现有 `fileUrl/fileSize/fileType` 等键 additive 保留。
- 大小上限（当前 120MB）属于运维参数，可调，不属于冻结契约；但错误码属于契约。

## 13. Versioning 与 backwards compatibility 策略

**Additive-only 原则**：v1 生命周期内允许——新增端点、新增可选请求参数、新增响应字段、新增错误码；禁止——删除/改名字段、改字段类型、改错误码语义、改 HTTP status、改分页语义。

破坏性变更的唯一途径是 `/api/v2`（新前缀并行，v1 维持），预计很长时间内不需要。

## 14. Legacy 字段淘汰策略

淘汰对象（仅存在于 `/api/*` legacy 前缀）：

1. 顶层 data 镜像（`withLegacyData` 摊平的资源键）；
2. 顶层 `code`/`message` 错误兼容镜像。

路径：**在 `/api/v1` 出生时即不存在**（不是从 legacy 里"拆除"）。`/api/*` 的镜像保持到 Web 前端完全切换到 v1 之后，再评估移除（届时 `normalizeApiPayload` 一并简化）。在此之前不动，避免破坏生产 Web。

## 15. Deprecation 策略

- legacy `/api/*` 标记 deprecated 后：文档标注 + 响应头 `Deprecation: true`（可选实现），至少保留一个 Web 发布周期。
- 错误码永不删除，只能标注 deprecated 并停止发出。
- 任何 deprecation 必须先落 `docs/API_CONTRACT.md` 再落代码。

## 16. Contract test 策略（现状冻结 + 扩展）

- 现有 25 用例（`tests/api/contract.spec.js`）继续作为无 DB 基线：envelope 形状、错误码、legacy 镜像一致性、upload 错误分类器单测。
- v1 上线后为 `/api/v1` 增加镜像断言的**反向**版本：断言顶层不存在 legacy 键。
- 每个新增端点必须同时提交 contract 用例，否则不算完成。

## 17. DB-backed contract test 策略（freeze 阻塞项）

当前测试服务器无 `DATABASE_URL`，导致以下路径不可达、未被锁定：

1. **admin 200 成功响应**（真实 `sendPage` pagination + legacy 镜像）；
2. **真实 multipart multer 错误**（FILE_TOO_LARGE / INVALID_FILE_TYPE 端到端）；
3. store 存在时的 `AUTH_REQUIRED` 401 路径。

方案：新增 `test:api:db` Playwright project，要求本地/CI 提供一个一次性 PostgreSQL（本地 Docker 或 CI service container），测试自建 schema + seed + teardown，**绝不指向生产库**。freeze 宣告前该 suite 必须存在并通过。

## 18. OpenAPI / typed client 策略

- freeze 后立即手写 `docs/openapi.v1.yaml`（OpenAPI 3.1）：全部 v1 端点、envelope schema（`components/schemas/Envelope`）、错误码 enum、分页对象、Asset Model。
- 用途优先级：① 唯一机器可读契约源；② CI 漂移检测（响应 shape 抽样对 spec 校验）；③ 文档渲染。**不用于生成 C++ 客户端代码**（openapi-generator 的 C++ 目标质量不可控），但可生成 TS types 供 Web 使用。
- spec 与 `API_ERROR_CODES` 的一致性做成脚本检查（枚举比对），防两处漂移。

## 19. C++ SDK model mapping 策略

- SDK models（见 `CPP_APP_MIGRATION_PLAN.md` §15–16）从本文件 §7/§8/§11 的冻结形状**直接映射**，一个 JSON 形状对应一个 struct，不做客户端侧改名。
- JSON → struct 解析规则：缺失可选字段 → `std::optional` 空；未知字段忽略（forward-compatible）；未知错误码 → 保留原始字符串 + `Unknown` enum 值。
- `ResponseEnvelope<T>` 泛型解包在 `ApiClient` 一处实现；SDK 单测直接以 contract 测试的固定 JSON 样例为 fixture（同一形状两端各验一次）。

## 20. Freeze 后禁止随意修改的内容

1. envelope 三键结构与语义（§4）
2. `data` 内已冻结的资源键名与类型（§5）
3. 错误码表：语义、HTTP status 映射（§7）
4. pagination 对象六字段（§8）
5. Bearer token 传递方式与 401 语义（§9）
6. downloadPolicy / visibility / accessLevel 枚举值（§10–11）
7. Asset Model 已发布字段（§11）
8. upload 错误映射（§12）
9. `/api/v1` 路径本身（改路径 = v2）

以上任何改动必须走 v2 或 additive 途径；PR review 时以本节为检查单。

## 21. Freeze 前 checklist（当前全部未完成 ❌）

| # | 项 | 状态 | 说明 |
| - | --- | :-: | --- |
| 1 | INTERNAL_ERROR 全局兜底 | ❌ | error 中间件目前非 upload 错误 `next(error)` → Express HTML 500；需对 `/api/*` 路径加 `INTERNAL_ERROR` 500 envelope（非 API 路径保持默认），并入 `API_ERROR_CODES` |
| 2 | DB-backed admin 200 contract tests | ❌ | §17；锁定成功形状与真实 pagination |
| 3 | DB-backed 真实 upload multer error E2E | ❌ | §17；FILE_TOO_LARGE/INVALID_FILE_TYPE 端到端 |
| 4 | `/api/v1` 双挂载 + 无镜像模式 | ❌ | §3/§14；含反向镜像断言测试 |
| 5 | token 生命周期评估并文档化 | ❌ | §9 四项决策写入本文件后才算 |
| 6 | 受控资产下载端点设计定稿 | ❌ | §11；含 Range/ETag；实现可与 Phase 2 并行，设计必须先冻结 |
| 7 | asset/download metadata 补全方案 | ❌ | checksum 入库、mimeType 稳定输出、Asset Model 收敛计划 |
| 8 | 公共列表 pagination 补齐方案 | ❌ | §8 清单，additive |
| 9 | OpenAPI spec 抽取 + 漂移检测 | ❌ | §18；spec 可在 freeze 宣告后立即做，但必须在 C++ 动工前 |
| 10 | C++ SDK model 映射表定稿 | ❌ | §19；随 spec 完成 |
| 11 | 本文件 §7 错误码表与 `API_ERROR_CODES` 一致性复核 | ❌ | 加 INTERNAL_ERROR 后复核一次 |

**Freeze 宣告条件**：1–5 + 11 完成（6–8 允许"设计冻结、实现排期"状态）。宣告方式：本文件 Status 行改为 frozen + 在 PROJECT_PROGRESS.md 记录。
