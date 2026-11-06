# 创作者工作台与收藏正式发布 — 2026-11-07

已按要求先确认 GitHub 提交、推送固定标签，再从干净提交打包、备份、部署和验收。

- 线上：https://mrright.blog
- 工作台：https://mrright.blog/account/dashboard
- 我的收藏：https://mrright.blog/account/favorites
- 实际运行提交：c113caff787243724b1e0975b4cbdf8e3e4568e4
- 产品功能提交：1d52a3e90929cd717c8a055e2aab49d16afa61e3
- 固定标签：release-2026-11-07-creator
- GitHub：https://github.com/rightamen/3d-portfolio/tree/release-2026-11-07-creator
- 部署完成：2026-11-07 00:34:45 Asia/Shanghai（2026-11-06 16:34:45 UTC）
- 版本查询：https://mrright.blog/release.json

运行提交包含已推送的产品与交付文档。发布结果随后另作文档提交，main 可以领先于
运行提交；固定标签和 release.json 用于判断真实线上版本，不为文档再次部署。

## 发布内容

创作者私人工作台、作品与互动汇总、多币种已确认成交额、待处理订单、
7/30/90 天 UTC 趋势/每日明细、分页作品表现。收藏/取消收藏、跨设备私人收藏列表，
下架内容使用不泄露草稿的占位。三语、键盘、手机及账号隔离齐全。

新增 work_favorites 表/索引，由正常启动增量迁移创建，已有作品/账号不重置。
私有接口沿用 visitor session，GET 为 private/no-store；后台 ADMIN_TOKEN 认证不变。
收藏不改变评分推荐和精选资格。统计口径与接口见
[功能专项](CREATOR_DASHBOARD_2026-11-06.md)。

本次制品也包含已提交的共享发布构建/版本清单/哈希校验和新版公网检查器。
GitHub 固定标签已在上传前推送。制品从干净 c113caf 重新构建，sourceClean=true。

## 制品与备份

- 制品：.deploy-tools/mrright-portfolio-release.tar.gz（约 15.15 MiB）
- SHA-256：c0c2469151481e8065b86aceb165826e1216a90e7669fb689ee81657d0559378
- 发布文件：181 个，全部与制品逐项哈希匹配。
- 前端入口：/assets/index-CsnUQDEQ.js
- 应用备份：/opt/mrright-portfolio.backup-20261106-163437
- 配置备份：/etc/mrright-portfolio.env.backup-20261106-163437
- 数据库备份：/var/backups/mrright-portfolio/releases/before-c113caf-20261106-163437.dump

备份名称采用服务器 UTC 日期，部署完成日期按 Asia/Shanghai 为 11 月 7 日。
制品先校验，再备份/替换程序；数据库使用 root 私有目录中的 custom-format pg_dump，
pg_restore --list 通过。应用硬链接备份并单独复制 data；BACKUP_RETAIN=0，全部历史备份保留。
配置、systemd 与 nginx 哈希一致；未重写环境变量、TLS 或账号设置。

## 验收结果

发布前复核 build/lint、8 组制品场景、部署脚本与备份检查通过；沿用本批代码已通过的
354 单测、224 临时数据库/API 检查、72 完整市场界面回归和旧库增量迁移/幂等。
后续仅有提交结果文档，没有新的业务代码变更。

上线后：

- 服务 active，健康检查第 2 次通过；admin_summary 和后台作品列表均 200。
- 181 个制品文件、环境/systemd/nginx、13 个上传文件校验一致。
- works/work_assets/orders/order_events/work_ratings/work_likes/work_comments/visitor_users
  八张既有业务表的行数与完整数据指纹在发布及交互验收后均保持一致。
- 作品/访客/管理员为 4/3/1，验收时评分/策展推荐/收藏均为 0；未给生产填充演示数据。
- 收藏表及索引存在；十套主题、账号保存主题指纹保持不变。
- 真实 HTTPS 公网检查 22 项通过、零警告/失败；证书有效至 2027-02-01T18:48:41Z。
- 11 个页面 200：首页、后台、社区、登录、账号、账号作品、发现、作品详情、
  作者页，以及新增工作台/收藏。旧项目 URL 精确 301 至 /w/mrright/md-leimu。
- 公开作品没有 qrUrl/methods，公开用户没有 email/internalId，已发布目录均有缩略图。
- 原四个通知/公告接口及 analytics、favorites、favorite 状态匿名访问均 401。
- 使用现有创作者的临时访客会话验证真实 analytics/favorites/favorite 状态、
  private/no-store、严格 v1 envelope。桌面指标与实际 API 一致，7/30 天切换可用。
- 真实 Chromium 桌面与 390px 触屏减少动态环境通过工作台、收藏列表、详情收藏状态检查，
  无横向溢出，页面脚本异常为 0。本轮未点击保存/移除，不修改用户真实收藏。

管理校验会话均通过正式接口交换并撤销。两轮访客验收均使用 10 分钟临时会话，
验收后精确撤销；保护接口已确认旧凭据返回 401。远端和本地临时凭据文件均移除，
用户自己的会话保留。首次浏览器探针过早检查按钮 enabled，改为等待收藏状态读取完成
后通过；期间未改变产品代码或重复部署，首次会话也已撤销。

## 回溯与边界

上一版运行提交 765242f、标签 release-2026-11-01-studio，文档及旧备份仍保留于
[上一版发布](RELEASE_2026-11-01_STUDIO.md)。本次应用备份是切换前版本的恢复点。
优先恢复应用，保持持久上传/数据目录与环境配置；新增收藏表为增量结构，旧程序可忽略。
数据库备份已做目录检查，未进行生产恢复演练；如需恢复，应先核对备份后的真实业务变化。

本轮数据库变更涉及增量结构及临时验证会话；原有账号资料、主题、作品、订单、评分或收藏未变。
未验证实际邮件送达；既有 TRUST_PROXY_HOPS 默认 1 的代理链核对与外部监控仍待推进。

## 本地验收材料（忽略目录，不上传凭据）

.deploy-tools/creator-deploy.log、creator-deployment.json、creator-server-verification.json；
creator-production-check.json、creator-live-smoke.log、creator-live-smoke-exit.json；
release-creator-20261107/smoke.json、dashboard-desktop.png、dashboard-mobile.png。
运行制品准备记录 shipping-creator.json，逐文件清单 expected-release-files-creator.json。
