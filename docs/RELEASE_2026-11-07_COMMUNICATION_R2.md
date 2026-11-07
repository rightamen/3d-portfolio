# 消息慢网络加载补丁发布 — 2026-11-07

用户要求专门消息/动态入口，确认“好友直接聊天、其他人先发消息请求”，并要求完成后直接上线。
首版 de1929a / release-2026-11-07-communication 于 18:31:11 Asia/Shanghai 上线。
收尾修正首次/后续读取尚未完成时不重复轮询或聚焦刷新，避免慢响应持续被下一轮作废。
最终运行 11bfe2213d9a1be3583d142578928933895bf3bf，标签 release-2026-11-07-communication-r2，完成 2026-11-07 18:42:18 Asia/Shanghai。
两次均先推送 GitHub 与固定标签，再打包、备份、上线；首版证据保留。

/messages 有会话/请求、新消息搜索、双向文字聊天、时间/已读、长历史、接受/拒绝/重新接受与屏蔽管理。
非好友先发一条、接受后继续；好友直接聊天。失败保存原文与幂等键，首条已送达但响应丢失也可安全重试。
读回执失败补交，慢操作与慢加载不被刷新打断；换号不混入旧账号内容。
/following 汇总已关注公开创作者的作品、帖子、公告和已审核资源，分类/分页、当前实际条目已读与独立角标。
顶部常驻消息/动态图标，头像/手机菜单文字入口，主页/目录/作品作者栏/关系卡片可“发消息”。
三张增量表、visitor 私有读取/v1/no-store，原通知/认证保留。会话约 3 秒轮询，本批为文字私聊，无附件/语音/群聊/站外推送。

最终 build/lint、365 单测、117 完整浏览器检查通过。后端/schema 与首版一致，已有 254 完整临时库检查、
旧库升级/幂等、原 notifications 与双人 notification-journey 通过。
累计新增 13 DB、15 UI、3 输入边界测试；双人真实请求→接受→互发→已读→关注动态闭环通过。
含十秒慢读取、轮询/聚焦不重启请求、慢操作、响应丢失、读回执重试、换号隔离、三语手机/深浅主题。

补丁线上 19 页面 200、18 匿名私有读取 401、
HTTPS 22 项通过，零警告/失败；health/admin_summary/管理作品/举报队列、旧链接 301 与公开隐私均正常。
203 文件逐项匹配，13 上传与 env/nginx/systemd 不变；
20 张表（含首版新三表）在部署后与界面验收后完整指纹一致。
真实桌面/手机消息列表已等待实际空态/条目完成，再验证新消息搜索取消、动态与菜单和匿名门禁。
零页面异常/横向溢出，无生产测试对话/消息/动态已读；原关注/好友/收藏夹/举报/作品也未写。
临时 visitor/admin 会话已撤销并复核 401，本地/远端凭据文件移除，用户原登录保留。

制品 SHA-256 dd035ad592c0596340b2a27002d9b856b2afa00921cb2c7f4666dcb3293a041b，15,930,468 bytes。
新备份（UTC 命名）：
- /opt/mrright-portfolio.backup-20261107-104212
- /etc/mrright-portfolio.env.backup-20261107-104212
- /var/backups/mrright-portfolio/releases/before-11bfe22-20261107-104212.dump

全部旧备份保留，custom pg_dump 目录检查通过，未执行生产恢复演练。
细节 docs/COMMUNICATION_2026-11-07.md；首版 docs/RELEASE_2026-11-07_COMMUNICATION.md，
最终 docs/RELEASE_2026-11-07_COMMUNICATION_R2.md。
证据 .deploy-tools/communication-checks/、communication-r2-release/、communication-r2-deploy.log、
communication-r2-deployment.json、communication-r2-server-verification.json、communication-r2-final-data.json、
communication-r2-production-check.json、communication-r2-live-smoke-exit.json 和 release-communication-r2-20261107/。
上线结果另作文档提交，不为文档再次部署，main 可领先于实际运行提交。
