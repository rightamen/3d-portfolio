# mrright.blog 项目进度记录

## 下次从这里继续（截至 2026-08-14 第十一轮收工）

**线上运行 `9daf048`（2026-08-13 16:20 UTC 部署，已逐项验证）。
本地领先 `origin/main` 五个 commit —— 还没 push。**

### 收工时的未完项（第十、十一轮合并，按优先级）

1. **用户自己在 /admin → Security 走完一次真实绑定**，确认扫码与切换成功。
   成功路径需要 `right` 的账号密码，密码不进对话，所以这一步只能由用户完成。
   出问题就直接关页面 —— 两步式设计保证原有绑定不受影响。
2. **`git push`**：本地领先 `origin/main` 五个 commit
   （`edf33da` 模型修复、`c6075dd` 第十轮记录、`9daf048` 绑定页、
   `4caa339` + `918a29d` 第十一轮记录）。线上跑的代码目前只存在于本机和 VPS。
3. **`public/assets/environments/studio-tomoco.exr` 不是 EXR 文件**（第十轮挖出）。
   文件头是 UTF-16 文本 `resource_ver...`，`file(1)` 判定为 `data`，
   所以 Studio 环境光（IBL）从来没生效过，且每次打开模型预览都会在 console 留一条
   `Cannot read properties of undefined (reading 'image')`。
   修它需要一张真的 HDRI/EXR，属于美术资产决定。
4. 4K 基础色 + 法线在移动端显存占用不小；真有人反馈卡，重跑
   `scripts/optimize-model.mjs` 出 2K 版（2.12 MB）即可。
5. 其它三个项目的模型预览只点开验证了第一个，其余未逐个确认。

第十一轮：**在 `/admin` 里做了自助重新绑定认证器的页面，带真正的二维码。**
起因是「我为什么从来没见过什么二维码」—— 查下来是这个项目里**根本就没有过二维码**：
CLI 的 `printEnrolment` 只打印文本密钥，`/admin` 连这个都不显示，
所以此前每个账号都是手输 base32 绑上去的，丢手机只能 SSH 上服务器跑 `reset-totp`。
详见下面「2026-08-14（第十一轮）」。

⚠️ **`9daf048` 含一处 schema 变更**（`admin_users` 加 `pending_totp_secret` /
`pending_totp_expires_at`，`ADD COLUMN IF NOT EXISTS`，服务启动时自动执行）。
部署即生效，无需手工跑 SQL；回滚只需回到上一个备份目录，多出来的两列不影响旧代码。

第十轮起因是一句「模型加载太慢，是服务器太差吗」。**不是慢，是根本加载不出来**：
次世代灭火器的 3D 预览会把 42.4 MB 下完，然后在解析阶段失败、永远停在 86%，
右侧顶点/三角面/材质全是 `Unknown`。原因是 drei 的 `useGLTF` 默认去
`www.gstatic.com` 取 Draco 解码器，而本站 CSP 是 `connect-src 'self'`，
请求被自己拦掉，报错只出现在没人看的 console 里。**任何 Draco 模型都会这样，
包括社区上传的。** 详见下面「2026-08-13（第十轮）」。

⚠️ 教训：第七轮记的「本地和线上（含真实模型预览）全部验证通过」是**不成立的** ——
当时只确认了页面能开、没有 CSP 上报，没有确认模型**真的渲染出来**。
以后验证模型预览，必须看顶点/三角面这些统计值是不是有数字。

第九轮做的是「下一轮建议」里的第 1 项：**命名管理员账号 + TOTP + 审计归因**
（详见下面「2026-08-13（第九轮）」）。至此「管理员」不再等于「知道 `ADMIN_TOKEN` 的人」：
用户名 + 密码 + 6 位码换会话，会话指向具体的人，动作写进 `admin_user_actions.actor_admin_user_id`。
静态 token 降级为**引导 / 救援凭证** —— 它仍能换会话（否则第一个账号无从创建），
但用它做的每件事在审计里都记为「无人」，`/admin` 页头会明说这一点。

**第一个管理员账号 `right` 已于 2026-08-13 12:30 UTC 创建并实测登录通过**
（`totp:confirmed`，10 枚恢复码未用）。创建时的密码 / TOTP secret / otpauth URL / 恢复码
写在 VPS 上一个 root 专属（`chmod 600`）的一次性文件里，**取走后就该 `shred -u` 删掉**，
路径当面给过，不写进这个仓库。

后续要加人或救援，都在 VPS 上跑（密码从终端读，不走 argv）：

```sh
cd /opt/mrright-portfolio
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' /etc/mrright-portfolio.env | cut -d= -f2-)"
node scripts/admin-user.mjs list
node scripts/admin-user.mjs create <用户名> --display-name "名字"
node scripts/admin-user.mjs reset-password <用户名>   # 忘了密码
node scripts/admin-user.mjs reset-totp <用户名>       # 换手机 / 怀疑泄露
```

只取 `DATABASE_URL` 这一行，而不是 `. /etc/mrright-portfolio.env` 整份 source：
整份 source 会把 `ADMIN_TOKEN` 等一并灌进当前 shell 及其所有子进程的环境，
这个脚本只需要数据库连接。（那份 env 本身是可以被 source 的，没有含空格的裸值，
这里是范围最小化，不是绕开语法问题。）

上一轮（第八轮）：**把密钥认证的部署路径固化进 `npm run deploy:vps`**，
所以这次部署是直接一条命令跑完的，不用再手工拼远端脚本。
新文档：`docs/OPERATIONS_DEPLOY.md`（部署方式、环境变量、干跑、测试、回滚）。

### 第七轮（2026-08-12）的三件事，仍然有效

**线上曾运行 `2cdb97d`（2026-08-12 14:09 UTC 部署，已逐项验证）。**

那一轮做完三件事，并且**把积压的「待你决策」清单清空了**（详见下面「2026-08-12（第七轮）」）：

1. **CSP 已从 report-only 切成 blocking 并上线。** report-only 期间只报了两条违规，
   两条都是策略自己写漏了：补 `scriptSrc: ["'self'", "'wasm-unsafe-eval'"]` 与
   `connectSrc: ["'self'", 'blob:']` 后切换，本地和线上（含真实模型预览）全部验证通过，
   部署后收集器 0 上报。`report-uri` 保留，它是没走到的代码路径唯一的报警渠道。
2. **DMARC 已上线并实测 PASS**（方案 B：Cloudflare Email Routing 把 `dmarc@mrright.blog`
   转发到 Gmail，`rua` 指向这个同域地址）。**用户已在 Gmail「显示原始邮件」确认
   SPF / DKIM / DMARC 三行全 PASS。**
3. **两个遗留物清掉了**：`sniproxy.service`（10 天失败 13176 次的重启循环）已停用；
   `/etc/nginx/proxy.conf`（从没被加载过的 Docker 镜像加速模板）已移出 `/etc/nginx`。

**回退办法**：`server/index.js` 的 `contentSecurityPolicy` 里加回 `reportOnly: true`
即可退回只观察不拦截；或直接回滚到 `/opt/mrright-portfolio.backup-20260812-140940`。

~~**注意部署方式变了**：`npm run deploy:vps` 在这台机器上跑不了~~ ——
**2026-08-13 第八轮已固化，这条限制不再成立。** 直接 `npm run deploy:vps` 即可（默认密钥认证）。

### 上一轮（第六轮）的三件事，仍然有效

1. 应用备份改硬链接 + 自动保留策略 —— 一份备份 351M → **34M**，磁盘 49% → **42%**
2. 修掉部署脚本里一个**一直存在的健康检查竞态**（第一次部署就是被它挂掉的）
3. **`ADMIN_ALLOW_STATIC_TOKEN=false` 已收紧并上线** —— 静态管理员令牌现在只能换会话，
   不能直调 API。回退办法见 `docs/OPERATIONS_ADMIN_AUTH.md` 第 2 步。

**收紧后如果要手动调管理端 API，必须先换会话**（直接带静态令牌会 401）：

```sh
SESSION=$(curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://mrright.blog/api/admin/session \
  | node -e 'let s="";process.stdin.on("data",d=>{s+=d}).on("end",()=>process.stdout.write(JSON.parse(s).data.session.token))')
curl -s -H "Authorization: Bearer $SESSION" https://mrright.blog/api/admin/summary
curl -s -X DELETE -H "Authorization: Bearer $SESSION" https://mrright.blog/api/admin/session  # 用完吊销
```

**MCP 已确认可用：** `mrright-ops` 与 `playwright` 在第七轮的新会话里都正常工作
（第六轮重新写入 `~/.claude.json` 的 `mcpServers` 之后需要开新会话才生效，现已生效）。
CSP 这件事能做完，就是因为 playwright 回来了。

### 待你决策的（我没有权限或不该替你决定）

**空了 —— 2026-08-12 第七轮把积压的四项全部结清。** 下面是它们各自的去向。

**已由你拍板、不再是未决项的：**

- ~~`/etc/nginx/proxy.conf`~~ —— **2026-08-12 已查清并清理，顺带纠正了一条我们自己写错的记录。**
  **它并没有「占用 443」** —— 之前几轮一直这么写，是错的。它**根本没被 nginx 加载**：
  `nginx -T` 列出的加载文件只有 `nginx.conf` / `mime.types` / `modules-enabled/50-mod-stream.conf` /
  `sites-enabled/mrright-portfolio` / `sites-enabled/mrright-portfolio-internal-ssl` /
  `stream-conf.d/mrright-sni.conf`，而 nginx.conf 的 include 只覆盖 `conf.d/*.conf`、
  `sites-enabled/*`、`stream-conf.d/*.conf`、`modules-enabled/*.conf`，**没有一条匹配得到它**。
  最干净的反证：它的证书路径是占位符 `<your 'domain.pem' path>`，
  **一旦被加载 `nginx -t` 必然失败**，而每次部署 `nginx -t` 都是通过的。
  内容是从没填过的 Docker Hub 镜像加速模板（`proxy_pass https://registry-1.docker.io`，
  `server_name <write your domain>`），文件停在 2024-09-22。
  处置：**不删，移出 `/etc/nginx`** → `/root/legacy-nginx-proxy.conf.20260812.bak`
  （万一将来谁加了 `include /etc/nginx/*.conf` 也不会被误捡）。
  **全程没有 reload nginx** —— 它本来就没被加载，没有理由为它去动 443。
  移动后复验：`nginx -t` 通过、加载文件列表一字未变、80/443 仍 3 个监听、
  `/` 200、`/community` 200、`/api/health` 200。
- ~~DMARC 记录~~ —— **2026-08-12 已添加、上线并端到端实测通过**（方案 B，报告收在自己域内）。
  `_dmarc.mrright.blog` = `v=DMARC1; p=none; rua=mailto:dmarc@mrright.blog`。
  **用户已在 Gmail「显示原始邮件」确认 DMARC = PASS**（第一封显示 FAIL 是 DNS 否定缓存，
  不是配置错，原因见下方第七轮记录）。此项完全结案。

- ~~备份异地副本~~ —— **2026-08-12 你明确答复「不需要异地备份」，此项关闭。**
  保留一句风险说明作为背景，不再当作待办：备份与数据库仍在同一块磁盘上，
  硬链接备份防得住误删（`unlink` 只减链接数），但**磁盘或文件系统损坏会让 live
  和全部备份一起没**。`docs/OPERATIONS_BACKUP.md` 里的 rclone 方案留着，哪天改主意可直接用。
- ~~`sniproxy.service` 无限重启失败~~ —— **2026-08-12 已按你的指示停用**，见下方第七轮记录。

### 下一轮我建议先做的

1. ~~管理员账号体系 + TOTP~~ —— **2026-08-13 第九轮已完成并上线**。剩下的收尾（都不大）：
   - **审计归因目前只覆盖两条路径**（资料可见性、资料字段清理），因为只有这两处会写
     `admin_user_actions`。要扩大覆盖面，得先给其他管理动作补审计写入。
   - 没有「改自己密码」的接口，只能用 CLI `reset-password`。
2. ~~把密钥认证的部署路径固化进 `scripts/deploy-vps.mjs`~~ —— **2026-08-13 第八轮已完成并实测部署**。
3. 拆 `Admin.jsx`（2492 行）与 `postgresStores.js`（3338 行）
4. react-router（现在靠 `window.location.pathname` 判断，页面跳转全是整页刷新，3D 场景每次重建）
5. 前端单元测试（目前只有 API 契约测试和 Playwright）
6. SSR / 预渲染 SEO（社区帖子和公开主页搜索引擎抓不到）
7. Asset Model（checksum / visibility / downloadPolicy）稳定后再回到 C++ SDK
8. 下次恢复演练建议在 2026-11 之前（`docs/OPERATIONS_BACKUP.md` 要求每季度一次）
9. CSP 还可以再紧一格：`style-src` 现在带 `'unsafe-inline'`（Tailwind 与 three.js 的内联样式），
   要去掉得先上 nonce 或 hash，不是小改动，暂不动。

### 环境事实，省得下次重查

- **不装 MCP 也能干 VPS 的活。** `mrright-ops` 本质就是 `ssh -o BatchMode=yes root@147.79.20.232`，
  本机 SSH 密钥可直连，Bash 里直接用即可。
- **本机 `grep` 是个 shell function**（Claude Code 装的，转发到 claude 二进制），而那个
  native 二进制没装好，所以直接跑 `grep` 会报 "claude native binary not installed"。
  用 `/usr/bin/grep` 或 `command grep` 绕过。
- **本机有 `http_proxy=http://172.29.176.1:7897`**（WSL 指向 Windows 宿主），
  所以 curl 访问 `127.0.0.1` 会被劫持成 502；沙箱还会阻断子进程访问 localhost。
  测本地服务时要注意这两点。
- **但 playwright MCP 的浏览器能访问 `http://127.0.0.1:<port>`**（第七轮实测）。
  它是独立进程，不受上面那个沙箱限制 —— 所以「本地起服务 + 浏览器验证」这条路是通的，
  不用拿线上冒险。
- **服务端不设 `DATABASE_URL` 也能起**（`server/index.js:108` 是三元回落到内存 store），
  想在本地跑真实构建验证前端行为时很有用，社区/后台会降级但页面照常渲染。
- **`npm run deploy:vps` 现在在这台机器上能跑**（2026-08-13 第八轮起，默认走 SSH 密钥认证，
  默认主机 `147.79.20.232`）。想先看远端脚本而不连服务器：`VPS_DRY_RUN=true npm run deploy:vps`。
  完整说明见 `docs/OPERATIONS_DEPLOY.md`。

## 第五轮收工时的快照（2026-08-11，已冻结，不要照着它动手）

> **这一节是历史，不是当前状态。** 待办与决策清单已在上面的「下次从这里继续」里重新整理过；
> 这里保留原文只是为了看得到当时的判断。当时线上跑的是 `47d1cfc`，
> 下面第 3、5 两项都已在第六轮完成。

**当时已经不需要再排查的事（这部分仍然有效）：**

- 真实客户端 IP 拿不到 —— 原因已查明（443 与机场节点共用 SNI 分流），**已决定不修**，
  已用不依赖 IP 的方案补偿。见 `docs/OPERATIONS_CLIENT_IP.md`。**动 nginx 或 443 之前必读这份文档。**
- 2026-07-25 审查的 7 项 —— 全部确认修复并已上线，包括线上 `/api/v1` 严格信封确实生效。

**待你决策的（我没有权限或不该替你决定）：**

1. ~~配置 SMTP~~ —— **2026-08-11 第五轮已完成并端到端验证通过**（Resend）。
   密码重置邮件已实测**直达 Gmail 收件匣，未进垃圾箱**。详见下方第五轮记录。
   仅剩一项可选加固：**DMARC 记录仍未添加**（不加也能进收件匣，加了更稳）：
   `_dmarc.mrright.blog` TXT `v=DMARC1; p=none; rua=mailto:<你的邮箱>`。
2. **备份异地副本**（现在是最优先的未决项）。当前备份和数据库在同一块磁盘上，磁盘坏了两者一起没。
   恢复演练已证明备份**内容**可还原，但没有解决**同盘**这个单点。
   `docs/OPERATIONS_BACKUP.md` 里有 rclone 方案。
3. ~~`/opt/mrright-portfolio.backup-*` 的保留策略~~ —— **2026-08-12 第六轮已完成并上线**：
   硬链接备份 + 保留最近 3 份的自动裁剪。一份 351M → 34M，磁盘 49% → 42%。
   历史：2026-08-11 第四轮按你的指示手工清理过一次，15 份删到 3 份，磁盘 78% → 49%。
4. ~~**`/etc/nginx/proxy.conf`**~~ —— **2026-08-12 第七轮已查清并清理。**
   **当时写的「占用 443」是错的**：`nginx -T` 证明它根本没被加载。详见顶部说明。
5. ~~设 `ADMIN_ALLOW_STATIC_TOKEN=false`~~ —— **2026-08-12 第六轮已完成并上线**。
   卡住它的两个调用方（部署脚本、admin E2E 套件）已改成先换会话再调 API。
6. ~~CSP 切 blocking~~ —— **2026-08-12 第七轮已完成并上线**，见下方第七轮记录。

**路线图** —— 已上移到顶部「下一轮我建议先做的」，不在这里维护，免得两份清单各走各的。
这一轮当时勾掉的两项留作记录：

- ~~恢复演练~~ —— 2026-08-11 第四轮已完成，顺带修好了文档里一个从来没能跑通的步骤。
- ~~演练遗留的临时库~~ —— 用户已确认，`mrright_restore_drill` 已 `dropdb`（2026-08-11）。
  删除后复查：`mrright_portfolio` 仍在、17 张表、`visitor_users=1`/`project_comments=2`、
  `/api/health` 200，生产库未受影响。

## 2026-08-14（第十一轮）：自助换认证器 + 补上从来没有过的二维码

日期：2026-08-14
commit：`9daf048`

### 完成内容

`/admin` 新增 **Security** 标签页：填用户名 + 账号密码 → 显示二维码（外加可手输的
base32 密钥）→ 扫码后输入 6 位码 → 完成切换，并一次性给出新恢复码。

**为什么是两步而不是一步。** 新密钥先作为候选存进 `pending_totp_secret`，
放在还在用的密钥**旁边**，只有用候选生成的码验证通过才替换 `totp_secret`。
一步式重置会把「扫错 / 扫漏 / 中途关页面」直接变成锁死账号 ——
而那正是这条流程要救的处境。**中途放弃，原来的认证器照常能登录。**
提升动作是单条带条件的 UPDATE，所以两个并发确认不会互相覆盖。

**为什么两步都要密码。** 光有 admin 会话不够：共享令牌开出来的会话背后没有具体的人，
不能让它把某个具名账号的第二因素挪到新设备上。用户名不存在与密码错返回完全一致的
响应（且都跑一次 pbkdf2），不做账号枚举器。确认步骤收 6 位码，而账号锁定只统计**登录**
失败、盖不住这里，所以这两个路由自带限流（`ADMIN_TOTP_ENROL_LIMIT_PER_WINDOW`，
默认 15 分钟 10 次）。

**不吊销现有会话**，与 `reset-password` 一致：这条流程是「手机丢了」的恢复；
CLI 的 `reset-totp` 是「怀疑泄露」的响应，那个才需要把别人踹下线，两者刻意不同。

二维码用动态 import，落在单独的 25.8 kB chunk 里，只有真正打开这个面板的人才会下载，
Admin 主包只涨 4.6 kB。

### 修改文件

- `server/index.js`（两个端点 + 限流）
- `server/postgresStores.js`（两列 schema + 三个 store 方法 + mapper）
- `src/components/AdminTotpEnrolment.jsx`（新增）
- `src/Admin.jsx`、`src/lib/api.js`、`src/index.css`
- `tests/api/admin-auth.db.spec.js`（+4 项）
- `docs/OPERATIONS_ADMIN_AUTH.md`
- `package.json` / `package-lock.json`（devDep：qrcode）

### 数据库变更

`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS pending_totp_secret text,
pending_totp_expires_at timestamptz;` —— 幂等，随服务启动的 `ensureSchema` 自动执行，
不改动任何现有数据。

### 验证结果

- npm run build：通过
- npm run lint：通过
- npm run test:api:db：**67 项全过**（`admin-auth.db.spec.js` 13 项，其中重新绑定 4 项）
- npm run test:admin-totp：通过（RFC 6238 向量）
- npm run test:openapi：通过（200 个 $ref、36 个错误码）
- npm run test:deploy-backup：通过
- VPS 部署：成功（2026-08-13 16:20 UTC）
- VPS 备份路径：`/opt/mrright-portfolio.backup-20260813-162029`
- schema 迁移：已生效，`admin_users` 上 `pending_totp_secret` / `pending_totp_expires_at` 两列已存在
- /api/health：200；/：200，/community：200，/admin：200，/login?mode=login：200，/account：200
- 模型预览：仍 200（3,881,284 字节）
- 服务日志近 10 分钟 error/500：0
- **线上接口实测（失败路径，token 全程只在服务器 shell 变量里）**：
  无凭证 401；有会话 + 错密码 401；有会话 + 不存在的用户 401 且**文案与错密码逐字相同**；
  未开始就确认 401。事后查库：`right` 账号**没有**被这些失败调用写入任何候选密钥。
- 线上前端：Admin chunk 里能取到 `Show QR code` / `Authenticator QR code` /
  `Confirm and switch`，二维码 chunk `browser-rVazBmbX.js` 200（25,783 字节）
- **成功路径未由我实测**：需要 `right` 的账号密码，按既定做法密码不进对话，
  留给用户在浏览器里走完最后一步
- GitHub push：未执行

新增的 4 项测试断言的不是「顺利路径能走通」，而是**每一种中断方式都不动到还在用的密钥**：
绑定进行中旧码照样登录、旧码不能确认新绑定、切换后旧码与旧恢复码同时失效、
没开始就确认会被拒绝、候选密钥不出现在任何列表里。

### 待办事项

1. **用户在浏览器里走完一次真实绑定**（/admin → Security），确认扫码与切换成功 ——
   成功路径需要账号密码，不由 Claude 代跑。
2. push 到 GitHub（本地领先五个 commit）。
3. 第十轮遗留的 `studio-tomoco.exr` 不是 EXR 文件的问题仍未处理，见下。

## 2026-08-13（第十轮）：模型预览根本没加载出来，以及 42.4 MB 的贴图

日期：2026-08-13
commit：`edf33da`

### 完成内容

**1. 真正的 bug：Draco 解码器被自家 CSP 拦掉，模型永远加载不出来。**

drei 的 `useGLTF` 默认把 DRACOLoader 指向 `https://www.gstatic.com/draco/...`，
而本站 CSP 是 `connect-src 'self'`。灭火器模型是 `KHR_draco_mesh_compression`
**required** 的，于是：42.4 MB 下完 → 解析阶段 `Failed to fetch` → 卡在 86% 不动，
统计栏全是 `Unknown`。用户看到的是「加载很慢」，实际是永远加载不完。

解码器已从 `three/examples/jsm/libs/draco/gltf/` 复制进 `public/draco/`（同源），
并通过 `src/three/dracoDecoderPath.js` 显式传给每一处 `useGLTF` / `preload`
（不用 `useGLTF.setDecoderPath` 全局设置，因为它依赖「在第一次加载前执行」这个
没人保证的时序）。

**2. 体积：42.4 MB 里有 40.35 MB 是三张 4096×4096 无损 PNG。**

几何体只有 12,649 三角面，而且本来就压过 Draco。传输层压缩没有意义
（`gzip -9` 压整个 GLB 只省 0.04%，PNG 已经 deflate 过），所以只能改像素编码。
新增 `scripts/optimize-model.mjs`，按贴图用途分别选参数，参数是**量出来的**：

| 贴图 | 前 | 后 | 依据 |
| --- | --- | --- | --- |
| baseColor | 17.68 MB | 0.81 MB | q82，PSNR 37.8 dB |
| normal | 11.38 MB | 1.21 MB | q92，法线平均角度误差 1.0° |
| metal/rough | 11.29 MB | 1.60 MB | near-lossless + 限制 2K |

金属/粗糙度图是唯一需要特殊对待的：它的蓝通道是接近二值的金属遮罩，
有损编码在硬边上的振铃把 **0.63% 的像素判成了错误材质**（材质交界处一圈毛边），
而且**从 q88 提到 q95 完全没改善**（0.635% → 0.628%）—— 说明这是边缘振铃，
不是码率不够，加质量只是白花体积。near-lossless 把它压到 0.03%；
它同时是三张图里最不依赖分辨率的一张（粗糙度是平滑场、金属是大块遮罩），
所以把它限制在 2K 来付这笔账。

**42.4 MB → 3.7 MB，基础色和法线仍然是 4K。**

**3. 缓存。** 优化后的预览文件名带 8 位内容哈希，`setStaticCacheHeaders`
现在对任何带哈希的文件名发 `max-age=31536000, immutable`
（之前几 MB 的 GLB 每次访问都要付一次回源验证）。`/draco/` 给一周。

**4. 归位。** 11 MB 的 2K 源文件从 `public/models/` 移到 `art-source/`，
不再被打包进 dist、不再每次部署都传一遍。**VPS 上那个 42.4 MB 的上传文件原样保留**，
它是这份资产的存档，`public/uploads/models/1781017698552-tl-miehuoqi.glb`。

### 修改文件

- `src/three/dracoDecoderPath.js`（新增）
- `src/components/ModelPreview.jsx`、`src/three/objects/Astronaut.jsx`
- `scripts/optimize-model.mjs`（新增）
- `public/draco/`（新增，来自 three r182）
- `public/models/fire-extinguisher-4k.3fa834b2.glb`（新增，3.7 MB）
- `public/models/fire-extinguisher.glb` → `art-source/models/fire-extinguisher.glb`
- `server/content.js`（modelUrl、modelSize、workflow 文案）
- `server/index.js`（`setStaticCacheHeaders`）
- `package.json` / `package-lock.json`（devDeps：sharp、@gltf-transform/\*、draco3d）

### 数据库变更

`project_overrides` 里 `slug = 'fire-extinguisher-next-gen'` 的**一行**，
`UPDATE 1`：`model_url` 指向新预览文件，`model_size` / `model_size_en` /
`model_size_zh` / `model_size_ja` 从「40 MB」「11.1 MB GLB 预览」改成 3.7 MB。
（`model_size_en` 之前存的是中文，一并改正。）没有删除任何行。

### 验证结果

- npm run build：通过
- npm run lint：通过
- VPS 部署：成功（2026-08-13 15:01 UTC）
- VPS 备份路径：`/opt/mrright-portfolio.backup-20260813-150109`
- /api/health：200
- admin_summary：200（部署脚本用短时会话验证后已吊销）
- /：200，/community：200，/admin：200，/login?mode=login：200，/account：200
- /api/account/profile：未登录 401，正常
- /api/users/not-exist-test-handle：404，正常
- 服务日志近 20 分钟 error/500：0
- **线上 Playwright 实测模型预览：模型渲染成功，顶点 9,295 / 三角面 12,649 /
  材质 1 / 贴图 3 / 包围盒 0.30 × 0.61 × 0.17 —— 修复前这些全是 `Unknown`**
- 线上实际请求：`/models/fire-extinguisher-4k.3fa834b2.glb`（3.88 MB，
  `cache-control: public, max-age=31536000, immutable`）+ `/draco/draco_wasm_wrapper.js`
  + `/draco/draco_decoder.wasm`，全部 200，无 CSP 违规
- GitHub push：**未执行**（本地领先 origin/main 一个 commit）

### 待办事项

1. **`public/assets/environments/studio-tomoco.exr` 不是 EXR 文件。**
   它的文件头是 UTF-16 文本 `resource_ver...`，`file(1)` 判定为 `data`。
   于是 `EXRLoader.parse()` 抛错，Studio 环境光（IBL）**从来没生效过**，
   并且因为 three 的 `DataTextureLoader` 在调用 `onError` 之后没有 `return`，
   还会在 console 留一条 `Cannot read properties of undefined (reading 'image')`。
   这是旧问题，之前被「模型永远加载不出来」挡住了（环境和模型在同一个 Suspense 里）。
   修它需要一张真的 HDRI/EXR，属于美术资产决定，等用户定。
2. 4K 基础色 + 4K 法线在移动端显存占用不小（各 4096²×4 ≈ 67 MB 解码后）。
   如果移动端反馈卡，把它们也降到 2K 即可：改 `scripts/optimize-model.mjs` 里的
   `MAX_DATA_MAP_SIZE` 适用范围重跑，产出 2K 版只有 2.12 MB。
3. 其它项目的模型预览没有逐个点开验证过，只验证了第一个（能正常渲染）。
4. push 到 GitHub。

## 2026-08-13（第九轮）：命名管理员账号 + TOTP + 审计归因

日期：2026-08-13
commit：`fa64795`（主体）、`a041014`（CLI 用户名大小写）
线上版本：`a041014`（2026-08-13 12:16 UTC 部署）

在此之前，「管理员」的意思是「知道 `ADMIN_TOKEN` 的人」：一个共享密钥、没有第二因素，
而且审计表 `admin_user_actions` 记的是**对哪个访客做了什么**，不是**谁做的**。
第六轮把静态令牌收紧成「只能换会话」是这个方向的第 2 步，这一轮是第 3 步。

现在：用户名 + 密码 + 6 位 TOTP（或一枚恢复码）→ `POST /api/admin/login` → 12 小时会话，
`admin_sessions.admin_user_id` 指向这个人，这期间的动作写 `admin_user_actions.actor_admin_user_id`。
静态 token 仍能换会话（引导 / 救援），但那种会话在审计里记为「无人」，
`/admin` 页头会写明 **Signed in with the shared admin token (actions are not attributed)** ——
不可归因应该在干活时就看得见，而不是事后才发现。

### 修改文件

| 文件 | 作用 |
| --- | --- |
| `server/adminTotp.js`（新） | TOTP 生成 / 校验、恢复码 |
| `server/passwordHash.js` | 抽出与访客共用的 pbkdf2 实现 |
| `server/postgresStores.js` | `admin_users` 表、两处 `ADD COLUMN IF NOT EXISTS`、账号与归因查询 |
| `server/index.js` | `/api/admin/login`、`/me`、`/users`、`/me/recovery-codes`、`/actions` |
| `server/responses.js` | 新错误码 |
| `src/Admin.jsx`、`src/lib/api.js` | 账号 / 恢复码 / 共享令牌三种登录模式，页头显示当前身份 |
| `scripts/admin-user.mjs`（新） | 引导与救援 CLI（create / list / reset-totp / recovery-codes / disable） |
| `scripts/verify-admin-totp.mjs`（新） | 对着 RFC 6238 测试向量验证 TOTP |
| `tests/api/admin-auth.db.spec.js`（新） | 真数据库端到端 9 项 |
| `docs/OPERATIONS_ADMIN_AUTH.md`、`docs/openapi/api-v1.yaml` | 文档与契约 |

### 几个刻意的设计选择

- **`totp_last_step` 让 6 位码一次性。** TOTP 天然在 30 秒内可重放；记住上次成功的时间步、
  拒绝小于等于它的步之后重放才真的被挡住，抢同一个码的两个请求只有一个能赢
  （`UPDATE ... WHERE totp_last_step < $2`）。
- **恢复码是敢于强制第二因素的前提。** 手机丢了的答案是信封里的一枚恢复码，
  不是 SSH 上去手写 UPDATE。SHA-256 存哈希、一枚一用；不用 pbkdf2 是因为它们是 80 位机器熵，
  而且「若还在则删掉这一枚」必须是单条语句才没有竞态。
- **密码错与用户名不存在返回完全相同的码和文案**，且都跑一次 pbkdf2 —— 否则这个接口就是账号枚举器。
- **停用账号同步删掉它的会话**，否则「停用」最长 12 小时后才生效；**不能停用自己正在用的账号**。
- **CLI 的密码从终端读，不走 argv**（argv 会进 `ps` 和 shell 历史）。
- `a041014`：CLI 现在和 API 一样按大小写不敏感匹配用户名 —— 两边不一致会让
  「明明创建过却 reset 不了」这种问题很难查。

### 验证

- `npm run build`：通过
- `npm run lint`：通过
- `npm run test:admin-totp`：通过（RFC 6238 向量 + 窗口 + 重放 + 恢复码格式）
- GitHub push：`a041014` 已推，本地与 `origin/main` 一致
- VPS 部署：成功（`npm run deploy:vps`，密钥认证一条命令跑完）
- 服务重启：成功，健康检查第 1 次即通过
- 数据库迁移（服务启动时自动、幂等、纯加法）：
  `admin_users` 建表；`admin_sessions.admin_user_id`、`admin_user_actions.actor_admin_user_id`
  两个 `ADD COLUMN IF NOT EXISTS`。线上复验两列均已存在，无删除无改写。
- 线上 `/api/health`、`/`、`/community`、`/admin`、`/login?mode=login`、`/account`：全部 200
- 线上 admin_summary：200（部署脚本用短时会话验证并已吊销）
- 线上 `POST /api/admin/login`（不存在的用户 + 错密码）：401，文案为统一的
  「Username, password or verification code is incorrect.」，不泄露账号是否存在
- 线上 `GET /api/admin/me` 未带凭证：401；带共享令牌会话：`username: null`（归因如预期为空）
- 线上 `GET /api/admin/users`：部署后为 `[]`；12:30 UTC 创建第一个账号 `right` 后不再为空
- **账号体系端到端实测（2026-08-13 12:31 UTC，拿真实 TOTP 码打线上接口）**：
  `POST /api/admin/login` 201 并签发会话；`GET /api/admin/me` 返回 `username: "right"`
  （归因生效，不再是 `null`）；该会话调 `/api/admin/summary` 200；
  **重放同一个 6 位码 401**（`totp_last_step` 在线上确实挡住重放）；
  `DELETE /api/admin/session` 200，验证用的会话已吊销；
  `admin-user.mjs list` 显示 `enabled totp:confirmed codes:10`
- 磁盘：42%

备份路径：

- `/opt/mrright-portfolio.backup-20260813-121618`（应用，硬链接）
- `/etc/mrright-portfolio.env.backup-20260813-121618`（env）
- 本轮裁剪掉 `/opt/mrright-portfolio.backup-20260812-051116`，保留最新 3 份

待办：

- ~~线上还没有任何管理员账号~~ —— **同日 12:30 UTC 已创建 `right` 并实测登录通过**。
  一次性的凭证文件在 VPS 上（root 专属），取走后应 `shred -u`。
- 审计归因目前只覆盖两条会写 `admin_user_actions` 的路径。
- 没有「改自己密码」的接口。

## 2026-08-13（第八轮）：把密钥认证的部署路径固化进 `npm run deploy:vps`

结论：**这台机器上现在可以直接 `npm run deploy:vps`**，并且已经用它真实部署过一次作为验收。

第七轮留下的问题是：`deploy-vps.mjs` 只会 ssh2 的**密码认证**（要 `VPS_HOST` + `VPS_PASSWORD`），
而工作机上只有 SSH 密钥、没有密码，所以那条命令实际跑不了；那次上线是**临时拼一份等价的
远端脚本再 `ssh bash -s`** 完成的。能拼对是因为 shell 片段是 import 的，但那条路径
**没固化、没测试，也没人能保证下次拼得一样** —— 真正的风险不是「麻烦」，是「不可复现」。

### 改了什么

| 文件 | 作用 |
| --- | --- |
| `scripts/lib/deploy-remote-script.mjs`（新） | **远端脚本的唯一生成器**（原来内联在 `deploy-vps.mjs` 里） |
| `scripts/lib/ssh-transport.mjs`（新） | 两种传输方式同一个接口：`run` / `upload` / `end` |
| `scripts/deploy-vps.mjs` | 只剩「读环境变量 → 打包 → 上传 → 驱动」 |
| `scripts/verify-deploy-script.mjs`（新） | 不连服务器的校验，`npm run test:deploy-script` |
| `docs/OPERATIONS_DEPLOY.md`（新） | 部署方式、环境变量、干跑、测试、回滚 |

关键设计（两条都是为了「两条路做的事必须一样」这件事能被验证，而不是被承诺）：

- **远端脚本只有一个生成器。** 密钥路径和密码路径共用它，校验脚本再逐字节比一遍两者的输出。
- **密钥路径直接调系统 `ssh`**，不去教 ssh2 认密钥 —— `~/.ssh/config`、agent、`known_hosts`
  这些系统客户端本来就都会处理。制品用 `ssh 'cat > ...'` 流式传（不用 scp）。

新增开关：`VPS_AUTH`（`key` / `password`，无密码时默认 `key`）、`VPS_SSH_KEY`、
`VPS_DRY_RUN=true`（只打印远端脚本就退出，不连接、不打包、不需要先 build）。
`VPS_HOST` 默认 `147.79.20.232`，不再是必填。

### 顺手修掉的一个隐患（还没发作过）

远端脚本以前是**喂给 `bash -s`** 的。这么做时**脚本正文占着远端 stdin**，
中途任何读 stdin 的命令都会把剩下的脚本吃掉 —— 现在没踩到只是因为 `npm ci` 不读 stdin，
而 `systemctl status` 带了 `--no-pager`。改成**先把脚本上传成文件再 `bash <文件> < /dev/null`**，
顺带的好处是部署半途失败时服务器上留得下现场。两种传输方式都走这条路径。

### 验证

- `npm run test:deploy-script`：通过。断言四件事 ——
  1. 生成的脚本 `bash -n` 通过（`VPS_REWRITE_NGINX` × `VPS_REWRITE_SERVICE` 四种组合都测）
  2. 环境变量里的值都被正确引号包住：用 `/opt/we ird'dir; touch <marker>` 和
     `svc'$(touch <marker>)` 这类恶意值试注入，回读值必须原样、marker 必须不存在
  3. 脚本正文**不含任何密钥**（`ADMIN_TOKEN` 是在服务器上从 env 文件读的）——
     这条是 `VPS_DRY_RUN` 能放心打印全文的前提
  4. `VPS_AUTH=key` 与 `VPS_AUTH=password` 的干跑输出**逐字节相同**
- `npm run test:deploy-backup`：通过（未改动那部分，回归确认）
- **传输层真机冒烟**（不部署，只验传输）：3MB 文件上传后 sha256 与本地一致；
  远端路径带引号和空格也正确；读 stdin 的命令不会挂也不会吃脚本；
  非零退出会 reject；流式输出正常
- `npm run build`：通过（`vite build`，5.98s）
- `npm run lint`：通过（`eslint .`，无输出）

日期：2026-08-13（第八轮）
完成内容：`npm run deploy:vps` 支持 SSH 密钥认证并固化；远端脚本改为上传后执行；新增校验与文档
修改文件：`scripts/deploy-vps.mjs`、`scripts/lib/deploy-remote-script.mjs`（新）、
`scripts/lib/ssh-transport.mjs`（新）、`scripts/verify-deploy-script.mjs`（新）、
`docs/OPERATIONS_DEPLOY.md`（新）、`package.json`
commit：见本轮提交
build：通过　lint：通过
部署 VPS：是（2026-08-13 10:21 UTC，**就是用新路径部署的，这次部署本身就是验收**）
VPS 备份路径：`/opt/mrright-portfolio.backup-20260813-102109`（硬链接）；
env 备份 `/etc/mrright-portfolio.env.backup-20260813-102109`；
本次自动裁剪掉最旧的 `...backup-20260812-044929`，保留最新 3 份；磁盘仍 42%
验证接口：`/api/health` 200、`admin_summary` 200（部署脚本用短会话查的，用完已吊销）、
`/` `/community` `/admin` `/login?mode=login` `/account` 全部 200（HTTPS 外部实测）

部署过程中值得记一句：**健康检查是在第 2 次轮询才通过的** —— 第六轮修的那个竞态
（`systemctl restart` 返回时 node 还没 `listen()`）在这次部署里确实起了作用，
按老逻辑这次就会误报部署失败。

### 还没做的（不属于本轮范围）

`scripts/package-vps-release.mjs` 打印的手工脚本仍是自己拼的一个**子集**
（不写 nginx/systemd）。它 import 的是同几段 shell 片段，所以不会在备份/健康检查/admin
校验这些关键处漂移，但它没有共用新的 `buildRemoteScript`。要彻底消除漂移，
可以让它也走生成器 + 一个「跳过 nginx/systemd」的开关。

## 2026-08-12（第七轮）：CSP 切 blocking + DMARC 上线 + 清掉两个遗留物

本轮把「待你决策」清单清空了：CSP 切换（下面主体部分）、DMARC 端到端跑通（「DMARC」小节）、
`sniproxy` 停用（「收尾」小节）、`/etc/nginx/proxy.conf` 结案（顶部「已由你拍板」）。

结论：**CSP 现在真的会拦了**，不再只是记录。策略从 2026-08-11 起 report-only 跑了一天，
收集器一共只报了两条违规，而且两条都是**策略自己写漏了**，不是应用有问题：

| 上报 | 真实原因 | 改法 |
| --- | --- | --- |
| `script-src <- wasm-eval` | `scriptSrc` 根本没写，回落到 `defaultSrc 'self'`，three.js 的解码器编译不了 WebAssembly | `scriptSrc: ["'self'", "'wasm-unsafe-eval'"]` |
| `connect-src <- blob` | 后台上传预览要 fetch 自己刚 `createObjectURL` 出来的 blob | `connectSrc: ["'self'", 'blob:']` |

`'wasm-unsafe-eval'` **只放开 WebAssembly 编译，不会把 `eval()` 或内联脚本放回来** ——
这一点是实测过的，不是查文档得来的（见下面的验证方法）。
顺带把 `upgrade-insecure-requests` 收了回来：它是 helmet 默认项，之前因为 report-only 模式下
浏览器忽略它、还每页刷一条 console error 才被关掉，现在切 blocking 就没有这个理由了。

线上最终生效的头（`content-security-policy`，已无 `-report-only` 那条）：

```
default-src 'self'; base-uri 'self'; font-src 'self' data: https://fonts.gstatic.com;
form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none';
script-src 'self' 'wasm-unsafe-eval'; script-src-attr 'none';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; upgrade-insecure-requests;
worker-src 'self' blob:; connect-src 'self' blob:; report-uri /api/csp-report
```

`report-uri` 特意留着：切 blocking 之后一条违规就等于一个坏掉的页面，
它是**这次浏览器没走到的代码路径**唯一的报警渠道。

### 验证方法（这次学到的两个坑）

1. **不能靠「日志里没有新的 `[CSP]` 行」判断没违规。** 收集器只在第 1、10、每 100 次时打日志
   （`server/index.js` 的 `cspReportCounts`），第 2～9 次是**静默**的。
   可靠信号是浏览器控制台 0 error。
2. **不能用 Playwright 的 `browser_evaluate` 直接测 `WebAssembly.instantiate`。**
   CDP 注入的脚本不受页面 CSP 约束，那么测必然是**假阳性**。
   正确做法是往 `dist/` 里放一个**同源的 `<script src>`**，让页面自己的脚本去跑。

用后一种方法在**本地真实构建 + blocking 策略**下跑出来的结果：

```
["wasm: OK", "blob-fetch: OK", "blob-worker: OK", "eval: correctly blocked"]
```

最后一条是关键：`eval` 仍然被拦，证明加 `'wasm-unsafe-eval'` 没有把 `script-src` 放宽。
探针文件测完已删除。

本地验证（`PORT=4300`、不设 `DATABASE_URL`，走内存 store）：
`/`、`/community`、`/login`、`/admin`、`/account` 全部 0 console error，
宇航员 GLB 正常加载，blob worker 正常启动。

线上验证（部署后用真实数据过了一遍）：

- `/` 200，WebGL canvas 存活，GLB 已加载，外部主机只有 `fonts.googleapis.com` / `fonts.gstatic.com`
- `/community` 200，真实数据渲染正常（1 Discussion / 6 Selected Work）
- 社区帖子详情页 200
- **「Open Model Preview」实测**：真实上传的 `/uploads/models/1781587753846-sc-jitan.glb`（908KB）
  正常渲染，2 个 WebGL canvas 都活着，模型统计信息正常 —— 这是 drei/meshopt 那条 WASM 分支
- `/admin`、`/login?mode=login`、`/account` 全部 200
- **部署后收集器 0 条上报**，浏览器 0 console error

日期：2026-08-12（第七轮）
完成内容：CSP 切 blocking，补齐 `scriptSrc` 与 `connectSrc`，恢复 `upgrade-insecure-requests`
修改文件：`server/index.js`
commit：`2cdb97d`
build：通过（`vite build`，7.02s）
lint：通过（`eslint .`，无输出）
部署 VPS：是（2026-08-12 14:09 UTC）
VPS 备份路径：`/opt/mrright-portfolio.backup-20260812-140940`（硬链接）；
env 备份 `/etc/mrright-portfolio.env.backup-20260812-140940`；
本次部署后自动裁剪掉最旧的 `...backup-20260812-043445`，保留最新 3 份；磁盘仍 42%
验证接口：`/api/health` 200、`admin_summary` 200（短会话，用完已吊销）、
`/` `/community` `/admin` `/login?mode=login` `/account` 全部 200

### 部署方式的一个变化（下次会用到）

`npm run deploy:vps`（`scripts/deploy-vps.mjs`）**这台机器上跑不了** —— 它用 ssh2 的
**密码认证**，要求 `VPS_HOST` 和 `VPS_PASSWORD`，而本机没有这两个环境变量。
本机是 **SSH 密钥直连**可用。

这次的做法是：写一个小生成器，**import `scripts/lib/deploy-backup-script.mjs` 里那几段 shell
片段**（`BACKUP_AND_EXTRACT` / `WAIT_FOR_HEALTH` / `ADMIN_SESSION_CHECK` / `PRUNE_FUNCTION`），
拼出和 `deploy-vps.mjs` 等价的远端脚本，再 `ssh root@... 'bash -s' < script`。
**import 而不是手抄，正是为了不和被测试覆盖的那份漂移** —— 那个模块的注释里就是这么要求的。
制品用 `ssh 'cat > /tmp/...'` 流式传（不用 scp）。
本轮没有改写 nginx vhost 与 systemd unit（两者都存在，`deploy-vps.mjs` 本来也只在缺失时才写），
**443 与机场节点共用，重写 vhost 会丢 TLS**，见 `docs/OPERATIONS_CLIENT_IP.md`。

待办：把这条路径固化成脚本（比如给 `deploy-vps.mjs` 加一个密钥认证分支），
否则下次还得临时拼一遍。

### 收尾：停用 sniproxy（按用户指示）

查 CSP 日志时发现 `sniproxy.service` 在无限重启失败，**10 天内失败 13176 次**，
每 5 秒一轮，报 `error parsing /etc/sniproxy.conf at 507`（配置是 2024-04-15 的，3.6KB）。

停之前确认过它确实是死的、且和 443 分流无关：

- `systemctl is-active` = `activating`（永远起不来），**无进程、无监听端口**
- 它配置里要占的是 `0.0.0.0:80` 与 `0.0.0.0:443`，而这两个端口**早就被 nginx 占着** ——
  就算配置能解析也绑不上
- SNI 分流是 nginx stream 做的（`docs/OPERATIONS_CLIENT_IP.md`），不是它

用户 2026-08-12 指示停用，已执行 `systemctl disable --now sniproxy`：
现在 `inactive` / `disabled`，`multi-user.target.wants` 里的软链已移除，之后无重启日志。
停用后复验：80/443 仍是 nginx（3 个监听项）、nginx 与 mrright-portfolio 均 `active`、
`/` 200、`/community` 200、`/api/health` 200。

**注意 `mcp__mrright-ops__ssh_exec` 会吞掉 `--` 开头的参数** —— 第一次
`systemctl disable --now sniproxy` 经 MCP 执行时，实际跑成了裸 `systemctl`（打印了单元列表），
服务纹丝不动；`journalctl -u xxx --since` 也中过同样的招（把别的单元的日志混进来）。
**要带长参数就用 Bash 里的 `ssh root@147.79.20.232 '...'` 直连**，别走 MCP。

### DMARC：记录内容与一个必须避开的坑

2026-08-12 用 VPS 的 `node:dns` 查到的现状：

| 名称 | 现状 |
| --- | --- |
| `mrright.blog` NS | `kayden.ns.cloudflare.com` / `lorna.ns.cloudflare.com`（DNS 在 Cloudflare） |
| `_dmarc.mrright.blog` | **不存在** |
| `send.mrright.blog` TXT | `v=spf1 include:amazonses.com ~all`（SPF 在） |
| `resend._domainkey.mrright.blog` | DKIM 公钥在（**在根域，不在 `send.` 子域**） |
| `mrright.blog` MX | **无** —— 这个域不收信 |
| `SMTP_FROM` 的域 | `@mrright.blog` |

因为发件域是 `mrright.blog`，DMARC 就查 `_dmarc.mrright.blog`。
对齐关系是够的：DKIM 的 `d=` 是根域（严格对齐也过），SPF 的信封域是 `send.mrright.blog`
（宽松对齐过，宽松是默认）。所以 `p=none` 完全安全。

**坑：`rua` 不能直接填 Gmail 地址。** RFC 7489 §7.1 规定，报告地址与 DMARC 记录不同域时，
接收方必须先查 `<你的域>._report._dmarc.<对方域>` 拿授权。实测：

```
mrright.blog._report._dmarc.gmail.com        => ENOTFOUND   ← Gmail 没开这个口子
mrright.blog._report._dmarc.dmarc.postmarkapp.com => "v=DMARC1;"  ← 通配符，已授权
```

也就是说 `rua=mailto:<你的 Gmail>` 写了，**Google/Microsoft/Yahoo 这些大厂根本不会把报告发过来**，
等于白写。

**用户 2026-08-12 选定方案 B：报告收在自己域内。** 即先用 Cloudflare Email Routing
（免费）把 `dmarc@mrright.blog` 转发到 Gmail，`rua` 填这个同域地址 —— 同域就不需要外部授权记录。

最终记录：`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@mrright.blog`
（Name 只填 `_dmarc`，Cloudflare 会自动补上域名）。

启用 Email Routing 会给**根域**加 MX 和一条 SPF TXT。两个已核实的前提：

- 根域**当前无 MX**（`ENODATA`），不会冲突；
- 根域**当前无 TXT**，Cloudflare 加的 `v=spf1 include:_spf.mx.cloudflare.net ~all`
  **不会影响 Resend 发信** —— Resend 的信封域是 `send.mrright.blog`，SPF 查的是那条
  （`include:amazonses.com`），根域这条管的是「谁能以 @mrright.blog 作信封域发信」。
  而且 DMARC 这边本来就靠 DKIM 对齐（`d=` 就是根域）。

#### 已完成的最终状态（2026-08-12）

用户当天完成了全部四步，逐项复验结果：

**Cloudflare Email Routing（用户操作，截图确认）**

- 目标地址 `adieb623@gmail.com`：**已验证**
- 路由规则 `dmarc@mrright.blog` → Gmail：**活跃**
- catch-all「全收」：**保持禁用**（不然会收一堆垃圾）
- 自动下发的 DNS：MX `route1/2/3.mx.cloudflare.net`（优先级 42/33/32）、
  根域 SPF、Cloudflare 自己的 DKIM `cf2024-1._domainkey`

**DNS 复验（VPS 上用 `node:dns` 查）**

```
_dmarc.mrright.blog  =>  v=DMARC1; p=none; rua=mailto:dmarc@mrright.blog
标签解析：v=DMARC1 / p=none / rua=mailto:dmarc@mrright.blog
rua 域 = mrright.blog，与 DMARC 域同域 → 不需要外部授权记录（这正是选方案 B 的原因）
send.mrright.blog SPF、resend._domainkey 均未被改动
```

**踩到的第二个缓存坑**：刚加完时 `1.1.1.1` 已能查到，但 `8.8.8.8` / `9.9.9.9` 仍报
`ENOTFOUND`。原因是我**在记录添加之前查过这些解析器**，留下了否定缓存：
`mrright.blog` 的 SOA `minimum` 是 **1800 秒**，所以要等 30 分钟才会自己消失。
分辨方法是**直接问权威 NS**（`kayden.ns.cloudflare.com` → `162.159.44.74`），
权威上有记录就说明写对了，剩下的只是等缓存。

**发信实测**（两封，都用线上应用的真实 Resend 通道发出，`{"delivery":"email","sent":true}`）

1. 发给 `dmarc@mrright.blog` —— 验证「Resend 发信 → Cloudflare MX 收信 → 转发到 Gmail」整条链路
2. 加完 DMARC 后发给 `adieb623@gmail.com` —— 验证新增的根域 MX/SPF 没有破坏原有发信

**第一封实测信 Gmail 判定 DMARC = FAIL —— 不是配置错，是我自己造成的 DNS 否定缓存。**

用户贴的「显示原始邮件」显示：SPF **PASS**、DKIM **PASS（domain: mrright.blog）**、
DMARC **FAIL**。这个组合本身就自相矛盾 —— DKIM 的 `d=` 就是 From 域，
对齐关系成立，DMARC 没有理由失败。真正的线索在 header 里：
Google 的 `Authentication-Results` **压根没有 `dmarc=` 这一行**，
说明它当时**没找到 DMARC 记录**，而不是找到了判定不通过。

时间对得上：邮件 15:05 UTC 到达，而我在 **15:00 UTC** 用 `8.8.8.8`/`9.9.9.9`
查过 `_dmarc`（当时记录还没加完），把 NXDOMAIN 缓存了 **1800 秒**。
Google 收信时用的正是自家解析器，看到的还是「没有这条记录」。

**决定性证据**（15:14 UTC 复查，同一家的两台解析器结论相反）：

```
8.8.8.8  => ENOTFOUND        ← 正是我探过的那台，仍在缓存 NXDOMAIN
8.8.4.4  => v=DMARC1; ...    ← 同属 Google，没被我探过，正常
9.9.9.9  => v=DMARC1; ...    ← 缓存到期，自己恢复
1.1.1.1  => v=DMARC1; ...
```

处置：写了个脚本**轮询等 `8.8.8.8` 自己看到记录**（不靠猜时间），
15:15:34 缓存过期后立刻重发一封。

**教训（下次别再踩）：查一条「还没添加」的 DNS 记录时，不要去问公共解析器** ——
一次探测就会在那台解析器上种下最长 1800 秒的否定缓存，而它可能正是收信方要用的那台。
要确认记录是否写对，**直接问权威 NS**；要确认全球可见性，等否定缓存自然过期再查。

**最终结果：用户在 Gmail「显示原始邮件」里确认重发的那封 DMARC = PASS。**
至此 SPF / DKIM / DMARC 三行全部 PASS，邮件链路端到端验证完成，此项结案。

顺带记一句方法论：**`sent:true` 不算送达凭据** —— 这是第五轮定下的规矩，
而这次「Gmail 判 FAIL 但其实是我的探测污染了它的解析器缓存」是它的又一个例证：
真正的判据永远是收件方那一侧看到的东西，不是发送侧的返回值。

## 2026-08-12（第六轮）：应用备份改硬链接 + 自动保留策略

结论：部署脚本每次留下的 351M 全量备份改成了硬链接备份，并加上「保留最近 N 份」的自动裁剪。
根治的是那个反复出现的磁盘问题 —— 上一轮手工从 15 份清到 3 份，但机制没变，攒回去只是时间问题。
**已部署上线并验证通过**，实测一份备份 351M → **34M**，三次部署后磁盘 49% → **42%**。
过程中还发现并修掉了部署脚本里一个一直存在的健康检查竞态，
并顺带完成了被它卡住的 `ADMIN_ALLOW_STATIC_TOKEN=false` 收紧。

日期：2026-08-12。

commit：`24e069b`（备份改动）→ `4855438`（合并到 main）→ `615b961`（竞态修复）。
分支 `ops/deploy-backup-retention-20260812` 已推送，`--no-ff` 合并进 main 并推 GitHub。
未 force push、未 reset。

完成内容：

1. **应用备份改为 `cp -al` 硬链接**
   - 未被本次部署改动的文件只占一个目录项，不再逐字节重复。一份备份 351M 里有 252M 是
     `public/uploads` 的重复副本，这部分开销消失。
   - `cp -al` 失败时（异种文件系统、跨设备）自动回退到 `cp -a` 全量拷贝 ——
     **绝不允许因为省空间而让某次部署没有回滚点**。

2. **`data/` 单独做真实拷贝，不走硬链接**
   - 原因：`contactMessagesStore.js:16` 与 `downloadRequestsStore.js:17` 用 `appendFile`
     **原地追加**，同一个 inode，会把历史写进所有硬链接备份里。
   - 这两个 store 只在 `DATABASE_URL` 缺失时才加载（`server/index.js:108`），生产走 Postgres
     用不到；但 `data/` 只有 8KB（线上实测：2 个文件，最后修改停在 6 月 3 日，是迁移后的冻结遗留物），
     与其赌那个前提永远成立，不如直接真实拷贝。
   - `interactionsStore.js:35-36` 是 temp + `rename`，换 inode，本身安全。

3. **解包加 `tar --unlink-first`**
   - `package.json` / `package-lock.json` 不在被 `rm -rf` 的列表里，会被直接覆盖到备份仍链接着的路径上。
   - **实测确认：GNU tar 1.35 默认就是先 unlink**（live inode 会变），所以这不是在修现存 bug。
     加它是为了把行为钉死 —— 实测 `TAR_OPTIONS=--overwrite` 会翻转成原地截断并**确实写穿备份**，
     而带上 `--unlink-first` 后备份完好。
   - 值得一提：**VPS 上是 GNU tar 1.34，本机是 1.35**。正因为显式加了这个 flag，
     版本差异不构成风险 —— 这类「本机验证过就以为线上一样」的假设，正是应该用 flag 钉死的地方。
   - 顺带纠正一条我一开始写错的注释：原本写的是「tar 默认 `O_TRUNC` 会写穿」，与实测不符，已改。

4. **自动裁剪 `prune_app_backups`（`VPS_BACKUP_RETAIN`，默认 3，设 0 关闭）**
   - **只在部署健康检查通过之后执行**。远程脚本是 `set -euo pipefail`，部署中途失败会在裁剪前中止，
     所以失败的部署不损失任何回滚点。
   - **只匹配脚本自己写出的时间戳格式**（`.backup-` + 8 位日期 + `-` + 6 位时间）。
     手工命名的目录（如 `…​.backup-before-migration`）永远不是删除候选。
   - **env 备份不裁剪**：每份约 1KB，不是磁盘压力来源，而它是 env 损坏时唯一的退路。

5. **新增本地验证 `npm run test:deploy-backup`，并接入 CI**
   - 这段逻辑既做硬链接又做删除，且正确性取决于光看代码定不下来的文件系统行为。
     不验证就上线不可接受 —— 尤其这个项目上一轮刚踩过「文档里的备份步骤从来跑不通」。
   - 为此把这两段 shell 抽到 `scripts/lib/deploy-backup-script.mjs`，部署脚本和测试
     **导入同一个字符串**，所以不存在「测试的是实现的副本」这种漂移。
     部署脚本其余部分（env 校验、nginx、systemd）一行未动。

修改文件：

- `scripts/deploy-vps.mjs`（备份/解包/裁剪/健康检查；新增 `VPS_BACKUP_RETAIN`、`VPS_APP_ORIGIN`）
- 新增 `scripts/lib/deploy-backup-script.mjs`（三段可导入的 shell 片段）
- 新增 `scripts/verify-deploy-backup.mjs`（本地验证）
- `package.json`（新增 `test:deploy-backup`）
- `.github/workflows/web.yml`（checks job 增加一步）
- `docs/OPERATIONS_BACKUP.md`（新增「应用目录备份」整节 + 修正已知缺口的表述）
- `PROJECT_PROGRESS.md`

build / lint / 测试结果（部署前后各跑一次，全绿）：

- `npm run lint`：通过
- `npm run build`：通过；`dist/` 保持 untracked
- `npm run test:api`：37/37 通过
- `npm run test:api:db`：54/54 通过（一次性 PostgreSQL 集群已销毁）
- `npm run test:openapi`：通过（200 个 `$ref`、33 个 error code）
- `npm run test:deploy-backup`：通过（新增）
- production smoke（线上）：6 passed，1 skipped

**注入回归验证（证明新测试确实抓得住问题，不是白跑）**：逐个把 6 个 bug 注入回去，
全部被抓到并给出对应报错：

| 注入 | 结果 |
| --- | --- |
| `cp -al` 退回 `cp -a` | 抓到：uploads 未共享 inode + 增量成本等于全量 |
| 删掉 `--unlink-first` | 抓到：备份的 `package.json` 被写穿 |
| `data/` 也走硬链接 | 抓到：inode 相同 + 追加污染了备份 |
| 裁剪改成宽松通配 `.backup-*` | 抓到：删掉了手工命名的目录 |
| 健康检查退回不等待的裸 curl | 抓到：curl 只被调用 1 次，没有重试到第 3 次 |
| 健康检查超限后不退出 | 抓到：服务从未应答却判为通过 |

> 过程中我自己写错过两处，记一笔省得下次重犯：一是用 `du` 测单个备份目录来证明硬链接省空间
> —— **`du` 只在单次调用内对硬链接去重**，只测备份一个路径照样报全量，必须把 live 和备份
> 一起传给同一次 `du`；二是备份目录名只到秒，两个测试用例在同一秒内跑完会撞名，
> `cp -al` 于是把新备份塞进旧目录里（`app.backup-<stamp>/app/`），断言读到的是上一个用例的结果。

### 部署过程中发现并修掉的 bug：健康检查竞态（`615b961`）

**第一次部署失败了**，但失败的不是这轮的新代码，而是部署脚本里一个一直存在的竞态：
`systemctl restart` 一返回就立刻 `curl /api/health`，中间不等待。日志显示
`Started` 在 04:34:48、`listening on http://localhost:4173` 在 04:34:50 —— curl 撞进了那 2 秒窗口，
拿到 connection refused，`set -euo pipefail` 于是中止整个脚本。

**发布本身是好的，服务 1 秒后就健康了，部署却报失败。** 这次能撞上纯属运气；
第二次部署同样的脚本就 `Health check passed after 1 attempt(s)`，说明它一直是概率性的。

顺带确认了一件好事：中止发生在裁剪之前，**4 份备份一个没删** —— 「失败的部署不损失回滚点」
这个设计意图在真实故障里被验证了。

修复：健康检查改成轮询直到服务应答，上限 `HEALTH_ATTEMPTS`（默认 30 次）。
服务真起不来仍然让部署失败，并把 journal 尾部打到 stderr，让人看到原因而不是一个 curl 退出码。

另外给 curl 加了 `--noproxy "*"`：目标是 loopback，代理不该介入。
**这不是理论问题** —— 本机 WSL 有 `http_proxy`，复现时 curl 被劫持成 502，
如果哪天 VPS 的 root 环境里有 `http_proxy`，部署会以同样莫名其妙的方式失败。
端口也从 3 处硬编码收敛成一个变量（`VPS_APP_ORIGIN`）。

新增测试用**打桩 curl**而不是真 socket：要证明的是循环的契约（重试、报告尝试次数、
到上限后非零退出），打桩比跟真实监听器赛跑更直接，而且从 39 秒降到 5 秒。
（本机沙箱会阻断子进程访问 localhost，真 socket 方案在这里根本跑不了。）
注入「退回裸 curl」和「超限不退出」两个 bug，都被抓住。

### 收紧 `ADMIN_ALLOW_STATIC_TOKEN`（`48d3f69`）

`docs/OPERATIONS_ADMIN_AUTH.md` 的收紧路径第 2 步写着「确认没有脚本还在直接用静态 token 调 API
之后再设 false」，紧接着又写「注意：部署脚本会用静态 token 调 `/api/admin/summary`」。
**卡了几轮的就是这一条，而且答案一直写在文档里。** 排查确认只有两个调用方：

- `scripts/deploy-vps.mjs:252` 与 `scripts/package-vps-release.mjs:78`（部署后验证）
- `tests/e2e/admin-visitors.spec.js`（8 处）

三处都改成先 `POST /api/admin/session` 换会话再调 API。该端点**刻意不走 `requireAdmin`**
（`server/index.js:2840`），所以收紧后它仍然接受静态 token —— 这正是设计意图。

**部署脚本用完必定吊销会话，包括检查失败的路径。** 失败路径才是遗留 12 小时管理员会话
最容易被忽视的地方。E2E 套件不吊销（operator-run、偶发，且 `afterAll` 钩子拿不到 test 作用域的
`request` fixture），会话自行过期，理由写在该文件注释里。

会话 token 用 `node` 解析而不是 `grep`：它是 JSON 信封里的 base64url，
手写匹配器正是「响应被截断了检查还通过」的经典来源。

顺带修掉一个隐患：**`package-vps-release.mjs` 是部署步骤的第二份拷贝，而且已经漂移了** ——
还是 `cp -a` 全量备份、没有裁剪、`sleep 3` 代替等待服务、静态令牌。现在它 emit 的是同一批
共享片段，从根上不会再漂。

线上实测（2026-08-12 05:12 UTC 切换后）：

| 调用 | 结果 |
| --- | --- |
| 静态 token → `/api/admin/summary`、`/visitors`、`/comments` | 全部 **401 `ADMIN_AUTH_REQUIRED`** |
| 静态 token → `POST /api/admin/session` | **201** |
| 会话 → 上述三个端点 | 全部 200 |
| 吊销后复用该会话 | 401 |
| 伪造 token → 换会话 | 401 |
| **部署脚本那段 admin 检查（收紧后重跑）** | **通过** —— 证明将来的部署不会被这次收紧打断 |

env 变更：**追加**一行 `ADMIN_ALLOW_STATIC_TOKEN=false`，追加前已备份到
`/etc/mrright-portfolio.env.backup-20260812-051212`，文件权限仍为 `600 root`，未覆盖。
回退：删掉该行或改成 `true`，然后 `systemctl restart mrright-portfolio`。

### 部署结果

是否部署 VPS：**是**，本轮共 3 次部署：

| 时刻 (UTC) | commit | 结果 |
| --- | --- | --- |
| 04:34 | `4855438` | **失败**（健康检查竞态；发布本身是好的，裁剪未执行，4 份备份一个没删） |
| 04:49 | `615b961` | 成功，裁剪掉最旧 2 份，磁盘 49% → 45% |
| 05:11 | `48d3f69` | 成功，裁剪掉最后一份全量备份，磁盘 45% → **42%（8.2G）** |

上线 commit：`48d3f69`。

部署方式：与前几轮相同 —— `scripts/deploy-vps.mjs` 需要 `VPS_PASSWORD`，本机只有 SSH 密钥。
但这次**没有手工复述远程步骤**：用一个假的 `ssh2` 模块把 `deploy-vps.mjs` 会发送的原始远程脚本
原样捕获下来（脚本本身一字未改），再喂给远端 bash。所以跑的确实是新代码本身。

> 传输踩坑更新：上一轮记的「21MB scp 传不完」这次**没有复现**，因为改用了
> `cat file | ssh 'cat > /tmp/...'` 流式传输，两次部署都是**第 1 次就成功且 SHA-256 一致**。
> 建议以后就用这个方式，不要再跟 scp 的超时较劲。

VPS 备份路径：

- 数据库（部署前手工）：`/var/backups/mrright-portfolio/mrright-portfolio-20260812-043143.dump`
  （41.9 KB，17 个 table data 项，SHA-256 旁文件已写入）
- 应用目录：`/opt/mrright-portfolio.backup-20260812-044929`（本次回滚点，硬链接）
- env：`/etc/mrright-portfolio.env.backup-20260812-044929`
- 备份 timer 确认 active，当天 03:40 自动跑过一次

**新逻辑在真实生产上的实测数据（本轮最该记住的一组数字）：**

| 项 | 结果 |
| --- | --- |
| 硬链接是否生效 | `public/uploads` 各目录 `links=2` ✓ |
| 新备份增量成本 | **34116 KB ≈ 33M**（live 351M）—— 部署前预测 32M，命中 |
| `data/` 是否真实拷贝 | inode 132318 vs 25823，不同 ✓ |
| 回滚点内容 | 备份里的 `package.json` 是旧版本 ✓ |
| 裁剪 | 删掉最旧 2 份，保留最新 3 份 ✓ |
| 磁盘 | **49%（7.2G）→ 45%（7.9G）**，释放约 700MB |
| 备份总占用 | 1053M（3×351M）→ **427M**（359M 旧全量 + 2×34M 硬链接） |

**收工时的最终状态**：三份备份**全部**是硬链接（34116 / 34144 / 34152 KB），
最后一份 351M 全量拷贝已在第 3 次部署时被自然裁剪掉。
备份总占用 1053M → **100M**，磁盘 49%（7.2G）→ **42%（8.2G）**。

验证接口状态（线上 HTTPS，全部通过）：

- 第 9 条必需项：`/api/health` 200、`/api/admin/summary` 200、`/` 200、`/community` 200、
  `/admin` 200、`/login?mode=login` 200、`/account` 200
- 运维端点：`/robots.txt` 200、`/sitemap.xml` 200、`/api/v1/health` 200 且仍是严格信封
- **数据库完全未变**：`visitor_users=1`、`community_posts=1`、`community_uploads=0`、
  `download_requests=0`、`project_comments=2`、`project_likes=2`、`visitor_sessions=6`、
  17 张表 —— 与部署前逐项一致（本轮无 schema 变更，无迁移）
- production smoke（Playwright）：**6 passed，1 skipped**（需 `E2E_VISITOR_*` 的用例按设计跳过）
- 部署后日志窗口内 internal error 计数 **0**
- 启动自检：仅剩 `TRUST_PROXY_HOPS` 一条（在本机拓扑下无意义，见 `docs/OPERATIONS_CLIENT_IP.md`）

待办事项：

- 备份异地副本仍未配置 —— 现在更值得强调：应用备份是硬链接，**和 live 共享 inode 且同盘**。
  防得住误删（`unlink` 只减链接数），但磁盘损坏、文件系统损坏、原地写坏会让 live 和全部备份
  一起完蛋。这是备份体系最后一个结构性缺口，需要你提供 rclone 目标与凭据。
- ~~`ADMIN_ALLOW_STATIC_TOKEN` 收紧~~ —— **本轮已完成并上线**。
- **CSP 切 blocking 的答案已经查到，但没做**：线上收到的两条报告分别是
  `script-src <- wasm-eval` 和 `connect-src <- blob`，对应 `server/index.js:169-177` 里
  `scriptSrc` 未设（回落到 `defaultSrc 'self'`）且 `connectSrc: ['self']` 缺 `blob:`。
  改法应是加 `scriptSrc: ["'self'", "'wasm-unsafe-eval'"]` 与 `connectSrc: ["'self'", 'blob:']`，
  然后把 `reportOnly` 去掉。**没做的原因**：切 blocking 前必须用真浏览器过一遍全站，
  而当前会话的沙箱阻断子进程访问 localhost，本地 Playwright 跑不起来 ——
  漏一条指令就是线上白屏，不能靠推理上线。下轮 MCP 恢复后用 playwright 过一遍再切。
- **DMARC 仍未添加**（需要你在 Cloudflare 操作，我没有 DNS 权限）。已用 VPS 上的 `node:dns` 复查：
  `_dmarc.mrright.blog` 无记录；`send.mrright.blog` 的 SPF 与 `resend._domainkey` 的 DKIM 都在。
  要加的记录：`_dmarc.mrright.blog` TXT `v=DMARC1; p=none; rua=mailto:<你的邮箱>`。先用 `p=none` 只观察。
- `/etc/nginx/proxy.conf` 遗留文件待确认 —— **本轮刻意没碰**：它占用 443，而 443 是
  网站与机场节点按 SNI 分流共用的，动它有打挂机场节点的风险。见 `docs/OPERATIONS_CLIENT_IP.md`。
  **（2026-08-12 第七轮更正：「它占用 443」是错的，`nginx -T` 证明它从未被加载；
  谨慎本身没错，但依据是错的。已清理，见顶部。）**
- 注册验证码邮件仍未单独实测（走的是同一套 `emailDelivery.js`，理论上已可发）。
- `.gitattributes` 漏了 `*.mjs`，所以 `scripts/deploy-vps.mjs` 在 git 里是 CRLF，
  `git diff --check` 对它的新增行一律报 trailing whitespace。补 `*.mjs text eol=lf` 会产生
  全文件重新规范化的 diff，建议单独做一个规范化提交，不要混在功能改动里。

## 2026-08-11（第五轮）：接入 Resend，SMTP 首次配置完成

结论：`mrright.blog` 首次接入邮件服务（Resend），**端到端验证通过**。启动自检的 SMTP 告警消失，
密码重置邮件实测**直达 Gmail 收件匣、未落垃圾箱**。至此「忘记密码」这条链路第一次真正可用 ——
在此之前接口一直返回「已受理」但用户永远收不到信。

日期：2026-08-11。

诊断前提（起因是用户说「忘记了 SMTP 凭证」，实际结论相反，下次不用重查）：

- **这个域名从来没有接过任何邮件服务**，所以不存在「找回旧凭证」，是首次配置。
  证据：查 `mrright.blog` 的 MX 无、TXT(SPF) 无、DMARC 无、10 个常见 DKIM selector 全无。
  顺带一提，任何服务商的 SMTP 密码都只在创建时显示一次，本来也只能重置、不能找回。
- **本机 `dig` 未安装**，直接跑 `dig` 会得到空输出，**极易被误判成「没有记录」**。
  VPS 上用 `node:dns` 查是可靠的 —— 第一次查就是踩了这个坑，结论对但证据无效，重查过。
- **VPS 出站 25 / 465 / 587 全部可连通**，机房没封 SMTP 端口，服务商可自由选。
- **DNS 托管在 Cloudflare**（`lorna/kayden.ns.cloudflare.com`），`mrright.blog` 的 A 记录
  直指 `147.79.20.232`，即灰云。SPF/DKIM/DMARC 都是 TXT 记录，**不涉及橙云开关，
  加它们不会影响机场节点**（与 `docs/OPERATIONS_CLIENT_IP.md` 的约束不冲突）。

代码侧需要的键（`server/emailDelivery.js` 是手写 SMTP 客户端，非 nodemailer）：
`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`，
可选 `SMTP_SECURE`（`true` 时走 465 隐式 TLS，否则 587 + STARTTLS）、`SMTP_STARTTLS`。
支持 AUTH LOGIN 与 AUTH PLAIN。

**两个坑：**

- **`SMTP_FROM` 必须是裸地址**（`noreply@mrright.blog`）。`escapeAddress()` 会剥掉 `<>`，
  写成 `名字 <addr>` 会让 `MAIL FROM` 变成畸形指令被服务器拒绝。
- **`SMTP_USER` 是字面量 `resend`**，不是邮箱、不是账号名。这是 Resend 的设计，填错必然认证失败。

完成内容：

1. **确认这个域名此前从未接过邮件服务**（见上方诊断前提），所以是首次配置而非凭证找回。
2. **域名验证记录已在 Cloudflare 生效**（用 VPS 上的 `node:dns` 实测）：
   - `send.mrright.blog` TXT `v=spf1 include:amazonses.com ~all`
   - `send.mrright.blog` MX `feedback-smtp.ap-northeast-1.amazonses.com`
   - `resend._domainkey.mrright.blog` TXT（DKIM 公钥）
   - **DMARC 仍未配置** —— 建议加 `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<你的邮箱>`
3. **env 追加 5 个 SMTP 键**：`SMTP_HOST=smtp.resend.com`、`SMTP_PORT=587`、
   `SMTP_USER=resend`（字面量，不是邮箱）、`SMTP_PASS`（Resend API key）、
   `SMTP_FROM=noreply@mrright.blog`。**追加而非覆盖**，追加前已备份，文件权限仍为 `600 root`。
4. 重启服务，**启动自检从 2 条告警降为 1 条**（只剩 `TRUST_PROXY_HOPS`，在本机拓扑下无意义）。

修改文件：无（本轮不改代码，只改 VPS 上的 env 与本记录）

commit hash：本次提交（最终 hash 以 git log 为准）

build / lint 结果：**未运行 —— 本轮未修改任何业务代码**。线上仍是 `47d1cfc`。

是否部署 VPS：**否**（仅 env 变更 + 重启）。

VPS 备份路径：

- env：`/etc/mrright-portfolio.env.backup-20260811-153040`（追加 SMTP 键之前）

验证接口状态：

- 启动自检：SMTP 告警消失
- `POST /api/auth/forgot-password`（对已注册且已验证的地址）：
  - **注意 `delivery:"accepted"` 是写死的常量**，无论发信成败都返回它 —— 这是刻意设计，
    避免接口沦为「账号是否存在」的探测器。**不要拿它当发信成功的证据。**
  - 真正的证据是：`email_verified_at` 非空（说明没走静默跳过分支）、
    `password_reset_code_hash` 已写入且过期时间与响应一致（说明进入了发信路径）、
    且日志中**没有** `Password reset email delivery failed:`（说明 SMTP 握手/AUTH/DATA 全部成功）。
  - **最终收件确认：用户已回报收到（2026-08-11 23:34 UTC+8 / 15:34 UTC）。**
    邮件落在 **Gmail 收件匣，不是垃圾箱**；发件人显示 `noreply@mrright.blog`；
    主题 `mrright.blog password reset code`；正文含 6 位验证码与过期时间，
    并带「Continue on mrright.blog」链接。至此端到端闭环成立。
  - 值得记一笔：**只有 SPF + DKIM、尚未加 DMARC 的情况下就直达收件匣**，
    说明 Resend 的域名验证配置是干净的。
- 无法从服务端核对 Resend 投递日志：该 API key 是只写的，读操作返回
  `restricted to only send emails`。权限收紧是好事，但意味着投递状态只能到 Resend 后台看。
  （后台列表把这把 key 显示为 Full access，与 API 实际行为不符，建议下次顺手核对一眼。）

待办事项：

- DMARC 记录仍未添加（可选加固，当前不加也能进收件匣）：
  `_dmarc.mrright.blog` TXT `v=DMARC1; p=none; rua=mailto:<你的邮箱>`。先用 `p=none` 只观察。
- 注册验证码邮件走的是同一套 `emailDelivery.js`，**理论上现在也能发了，但本轮未单独实测**。
- 备份异地副本仍未配置（备份体系最后一个结构性缺口）。
- CSP 仍是 report-only；`ADMIN_ALLOW_STATIC_TOKEN` 仍未收紧；`/etc/nginx/proxy.conf` 遗留文件待确认。
- 应用备份的自动保留策略仍未做。

## 2026-08-11（第四轮）：清理应用备份 + 第一次真正跑通恢复演练

结论：按用户明确指示清理了积压的应用目录备份（磁盘 78% → 49%），并完成路线图上排第一的
**恢复演练**。演练本身通过了，但过程中发现 `docs/OPERATIONS_BACKUP.md` 里写的演练步骤
**从来就跑不通** —— 这正是「没演练过的备份等于没备份」的实例。文档已修正。

日期：2026-08-11。

完成内容：

1. **清理 `/opt` 应用备份（用户明确授权，覆盖 CLAUDE.md 第 3 条）**
   - 删除前先做了安全检查：逐个比对 12 份待删备份里的 `public/uploads` 与 `data`，
     确认**没有任何一个文件是 live 目录缺失的**（live: uploads 31 个文件 252M、data 2 个文件）。
     应用备份里的代码部分 git 都有，真正不可再生的只有上传文件，所以这一步是必须的。
   - 15 份 → 保留最近 3 份（`20260808-091326`、`20260811-115304`、`20260811-141721`），删除 12 份
   - 磁盘 `78%（剩 3.2G）` → **`49%（剩 7.2G）`**，释放约 4.2G
   - 删除后复查：服务 active、`/api/health` 200、uploads 31 个文件、data 2 个文件、
     数据库 dump 3 份、env 备份 8 份 —— **全部未被波及**
   - `/var/backups/mrright-portfolio`（数据库备份）**一份都没动**

2. **恢复演练（第一次真正执行）**
   - 目标归档：`mrright-portfolio-20260811-140623.dump`（本次部署前那一份）
   - `sha256sum -c` 通过 → `createdb mrright_restore_drill` → `pg_restore` 无错误
   - **表数量 17 = 生产 17**；行数 `visitor_users=1`、`community_posts=1`、`community_uploads=0`、
     `download_requests=0`、`project_comments=2`、`project_likes=2` —— 与生产逐项一致
   - 内容抽查为真实数据：最早评论 2026-06-03、1 个带邮箱的账号，不是空表
   - 演练库中 `project_comments` **没有 `status` 列** —— 正确，这份 dump 取于迁移之前，
     由此确认它是本次部署的**有效回滚点**

3. **修正 `docs/OPERATIONS_BACKUP.md` 中跑不通的演练步骤**
   - 原步骤让人 `cd /var/backups/mrright-portfolio` 后以 `postgres` 身份跑 `pg_restore` 相对路径。
     但该目录是 `0700 root`，`postgres` 既进不去也读不到，报错还是**误导性的**
     `could not open input file ... No such file or directory`（文件明明在，只是没权限）。
   - 已改为：先 `install -m 0600 -o postgres` 把 dump 暂存到 `/tmp`，恢复后 `shred -u` 销毁暂存副本
     （副本含真实用户数据，不能留、也不能用 0644）。
   - 同时补上「表数量也要和生产对齐」这一判定 —— 只看行数看不出缺表；并写明第 6 步
     `dropdb` 受 CLAUDE.md 第 11 条约束，需用户确认。

修改文件：

- `docs/OPERATIONS_BACKUP.md`
- `PROJECT_PROGRESS.md`

commit hash：本次提交（最终 hash 以 git log 为准）

build / lint 结果：**未运行 —— 本轮未修改任何业务代码**（只改文档）。线上运行的仍是 `47d1cfc`。

是否部署 VPS：**否**（本轮无代码变更，无需部署）。

VPS 备份路径（本轮保留下来的）：

- 数据库：`/var/backups/mrright-portfolio/` 共 3 份，最新 `mrright-portfolio-20260811-140623.dump`
- 应用目录：`/opt/mrright-portfolio.backup-20260811-141721`（本次部署的回滚点，已演练验证同期 dump 可还原）、
  `…-20260811-115304`、`…-20260808-091326`
- env：8 份，未动

验证接口状态：清理后 `/api/health` 200，服务 active。本轮未改代码，未重跑全量线上验证。

待办事项：

- **临时演练库 `mrright_restore_drill` 仍在 VPS 上**，等你确认后 `dropdb`（第 11 条禁止我自行 DROP）。
  它含真实用户数据副本，不宜久留。
- 应用备份的**自动保留策略**仍未做；一份备份 351M 中 252M 是 `public/uploads` 重复副本，
  值得考虑把上传目录移出应用目录或在备份时排除。
- SMTP 仍未配置（需要你的凭证）。
- 备份异地副本仍未配置 —— 演练证明了备份能还原，但它和数据库仍在同一块磁盘上，
  磁盘一坏两者一起没。这是现在备份体系里最后一个结构性缺口。

## 2026-08-11（第三轮）：把 47d1cfc 部署上线（签名 Cookie 身份 + 评论先审后发）

结论：上一轮写完但未部署的改动已全部上线，**线上代码与 main 的代码部分一致**。数据库迁移按预期
幂等执行，**部署前后所有表行数完全一致**。本轮未改任何业务代码，只做部署与验证，外加本条进度记录。

日期：2026-08-11（部署时刻 14:23 UTC）。

完成内容：

- 部署 `47d1cfc` 到 VPS，服务重启成功。
- 执行 `project_comments` 的幂等迁移（新增 `status` / `moderated_at` + 一个索引）。
- 按 `CLAUDE.md` 第 9 条逐项验证，并补充验证本轮新增的评论审核端点与签名 Cookie。

修改文件：

- `PROJECT_PROGRESS.md`（仅本条记录；本轮未改业务代码）

commit hash：

- 上线的代码：`47d1cfc`
- 本条记录的提交：本次提交（最终 hash 以 git log 为准）

build / lint / 测试结果（部署前本地全绿）：

- `npm run lint`：通过
- `npm run build`：通过
- `npm run test:api`：37/37 通过
- `npm run test:api:db`：54/54 通过
- `npm run test:openapi`：通过（33 个 error code）
- `git diff --check`：通过

是否部署 VPS：**是**（2026-08-11 14:23 UTC）。

VPS 备份路径（部署前全部先做好）：

- 数据库：`/var/backups/mrright-portfolio/mrright-portfolio-20260811-140623.dump`
  （41.4 KB，17 个 table data 项，SHA-256 旁文件已写入）
- 应用目录：`/opt/mrright-portfolio.backup-20260811-141721`
- env：`/etc/mrright-portfolio.env.backup-20260811-141721`
- 既有备份全部保留，未删除任何备份

部署方式：与上一轮相同 —— `scripts/deploy-vps.mjs` 需要 `VPS_PASSWORD`，本机只有 SSH 密钥，
因此按该脚本的同一套远程步骤用密钥手动执行。**未改写 nginx 配置，未改写 systemd unit**，
只替换 `dist`/`server`/`scripts`/`package.json`/`package-lock.json` 并 `npm ci --omit=dev`
（安装 106 个包）；`data`、`public/uploads`、env 与全部 backup 未动。

release 完整性：本地与 VPS 上 SHA-256 一致（`f8c23126…5fe2bc`）。

> 传输踩坑记录（下次会遇到）：21MB 的 release 用 `scp` 单次传不完，300 秒超时后在离终点约 4KB
> 处被中断；而且**中断产物不是本地文件的干净前缀**（前缀哈希对不上），所以不能靠续传字节拼接。
> VPS 上**没有装 rsync**。可行做法是重传并逐次校验 SHA-256（脚本重试 4 次，实际第 1 次即成功）。

数据库迁移结果：

- `project_comments` 迁移前 6 列（`id/project_slug/author/message/created_at/user_id`），
  迁移后新增 `status:text` 与 `moderated_at:timestamptz` —— 确认存在
- 新增索引 `project_comments_status_created_idx` —— 确认存在
- 存量 2 条评论全部为 `status=published`，与设计一致，线上已有评论未受影响
- **数据完全一致**：`visitor_users=1`、`community_posts=1`、`community_uploads=0`、
  `download_requests=0`、`project_comments=2`、`visitor_sessions=6` —— 部署前后完全相同
- 本轮无过期会话清理输出（上一轮清了 22 条），与 `visitor_sessions` 保持 6 相符

验证接口状态（线上 HTTPS，全部通过）：

- 必需项：`/api/health` 200、`/api/admin/summary` 200、`/` 200、`/community` 200、`/admin` 200、
  `/login?mode=login` 200、`/account` 200
- 本轮新端点：`GET /api/admin/comments?status=pending` 200（队列当前为空）、
  不带参数的全量视图 200（行为未变）
- `PATCH /api/admin/comments/:id` 错误码正确：不存在的 id 返回 `COMMENT_NOT_FOUND`，
  非法状态返回 `VALIDATION_ERROR`（两者均不改数据）
- 运维端点：`/robots.txt` 200、`/sitemap.xml` 200
- `/api/v1/health` 仍返回严格信封（仅 data/pagination/error）
- production smoke（Playwright）：**10 passed，4 skipped**（跳过的是需要 `E2E_VISITOR_*`
  与管理员令牌的可选用例，按测试设计跳过）
- 部署后日志窗口内 internal error 计数为 **0**

签名 Cookie 线上实测（唯一一次写入式验证，净变化为零）：

- 首次 `POST /api/projects/:slug/like` 返回
  `Set-Cookie: mrright-vid=…; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax` —— 与设计一致
- 带同一 Cookie 再请求一次，**不再重新签发** Cookie，说明签名校验通过并沿用
- 第二次请求故意传了**完全不同**的客户端 `visitorId`，结果仍然切换的是同一个赞
  （`liked:true,count:1` → `liked:false,count:0`）—— **确认客户端 visitorId 的值确实已被忽略**，
  身份来自服务端签发的 Cookie
- toggle 回到原值，`project_likes` 仅剩 6 月的 2 条历史数据（不同项目、旧 UUID 格式），本次测试零残留

启动自检线上输出：仍是 2 条告警（SMTP 未配置、`TRUST_PROXY_HOPS` 未设置）。
后者在本机拓扑下无意义 —— 443 由 nginx stream 按 SNI 分流，改跳数也拿不到真实 IP，
详见 `docs/OPERATIONS_CLIENT_IP.md`（该文档本轮已随代码上线）。

待办事项：

- **磁盘保留策略已升级为最紧迫项**：`/opt/mrright-portfolio.backup-*` 已 15 份约 5.2G，
  磁盘 78%（剩 3.2G），每次部署 +351M。
- SMTP 仍未配置，忘记密码/注册验证码邮件发不出去（接口返回「已受理」但用户收不到）。
- 备份异地副本仍未配置（备份与数据库同机）；恢复演练仍未在生产备份上跑过。
- CSP 仍是 report-only（线上已收到 `script-src`、`connect-src blob`、`wasm-eval` 若干报告，
  切 blocking 前需要先看这些报告是否属于自家资源）。
- `ADMIN_ALLOW_STATIC_TOKEN` 仍未收紧；`/etc/nginx/proxy.conf` 遗留文件仍待确认。

## 2026-08-11（第二轮）：接受 IP 不可得的现实，改用不依赖 IP 的补偿措施

结论：查明 443 端口由网站与机场节点（sui / sing-box）通过 nginx stream 的 SNI 分流共用，
四层裸 TCP 转发导致**所有 HTTPS 访客在应用侧都是 127.0.0.1**。经评估**决定不修基础设施**
（唯一的标准修法会打挂正在服务用户的机场节点），转而把任何依赖「区分匿名访客」的功能
改成不依赖 IP 的实现。本轮已完成本地开发与验证，**未部署**。

背景与决策全文见新增的 `docs/OPERATIONS_CLIENT_IP.md`。

完成内容：

1. **修正上一轮点赞防刷的连带缺陷**
   - 上一轮把点赞身份改成 `HMAC(IP + UA + slug)`，方向对，但在这台机器上 IP 恒为 127.0.0.1，
     结果退化成「按浏览器 UA 字符串去重」—— 同一款浏览器的所有匿名访客塌缩成一个点赞
   - 改为**服务端签发的签名 Cookie**（`mrright-vid`，HttpOnly / SameSite=Lax / 一年）：
     值为 `随机 id.HMAC 签名`，客户端无法伪造；完全不依赖 IP
   - 已知取舍：清 Cookie 可以再点一次。门槛远高于原先「改一个 localStorage 字符串」，
     且方向仍是少算而非虚高

2. **项目评论改为先审后发（补偿失效的 IP 限流）**
   - `project_comments` 新增 `status`（`published`/`pending`/`spam`）与 `moderated_at`，
     存量行默认 `published`，线上已有评论不受影响
   - 登录且**邮箱已验证**的访客直接发布；匿名访客进审核队列
   - 垃圾特征直接判 `spam`，不进人工队列：链接数 ≥ 3、短文本几乎全是链接、
     单字符长串重复、常见垃圾关键词、以及**同一项目下重复发送相同内容**
   - 按账号的滚动窗口限额（默认 10 条/小时），不使用 IP
   - 公开读取只返回 `published`；作者在个人中心能看到自己待审核的评论，不会以为丢了
   - 对垃圾判定**不告知具体原因**：告诉刷子哪条规则拦住了他等于免费调优建议，
     而误判在作者自己的页面里看得到

3. **管理端审核**
   - `GET /api/admin/comments?status=pending` 驱动审核队列（不带参数仍是原来的全量视图，行为不变）
   - 新增 `PATCH /api/admin/comments/:id`（`published`/`pending`/`spam`）

修改文件：`server/index.js`、`server/postgresStores.js`、`src/components/ProjectDetail.jsx`、
`src/lib/i18n.js`、`tests/api/contract.db.spec.js`；新增 `docs/OPERATIONS_CLIENT_IP.md`。

本轮验证结果：

- `npm run lint`、`npm run build`：通过
- `npm run test:api`：37/37 通过
- `npm run test:api:db`：**54/54 通过**（上一轮 48 个 + 本轮 6 个）
- `npm run test:openapi`：通过（33 个 error code，未新增）
- `git diff --check`：通过

新增测试覆盖：签名 Cookie 的签发/沿用/伪造替换、同一 Cookie 下更换 visitorId 只会来回切换同一个赞、
匿名评论进队列且不公开、已验证用户直接发布、链接堆砌与重复内容判为 spam 且永不显示、
管理员审核放行、非法状态与不存在评论的错误码。

数据库影响：`ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS status/moderated_at` +
一个索引。幂等新增，无 DROP/TRUNCATE/DELETE，存量数据不变。

待办：本轮**尚未部署**。部署前仍需按 `docs/OPERATIONS_BACKUP.md` 备份（备份 timer 已在线上运行）。

## 2026-08-11：第二阶段安全加固（备份、账号生命周期、管理员会话、上传与下载）

结论：完成一轮以「静默失效的安全控制」为主线的加固。这一轮修的不是崩溃，而是那些**系统照常运行、但某个安全属性其实什么都没做**的地方：数据库从来没有备份、忘记密码的用户永久失去账号、管理员令牌永久有效且明文存在浏览器里、点赞身份由客户端自己声明、上传只看文件名后缀。全部改动均在本地完成，**未部署、未读取或输出任何 token/password/secret、未触碰生产环境与生产数据库**。数据库 schema 有新增列与新增表，但只通过 `ensureSchema` 的 `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` 增量执行，未删除任何列、表或数据。

完成内容：

1. **数据库备份（此前完全没有）**
   - `scripts/backup-database.mjs`：`pg_dump --format=custom` + `pg_restore --list` 结构校验 + SHA-256 旁文件 + 可选保留策略
   - `scripts/systemd/mrright-backup.service` / `.timer`：每日 03:30，`Persistent=true` 补跑，复用主服务的 `EnvironmentFile`
   - `docs/OPERATIONS_BACKUP.md`：安装、异地副本方案、**恢复演练步骤**、灾难恢复流程、已知缺口（无 PITR）
   - 三条安全性质：连接串永不输出；清理必须显式开启且跳过无校验旁文件的 dump；只有归档可被 `pg_restore` 解析才算成功
   - 已用一次性集群完成端到端验证：成功路径、校验和、保留策略裁剪、截断归档被拒、**真实恢复演练（2 行数据成功还原）**

2. **账号维度限流（此前只有按 IP 限流）**
   - `visitor_users` 新增 `failed_login_count` / `locked_until` / `verification_attempts`
   - 连续失败 `LOGIN_LOCK_AFTER`（默认 8）次锁定 `LOGIN_LOCK_MINUTES`（默认 15）分钟，**锁定期间正确密码也拒绝**
   - 验证码失败达 `VERIFICATION_MAX_ATTEMPTS`（默认 6）次即作废该验证码；重发验证码会重置计数，避免账号被永久卡死
   - 不存在的邮箱永远返回和密码错误相同的 401，不会因为锁定状态泄露账号是否注册

3. **账号生命周期（忘记密码/改密码/改邮箱/注销/登出其他设备，此前全部缺失）**
   - 新增 `POST /api/auth/forgot-password`、`POST /api/auth/reset-password`
   - 新增 `PUT /api/account/password`、`POST /api/account/sessions/revoke-all`
   - 新增 `POST /api/account/email`、`POST /api/account/email/confirm`、`DELETE /api/account/email`
   - 新增 `DELETE /api/account`（需当前密码 + 输入 DELETE 确认）
   - 重置密码会作废该账号**全部**会话；修改密码保留当前设备、踢掉其他设备
   - 改邮箱的确认码只发往**新地址**，确认前旧地址仍可登录
   - 注销：删除上传文件、匿名化 `project_comments.author` 与 `download_requests` 的姓名邮箱、保留他人可见的帖子与评论（避免连带删除别人的回复）
   - 密码强度校验：拒绝常见弱口令、包含邮箱前缀或昵称的密码、单字符重复

4. **管理员短时会话取代永久静态令牌**
   - 新增 `admin_sessions` 表（只存 SHA-256 哈希，记录 IP / User-Agent / 最后使用时间）
   - 新增 `POST /api/admin/session`（用 ADMIN_TOKEN 换 12 小时会话）、`DELETE /api/admin/session`、`GET /api/admin/sessions`
   - `src/Admin.jsx` 换取会话后**丢弃**静态令牌，localStorage 里不再存永久密钥；登出会真正吊销
   - 静态令牌仍可直接调 API（`ADMIN_ALLOW_STATIC_TOKEN=true`），为部署脚本保留兼容；收紧路径写在 `docs/OPERATIONS_ADMIN_AUTH.md`

5. **点赞防刷：身份改为服务端派生**
   - 登录用户用账号 id；匿名用户用 `HMAC(VISITOR_ID_SECRET, IP|UA|slug)`
   - 客户端传的 `visitorId` 仍在请求 schema 中（v1 契约冻结），但**值已被完全忽略**，下个契约版本移除

6. **上传加固**
   - 魔数校验：jpg/png/gif/webp/glb/zip 校验文件头，gltf/obj 校验文本开头且不含 NUL，fbx 支持二进制与 ASCII 两种
   - 账号级配额：滚动 24 小时内 30 个文件 / 1GB，在 multer 落盘**之前**用 Content-Length 预判
   - 文件名加 4 字节随机后缀，消除同毫秒同名互相覆盖，也让存储路径不可从原文件名推测

7. **下载链路修复**
   - 新增一次性下载票据 `POST /api/projects/:slug/download-ticket`（2 分钟有效、单次使用、绑定项目）
   - 前端不再用 `fetch` → `Blob` 把整个压缩包读进内存（大包会让标签页 OOM），改为浏览器直接流式下载
   - `response.download` 带 `Content-Disposition`；新增 `download_events` 审计表记录谁在何时下载
   - 归档路径从 `process.cwd()` 改为 `rootDir`，与文件内其他路径一致

8. **下载审批通知（此前审批结果对用户不可见）**
   - `emailDelivery.js` 抽出通用 `sendMail`，新增密码重置、改邮箱、下载审批三类模板
   - 审批/拒绝后自动发邮件并记录 `notified_at`；邮件失败不会让已提交的审批变成 500

9. **/uploads 授权缓存与 CSP 报告**
   - 授权查询加 30 秒 TTL 缓存（上限 1000 条），消除每个静态资源一次数据库查询；审核状态变更与删除时显式失效
   - CSP 增加 `report-uri`，新增 `POST /api/csp-report` 收集端点（聚合计数，避免刷屏）

10. **运维可见性**
    - 新增 `/robots.txt` 与 `/sitemap.xml`（动态生成，**不列出公开主页以免枚举注册用户**）
    - 新增 `GET /api/admin/diagnostics` 回显解析到的客户端 IP，用于核对 trust proxy 跳数
    - 启动自检：缺少 DATABASE_URL / ADMIN_TOKEN / VISITOR_ID_SECRET / SMTP / CORS_ORIGIN / TRUST_PROXY_HOPS 时打印告警
    - 过期清理扩展到管理员会话与下载票据

11. **修复 dist/ 重新被跟踪的回归**
    - `8ec237d` 取消跟踪 dist/ 之后，`46f53ea` 又把 62 个文件加了回来，CI 的 dist 门禁在 main 上一直是失败的
    - 已重新 `git rm -r --cached dist`（**未删除磁盘文件**，只移出索引）

修改文件：

- 新增：`scripts/backup-database.mjs`、`scripts/systemd/mrright-backup.service`、`scripts/systemd/mrright-backup.timer`、`docs/OPERATIONS_BACKUP.md`、`docs/OPERATIONS_ADMIN_AUTH.md`
- 后端：`server/index.js`、`server/postgresStores.js`、`server/responses.js`、`server/emailDelivery.js`
- 前端：`src/App.jsx`、`src/Admin.jsx`、`src/lib/api.js`、`src/lib/i18n.js`、`src/pages/AuthPage.jsx`、`src/pages/AccountPage.jsx`
- 契约与文档：`docs/openapi/api-v1.yaml`、`docs/API_ERRORS.md`
- 测试：`tests/api/contract.db.spec.js`

新增 API error code（27 → 33）：`ACCOUNT_LOCKED`、`PASSWORD_INCORRECT`、`PASSWORD_RESET_INVALID`、`EMAIL_CHANGE_INVALID`、`UPLOAD_QUOTA_EXCEEDED`、`DOWNLOAD_TICKET_INVALID`

commit hash：`ca28780`（功能提交）→ `fe80a62`（合并到 main）。分支 `security/phase-2-hardening-20260811` 已推送，已 `--no-ff` 合并进 main 并推送 GitHub，未使用 force push、未 reset。

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过。
- `npm run test:api`：37/37 通过。
- `npm run test:api:db`：**48/48 通过**（原 26 个 + 新增 22 个安全回归测试）。
- `npm run test:openapi`：通过（200 个本地 `$ref`、33 个 API error code）。
- `git diff --check`：通过。
- 备份脚本一次性集群验证：成功路径 / 校验和 / 保留策略 / 截断归档被拒 / 真实恢复演练全部通过。
- 本地服务冒烟：`/api/health`、`/robots.txt`、`/sitemap.xml`、`/api/csp-report`（204）、`/`、`/community`、`/account`、`/login?mode=forgot`、`/login?mode=reset` 全部 200。
- 本地 Playwright 渲染检查：登录页「忘记密码」入口、忘记密码页、重置密码页三语（中/英/日）文案与表单字段全部正确，无 console 错误。

新增测试覆盖（22 个）：

- 登录锁定：耗尽预算后正确密码也被拒；成功登录清空计数；未知邮箱永不锁定也不泄露
- 验证码预算：耗尽后真实验证码失效；重发后可正常完成
- 密码重置：注册与未注册地址响应完全一致；重置后旧会话与旧密码均失效；错误验证码；弱密码拒绝
- 改密码：需当前密码；当前设备保留、其他设备被踢
- 改邮箱：需当前密码；确认前旧邮箱仍可登录；错误验证码；确认后新邮箱生效且旧邮箱失效
- 注销账号：需确认字符串 + 当前密码；注销后会话与登录均失效
- 管理员会话：静态令牌换会话、会话可用、吊销后立即失效、伪造令牌被拒
- 上传：伪造扩展名被拒、真实 PNG 通过
- 点赞：更换客户端 visitorId 无法重复点赞
- 下载票据：无审批被拒、单次使用、伪造票据被拒
- 运维端点：robots / sitemap（不含 `/u/`）/ CSP 报告 / 管理员诊断

是否部署 VPS：**是**（2026-08-11 11:53 UTC）。

VPS 备份路径：

- 数据库（本轮新增的第一份）：`/var/backups/mrright-portfolio/mrright-portfolio-20260811-110750.dump`
  - 结构校验通过（14 个 TABLE DATA 项），SHA-256 旁文件已写入
  - 备份时行数：visitor_users=1、community_posts=1、community_uploads=0、download_requests=0、project_comments=2、visitor_sessions=27
- 应用目录：`/opt/mrright-portfolio.backup-20260811-115304`
- env：`/etc/mrright-portfolio.env.backup-20260811-115304`
- 既有 backup 全部保留，未删除任何备份

部署方式：`scripts/deploy-vps.mjs` 需要 `VPS_PASSWORD` 密码认证，本次环境只有 SSH 密钥，因此按该脚本的同一套远程步骤用密钥手动执行。**未改写 nginx 配置，未改写 systemd unit**（与脚本默认的幂等行为一致），只替换 `dist`/`server`/`scripts`/`package.json`/`package-lock.json` 并重装生产依赖；`data`、`public/uploads`、env 与全部 backup 未动。

release 完整性：本地与 VPS 上 SHA-256 一致（`b810a989…c995e1`）。

env 变更：`/etc/mrright-portfolio.env` **追加**一行 `VISITOR_ID_SECRET`（`openssl rand -hex 32` 生成，值未输出到任何地方）。文件未被覆盖，追加前已备份。

数据库迁移结果：

- `visitor_users` 新增 11 列、`download_requests` 新增 2 列、新建 3 张表 —— 全部确认存在
- **数据完全一致**：visitor_users=1、community_posts=1、community_uploads=0、download_requests=0、project_comments=2 与备份时相同
- `visitor_sessions` 由 27 降为 5，是新增的过期会话清理按设计执行（日志：`Removed 22 expired visitor session(s)`），非数据丢失

验证接口状态（线上 HTTPS，全部通过）：

- 必需项：`/api/health` 200、`/api/admin/summary` 200、`/` 200、`/community` 200、`/admin` 200、`/login?mode=login` 200、`/account` 200
- 新增端点：`/robots.txt` 200、`/sitemap.xml` 200（6 条 URL，确认不含 `/u/`）、`/api/csp-report` 204
- 管理员会话：静态令牌换会话 → 用会话调 summary 200 → 吊销后再调 401，闭环成立
- `/api/v1/health` 返回严格信封（仅 data/pagination/error）——**确认 API v1 契约确实已上线**，2026-07-25 审查的第 3 项漂移问题就此关闭
- 新流程线上实测：忘记密码对未注册地址返回统一 200 且不泄露 devCode；错误重置码返回 `PASSWORD_RESET_INVALID`；弱密码被拒；未认证访问改密码/注销返回 `AUTH_REQUIRED`；无审批申请下载票据返回 `RESOURCE_FORBIDDEN`；伪造票据返回 `DOWNLOAD_TICKET_INVALID`
- production smoke（Playwright）：6 passed，1 skipped（未提供 `E2E_VISITOR_EMAIL`/`E2E_VISITOR_PASSWORD`，按测试设计跳过）
- 启动自检线上输出：仅剩 2 条告警（SMTP 未配置、TRUST_PROXY_HOPS 未设置），其余配置项均已就绪
- 部署后日志窗口未出现新的 API internal error

## 2026-08-11 部署时发现的线上问题（尚未修复，需人工决策）

**1. 真实客户端 IP 没有到达应用 —— 所有 IP 限流实际上是一个全局桶（高优先级）**

本轮新增的 `GET /api/admin/diagnostics` 第一次使用就抓到了这个问题。从**外部**发起的请求，应用侧解析结果是：

```
resolvedIp    127.0.0.1
forwardedFor  127.0.0.1
protocol      https
trustProxyHops 1
```

后果：

- `/api/auth/login`、`/api/auth/register` 等所有按 IP 的限流退化成全站共享一个桶。
  一个攻击者可以独占全部配额，同时把正常用户挤掉。
- `download_requests.ip`、`admin_sessions.ip` 记录的全是 `127.0.0.1`，审计轨迹没有价值。
- 本轮新增的账号维度限流**不受影响**（它按账号计数，不依赖 IP），这也正是当初把预算放在账号上的原因。

现场证据：

- `/etc/nginx/` 下**没有任何** `set_real_ip_from` / `real_ip_header` 配置，而 nginx 访问日志里出现过 Cloudflare 段的地址（`104.23.239.45`），说明 Cloudflare 确实在链路中。
- 站点配置只有 `listen 80`，`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`。
- 同机还跑着 `nps`（内网穿透代理，端口 8025），部分请求在 nginx 侧的 `$remote_addr` 就是 `127.0.0.1`。

建议修复（**本轮没有执行**，因为改的是生产边缘配置，且 `set_real_ip_from` 写错会引入 IP 伪造漏洞，必须先确认拓扑）：

```nginx
# 仅在确认 Cloudflare 是唯一入口后加入
set_real_ip_from <Cloudflare IPv4/IPv6 段>;   # https://www.cloudflare.com/ips/
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

配好后用 `GET /api/admin/diagnostics` 复验：外部请求的 `resolvedIp` 应等于你的真实公网 IP。若确认链路是 Cloudflare → nginx 两跳，还需把 `TRUST_PROXY_HOPS` 设为 2。

**2. `/etc/nginx/proxy.conf` 是一个未配置的遗留文件**

它占用 443，`server_name` still 是占位符 `<write your domain>`，内容是把请求代理到 `registry-1.docker.io` 的 Docker 镜像加速模板。与本项目无关，建议确认是否还需要，以及它是否影响 mrright.blog 的 TLS 入口。

**（2026-08-12 第七轮更正并结案：「它占用 443」是错的 —— `nginx -T` 显示它从未被加载，
证书路径还是占位符，真被加载 `nginx -t` 就会失败。已移到
`/root/legacy-nginx-proxy.conf.20260812.bak`。）**

**3. 磁盘水位**

`/` 已用 73%（剩 3.9G），其中 `/opt/mrright-portfolio.backup-*` 合计 4.5G。按规则未删除任何备份，但需要你决定保留策略，否则再几次部署就会写满。数据库备份很小（37K），不是压力来源。

待办事项：

- **最高优先级**：修复真实客户端 IP 不可见的问题（见上「部署时发现的线上问题」第 1 条）。在修好之前，所有按 IP 的限流等同于失效。
- **SMTP 尚未配置**，所以忘记密码邮件目前发不出去：接口返回「已受理」但用户收不到验证码。密码重置要真正可用必须先配 `SMTP_HOST` 等键。注册验证码一直是同样状态。
- 安装备份 timer（`docs/OPERATIONS_BACKUP.md` 的安装步骤，release 里已包含脚本与 unit 文件）并做第一次恢复演练，把结果记进本文件。本轮的手动备份只是部署前的一次性保险。
- 决定 `/opt/mrright-portfolio.backup-*` 的保留策略（现已占 4.5G，磁盘 73%）。
- 确认 `/etc/nginx/proxy.conf` 这个 Docker 镜像加速遗留配置是否还需要。
- 配置备份异地副本（rclone 目标），当前备份仍与数据库同机。
- 观察 CSP 报告若干天后，把 `contentSecurityPolicy` 从 report-only 切成 blocking。
- 确认无脚本依赖静态管理员令牌后，设置 `ADMIN_ALLOW_STATIC_TOKEN=false`。
- 仍未做：管理员账号体系 + TOTP、匿名项目评论的审核队列与反垃圾、react-router、拆分 `Admin.jsx`（2400+ 行）与 `postgresStores.js`（3000+ 行）、前端单元测试、SSR/预渲染 SEO。

## 2026-08-08：第一阶段基础设施改进（CI、部署安全、数据清理、SQL 安全）

结论：完成第一阶段 4 项基础设施改进，全部通过 lint/build/test:api/test:api:db/test:openapi 验证。这一轮修复的是结构性问题：Web/API 完全没有 CI、部署脚本每次覆盖 nginx 配置会丢失 TLS 设置、visitor_sessions 只增不减、公开接口 SQL 查询仍在选取 email 列（虽然 mapper 会丢弃）、以及 `.map(toX)` 把数组索引当 options 传入的脆弱性。本轮**未部署、未改数据库 schema、未读取或输出任何 token/password/secret、未触碰生产环境**。

完成内容：

1. **CI for Web and API** (`.github/workflows/web.yml`)
   - checks job: lint + build + API contract (37 tests, no DB) + OpenAPI validation (200 $ref, 27 error codes) + gate that fails if dist/ reappears in git
   - api-db-contract job: Postgres 16 service + DB contract suite (23 tests including new regression tests)
   - E2E tests (production-smoke, admin-visitors) stay operator-run since they default to the live site

2. **Untrack dist/ from version control**
   - Removed 79 files (4355 lines) that were committed before .gitignore
   - `npm run build` generates dist/ locally; `npm run release:vps` archives it
   - Every build changes hashes → spurious `git restore` loops in PROJECT_PROGRESS.md
   - New CI gate enforces dist/ stays untracked

3. **Idempotent deployment**
   - `scripts/deploy-vps.mjs` now checks if nginx/systemd configs exist before writing
   - `VPS_REWRITE_NGINX=true` / `VPS_REWRITE_SERVICE=true` required to overwrite
   - Nginx was HTTP-only (listen 80); overwriting a certbot-modified config dropped HTTPS
   - `systemctl reload nginx || restart` keeps connections open when config unchanged
   - `js-yaml` now explicit devDependency (was transitive via @eslint/eslintrc)

4. **Session cleanup + SQL email leak prevention + .map fragility**
   - `authStore.deleteExpiredSessions()`: sweeps visitor_sessions WHERE expires_at <= now(), called every 6 hours (configurable via SESSION_SWEEP_INTERVAL_MS)
   - Removed `visitor_users.email` from 11 public-path SELECTs (interactionsStore, communityStore); adminStore queries retain it with explicit `includeEmail: true`
   - Wrapped 9 bare `.map(toComment|toCommunityUpload|toCommunityPost)` calls in explicit arrows so the numeric index isn't silently passed as options
   - New regression tests (4 tests, now 23 total in contract.db.spec.js):
     * Public endpoints never expose registration email, even to authenticated viewers reading their own rows
     * Public user summaries carry exactly `{id, displayName, accessLevel}`
     * Admin endpoints still include email (proves removal was scoped, not global)
     * Verified the tests catch the leak by injecting the 2026-07-25 bug back in

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过；dist/ 现已 untracked，构建产物不再进入 git。
- `npm run test:api`：37/37 通过。
- `npm run test:api:db`：23/23 通过（新增 4 个 PII containment 回归测试）。
- `npm run test:openapi`：通过（200 个本地 `$ref`、27 个 API error code）。
- `git diff --check`：通过。
- 回归验证：临时注入 2026-07-25 原始 bug（toUserSummary 无条件返回 email + 公开查询重新 SELECT email），测试套件报错 `/api/community/posts leaked contract-db-a@example.com`，证明新测试能抓到真实回归。

待办（后续阶段）：

- 第二阶段（1-2 周）：download 授权落地、CSP report-uri + blocking、project like 防刷
- 第三阶段（1 个月）：react-router、拆 Admin.jsx、getProject 单查询、i18n 拆分
- 第四阶段：Asset Model 实现（checksum、visibility、downloadPolicy）
- C++ SDK：建议冻结在当前状态，等 Asset Model 稳定后再继续

## 2026-08-08：社区页面增加返回首页入口

结论：社区页面顶部导航现在提供明确的“返回首页”链接，桌面和移动布局均可使用；补齐 zh/en/ja 文案。本轮已部署到 VPS，未改数据库、未读取或输出任何 token/password/secret。

完成内容：

- `src/pages/CommunityPage.jsx`：在社区页 logo 与语言切换之间加入返回 `/` 的 secondary action，使用箭头和本地化文案，保持现有社区帖子详情返回社区列表功能不变。
- `src/lib/i18n.js`：新增 `communityBackHome` 的中文、英文、日文文案。
- `tests/e2e/production-smoke.spec.js`：社区页面 smoke 增加返回首页链接可见性断言。

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过；构建生成的 tracked `dist/` 已恢复，未提交构建产物。
- 本地 Playwright 社区页面回归：通过（1/1），返回首页链接正常显示。
- `git diff --check`：通过。

部署结果：

- `npm run release:vps` 成功生成 release archive；上传前后 SHA-256 一致。
- 部署前确认 `DATABASE_URL`、`ADMIN_TOKEN` 均为 `[set]`，未输出值。
- 已创建 `/opt/mrright-portfolio.backup-20260808-091326` 和 `/etc/mrright-portfolio.env.backup-20260808-091326`；既有 backup 继续保留。
- 只替换 release 中的 `dist`、`server`、`scripts`、`package.json`、`package-lock.json`，重新安装生产依赖；保留 `data`、`public/uploads`、env 和所有 backup。
- `mrright-portfolio` 重启后保持 active，health 200，admin summary 200。
- 线上 `/community` 200，返回首页链接实际渲染并由 smoke 断言通过；线上 `/`、`/login?mode=login`、`/account`、`/admin`、`/u/not-exist-test-handle` 均通过页面验证。
- production smoke：6 passed，真实账号登录场景因未提供 `E2E_VISITOR_EMAIL` / `E2E_VISITOR_PASSWORD` 而按测试设计跳过。
- 认证接口仍返回 `Cache-Control: no-store`；未修改数据库 schema、数据、上传文件或生产环境变量。

## 2026-08-08：修复访客登录成功后立即掉线

结论：已修复线上“密码正确但无法登录/登录后回到登录页”的认证回归。根因是旧的匿名 `GET /api/auth/me` 响应被浏览器条件缓存，登录成功后再次请求该接口时服务端返回 `304 Not Modified`；`304` 没有 JSON body，前端把空响应当成无效会话并清除了刚保存的 token。认证接口现在统一禁止缓存、忽略条件请求验证头并始终返回完整 JSON，前端认证请求也显式使用 `cache: 'no-store'`。本轮已部署、未改数据库、未读取或输出任何 token/password/secret。

完成内容：

- `server/index.js`：为 `/api/auth/*` 增加 `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`、`Pragma: no-cache` 和 `Expires: 0`，阻止匿名会话响应被复用为 304。
- `server/index.js`：认证中间件移除 `If-None-Match` / `If-Modified-Since`，即使浏览器或代理发送条件请求，认证接口也不会返回空 body 的 304。
- `src/lib/api.js`：`/api/auth/me`、login、logout、register、verify-email、resend-verification` 请求显式使用 `cache: 'no-store'`。
- `scripts/run-api-db-tests.mjs`：仅为一次性 PostgreSQL 测试进程注入 `EXPOSE_DEV_VERIFICATION_CODE=true`，不改变生产默认，保证测试可以在无 SMTP 环境完成邮箱验证。
- `tests/api/contract.db.spec.js`：新增注册→邮箱验证→密码登录回归，确认密码登录签发可用 session；新增认证响应 `no-store` 和条件请求不会返回 304 的断言。

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过；构建生成的 tracked `dist/` 已恢复，未提交构建产物。
- `npm run test:api`：37/37 通过。
- `npm run test:api:db`：19/19 通过；覆盖真实 PostgreSQL 认证、密码登录、session 和 multipart 错误合约。
- `npm run test:openapi`：通过（200 个本地 `$ref`、27 个 API error code）。
- 本地 Playwright 页面回归：`/`、`/community`、`/login?mode=login`、`/account`、`/u/not-exist-test-handle` 通过（5/5）。无数据库环境下账户只读接口返回既定 `503 SERVICE_UNAVAILABLE`，与现有 API 合约一致。

线上核查：部署前日志确认登录 POST 曾返回 200，紧接着 `/api/auth/me` 返回 304，与本次根因完全吻合；本轮已完成 VPS 备份、替换、重启和接口/页面验证。后续条件请求回归也必须返回 200 完整 JSON。

部署结果：

- `npm run release:vps` 成功生成 release archive；上传前后 SHA-256 一致。
- 部署前确认 `DATABASE_URL`、`ADMIN_TOKEN` 均为 `[set]`，未输出值。
- 已创建 `/opt/mrright-portfolio.backup-20260808-085858` 和 `/etc/mrright-portfolio.env.backup-20260808-085858`；既有 backup 继续保留。
- 只替换 release 中的 `dist`、`server`、`scripts`、`package.json`、`package-lock.json`，重新安装生产依赖；保留 `data`、`public/uploads`、env 和所有 backup。
- `mrright-portfolio` 重启后保持 active。
- 线上验证通过：`/api/health` 200、`/api/admin/summary` 200、`/api/auth/me` 200、未认证 account 接口 401、`/admin`/`/community`/`/login?mode=login`/`/account`/`/u/not-exist-test-handle` 均 200；带 `If-None-Match` 的 `/api/auth/me` 也返回 200 完整 JSON，不再返回 304。
- production smoke：6 passed，真实账号登录场景因未提供 `E2E_VISITOR_EMAIL` / `E2E_VISITOR_PASSWORD` 而按测试设计跳过。
- 部署后最近日志窗口未发现新的 API internal error；未修改数据库 schema、数据、上传文件或生产环境变量。

## 2026-08-08：作品集 UI、可访问性与前端稳定性收尾

结论：本轮继续完善 Web 作品集的首屏体验、公开主页错误状态、对话框键盘交互与移动端可用性。重点把弹窗从“能显示”提升为键盘用户可安全操作的 dialog surface，并用稳定 API error code 驱动三语言文案。所有改动均在本地完成，**未部署、未改数据库、未读取或输出任何 token/password/secret、未触碰生产环境**。

完成内容：

- 修复 `useDialogAccessibility` 的 React Hook 兼容性：补齐 `useRef`、避免渲染阶段写 ref，保留最新 `onClose` 回调而不反复绑定全局监听器。
- 完善 dialog 行为：Escape 关闭、Tab/Shift+Tab focus trap、焦点意外跑出 dialog 时自动拉回、打开时聚焦 Close、关闭后恢复触发按钮焦点，并保存/恢复原始 `body` overflow；ProjectDetail 与 ModelPreview 均通过 `aria-labelledby` 关联可见标题。
- 验证嵌套弹窗：ProjectDetail 打开 ModelPreview 时，第一次 Escape 只关闭 3D Viewer，第二次才关闭详情；页面滚动锁定和焦点恢复均正确。
- 为公开主页的 `RESOURCE_FORBIDDEN` 增加 zh/en/ja 稳定错误码文案，避免把服务端错误消息直接暴露给用户；不存在用户页面显示明确的本地化“Profile Not Found”状态。
- 为作品卡片、社区资源、公开主页资源和头像补充 `loading="lazy"` / `decoding="async"`，减少非首屏图片对首屏网络与解码的抢占。
- 为 API 请求 timeout 增加旧浏览器能力回退；AccountMenu 的弹出项补齐 `role="menuitem"`，让已有 ARIA 菜单语义更完整。
- 统一社区发帖、资源上传、评论和访客账户中心的 API 失败提示：按稳定 error code 调用 `getApiErrorMessage`，只在未知错误时使用对应场景的安全 fallback，不再把 raw server message 直接渲染到普通访客界面。
- 继续保留并验证移动端 Hero CTA（View Work / Contact Me）、移动导航 `aria-expanded`/`aria-controls`、AccountMenu `aria-haspopup`/`aria-expanded`，以及 `prefers-reduced-motion` 下不加载 Hero Canvas。
- 保留首页基础 SEO metadata 与自定义 favicon；作品图片使用标题化 alt 文案；Three.js Viewer 保留错误边界和资源清理逻辑。

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过；build 生成的 tracked `dist/` 已恢复，未提交构建产物。
- `git diff --check`：通过。
- `npm run test:api`：37/37 通过。
- 最终 error-message 扫描：普通访客页面不再存在直接渲染 `error.message` 的路径；Admin 与模型错误边界仍保留管理员/开发诊断语义。
- 本地 Playwright 页面回归：`/`、`/community`、`/login?mode=login`、`/account`、`/u/not-exist-test-handle` 均正常渲染（5/5）；移动端 Hero CTA、移动菜单和 AccountMenu 状态均通过；桌面端 ProjectDetail/ModelPreview dialog 键盘交互通过，浏览器无前端错误。
- 本地完整 `production-smoke` 的只读账号接口在无 `DATABASE_URL` 的开发环境返回既有合约规定的 `503 SERVICE_UNAVAILABLE`，而 smoke 文件的线上断言期望 `401`；未为了迎合本地环境改坏既有 API 语义。API contract tests 已确认无数据库时账号读接口应为 503。

后续待办：

1. 延迟加载 Hero 3D Canvas，并为移动端提供静态 poster/质量档，进一步降低首屏 JS 与 GPU 成本。
2. 继续统一剩余前端错误状态的 error-code 本地化，避免界面直接显示 raw API message。
3. 在具备真实 PostgreSQL 的隔离环境中补充认证、上传、下载和移动端视觉回归；部署前仍需按规则备份并执行完整 VPS 验证。

## 2026-08-08：提交、推送与 VPS 部署

本轮已将上述 UI、可访问性、性能和错误处理改动提交并推送到 `fix/security-and-ui-2026-07-25`：

- commit：`ef5aa64 feat: polish portfolio ui and accessibility`
- GitHub 分支已推送，可从仓库页面创建 Pull Request。
- `npm run release:vps` 成功生成 release archive；部署前远端只检查了 `DATABASE_URL` 和 `ADMIN_TOKEN` 是否为 `[set]`，没有输出值。
- 部署前已创建 `/opt/mrright-portfolio` 时间戳备份和 `/etc/mrright-portfolio.env` 时间戳备份；`data`、`public/uploads` 和旧备份均保留。
- 只替换了 release 中的 `dist`、`server`、`scripts`、`package.json`、`package-lock.json`，并重新安装生产依赖；没有替换 env 文件或数据库内容。
- `mrright-portfolio` systemd 服务已重启并保持 active。
- 线上验证通过：`/api/health`、`/api/admin/summary`、`/admin`、`/community`、`/login?mode=login`、`/account`、`/u/not-exist-test-handle`、`/favicon.svg` 均返回预期状态；线上入口引用的新 hash JS 可下载。
- 未修改数据库 schema、数据、上传文件或生产环境变量；没有输出任何 secret/token/password。

后续待办：

1. 创建并审查 Pull Request，合并策略由项目维护者决定。
2. 继续做 Hero 3D 延迟加载、移动端 poster 和质量档优化。
3. 在真实 PostgreSQL 隔离环境补认证、上传、下载和视觉回归。

## 2026-07-16：C++ Qt AuthSessionService adapter 第一批

结论：本轮在 Qt UI adapter 层新增 `AuthSessionService`，实现现有 `AuthService` boundary 并复用 SDK `AuthSession`。adapter 不提供 production default backend，而是拥有显式注入的 `HttpClient` 与 `TokenStore`，从而保证 `AuthSession` 引用依赖的生命周期安全。测试仅使用 `MockHttpClient` + `MemoryTokenStore`，不创建 `CurlHttpClient`，不访问真实或本地 API。Qt shell 的 `main_qt.cpp` 未修改，默认实现继续是 `MockAuthService`。SDK core 继续 Qt-free。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未启用真实网络、未改 Web/API/OpenAPI contract、未修改 QML/Qt 视觉、未做 cache、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/app/ui/qt/AuthSessionService.hpp` / `.cpp`：
  - 实现 `AuthService` 的 login、logout、session state、safe user label、message 和 clear-message 操作。
  - 拥有 injected `std::shared_ptr<HttpClient>`、`std::unique_ptr<TokenStore>` 与基于它们创建的 `AuthSession`；不使用裸 owning pointer。
  - `QString` / UTF-8 `std::string` 转换只发生在 Qt adapter 内；Qt 类型未进入 SDK core。
  - `isLoggedIn()` 直接调用 `AuthSession::hasSession()`，不维护可能漂移的独立 bool；只缓存非敏感 user label 和 UI message。
  - login success 使用 SDK user 的 displayName、handle、email 或 trimmed submitted email 作为安全 label；existing stored session 无 profile payload 时使用明确的 generic `Signed in` fallback。
  - SDK error 集中使用 `ApiError.message` 映射为 UI message，不展示 raw code、response body、Authorization header 或 token。
  - logout success/error 都遵守既有 `AuthSession::logoutAndClearSession()` 契约：本地 session 被清除，strict error message 仍可显示。
- 新增 `cpp-app/tests/unit/qt_authsession_service_tests.cpp`：
  - 使用 `QCoreApplication`，不启动 GUI/window，不运行 QML automation。
  - 覆盖 empty/existing session、login success、strict error、failed replacement login、invalid JSON、non-envelope response、missing mock response、logout success/strict error、clearMessage 和 `AuthService` polymorphism。
  - 验证 strict `POST /api/v1/auth/login` / `POST /api/v1/auth/logout` request construction，不使用 legacy/admin path。
  - 验证 login body 精确只有 email/password；response token 只进入 `MemoryTokenStore`，logout 时只进入 Authorization header，不进入 URL/body/UI result/label/message。
- 更新 `cpp-app/tests/unit/qt_appcontroller_tests.cpp`：
  - 注入由 `MockHttpClient` + `MemoryTokenStore` 驱动的 `AuthSessionService`，确认 controller 继续只通过 `AuthService` polymorphism 工作。
  - 确认 adapter-specific type 不进入 QML property surface。
- 更新 `cpp-app/CMakeLists.txt` 和 `.github/workflows/cpp-app.yml`：
  - `MRRIGHT_ENABLE_QT_UI=OFF` 默认行为不变；OFF 时不找 Qt、不构建 adapter/tests。
  - ON 时 Qt shell 编译 adapter，但默认仍实例化 `MockAuthService`；新增并注册 `mrright_qt_authsession_service_tests`。
  - Qt CI job 运行全部 `mrright_qt_` tests，不启动 GUI、Node server 或真实 HTTP backend。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 记录 AuthSession adapter 第一批完成、existing-session label 限制和既有 SDK login/logout session 契约。
  - 后续保留 asynchronous auth API、local-only real login、platform SecureTokenStore injection、project list、cache 和 packaging。

本轮本地验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 tracked `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：configure/build 通过；CTest 6/6 无失败，其中 `mrright_cpp_secure_tokenstore_tests` 因本机 D-Bus session / desktop keyring 不可用而 skipped。
- temporary parser fallback CMake：configure/build 通过；CTest 5/5 无失败，其中 `mrright_cpp_secure_tokenstore_tests` 因本机 D-Bus session / desktop keyring 不可用而 skipped。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`）。按要求未安装新依赖、未伪造本地 Qt 成功；Qt shell、controller test 和新 adapter test 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. asynchronous auth service API
2. local-only real login integration
3. platform SecureTokenStore injection
4. project list UI
5. local cache strategy
6. packaging strategy spike

## 2026-07-16：C++ Qt UI AuthService integration boundary 第一批

结论：本轮在现有 optional Qt/QML mock auth flow 上新增 Qt UI 层 `AuthService` boundary。`AppController` 不再保存或实现完整 mock authentication 状态逻辑，而是默认创建 `MockAuthService`，并支持注入 test fake / future adapter；登录、登出、状态读取和 message clearing 均通过 service 完成。此批只建立下一批真实 `AuthSession` adapter 所需边界，未调用真实 `AuthSession::login`。SDK core 继续 Qt-free；Qt build/tests 继续仅在 `MRRIGHT_ENABLE_QT_UI=ON` 时启用。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未改 Web/API/OpenAPI contract 行为、未做 cache、未做 secure TokenStore 新实现、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/app/ui/qt/AuthService.hpp`：
  - 定义 Qt UI adapter boundary，login result 只包含 `success`、`userLabel`、`message`，不包含 token。
  - 暴露 login/logout、signed-in state、current user label、last message 和 clear-message 操作。
  - 接口只位于 `app/ui/qt`，允许使用 `QString`，不改变 `sdk/core` public API。
- 新增 `cpp-app/app/ui/qt/MockAuthService.hpp` / `.cpp`：
  - 保留现有 mock email trimming、空 email/password validation、signed-in/signed-out state 与 UI message 行为。
  - 成功 message 明确 mock authentication、no network request、no token persisted。
  - 不创建 network object、不调用 `AuthSession`、不访问 TokenStore、不读环境变量、不写文件、不保存或打印 password。
- 更新 `cpp-app/app/ui/qt/AppController.hpp` / `.cpp`：
  - 默认构造注入 `MockAuthService`；新增 `std::unique_ptr<AuthService>` constructor 供 tests/future adapter 使用。
  - 保留全部 QML-facing `Q_PROPERTY` 和 `Q_INVOKABLE` 名称。
  - properties 直接读取 service state；actions 委托给 service。
  - 新增细粒度 `isLoggedInChanged` / `currentUserLabelChanged` notify signals，保留 `authStateChanged` 供 `status` 使用，并避免值不变时重复 signal。
- 更新 `cpp-app/tests/unit/qt_appcontroller_tests.cpp`：
  - 直接覆盖 `MockAuthService` initial state、success、email/password validation、logout、clearMessage。
  - 通过 lightweight `FakeAuthService` 覆盖 dependency injection、login/logout/clearMessage delegation、success/failure property synchronization 与 notify signals。
  - fake 不记录 password 内容；测试确认 password/token/visitorToken 不作为 controller property 暴露。
  - 使用 `QCoreApplication`，不启动 GUI、不运行 QML automation、不访问网络或 TokenStore。
- 更新 `cpp-app/CMakeLists.txt`、`cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - Qt shell/test target 包含新 service files；默认 `MRRIGHT_ENABLE_QT_UI=OFF` 与非 Qt targets 不变。
  - 记录本批 boundary 完成和后续 real `AuthSession` adapter / local-only real login integration test 待办。
  - `.github/workflows/cpp-app.yml` 无需修改；现有 optional Qt/QML shell job 已 configure/build Qt shell/tests 并运行 `mrright_qt_appcontroller_tests`。

本轮本地验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 tracked `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（6/6 tests passed；`mrright_cpp_secure_tokenstore_tests` 因本机 D-Bus session / desktop keyring 不可用而 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（5/5 tests passed；`mrright_cpp_secure_tokenstore_tests` 因本机 D-Bus session / desktop keyring 不可用而 skipped）。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`），按要求未安装新依赖、未伪造本地 Qt 成功。Qt shell 和 `mrright_qt_appcontroller_tests` 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. real AuthSession adapter for Qt UI
2. local-only real login integration test
3. project list UI
4. local cache strategy
5. packaging strategy spike

## 2026-07-08：C++ Qt AppController mock auth unit tests

结论：本轮为 optional Qt/QML mock auth flow 新增 `AppController` 单元测试。测试只覆盖 UI controller 状态逻辑，不接真实 `AuthSession`，不创建 `CurlHttpClient`，不访问 API，不读取或写入 TokenStore，不启动 GUI，不做真实登录。SDK core 继续 Qt-free；Qt tests 仅在 `MRRIGHT_ENABLE_QT_UI=ON` 时构建。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未改 Web/API 行为、未做 SQLite cache、未做 secure TokenStore 新实现、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/tests/unit/qt_appcontroller_tests.cpp`：
  - 使用 `QCoreApplication` 和简单断言测试 `AppController`，不使用 GUI window，不做 QML 自动化。
  - 覆盖初始 signed-out state、mock login success、空 email / 空 password validation、logout、clearMessage。
  - 验证 `password` 不作为 Qt property 暴露，mock input text 不反射到 controller properties。
- 更新 `cpp-app/CMakeLists.txt`：
  - `MRRIGHT_ENABLE_QT_UI=OFF` 默认保持不变；OFF 时不找 Qt、不构建 Qt shell、不构建 Qt tests。
  - ON 时构建 `mrright_qt_shell` 和 `mrright_qt_appcontroller_tests`，并注册 CTest。
  - Qt test 只链接 Qt Core 和 SDK core，不把 Qt 引入 SDK core。
- 更新 `.github/workflows/cpp-app.yml`：
  - 保留 existing C++ checks。
  - optional Qt/QML shell job 现在 configure/build 后运行 `mrright_qt_appcontroller_tests`，不启动 GUI shell。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 记录 Qt mock auth controller 状态测试已加入。
  - 明确测试不访问 API、不保存 token、SDK core 仍 Qt-free。

本轮本地验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`），按要求未安装新 Qt 依赖、未伪造成功。Qt AppController test build/run 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. real AuthSession integration in Qt UI
2. project list UI
3. local cache strategy
4. packaging strategy spike

## 2026-07-08：C++ Qt/QML mock auth UI flow 第一批

结论：本轮在 optional Qt/QML shell 基础上新增最小 mock auth UI flow。`AppController` 只维护 UI 状态，`Main.qml` 新增 email/password mock login form；mock login 只根据输入更新 UI，不访问网络、不读取 token、不写入 TokenStore、不调用真实 `AuthSession` login。SDK core 继续 Qt-free。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未改 Web/API 行为、未做 SQLite cache、未做 secure TokenStore 新实现、未做 packaging、未提交构建产物**。

完成内容：

- 更新 `cpp-app/app/ui/qt/AppController.hpp` / `.cpp`：
  - 保留 `appName`、`sdkVersion`、`apiPrefix`。
  - 新增 `status`、`isLoggedIn`、`currentUserLabel`、`loginMessage` UI 状态。
  - 新增 mock-only `mockLogin(email, password)`、`logout()`、`clearMessage()`。
  - `mockLogin` 只检查输入并更新 UI 状态；不访问网络、不读取或写入 TokenStore、不保存 token、不调用 `AuthSession`。
  - password 不保存为成员、不暴露为 property、不打印。
- 更新 `cpp-app/app/ui/qt/Main.qml`：
  - 显示 app name、SDK version、`/api/v1 strict`、status。
  - 新增 email/password input、Mock login button、Logout button。
  - 登录前显示 `Not signed in`，mock login 后显示 `Signed in as <email>`，logout 后回到未登录状态。
  - 明确 UI 文案：mock auth only、no network request、no token persisted。
- CMake / CI：
  - `MRRIGHT_ENABLE_QT_UI=OFF` 默认保持不变。
  - Qt target 仍只在 option ON 时构建。
  - 未新增 Qt 到 SDK core，未新增 vcpkg 依赖。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 记录 Qt/QML mock auth flow 第一批完成。
  - 说明 production login 后续通过 `AuthSession` + secure TokenStore。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。
- 本地 Qt build：本机没有 Qt6 CMake package，按要求不安装新 Qt 依赖；Qt target 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. real AuthSession integration in Qt UI
2. project list UI
3. local cache strategy
4. packaging strategy spike

## 2026-07-08：C++ Qt/QML desktop app shell 第一批

结论：本轮新增可选 C++ Qt/QML desktop app shell 第一批。默认 SDK build 仍不依赖 Qt；只有显式 `MRRIGHT_ENABLE_QT_UI=ON` 时才查找 Qt6 并构建 `mrright_qt_shell`。Qt/QML 代码仅位于 `cpp-app/app/ui/qt`，SDK core 保持 Qt-free。本批只做最小可启动窗口和架构边界，不做真实登录、项目列表、下载、本地缓存或 packaging。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 SQLite cache、未做 secure TokenStore 新实现、未做正式安装包、未提交构建产物**。

完成内容：

- 新增 `cpp-app/app/ui/qt/main_qt.cpp`：
  - 创建 `QGuiApplication` 和 `QQmlApplicationEngine`。
  - 通过 `loadFromModule("Mrright.QtShell", "Main")` 加载 QML。
  - 只注入只读 `AppController`，不创建网络 client，不读取 token，不调用 `AuthSession`。
- 新增 `cpp-app/app/ui/qt/Main.qml`：
  - 显示 app name、SDK version、API mode `/api/v1 strict`、status `UI shell only, no network`。
  - 不包含登录、项目列表、下载、缓存或 admin 功能。
- 新增 `cpp-app/app/ui/qt/AppController.hpp` / `.cpp`：
  - 暴露只读 `appName`、`sdkVersion`、`apiPrefix`、`status`。
  - 读取 `ApiClientConfig::apiPrefix` 作为 SDK 边界信息。
  - 不把 Qt 类型传入 SDK core public API。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_QT_UI=OFF` option。
  - 默认 OFF 时不调用 `find_package(Qt6)`，不构建 Qt target。
  - ON 时 `find_package(Qt6 COMPONENTS Core Gui Qml Quick REQUIRED)`，构建 `mrright_qt_shell` 并链接 `Qt6::Core`、`Qt6::Gui`、`Qt6::Qml`、`Qt6::Quick`。
- 更新 `.github/workflows/cpp-app.yml`：
  - 保留 existing C++ checks。
  - 新增独立 Ubuntu `optional Qt/QML shell` job，只安装 Qt dev 包并 configure/build `mrright_qt_shell`，不运行窗口、不上传构建产物、不读取 secrets、不访问 API。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明 Qt/QML shell opt-in、默认 build 不需要 Qt。
  - 说明 SDK core 与 Qt UI 分层边界。
  - 说明本批 Qt shell 不访问网络、不读取 token、不做缓存。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`），按要求未安装新 Qt 依赖。Qt build 由独立 CI job 验证。
- PR #17 初次 CI 失败原因：Ubuntu runner 使用 Qt 6.4.2，`QQmlApplicationEngine::loadFromModule()` 不可用，`mrright_qt_shell` 在 `main_qt.cpp` 编译时报错 `class QQmlApplicationEngine has no member named loadFromModule`。修复为 Qt 6.4 兼容的 `engine.load(QUrl("qrc:/qt/qml/Mrright/QtShell/Main.qml"))`，并在 CMake 中固定 `Main.qml` resource alias。

后续待办保留：

1. real Qt login screen
2. project list UI
3. local cache strategy
4. packaging strategy spike

## 2026-07-08：C++ Linux Secret Service TokenStore backend

结论：本轮新增 C++ SDK Linux Secret Service TokenStore backend，并更新 `SecureTokenStore` 工厂：Windows 继续返回 Windows Credential Manager backend，macOS 继续返回 Keychain backend，Linux 在 `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON` 且已编译 libsecret backend 时返回 Secret Service backend。`MemoryTokenStore` 仍仅用于 tests/dev session。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/sdk/platform/LinuxSecretServiceTokenStore.hpp` / `LinuxSecretServiceTokenStore.cpp`：
  - 仅在 `__linux__` 且 `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE` 下编译。
  - 使用 libsecret / Secret Service API 保存 visitor token。
  - 默认 schema 为 `mrright.blog`，attribute 为 `account=visitor_token`。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken`、`hasVisitorToken`。
  - 不写普通文件、不读环境变量、不打印 token、不保存 admin token。
- 更新 `cpp-app/sdk/platform/SecureTokenStore.cpp`：
  - Windows 返回 `WindowsCredentialTokenStore`。
  - macOS 返回 `MacOSKeychainTokenStore`。
  - Linux 返回 `LinuxSecretServiceTokenStore` when compiled/enabled。
  - unsupported 平台仍返回 `nullptr`，不降级到 `MemoryTokenStore` 或明文文件。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON` option。
  - Linux 下通过 pkg-config 查找 system `libsecret-1` 并链接 `PkgConfig::LIBSECRET`。
  - Linux option 开启但缺少 pkg-config 或 libsecret dev package 时 CMake 清晰失败。
  - Windows/macOS backend 条件编译和系统库链接保持不变。
- 更新 `cpp-app/tests/unit/secure_tokenstore_tests.cpp`：
  - 保留 Windows Credential Manager guarded test。
  - 保留 macOS Keychain guarded test。
  - Linux enabled build 验证 factory support，并用 fake token 覆盖 save/load/overwrite/clear。
  - 运行时 D-Bus session 或 desktop keyring 不可用时返回 CTest skip code 77 并输出清晰说明。
- 更新 `.github/workflows/cpp-app.yml`：
  - Ubuntu C++ jobs 安装 `libsecret-1-dev`，确保 compile/link 覆盖 Linux Secret Service backend。
  - 保留 temporary parser fallback、default nlohmann/json with vcpkg、libcurl backend with vcpkg checks。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明 secure TokenStore 当前支持 Windows Credential Manager、macOS Keychain、Linux Secret Service。
  - 说明 Linux 运行时可能需要 desktop keyring / D-Bus session。
  - 明确 `MemoryTokenStore` 仅用于 tests/dev session，禁止明文 token 落盘，admin token 不进入 C++ SDK。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。

后续待办保留：

1. local cache strategy
2. Qt/QML prototype
3. packaging strategy spike

## 2026-07-07：C++ macOS Keychain TokenStore backend

结论：本轮新增 C++ SDK macOS Keychain TokenStore backend，并更新 `SecureTokenStore` 工厂：Windows 继续返回 Windows Credential Manager backend，macOS 返回 Keychain backend，Linux 继续 explicit unsupported（返回 `nullptr`）。`MemoryTokenStore` 仍仅用于 tests/dev session。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 Linux Secret Service、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/sdk/platform/MacOSKeychainTokenStore.hpp` / `MacOSKeychainTokenStore.cpp`：
  - 仅在 `__APPLE__` 下编译。
  - 使用 Security.framework Keychain Services 保存 visitor token。
  - 默认 service 为 `mrright.blog`，account 为 `visitor_token`。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken`、`hasVisitorToken`。
  - 不写普通文件、不读环境变量、不打印 token、不保存 admin token。
- 更新 `cpp-app/sdk/platform/SecureTokenStore.cpp`：
  - Windows 返回 `WindowsCredentialTokenStore`。
  - macOS 返回 `MacOSKeychainTokenStore`。
  - Linux/其他平台继续返回 `nullptr`。
  - `isPlatformSecureTokenStoreSupported()` 在 Windows/macOS 为 true，Linux/其他平台为 false。
- 更新 `cpp-app/CMakeLists.txt`：
  - Windows 后端仍只在 `WIN32` 编译并链接 `Advapi32`。
  - macOS 后端只在 `APPLE` 编译并链接 `Security.framework`。
  - Linux 构建不新增平台后端源、不引入 Qt 或新 vcpkg 依赖。
- 更新 `cpp-app/tests/unit/secure_tokenstore_tests.cpp`：
  - Linux 继续验证 secure factory unsupported/nullptr。
  - Windows guarded Credential Manager test 保持可用。
  - macOS guarded Keychain test 使用独立 test service/account 和 fake token 覆盖 save/load/overwrite/clear。
  - macOS CI 遇到 Keychain interaction/permission 类限制时返回 CTest skip code 77 并输出清晰 skip 信息，不伪造 secure backend 成功。
- 更新 `cpp-app/README.md`：
  - 说明 secure TokenStore 当前支持 Windows Credential Manager 与 macOS Keychain。
  - 说明 Linux Secret Service 后续实现。
  - 说明 `MemoryTokenStore` 仅用于 tests/dev session。
  - 明确禁止明文 token 落盘，admin token 不进入 C++ SDK。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 macOS Keychain TokenStore backend 完成。
  - Linux Secret Service 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；5/5 tests passed）。

后续待办保留：

1. Linux Secret Service TokenStore
2. local cache strategy
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ secure platform TokenStore backend entrypoint

结论：本轮新增 C++ SDK secure platform TokenStore 第一批入口。`SecureTokenStore` 工厂位于 `cpp-app/sdk/platform`，Windows 下返回 Windows Credential Manager backend，非 Windows 平台明确 unsupported（返回 `nullptr`），不会静默降级到 `MemoryTokenStore` 或明文文件。`MemoryTokenStore` 继续保留为 tests/dev session 实现。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/sdk/platform/SecureTokenStore.hpp` / `SecureTokenStore.cpp`：
  - `createPlatformSecureTokenStore()` 返回平台 secure `TokenStore`。
  - `isPlatformSecureTokenStoreSupported()` 暴露当前平台是否支持 secure backend。
  - Windows 返回 `WindowsCredentialTokenStore`；macOS/Linux 当前返回 `nullptr`，明确 unsupported。
- 新增 `cpp-app/sdk/platform/WindowsCredentialTokenStore.hpp` / `WindowsCredentialTokenStore.cpp`：
  - 仅在 `_WIN32` 下编译。
  - 使用 Windows Credential Manager API 保存 visitor token。
  - 默认 credential target 为 `mrright.blog.visitor_token`。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken`、`hasVisitorToken`。
  - 不写普通文件、不读环境变量、不打印 token、不保存 admin token。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `mrright_sdk_platform_tokenstore` 静态库。
  - Windows 下额外编译 `WindowsCredentialTokenStore.cpp` 并条件链接 `Advapi32`。
  - 新增 `mrright_cpp_secure_tokenstore_tests` CTest target。
- 新增 `cpp-app/tests/unit/secure_tokenstore_tests.cpp`：
  - 非 Windows 验证 secure factory 明确 unsupported，不伪装为 MemoryTokenStore。
  - Windows guarded test 使用独立 test credential target 覆盖 fake token save/load/overwrite/clear，结束时 clear。
  - 不访问网络、不依赖 admin token、不读取 `.env`、不打印 token。
- 更新 `cpp-app/README.md`：
  - 说明 Windows Credential Manager 是第一批 secure backend。
  - 说明 macOS Keychain / Linux Secret Service 后续实现。
  - 说明 `MemoryTokenStore` 仍仅用于 tests/dev session。
  - 明确禁止明文 token 落盘，admin token 不进入 C++ SDK。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 secure TokenStore backend 第一批完成。
  - macOS/Linux secure backend 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；5/5 tests passed）。

后续待办保留：

1. macOS Keychain TokenStore
2. Linux Secret Service TokenStore
3. local cache strategy
4. Qt/QML prototype
5. packaging strategy spike

## 2026-07-07：C++ Auth session flow

结论：本轮新增 C++ SDK mock-driven Auth session flow。`AuthSession` 组合 `AuthClient`、`TokenStore`、`ApiClientConfig` 和 injected `HttpClient`；登录成功后可把 visitor token 保存到 `TokenStore`，后续 typed client 可通过 `configWithStoredToken()` 让 `ApiClient` 统一注入 `Authorization` header，logout/clear 后清理 `TokenStore`。全程只用 `MockHttpClient` 测试，不访问真实 API，不落盘、不打印 token、不调用 admin endpoints。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 secure platform TokenStore backend、未做 packaging**。

完成内容：

- 新增 `cpp-app/sdk/core/AuthSession.hpp`：
  - `loginAndStoreToken(email, password)`：调用 `AuthClient::login`，成功后保存 visitor token 到注入的 `TokenStore`。
  - `loadToken()` / `hasSession()` / `clearSession()`。
  - `logoutAndClearSession()`：使用 stored token 构造 bearer config，调用 `AuthClient::logout()`，然后清理 `TokenStore`。
  - `configWithStoredToken()`：从 `TokenStore` 读取 token 并写入 `ApiClientConfig::bearerToken`，让 `ApiClient` 统一注入 header。
- 更新 `cpp-app/sdk/core/ApiClientConfig.hpp`：
  - 新增 `withTokenStoreBearerToken(config, tokenStore)` helper。
- 更新 `cpp-app/sdk/core/AuthClient.hpp`：
  - 保留现有显式 token overload。
  - 新增 `logout()` / `me()` overload，用于通过 `ApiClientConfig.bearerToken` 走统一 Authorization header 注入。
- 新增 `cpp-app/tests/unit/auth_session_tests.cpp` 和 CTest target `mrright_cpp_auth_session_tests`：
  - login 成功后 token 保存到 `MemoryTokenStore`。
  - login 失败 strict envelope 不保存 token。
  - authenticated request 使用 stored token 构造 `Authorization` header。
  - token 不进入 request URL。
  - token 不进入 request body。
  - `clearSession()` 后 `hasSession()` false。
  - logout 成功后清理 token。
  - logout strict envelope error 时返回 `ApiResult` error 并清理 token。
  - 全部使用 `MockHttpClient`，不访问网络、不调用 admin endpoint。
- 更新 `cpp-app/README.md`：
  - 说明当前 Auth session flow 为 mock-driven SDK flow。
  - 说明 `MemoryTokenStore` 只用于 tests/dev session。
  - 说明 production secure TokenStore 仍后置。
  - 明确禁止明文 token 落盘。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 Auth session flow 第一批完成。
  - secure platform TokenStore implementation 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；5/5 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；4/4 tests passed）。

后续待办保留：

1. platform secure TokenStore implementation
2. local cache strategy
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ TokenStore strategy and MemoryTokenStore

结论：本轮明确 C++ SDK TokenStore strategy，并新增 test/dev-session only 的 `MemoryTokenStore`。当前 `TokenStore` 抽象保持不破坏；`MemoryTokenStore` 只在内存中保存 visitor token，不落盘、不读环境变量、不打印 token、不访问网络。生产级 token 存储后置到平台安全凭证库。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 secure TokenStore backend、未做 packaging**。

完成内容：

- 新增 `docs/adr/ADR_CPP_TOKENSTORE_STRATEGY.md`：
  - 短期使用 `MemoryTokenStore` 仅支持 tests/dev session。
  - 产品级存储目标为 Windows Credential Manager、macOS Keychain、Linux Secret Service。
  - Qt/QML 阶段可评估 QtKeychain。
  - 明文 JSON/config token persistence 禁止。
  - encrypted local file fallback 需要单独 ADR。
  - admin token 永远不进入 C++ SDK。
- 新增 `cpp-app/sdk/core/MemoryTokenStore.hpp`：
  - header-only。
  - 实现 `TokenStore` interface。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken` 和 `hasVisitorToken`。
  - 不落盘、不读环境变量、不打印 token。
- 新增 `cpp-app/tests/unit/tokenstore_tests.cpp` 和 CTest target `mrright_cpp_tokenstore_tests`：
  - 初始无 token。
  - save 后可 load。
  - clear 后不可 load。
  - 覆盖保存会替换旧 token。
  - 不创建 token 相关文件。
  - 不依赖网络或平台凭证库。
- 更新 `cpp-app/README.md`：
  - 说明 MemoryTokenStore 只用于 tests/dev session。
  - 说明生产 token 存储必须使用平台安全凭证库。
  - 明确禁止明文落盘。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 TokenStore strategy 已决策。
  - secure platform implementation 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；4/4 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；3/3 tests passed）。

后续待办保留：

1. platform secure TokenStore implementation
2. local cache strategy
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ nlohmann/json parser backend set as default

结论：本轮将 C++ SDK parser 默认路径切换为 nlohmann/json，并保留 temporary `JsonValue` parser 作为显式 fallback。默认 CMake 路径现在需要通过 vcpkg manifest 找到 `nlohmann_json`；如需 no-dependency emergency fallback，可显式配置 `MRRIGHT_USE_TEMPORARY_JSON=ON`。JSON 解析仍集中在 `JsonValue.hpp` / `EnvelopeParser.hpp` 边界，typed clients 不直接解析 JSON。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未做 Qt/QML、未做 SQLite cache、未做 secure TokenStore、未做 packaging、未改 Web/API 行为**。

完成内容：

- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_USE_TEMPORARY_JSON=OFF`。
  - 默认 OFF 时使用 nlohmann/json parser backend，执行 `find_package(nlohmann_json CONFIG REQUIRED)`。
  - fallback ON 时定义 `MRRIGHT_USE_TEMPORARY_JSON`，不查找 nlohmann/json，使用 temporary parser。
  - `mrright_cpp_nlohmann_json_tests` 现在随默认 parser path 构建。
- 更新 parser boundary：
  - `cpp-app/sdk/core/JsonValue.hpp` 默认 include `NlohmannJsonValue.hpp`。
  - `cpp-app/sdk/core/EnvelopeParser.hpp` 默认 include `NlohmannEnvelopeParser.hpp`。
  - `MRRIGHT_USE_TEMPORARY_JSON=ON` 时回到 temporary parser / envelope implementation。
- 更新 `.github/workflows/cpp-app.yml`：
  - Windows/macOS/Linux matrix 改为验证 temporary parser fallback no-dependency path。
  - Ubuntu nlohmann/vcpkg job 改为验证默认 nlohmann/json parser path。
  - 保留 Ubuntu libcurl/vcpkg regression job。
- 更新文档：
  - `cpp-app/README.md` 说明 nlohmann/json now default parser、temporary parser fallback、default vcpkg build 命令、fallback no-dependency build 命令。
  - `docs/CPP_APP_MIGRATION_PLAN.md` 标记 nlohmann/json default parser 完成，并保留后续待办。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；3/3 tests passed）。
- fallback/no-dependency CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- libcurl/vcpkg regression：
  - `cmake -S cpp-app -B cpp-app/build-curl -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_ENABLE_CURL_HTTP=ON -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-curl`：通过。
  - `ctest --test-dir cpp-app/build-curl --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；`mrright_cpp_curl_compile_tests` passed；4/4 tests passed）。

后续待办保留：

1. SQLite/local cache strategy
2. secure TokenStore
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ optional nlohmann/json parser backend

结论：本轮在现有 temporary `JsonValue` parser / `EnvelopeParser` 边界基础上，接入 optional nlohmann/json parser backend。默认 CMake build 仍不依赖 vcpkg/nlohmann/json，继续使用 temporary parser；显式开启 `MRRIGHT_USE_NLOHMANN_JSON=ON` 时才 `find_package(nlohmann_json CONFIG REQUIRED)`、定义 `MRRIGHT_USE_NLOHMANN_JSON`，并让 SDK tests 使用 nlohmann-backed parser boundary。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未做 Qt/QML、未做 SQLite cache、未做 secure TokenStore、未做 packaging、未改 Web/API 行为**。

完成内容：

- 更新 `cpp-app/vcpkg.json`：
  - 保留 `curl`。
  - 新增 `nlohmann-json`。
  - 未加入 sqlite3 或 Qt。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_USE_NLOHMANN_JSON=OFF`。
  - OFF 时不调用 `find_package(nlohmann_json)`，默认 no-dependency build 继续走 temporary parser。
  - ON 时查找 `nlohmann_json`、链接 `nlohmann_json::nlohmann_json`、定义 `MRRIGHT_USE_NLOHMANN_JSON`，并构建 `mrright_cpp_nlohmann_json_tests`。
  - 未破坏 `MRRIGHT_ENABLE_CURL_HTTP` 和 local API smoke 的 opt-in 边界。
- 新增 parser backend 文件：
  - `cpp-app/sdk/core/NlohmannJsonValue.hpp`
  - `cpp-app/sdk/core/NlohmannEnvelopeParser.hpp`
  - 解析 strict `/api/v1` envelope：`data` / `pagination` / `error`。
  - 保留 unknown `error.code` raw string。
  - 拒绝 invalid JSON、非 strict envelope、legacy mirror top-level key、缺少 `data`/`pagination`/`error` 的响应。
- 新增 `cpp-app/tests/unit/nlohmann_json_parser_tests.cpp`：
  - success envelope parse。
  - error envelope parse。
  - unknown error.code raw string 保留。
  - legacy mirror 被拒绝。
  - `ProjectClient::listProjects` 使用 nlohmann backend 解析 mock response。
  - invalid JSON 返回 parse error。
  - strict envelope 缺字段返回 contract error。
  - auth/session 最小字段通过 `AuthClient::login` 覆盖。
- 更新 `.github/workflows/cpp-app.yml`：
  - 保留默认 no-dependency Windows/macOS/Linux matrix。
  - 保留 libcurl/vcpkg job。
  - 新增 Ubuntu `cpp-app-nlohmann-vcpkg` job，验证 vcpkg manifest、`MRRIGHT_USE_NLOHMANN_JSON=ON` configure/build/CTest。
- 更新文档：
  - `cpp-app/README.md` 说明默认 temporary parser、optional nlohmann/json backend、启用命令和后续默认化决策。
  - `docs/CPP_APP_MIGRATION_PLAN.md` 记录 nlohmann/json parser backend 已进入验证，temporary parser 仍保留为 no-dependency fallback。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 no-dependency CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- nlohmann-enabled vcpkg CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_NLOHMANN_JSON=ON -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；3/3 tests passed）。
- libcurl/vcpkg CMake regression check：
  - `cmake -S cpp-app -B cpp-app/build-curl -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_ENABLE_CURL_HTTP=ON -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-curl`：通过。
  - `ctest --test-dir cpp-app/build-curl --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_curl_compile_tests` passed；3/3 tests passed）。

后续待办保留：

1. decide when to make nlohmann/json default
2. SQLite/local cache strategy
3. secure TokenStore
4. Qt/QML prototype
5. packaging strategy spike

## 2026-07-06：C++ local API smoke actual validation passed

结论：本地 C++ local API smoke 已实际跑通。本轮只记录验证结果，未改代码、未改 Web/API 行为、未改 C++ 实现、未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未提交构建产物。

本地 API server：

- 启动命令：`npm run dev:server`
- URL：`http://127.0.0.1:4173`

代理注意事项：

- 当前环境存在 `HTTP_PROXY` / `http_proxy`，会影响 localhost / 127.0.0.1 请求。
- curl 验证需要使用 `--noproxy '*'`。
- C++ smoke 需要 unset `HTTP_PROXY` / `http_proxy` / `HTTPS_PROXY` / `https_proxy` / `ALL_PROXY` / `all_proxy`，并设置：
  `NO_PROXY=localhost,127.0.0.1,::1`

curl 验证：

- 命令：`curl --noproxy '*' http://127.0.0.1:4173/api/v1/health`
- 返回 strict JSON envelope：
  - `data.ok: true`
  - `data.service: "mrright-portfolio"`
  - `pagination: {}`
  - `error: null`

C++ local smoke：

- `MRRIGHT_API_BASE_URL=http://127.0.0.1:4173`
- 命令：`ctest --test-dir cpp-app/build-curl-smoke --output-on-failure`
- 代理环境：unset HTTP/HTTPS/ALL proxy，并设置 `NO_PROXY=localhost,127.0.0.1,::1`
- 结果：
  - `mrright_cpp_smoke` passed
  - `mrright_cpp_sdk_tests` passed
  - `mrright_cpp_curl_compile_tests` passed
  - `mrright_cpp_local_api_smoke` passed
  - 4/4 tests passed

覆盖 endpoints：

- `GET /api/v1/health`
- `GET /api/v1/projects`
- missing project 404 strict envelope

安全说明：

- 未访问生产 API。
- 未部署 VPS。
- 未 push GitHub。
- 未改代码。
- 未改数据库、token、secret。
- 未提交 `cpp-app/build-curl-smoke`、`dist`、`build`、`node_modules`、`vcpkg_installed` 或其他构建产物。

## 2026-07-06：修复 /api/v1 dual mount rewrite

结论：本轮只修复本地 `/api/v1` dual mount rewrite 和相关 API contract 测试。发现普通本地请求中 `/api/v1/health` 曾落到 SPA fallback，表现为返回 `text/html` index，而不是进入 `/api/health` handler。已将 `/api/v1` rewrite 改为明确的字符串匹配逻辑，确保 `/api/v1/*` 进入同一套 `/api/*` handler，并通过 `request.apiVersion = 'v1'` 保持 strict envelope mode。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未运行 C++ local smoke、未改 C++ 代码、未改 Web 前端**。

完成内容：

- 修复 `server/index.js`：
  - `/api/v1/health` rewrite 到 `/api/health`。
  - `/api/v1/projects` rewrite 到 `/api/projects`。
  - `/api/v1?x=1` rewrite 到 `/api?x=1`。
  - `/api/v1x` 不 rewrite。
  - rewrite 命中时继续设置 `request.apiVersion = 'v1'`，由 `server/responses.js` 输出 strict envelope。
- 更新 `tests/api/contract.spec.js`：
  - 强化 `GET /api/v1/health` JSON content-type 和 strict top-level keys 检查。
  - 明确断言 `/api/v1/health` 不包含 legacy `ok` / `service` 顶层镜像。
  - 将 v1 前缀误匹配覆盖改为 `/api/v1x/health`。

本地 curl 验证：

- `curl --noproxy '*' -i http://127.0.0.1:4173/api/health`：返回 `application/json`，保留 legacy-compatible 顶层 `ok` / `service` 镜像。
- `curl --noproxy '*' -i http://127.0.0.1:4173/api/v1/health`：返回 `application/json` strict envelope，顶层只有 `data` / `pagination` / `error`。
- `curl --noproxy '*' -i http://127.0.0.1:4173/api/v1x/health`：未 rewrite，返回 SPA HTML fallback。

注意：当前 shell 设置了 `HTTP_PROXY` / `http_proxy`，且没有 `NO_PROXY`，普通 `curl http://127.0.0.1:4173/...` 可能经代理转发；本轮本地验证使用 `--noproxy '*'` 确认命中本机 dev server。

后续需要：

1. C++ local smoke 仍待下一步实际运行。

## 2026-07-05：C++ local API smoke actual run blocked by missing vcpkg

结论：本轮尝试实际运行 C++ local API smoke test，但在环境检查阶段被本地缺少 vcpkg 阻塞。当前仓库工作区开始时干净，后端本地启动命令已确认：`npm run dev:server`（`node server/index.js`）。按要求未自动安装 vcpkg、未修改代码绕过 libcurl/vcpkg、未启动本地 API server、未运行 C++ local smoke、未访问生产 API。**未部署、未 push、未改生产数据库、未读取或修改 `.env`/token/secret、未改 Web/API 行为、未做 Qt/QML、未做 SQLite、未做 TokenStore、未做 packaging**。

环境检查：

- `git status --short --branch`：开始时干净，当前分支 `test/cpp-run-local-api-smoke`。
- `package.json` scripts：
  - 优先后端/API 启动命令：`npm run dev:server` -> `node server/index.js`。
  - 全栈命令：`npm run dev:full`。
- vcpkg/libcurl toolchain 检查：
  - `which vcpkg`：未找到。
  - `VCPKG_ROOT`：空。
  - `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：不存在。
- 阻塞原因：缺少 vcpkg/toolchain，无法按要求配置
  `MRRIGHT_ENABLE_CURL_HTTP=ON` + `MRRIGHT_ENABLE_LOCAL_API_SMOKE=ON`
  的 `cpp-app/build-curl-smoke`。

未执行内容：

- 未启动 local API server。
- 未请求 `http://127.0.0.1:3000/api/v1/health`。
- 未配置 `cpp-app/build-curl-smoke`。
- 未运行 C++ local API smoke CTest。
- 未访问生产域名。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist/`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- C++ local API smoke：
  - 未配置 libcurl-enabled CMake。
  - 未运行 CTest。
  - 未覆盖 `/api/v1/health`、`/api/v1/projects`、missing project 404；原因是本地缺少 vcpkg/toolchain。

后续需要：

1. 安装或配置 vcpkg。
2. 设置 `VCPKG_ROOT` 指向 vcpkg 根目录。
3. 确认 `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake` 存在。
4. 重新运行 local API smoke actual validation。

## 2026-07-05：C++ SDK local dev server API smoke test entrypoint

结论：新增 C++ SDK local/dev API smoke test 入口，用于通过 `CurlHttpClient` 真实请求本地开发服务器的 `/api/v1` strict envelope API。该入口默认关闭，普通 no-dependency CMake build 和普通 CTest 不构建、不运行、不联网；只有显式开启 `MRRIGHT_ENABLE_CURL_HTTP=ON` 与 `MRRIGHT_ENABLE_LOCAL_API_SMOKE=ON` 时才构建并注册 CTest。运行时必须设置 `MRRIGHT_API_BASE_URL`，并且只允许 `http://localhost`、`http://127.0.0.1` 或 `http://[::1]`（可带端口）。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未实现 secure TokenStore、未替换 nlohmann/json、未做 packaging**。

完成内容：

- 新增 `cpp-app/tests/integration/local_api_smoke.cpp`：
  - 使用 `CurlHttpClient` 执行真实 HTTP 请求。
  - `MRRIGHT_API_BASE_URL` 未设置时以 CTest skip code `77` 跳过，并输出清晰说明。
  - `MRRIGHT_API_BASE_URL` 不是 loopback HTTP URL 时拒绝运行。
  - 不读取 `.env`，不使用 token，不登录、不注册、不上传、不调用 admin endpoint、不做写操作。
  - 覆盖 `GET /api/v1/health`：HTTP 200、strict `data`/`pagination`/`error` envelope、`error: null`、`data.ok === true`。
  - 覆盖 `GET /api/v1/projects`：允许 HTTP 200 或当前 local store 不可用时的明确 API error envelope；拒绝 legacy 顶层 `projects` 镜像，并通过 `ProjectClient::listProjects()` / `EnvelopeParser` 解析。
  - 覆盖不存在 project 的 `GET /api/v1/projects/__mrright_cpp_smoke_missing_project__`：验证 404 strict error envelope 且 `error.code` / `error.message` 存在。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_LOCAL_API_SMOKE=OFF`。
  - ON 时要求 `MRRIGHT_ENABLE_CURL_HTTP=ON`，否则 CMake fatal error。
  - ON 且 curl backend 可用时构建 `mrright_cpp_local_api_smoke` 并注册 CTest。
  - 默认 OFF 时不构建、不注册 local API smoke test，不破坏默认无依赖 build。
- 更新 `cpp-app/README.md`：
  - 增加 local API smoke 的配置、构建、运行命令。
  - 明确只允许 localhost/127.0.0.1/[::1]。
  - 明确不访问生产、不读取 `.env`、不做写操作。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 local/dev API smoke test 入口已加入。
  - 保留后续待办。

后续待办保留：

1. nlohmann/json replacement
2. SQLite cache
3. secure TokenStore
4. Qt/QML prototype
5. packaging strategy spike

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：首次在 fresh clone 环境中因缺少本地 `node_modules` 而调用系统 ESLint 6.4 失败；执行 `npm ci` 安装本地依赖后重跑通过。`node_modules/` 未提交。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist/`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- 本地 libcurl/local API smoke build：
  - 本机未发现可用 `vcpkg`，`VCPKG_ROOT` 为空，`$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake` 不存在。
  - 按要求未自动安装 vcpkg，未在仓库内创建 `build-curl-smoke`。
  - 额外尝试在 `/tmp/mrright-cpp-build-curl-smoke` 配置 opt-in smoke target；CMake 因缺少 `CURL::libcurl` 按预期失败并给出需要 vcpkg toolchain 或 curl development package 的错误。
  - `c++ -std=c++20 -Wall -Wextra -Wpedantic -Icpp-app -fsyntax-only cpp-app/tests/integration/local_api_smoke.cpp`：通过。
  - 未启动 local dev server，未访问生产 API。

安全说明：

- 未部署 VPS。
- 未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未访问生产 API。
- 未改 Web/API 行为。
- 未提交 `cpp-app/build`、`cpp-app/build-curl`、`cpp-app/build-curl-smoke`、`vcpkg_installed`、`dist`、`build`、`node_modules` 或其他构建产物。
- 未做下一步任务：Qt/QML、SQLite cache、secure TokenStore、nlohmann/json replacement、packaging。

## 2026-07-05：C++ libcurl-enabled build with vcpkg validation

结论：完成 optional libcurl backend 的 vcpkg validation 路径。本机未配置可用 `vcpkg`（`VCPKG_ROOT` 为空，未找到 `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`），按要求未自动安装；已改由独立 GitHub Actions job `cpp-app-curl-vcpkg` 在 Ubuntu runner 上 bootstrap vcpkg、解析 `cpp-app/vcpkg.json` manifest、以 `MRRIGHT_ENABLE_CURL_HTTP=ON` 配置/build/CTest。默认 no-dependency CMake build 保持独立路径。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未做 local API smoke test、未开发 UI、未做 SQLite cache、未替换 nlohmann/json、未实现 secure TokenStore、未做 packaging、未改 Web/API 行为**。

完成内容：

- 更新 `.github/workflows/cpp-app.yml`：
  - 保留原有 Windows/macOS/Linux 默认 no-dependency C++ skeleton matrix。
  - 新增 `cpp-app-curl-vcpkg` job，先覆盖 `ubuntu-latest`。
  - CI 手动 clone Microsoft vcpkg 到 `$RUNNER_TEMP/vcpkg`，bootstrap 后使用 vcpkg toolchain。
  - 使用 `cpp-app/vcpkg.json` manifest 解析 `curl`。
  - 以 `MRRIGHT_ENABLE_CURL_HTTP=ON` 配置 `cpp-app/build-curl`、构建并运行 CTest。
  - 不上传构建产物、不读取 secrets、不访问生产 API、不运行 local API smoke test。
- 更新 `cpp-app/CMakeLists.txt`：
  - `MRRIGHT_ENABLE_CURL_HTTP` 仍默认 `OFF`。
  - 默认 OFF 时仍不 `find_package(CURL)`，不需要 vcpkg/libcurl。
  - ON 时 `CurlHttpClient.cpp` 继续编译进 `mrright_sdk_curl_http`。
  - ON 时新增 no-network compile/link CTest binary `mrright_cpp_curl_compile_tests`，用于确认 curl backend 真实进入 target 构建链路。
- 新增 `cpp-app/tests/unit/curl_http_compile_tests.cpp`：
  - 只构造 `CurlHttpClient` 并检查 `ApiClientConfig` 保留。
  - 不发送请求、不访问真实 API、不读取 token。
- 更新 `cpp-app/README.md`：
  - 补充 `VCPKG_ROOT` + `MRRIGHT_ENABLE_CURL_HTTP=ON` 本地验证命令。
  - 说明默认 build 仍不需要 vcpkg/libcurl。
  - 说明 CI 有单独 `cpp-app-curl-vcpkg` job。
  - 说明 curl-enabled CTest 是 compile/link-only，不访问真实 API。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 libcurl-enabled build validation 已加入 CI。
  - 说明 CMake/CTest 会验证 optional backend 进入构建链路。

本地 vcpkg 状态：

- `which vcpkg`：未找到。
- `VCPKG_ROOT`：空。
- `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：不存在。
- 按要求未自动安装 vcpkg；本地 `build-curl` configure/build/CTest 未运行，改由 CI workflow 验证。

本轮验证结果：

- `git diff --check`：通过（仅提示既有前端文件 CRLF 将被 Git 规范化；本轮未修改这些文件）。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist/`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- libcurl-enabled CMake：
  - 本地因缺少 vcpkg 未运行。
  - 已加入 CI `cpp-app-curl-vcpkg` 验证 manifest、libcurl dependency resolve、`MRRIGHT_ENABLE_CURL_HTTP=ON` configure、build、CTest。

后续待办保留：

1. local dev server API smoke test
2. nlohmann/json replacement
3. SQLite cache
4. secure TokenStore
5. Qt/QML prototype
6. packaging strategy spike

安全说明：

- 未部署 VPS。
- 未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未访问生产 API。
- 未做 local API smoke test。
- 未提交 `cpp-app/build`、`cpp-app/build-curl`、`vcpkg_installed`、`dist`、`build`、`node_modules` 或其他构建产物。
- 未做下一步任务：nlohmann/json replacement、SQLite cache、secure TokenStore、Qt/QML prototype、packaging。

## 2026-07-05：C++ SDK skeleton branch pushed / PR ready

结论：当前分支 `feat/cpp-sdk-skeleton` 已成功 push 到 GitHub，并已设置 upstream：`origin/feat/cpp-sdk-skeleton`。GitHub 已提示可创建 PR：`https://github.com/rightamen/3d-portfolio/pull/new/feat/cpp-sdk-skeleton`。本轮只记录进度，**未改代码、未改 Web/API/C++ 实现、未改数据库、未部署、未 push**。

当前分支状态：

- 本地分支：`feat/cpp-sdk-skeleton`
- 远程 upstream：`origin/feat/cpp-sdk-skeleton`
- `git status --short --branch`：`## feat/cpp-sdk-skeleton...origin/feat/cpp-sdk-skeleton`
- 当前分支可创建 PR：`feat/cpp-sdk-skeleton -> main` 或对应目标分支。

当前阶段已完成：

- API v1 strict envelope
- OpenAPI contract extraction
- OpenAPI auto validation
- C++ cross-platform SDK skeleton
- C++ CMake skeleton
- GitHub Actions C++ skeleton workflow
- MockHttpClient
- strict envelope parser
- typed clients
- ApiClientConfig
- HTTP backend strategy ADR
- dependency manager strategy ADR
- optional libcurl backend spike

已验证：

- `npm run lint`
- `npm run build`
- `npm run test:api`
- `npm run test:api:db`
- `npm run test:openapi`
- local WSL CMake configure/build/CTest
- default no-dependency C++ build
- libcurl-enabled build 在缺少 libcurl 时按预期失败并给出清晰错误

当前仍未完成：

1. 等待 GitHub Actions 三平台 C++ workflow 结果
2. libcurl-enabled build with vcpkg
3. local dev server API smoke test
4. nlohmann/json replacement
5. SQLite cache
6. secure TokenStore implementation
7. Qt/QML prototype
8. packaging strategy spike

下一步建议：

1. 先检查 GitHub Actions 是否通过。
2. 再开 PR review。
3. PR 通过后再继续下一批：vcpkg/libcurl-enabled build 验证或 local API smoke test。

安全说明：

- 未部署 VPS。
- 未执行新的 push。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API/C++ 源码。
- 未提交 build/dist/node_modules/cpp-app/build/cpp-app/build-curl/vcpkg_installed 或其他构建产物。

## 2026-07-05：C++ optional libcurl HTTP backend spike

结论：完成 optional libcurl HTTP backend spike。新增 `cpp-app/vcpkg.json`（仅 `curl`）、可选 `CurlHttpClient` concrete backend，以及 `MRRIGHT_ENABLE_CURL_HTTP` CMake wiring。默认 build 仍为无外部依赖路径：不查找 libcurl、不要求 vcpkg、`MockHttpClient` 和 SDK tests 继续构建通过。**未做 local API smoke test、未访问生产 API、未接 Qt、未替换 JSON parser、未实现 SQLite cache、未实现 secure TokenStore、未开发 UI、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `cpp-app/vcpkg.json`：
  - package name：`mrright-cpp-app`。
  - 当前只声明 `curl` 依赖。
  - 未加入 `nlohmann-json`、sqlite3、Qt 或其他依赖。
- 更新 `cpp-app/CMakeLists.txt`：
  - `MRRIGHT_ENABLE_CURL_HTTP` 继续默认 `OFF`。
  - 默认 OFF 时不调用 `find_package(CURL)`，不链接 libcurl，默认 smoke/tests 保持无依赖构建。
  - ON 时先尝试 `find_package(CURL CONFIG QUIET)`，再尝试 `find_package(CURL QUIET)`。
  - 找不到 libcurl 时给出明确 fatal error，提示使用 vcpkg toolchain 或安装 curl development package。
  - ON 且找到 libcurl 时构建 `mrright_sdk_curl_http`，链接 `CURL::libcurl`。
- 新增 `cpp-app/sdk/network/CurlHttpClient.hpp` / `.cpp`：
  - 实现 `HttpClient::send(HttpRequest)`。
  - 支持 GET、POST、PUT、DELETE、PATCH。
  - 支持 request URL/path、headers、body、`ApiClientConfig.timeoutMs`。
  - 返回 `HttpResponse.statusCode`、body、best-effort response headers。
  - 网络错误通过 `ApiResult` 返回，不以 throw 作为主路径。
  - 不解析业务 JSON，不理解 Project/User/Community，不保存 token，不打印 `Authorization`，不写死 `/api/v1`。
  - `ApiClient` 仍负责 `/api/v1` path、legacy/admin path 拒绝、通用 headers 和 bearer token header。
- `RealHttpClient` 保持 placeholder：
  - 默认继续返回 `REAL_HTTP_BACKEND_NOT_ENABLED`。
  - 默认 build 下不依赖 libcurl。
- 更新 `.gitignore`：
  - 忽略 `cpp-app/build-curl/` 与 `cpp-app/vcpkg_installed/`。
- 更新 `cpp-app/README.md` 与 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明默认 build 不需要 libcurl。
  - 说明如何用 vcpkg toolchain 启用 optional libcurl backend。
  - 明确不提交 `vcpkg_installed`、`cpp-app/build`、`cpp-app/build-curl`。
  - 明确 real API smoke test 不是本批任务，后续必须指向 local/dev server。

仍未实现 / 后续待办：

1. local API smoke test against dev server
2. nlohmann/json replacement
3. SQLite cache
4. secure TokenStore
5. Qt/QML prototype
6. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- libcurl-enabled build：
  - 本机未发现可用 `vcpkg` / `curl-config` / pkg-config libcurl，未安装新依赖。
  - 已验证 `MRRIGHT_ENABLE_CURL_HTTP=ON` 且缺少 libcurl 时 CMake 给出清晰错误：需要 vcpkg toolchain 或 curl development package 提供 `CURL::libcurl`。
  - 因缺少本地 libcurl/vcpkg，未完成 `build-curl` 编译和 CTest；后续由 dependency-enabled 本地/CI 环境验证。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未访问生产 API。
- 未做 local API smoke test。
- 未提交 dist/build/node_modules/cpp-app/build/cpp-app/build-curl/vcpkg_installed 或其他构建/依赖产物。
- 未做 nlohmann/json replacement、SQLite cache、secure TokenStore、Qt/QML prototype、packaging 等下一步任务。

## 2026-07-05：C++ dependency manager strategy ADR

结论：完成 C++ dependency manager 策略 ADR。最终选择 vcpkg manifest mode 作为 SDK/backend native dependencies 的首选策略；本批不新增实际依赖、不新增 `vcpkg.json`、不改 CMake 依赖 wiring，继续保持当前无外部依赖 mock build。下一批 libcurl backend spike 时再引入 vcpkg manifest。**未实现 libcurl backend、未接 Qt、未替换 JSON parser、未改 C++ SDK 代码、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `docs/adr/ADR_CPP_DEPENDENCY_MANAGER_STRATEGY.md`：
  - 记录当前 `cpp-app` CMake skeleton 无外部 runtime 依赖。
  - 记录 JSON 长期倾向 `nlohmann/json`、HTTP backend 下一步倾向 libcurl。
  - 比较 vcpkg manifest、Conan、系统包、CMake `FetchContent`、vendoring。
  - 接受推荐方案：vcpkg manifest 管理 libcurl、nlohmann-json、sqlite3 等 SDK/backend 依赖。
  - 明确 Qt 在 Qt/QML 阶段单独评估，可用 vcpkg、Qt 官方安装器或 aqtinstall，但本批不引入。
  - 明确不提交 `vcpkg_installed/`、依赖缓存、第三方源码或构建产物。
- 更新 `cpp-app/README.md`：
  - 增加 dependency strategy 简述。
  - 说明当前 skeleton 无外部 C++ runtime 依赖。
  - 说明后续 libcurl / nlohmann-json / sqlite3 倾向 vcpkg manifest 管理。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 dependency manager strategy 已决策。
  - 下一步调整为 libcurl backend spike + vcpkg manifest。

仍未实现 / 后续待办：

1. libcurl backend spike
2. vcpkg manifest
3. local API smoke test
4. nlohmann/json replacement
5. SQLite cache
6. secure TokenStore
7. Qt/QML prototype

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
- `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
- `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ SDK HTTP backend strategy ADR

结论：完成 C++ SDK HTTP backend 策略 ADR。最终路线是继续保持 `HttpClient` abstraction，业务 client 不依赖具体网络库；短期 `RealHttpClient` 仍是 placeholder，不实现真实网络；下一批优先做可选 libcurl backend spike；Qt Network backend 后置到 Qt/QML prototype 阶段。**未实现真实 HTTP、未接 Qt、未接 libcurl、未开发 UI、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `docs/adr/ADR_CPP_HTTP_BACKEND_STRATEGY.md`：
  - 记录当前 `HttpClient` / `MockHttpClient` / `RealHttpClient` / `/api/v1` request construction / `EnvelopeParser` 状态。
  - 比较 libcurl first、Qt Network first、继续 placeholder、抽象 + libcurl first + Qt later 四种方案。
  - 接受推荐方案：`HttpClient` abstraction + optional libcurl backend first + Qt backend later。
  - 明确 `ApiClient`、`HttpClient backend`、`EnvelopeParser`、typed clients 的职责边界。
  - 明确 backend/network error 与 `/api/v1` envelope API error 的区别。
  - 明确 token 只通过内存配置或未来 `TokenStore`，`HttpClient` 不持久化 token，日志不得输出 `Authorization`。
  - 明确 `MRRIGHT_ENABLE_CURL_HTTP` 当前默认 OFF，后续 libcurl 通过 vcpkg manifest 或 Conan 管理，不 vendoring。
- 更新 `cpp-app/README.md`：
  - 说明 `RealHttpClient` 当前仍是 no-network placeholder。
  - 说明 `MockHttpClient` 用于 request construction 和 envelope parsing 测试。
  - 链接 HTTP backend strategy ADR。
  - 说明当前不访问生产 API，token 不写入配置文件或日志。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 HTTP backend strategy 已决策。
  - 下一步调整为 libcurl backend spike / dependency manager decision。

本地 WSL CMake 状态：

- 已记录并继续有效：`cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`、`cmake --build cpp-app/build`、`ctest --test-dir cpp-app/build --output-on-failure` 均已通过。
- 本批会重新运行 CMake configure/build/CTest；`cpp-app/build/` 不提交。

仍未实现 / 后续待办：

1. libcurl backend spike
2. dependency manager strategy：vcpkg vs Conan
3. real API smoke test against local dev server
4. JSON parser replacement with nlohmann/json
5. SQLite cache
6. secure TokenStore implementation
7. Qt/QML prototype

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
- `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
- `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ local WSL CMake validation

结论：已在 `/mnt/g/Code/3d-portfolio` 下完成 `cpp-app` 本地 WSL Ninja Debug CMake 验证。`mrright_cpp_smoke` 与 `mrright_cpp_sdk_tests` 均通过，CTest 结果为 `2/2 tests passed`。本批只更新验证记录文档，**未改代码、未改 Web/API 行为、未改数据库、未部署、未 push**。

执行记录：

- CMake configure：`cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`
- CMake build：`cmake --build cpp-app/build`
- CTest：`ctest --test-dir cpp-app/build --output-on-failure`

测试结果：

- `mrright_cpp_smoke`：passed。
- `mrright_cpp_sdk_tests`：passed。
- `2/2 tests passed`。

Git / 构建产物状态：

- `git status --short --branch` 保持干净：`## feat/cpp-sdk-skeleton`。
- `cpp-app/build/` 未提交，已由 `.gitignore` 忽略。
- 未提交 `dist` / `build` / `node_modules` / `cpp-app/build`。

验证结果：

- `git diff --check`：待运行。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。

## 2026-07-05：C++ SDK JSON parser dependency decision

结论：完成 C++ SDK JSON 解析策略决策。短期保留当前 `JsonValue.hpp` temporary parser，仅用于 early SDK prototype / mock-driven strict-envelope tests，并继续把 JSON 边界收敛在 `EnvelopeParser.hpp`；长期选择通过未来 C++ dependency manager 接入 `nlohmann/json`。本批不新增第三方依赖、不 vendored 大文件、不让 CMake 默认联网下载依赖。**未实现真实 HTTP、未开发 UI、未接 SQLite、未改 Web/API 行为、未改数据库、未部署、未 push**。

方案比较结论：

- 继续保留当前 `JsonValue` parser：跨平台和离线构建最好，适合当前 contract fixtures；但 Unicode、number、诊断、完整 JSON 兼容性不足，只能作为临时 parser。
- `nlohmann/json`：长期首选。跨平台成熟、header-only 使用方便、CMake/vcpkg/Conan 集成简单，适合 SDK core typed model decoding，不依赖 Qt UI，也不妨碍未来 Qt/QML。
- Boost.JSON：技术上可行，但为了 JSON 单独引入 Boost 生态偏重，不适合当前轻量 SDK 阶段。
- Qt JSON：适合未来 Qt UI/network 层，但现在接入会让 SDK core 过早依赖 Qt。
- simdjson：适合未来大规模 JSON 性能场景；当前 envelope/client 阶段过早。

完成内容：

- 新增 `docs/adr/ADR_CPP_JSON_STRATEGY.md`：
  - 记录背景、当前 parser 限制、方案比较、最终决策、短期/长期策略、CMake/CI/SDK model 影响，以及明确不做事项。
- 更新 `cpp-app/sdk/core/JsonValue.hpp`：
  - 增加注释，标明它是 early SDK contract tests 的 temporary prototype JSON boundary。
  - 明确不得扩展成 production JSON library，业务 client 不应直接散落 JSON 解析逻辑。
- 更新 `cpp-app/README.md`：
  - 说明当前 JSON 策略仍使用 temporary parser。
  - 说明长期目标是通过未来 C++ dependency manager 引入 `nlohmann/json`。
  - 说明本批不 vendored 大文件、不让 CMake 默认联网下载依赖。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 JSON parser strategy 已决策。
  - 保留后续真实 HTTP backend / Qt-vs-libcurl dependency strategy 作为下一步。

仍未实现 / 后续待办：

1. real libcurl or Qt Network backend
2. OpenAPI generated client spike
3. SQLite cache
4. secure TokenStore implementation
5. Qt/QML prototype
6. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `c++` 直接编译 smoke + SDK tests：通过（`SDK contract tests passed.`）。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ SDK HTTP client configuration / backend abstraction 第一批

结论：在现有 `MockHttpClient` / `EnvelopeParser` / typed clients 基础上，完成真实 HTTP backend 的可替换接口层第一批：新增 `ApiClientConfig`、统一请求构造、内存 bearer token header、`RealHttpClient` 占位实现、更多 typed client 方法和请求构造测试。默认构建仍不依赖 Qt/libcurl，不做真实联网。**未开发 UI、未接 SQLite、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `cpp-app/sdk/core/ApiClientConfig.hpp`：
  - `baseUrl`：默认空，不硬编码生产域名；README 示例使用 `http://localhost:3000`。
  - `apiPrefix`：默认 `/api/v1`。
  - `timeoutMs`：默认 30000。
  - `userAgent`：默认 `mrright-cpp-sdk/0.1`。
  - `bearerToken`：可选，仅内存配置，不落盘。
- 更新 `ApiClient`：
  - 所有业务 path 统一由 `ApiClient` 构造。
  - 自动拼接 `baseUrl + /api/v1 + path`。
  - 自动设置 `Accept: application/json`。
  - POST/PUT/PATCH 且 body 非空时自动设置 `Content-Type: application/json`。
  - `ApiClientConfig.bearerToken` 存在时自动设置 `Authorization: Bearer <token>`。
  - 继续拒绝 `/admin...` 与 legacy `/api/...` path。
  - 明确只支持 strict `/api/v1`，拒绝非 `/api/v1` prefix。
- 新增 `cpp-app/sdk/network/RealHttpClient.hpp`：
  - 可替换真实 backend 占位实现。
  - 当前不联网，返回 `REAL_HTTP_BACKEND_NOT_ENABLED`。
  - 后续可在同一 `HttpClient` interface 后接 Qt Network 或 libcurl。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_CURL_HTTP` option，默认 OFF。
  - 当前启用该 option 会明确失败，避免误以为 libcurl backend 已实现；默认构建不依赖外部 HTTP 包。
- typed clients 扩展：
  - `AuthClient::logout(token)`：mockable `POST /api/v1/auth/logout`。
  - `AuthClient::me(token)`：mockable `GET /api/v1/auth/me`。
  - `ProjectClient::likeProject(slug, visitorId, token)`：mockable `POST /api/v1/projects/{slug}/like`。
  - `ProjectClient::createComment(slug, request, token)`：mockable `POST /api/v1/projects/{slug}/comments`。
  - `CommunityClient::listPosts()`、`getPost(id)`、`listComments(postId)`、`createComment(...)`、`likeComment(...)` 第一批 mockable 方法。
  - 未实现不确定 endpoint 的完整业务流；未调用 admin；未编造 OpenAPI 未确认字段。
- 新增/扩展 C++ tests：
  - `ApiClientConfig` 默认 `apiPrefix == /api/v1`，`baseUrl` 不硬编码生产域名。
  - `ProjectClient::listProjects` 构造 `GET /api/v1/projects`。
  - `AuthClient::login` 构造 `POST /api/v1/auth/login`。
  - POST 请求设置 `Content-Type`。
  - bearer token 只进入 `Authorization` header。
  - legacy `/api` path 被拒绝。
  - `/admin` path 被拒绝。
  - error envelope 让 typed client 返回 `ApiResult` error。
  - invalid/non-envelope JSON 返回 contract error。
  - `RealHttpClient` 当前返回 backend-not-enabled error，不联网。

本地 CMake 状态：

- 本地仍无 `cmake` 命令；未安装新依赖，未执行正式 CMake configure/build/ctest。
- 使用直接 `c++` compile 验证：
  - `mrright_cpp_smoke`：通过。
  - `mrright_cpp_sdk_tests`：通过。
- CI workflow 负责三平台 CMake configure/build/smoke 验证；默认构建无 Qt/libcurl 依赖。

仍未实现 / 后续待办：

1. real libcurl or Qt Network backend
2. JSON parser dependency decision
3. OpenAPI generated client spike
4. SQLite cache
5. secure TokenStore implementation
6. Qt/QML prototype
7. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `c++` 直接编译 smoke + SDK tests：通过（`SDK contract tests passed.`）。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ SDK JSON / HTTP abstraction 第一批（mock-driven typed client）

结论：把 `cpp-app` SDK 从纯 skeleton 推进到可测试的 typed client 基础层。新增无外部依赖的最小 JSON/envelope decoding 边界、`HttpClient` mock、`AuthClient::login` / `ProjectClient::{listProjects,getProject}` 的 mock-driven 行为，以及 C++ unit test binary。**未实现真实 HTTP、未接 Qt/libcurl、未开发 UI、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `cpp-app/sdk/core/JsonValue.hpp`：
  - header-only 最小 JSON AST/parser，只覆盖当前 strict envelope contract fixture 需要的 object/array/string/number/bool/null。
  - 不引入第三方 JSON 库、不新增 npm 依赖、不 vendored 大文件、不依赖系统包。
  - Unicode escape 仅作为占位保留，真实 parser 作为后续 dependency strategy 决策。
- 新增 `cpp-app/sdk/core/EnvelopeParser.hpp`：
  - 统一解析 strict `/api/v1` envelope，业务 client 不直接散落 JSON 解析逻辑。
  - 支持成功 envelope：`data` object、`pagination` object、`error: null`。
  - 支持错误 envelope：`data: null`、`error.code` / `error.message`。
  - 支持 `Pagination` 六字段基础解析。
  - 未知 `error.code` 映射到 `ApiErrorCode::Unknown`，保留原始 code 字符串。
  - 非 strict envelope / legacy 顶层镜像返回 `RESPONSE_CONTRACT_ERROR`。
- 更新 `cpp-app/sdk/network/HttpClient.hpp`：
  - `HttpRequest`：`method`、`path`、`headers`、`body`。
  - `HttpResponse`：`statusCode`、`headers`、`body`。
  - `HttpClient::send(HttpRequest) -> ApiResult<HttpResponse>`。
  - `NullHttpClient` 保持不联网。
  - 新增 `MockHttpClient`：队列式固定响应、记录 requests，用于 typed client 单测。
- 更新 typed clients：
  - `ApiClient` 统一拼接 `/api/v1` path，拒绝 `/admin...` 与 `/api/...` path。
  - `AuthClient::login(...)` 通过 `HttpClient` 发送 mockable `POST /api/v1/auth/login`，解析 `session.token` / `expiresAt` / `user`。
  - `ProjectClient::listProjects()` 发送 `GET /api/v1/projects` 并解析 `projects[]`。
  - `ProjectClient::getProject(slug)` 发送 `GET /api/v1/projects/{slug}` 并解析 `project`。
  - 不实现 admin endpoint，不支持 legacy `/api/*`，不读取 token。
- 新增 `cpp-app/tests/unit/sdk_contract_tests.cpp`：
  - 成功 envelope 可以解析。
  - 错误 envelope 可以解析。
  - unknown `error.code` 保留原始字符串并映射 Unknown。
  - legacy mirror / 非 strict envelope 被拒绝。
  - `MockHttpClient` 能驱动 `ProjectClient::listProjects`。
  - `ProjectClient` 构造 `/api/v1/projects`，不是 legacy `/api/projects`。
  - admin path 在 `ApiClient` 层被拒绝，且不会调用 `HttpClient::send`。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `mrright_cpp_sdk_tests` binary。
  - CTest 增加 `mrright_cpp_sdk_tests`。
  - smoke binary 保留。
- 更新 `cpp-app/README.md` 与 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明当前支持 mock-driven typed client tests。
  - 说明尚无真实 HTTP backend。
  - 说明 JSON parser 当前为无依赖最小 parser，后续需做依赖策略决策。
  - 下一步为真实 HTTP backend / dependency strategy。

本地 CMake 状态：

- 本地仍无 `cmake` 命令；未安装新依赖，未执行正式 CMake configure/build/ctest。
- 使用直接 `c++` compile 尽量验证：
  - `mrright_cpp_smoke`：通过。
  - `mrright_cpp_sdk_tests`：通过。
- CI workflow 负责三平台 CMake configure/build/smoke 验证；本批新增 test binary 已接入 CMake/CTest，后续 CI 会一并构建运行。

仍未实现 / 后续待办：

1. Real HTTP backend
2. JSON parser dependency decision
3. OpenAPI generated client spike
4. SQLite cache
5. secure TokenStore implementation
6. Qt/QML prototype
7. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `c++` 直接编译 smoke + SDK tests：通过（`SDK contract tests passed.`）。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：OpenAPI 自动校验工具接入（API v1 freeze 工程化）

结论：把 `docs/openapi/api-v1.yaml` 从静态文档升级为可自动校验的 contract artifact。新增 `scripts/validate-openapi.mjs` 与 `npm run test:openapi`，校验 YAML、`$ref`、strict envelope、response envelope 使用方式以及 `API_ERROR_CODES` 与 OpenAPI enum 一致性。**未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新建 `scripts/validate-openapi.mjs`：
  - 使用项目现有依赖树中的 `js-yaml` 解析 `docs/openapi/api-v1.yaml`，不新增重量级依赖。
  - 校验 YAML 可解析。
  - 校验顶层 `openapi` 存在。
  - 校验 `paths` 存在且非空。
  - 校验 `components.schemas` 存在。
  - 校验 `components.schemas.ResponseEnvelope` / `ApiError` / `Pagination` 存在。
  - 遍历并解析全部本地 `$ref`，缺失路径会失败。
  - 校验所有 `application/json` response schema 必须通过 `ResponseEnvelope` 或 `ErrorEnvelope`，避免裸返回业务模型。
  - 校验 strict `/api/v1` envelope 顶层只允许 `data` / `pagination` / `error`，且 `additionalProperties: false`。
  - 从 `server/responses.js` 读取 `API_ERROR_CODES`，与 OpenAPI `components.schemas.ApiErrorCode.enum` 做集合一致性比对；缺失或多余 code 都会失败。
- 更新 `package.json`：
  - 新增 `"test:openapi": "node scripts/validate-openapi.mjs"`。
- 更新 `docs/API_V1_FREEZE_PLAN.md`：
  - §18 标记 OpenAPI 自动校验脚本已接入。
  - checklist #9 标记为 ✅，说明已校验 YAML、`$ref`、response envelope、strict envelope 顶层键、error code enum。
- CI 说明：
  - 当前仓库只有独立的 C++ App Skeleton workflow，没有现成 Web/API lint/build/test workflow；本批未混改 C++ workflow。
  - 后续新增 Web/API CI 时，应把 `npm run test:openapi` 与 lint/build/API contract tests 放入同一质量门。

仍未实现 / 后续待办：

1. C++ HTTP backend
2. JSON parser/serialization
3. Qt/QML UI prototype
4. SQLite cache
5. secure TokenStore implementation
6. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（YAML 可解析；200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ cross-platform skeleton 工程化验证批次（CI matrix / ignore / docs）

结论：在不实现真实 HTTP、不开发 UI、不改 Web/API 行为的前提下，完成 `cpp-app` skeleton 的工程化验证入口补强。新增三平台 GitHub Actions matrix、补 CMake 构建产物 ignore 规则，并更新 README / 迁移计划 / 进度记录。

CMake skeleton 审查结果：

- `cpp-app/CMakeLists.txt` 已包含 `app/platform/AppPaths.cpp`，并通过 `mrright_app_platform` 静态库链接到 `mrright_cpp_smoke`。
- include 目录使用 `${CMAKE_CURRENT_SOURCE_DIR}`，与当前 include 写法（`#include "sdk/..."`、`#include "app/..."`）匹配。
- C++20 设置清晰：`CMAKE_CXX_STANDARD 20`、`CMAKE_CXX_STANDARD_REQUIRED ON`、`CMAKE_CXX_EXTENSIONS OFF`，同时 `mrright_sdk_core` 暴露 `cxx_std_20`。
- warning flags 跨平台安全：MSVC 使用 `/W4 /utf-8`，其他编译器使用 `-Wall -Wextra -Wpedantic`。
- `CMakePresets.json` 保留 `debug`、`release`、`relwithdebinfo`，不强绑单一 generator，适合 Windows/macOS/Linux 用各自默认生成器。
- build 输出目录为 `cpp-app/build` 或 preset 下的 `cpp-app/build/<preset>`；本批已在 `.gitignore` 排除，不污染 git。
- README 构建命令已改为跨平台更稳的 `cmake --build ... --config Debug` + `ctest --test-dir ... --build-config Debug`，避免直接写死单配置生成器下的可执行文件路径。

完成内容：

- 新增 `.github/workflows/cpp-app.yml`：
  - workflow 名称：`C++ App Skeleton`
  - matrix：`ubuntu-latest`、`macos-latest`、`windows-latest`
  - 每个平台执行：
    - `cmake -S cpp-app -B cpp-app/build -DCMAKE_BUILD_TYPE=Debug`
    - `cmake --build cpp-app/build --config Debug`
    - `ctest --test-dir cpp-app/build --build-config Debug --output-on-failure`
  - 不部署、不读取 secrets、不 push、不上传构建产物。
- 更新 `.gitignore`：
  - `cpp-app/build/`
  - `cpp-app/out/`
  - `cpp-app/.cache/`
  - `CMakeFiles/`
  - `CMakeCache.txt`
  - `compile_commands.json`
- 更新 `cpp-app/README.md`：
  - 说明本地需要 CMake 3.20+ 与 C++20 compiler。
  - 说明无本地 CMake 时可用 GitHub Actions CI 验证。
  - 说明支持 CMakePresets：`debug`、`release`、`relwithdebinfo`。
  - 说明 smoke binary 只验证 SDK skeleton / platform paths / no-network CLI，不调用 `/api/v1`、不读取 token、不测试真实业务。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 C++ App Skeleton CI matrix 已加入。
  - 下一步明确为 HTTP backend / JSON parser / OpenAPI validation；Qt/QML 后置到 SDK 边界稳定后。

本地 CMake 状态：

- 本地仍无 `cmake` 命令；未安装新依赖，未执行正式 CMake configure/build。
- CI workflow 已提供 Windows/macOS/Linux 验证入口。

仍未实现 / 后续待办：

1. OpenAPI 自动校验工具接入
2. C++ HTTP backend
3. JSON parser/serialization
4. Qt/QML UI prototype
5. SQLite cache
6. secure TokenStore implementation
7. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 build/dist/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ cross-platform skeleton 第一批（SDK / CMake / smoke CLI）

结论：从零创建 `cpp-app/`，完成 C++ cross-platform prototype skeleton 第一批。范围严格限定为 SDK/架构骨架、CMake、平台路径抽象、TokenStore 接口和最小 smoke binary；**未开发正式 UI、未实现真实 HTTP、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新建 `cpp-app/` 目录结构：
  - `CMakeLists.txt`、`CMakePresets.json`、`README.md`
  - `cmake/`、`include/`
  - `src/main.cpp`
  - `sdk/core/`、`sdk/network/`、`sdk/models/`、`sdk/cache/`、`sdk/download/`
  - `app/platform/`、`app/ui/`
  - `tests/unit/`
  - `packaging/windows/`、`packaging/macos/`、`packaging/linux/`
- CMake：
  - 默认只构建 `mrright_cpp_smoke` CLI smoke binary，不引入 Qt UI。
  - `CMakePresets.json` 包含 `debug`、`release`、`relwithdebinfo`。
  - `ctest` 注册 smoke test（后续 CI 可直接跑 configure + build + test）。
- SDK model headers（来自 `docs/openapi/api-v1.yaml` 与 `docs/API_V1_MODEL_MAPPING.md`）：
  - `ApiError.hpp`、`Pagination.hpp`、`ResponseEnvelope.hpp`
  - `User.hpp`、`Profile.hpp`、`Project.hpp`
  - `Asset.hpp`、`CommunityPost.hpp`、`Comment.hpp`、`DownloadRequest.hpp`
  - nullable 使用 `std::optional`，array 使用 `std::vector`，datetime 暂用 ISO-8601 `std::string` 占位；README 说明后续再决定 `std::chrono` 或 Qt 边界类型。
  - `Asset` 明确标注 aspirational target model：受控 `downloadUrl`、`checksum`、`mimeType`、`etag` 等字段尚未由 API 完整实现。
  - 未把 admin-only model 放入 SDK public surface。
- SDK core/network interfaces：
  - `ApiResult.hpp`：Result-style 返回，不把 exception 作为主路径。
  - `ApiClient.hpp`：默认 base path 为相对 `/api/v1`，不硬编码生产域名。
  - `AuthClient.hpp`、`ProjectClient.hpp`、`CommunityClient.hpp`、`AssetClient.hpp`：只定义最小 stub，不发真实 HTTP。
  - `HttpClient.hpp`：网络抽象 + `NullHttpClient`，真实 backend 后续实现。
  - `TokenStore.hpp`：只定义接口；注释明确未来使用 Windows Credential Manager、macOS Keychain、Linux Secret Service 或显式加密文件降级；禁止普通配置文件明文存 token。
  - `ApiError` 保留 raw `code` 字符串，同时映射到 enum；未知错误码落 `ApiErrorCode::Unknown`。
- 平台路径抽象：
  - `app/platform/AppPaths.hpp/.cpp` 定义 `configDir()`、`cacheDir()`、`dataDir()`、`logDir()`、`downloadDir()`、`tempDir()`。
  - Windows/macOS/Linux 使用条件编译占位；当前基于 HOME/XDG/APPDATA/LOCALAPPDATA 的安全占位，不写死 Windows-only 路径。
  - README 说明后续替换为 Qt StandardPaths 或平台原生 API。
- `src/main.cpp`：
  - 打印 SDK skeleton 名称和版本。
  - 构造 `Pagination` / `ApiError` / `ResponseEnvelope` 示例。
  - 不联网、不读取 secret。

验证结果：

- `c++ -std=c++20 -Wall -Wextra -Wpedantic -Icpp-app cpp-app/src/main.cpp cpp-app/app/platform/AppPaths.cpp -o /tmp/mrright_cpp_smoke && /tmp/mrright_cpp_smoke`：通过。
- 本地 `cmake --version`：失败（当前环境无 `cmake` 命令），因此未执行正式 `cmake -S cpp-app -B cpp-app/build -DCMAKE_BUILD_TYPE=Debug` / `cmake --build cpp-app/build`。未安装新依赖；README 已记录后续本地/CI 验证方式。
- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。

修改文件：

- `cpp-app/`（新建）
- `docs/CPP_APP_MIGRATION_PLAN.md`
- `PROJECT_PROGRESS.md`

仍未实现 / 后续待办：

1. OpenAPI 自动校验工具接入
2. C++ HTTP backend
3. Qt/QML UI prototype
4. SQLite cache
5. secure TokenStore implementation
6. CI build matrix
7. packaging strategy spike

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 build/dist/node_modules 或 C++ build 产物。

## 2026-07-05：OpenAPI v1 初稿 + C++ SDK model mapping 抽取（freeze checklist #9/#10 初稿）

结论：把已被 `tests/api/contract.spec.js`/`tests/api/contract.db.spec.js` 锁住的 `/api/v1` strict envelope 契约，沉淀为正式 OpenAPI 规范初稿与 TS/C++ model mapping 文档。纯文档/契约抽取批次，**零 API 行为改动、零 C++ 代码、零 C++ UI**。

完成内容：

- 新建 `docs/openapi/api-v1.yaml`（OpenAPI 3.0.3）：
  - 38 paths / 42 operations，`servers` 均以 `/api/v1` 为 base path。
  - 覆盖 Health、Auth（register/login/logout/verify-email/resend-verification/me）、Projects（含 interactions/like/comments/download-requests）、Account（profile 读写、avatar/banner multipart 上传、community/downloads/comments 只读、删除 upload/post）、Community（posts/uploads 读写、comments、like、delete）、Users（profile/resources/posts/activity）、Contact；另加 4 个代表性 Admin 端点（summary、visitors 分页列表、visitor 详情、profile-visibility）演示 Web-only 边界。
  - 全部端点仅取自 `server/index.js` 真实路由 + 已被 contract 测试或 `src/lib/api.js` 实际消费的形状；不确定字段（如 `community/comments/:id/like` 精确返回 key、`account/comments` 行形状、`Project.downloadPolicy` 未来枚举）在 spec 中留白/注明，转记到新建的 `docs/API_V1_GAPS.md`，**不编造**。
  - `components.schemas.ApiErrorCode.enum`（27 个）与 `server/responses.js` 的 `API_ERROR_CODES` 用一次性脚本比对：逐一致，零缺失零多余。
  - 全部 admin operation 显式 `x-cpp-sdk: false`，独立 tag `Admin (Web-only)`；`adminToken` security scheme 的 description 明确写"SDK 不得实现或存储此凭证"。
  - strict envelope 规则在 `ResponseEnvelope`/`ErrorEnvelope` schema 中硬编码：顶层仅 `data`/`pagination`/`error`（`additionalProperties: false`）。
- 新建 `docs/API_V1_GAPS.md`：记录 7 类缺口——(1) 缺 DB-backed sample 的端点、(2) admin 路由未逐条枚举的清单与理由、(3) Asset/download 字段按上传类型的逐字段缺失对照表（checksum/mimeType/downloadUrl 等）、(4) `Project.downloadPolicy` 尚非冻结枚举、(5) pagination 缺口清单（与 freeze 文档 §8 一致）、(6) token 生命周期未定（freeze checklist #5）、(7) 刻意排除在 C++ SDK 外的端点边界（admin）。
- 新建 `docs/API_V1_MODEL_MAPPING.md`：
  - Web `normalizeApiPayload` 与 strict v1 envelope 关系说明（结论：该函数隐含依赖 legacy 顶层镜像做兼容展开，未针对纯 strict payload 验证过；Web 暂不切 v1，本轮不改前端代码）。
  - TypeScript 类型草图（`ApiResponse<T>`/`ApiError`/`Pagination`/`User`/`AccountProfile`/`Project`/`Asset`/`CommunityPost`/`Comment`/`DownloadRequest`/`UploadError`）——仅文档参考，不引入 TS 编译，不迁移前端。
  - C++ struct 草图（`ResponseEnvelope<T>`/`ApiError`+`ApiErrorCode` enum/`Pagination`/`User`/`AccountProfile`/`Project`/`Asset`(aspirational，标注未实现)/`CommunityPost`/`Comment`/`DownloadRequest`/`LocalAsset`/`DownloadTask`/`SyncStatus`），字段与 OpenAPI schema 一一对应。
  - 字段类型映射表（string/number/boolean/ISO datetime/nullable/array/object → JS/TS/C++ 三栏对照）。
  - 明确写死：SDK 不依赖 legacy 顶层镜像字段、不消费 admin 端点。
  - upload/download 错误 → `Result<T, ApiError>` 映射表；pagination → `PageRequest`/`Pagination` 请求响应模型映射；asset cache 仍缺失字段清单（与 API_V1_GAPS.md 交叉引用）。
- 更新 `docs/API_V1_FREEZE_PLAN.md`：§18/§19 补"已实现"说明；§21 checklist #9/#10 从 ❌ 改为 🟡（初稿完成，CI 自动漂移检测与"定稿"状态仍未达成，原因已注明）；关联文档列表补三个新文件。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：关联文档列表补三个新文件并注明 C++ Prototype 应从 model mapping 文档的 struct 草图开始而非重新设计；§22 优先级列表逐项标注当前完成状态（1/2 已完成，5/6 部分完成并注明剩余缺口，3/4 仍未开始）。

哪些接口进入了 `/api/v1`（C++ SDK public surface，`x-cpp-sdk: true`）：

- Health/Auth/Projects/Account/Profile Upload/Community/Users/Downloads/Contact 全部公开只读与已鉴权写接口，共 38 个 operation。

admin 是否进入 v1 SDK：**否**。`/api/v1/admin/*` 机械可达（双挂载天然覆盖）且 strict envelope 生效，但认证方式是 Web-only 静态 `ADMIN_TOKEN`，与 C++ App 使用的 visitor bearer token 完全不同凭证体系；spec 中所有 admin operation 标 `x-cpp-sdk: false`，SDK 的 `ApiClient` 不应实现任何 admin 方法。

C++ SDK model mapping 核心结论：

- 一个 JSON 形状对应一个 struct，不做客户端侧改名；`std::optional` 表达缺失字段，未知 JSON key 忽略（前向兼容），未知 `error.code` 落 `ApiErrorCode::Unknown` 且保留原始字符串。
- 统一 Asset Model 仍是"目标形状"而非"现状"——`Asset` struct 标注 aspirational，所有新字段（checksum/mimeType/downloadUrl/version/etag）在 SDK 落地前必须先等 freeze checklist #6/#7 完成。
- `Project` 暂无独立于 `slug` 的稳定 `id`；受控下载端点 `GET /api/v1/assets/:id/download` 尚未实现，SDK 的 `DownloadManager`/`CacheManager` 设计需以 `docs/API_V1_GAPS.md` §3/§8 的缺口表为起点，而非假设字段已存在。

仍缺哪些字段/sample（详见 `docs/API_V1_GAPS.md`）：

1. `community/comments/:id/like`、`account/comments` 的精确响应形状缺 DB-backed 断言。
2. Asset 统一模型：checksum、mimeType、downloadUrl、version、etag 全部端点均未populate。
3. `Project.downloadPolicy` 仍是自由文本，非冻结枚举。
4. 6 类公共列表端点仍无真实分页（与 freeze 文档 §8 待办一致）。
5. token 生命周期（过期/刷新/多设备）未定义（freeze checklist #5）。

修改文件：

- docs/openapi/api-v1.yaml（新建）
- docs/API_V1_MODEL_MAPPING.md（新建）
- docs/API_V1_GAPS.md（新建）
- docs/API_V1_FREEZE_PLAN.md
- docs/CPP_APP_MIGRATION_PLAN.md
- PROJECT_PROGRESS.md

commit：docs(api): extract v1 openapi and sdk model mapping（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（dist/ 构建产物已还原，未提交）
- npm run test:api：通过（38 passed，无 API 行为改动）
- npm run test:api:db：通过（18 passed，一次性集群已销毁）

OpenAPI 校验方式说明（未新增重量级依赖）：用项目已有的传递依赖 `js-yaml` 写了一次性脚本（`scripts/validate-openapi-tmp.mjs`，运行验证后已删除，未提交），确认：YAML 可解析、全部 `$ref` 可解析、`ApiErrorCode` 枚举与 `API_ERROR_CODES` 逐一致（27/27，零缺失零多余）。未安装 OpenAPI validator 类重量依赖。

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：本轮未连接、未修改任何数据库（含测试用一次性集群，仅复用既有 test:api:db 基础设施跑现有用例，未新增数据库写操作）。

待办事项（下一批，按优先级，延续 freeze checklist）：

1. OpenAPI CI 自动漂移检测接入（checklist #9 剩余部分——把本轮的一次性人工校验脚本变成可重复运行的 CI 步骤）
2. token storage 与 refresh 策略评估并文档化（checklist #5）
3. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
4. 公共列表 pagination 补齐方案（checklist #8）
5. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，完成后 1–5+11 齐备可宣告 freeze）
6. C++ SDK `sdk/core/models/*.h` 真实头文件骨架（本轮只有 markdown struct 草图，非可编译代码）
7. cpp-app/ 骨架 + 三平台 CI matrix
8. packaging strategy spike

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未改任何 API 行为（server/index.js、server/responses.js 均未改动，仅新增/修改文档）。
- 本轮未开发任何 C++ 代码或 C++ UI（仅 markdown 中的 struct 草图，非可编译产物，无 cpp-app/ 目录生成）。
- 本轮未提交 dist/ 或任何构建产物；临时验证脚本 `scripts/validate-openapi-tmp.mjs` 与临时 package.json script 均已在提交前删除/还原，未进入 git 历史。

## 2026-07-04：修复 avatar/banner upload 文件类型错误分类 bug（freeze 前错误码一致性）

结论：确认并修复 bug——avatar/banner 非法文件类型真实触发时会被误分类为 `INTERNAL_ERROR` 500，而非契约要求的 `INVALID_FILE_TYPE` 400。此风险在 2026-07-03 的技术备注中已记录（见下方历史记录），本轮排查确认属实并修复。不改任何业务行为，只修正错误分类；community/admin 上传现有行为不变。

Bug 确认：

- server/index.js 中两处 `fileFilter`：
  - 通用上传（community/admin，line ~138）拒绝时抛 `new Error('Unsupported file type.')`。
  - profile 头像/封面上传（`createProfileImageUpload`，line ~162）拒绝时抛 `new Error('Only JPG, PNG, and WebP images are allowed.')`——消息不同。
- server/responses.js 的 `describeUploadError` 此前只按 `error.message === 'Unsupported file type.'` 匹配，avatar/banner 分支永远匹配不到，`next(error)` 落到 index.js 末尾的 INTERNAL_ERROR 兜底 → 500，而不是 400 INVALID_FILE_TYPE。

修复方式：

- 不再依赖脆弱的 message 字符串。两处 `fileFilter` 拒绝时均附加稳定 `error.code = 'INVALID_FILE_TYPE'`（与 `API_ERROR_CODES.INVALID_FILE_TYPE` 同值），消息文案本身不变（仍分别是各自原有的用户可读文案）。
- `describeUploadError` 判定顺序调整为：MulterError 分支不变 → 新增 `error.code === 'INVALID_FILE_TYPE'` 判定（优先）→ 原 message 字符串匹配降级为兜底（保留，避免其他未打 code 的调用方漏判）。
- community/admin 上传现有行为逐字节不变（同一 error.code 命中同一分支，仍输出 400 + 原消息）。
- strict `/api/v1/*` 下该错误同样只输出 data/pagination/error 三个顶层键（复用 checklist #4 的 response mode 机制，未新增代码路径）。

新增测试：

- tests/api/contract.spec.js（+1 单测，37→38 total）：`describeUploadError` 对携带 `error.code = 'INVALID_FILE_TYPE'` 但消息文案不同（avatar/banner 文案）的错误正确分类，独立于 message 字符串。
- tests/api/contract.db.spec.js（+4 用例，14→18 total）：
  - avatar 非法文件类型 → legacy `/api/account/avatar` 400 INVALID_FILE_TYPE（非 500/INTERNAL_ERROR，`error` 非字符串）。
  - avatar 非法文件类型 → strict `/api/v1/account/avatar` 顶层仅 data/pagination/error，`error.code === INVALID_FILE_TYPE`。
  - banner 同上两条（legacy + strict v1）。
  - 均为端到端真实 multipart 触发（复用既有 DB-backed 环境，无需新增 fixture）。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- tests/api/contract.db.spec.js
- docs/API_V1_FREEZE_PLAN.md（§12 补已修复说明）
- PROJECT_PROGRESS.md

commit：fix(api): classify profile upload file type errors（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（dist/ 构建产物已还原，未提交）
- npm run test:api：通过（38 passed）
- npm run test:api:db：通过（18 passed，一次性集群已销毁）

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：仅 test:api:db 在临时目录一次性集群内写测试数据（含本轮新增的 avatar/banner 非法文件上传探针），跑完销毁。未连接、未修改生产库。

待办事项（下一批，按优先级，延续 freeze checklist）：

1. token storage 与 refresh 策略评估（checklist #5）
2. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
3. 公共列表 pagination 补齐方案（checklist #8）
4. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，完成后 1–5+11 齐备可宣告 freeze）
5. OpenAPI / typed client 抽取 + CI 漂移检测
6. C++ SDK data model extraction
7. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
8. CI build matrix 规划
9. packaging strategy spike

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未改任何业务行为，只修正错误分类逻辑（fileFilter 拒绝仍是同样的拒绝，仅错误对象多了一个 code 属性；describeUploadError 输出的 HTTP status/code 语义未变，只是让 avatar/banner 路径命中正确分支）。
- 本轮未混入 OpenAPI / C++ SDK / 新功能改动。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-04：/api/v1 双挂载 + strict envelope（无镜像）+ 反向镜像断言 — freeze checklist #4 完成

结论：`/api/v1/*` 稳定入口上线。`/api/*` 保持 legacy-compatible（顶层 data 镜像 + code/message 兼容镜像，Web 前端零影响）；`/api/v1/*` 使用 strict envelope，顶层键固定为 data/pagination/error 三个，成功与失败一致。两前缀共用同一 handler（URL-rewrite 双挂载），零业务复制、零行为分叉。C++ App 未来只消费 `/api/v1/*`。上一轮待办第 1 项完成。

实现方式：

- server/index.js：在 `express.json` 之前注册 v1 rewrite 中间件——命中 `^/api/v1(?=/|?|$)` 的请求打 `request.apiVersion = 'v1'` 标记并把 `request.url` 重写为 `/api/...`，之后走既有全部路由（含 upload 错误中间件与 REQUEST_BODY_INVALID/INTERNAL_ERROR 兜底）。`originalUrl` 保留 v1 前缀供日志。非精确前缀（如 `/api/v1x...`）不重写。这是本轮唯一 server/index.js 改动，无 handler 复制、无大重构。
- server/responses.js：`sendData/sendPage/sendError` 检测 `response.req.apiVersion === 'v1'` 走 strict 分支——不做 `withLegacyData` 顶层展开、不带顶层 code/message；分页对象原样保留在 envelope `pagination`，`items`/`visitors` 等 legacy 键不上顶层；runtime contract 校验以 `allowCompatibilityKeys=false, allowLegacyKeys=false` 运行。legacy 分支代码路径与行为完全不变。
- 进入 v1 的接口：全部 `/api/*` 路由自动获得 v1 别名（health、profile、projects+interactions、community、auth、account、users、download-requests、contact、experience、admin、uploads）。
- admin 边界结论：`/api/v1/admin/*` 因双挂载机械可达且 strict envelope 生效，但 admin 是 Web-only 面（静态 ADMIN_TOKEN 认证），**不属于 C++ App 可依赖的 v1 公开契约**；C++ SDK 不得调用 admin 端点。已写入 freeze 文档 §3。

反向镜像断言（防止 legacy mirror 回流 v1 / v1 模式误伤 legacy）：

- tests/api/contract.spec.js 新增 8 用例（28 → 36）：`expectReverseMirror` helper 对同一路径同时请求两前缀，断言 legacy 侧必须保留顶层镜像键、v1 侧顶层 keys 精确等于 `[data, error, pagination]`（`Object.keys` 排序全等）、两侧 data deep-equal（同 handler 无漂移）、status 一致。覆盖：health（ok/service）、projects、profile/experience/community/users-activity 只读、404 PROJECT_NOT_FOUND（code/message 镜像不入 v1）、503 SERVICE_UNAVAILABLE、contact 成功 201 + VALIDATION_ERROR 400、v1 malformed JSON → strict REQUEST_BODY_INVALID（验证中间件先于 body parser）、admin 401 strict envelope、`/api/v1x...` 非精确前缀不被重写。
- tests/api/contract.db.spec.js 新增 2 用例（12 → 14）：真实 `sendPage` 分页（admin/visitors limit=1、visitor posts 子分页）在 v1 下六字段 pagination 原样保留、顶层无 visitors/items 镜像、与 legacy 侧 pagination/data deep-equal。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- tests/api/contract.db.spec.js
- docs/API_V1_FREEZE_PLAN.md（§3 补已实现说明；§21 checklist #4 置 ✅）
- docs/CPP_APP_MIGRATION_PLAN.md（十大问题表 #2、#6 置已修复）
- PROJECT_PROGRESS.md

commit：refactor(api): add strict v1 envelope routes（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（dist/ 构建产物已还原，未提交）
- npm run test:api：通过（36 passed）
- npm run test:api:db：通过（14 passed，一次性集群已销毁）

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：仅 test:api:db 在临时目录一次性集群内写测试数据，跑完销毁。未连接、未修改生产库。

待办事项（下一批，按优先级）：

1. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档；checklist #5）
2. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
3. 公共列表 pagination 补齐方案（checklist #8）
4. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，完成后 1–5+11 齐备可宣告 freeze）
5. OpenAPI / typed client 抽取 + CI 漂移检测
6. C++ SDK data model extraction（从冻结表映射 struct 草案）
7. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
8. CI build matrix 规划（GitHub Actions win/mac/linux）
9. packaging strategy spike（NSIS / dmg+notarization / AppImage）

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未改任何业务行为/auth/权限判定（仅 API mounting + response mode + tests + docs；legacy /api/* 响应字节级不变）。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-03：DB-backed contract tests（一次性 PostgreSQL）— freeze checklist #2/#3 完成

结论：新增 `npm run test:api:db` DB-backed contract 套件（12 用例全通过），锁定此前不可达的三类路径：admin 200 成功形状 + 真实 sendPage pagination、真实 multipart multer 错误端到端、store 存在时的 AUTH_REQUIRED(401)。上一轮待办第 1、2 项完成（原 #1 admin 200 与 #2 upload E2E 合并在同一 suite），并顺带补掉历史遗留的"store 存在时 401 路径"。

完成内容：

- scripts/run-api-db-tests.mjs（新建）：一次性 PostgreSQL provisioner。
  - 未提供 `API_TEST_DATABASE_URL` 时：用本机 PostgreSQL 二进制（PG_TEST_BIN → /usr/lib/postgresql/<v>/bin → PATH）在 os.tmpdir 临时目录 `initdb` 一次性集群（loopback、随机空闲端口、trust auth、fsync=off；root 环境经 `su postgres` 执行），`createdb mrright_api_contract_test`，跑完 `pg_ctl stop -m immediate` 并删除整个集群目录。
  - 提供 `API_TEST_DATABASE_URL`（CI service container 场景）时直接使用，不 provisioning、不 teardown。
  - 双层安全闸（脚本与 suite 各自独立校验）：库名必须含 test/e2e/local/dev，且不得含 `mrright_portfolio`；不读取、不复用生产 DATABASE_URL。
- tests/api/contract.db.spec.js（新建，12 用例）：
  - seed 只经公开 API（register → verify-email devCode → login → community post → contact），不写直连 SQL；schema 由 server 启动 ensureSchema 自建；ADMIN_TOKEN 为进程内随机 throwaway 值，不落日志。
  - admin 200：summary / visitors 列表（pagination 六字段 hasNext/hasPrevious/limit/page/pages/total 精确断言 + limit=1 分页数学）/ visitor 详情 / 5 个详情子分页（items + 真实 pagination）/ 8 个列表端点（legacy 镜像 deep-equal，含 seed 数据非空断言）。
  - admin 写：PATCH profile-visibility 404 VISITOR_NOT_FOUND envelope + 对测试 visitor 的 disable→restore 200 往返（profileAdminDisabled 断言）。
  - store 存在时鉴权：错误 admin token → 401 ADMIN_AUTH_REQUIRED；/api/account/profile|downloads|comments 未登录 → 401 AUTH_REQUIRED（历史遗留补测）；登录后 profile → 200。
  - 真实 multer 错误 E2E：3MiB jpg 上传 avatar（限 2MiB）→ 413 FILE_TOO_LARGE envelope；.txt 上传 community uploads → 400 INVALID_FILE_TYPE envelope（error 非字符串）。
  - 无 `API_TEST_DATABASE_URL` 时整个文件 test.skip，不报错。
- playwright.api.db.config.js（新建）：独立 config，workers=1（共享 server + seed fixture）。
- playwright.api.config.js：`testIgnore: '**/contract.db.spec.js'`，`npm run test:api` 保持无 DB 基线。
- package.json：新增 `test:api:db` 脚本。
- docs/API_V1_FREEZE_PLAN.md：§17 补已实现说明；§21 checklist #1（上轮已完成的 INTERNAL_ERROR 兜底）、#2、#3 置 ✅。

修改文件：

- scripts/run-api-db-tests.mjs（新建）
- tests/api/contract.db.spec.js（新建）
- playwright.api.db.config.js（新建）
- playwright.api.config.js
- package.json
- docs/API_V1_FREEZE_PLAN.md
- PROJECT_PROGRESS.md

commit：test(api): add db-backed contract suite with disposable postgres（最终 hash 以 git log 为准）

build/lint/test 结果：

- npm run lint：通过
- npm run build：通过（dist/ 构建产物已 git restore/clean 还原，未提交）
- npm run test:api：通过（28 passed，基线不受影响）
- npm run test:api:db：通过（12 passed，一次性集群已销毁）
- git diff --check：通过

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：所有写操作仅发生在临时目录内一次性集群的 mrright_api_contract_test 库（seed 2 个测试 visitor、1 条社区帖、1 条联系消息、1 次 profile_admin_disabled 翻转并还原），测试结束整个集群目录已删除。未连接、未修改生产库。

待办事项（下一批，按优先级）：

1. /api/v1 双挂载 + 无镜像模式 + 反向镜像断言（freeze checklist #4）
2. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档；checklist #5）
3. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
4. 公共列表 pagination 补齐方案（checklist #8）
5. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，1–5+11 齐后可宣告 freeze）
6. OpenAPI / typed client 抽取 + CI 漂移检测
7. C++ SDK data model extraction（从冻结表映射 struct 草案）
8. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
9. CI build matrix 规划（GitHub Actions win/mac/linux，第一 commit 起；test:api:db 可用 postgres service container 直接接入）
10. packaging strategy spike（NSIS / dmg+notarization / AppImage 各走通一次）

技术备注（非本轮改动，供后续参考）：avatar/banner 的 fileFilter 错误消息（'Only JPG, PNG, and WebP images are allowed.'）不匹配 describeUploadError 的 'Unsupported file type.' 分支，会落到 INTERNAL_ERROR 500 而非 INVALID_FILE_TYPE 400；如需修正属 additive 语义微调，建议并入 checklist #11 复核时一起处理。

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret（测试用 ADMIN_TOKEN 为随机 throwaway 值，仅存在于测试进程内存）。
- 本轮未修改任何 server 业务代码/auth/admin/token 判定逻辑（仅测试、脚本与配置）。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-03：INTERNAL_ERROR / unhandled API errors envelope 兜底（freeze 前唯一服务端小改动）

结论：/api/* 未捕获异常与 JSON body parse 错误全部收敛到统一 envelope，Express 默认 HTML 500 不再可达。上一轮待办第 1 项完成。

完成内容：

- server/responses.js：API_ERROR_CODES 新增两个错误码（与 freeze 文档 26+1 冻结表对齐）：
  - `INTERNAL_ERROR`（未捕获 API 异常 → HTTP 500）
  - `REQUEST_BODY_INVALID`（JSON body parse 失败 → HTTP 400）
- server/index.js：在既有 upload error middleware 之后、express.static/SPA fallback 之前新增最终 API error-handling middleware：
  - 仅对 path 为 `/api` 或 `/api/*` 的请求生效；非 API 请求 `next(error)` 落回 Express 原有行为，静态资源与 SPA fallback 不受影响。
  - express.json 抛出的 parse 错误（`type === 'entity.parse.failed'` 或带 body 的 SyntaxError/400）→ `sendError(response, REQUEST_BODY_INVALID, ..., 400)`。
  - 其余未捕获错误 → server-side `console.error`（含完整 error/stack，仅落日志）+ `sendError(response, INTERNAL_ERROR, 'Internal server error.', 500)`；响应体不含 stack trace、SQL、路径等内部细节。
  - `headersSent` 时委托给 Express 默认处理，避免二次写响应。
  - 不改动既有 upload/multer error middleware（describeUploadError 命中仍优先返回 FILE_* envelope）。
- server/index.js：新增测试专用路由 `/api/__test__/throw`（同步 throw），仅 `NODE_ENV === 'test'` 时注册，production 不存在；代码注释注明仅供 contract test 使用。
- tests/api/contract.spec.js：主测试服务器改为 `NODE_ENV: 'test'` 启动；第二个服务器（admin 授权套件）显式 `NODE_ENV: 'production'`。新增 3 个测试（25 → 28）：
  1. malformed JSON POST /api/contact → 400 + data === null + pagination 为对象 + error.code === REQUEST_BODY_INVALID + error.message 非空 + error 非字符串。
  2. GET /api/__test__/throw（test 模式）→ 500 + INTERNAL_ERROR envelope + raw body 断言不含 stack 帧（`    at `）、原始错误文本、`server/index.js` 路径、HTML。
  3. GET /api/__test__/throw（production 模式服务器）→ 非 500 且不含 INTERNAL_ERROR，证明测试路由未在 production 注册。

非 API 行为确认：

- 静态资源仍由 `express.static(distDir)` 处理，未变。
- SPA fallback 仍 `sendFile(distIndexPath)`，未变。
- 非 /api/* 错误不强制 envelope（next(error) 透传）。
- /api/health 仍返回 envelope（contract test 覆盖，未变）。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- PROJECT_PROGRESS.md

commit：refactor(api): envelope unhandled API errors（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（构建产物 dist/ 已 git restore 还原，未提交）
- npm run test:api：通过（28 passed）

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

待办事项（下一批，按优先级）：

1. DB-backed admin 200 contract tests（一次性 PostgreSQL，绝不指向生产库）
2. DB-backed real upload multer error E2E（FILE_TOO_LARGE / INVALID_FILE_TYPE 端到端）
3. /api/v1 双挂载 + 无镜像模式 + 反向镜像断言
4. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档）
5. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全
6. OpenAPI / typed client 抽取 + CI 漂移检测
7. C++ SDK data model extraction（从冻结表映射 struct 草案）
8. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
9. CI build matrix 规划（GitHub Actions win/mac/linux，第一 commit 起）
10. packaging strategy spike（NSIS / dmg+notarization / AppImage 各走通一次）

安全说明：

- 本轮未部署 VPS、未 push GitHub、未修改数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未修改 auth/admin/token/db 判定逻辑。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-03：C++ 跨平台迁移前架构审查 + API v1 freeze 文档化

结论：纯文档轮次，零代码/零 API 行为改动。三项状态标记：

1. **API envelope migration 已完成**（2026-07-02 审计确认，全部业务路由经 sendData/sendPage/sendError，25 contract 测试通过）。
2. **当前进入 API v1 freeze 文档化阶段**（freeze 规范已定稿，freeze 本身未宣告，见 docs/API_V1_FREEZE_PLAN.md §21 checklist）。
3. **C++ App 迁移目标已升级为跨平台客户端**：Windows 10/11 / macOS (Apple Silicon + Intel) / Linux x86_64 三端 P0，从第一版起为架构约束（SDK、缓存、路径、token、下载、日志、打包、CI、3D viewer 全部按三端一致性设计），不是后期移植。

完成内容：

- 项目重新定位：以稳定 API 契约为核心的 3D 内容/资源/社区/账号权限平台；Web 负责展示、社区、账号中心与 admin；API 承载全部权限与分发决策；C++ 跨平台 App 负责高性能资源消费（模型查看、下载、本地缓存、离线库）。不是"用 C++ 重写网站"。
- 现有架构评分 7/10；识别十大问题，最高优先级三项：
  1. /uploads 为 express.static 公开直出，downloadPolicy 未在文件层执行（需受控下载端点 + Range/ETag）；
  2. 无 /api/v1 版本前缀；
  3. 未捕获异常仍落 Express 默认 HTML 500（无 INTERNAL_ERROR envelope 兜底，2026-07-02 待办复核确认未完成）。
- API v1 freeze 规范定稿：/api/v1 双挂载策略（v1 下不带 legacy 顶层镜像）、envelope/success/error 规范、26+1 错误码冻结表（含待实现 INTERNAL_ERROR）、pagination 六字段规范与补齐清单、auth token 生命周期决策项、permission/downloadPolicy 枚举化、Asset Model（含 checksum/downloadUrl）、upload 错误规范、additive-only 兼容策略、deprecation 策略、DB-backed contract test 方案、OpenAPI 漂移检测策略、C++ SDK model 映射规则、freeze 前 11 项 checklist。
- C++ 迁移五阶段路线图：Phase 1 API v1 freeze → Phase 2 三平台 prototype（登录/token 安全存储/项目/受控下载/缓存/日志，三平台 CI 第一 commit 起全绿）→ Phase 3 跨平台 3D viewer（GLB + Qt RHI）→ Phase 4 打包（NSIS/.dmg+notarization/AppImage）→ Phase 5 离线+同步。
- 技术栈结论：Qt 6.8 LTS + Qt Quick/QML；CMake + CMakePresets；vcpkg（manifest）；Qt Network（藏于可替换 HttpBackend 接口后）；SQLite + content-addressed 文件缓存；3D 走 Qt RHI（Quick 3D 起步）；tinygltf 起步（服务端统一转 GLB）、Assimp 后置；手写 C++ SDK（OpenAPI 仅作 spec/漂移检测）；QtKeychain（Credential Manager/Keychain/Secret Service，加密文件仅降级）；spdlog；crashpad 推迟 Phase 4；GitHub Actions 三平台 matrix。
- 跨平台设计：AppPaths/Config/Cache/Log/Download/Temp 六 provider 三平台路径映射（AppData/LocalAppData、Application Support/Caches/Logs、XDG）；token 禁止明文落盘；构建矩阵 MSVC/Clang/GCC + Debug/Release/RelWithDebInfo；20 项跨平台风险按严重度排序并附规避策略。
- 用户补充跨平台强制要求（P0 Win/macOS/Linux、P1 Steam Deck/portable、P2 移动端不承诺）逐条核对：技术栈 10 项、目录抽象、构建/打包矩阵、SDK 解耦、10 项风险、章节与五阶段路线图均已在文档中覆盖；唯一缺口为显式 "Phase-by-phase Platform Support" 章节，已补 §20.1（各阶段 × 各平台验收矩阵 + P1 不阻塞 P0 / P2 仅架构兼容规则）。

修改文件：

- docs/CPP_APP_MIGRATION_PLAN.md（新建）
- docs/API_V1_FREEZE_PLAN.md（新建）
- PROJECT_PROGRESS.md

commit：docs(api): define v1 freeze and cross-platform cpp app plan（最终 hash 以 git log 为准）

build/lint/test 结果：见下（验证通过后回填）。

- npm run lint：通过
- npm run build：通过
- npm run test:api：通过（25 passed）

是否部署 VPS：否（纯文档，无需备份）。

验证接口状态：未涉及线上，无变化。

待办事项（下一批，按优先级）：

1. INTERNAL_ERROR / unhandled API errors envelope 兜底（确认尚未完成；唯一 freeze 前服务端小改动）
2. DB-backed admin 200 contract tests（一次性 PostgreSQL，绝不指向生产库）
3. DB-backed real upload multer error E2E（FILE_TOO_LARGE / INVALID_FILE_TYPE 端到端）
4. /api/v1 双挂载 + 无镜像模式 + 反向镜像断言
5. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档）
6. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全
7. OpenAPI / typed client 抽取 + CI 漂移检测
8. C++ SDK data model extraction（从冻结表映射 struct 草案）
9. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
10. CI build matrix 规划（GitHub Actions win/mac/linux，第一 commit 起）
11. packaging strategy spike（NSIS / dmg+notarization / AppImage 各走通一次）

安全说明：

- 本轮未部署 VPS、未 push GitHub、未修改数据库、未修改任何 API 行为或业务代码。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未开发任何 C++ UI 代码（仅文档）。

## 2026-07-02：API envelope 最终审计（v1 freeze 准备）

结论：后端 API response envelope 化已完整闭环。本轮为审计 + 必要注释，无业务逻辑改动。

一、后端裸响应复查（server/index.js、server/responses.js、server/contracts）：

- `grep response.json / res.json / json({ / sendStatus / status(...).end / status(...).json`：
  - 全部业务响应均经 sendData / sendPage / sendError（内部统一 `response.status(x).json()`）。
  - 唯一 `json({` 命中为 `express.json({ limit: '96kb' })` body parser 配置，非响应。
  - 无 `sendStatus`；唯一 `.end(` 为 postgresStores.js 的 `pool.end()`（DB 连接池，非 Express response）。
- 非 API / 静态响应（保留，已加注释说明原因）：
  - `express.static(distDir, ...)` 与 SPA fallback `response.sendFile(distIndexPath)`：
    服务已构建的前端单页，不属于 API 契约，刻意不走 JSON envelope。本轮补注释说明。
  - 缓存头 setNoStoreHeaders / setStaticCacheHeaders：仅设 header，非响应体。
- `/api/health`：已用 sendData 输出 envelope（含 legacy ok/service 顶层镜像）。

二、错误码完整性复查（server/responses.js API_ERROR_CODES）：

- index.js 中所有 `sendError` 使用的 code 均存在于 API_ERROR_CODES（20 个在用）。
- 定义但当前未在 index.js 直接引用：FILE_TOO_LARGE / FILE_UPLOAD_ERROR / INVALID_FILE_TYPE
  （由 responses.js describeUploadError 使用）、INVALID_TOKEN / RATE_LIMITED（预留词表，
  保留不动，删除属 unrelated cleanup）。
- HTTP status ↔ code 语义核对：
  - 401：ADMIN_AUTH_REQUIRED、AUTH_REQUIRED
  - 403：RESOURCE_FORBIDDEN（部分）、PROFILE_ADMIN_DISABLED
  - 404：各 *_NOT_FOUND；`/api/users/:handle*` 刻意用 RESOURCE_FORBIDDEN + 404 防用户枚举
    （已有注释 server/index.js:954-958）
  - 409：HANDLE_TAKEN、PROJECT_SLUG_TAKEN
  - 413：FILE_TOO_LARGE（describeUploadError）
  - 400：VALIDATION_ERROR、FILE_UPLOAD_ERROR、INVALID_FILE_TYPE
  - 503：SERVICE_UNAVAILABLE
  - 均匹配，无语义不准的错误码复用。
  - 500：当前无显式 sendError(...,500)；未捕获异常经全局 error 中间件 `next(error)`
    落到 Express 默认处理（HTML 500）。见待办（freeze 前可加 INTERNAL_ERROR envelope 兜底）。

三、contract 测试复查（tests/api/contract.spec.js，25 用例）：

- 覆盖确认：GET 成功 envelope、GET 错误 envelope（404）、auth 错误 envelope（503）、
  visitor/community/contact 写接口 envelope（201/400/404/503）、admin 未授权 envelope（401）、
  admin 有 token 但 store 缺失（503）、upload/global error envelope（multipart 503 +
  describeUploadError 单测）、legacy 顶层字段镜像（payload.X === payload.data.X）、
  每个 payload 的 pagination 均断言为对象。
- 未新增测试：无低成本可达遗漏；剩余均为 DB 门禁路径（见待办）。

四、前端兼容性复查（src/lib/api.js、src/Admin.jsx）：

- `createApiError` 优先读 envelope `payload.error.message`，回退 legacy 字符串 →
  `payload.message` → fallback；上传错误 payload.error 由字符串变对象不影响。
- `normalizeApiPayload` 合并 data 顶层键 → legacy 顶层字段兼容。
- Admin.jsx 分页读顶层 `payload.pagination` / 子分页 pagination，sendPage 已保留，正常。
- 结论：前端无需改动。

修改文件：

- server/index.js（仅新增静态 / SPA fallback 注释，说明其刻意保留非 envelope；零逻辑改动）
- PROJECT_PROGRESS.md

验证结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，25 passed

commit：

- chore(api): audit envelope migration

待办事项（API v1 freeze 前）：

- DB-backed admin 200 contract tests：配置 DATABASE_URL 后补 admin 成功响应（200）与
  真实 pagination（sendPage）+ legacy 顶层字段镜像断言。
- DB-backed real upload multer error E2E：配置 DB + 通过 auth 门禁后，补真实 multipart
  触发 multer 错误（FILE_TOO_LARGE / INVALID_FILE_TYPE / FILE_UPLOAD_ERROR）端到端断言。
- 未捕获异常兜底：评估在全局 error 中间件为非 upload 错误加 INTERNAL_ERROR(500) envelope，
  替代当前落到 Express 默认 HTML 500 的行为（需权衡是否影响非 API 路径）。
- API v1 freeze docs：整理 envelope 契约 + 错误码表（API_ERROR_CODES）文档。
- SDK contract extraction：从 responses.js / contract 测试抽取 OpenAPI 或 typed client。
- store 缺失环境下 AUTH_REQUIRED(401) 路径补测（历史遗留）。

安全说明：

- 本轮未部署 VPS，无需备份。
- 本轮未 push GitHub。
- 本轮未修改数据库结构、登录判断、session 生成、visitor token、ADMIN_TOKEN、
  权限判定或任何生产配置（仅新增静态/ SPA fallback 注释）。
- 本轮未输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：统一错误处理收尾 — 全局 multer 上传错误 envelope 化

完成内容：

- 将 server/index.js 末尾共享的 multer / 全局上传错误中间件从裸响应
  `{ error: "字符串" }` 迁移到统一 envelope（sendError）。这是全项目最后一个
  `{ error: string }` 裸响应点，迁移后 server/index.js 已无裸 JSON 错误。
- 中间件不再直接返回 `response.status(400).json({ error })`，改为调用
  `describeUploadError(error)` 分类后走 `sendError(response, CODE, message, httpStatus)`。
- 按错误类型选用/新增语义准确的错误码（server/responses.js API_ERROR_CODES 新增）：
  - MulterError `LIMIT_FILE_SIZE` → FILE_TOO_LARGE，HTTP 413
  - 其它 MulterError（如 LIMIT_UNEXPECTED_FILE）→ FILE_UPLOAD_ERROR，HTTP 400
  - fileFilter 抛出的 `Unsupported file type.` → INVALID_FILE_TYPE，HTTP 400
  - 未匹配的错误仍 `next(error)`，行为不变（不吞其它错误）。
- 新增纯函数 `describeUploadError(error)`（server/responses.js），不 import multer，
  用 `error.name === 'MulterError'` + `error.code` 判定，便于无 DB / 无 multer 单测。
- 错误体统一为 `{ data: null, pagination: {}, error: { code, message } }`
  （含顶层 code/message 兼容镜像，与既有 sendError 一致）。
- 该中间件同时服务 community 上传、admin 上传、profile avatar/banner 上传，四处上传
  路由（/api/community/uploads、/api/admin/uploads、/api/account/avatar、
  /api/account/banner）共享同一处理，本次迁移对四处一致生效。

前端错误消费核查（未改前端）：

- src/lib/api.js 的 `createApiError` 已同时兼容 envelope（`payload.error.message`）
  与 legacy 字符串（`typeof payload.error === 'string'`），并回退 `payload.message`
  / fallbackMessage；上传 helper（uploadCommunityResource、uploadAccountImage、
  uploadAdminAsset）与 `request` 均通过 `createApiError` 构造 `error.message`。
- Admin.jsx / community 上传 / profile avatar-banner 上传均消费 `error.message`，
  不直接把 `payload.error` 当字符串展示。
- 结论：前端已通过 createApiError 兼容 error.message，无需改动，未做 UI 重构。

测试：

- tests/api/contract.spec.js：
  - 新增可达上传错误路径 contract 断言：multipart POST `/api/community/uploads`
    （无 DB，requireAuthStore 在 multer 前短路）→ 503 SERVICE_UNAVAILABLE，断言
    envelope（data===null、pagination 为对象、error.code/message 存在、
    `typeof payload.error !== 'string'`）。
  - 新增 `describeUploadError` 映射单测（直接测真实分类器，无需 DB/multipart）：
    FILE_TOO_LARGE/413、FILE_UPLOAD_ERROR/400、INVALID_FILE_TYPE/400、
    以及 null / 无关错误返回 null。
  - contract 覆盖从 20 增至 25 个用例。
- 说明：四个上传路由都在 multer 之前有 requireAuthStore/requireAdmin 门禁，无 DB
  环境下会先返回 503，真实 multer 上传错误（FILE_TOO_LARGE 等）通过路由不可达；
  故用纯函数单测覆盖真实映射逻辑，并保留可达路径（503）的 contract 断言。
  → 待办：配置 DATABASE_URL 的环境中补一条真实 multipart 触发 multer 错误的端到端断言。

修改文件：

- server/index.js（中间件迁移 + import describeUploadError）
- server/responses.js（新增 FILE_TOO_LARGE / FILE_UPLOAD_ERROR / INVALID_FILE_TYPE
  错误码 + describeUploadError 分类器）
- tests/api/contract.spec.js
- PROJECT_PROGRESS.md

验证结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，25 passed
- 全局复查：`grep -n "json({ *error:"`、`res\.json`、`response\.json` 于
  server/index.js 均无裸 JSON 错误命中（错误响应统一经 sendData/sendError/sendPage）。

commit：

- refactor(api): envelope global upload errors

待办事项：

- 配置 DATABASE_URL 的 adminStore/authStore 环境中：
  - 补 admin 真正 200 成功响应与 legacy 顶层字段镜像断言（上一批遗留）。
  - 补真实 multipart 触发 multer 上传错误（FILE_TOO_LARGE / INVALID_FILE_TYPE）的
    端到端 contract 断言（当前受门禁 + 无 DB 限制不可达）。
  - store 缺失环境下 AUTH_REQUIRED(401) 路径补测（上一批遗留）。

安全说明：

- 本轮未部署 VPS，无需备份。
- 本轮未 push GitHub。
- 本轮未修改数据库结构、登录判断、session 生成、visitor token、ADMIN_TOKEN 或
  任何权限判定逻辑（仅将上传错误响应体改为 envelope，中间件匹配范围与放行行为不变，
  MulterError LIMIT_FILE_SIZE 由 400 细化为 413 更贴合语义，非 2xx 前端行为不受影响）。
- 本轮未输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：Admin 管理接口 API envelope 迁移

完成内容：

- requireAdmin 中间件迁移到 sendError：
  - 缺 / 错 ADMIN_TOKEN → 401 ADMIN_AUTH_REQUIRED
  - adminStore 缺失 → 503 SERVICE_UNAVAILABLE
- 全部 /api/admin/* handler 的裸 response.json 迁移到 sendData/sendError，覆盖：
  - 只读列表：summary、comments、likes、contact-messages、download-requests、projects、community-uploads/posts/comments
  - 分页接口：visitors 列表、visitor 详情子分页（comments/posts/uploads/download-requests/actions）
  - 写操作：visitor access-level / email-verification / profile-visibility / profile-moderation / 删除、community-upload 状态更新与删除、community-post/comment 删除、admin 素材上传、project 创建/更新/删除、download-request 状态更新与删除、comment / contact-message 删除
- 分页接口改用 sendPage(response, data, pagination)：
  - 原因：sendData 会把 envelope 的 pagination 强制为 {}，会覆盖真实分页；admin 前端（Admin.jsx）依赖顶层 payload.pagination 做翻页。sendPage 保留真实 pagination，同时保留顶层 visitors/items legacy 镜像。
- 保留 admin 前端依赖的 legacy 顶层字段：visitors、visitor、recentActions、items、pagination、summary、file、conversion、project、upload、request、deleted、ok 等（api.js normalizeApiPayload 合并 data + 顶层，UI 读取不受影响）。
- server/responses.js 新增错误码：ADMIN_AUTH_REQUIRED、COMMENT_NOT_FOUND、CONTACT_MESSAGE_NOT_FOUND、DOWNLOAD_REQUEST_NOT_FOUND、PROJECT_SLUG_TAKEN、VISITOR_NOT_FOUND。
- 扩展 tests/api/contract.spec.js：新增 admin 用例，contract 覆盖从 15 增至 20 个用例。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- PROJECT_PROGRESS.md

验证结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，20 passed
- admin contract 覆盖：
  - 无 Authorization 访问 admin GET / 写操作：401 ADMIN_AUTH_REQUIRED
  - 错误 token 访问 admin GET：401 ADMIN_AUTH_REQUIRED
  - 有效 ADMIN_TOKEN 但 store 缺失（独立 server，DATABASE_URL 置空）：admin GET / 写操作 503 SERVICE_UNAVAILABLE

待办事项：

- admin 真正的 200 成功响应与 legacy 顶层字段镜像断言，需要配置了 DATABASE_URL 的 adminStore 环境补测（当前无 DB，成功路径不可达）。
- server/index.js 末尾的 multer 全局错误中间件仍返回 `{ error: string }`；它被 community 上传与 admin 上传共享，不属于 /api/admin/* handler，按"仅 admin、不动 community 写"约束本批未迁移，留作后续统一错误处理批次。

安全说明：

- 本轮没有部署 VPS，无需备份。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构、登录判断、session 生成、visitor token 或 ADMIN_TOKEN 逻辑（仅将 ADMIN_TOKEN 判定失败的响应体改为 envelope，判定逻辑不变）。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

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
