# 双通道高分精选展 — 2026-11-01

用户明确指定顶部 3D 画框展厅，并要求同时支持用户推荐与管理员推荐。本轮将其与下方普通作品无限墙分开。

## 入展规则

仅已发布作品可入展，任一通道达标即可：

1. 用户通道：当前版本平均分至少 4.5/5，有效评分至少 10 份、推荐至少 10 份。仅已验证邮箱账号的评价计入统计；每账号每作品只有一行评价，修改通过 UPSERT 替换。作者不能评价自己的作品；至少 4 星才能勾选推荐。均分包含所有有效评价，包含没有推荐的低分评价；用未取整的均分判定，4.45 显示为 4.5 也不能入展。
2. 策展通道：管理员评分 0–100，达到 90 分且明确勾选推荐。非管理员不能修改；尚未发布的作品不能被推荐。

阈值暂按上述默认值实现，公开与后台均明确说明。所有现有作品默认没有策展评分、不被推荐，没有虚构旧作品评价。用户通道不依赖管理员勾选；取消策展推荐也不会取消已经成立的用户推荐。平台隐藏作品可移出任何来源的展览。

## 产品与权限

- 顶部增加高分精选说明，分别标注用户/策展来源和评分。没有符合条件的作品则显示待展，不从普通目录补位，不显示无效的浏览控制。
- 首页独立请求服务端筛选的精选列表，避免只看最新 12 件而漏掉旧佳作；前端也再次执行同一资格规则，兼容旧服务端忽略参数时的空展降级。
- 作品详情增加评分与推荐入口；后台目录分组增加“精选展管理”，支持分页、状态筛选、评分和推荐。
- 下方无限作品墙继续展示普通已发布作品。
- 内容字段、附件新增/删除会推进 contentVersion，清除策展推荐，旧用户评价不再计入当前版本。管理员与用户提交必须携带自己评阅的版本；页面发现评分版本比所展示作品更新时禁用提交，避免评价未见的新版本。
- 附件变动与资格撤销使用同一事务/语句；上传失败回滚不会撤销原有资格。隐藏作品始终由发布状态过滤。
- 无 WebGL 图片降级、既有 3D 交互、访客 token、后台 ADMIN_TOKEN 登录保持原有边界。文案齐全 zh/en/ja。
- 邮箱验证加唯一账号计票不等于现实身份认证；本轮未新增更强的反多账号机制。

## API 与存储

- GET /api/works?exhibition=true：严格筛选并按推荐分排序；普通目录参数和语义保留。
- GET /api/works/:handle/:slug/rating：公开汇总，登录者另返回自己的当前版评价。
- PUT 同路径：登录且邮箱验证，提交 score(1–5)、recommended(boolean)、version(integer)。
- PATCH /api/admin/works/:id/curation：管理员提交 score(0–100 或 null)、recommended、version。
- 作品 DTO 新增 contentVersion、ratings{count,average,recommendations}、curation{score,recommended,reviewedAt}。
- 增加 works 的 curation_score、exhibition_recommended、curation_updated_at、rating_version 及索引；新增 work_ratings，唯一键(work_id,user_id)，含 work_version。
- 迁移为增量、可重复执行，旧作品保持未评选；已随 release-2026-11-01 在生产完成初始化。

核心文件：server/exhibition.js、server/index.js、server/postgres/{schema,mappers,worksStore}.js；
src/components/{WorkRatings,SpatialGallery}.jsx、src/components/admin/AdminCurationSection.jsx；
src/{App,Admin}.jsx、src/sections/Hero.jsx、src/pages/WorkDetailPage.jsx；
src/lib/api.js、站点/后台文案、后台导航、src/studio.css。
验证增加 tests/api/exhibition.db.spec.js、tests/review/marketplace.spec.js 与迁移脚本断言。

## 验证与状态

- 最终 build/lint 通过；348 单测通过（文案/导航新增后验证）。
- 临时数据库完整 214 项通过，新增 11 项涵盖两条通道、未验证/自评/匿名拒绝、重复与并发更新、均分边界、推荐撤回、版本失效、伪造字段拦截、附件失败回滚、后台真实浏览器评选与手机用户评分推荐全流程。临时库已销毁，未连接生产库。
- 完整 38 项本地浏览器回归通过；最后空展控件收整后 3 项相关回归再次通过。
- 从 HEAD 旧 schema 升级，有实际旧作品行，默认不入展，二次运行幂等，检查通过。
- 中英日桌面、390px 双推荐来源和手机沉浸视图无溢出、0 脚本异常。选中作品布局截图使用仅限测试的合成评分；未写入真实作品。截图在忽略目录 .deploy-tools/curation-ui/。
- 公开只读设计预览 http://localhost:5174/ 支持仅本地的演示覆盖，不提供真实评分或管理写入。线上已提供真实评分及后台评选接口，现有作品默认尚未评选。

已提交并上线于 c6d3334（release-2026-11-01）。应用、配置、数据库均先备份后部署，增量 schema 初始化通过；未写入演示评分。实际版本与备份路径见 RELEASE_2026-11-01.md。


## 后续：本地演示精选

用户随后要求先添加作品查看效果。5174 的只读预览现通过忽略目录
dev/exhibition-demo.json 临时选入长剑、雷姆和祭坛烛台三件作品，
模拟两种推荐来源。前端只在开发环境识别 previewDemo，并显示三语演示提示。
这些分数和票数不代表真实评价，未写入生产或开发数据库；不改变入展门槛，
配置和样本已纳入 GitHub，仍不会进入生产发布包。npm run dev:showcase 启动只读预览；设 enabled=false 即读取真实精选目录。
build/lint、348 单测以及桌面 3D/手机演示展示检查通过。
