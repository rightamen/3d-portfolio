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

**第 3 步（尚未实现）**：管理员账号体系 + TOTP。
当前模型仍然是"知道一个共享密钥就是管理员"。真正的多因素需要：

- `admin_users` 表（用户名、密码哈希、TOTP secret）
- 登录时校验密码 + 6 位 TOTP
- `admin_sessions` 增加 `admin_user_id`，让 `admin_user_actions` 能归因到人
- 静态 token 降级为纯粹的引导/救援凭证

这是下一阶段的工作，不在本轮范围内。

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
