# 私聊与关注动态发布 — 2026-11-07

运行提交 de1929a173d71992e6b8db4e27812b78336bae03，标签 release-2026-11-07-communication，部署完成 2026-11-07 18:31:11 Asia/Shanghai。
GitHub main 与固定标签先推送，从干净分支构建制品。
SHA-256 2be833c90e4bb7385acbf86313b1a1bdaed743cf4c1864a38925f0d52f02488a，15,929,812 bytes，203 文件逐项匹配。
/release.json 可查询实际运行提交，上一运行 cdfc64f / release-2026-11-07-social-entry。

## 功能

新增独立 /messages 私聊与 /following 关注动态；好友直接聊天，非好友先发一条请求，
接收方接受后继续。顶部/头像/手机入口、作者与关系卡片“发消息”均可见。
文字消息带历史、读状态、失败重试、请求/屏蔽管理；动态按当前关注和公开范围筛选，
按实际条目标记当前页已读。详见 [功能与 API](COMMUNICATION_2026-11-07.md)。

只新增 direct_conversations、direct_messages、following_feed_reads 与索引；
既有表不迁移或重写，原管理员、visitor session 和系统通知保持。
会话约 3 秒轮询更新，本批无附件/语音/群聊/站外推送。

## 验证


build/lint、365 单测、254 完整一次性库检查、116 完整浏览器检查通过；
旧库从 a994074 升级/幂等、原 notifications 与双人 notification-journey 通过。
新增 13 个 DB、14 个浏览器、3 个输入边界检查，真实双用户请求→接受→互发→已读→关注动态全链路通过。
发送响应丢失、首条请求重试、已读失败补交、轮询不打断慢操作、换号隔离和三语手机/深浅主题均验证。
线上 19 页面 200、18 匿名私有读取 401，
公网 HTTPS 22 项通过、0 警告/0 失败；
health、admin_summary、管理作品与举报队列正常，旧链接 301/公开隐私/缩略图保持。
203 个制品文件全部匹配，13 上传无缺失/变化，env/nginx/systemd 一致；
17 张既有业务表在部署后和界面验收后完整指纹一致，作者主题不变。
新增私聊/动态结构和索引正常，新增表验收行数 {"direct_conversations": 0, "direct_messages": 0, "following_feed_reads": 0}。
生产仅验证私人列表/角标、桌面/手机入口、新消息搜索表单取消、匿名门禁；
未建立真实对话、未发消息、未改动态已读，也未写关注/好友/收藏夹/举报或修改既有作品。
临时访客会话十分钟 TTL，按 hash/user 精确撤销；正式管理员会话通过接口撤销，均复核旧凭据 401。
本地/远端临时凭据移除，用户既有会话保留，零页面异常/横向溢出。

首轮提示区包含取消按钮，测试改为定位提示区域。首条请求确认重试、回执失败补交、
慢操作避免轮询打断和桌面聊天输入区视窗适配均在最终回归中通过。

## 备份与回溯

- /opt/mrright-portfolio.backup-20261107-103105
- /etc/mrright-portfolio.env.backup-20261107-103105
- /var/backups/mrright-portfolio/releases/before-de1929a-20261107-103105.dump

所有旧备份保留。custom pg_dump 目录检查通过，未执行生产恢复演练。
若回退，先保存当前状态，再恢复确认的应用版本，保留 data/uploads/env 和新的私聊数据表；
本次为增量结构，回退不删除新表。两个回溯标签均已推送 GitHub。

发布后仅更新文档，不为文档再次上线。
证据在 .deploy-tools/communication-checks/、communication-release/、communication-artifact.json、
communication-deploy.log、communication-deployment.json、communication-server-verification.json、
communication-final-data.json、communication-production-check.json、communication-live-smoke-exit.json
及 release-communication-20261107/smoke.json 与桌面/手机截图。
