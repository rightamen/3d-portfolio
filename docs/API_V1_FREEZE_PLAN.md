# API v1 Freeze Plan

Status: freeze 规范定稿（2026-07-03）。freeze 本身尚未执行——见 §21 checklist。

关联文档：

- `docs/API_CONTRACT.md` — 现行契约与迁移历史
- `docs/API_ERRORS.md` — 错误码语义与映射
- `docs/CPP_APP_MIGRATION_PLAN.md` — C++ 跨平台客户端计划（本 freeze 是其 Phase 1）
- `docs/openapi/api-v1.yaml` — v1 端点 OpenAPI 初稿（机器可读契约，checklist #9）
- `docs/API_V1_MODEL_MAPPING.md` — TS/C++ model mapping 初稿（checklist #10）
- `docs/API_V1_GAPS.md` — 尚未冻结/未验证字段与端点清单
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

已实现（2026-07-04，checklist #4）：

- **双挂载机制**：server/index.js 在 `express.json` 之前注册一个 URL-rewrite 中间件——命中 `^/api/v1(?=/|?|$)` 的请求打上 `request.apiVersion = 'v1'` 标记后把 `request.url` 重写为 `/api/...`，随后走完全相同的路由注册。零 handler 复制、零业务分叉；`request.originalUrl` 保留 `/api/v1` 前缀用于日志。中间件先于 body parser 注册，因此 `/api/v1/*` 的 JSON parse 错误（REQUEST_BODY_INVALID）同样以 strict envelope 返回。
- **response mode**：server/responses.js 的 `sendData/sendPage/sendError` 检测 `response.req.apiVersion === 'v1'`——strict 模式下顶层键**只有** `data`/`pagination`/`error`（成功与失败一致）：无 `withLegacyData` 顶层展开、无 `code`/`message` 兼容镜像；runtime contract 校验以 `allowCompatibilityKeys=false, allowLegacyKeys=false` 运行（§4 语义）。分页数据原样保留在 envelope 的 `pagination` 中，`items`/`visitors` 等 legacy 键不出现在顶层。
- **覆盖面**：全部 `/api/*` 路由自动获得 `/api/v1/*` 别名（health、projects、community、profile、account、auth、users、download-requests、contact、experience、admin、uploads 错误、REQUEST_BODY_INVALID/INTERNAL_ERROR 兜底）。`/api/v1x...` 等非精确前缀不重写。
- **admin 边界**：`/api/v1/admin/*` 机械可达（双挂载天然覆盖，strict envelope 生效），但 admin 是 Web-only 面、静态 ADMIN_TOKEN 认证（§9），**不属于 C++ App 可依赖的 v1 公开契约**——C++ SDK 不得实现或调用任何 admin 端点。
- **正反向镜像断言**：tests/api/contract.spec.js 新增 8 用例（36 total）——每条断言同时锁两侧：legacy `/api` 必须保留顶层镜像键、strict `/api/v1` 顶层 keys 必须精确等于 `[data, error, pagination]`、两侧 `data` deep-equal（同 handler 无漂移）；覆盖成功/404/503/validation/REQUEST_BODY_INVALID/admin 401/非精确前缀。tests/api/contract.db.spec.js 新增 2 用例（14 total）：真实 `sendPage` 分页在 v1 下六字段原样保留于 `pagination` 且顶层无 `visitors`/`items` 镜像。

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

已修复（2026-07-04）：avatar/banner 的 fileFilter 拒绝消息（`"Only JPG, PNG, and WebP images are allowed."`）与 community/admin fileFilter 的消息（`"Unsupported file type."`）不同，而 `describeUploadError` 此前只按消息字符串匹配，导致 avatar/banner 非法文件类型真实触发时落到未分类分支 → `next(error)` → `INTERNAL_ERROR` 500，而非契约要求的 `INVALID_FILE_TYPE` 400（PROJECT_PROGRESS.md 2026-07-03 技术备注已记录此风险）。修复：两处 fileFilter 均在拒绝时附加稳定 `error.code = 'INVALID_FILE_TYPE'`；`describeUploadError` 优先按 `error.code` 分类，消息字符串匹配降级为兜底。community/admin 现有行为不变（同一 code，同一 400 输出）。

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

已实现（2026-07-03）：`npm run test:api:db` → `scripts/run-api-db-tests.mjs`：

- 未提供 `API_TEST_DATABASE_URL` 时，用本机 PostgreSQL 二进制在临时目录 `initdb` 一次性集群（loopback、随机端口、trust auth；root 环境经 `su postgres` 执行），建库 `mrright_api_contract_test`，跑完销毁整个集群目录。
- 提供 `API_TEST_DATABASE_URL`（CI service container）时直接使用，不做本地 provisioning。
- 双层安全闸（脚本 + suite 各一次）：库名必须含 test/e2e/local/dev 且不得含 `mrright_portfolio`。
- suite（`tests/api/contract.db.spec.js`，12 用例，独立 config `playwright.api.db.config.js`）只经公开 API seed（注册/验证/登录/发帖/联系消息），schema 由 server 启动时 ensureSchema 自建；覆盖上面 1–3 全部路径。
- `npm run test:api` 保持无 DB 基线（config `testIgnore` 排除 db suite）。

## 18. OpenAPI / typed client 策略

- freeze 后立即手写 `docs/openapi.v1.yaml`（OpenAPI 3.1）：全部 v1 端点、envelope schema（`components/schemas/Envelope`）、错误码 enum、分页对象、Asset Model。
- 用途优先级：① 唯一机器可读契约源；② CI 漂移检测（响应 shape 抽样对 spec 校验）；③ 文档渲染。**不用于生成 C++ 客户端代码**（openapi-generator 的 C++ 目标质量不可控），但可生成 TS types 供 Web 使用。
- spec 与 `API_ERROR_CODES` 的一致性做成脚本检查（枚举比对），防两处漂移。

已实现（2026-07-05，checklist #9 初稿）：

- `docs/openapi/api-v1.yaml`（OpenAPI **3.0.3**，非 3.1——项目此前无既有 3.1 规范，3.0.3 工具链更成熟，符合本任务"优先 3.0.3 除非项目已有 3.1"的默认原则）：38 paths / 42 operations，全部 `server: /api/v1`，全部标注 `operationId`。覆盖 Health、Auth（含 register/login/verify-email/resend-verification/logout/me）、Projects（含 like/comments/download-requests）、Account（profile 读写 + avatar/banner multipart 上传 + community/downloads/comments 只读 + 删除 upload/post）、Community（posts/uploads 读写 + comments + like + delete）、Users（profile/resources/posts/activity）、Contact；另加 4 个代表性 Admin 端点（summary、visitors 列表分页、visitor 详情、profile-visibility）演示 Web-only 边界，其余 ~25 个 admin handler 未逐条展开（理由与清单见 `docs/API_V1_GAPS.md` §2），全部 admin 端点若加入 spec 也一律 `x-cpp-sdk: false`。
- 只记录代码中真实存在、且被 `tests/api/contract.spec.js`/`tests/api/contract.db.spec.js` 覆盖或前端 `src/lib/api.js` 实际消费的端点；不确定字段（如 `Project.downloadPolicy` 未来枚举、`community/comments/:id/like` 返回体精确 key、`account/comments` 行形状、Asset 统一模型）一律在 spec 中留白/标注，并汇总进新建的 `docs/API_V1_GAPS.md`——不在 spec 里编造。
- `components.schemas.ApiErrorCode.enum` 已用脚本比对 `server/responses.js` 的 `API_ERROR_CODES`（27 个，含 `INTERNAL_ERROR`）：**逐一致**，零缺失零多余（一次性校验脚本运行后即删除，未提交）。
- 校验方式：无重量级 OpenAPI validator 依赖（未新增 npm 包）；用项目已有的传递依赖 `js-yaml` 做 YAML 解析 + 全量 `$ref` 可解析性遍历 + `paths`/`operationId`/`x-cpp-sdk` 覆盖面打印，均一次性脚本验证后删除，不留痕迹在仓库里。
- admin 边界机制：spec 中每个 admin operation 显式带 `x-cpp-sdk: false`，Admin 相关内容归入独立 tag `Admin (Web-only)`，`securitySchemes.adminToken` 的 description 明确写"SDK 不得实现或存储此凭证"。

## 19. C++ SDK model mapping 策略

- SDK models（见 `CPP_APP_MIGRATION_PLAN.md` §15–16）从本文件 §7/§8/§11 的冻结形状**直接映射**，一个 JSON 形状对应一个 struct，不做客户端侧改名。
- JSON → struct 解析规则：缺失可选字段 → `std::optional` 空；未知字段忽略（forward-compatible）；未知错误码 → 保留原始字符串 + `Unknown` enum 值。
- `ResponseEnvelope<T>` 泛型解包在 `ApiClient` 一处实现；SDK 单测直接以 contract 测试的固定 JSON 样例为 fixture（同一形状两端各验一次）。

已实现（2026-07-05，checklist #10 初稿）：`docs/API_V1_MODEL_MAPPING.md` 新建，内容：

1. Web `normalizeApiPayload` 与 strict v1 envelope 的关系说明（结论：Web 暂不切 v1，该函数未针对纯 strict payload 验证过，仅作记录，本轮不改代码）。
2. TypeScript 类型草图（`ApiResponse<T>`/`ApiError`/`Pagination`/`User`/`AccountProfile`/`Project`/`Asset`/`CommunityPost`/`Comment`/`DownloadRequest`/`UploadError`）——仅供参考对照，不引入 TS 编译、不迁移前端。
3. C++ struct 草图（`ResponseEnvelope<T>`/`ApiError`+`ApiErrorCode` enum/`Pagination`/`User`/`AccountProfile`/`Project`/`Asset`(aspirational)/`CommunityPost`/`Comment`/`DownloadRequest`/`LocalAsset`/`DownloadTask`/`SyncStatus`），字段与 OpenAPI schema 一一对应，不擅自改名。
4. 字段类型映射表（string/number/boolean/datetime/nullable/array/object 分别对应 JS/TS/C++ 表示）。
5. 明确 SDK 不依赖 legacy 顶层镜像、不消费 admin 端点。
6. upload/download 错误 → `Result<T, ApiError>` 映射表（VALIDATION_ERROR/INVALID_FILE_TYPE/FILE_TOO_LARGE/FILE_UPLOAD_ERROR/AUTH_REQUIRED/INVALID_TOKEN/SERVICE_UNAVAILABLE 各自的客户端处理策略）。
7. pagination → `PageRequest`/`Pagination` 请求响应模型映射，含"全 nullopt 视为无更多页"的判定规则。
8. asset cache 仍缺失字段清单（checksum/fileSize/mimeType/version/etag/Project 稳定 id），与 `docs/API_V1_GAPS.md` §3/§8 交叉引用。

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

## 21. Freeze 前 checklist

| # | 项 | 状态 | 说明 |
| - | --- | :-: | --- |
| 1 | INTERNAL_ERROR 全局兜底 | ✅ 2026-07-03 | `/api/*` 未捕获异常 → `INTERNAL_ERROR` 500 envelope，JSON parse 错误 → `REQUEST_BODY_INVALID` 400；非 API 路径保持 Express 默认；contract 测试覆盖 |
| 2 | DB-backed admin 200 contract tests | ✅ 2026-07-03 | §17；`npm run test:api:db`（tests/api/contract.db.spec.js）锁定 admin 200 成功形状、真实 sendPage pagination 六字段、legacy 镜像、store 存在时 AUTH_REQUIRED 401 |
| 3 | DB-backed 真实 upload multer error E2E | ✅ 2026-07-03 | §17；同一 suite 内真实 multipart 触发 FILE_TOO_LARGE(413)/INVALID_FILE_TYPE(400) envelope |
| 4 | `/api/v1` 双挂载 + 无镜像模式 | ✅ 2026-07-04 | §3/§14；URL-rewrite 双挂载（server/index.js）+ strict envelope 模式（server/responses.js）+ 正反向镜像断言（contract.spec.js 8 用例、contract.db.spec.js 2 用例真实分页） |
| 5 | token 生命周期评估并文档化 | ❌ | §9 四项决策写入本文件后才算 |
| 6 | 受控资产下载端点设计定稿 | ❌ | §11；含 Range/ETag；实现可与 Phase 2 并行，设计必须先冻结 |
| 7 | asset/download metadata 补全方案 | ❌ | checksum 入库、mimeType 稳定输出、Asset Model 收敛计划 |
| 8 | 公共列表 pagination 补齐方案 | ❌ | §8 清单，additive |
| 9 | OpenAPI spec 抽取 + 漂移检测 | 🟡 2026-07-05 初稿 | §18；`docs/openapi/api-v1.yaml` 初稿已生成（38 paths/42 ops，错误码枚举与 `API_ERROR_CODES` 逐一致）。**CI 自动漂移检测尚未接入**（本次仅一次性脚本人工校验后删除）——剩余工作 |
| 10 | C++ SDK model 映射表定稿 | 🟡 2026-07-05 初稿 | §19；`docs/API_V1_MODEL_MAPPING.md` 初稿已生成（TS 类型草图 + C++ struct 草图 + 字段类型映射 + 错误/分页/cache 映射）。未"定稿"：Asset 统一模型、`Project.downloadPolicy` 枚举等仍待 checklist #6/#7/#8 完成后回填，见 `docs/API_V1_GAPS.md` |
| 11 | 本文件 §7 错误码表与 `API_ERROR_CODES` 一致性复核 | ❌ | 加 INTERNAL_ERROR 后复核一次 |

**Freeze 宣告条件**：1–5 + 11 完成（6–8 允许"设计冻结、实现排期"状态）。宣告方式：本文件 Status 行改为 frozen + 在 PROJECT_PROGRESS.md 记录。
