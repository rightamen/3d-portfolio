# 全站动效、创作者工作区与系统设置发布 — 2026-11-07

已按用户明确要求部署。先推送 GitHub 功能/文档和固定标签，再从干净提交构建制品、备份、切换与验收。

- 线上：https://mrright.blog
- 创作者工作区：https://mrright.blog/account
- 系统设置：https://mrright.blog/settings（公开）、https://mrright.blog/account/system（私人）
- 实际运行提交：70697f7820e1686be4ec73f98fbf9a8c4698d238
- 产品功能提交：96301199cd274a063f921370c0642e5decef8b50
- 固定标签：release-2026-11-07-interface
- GitHub：https://github.com/rightamen/3d-portfolio/tree/release-2026-11-07-interface
- 切换完成：2026-11-07 15:58:19 Asia/Shanghai（07:58:19 UTC）
- 版本查询：https://mrright.blog/release.json

发布结果随后另作文档提交，main 可领先于实际运行提交，不为文档再次部署。

## 发布内容

私人创作者中心改为固定侧栏、分组导航、快速筛选、手机抽屉和数据仪表盘。
/account 默认进入数据工作台，原概况移到 /account/overview，其余模块 URL 保留。
创作星图复用管理员后台的真实三维场景，支持拖拽、节点跳转、键盘入口与平面回退。

首页、发现、详情、社区、登录、作者主页、全部个人模块、管理后台接入统一动效。
界面设置提供八主题、自定义强调色、密度、三档动画、氛围光效、预览和重置。
偏好保存当前浏览器设备、同步同源标签；没有账号跨设备同步，也不写入作者公开主页主题。
系统减少动态优先，静态/轻柔自动简化，星图屏幕外暂停并按需加载。
完整行为与边界见 [界面与工作区](INTERFACE_WORKSPACE_2026-11-07.md)。

本批无服务端、API contract、数据库 schema 变更。既有访客和管理认证保持。

## 制品与备份

- 制品 SHA-256：6d2bbf62797ffc4bdcda333de9029fe6684249e2bf57d54d2a938f6c2e6b051e
- 制品大小：15,895,040 bytes；182 个发布文件逐项哈希匹配。
- 本地固定副本：.deploy-tools/interface-release/release-70697f7.tar.gz
- 程序备份：/opt/mrright-portfolio.backup-20261107-075813
- 配置备份：/etc/mrright-portfolio.env.backup-20261107-075813
- 数据库备份：/var/backups/mrright-portfolio/releases/before-70697f7-20261107-075813.dump

备份名按服务器 UTC；custom pg_dump 目录检查通过。程序硬链接备份、data 单独复制。
全部旧备份保留，上传目录与环境配置未覆盖，nginx/systemd 原配置保留。
环境必需键仅检查 [set]，没有输出凭据。

## 验证

发布前重新运行 build/lint、8 组制品回归、部署脚本语法及备份逻辑检查，全部通过。
功能同一批代码已经通过 358 单测、225 临时库集成检查、83 浏览器回归，真实 WebGL 拖拽通过。
功能提交后仅补文档，无新业务代码变更；打包入口重新构建并检查 sourceClean 与准确 Git 版本。

上线后服务 active，健康检查第 2 次成功；管理员汇总、管理作品均 200，短会话已撤销。
182 文件、13 个原有上传、环境/systemd/nginx 哈希保持一致。
九张业务表（works/work_assets/orders/order_events/work_ratings/work_likes/work_comments/visitor_users/work_favorites）
行数和完整数据指纹匹配；已存作者主题不变。实际基线作品/访客/管理员为 4/3/1，
评分/策展推荐/收藏为 0/0/0。未导入演示指标或精选评分。

公网 HTTPS 检查 22 项全部通过、零警告/失败，TLS 证书有效至 2027-02-01T18:48:41Z。
14 个页面返回 200（包含系统设置、工作区/概况/收藏），7 个匿名私有接口返回 401；
旧作品链接精确 301，公开用户/作品隐私与全部缩略图检查通过。

真实创作者临时会话通过实际 analytics/favorites/favorite 与严格 v1/private-no-store 检查；
1440/1280px 桌面和 390px 触屏检查通过。工作台真实指标、7/30 天趋势、WebGL 拖拽、
收藏状态、浅色主题/强调色、三档动画、刷新后偏好保持、手机抽屉导航均正常，
无页面脚本异常或横向溢出。线上截图为真实只读账号数据，没有写入演示数据。

10 分钟临时访客会话验收后按准确 token/user 条件撤销，旧凭据已确认返回 401。
管理校验会话通过正式接口交换并撤销；本地/远端临时凭据文件移除，保留用户原有会话。
验收后再次确认全部九张业务表指纹不变；没有写入收藏、订单、评分或作者主题。

## 回溯与边界

上一版实际运行 c113caf、固定标签 release-2026-11-07-creator，见
[上一版发布](RELEASE_2026-11-07_CREATOR.md)。本次应用备份就是切换前恢复点。
恢复程序时应保留持久上传、data 与配置；本批没有新增数据库结构。
数据库备份已验证目录，未在生产执行恢复演练。恢复数据库前须核对备份后的真实业务变化。

界面偏好是设备本地设置；此发布不新增访问量埋点、收藏分组或账户外观同步。
邮件实际送达、代理链 TRUST_PROXY_HOPS 核对与外部监控仍是既有待办，本次没有改配置。

## 验收证据（本地忽略目录）

.deploy-tools/interface-release/：构建、lint、制品/脚本/备份检查及固定制品。
.deploy-tools/shipping-interface.json、expected-release-files-interface.json；
interface-deploy.log、interface-deployment.json、interface-server-verification.json；
interface-production-check.json、interface-live-smoke.log、interface-live-smoke-exit.json；
release-interface-20261107/smoke.json 与桌面/手机截图。凭据文件不作为证据保留或提交。
