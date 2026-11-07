# 关注与好友入口修正发布 — 2026-11-07

固定提交 cdfc64fb680ff3f35aa630ce0216c0316eac1c63，标签 release-2026-11-07-social-entry，部署完成 2026-11-07 17:39:48 Asia/Shanghai。
GitHub 提交和标签先于上传，196 个制品文件逐项匹配；制品 SHA-256 c67cd713dca342ad1a55ed6f07cc97b5d8352e3ed090f311b9144dd04547a1f3，
15,917,680 bytes。/release.json 可查询实际运行提交。

## 用户可见修正

顶部和手机菜单新增“创作者”，头像菜单新增关系管理与发现入口；
/creators 默认展示公开创作者并可直接关注、申请好友，作品作者栏同样提供按钮。
匿名分别显示两个登录入口；本人卡片/主页清晰提示并引导发现，私有作者不显示操作。
详见 [功能说明](SOCIAL_ENTRY_POINTS_2026-11-07.md)。

本次是此前已授权上线功能的入口修正；上一运行 f55bb98 / release-2026-11-07-social。
不新增 schema，不写演示用户、关系、文件夹或举报。

## 验证

- build/lint、362 单测、241 完整一次性 PostgreSQL 检查、102 完整浏览器检查。
- 八组制品、部署脚本与备份检查，固定分支已推送且干净。
- 真实双用户从 /creators 发现目标并关注/申请与接受，收藏夹和举报链路保持。
- 三语 390px、1024px、深浅配色、本人/匿名、私密作者、空态/错误重试和菜单导航。
- 线上 17 页面 200、14 匿名私有读 401、22 HTTPS 检查零警告/失败，health/admin_summary/管理作品/举报队列正常。
- 196 文件匹配，13 上传无缺失/变化，env/nginx/systemd 指纹一致，14 张业务表在部署后及界面验收后完整指纹一致。
- 真实短期登录会话验证全局目录、头像菜单、本人作者栏提示和匿名关注/好友入口；零页面异常/溢出。
- 访客十分钟会话按哈希/用户精确撤销，管理员正式会话通过接口撤销，均验证旧凭据 401；临时凭据文件移除。
- 私人读取、v1、后台举报队列和收藏夹/举报表单取消继续通过，无业务写入。
- 旧支付/评分夹具新增关系读取模拟后全套重跑通过；产品订单逻辑未变。

## 备份与回溯

- 应用：/opt/mrright-portfolio.backup-20261107-093942
- 环境副本：/etc/mrright-portfolio.env.backup-20261107-093942
- 数据库：/var/backups/mrright-portfolio/releases/before-cdfc64f-20261107-093942.dump

备份名按服务器 UTC；所有旧备份保留。custom pg_dump 目录检查通过，未执行生产恢复演练。
回溯标签 release-2026-11-07-social-entry 和上一标签 release-2026-11-07-social 均已推送。
如需回退，先保存当前状态，再按确认的应用版本回退，保留 data/uploads/env；本次无结构迁移。

证据 .deploy-tools/social-entry-checks/、social-entry-release/、social-entry-artifact.json、
social-entry-deploy.log、social-entry-deployment.json、social-entry-server-verification.json、
social-entry-final-data.json、social-entry-production-check.json、
social-entry-live-smoke-exit.json 和 release-social-entry-20261107/smoke.json/截图。

## 后续私聊与关注动态

专门消息和关注动态已由 de1929a / release-2026-11-07-communication 上线。
当前运行、增量结构与备份见 [私聊与动态发布](RELEASE_2026-11-07_COMMUNICATION.md)。
