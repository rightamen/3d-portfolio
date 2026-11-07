# 多格式资源发布上线记录 — 2026-11-07

## 固定版本

- 功能提交：[5edf2bdcd18c3e43dc2c60048225e3c770c24d99](https://github.com/rightamen/3d-portfolio/commit/5edf2bdcd18c3e43dc2c60048225e3c770c24d99)
- 发布标签：release-2026-11-07-resources。
- 部署完成：2026-11-07 23:16:07 Asia/Shanghai（15:16:07 UTC）。
- 线上：https://mrright.blog；发布入口 /account/works，筛选 /explore。
- GitHub 提交和标签先于打包、上传、备份与部署。制品源码干净且固定在该提交。
- 制品 SHA-256：9effe3132d182200bc8f4f812a915bfc0673a0d84450c166b060928d490b0ab2，15,940,926 bytes，206 文件。
- 本记录为部署后的文档提交；不为文档重新部署，main 可领先于线上运行提交。

## 功能与验证

七种资源类型、批量上传、按类型公开预览、受保护原件及逐文件下载、资源筛选，详见 [RESOURCES_2026-11-07.md](RESOURCES_2026-11-07.md)。
旧模型、审核和高分精选门槛保持；文件列表只淡入，保证鼠标点击稳定，发布器深浅主题和手机布局已核对。
视频/音频使用浏览器播放器，无服务器转码；本批不扩展社区或私聊附件。

- build/lint，368 单测、264 完整一次性库检查、127 完整浏览器检查通过。
- 从 b3d2ee0 的旧库升级和重复启动通过；原 notifications 与双人 notification-journey 通过。
- 真实 PNG/WebM/WAV 上传、浏览器媒体解码、逐字节原件下载、原件保护、付费/跨作者拒绝、选定资产票据绑定、范围请求、筛选等通过。
- 资源页面额外重复 30 次通过；制品追溯8场景、部署脚本语法和真实备份逻辑检查通过。
- 生产19条页面200、18条匿名私有读取401，旧链接301，严格v1和公开隐私正常。
- 公网HTTPS22项通过，0警告、0失败。health、admin_summary、管理作品和举报队列正常。
- 生产七种资源筛选、非法类型400、旧作品model默认值，桌面/390px手机发布器与视频上传入口、筛选和溢出检查通过；零页面异常。
- 生产未创建/保存作品，未上传夹具，未换作品类型，未下载生成事件；消息/动态已读、关注/好友/收藏夹/举报也未写。上传和播放闭环在本地隔离数据库完成。

## 数据与存储保全

206 个制品文件逐项摘要匹配；13个原上传文件无缺失/变化，env、nginx、systemd摘要不变，十种主题和作者已存主题保持。
代理 client_max_body_size 保持130m，可容纳120MiB资源及multipart开销，无新增环境变量。

部署后及界面验收后，对20张既有业务表的原有字段逐行规范化摘要均一致。
新 resource_type 不计入旧字段摘要，单独逐作品核对默认model，避免把增量列自然引起的JSON变化误判为数据变动。
资源类型列、video/audio资产约束、票据asset外键和两项索引均存在。
原有4作品、3访客、1管理员、1收藏保留；社交/私聊/动态表仍为空。

界面验收以已有mrright账号的10分钟临时visitor会话和正式临时admin会话完成；
visitor按hash/user精确撤销，admin通过正式接口撤销，均复核旧凭据401，本地/远端临时凭据文件移除。用户原登录不受影响。

## 备份

本次备份在替换应用、启动增量升级之前完成，保留所有旧备份（UTC命名）：

- 应用：/opt/mrright-portfolio.backup-20261107-151601
- 环境：/etc/mrright-portfolio.env.backup-20261107-151601
- 数据库：/var/backups/mrright-portfolio/releases/before-5edf2bd-20261107-151601.dump

数据库custom pg_dump目录验证通过，未对生产执行恢复演练。应用替换保留data、public/uploads、环境文件及旧备份，不重写nginx/systemd。

证据保存在忽略目录 .deploy-tools/resources-checks/、resources-release/、
resources-deployment.json、resources-artifact.json、resources-server-verification.json、
resources-final-data.json、resources-production-check.json、resources-live-smoke-exit.json 和 release-resources-20261107/。
文档与证据不保存认证凭据。
