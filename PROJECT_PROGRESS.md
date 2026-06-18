# mrright.blog 项目进度记录

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

### 2026-06-18：模型预览优化已部署上线

本地 commit：

- a5f3d401bd2615e8cf8b5fb29e4089376055576a

完成内容：

- 将 3D 模型预览优化 release 包上传到 VPS 并部署到 /opt/mrright-portfolio。
- 部署前按要求运行 npm run build、npm run lint、npm run test:e2e、npm run release:vps。
- 部署前仅检查 ADMIN_TOKEN 和 DATABASE_URL 为 [set]，未输出 value。
- 部署前已备份 /opt/mrright-portfolio。
- 部署未覆盖 /etc/mrright-portfolio.env，未修改数据库密码，未删除数据库、表、data、public/uploads 或备份目录。
- 本轮未重新 commit，未 push GitHub。

release 包：

- .deploy-tools/mrright-portfolio-release.tar.gz：生成成功
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz

备份路径：

- /opt/mrright-portfolio.backup-20260618-121102

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- npm run release:vps：通过
- VPS service active：active
- VPS local /api/health：200
- VPS local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog/：200
- https://mrright.blog/admin：200
- https://mrright.blog/account：200
- https://mrright.blog/community：200
- 线上 Playwright 模型预览冒烟测试：首页正常。
- 线上 Playwright 模型预览冒烟测试：模型预览弹窗正常打开。
- 线上 Playwright 模型预览冒烟测试：loading 截图已捕获。
- 线上 Playwright 模型预览冒烟测试：Canvas、工具栏、模型信息面板存在。
- 线上 Playwright 模型预览冒烟测试：人为拦截模型资源后，错误态显示 LOAD FAILED 和 Reload Model，页面未崩溃。
- 线上 Playwright 模型预览冒烟测试：未发现生产 500。
- console：正常预览未发现明显 error；错误态测试中有预期模型资源 404。

截图路径：

- test-results/model-viewer-production-smoke/home.png
- test-results/model-viewer-production-smoke/model-preview-loading.png
- test-results/model-viewer-production-smoke/model-preview.png
- test-results/model-viewer-production-smoke/model-preview-error.png
- test-results/model-viewer-production-smoke/admin.png
- test-results/model-viewer-production-smoke/account.png
- test-results/model-viewer-production-smoke/community.png

注意：

- 截图文件未提交。
- 若用户浏览器仍看到旧 CSS/JS 或“页面资源正在更新”，可执行 Ctrl+Shift+R 强制刷新。

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
