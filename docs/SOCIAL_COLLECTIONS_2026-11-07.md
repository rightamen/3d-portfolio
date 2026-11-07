# 关注、好友、举报与私有收藏夹 — 2026-11-07

用户要求加入关注、好友、举报以及自定义收藏夹。本轮从干净 main / 5192d52 接续，直接在 Ubuntu 开发。
本批新增功能尚未部署；实际线上仍为 70697f7 / release-2026-11-07-interface。

## 用户流程

- 创作者公开主页：关注/取消关注、加好友、接受/拒绝收到的申请、撤回发出的申请，已为好友时可确认解除。
- /account/connections：好友、关注、粉丝、收到/发出的申请与公开创作者搜索。
  关注是单向关系，互相关注不会自动成为好友；双方交叉申请也仍需接收者明确确认。
- /account/favorites：全部收藏保留，展开“管理收藏夹”可创建、编辑、筛选或删除私有收藏夹。
  作品既可在多个收藏夹，也可只在全部收藏中。详情和已收藏作品均可“整理到收藏夹”。
  删除收藏夹只移除分类；取消收藏则同时清理分类关系。
- 作品、公开创作者、社区帖子、两类评论和已通过审核的资源有举报入口。
  提交原因与线索后，在 /account/reports 查看处理状态和管理员说明。
- /admin 的“举报处理”：待处理/已处理/未采纳队列、内容链接、分类、说明与处理结果。
  处理说明明确对举报人可见；完成举报处理不会自动下架内容或封禁账号，仍由管理员核查内容。

没有新增私信、邮件提醒或推送通知。好友申请在关系管理中查看，既有通知流程未改。

## 权限与数据

新增五张表：user_follows、user_friendships、favorite_collections、favorite_collection_items、user_reports。
全部为增量、幂等建表/索引；原 work_favorites 数据保持，旧收藏无需迁移到“默认文件夹”。

关系、文件夹、举报私人列表绑定当前 visitor session，忽略调用者传入的其他用户身份。
私有 GET 使用 private/no-store；管理员队列沿用原 ADMIN_TOKEN/session 授权。
公开或管理隐藏的个人主页不出现在搜索中，既有关系列表只给安全占位，不返回其新资料。
已收藏的下架作品在文件夹内也只返回 unavailable 占位，不泄漏草稿标题或内容。

收藏夹与作品条目有双重组合外键：文件夹必须属于当前用户，作品必须已被当前用户收藏。
分类写入与删除使用行锁；收藏被并发移除时不会留下孤立分类。移除收藏不改变其他人的分类。
好友使用唯一的规范用户对、事务和锁；只有请求接收者可接受/拒绝，只有发起者可撤回。
好友解除、撤回或拒绝后，24 小时后可再次申请；新申请更换 ID，旧页面操作不能接受新申请。

举报对象必须在提交时公开可见；资源必须 approved、作品/作品评论必须 published。
客户端不能指定展示链接，链接由服务端从真实对象构造。用户不能举报自己的用户账号，不能修改他人的举报。
同一用户/对象的待处理举报去重；已处理后若有新问题可以再次报告。
管理员只处理 open 状态，重复/迟到决定返回冲突，防止覆盖另一管理员结果。

## 边界

- 每人最多 50 个私有收藏夹，名称 1–50 字符，简介最多 300 字符，同用户名称忽略大小写唯一。
- 作品分类为多选，保存与移除是明确的幂等状态；删除文件夹需界面确认并说明保留作品。
- 每人每天最多 100 个新好友申请、20 个举报；新写接口共享 120 次/10 分钟的 IP 限流。
- 搜索 2–60 字符，按用户名/昵称的字面子串匹配，不把百分号/下划线当通配符。
- 举报说明最多 2000 字符，“其他”至少 10 字符；管理员结果 1–1000 字符。
- 所有列表分页，数据变动导致末页为空时可返回上一页。失败提供重试并保留表单草稿。
- 对话框约束焦点、支持 Escape/遮罩关闭、恢复焦点和滚动；账号切换后迟到响应不进入新账号界面。
- 新模块支持中/英/日、390px 手机、深浅主题、作者主页主题，以及已有动效/静态模式。

## API

下列路径也由已有 /api/v1 重写入口提供严格 envelope，状态码/错误枚举沿用既有体系。

| 路径 | 方法与行为 |
| --- | --- |
| /api/users/:handle/relationship | GET 当前账号对公开用户的关注、好友状态和关注统计 |
| /api/users/:handle/follow | PUT {following:boolean} |
| /api/users/:handle/friend | PUT 发起好友申请，重复调用返回已有状态 |
| /api/account/friends/:id | PATCH {action:accept/decline/cancel/remove} |
| /api/account/following/:id | DELETE 取消当前账号对目标的关注，包括已不可见账号 |
| /api/account/connections | GET tab=friends/following/followers/incoming/outgoing，返回列表、各类计数和分页 |
| /api/account/people | GET q、page、limit，搜索公开主页 |
| /api/account/collections | GET 列表；POST {name,description} 创建 |
| /api/account/collections/:id | PATCH {name,description}；DELETE 文件夹 |
| /api/account/favorites | GET 新增可选 collection，旧查询保持全部收藏 |
| /api/account/favorites/:workId/collections | GET 当前作品的分类勾选状态 |
| /api/account/collections/:id/works/:workId | PUT {included:boolean} |
| /api/reports | POST {targetType:user/work/post/comment/workComment/resource,targetId,reason,details}；用户对象用 handle，其余用 ID |
| /api/account/reports | GET 本人举报和处理结果 |
| /api/admin/reports | GET status=open/resolved/dismissed、page、limit |
| /api/admin/reports/:id | PATCH {status:resolved/dismissed,resolution} |

举报原因：spam、harassment、copyright、inappropriate、fraud、other。

## 验证与交付

最终 build/lint、362 单测、240 完整临时库检查、94 完整浏览器回归，以及旧库增量升级/幂等全部通过。
新增 4 个输入边界单测、15 个真实数据库/API 检查、11 个浏览器检查；升级探针明确断言五表/字段/索引。
真实浏览器使用两个独立创作者上下文和管理员上下文，完成关注/申请、接受、收藏夹创建与归类、举报、
后台处理和用户查看结果，页面异常为零。桌面、三语手机、深浅配色与键盘操作的截图已检查。

回归修复了关注状态和计数字段重名、后台独立环境使用 Router 链接导致组件错误、归类刷新后焦点丢失、
文件夹计数刷新和空末页恢复；异步复选框测试改为按服务端确认后的状态断言，旧主题模拟加入关系状态。

证据在 .deploy-tools/social-checks/ 的 database-final、browser-final、migration-verified、unit/build/lint，
浏览器截图在 ui-final/；真实举报后台与用户结果截图在 test-results/ 的 social.db 实际链路输出。
本地预览副本 D:/Codex/artifacts/social-2026-11-07/，截图为受控测试数据，不代表真实用户关系和举报。
回归只使用受控浏览器数据和一次性 PostgreSQL，测试结束销毁。
本轮没有操作生产 SQL、配置或上传，没有新生产备份，也未建立生产关系或举报。
实际发布需先 GitHub，再固定制品、备份、升级并验收；上一版备份见 RELEASE_2026-11-07_INTERFACE.md。
