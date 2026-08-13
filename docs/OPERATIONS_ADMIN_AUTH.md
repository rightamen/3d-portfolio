# 管理员认证

状态：2026-08-11 引入短时会话。在此之前，管理后台的凭证是一个**永久有效、无法吊销**的
静态 `ADMIN_TOKEN`，并且以明文长期存放在浏览器 `localStorage`。

## 之前的问题

`src/Admin.jsx` 把操作者输入的 `ADMIN_TOKEN` 原样写进 `localStorage`，之后每个请求都用它。
后果：

- **一次泄露 = 永久全站管理权。** 没有有效期，没有吊销手段。要作废只能改服务器环境变量并重启。
- **管理页上任何一个 XSS 都能直接偷走它**，而当时 CSP 还是 report-only。
- **审计无法归因。** `admin_user_actions` 记录了动作，但所有动作都来自同一个凭证，
  分不清是谁、从哪台机器操作的。

## 现在的模型

```
操作者输入 ADMIN_TOKEN
        │
        ▼
POST /api/admin/session          ← 唯一无条件接受静态 token 的路由
        │
        ▼
返回会话令牌（默认 12 小时）      ← admin_sessions 表存 SHA-256 哈希，记录 IP 与 User-Agent
        │
        ▼
浏览器只保存会话令牌，静态 token 用完即丢
```

- 会话令牌**只存哈希**，数据库泄露不等于凭证泄露。
- 每次使用刷新 `last_seen_at`；过期由 `deleteExpiredAdminSessions` 定期清理。
- 登出会调用 `DELETE /api/admin/session` 真正吊销，而不只是本地遗忘。
- `GET /api/admin/sessions` 列出当前活跃会话（IP、User-Agent、签发与最后使用时间），
  用于发现不认识的登录。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ADMIN_SESSION_HOURS` | `12` | 会话有效期 |
| `ADMIN_ALLOW_STATIC_TOKEN` | `true` | 是否仍接受静态 token 直接调用 API |

## 收紧路径（建议按顺序执行）

**第 1 步（已完成）**：浏览器不再持有静态 token。

**第 2 步（2026-08-12 已完成并上线）**：`ADMIN_ALLOW_STATIC_TOKEN=false` 已在 VPS 生效。
静态 token 现在只能用于换取会话，任何直接的 API 调用都会被拒绝 —— 泄露的静态 token 至少需要
一次可观测的 `POST /api/admin/session` 才能变成访问权，而那次调用会被记录 IP。

切换前先改掉了两个仍在直接用静态 token 调 API 的调用方：

- `scripts/deploy-vps.mjs` 与 `scripts/package-vps-release.mjs` 的部署后验证
- `tests/e2e/admin-visitors.spec.js`

它们现在都先 `POST /api/admin/session` 换会话再调 API。**部署脚本用完必定吊销**
（包括检查失败的路径 —— 那正是遗留会话最容易被忽视的时候）；E2E 套件不吊销，
理由写在该文件的注释里，会话会自行过期。

线上实测（2026-08-12 05:12 UTC 切换后）：

| 调用 | 结果 |
| --- | --- |
| 静态 token → `/api/admin/summary`、`/visitors`、`/comments` | 全部 **401 `ADMIN_AUTH_REQUIRED`** |
| 静态 token → `POST /api/admin/session` | **201**（这是设计上保留的唯一用途） |
| 会话 → 上述三个端点 | 全部 200 |
| `DELETE /api/admin/session` 之后复用该会话 | 401 |
| 伪造 token → 换会话 | 401 |

**回退办法**：把 `/etc/mrright-portfolio.env` 里的 `ADMIN_ALLOW_STATIC_TOKEN=false`
删掉或改成 `true`，然后 `systemctl restart mrright-portfolio`。
切换前的 env 备份在 `/etc/mrright-portfolio.env.backup-20260812-051212`。

**第 3 步（2026-08-13 已实现）**：管理员账号体系 + TOTP。见下面「命名管理员账号」一节。
静态 token 至此降级为**引导 / 救援凭证**：它仍然能换会话（否则第一个账号无法创建，
账号出问题时也无路可退），但用它做的每一件事在审计里都记为「无人」。

## 命名管理员账号（2026-08-13）

在此之前，「管理员」的意思是「知道 `ADMIN_TOKEN` 的人」：一个共享密钥、没有第二因素，
而且审计表 `admin_user_actions` 记的是**对哪个访客做了什么**，不是**谁做的**。

现在的模型：

```
用户名 + 密码 + 6 位 TOTP（或一枚恢复码）
        │
        ▼
POST /api/admin/login
        │
        ▼
返回会话令牌（同样 12 小时）      ← admin_sessions.admin_user_id 指向这个人
        │
        ▼
这期间的每个动作都写 admin_user_actions.actor_admin_user_id
```

### 表

`admin_users`：`username`、`password_hash`（pbkdf2，与访客同一套实现）、`totp_secret`、
`totp_confirmed_at`、`totp_last_step`、`recovery_code_hashes`、
`failed_login_count` / `locked_until`、`disabled_at`。

两个字段值得单独说：

- **`totp_last_step`** 是让 6 位码**一次性**的东西。TOTP 天然在 30 秒内可重放，
  记住上次成功的时间步、并拒绝小于等于它的步，重放才真的被挡住。
  抢同一个码的两个请求里只有一个能成功（`UPDATE ... WHERE totp_last_step < $2`）。
- **`recovery_code_hashes`** 是**敢于强制要求第二因素**的前提。手机丢了的答案是信封里的
  一枚恢复码，不是 SSH 上去手写 UPDATE。恢复码用 SHA-256 存哈希、一枚一用；
  用 SHA-256 而不是 pbkdf2 是因为它们是 80 位机器熵（没有字典可拉伸），
  而且「若还在则删掉这一枚」必须是**单条语句**才没有竞态。

### 命令行（引导与救援）

API 能创建管理员，但要求调用者**已经是**管理员 —— 所以第一个账号必须从 API 之外来。
在 VPS 上（脚本随部署一起上传，`DATABASE_URL` 用服务同一份）：

```sh
cd /opt/mrright-portfolio
DATABASE_URL=... node scripts/admin-user.mjs create <用户名> --display-name "名字"
DATABASE_URL=... node scripts/admin-user.mjs list
DATABASE_URL=... node scripts/admin-user.mjs reset-totp <用户名>     # 换手机 / 怀疑泄露
DATABASE_URL=... node scripts/admin-user.mjs recovery-codes <用户名> # 重发一套恢复码
DATABASE_URL=... node scripts/admin-user.mjs disable <用户名>        # 同时吊销其全部会话
```

密码从终端读、**不走 argv**（argv 会出现在 `ps` 里，也会进 shell 历史）。
TOTP secret 与恢复码**只打印这一次**：secret 实际上是只写的，恢复码只存哈希。

### 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/admin/login` | 用户名 + 密码 + `totp` 或 `recoveryCode`，换短时会话 |
| `GET` | `/api/admin/me` | 当前会话属于谁（共享令牌会话返回 `username: null`） |
| `GET` | `/api/admin/users` | 账号列表（**不含任何密钥**） |
| `POST` | `/api/admin/users` | 新建账号，**仅此一次**返回 secret / otpauth URL / 恢复码 |
| `PATCH` | `/api/admin/users/:id` | 停用 / 启用（停用会立即删掉其会话） |
| `POST` | `/api/admin/me/recovery-codes` | 给自己换一套恢复码（旧的立即作废） |
| `GET` | `/api/admin/actions` | 审计流，带 `actorUsername`（共享令牌为 `null`） |

行为上几个刻意的选择：

- **密码错与用户名不存在返回完全相同的码和文案**，且都跑一次 pbkdf2 —— 否则这个接口
  就是账号枚举器。
- **`ADMIN_TOTP_REQUIRED` 是独立错误码**，只在密码已经正确时才会返回。客户端得知道
  该不该显示验证码输入框，而这条信息对攻击者没有增量价值。
- **停用账号会同步删掉它的会话**，而不是等会话自然过期 —— 否则「停用」最长 12 小时后才生效。
- **不能停用自己正在使用的账号**（会话会被自己吊销，若还是最后一个启用账号就没人能撤销了）。
- 失败 `ADMIN_LOGIN_LOCK_AFTER`（默认 5）次锁 `ADMIN_LOGIN_LOCK_MINUTES`（默认 15）分钟，
  **锁定期间正确密码也拒绝**。

### 前端

`/admin` 登录页默认是账号模式（用户名 / 密码 / 6 位码），可切「使用恢复码」，
也可切回**共享令牌**模式（救援用）。登录后页头明确写出当前身份；用共享令牌登录时写的是
**「Signed in with the shared admin token (actions are not attributed)」** ——
不可归因这件事应该在干活时就看得见，而不是事后才发现。

### 测试

- `npm run test:admin-totp` —— 对着 **RFC 6238 自带的测试向量**验证 TOTP 实现，
  外加窗口、重放、恢复码格式。手写的 TOTP 只有对着标准验证才有意义：自洽的实现
  可以完全自洽却和所有认证器 App 不兼容。
- `npm run test:api:db`（`tests/api/admin-auth.db.spec.js`，9 项）—— 真数据库端到端：
  必须第二因素、错密码与不存在用户不可区分、码不可重放、恢复码一次性、锁定、
  停用即时吊销会话、不能停用自己、审计归因、以及**任何列表都不会带出密钥**。

### 待办

- 现在还没有「改自己密码」的接口（用 CLI `reset-password`）。
- 审计归因目前覆盖两条会写 `admin_user_actions` 的路径（资料可见性、资料字段清理）；
  其他管理动作还没有写审计行 —— 要扩大覆盖面，得先给那些动作补审计写入。

## 轮换静态 token

```bash
# 1. 生成新值（不要回显到共享终端历史）
openssl rand -hex 32

# 2. 编辑 /etc/mrright-portfolio.env，替换 ADMIN_TOKEN
#    注意：CLAUDE.md 禁止覆盖这个文件，只做单行编辑

# 3. 重启服务
systemctl restart mrright-portfolio

# 4. 旧的会话令牌不受影响（它们独立于静态 token），
#    如需一并作废，清空 admin_sessions 表
```

轮换后所有已签发的**会话**仍然有效直到过期，这是有意的：轮换静态 token 是为了
处理静态 token 泄露，不应该顺带把正在工作的管理员踢下线。
如果是会话本身泄露，用 `GET /api/admin/sessions` 定位后清理对应行。
