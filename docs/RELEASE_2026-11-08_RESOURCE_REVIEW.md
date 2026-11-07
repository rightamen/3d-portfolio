# 资源后台与布局修复上线记录 — 2026-11-08

## 固定版本

- 功能提交：[c2ed458198f5d382b95a96570a1be7a5cf7a6d93](https://github.com/rightamen/3d-portfolio/commit/c2ed458198f5d382b95a96570a1be7a5cf7a6d93)。
- 发布标签：release-2026-11-07-resource-review（11月7日开始的任务批次）。
- 部署完成：2026-11-08 00:00:55 Asia/Shanghai，即2026-11-07 16:00:55 UTC。
- GitHub提交/标签先于制品、上传、备份和上线，工作区干净且制品固定源码。
- 制品：207文件，15,941,059 bytes，SHA-256 839687afe3c7693e5d68e06d0db01b95a7f75fe8fe56d37530eb030c4c763082。
- 本记录为部署后的文档提交，不为文档重部署；运行源码仍固定c2ed458。

## 结果

[RESOURCE_REVIEW_2026-11-07.md](RESOURCE_REVIEW_2026-11-07.md)记录功能与API变更。

首页资源类型与3D细类分开；用户后台类型/状态服务端筛选分页；管理员新增资源审核，接入私有详情、预览、分类调整和审核动作。
精选展也可按类型筛选。非模型有实际文件后可提交审核，空作品继续拒绝。
版本冲突返回409，分类修改清除旧版精选推荐。原身份验证、公开草稿门禁、原件保护与入展门槛不变。

标题/分类条之间留出明确间距，文件列表按实际侧栏容器宽度分行；长文件名、大小、用途、操作不会互相挤压。
文件用途三语显示，规格断行，浅色界面内的固定深色展墙标题保持对比度。

## 验证

- build/lint、368单测、267完整隔离DB检查通过（新增3项）。
- 135完整UI回归通过；收尾修改限于资源模块，再用最终构建跑18项资源UI回归通过。
- 真实管理员界面修正视频类型、解码预览、发布，创作者在后台筛选该作品，独立公开访客实际播放均通过。
- DB同时验证新接口权限、筛选先于分页、账号隔离、分类/审核旧版409、策展失效和原件保留。没有新schema、依赖或环境变量。
- 生产207文件摘要全部匹配，health、admin_summary、管理作品和举报队列正常。
- 公网HTTPS22项通过，0警告/0失败；19页面200、18匿名私有读取401、旧链接301和公开隐私/v1保持。
- 生产新“资源审核”实际打开，类型/状态筛选、分类表单本地试选取消、私有详情与手机布局通过；用户后台筛选及发布器通过。
- 首页和详情在1440/1024/768/390宽度检查实际元素矩形无重叠、整页无横向溢出。另等待实际封面decode后完成四宽度公开详情截图，避免把未加载图像的截图当作最终效果。
- 零页面异常；生产无作品/分类/审核写入、无测试上传/下载事件；消息/已读/关注/好友/收藏夹/举报也未写。
- 临时visitor/admin会话已精确撤销并复核旧凭据401，本地/远端临时凭据文件删除，用户原登录保留。

## 数据与备份

20张业务表的既有字段摘要在部署后及界面验收后均一致，resource_type另按作品核对保持model；旧4作品、3访客、1管理员、1收藏保持。
13个上传文件无缺失/变化；env、nginx、systemd、作者存储主题与十种主题选项保持。

应用替换前完成备份（名称使用UTC日期/时间）：

- /opt/mrright-portfolio.backup-20261107-160048
- /etc/mrright-portfolio.env.backup-20261107-160048
- /var/backups/mrright-portfolio/releases/before-c2ed458-20261107-160048.dump

custom pg_dump目录验证通过，未对生产执行恢复演练。data、public/uploads、环境文件与全部旧备份保留；nginx/systemd不重写。

证据：.deploy-tools/resource-review-checks/、resource-review-release/、resource-review-deployment.json、
resource-review-artifact.json、resource-review-server-verification.json、resource-review-final-data.json、
resource-review-production-check.json、resource-review-live-smoke-exit.json和release-resource-review-20261107/。
截图和日志不包含认证凭据。
