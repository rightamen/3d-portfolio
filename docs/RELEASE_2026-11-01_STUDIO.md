# 个人展厅、主题与动效发布 · 2026-11-01

已按用户要求完成先提交/推送 GitHub，再备份与部署线上。

- 部署代码：765242f92cbe6147fdaa45bc861a07cfe635f41b
- GitHub：https://github.com/rightamen/3d-portfolio/commit/765242f92cbe6147fdaa45bc861a07cfe635f41b
- 固定标签：release-2026-11-01-studio
- 标签：https://github.com/rightamen/3d-portfolio/tree/release-2026-11-01-studio
- 线上：https://mrright.blog
- 完成时间：2026-11-01 21:48:55（Asia/Shanghai）
- 公网版本清单：https://mrright.blog/release.json

main 与标签原子推送成功后，才从干净提交生成发布制品。28 个文件、
2124 行新增/317 行删除的完整产品改动包含于上述发布提交。
本发布结果作为独立后续文档提交，固定标签不移动，也不为文档再次重启服务。

## 发布内容

- /u/:handle 个人无限展墙、完整作者目录分类/分页/重试、资料与动态重构。
- 10 套创作者深浅主题，个人页临时试选、账号设置实时草稿/微调/显式保存，
  主页、作品墙和作品详情使用统一色板，中英日支持。
- 个人页滚动入场、横幅视差、吸顶标签/进度和返回顶部；
  首页、发现、详情、社区、账号/登录说明的分批入场与局部柔光反馈。
- 动效遵循减少动态、触屏与键盘要求，路由/节点退出清理，无空闲动画循环。
- 主题 API 增加 presets、三语选项与七种派生色板变量；原三字段存储和访客 token 授权保留。
  无 schema 变更，没有写入演示主题、评价或推荐数据。

专项说明：CREATOR_STUDIO_2026-11-01.md、CREATOR_THEMES_2026-11-01.md、
CREATOR_SCROLL_2026-11-01.md、MODULE_EFFECTS_2026-11-01.md。

## 制品和备份

- 制品 SHA-256：fcc36b0507880129ad9d7791e2628f377572578eb0820226d2321434274761ec
- 前端入口：/assets/index-Cv4GO5MF.js
- 176 个发布文件全部与制品一致；公网版本与入口一致。
- 应用备份：/opt/mrright-portfolio.backup-20261101-134849
- 配置备份：/etc/mrright-portfolio.env.backup-20261101-134848
- 数据库备份：/var/backups/mrright-portfolio/releases/before-765242f-20261101-134849.dump

数据库备份为 root 私有目录中的 custom-format pg_dump，pg_restore --list 校验通过。
应用采用既有硬链接备份，data/ 独立复制；备份裁剪关闭，全部历史备份保留。
环境、systemd、nginx 文件哈希与部署前一致，未重写 TLS 或账号配置。
13 个原有上传文件存在且哈希不变，全部用户已保存主题的原始指纹不变。
作品/访客/管理员维持 4/3/1，评分和策展推荐维持 0/0；后续数量以实时数据为准。

## 验证结果

发布前 build/lint、部署脚本语法和备份文件系统检查通过。
最近完整 351 单测、63 浏览器回归及主题阶段 215 项真实临时库检查通过；
临时库已清理，后续前端动效未引入新的数据库变化。

发布后：

- 服务 active，健康检查第 2 次通过；admin_summary 与管理员作品列表均 200。
- 部署及后续核验的短期管理会话均撤销，用户自己的登录会话未改动。
- 首页、后台、社区、登录、账号、账号作品、发现、作品及创作者页均 200。
- GET /api/theme-options 返回全部 10 套主题与三语标签；用户主题存储未变。
- 旧 /projects/md-leimu 正确 301 到 /w/mrright/md-leimu。
- 目录均有 thumbnail；公开作品无 qrUrl/methods，创作者无 email/internalId。
- 四个通知/公告接口匿名均为 401。
- 公网真实 Chromium 桌面验证无限个人展墙、10 套主题入口、浅色试用与恢复、
  吸顶导航/回顶、目录柔光/详情、后台登录入口及公共动效。
- 新建隔离上下文核验 390px 手机首页/个人页/发现/社区/详情/登录；
  无溢出、零页面脚本异常，减少动态模式生效，生产没有精选演示提示。
- 保留既有 TRUST_PROXY_HOPS 默认值提示，未调整代理链或邮件配置。

仅做前端临时主题试用，未向生产账号保存主题或发送评分、订单、公告。
API 持久保存/账号隔离由真实临时库覆盖，不将其等同生产业务写入验证。

## 回溯

固定标签定位完整代码，release.json 定位实际运行提交。回滚程序时使用本次应用备份，
保留当前 data、public/uploads 和 env；无 schema 变更，不要仅因回滚程序就恢复数据库，
以免覆盖发布后新增业务数据。

忽略目录 .deploy-tools/ 保存 studio-deploy.log、shipping-studio.json、
studio-deployment.json、studio-verification.json、checkpoint-public-studio.json 和
release-studio-20261101/ 浏览器结果/截图。环境与数据库备份不进入 GitHub 或发布包。
