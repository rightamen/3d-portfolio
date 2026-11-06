# 创作者数据工作台与收藏 — 2026-11-06

本批始于 2026-11-06，完成验证于 2026-11-07（Asia/Shanghai）。

## 入口与界面

- 私人工作台：/account/dashboard，个人中心侧栏、顶部快捷按钮和头像菜单均可进入。
- 我的收藏：/account/favorites，个人中心侧栏和头像菜单提供入口。
- 作品详情新增“收藏作品 / 已收藏 / 取消收藏”，收藏后提供“我的收藏”快捷入口。
- 工作台采用独立的侧栏、指标卡、成交面板、双序列趋势和逐作品表现表。
  手机显示两列指标、单列面板，宽表在面板内滚动；中英日文案齐全。
- 新面板按需加载；账号切换时跟随现有 visitor token 重新挂载，迟到响应不覆盖新账号。
  页面支持加载、错误重试、空态、刷新、分页和键盘操作。

## 指标口径

- 作品总数、已发布/草稿/审核中/下架或驳回，均只来自当前账号的作品。
- 收到收藏、收到点赞：当前仍保留的记录数，撤销后减少，不代表历史累计新增。
- 评论只计公开状态。评分和用户推荐只计当前内容版本、已验证邮箱账号且排除作者本人，
  沿用现有精选展口径；收藏不参与精选入展资格。
- 下载是授权源文件下载发起记录，关联 download_events.project_slug = work:{id}。
  不是文件完成下载数、独立访客或浏览量，未合并旧项目下载日志。
- 订单总数包含全部状态；已确认订单只计当前 paid，待处理只计 pending。
  成交额汇总当前 paid 订单的金额快照，退款不计；按币种分别展示，不进行汇率换算。
- 趋势仅展示最近 7/30/90 天的新增订单与下载发起次数；按 UTC 日补齐零值。
  图表日期、筛选边界明确使用 UTC，包括数据库会话采用其他时区的情况。
- 累计卡片不随趋势范围变化。暂无浏览量埋点，不生成浏览量或增长百分比。
- 指标为刷新时的聚合读数，未新增轮询、长连接或持续空闲动画。

## 收藏规则与数据

新增 work_favorites(work_id,user_id,created_at)，以 work_id/user_id 为唯一主键；
user_id/created_at/work_id 索引支持个人分页。作品或账号删除时对应收藏级联清理。
迁移仅新增表和索引，已有作品和账号保持原样，重复启动幂等。

收藏归属于登录的 visitor account，跨设备持久化；不使用匿名 localStorage 冒充收藏。
PUT 明确要求 saved:true，重复或并发请求保留同一行与原收藏时间；DELETE 幂等。
只允许收藏已发布作品。下架后，私人收藏中保留不含作品内容的不可用占位，仍可移除；
不会泄露作者改为草稿后的新标题、描述或附件。作品真正删除后收藏随之清理。
收藏者名单不向作者或公众开放，创作者仅看到自己收到收藏的聚合数量。

## API（均使用 visitor Bearer session）

| 接口 | 返回 / 规则 |
| --- | --- |
| GET /api/account/analytics?days=30&page=1&limit=20 | analytics + pagination；days 仅 7/30/90，limit 最大 50 |
| GET /api/account/favorites?page=1&limit=24 | favorites + pagination；limit 最大 60，含不可用占位 |
| GET /api/works/:handle/:slug/favorite | {saved:boolean}，只读当前用户收藏状态 |
| PUT /api/works/:handle/:slug/favorite | body {saved:true}，保存当前用户收藏 |
| DELETE /api/account/favorites/:workId | {saved:false}，只移除当前用户收藏 |

私有 GET 返回 Cache-Control: private, no-store，未登录/无效会话均 401。
身份从服务端 visitor session 读取，query/body 中的 userId/creator 不改变数据范围。
现有 /api/v1 双挂载继续使用严格 data/pagination/error envelope，无新增错误码。
后台 ADMIN_TOKEN 认证、访客 token、原评分推荐和主题存储逻辑不变。

analytics 包含：generatedAt、timeZone、days、totals、revenue、series、works、total。
revenue 为 {currency,amountCents} 数组；series 为 {date,orders,downloads} 数组；
works 沿用安全作品摘要并附 metrics {favorites,likes,comments,downloads,paid}。
favorites 项为 {workId,savedAt,available,work}；不可用时 work=null，不返回草稿内容。

## 验证与发布状态

构建和 lint 通过，354 单测通过；旧库增量迁移/幂等通过。
完整真实临时库 API 检查 224 项通过（含 9 个新增工作台/收藏案例）；
完整市场浏览器回归 72 项通过（含 9 个新增界面案例）。
跨时区 UTC 边界通过，测试数据库均已销毁；无浏览器脚本异常、三语 390px 布局无横向溢出。

新增真实临时库测试覆盖鉴权、并发幂等、跨账号隔离、不可用占位、分页、
多币种/退款、版本评分过滤、零值日期补齐、UTC 边界、严格 v1，以及真实手机收藏流程。
前端检查覆盖失败重试、键盘收藏、账号迟到响应、末页移除、中英日手机布局、匿名引导。
受控界面截图使用测试数据，不代表线上真实指标。

本轮没有部署 VPS、执行生产 SQL、创建生产账号或修改真实收藏与评分。
线上仍为 765242f / release-2026-11-01-studio，既有备份见 RELEASE_2026-11-01_STUDIO.md。
上线前继续先提交/推送 GitHub，再备份数据库/应用/配置、生成干净制品和部署。
上线时首次启动会执行上述增量迁移。

## 修改范围

server/postgres/creatorStore.js、worksStore.js、schema.js、server/index.js；
src/components/CreatorDashboard.jsx、FavoritesPanel.jsx、FavoriteButton.jsx、AccountMenuBar.jsx；
src/pages/AccountPage.jsx、WorkDetailPage.jsx、src/lib/api.js、creatorCopy.js、i18n.js；
src/creator-console.css、main.jsx；数据库/迁移/市场界面/主题测试与相关项目文档。
