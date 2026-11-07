# 关注、好友、举报与私有收藏夹发布 — 2026-11-07

按用户明确要求部署。先推送功能与文档提交、固定标签，再从干净版本构建、备份、增量升级和验收。

- 线上：https://mrright.blog
- 关注与好友：https://mrright.blog/account/connections
- 收藏与收藏夹：https://mrright.blog/account/favorites
- 我的举报：https://mrright.blog/account/reports
- 举报处理：https://mrright.blog/admin → 举报处理
- 实际运行提交：f55bb98cb3e8ac6206e1970e7a00a2438609cf91
- 产品功能提交：befdbea56056c84c2e14fdd30c416471bdd56aac
- 固定标签：release-2026-11-07-social
- GitHub：https://github.com/rightamen/3d-portfolio/tree/release-2026-11-07-social
- 部署完成：2026-11-07 17:09:53 Asia/Shanghai（09:09:53 UTC）
- 版本查询：https://mrright.blog/release.json

发布结果另作文档提交，main 可以领先于运行提交；不为文档再次部署。

## 发布内容与结构升级

公开主页关注/取消关注、好友申请及接收者明确确认；个人关系管理与公开用户搜索。
举报入口覆盖用户/作品/帖子/评论/审核资源；举报人查进度，管理员人工处理并记录可见说明。
自定义私有收藏夹可创建、编辑、筛选、删除及多重归类；删除文件夹保留收藏作品。
新页面保留三语、深浅主题、动效/静态和手机支持。完整行为、权限和接口见
[社交与收藏夹](SOCIAL_COLLECTIONS_2026-11-07.md)。

正常启动增量创建五表：user_follows、user_friendships、favorite_collections、
favorite_collection_items、user_reports，以及相关索引；不重置账号、作品或既有收藏。
已确认五表、七个关键索引均存在，收藏夹条目保留两个组合外键来绑定所有者。

关注/好友/举报和收藏夹初始均为空；验收不向生产写入演示关系、举报、分类或评分。
既有 visitor session 和 ADMIN_TOKEN/session 认证保持。没有新增私信、邮件或推送。

## 制品和备份

- 制品 SHA-256：de20974994512d1a85034bea43102f0981bfb465add8fa268ea186deaceeed92
- 制品：15,910,020 bytes，195 个发布文件逐项哈希匹配。
- 固定本地副本：.deploy-tools/social-release/release-f55bb98.tar.gz
- 应用备份：/opt/mrright-portfolio.backup-20261107-090946
- 配置备份：/etc/mrright-portfolio.env.backup-20261107-090946
- 数据库备份：/var/backups/mrright-portfolio/releases/before-f55bb98-20261107-090946.dump

备份名采用服务器 UTC；custom-format pg_dump 的目录检查通过。应用硬链接备份，data 单独复制。
保留所有历史备份和上传，不覆盖环境、nginx、systemd 或 TLS 配置；必需环境键只检查 [set]。

## 验证

发布前重新通过 build/lint、八组制品回归、部署脚本与备份检查。
相同业务代码已通过 362 单测、240 完整临时库检查、94 浏览器检查及旧库增量升级/幂等。
真实临时库测试包含两个创作者与管理员独立上下文的完整写入流程；发布前未再改业务代码。
制品由准确 Git 清单重新构建，sourceClean=true，固定标签早于上传推送。

服务 active，health 第 2 次通过；admin_summary、管理作品和举报队列接口均 200。
195 发布文件、13 原上传文件、环境/nginx/systemd 哈希一致。
works/work_assets/orders/order_events/work_ratings/work_likes/work_comments/visitor_users/work_favorites
九张既有业务表的行数和完整数据指纹匹配；作者保存主题保持。
验收基线作品/访客/管理员 4/3/1，评分/策展推荐/收藏 0/0/0。

公网 HTTPS 检查 22 项全部通过，零警告/失败。16 页面返回 200、14 匿名私有读取返回 401，
旧作品链接精确 301；公开用户/作品隐私与已发布缩略图正常。连接/收藏夹/举报 GET 为 private-no-store，
对应 /api/v1 严格 envelope 正常，自身关系状态与五类关系列表均正确。

真实创作者和管理员短会话通过桌面与 390px 手机验收：关系列表与公开用户搜索、私人收藏夹/举报读取、
新建收藏夹表单（填写后取消）、举报表单（未提交）、后台三种举报队列、手机侧栏和匿名关注登录入口。
无页面脚本异常或横向溢出。五张新增表在验收后仍为 0 行，九张既有业务表指纹再次保持一致。
未创建好友、关注、举报、收藏夹，未修改真实作品、收藏、订单、评分或作者主题。

访客会话 TTL 10 分钟，按精确 token/user 条件撤销；管理会话通过正式接口交换/撤销，
均确认旧凭据返回 401，用户原有会话保留，本地与远端临时凭据文件移除。
首轮探针的异步计数未 await，修正验收等待后通过；没有修改产品或重复部署，首轮会话亦已清理。

## 回溯与边界

上一运行版本 70697f7、标签 release-2026-11-07-interface，详见
[上一发布](RELEASE_2026-11-07_INTERFACE.md)。本次应用备份是切换前恢复点。
优先恢复应用并保留持久上传、data 与环境；新增社交表为增量结构，旧程序可忽略。
不删除新表或回填清空数据。数据库备份已验证目录，未做生产恢复演练；恢复前须核对备份后真实业务变化。

好友申请在关系管理查看，无新增私信/推送；收藏夹目前私有。
界面偏好仍为设备本地。浏览量埋点、代理链/外部监控和实际邮件送达仍是既有待办，本次不改配置。

## 验收证据（本地忽略目录）

.deploy-tools/social-release/ 的构建/lint/制品/脚本/备份检查和固定副本；
shipping-social.json、expected-release-files-social.json、social-deploy.log、social-deployment.json；
social-server-verification.json、social-production-check.json、social-final-data.json；
social-live-smoke.log、social-live-smoke-exit.json、release-social-20261107/smoke.json 与真实桌面/手机截图。
临时凭据不作为验收材料提交或保留。
