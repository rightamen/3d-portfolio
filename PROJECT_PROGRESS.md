# mrright.blog 项目进度记录

## 2026-07-02：换行符规范化 + Auth/写接口 API envelope 迁移

完成内容：

- 任务 A（换行符规范化，独立提交）：
  - 新增 `.gitattributes`，统一 `*.js/.jsx/.ts/.tsx/.json/.md/.css` 为 `eol=lf`。
  - 将 `server/index.js` 由 CRLF/LF 混用规范化为纯 LF（仅换行符，零逻辑改动，`git diff --ignore-space-at-eol` 无差异）。
  - 目的：让后续 envelope 迁移 diff 可读。
- 任务 B（auth 与写操作 envelope 迁移）：
  - 认证接口迁移到 sendData/sendError：register、resend-verification、login、verify-email、logout。
  - community 写操作迁移：create post、comment create、comment like、comment delete、post/upload delete、community upload。
  - profile/account 写操作迁移：profile PUT、avatar upload、banner upload。
  - 访客交互写接口迁移：project like、project comment、download-requests、contact。
  - 错误体统一为 `{ error: { code, message } }`（含顶层 code/message 兼容），不再返回 `{ error: '字符串' }`。
  - 成功响应保持 legacy 顶层字段兼容：user、session、verification、post、comment、profile、avatarUrl、bannerUrl、upload、request、access、ok。
  - `server/responses.js` 新增错误码：COMMUNITY_COMMENT_NOT_FOUND、COMMUNITY_UPLOAD_NOT_FOUND、EMAIL_ALREADY_REGISTERED、EMAIL_ALREADY_VERIFIED、EMAIL_NOT_REGISTERED、EMAIL_NOT_VERIFIED、HANDLE_TAKEN。前端依赖的 EMAIL_NOT_VERIFIED、HANDLE_TAKEN 已保留。
  - `/api/users/:handle*` 的 RESOURCE_FORBIDDEN + 404 补充防用户枚举说明注释（刻意对"不存在/非法 handle"统一返回，不泄露 handle 是否存在）。
  - `withLegacyData` 附近补注释：data 顶层展开可能与 data/pagination/error/code/message 保留字段名碰撞，新接口需避免。
  - 扩展 tests/api/contract.spec.js：新增 postJson helper 与写/认证接口用例，contract 覆盖从 10 增至 15 个用例。

修改文件：

- .gitattributes（新增）
- server/index.js
- server/responses.js
- tests/api/contract.spec.js

commit：

- 2049d5d feat(api): migrate read endpoints to envelope（上一轮读接口迁移，本轮先独立提交）
- 2d306e8 chore: normalize line endings
- cd5c207 refactor(api): migrate auth and write responses to envelope

验证结果：

- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，15 passed
- 本地 store 缺失环境 API 状态抽查：
  - POST /api/auth/register：503 SERVICE_UNAVAILABLE
  - POST /api/community/posts：503 SERVICE_UNAVAILABLE
  - POST /api/projects/:slug/comments：201（成功）/ 400 VALIDATION_ERROR / 404 PROJECT_NOT_FOUND
  - POST /api/projects/:slug/like：400 VALIDATION_ERROR / 404 PROJECT_NOT_FOUND
  - POST /api/contact：201（成功，ok:true）/ 400 VALIDATION_ERROR

待办事项：

- admin 管理接口块（约 40 个 handler，含 requireAdmin 中间件 401/503）仍为裸 response.json，尚未 envelope 化，作为下一批迁移。
- store 缺失环境下 requireAuthStore 会先于 auth 校验返回 503，未登录 AUTH_REQUIRED(401) 路径需在配置了 DATABASE_URL 的环境中补测。

安全说明：

- 本轮没有部署 VPS，无需备份。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构、登录判断、session 生成、visitor token 或 ADMIN_TOKEN 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：Auth 与 Account 只读 API envelope 迁移

完成内容：

- 继续推进 API-first response envelope 迁移，新增覆盖 auth/account 只读接口：
  - GET /api/auth/me
  - GET /api/account/profile
  - GET /api/account/community
  - GET /api/account/downloads
  - GET /api/account/comments
- 新增 requireUser() 小 helper，用于只读 account 接口统一返回 AUTH_REQUIRED envelope。
- requireAuthStore() 的 visitor account store 缺失错误迁移为 SERVICE_UNAVAILABLE envelope。
- account 只读接口成功响应继续保持 legacy 顶层字段兼容：
  - user
  - profile
  - posts
  - uploads
  - requests
  - comments
  - likeCount
- 扩展 tests/api/contract.spec.js，API contract 覆盖从 8 个用例增加到 10 个用例。

验证结果：

- npm run test:api：通过，10 passed
- npm run build：通过
- npm run lint：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/auth/me：200
  - GET /api/account/profile：503
  - GET /api/account/community：503
  - GET /api/account/downloads：503
  - GET /api/account/comments：503

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改登录判断、session 生成、visitor token 或 ADMIN_TOKEN 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：Community 公开只读 API envelope 迁移

完成内容：

- 继续推进 API-first response envelope 迁移，新增覆盖 community 公开只读接口：
  - GET /api/community/uploads
  - GET /api/community/posts
  - GET /api/community/posts/:id
  - GET /api/community/posts/:id/comments
- 保持 legacy 顶层字段兼容：
  - uploads
  - posts
  - post
  - comments
- API_ERROR_CODES 新增 COMMUNITY_POST_NOT_FOUND。
- 将 community post 详情的不存在错误迁移为 COMMUNITY_POST_NOT_FOUND envelope。
- 扩展 tests/api/contract.spec.js，API contract 覆盖从 7 个用例增加到 8 个用例。

验证结果：

- npm run test:api：通过，8 passed
- npm run build：通过
- npm run lint：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/community/uploads：200
  - GET /api/community/posts：200
  - GET /api/community/posts/not-a-real-post：404
  - GET /api/community/posts/not-a-real-post/comments：200

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 本轮没有修改 visitor token 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：公开只读 API envelope 第二批迁移

完成内容：

- 继续推进 API-first response envelope 迁移，新增覆盖低风险公开只读接口：
  - GET /api/experience
  - GET /api/projects/:slug/interactions
  - GET /api/users/:handle/resources
  - GET /api/users/:handle/posts
  - GET /api/users/:handle/activity
- 保持 legacy 顶层字段兼容：
  - experience
  - comments
  - likeCount
  - resources
  - posts
- 将 /api/projects/:slug/interactions 的项目不存在错误迁移为 PROJECT_NOT_FOUND envelope。
- 将公开用户 activity 子接口的公开主页禁用错误迁移为 PROFILE_ADMIN_DISABLED envelope。
- 扩展 tests/api/contract.spec.js，API contract 覆盖从 5 个用例增加到 7 个用例。

验证结果：

- npm run test:api：通过，7 passed
- npm run build：通过
- npm run lint：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/experience：200
  - GET /api/projects/not-a-real-project/interactions：404
  - GET /api/users/not-exist-test-handle/resources：200
  - GET /api/users/not-exist-test-handle/posts：200
  - GET /api/users/not-exist-test-handle/activity：200

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 本轮没有修改 visitor token 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：API envelope 版本提交到 GitHub

提交内容：

- 提交 API envelope/contract 第一阶段代码、文档、测试配置和进度记录。
- 同步当前分支 codex/check-project-and-fix-errors 到 GitHub。
- 首次 HTTPS push 因当前环境无 GitHub HTTPS 凭据失败，未重复提交、未 reset、未 force push。
- 已验证本机 GitHub SSH key 可用，并将 origin 改为 git@github.com:rightamen/3d-portfolio.git。
- 已通过 SSH push 成功。

提交前验证：

- npm run build：已通过
- npm run lint：已通过
- npm run test:api：已通过，5 passed
- npx playwright test tests/e2e/production-smoke.spec.js：部署后已通过，6 passed，1 skipped
- git diff --check：通过

提交信息：

- e01f721 feat(api): add response envelope contract
- 远端分支：origin/codex/check-project-and-fix-errors

安全说明：

- 本轮没有 force push。
- 本轮没有 reset。
- 本轮没有修改生产 env 文件内容。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：API envelope 版本部署到 VPS

部署内容：

- 将 API envelope/contract 第一阶段和前端兼容解析版本部署到 VPS。
- release 包：.deploy-tools/mrright-portfolio-release.tar.gz
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260702-042140
- 线上目录：/opt/mrright-portfolio
- 服务名：mrright-portfolio
- 服务状态：active

部署前验证：

- npm run build：通过
- npm run lint：通过
- npm run release:vps：通过

部署安全检查：

- ADMIN_TOKEN=[set]
- DATABASE_URL=[set]
- 未输出 env value、token、数据库密码。
- 已备份 /opt/mrright-portfolio 到 /opt/mrright-portfolio.backup-20260702-042140。
- 保留 /etc/mrright-portfolio.env、data、public/uploads、backup。
- 未修改生产数据库密码。
- 未删除数据库、表、上传文件或备份目录。

部署后验证：

- systemctl is-active mrright-portfolio：active
- local /api/health：200
- local admin_summary：200
- https://mrright.blog/api/health：200，包含 data、pagination、error envelope 字段
- remote admin_summary：200
- https://mrright.blog/admin：200
- https://mrright.blog/community：200
- https://mrright.blog/login?mode=login：200
- https://mrright.blog/account：200
- npx playwright test tests/e2e/production-smoke.spec.js：通过，6 passed，1 skipped

Skip 原因：

- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD。

回退说明：

- 当前可回退备份目录：/opt/mrright-portfolio.backup-20260702-042140
- 如需回退，应先备份当前 /opt/mrright-portfolio，再用该备份目录恢复线上目录并重启 mrright-portfolio。

安全说明：

- 本轮按用户要求部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改生产 env 文件内容。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-07-02：API envelope 自动化测试复跑

测试内容：

- 复跑 API envelope 相关自动化测试。
- 复跑本地前端页面 smoke，验证前端 API helper 可消费 envelope 响应。
- 直接校验本地 API 关键接口状态和 envelope 必填字段。

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:api：通过，5 passed
- 本地 API 服务：PORT=4194 npm run dev:server，启动成功
- 本地 Web 服务：VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174，启动成功
- npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/health：200
  - GET /api/profile：200
  - GET /api/projects：200
  - GET /api/projects/not-a-real-project：404
  - GET /api/users/not-exist-test-handle：404

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改业务代码，只更新自动化测试记录。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-07-02：API envelope 兼容层收尾与验证

完成内容：

- 补齐 Web 前端 API helper 的 envelope/legacy 双兼容解析：
  - 成功响应优先展开 data，保留现有调用读取 profile、projects、project 等顶层字段的方式。
  - 错误响应兼容 legacy 字符串 error 和新 envelope error.code/error.message。
  - fetch 与 XMLHttpRequest 上传路径统一使用同一套错误解析，避免新错误对象显示为 [object Object]。
- 修正文档与实现不一致：
  - 非分页响应 pagination 统一记录为 {}。
  - sendError 文档签名改为 sendError(response, code, message, status = 400)。
- 修正项目列表异常错误码：
  - API_ERROR_CODES 新增 SERVICE_UNAVAILABLE。
  - /api/projects store 异常返回 SERVICE_UNAVAILABLE 和 503，不再误用 RESOURCE_FORBIDDEN。
- 复查 API-first 文档：
  - docs/API_CONTRACT.md
  - docs/API_ERRORS.md
  - docs/ARCHITECTURE.md

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:api：通过，5 passed
- git diff --check：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js 使用 E2E_BASE_URL=http://127.0.0.1:5174：页面渲染 5 passed，1 个 API status 子测试失败，原因是该子测试按同源请求 /api/*，本地 Vite 与 API 分端口运行时会请求到 Vite 端口，不代表 API envelope 失败。
  - curl --noproxy '*' http://127.0.0.1:4194/api/health：返回 200 envelope。

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 本轮没有修改 visitor token 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-07-01：API contract 校验层与测试

完成内容：

- 新增 server/contracts/responseValidator.js：
  - validateResponseShape()
  - 校验 data、pagination、error 必填。
  - 校验错误响应必须有 error.code 和 error.message。
  - 校验 pagination 必须是对象。
  - 校验 undefined 字段。
  - 校验顶层 key 只允许 envelope、迁移期兼容 key 和声明的 legacy key。
  - 校验 legacy 顶层字段必须同时存在于 data 中。
- 在 server/responses.js 的 sendData、sendPage、sendError 中接入轻量 runtime contract 检查。
  - 校验失败只 console.warn，不阻断请求。
  - 成功响应包含 data、pagination、error:null。
  - 错误响应包含 data:null、pagination、error.code、error.message。
  - 继续保留迁移期 legacy 顶层字段，保证现有 Web 前端兼容。
- 新增 docs/API_CONTRACT.md、docs/API_ERRORS.md、docs/ARCHITECTURE.md，记录 API-first 响应 envelope、错误码、资产模型和迁移阶段。
- 新增 tests/api/contract.spec.js：
  - 启动本地 API server。
  - 验证 /api/health、/api/profile、/api/projects、/api/projects/:slug、/api/users/:handle。
  - 验证 envelope 必填字段、错误码、legacy 兼容字段和顶层 key 白名单。
- 新增 npm run test:api 脚本。

安全说明：

- 本轮没有修改业务逻辑。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 权限逻辑。
- 本轮没有修改前端 UI。
- 本轮没有修改 Three.js 渲染逻辑。
- 本轮没有新增 npm 依赖。
- 本轮没有部署 VPS。
- 本轮没有 push GitHub。

## 2026-07-01：API-first response 层最小侵入第一阶段

完成内容：

- 新增 server/responses.js 统一响应工具层：
  - sendData(response, data, httpStatus)
  - sendPage(response, data, pagination, httpStatus)
  - sendError(response, code, message, httpStatus)
  - API_ERROR_CODES 常量包含 AUTH_REQUIRED、INVALID_TOKEN、PROFILE_ADMIN_DISABLED、RESOURCE_FORBIDDEN、PROJECT_NOT_FOUND、VALIDATION_ERROR、RATE_LIMITED、SERVICE_UNAVAILABLE。
- 仅迁移低风险 API 到 response helper：
  - GET /api/health
  - GET /api/profile
  - GET /api/projects
  - GET /api/projects/:slug
  - GET /api/users/:handle
- 保持 legacy 顶层字段兼容：
  - ok
  - service
  - profile
  - skills
  - projects
  - project
- 错误响应新增 envelope error.code/error.message，同时保留迁移期顶层 code/message。

安全说明：

- 本轮没有修改业务逻辑。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 权限逻辑。
- 本轮没有修改前端 UI。
- 本轮没有修改 Three.js 渲染逻辑。
- 本轮没有新增依赖。
- 本轮没有部署 VPS。
- 本轮没有 push GitHub。

## 2026-07-01：后台访客管理 E2E 覆盖部署到 VPS

部署内容：

- 将后台访客管理 E2E 覆盖增强版本部署到 VPS。
- 部署 commit：f11546c
- release 包：.deploy-tools/mrright-portfolio-release.tar.gz
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260701-004849
- 服务名：mrright-portfolio
- 服务状态：active

部署前验证：

- npm run build：通过
- npm run lint：通过
- npm run release:vps：通过

部署安全检查：

- ADMIN_TOKEN=[set]
- DATABASE_URL=[set]
- 未输出 env value、token、数据库密码。
- 已备份 /opt/mrright-portfolio。
- 保留 /etc/mrright-portfolio.env、data、public/uploads、backup。
- 未修改生产数据库密码。
- 未删除数据库、表、上传文件或备份目录。

部署后验证：

- local /api/health：200
- local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog/admin：200
- https://mrright.blog/community：200
- https://mrright.blog/login?mode=login：200
- https://mrright.blog/account：200
- GET https://mrright.blog/api/admin/visitors 无 token：401
- GET https://mrright.blog/api/account/downloads 未登录：401
- GET https://mrright.blog/api/account/comments 未登录：401
- npx playwright test tests/e2e/production-smoke.spec.js：通过，6 passed，1 skipped
- npx playwright test tests/e2e/admin-visitors.spec.js：通过，4 passed，3 skipped

Skip 原因：

- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD。
- admin visitors 有 token API 只读测试：缺少 E2E_ADMIN_TOKEN。
- admin visitors 详情敏感字段只读测试：缺少 E2E_ADMIN_TOKEN。
- admin visitors 本地写闭环测试：生产环境按安全规则 skip。

注意：

- 本轮按用户要求部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改业务代码。
- 本轮没有修改认证系统或 /admin 权限逻辑。
- 本轮没有执行生产写测试。

## 2026-07-01：后台访客管理 E2E 闭环补全与稳定性验证

完成内容：

- 继续完善 tests/e2e/admin-visitors.spec.js，把后台访客管理从可用状态补强为可验证闭环。
- API 安全与权限覆盖增强：
  - GET /api/admin/visitors 未登录返回 401。
  - 新增 page、limit、query、sort 等筛选参数未登录请求覆盖，确认返回 401 且不报 500。
  - 有 admin token 的列表筛选和详情敏感字段检查仍保留为可选只读测试，缺少 E2E_ADMIN_TOKEN 时自动 skip。
- UI 稳定性覆盖保持：
  - /admin 加载不白屏。
  - Visitors 列表、搜索框、筛选、排序、分页、详情入口存在。
  - Visitor Detail 可打开。
  - Overview、Comments、Posts、Resources、Downloads、Moderation Log tabs 均存在。
  - 新增所有详情 tabs 逐个点击切换检查，确认任意 tab 不白屏且不触发 console/network 500 错误。
  - 空访客列表状态不白屏。
- 管理操作闭环测试补强：
  - 写闭环现在强制要求 E2E_ADMIN_VISITOR_WRITE=1、localhost/127.0.0.1 baseURL、本地 admin token、E2E_TEST_DATABASE_URL。
  - E2E_TEST_DATABASE_URL 必须指向名称明显包含 test/e2e/local/dev 的数据库，且不能是 mrright_portfolio。
  - 无 test DB 时自动 skip，不报错。
  - 覆盖 admin 禁用公开主页后公开接口 403 PROFILE_ADMIN_DISABLED。
  - 覆盖 admin 禁用/恢复后 /u/:handle 前端页面壳不返回 500；公开主页权限状态以 /api/users/:handle 数据接口验证。
  - 覆盖 admin 恢复公开主页后公开接口可访问。
  - 资料清理从 bio/contacts 扩展到 avatar/banner/bio/contacts。
  - 通过 test DB 直接确认 avatar_url、banner_url、bio、public_email、contact_links、contacts_public、profile_admin_disabled 等字段变更。
  - 通过 test DB 直接确认 admin_user_actions 写入 profile_disabled 和 profile_fields_cleared，并包含 avatar/banner/bio/contacts 字段记录。

修改文件：

- tests/e2e/admin-visitors.spec.js
- PROJECT_PROGRESS.md

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，10 passed，4 skipped
- git diff --check：通过

Skip 原因：

- admin visitors 有 token API 只读测试：缺少 E2E_ADMIN_TOKEN，按安全规则 skip。
- admin visitors 详情敏感字段只读测试：缺少 E2E_ADMIN_TOKEN，按安全规则 skip。
- admin visitors 本地写闭环测试：未设置 E2E_ADMIN_VISITOR_WRITE=1，且默认 baseURL 是生产站点；没有 E2E_TEST_DATABASE_URL 时也会自动 skip。
- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD，按既有规则 skip。

安全说明：

- 本轮没有部署 VPS。
- 本轮按用户要求提交并同步 GitHub 远端分支。
- 本轮没有修改业务代码。
- 本轮没有修改 /admin 权限认证逻辑。
- 本轮没有修改 visitor token 或认证系统。
- 本轮没有操作线上数据库，没有执行线上写操作。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-06-25：后台访客管理自动化测试补充

完成内容：

- 将 /admin 访客用户管理的一次性本地 Playwright review 扩展为可重复运行的正式 E2E 覆盖。
- 在 tests/e2e/admin-visitors.spec.js 中新增 admin visitors API 只读/权限测试：
  - GET /api/admin/visitors 无 admin token 返回 401，且不是 500。
  - 有 admin token 的列表分页、query、verified、profileStatus、accessLevel、sort 参数测试已加入，但默认缺少 E2E_ADMIN_TOKEN 时自动 skip。
  - 访客详情敏感字段泄露检查已加入，但默认缺少 E2E_ADMIN_TOKEN 或无访客数据时自动 skip。
- 扩展后台 UI mock 冒烟测试：
  - /admin 可打开。
  - Visitors 区域、搜索框、4 个筛选/排序控件、Search 按钮、分页控件存在。
  - 用户列表不白屏，点击用户详情不白屏。
  - 详情 tabs 覆盖 Overview、Comments、Posts、Resources、Downloads、Moderation Log。
  - 新增空访客列表状态测试，确认 No visitors match these filters. 正常显示且页面不白屏。
- 新增本地安全写操作闭环测试骨架：
  - 仅在 E2E_ADMIN_VISITOR_WRITE=1、baseURL 为 localhost/127.0.0.1、并提供本地 admin token 时运行。
  - 默认 npm run test:e2e 下自动 skip，不会写生产数据。
  - 覆盖专用测试用户创建、管理员禁用公开主页、公开接口 403 PROFILE_ADMIN_DISABLED、用户尝试恢复仍被管理员禁用、清理 bio/contacts、admin_user_actions 审计记录、恢复公开主页。
  - 如果本地非生产服务不返回 dev verification code，则该闭环自动 skip。

修改文件：

- tests/e2e/admin-visitors.spec.js
- PROJECT_PROGRESS.md

验证结果：

- npm run build：通过
- npm run lint：通过
- npx playwright test tests/e2e/admin-visitors.spec.js：通过，3 passed，3 skipped
- npm run test:e2e：通过，9 passed，4 skipped
- git diff --check：通过

Skip 原因：

- admin visitors 有 token API 只读测试：缺少 E2E_ADMIN_TOKEN，按安全规则 skip。
- admin visitors 本地写闭环测试：未设置 E2E_ADMIN_VISITOR_WRITE=1，且默认 baseURL 是生产站点，按安全规则 skip。
- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD，按既有规则 skip。

注意：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改 /admin 权限认证逻辑。
- 本轮没有修改 visitor token 或 ADMIN_TOKEN 认证逻辑。
- 本轮没有操作线上真实用户，没有连接线上数据库做写操作。
- 本轮没有覆盖 /etc/mrright-portfolio.env。
- 本轮没有删除数据库、表、上传文件或备份目录。
- npm run build 首次运行时发现本地 node_modules 缺少 Rollup optional native package；执行 npm install 补齐本地依赖后 build 通过，package.json 和 package-lock.json 未改变。

## 2026-06-24：/admin 访客用户管理功能上线

部署信息：

- 使用 commit：f49b6e6
- release 包：已生成并上传到 /tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260624-051010
- 服务状态：mrright-portfolio active
- nginx 状态：active
- 部署前 env 检查：ADMIN_TOKEN=[set]，DATABASE_URL=[set]

Schema：

- schema 安全扫描：通过
- schema ensure：成功
- visitor_users 4/4 个新增字段存在
- admin_user_actions 表存在

验证状态码：

- /api/health：200
- admin_summary：200
- https://mrright.blog/：200
- https://mrright.blog/admin：200
- https://mrright.blog/account：200
- https://mrright.blog/community：200
- https://mrright.blog/u/not-exist-test-handle：200，页面正常，不是 500

Admin Visitors 接口：

- GET /api/admin/visitors：200
- GET /api/admin/visitors?page=1&limit=30：200
- GET /api/admin/visitors?query=test：200
- GET /api/admin/visitors/:id：200
- 未提供 admin token：401，符合预期，未出现 500

Playwright 线上冒烟：

- /admin 可打开
- Visitors 区域可显示
- 搜索/筛选/分页 UI 存在
- 点击用户详情不白屏
- /account 不受影响
- /community 不受影响

截图路径，仅记录，不提交：

- G:\Code\3d-portfolio\test-results\admin-visitors-production-smoke
- admin-visitors.png
- admin-visitor-detail.png
- account.png
- community.png
- u_not-exist-test-handle.png

错误检查：

- network 500：0
- 非预期 console error：0
- 有 1 个预期 404：/api/users/not-exist-test-handle，这是缺失公开主页测试的正常结果，不是页面崩溃

备注：

- 如果浏览器还显示旧版 /admin，需要 Ctrl+Shift+R 强制刷新一次
- GitHub push 仍待后续凭证可用时执行

## 2026-06-23: Local admin visitor management implementation

Completed locally:

- Added paginated visitor search, verification/profile/access filters, and sorting.
- Added lazy-loaded visitor detail with Overview, Comments, Posts, Resources, Downloads, and Moderation Log tabs.
- Added admin profile disable/restore controls and profile-field moderation for avatar, banner, bio, and contacts.
- Added compatible visitor moderation columns and the admin_user_actions audit table.
- Added paginated admin APIs for visitor details and visitor-owned content.
- Public profile, resource, post, and activity APIs now respect administrator profile disable state.
- Added zh/en/ja copy for the friendly administrator-disabled public-profile state.
- Added a local Playwright visitor-management review with mocked administrator data.

Validation:

- npm run build: passed
- npm run lint: passed
- npm run test:e2e: passed (6 passed, 2 skipped)
- Local admin visitor Playwright review: passed (1 passed)
- git diff --check: passed
- Browser review: /admin opens; /account, /community, and missing public profile remain available; no console errors observed.

Notes:

- No VPS deployment was performed.
- No GitHub push was performed.
- No production database or environment file was modified.
- Review screenshot: test-results/admin-visitors-review/admin-visitors.png (ignored by Git).

## 项目信息

- 项目目录：/mnt/g/Code/3d-portfolio
- GitHub 仓库：rightamen/3d-portfolio
- 当前分支：codex/check-project-and-fix-errors
- 域名：https://mrright.blog
- VPS：147.79.20.232
- 部署目录：/opt/mrright-portfolio
- 服务名：mrright-portfolio
- 数据库：mrright_portfolio
- env 文件：/etc/mrright-portfolio.env

## 当前线上状态

- /api/health：200
- admin_summary：200
- /admin：200
- /community：200
- /login?mode=login：200
- /account：200
- /api/account/downloads：未登录 401，正常
- /api/account/comments：未登录 401，正常

## 最近完成

### 2026-06-18：模型预览优化上线

完成内容：

- 模型预览 UI 已优化并部署上线
- 新增专业 loading overlay：百分比、加载文案、loading ring、大模型慢加载提示
- 新增 ModelErrorBoundary：模型失败时显示友好错误卡片和 Reload Model 按钮
- 新增工具栏：重置视角、全屏、自动旋转、Studio/Dark/Grid、信息面板开关
- 新增模型信息面板：名称、格式、模型大小、顶点、三角面、材质、贴图、bounds、下载权限
- 优化相机适配：bounding box、自动居中、相机位置、Orbit target、reset 回到最佳视角
- 优化移动端：降低 DPR、关闭移动端阴影、工具栏适配、信息面板适配手机
- 优化资源释放：dispose cloned geometry/material/texture，并清理 useGLTF cache
- 保持 lazy loading，没有首页预加载全部模型

修改文件：

- src/components/ModelPreview.jsx
- src/index.css
- src/lib/i18n.js

部署信息：

- 使用 commit：a5f3d401bd2615e8cf8b5fb29e4089376055576a
- release 包：.deploy-tools/mrright-portfolio-release.tar.gz
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260618-121102
- 服务状态：active

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed, 1 skipped
- npm run release:vps：通过
- VPS local /api/health：200
- VPS local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog/：200
- https://mrright.blog/admin：200
- https://mrright.blog/account：200
- https://mrright.blog/community：200

线上 Playwright 模型预览冒烟测试：

- 首页正常
- 模型预览弹窗正常打开
- loading 截图已捕获
- Canvas、工具栏、模型信息面板存在
- 人为拦截模型资源后，错误态显示 LOAD FAILED 和 Reload Model，页面未崩溃
- 未发现生产 500
- console：正常预览未发现明显 error；错误态测试中有预期模型资源 404

截图路径，仅记录，不提交：

- test-results/model-viewer-production-smoke/home.png
- test-results/model-viewer-production-smoke/model-preview-loading.png
- test-results/model-viewer-production-smoke/model-preview.png
- test-results/model-viewer-production-smoke/model-preview-error.png
- test-results/model-viewer-production-smoke/admin.png
- test-results/model-viewer-production-smoke/account.png
- test-results/model-viewer-production-smoke/community.png

备注：

- 截图文件不提交
- 浏览器如仍看到旧样式，需要 Ctrl+Shift+R 强制刷新
- GitHub push 仍待后续凭证可用时执行

### 2026-06-18：UI 视觉升级已部署到 VPS

本地 commit：

- afc0838a8dc90f2fb572b08e02cb9c9ed6c32f00

完成内容：

- 将本地 UI 视觉升级 release 包上传到 VPS 并部署到 /opt/mrright-portfolio。
- 部署前按要求运行 npm run build、npm run lint、npm run test:e2e、npm run release:vps。
- 部署前仅检查 ADMIN_TOKEN 和 DATABASE_URL 为 [set]，未输出 value。
- 部署前已备份 /opt/mrright-portfolio。
- 部署未覆盖 /etc/mrright-portfolio.env，未修改数据库密码，未删除数据库、表、data、public/uploads 或备份目录。
- 本轮未重新 commit，未 push GitHub。

release 包：

- .deploy-tools/mrright-portfolio-release.tar.gz：生成成功
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz

备份路径：

- /opt/mrright-portfolio.backup-20260618-111302

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- npm run release:vps：通过
- VPS service active：active
- VPS local /api/health：200
- VPS local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog admin_summary：200
- https://mrright.blog/：200
- https://mrright.blog/account：200
- https://mrright.blog/login?mode=login：200
- https://mrright.blog/admin：200
- https://mrright.blog/community：200
- https://mrright.blog/u/not-exist-test-handle：200，页面显示缺失资料友好错误
- 线上 500 错误数量：0
- console error：仅 /u/not-exist-test-handle 缺失用户接口返回 404，属于预期缺失资料页场景

截图路径：

- test-results/ui-production-smoke/home.png
- test-results/ui-production-smoke/account.png
- test-results/ui-production-smoke/login.png
- test-results/ui-production-smoke/admin.png
- test-results/ui-production-smoke/community.png
- test-results/ui-production-smoke/public-profile-missing.png

注意：

- 截图文件未提交。
- 若用户浏览器仍看到旧 CSS/JS，可执行 Ctrl+Shift+R 强制刷新。

### 2026-06-18：本地 UI 视觉升级完成

本地 commit：

- 未提交

完成内容：

- 联网参考现代 3D portfolio、YouTube 频道页、YouTube Studio、Dribbble/Behance 深色 SaaS dashboard 风格后，完成本地 UI 视觉升级。
- 首页 /：增强 hero 层次、3D 氛围、按钮、标签、筛选和作品卡片质感。
- /account：升级为更接近 YouTube Studio + 个人资料中心的深色 dashboard 视觉。
- /u/:handle：增强频道页式封面、头像、handle、简介、链接、tabs 和内容卡片层级。
- /community：升级为现代社区流布局，优化帖子卡片、统计、上传区和资源卡片。
- /login?mode=login：升级为独立玻璃登录面板，统一品牌区、模式切换、输入框和按钮视觉。
- 未新增依赖，未修改服务端认证逻辑，未修改数据库 schema，未部署 VPS，未 push GitHub。

新增/修改文件：

- src/App.jsx
- src/components/HeroText.jsx
- src/index.css
- src/pages/AccountPage.jsx
- src/pages/AuthPage.jsx
- src/pages/CommunityPage.jsx
- src/pages/PublicProfilePage.jsx
- src/sections/Hero.jsx

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- git diff --check：通过
- 本地 Express 预览截图：通过，页面非白屏
- 本地截图检查 500：未发现 500
- console error：仅 /u/not-exist-test-handle 缺失用户接口返回 404，属于预期缺失资料页场景

截图路径：

- test-results/ui-review/home.png
- test-results/ui-review/community.png
- test-results/ui-review/login.png
- test-results/ui-review/account.png
- test-results/ui-review/public-profile-missing.png
- test-results/ui-review/mobile-home.png
- test-results/ui-review/mobile-community.png
- test-results/ui-review/mobile-login.png
- test-results/ui-review/mobile-account.png
- test-results/ui-review/mobile-public-profile-missing.png

注意：

- 本轮只做本地 UI 改版。
- 未写入任何真实用户数据。
- 未输出或修改 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。

### 2026-06-18：线上 Playwright 冒烟测试完成

本地 commit：

- 本次提交（最终 hash 以 git log 为准）

完成内容：

- 对线上 YouTube 式用户个人中心 / 公开主页功能完成 Playwright 冒烟测试。
- 测试过程未登录真实账号、未修改线上数据、未上传文件。
- 本轮测试未提交代码、未部署 VPS、未 push GitHub。

测试结果：

- https://mrright.blog/：打开成功，非白屏
- https://mrright.blog/community：打开成功，非白屏
- https://mrright.blog/login?mode=login：打开成功，登录表单正常
- https://mrright.blog/account：打开成功，未登录提示正常
- https://mrright.blog/u/not-exist-test-handle：打开成功，显示 Profile Not Found 友好错误
- /api/health：200
- /api/account/profile：未登录 401，正常
- /api/account/downloads：未登录 401，正常
- /api/account/comments：未登录 401，正常
- /api/users/not-exist-test-handle：404，正常
- 线上 500 错误数量：0

截图路径：

- test-results/smoke/home.png
- test-results/smoke/community.png
- test-results/smoke/login.png
- test-results/smoke/account.png
- test-results/smoke/public-profile-missing.png

注意：

- test-results/ 和 playwright-report/ 已加入 .gitignore。
- 截图文件未提交。

### 2026-06-18：新增正式 Playwright E2E 冒烟测试

本地 commit：

- 未提交

完成内容：

- 新增 Playwright 测试配置 playwright.config.js。
- 新增正式 E2E 测试 tests/e2e/production-smoke.spec.js。
- 新增 npm run test:e2e、npm run test:e2e:headed、npm run test:e2e:report 脚本。
- 新增 @playwright/test 开发依赖并更新 package-lock.json。
- E2E 覆盖：
  - 首页 /
  - /community
  - /login?mode=login
  - /account 未登录状态
  - /u/not-exist-test-handle 公开用户页 404/友好错误
  - /api/health 200
  - /api/account/profile 未登录 401
  - /api/account/downloads 未登录 401
  - /api/account/comments 未登录 401
  - /api/users/not-exist-test-handle 404
- 新增可选登录冒烟测试，仅使用 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD；未设置环境变量时自动 skip。

新增/修改文件：

- package.json
- package-lock.json
- playwright.config.js
- tests/e2e/production-smoke.spec.js

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- VPS 部署：未部署
- GitHub push：未执行

注意：

- 未写入真实账号或密码。
- 测试只做页面渲染和只读 API 状态检查，不登录、不上传、不修改线上数据。
- 首次运行 E2E 时安装了 Playwright Chromium 浏览器运行时。

### 2026-06-18：访客个人中心升级为公开资料中心

本地 commit：

- 74369497099d184b6ffef8e7e419eaab97628146

完成内容：

- 将 /account 设置页升级为类似 YouTube 频道资料中心，可编辑头像、封面图、显示名称、handle、简介、所在地、网站、公开邮箱、社交链接和隐私开关。
- 新增公开个人主页路由 /u/:handle，包含封面、头像、简介、公开联系方式、统计和 Overview/Resources/Posts/Comments/About tabs。
- 新增访客私有 API：
  - GET /api/account/profile
  - PUT /api/account/profile
  - POST /api/account/avatar
  - POST /api/account/banner
- 新增公开 API：
  - GET /api/users/:handle
  - GET /api/users/:handle/activity
  - GET /api/users/:handle/resources
  - GET /api/users/:handle/posts
- 兼容扩展 visitor_users 资料字段，使用 ALTER TABLE ADD COLUMN IF NOT EXISTS。

新增/修改文件：

- server/index.js
- server/postgresStores.js
- src/App.jsx
- src/lib/api.js
- src/lib/i18n.js
- src/pages/AccountPage.jsx
- src/pages/PublicProfilePage.jsx
- src/index.css

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run release:vps：通过
- git diff --check：通过
- VPS 部署：成功
- 服务重启：成功
- /api/health：200
- admin_summary：200
- /：200
- /account：200
- /login?mode=login：200
- /admin：200
- /community：200
- /api/account/profile：未登录 401，正常
- /api/account/downloads：未登录 401，正常
- /api/account/comments：未登录 401，正常
- /api/users/not-exist-test-handle：404，正常
- 线上 Playwright 冒烟测试：通过
- 线上 /：200，页面正常
- 线上 /community：页面正常
- 线上 /login?mode=login：页面正常
- 线上 /account：未登录提示正常
- 线上 /u/not-exist-test-handle：显示 Profile Not Found
- 线上 /api/health：200
- 线上 /api/account/profile：未登录 401，正常
- 线上 /api/account/downloads：未登录 401，正常
- 线上 /api/account/comments：未登录 401，正常
- 线上 /api/users/not-exist-test-handle：404，正常
- 线上 500 错误数量：0
- 线上冒烟测试截图路径：test-results/smoke/
- GitHub push：未执行

备份路径：

- /opt/mrright-portfolio.backup-20260618-053201

注意：

- 未修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 访客中心继续使用 visitor token。
- 公开接口不返回 visitor token，不默认暴露真实邮箱；只有 public_email 且 contacts_public 开启时才公开联系邮箱。
- 头像和封面上传保存到 public/uploads/avatars 与 public/uploads/banners，不删除旧文件。
- 部署时 env 仅检查 ADMIN_TOKEN 和 DATABASE_URL 为 [set]，未输出 value。

### 2026-06-18：项目规则、进度记录和 Claude 自动化命令本地提交

本地 commit：

- 本次提交（最终 hash 以 git log 为准）

完成内容：

- 新增项目协作规则 AGENTS.md。
- 新增 Claude 自动化规则 CLAUDE.md。
- 新增 PROJECT_PROGRESS.md 作为项目进度记录。
- 新增 .claude/commands/ 下的自动化命令。
- 将 .claude/settings.local.json 加入 .gitignore，避免提交本地设置。

验证结果：

- 敏感信息扫描：未发现实际 token、密码、ADMIN_TOKEN value、DATABASE_URL value、GitHub token 或 VPS 密码。
- npm run build：未运行（未修改业务代码）。
- npm run lint：未运行（未修改业务代码）。
- VPS 部署：未部署。
- GitHub push：未执行。

注意：

- 未提交 .claude/settings.local.json。
- 未修改业务代码。

### 2026-06-17：访客个人中心改版上线

本地 commit：

- 98cae36

完成内容：

- 将 /account 改成与 /admin 风格统一的访客版后台中心
- 新增访客只读接口：
  - GET /api/account/downloads
  - GET /api/account/comments
- 新增/修改文件：
  - server/postgresStores.js
  - server/index.js
  - src/lib/api.js
  - src/lib/i18n.js
  - src/pages/AccountPage.jsx
  - src/index.css

验证结果：

- npm run build：通过
- npm run lint：通过
- VPS 部署：成功
- 服务重启：成功
- 新版 /account：已上线

备份路径：

- /etc/mrright-portfolio.env.backup-20260617-045006
- /opt/mrright-portfolio.backup-20260617-045006

注意：

- GitHub push 跳过，因为当前环境无法读取 GitHub 凭证
- 后续本机有 GitHub 凭证时执行：
  git push origin codex/check-project-and-fix-errors

## 固定安全规则

1. 不要输出 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。
2. 不要覆盖 /etc/mrright-portfolio.env。
3. 不要重置数据库密码，除非用户明确要求。
4. 不要删除数据库、表、上传文件、备份目录。
5. 不要 force push。
6. 不要 reset，除非用户明确要求。
7. 修改代码后必须运行 npm run build 和 npm run lint。
8. 部署前必须备份 /opt/mrright-portfolio。
9. 部署前必须确认 ADMIN_TOKEN 和 DATABASE_URL 都是 [set]，但不要输出 value。
10. 部署后必须验证 /api/health、admin_summary、/admin、/community、/login、/account。
11. GitHub push 失败时，不要重复 commit，不要 reset，只说明原因。
