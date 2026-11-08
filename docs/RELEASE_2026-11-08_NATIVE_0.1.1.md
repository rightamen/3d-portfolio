# Windows 0.1.1 与上传处理优化发布

源码：1763b5ddb06700e869705253cfd00ef00f7cce66；标签 native-studio-v0.1.1。已先推送 GitHub，再固定源码构建和部署。

发布页：[mrright Studio 0.1.1](https://github.com/rightamen/3d-portfolio/releases/tag/native-studio-v0.1.1)。

## 改进

- 上传任务可取消，已完成附件与草稿保留；取消与失败分开显示，等待停止时显示“正在取消”。
- 下载取消、截断和写入失败均保留原有目标文件，只有完整传输并成功关闭文件后才原子替换。
- 分类显示与实际条件在主题 / 语言切换后保持一致；全局 Ctrl+F / F5 / Escape 可从子控件使用。
- 修复搜索提示所需的公共控件清单；补齐深色设置标题栏 / 下拉框及 DPI 变化时的字体更新。
- 详情请求失败保留作品列表并提供重试，不再用详情错误替换整个列表。
- 3D 加载按钮显示准备状态并避免重复排队；过期预览不会弹出错误或污染当前作品。
- 刷新恢复连接状态，过期健康响应不会覆盖当前结果；三语显示连接情况。
- 无限展墙在中心静止时不重复重绘，关闭动效时停止自动平移。
- 服务端新增 uploadStorage，排他创建文件，源流异常 / 请求断开时清理自己创建的文件，不覆盖或删除碰撞的已有文件。适用于作品、社区和管理员磁盘上传。

## 验证

- npm run build / lint 通过。376 单测通过（新增 8 项存储测试）；267 隔离 DB API 用例通过。
- 76 项 C++ 公共目录检查通过。
- 原生 UI 测试通过：27 组语言 / 主题 / 1000、1280、1600 逻辑像素窗口组合，340 项检查。包括列表 / 详情错开、长文件名、筛选保留、搜索提示、快捷键、失败重试、连接恢复、过期结果、3D 去重和动效关闭 / 静止行为。
- 正式 EXE（revision=1763b5ddb06700e869705253cfd00ef00f7cce66）通过真实隔离账号的登录、中文双附件上传、审核发布、保护原件、指定附件逐字节下载、票据单次使用、退出失效。
- 预取消、中途取消及网络截断时原目标文件字节不变且无下载临时文件残留；完整传输正确原子替换。
- 直连测试后端取消上传：附件列表为空、草稿保留、上传文件数前后均为 3，无孤儿文件。
- 测试代理曾遗漏传播客户端断开，导致上游挂起；已修正，同时增加直连取消验证。没有把该代理现象直接当作线上服务的已证实缺陷。
- API 夹具改为独立临时服务器副本和上传目录，结束后只清理自己生成的临时目录和数据库，避免清理工作区真实上传。测试凭据文件已移除。
- 正式 EXE 线上只读检查通过：4 个真实作品、Draco / WebP / 图片解码、12,649 三角形模型、跨站 / 非法 origin 拒绝。
- computer-use 实际窗口验收：搜索提示可见、Ctrl+F 聚焦、搜索框中 F5 刷新、深色设置控件；已在本机启动正式 0.1.1。没有代用户登录真实账号。
- 未进行多显示器不同 DPI 之间的物理拖动实测；字体更新由 DPI 事件处理覆盖。

## 制品

Windows EXE SHA-256：3683911d023a687aee31d231c034e3a3e27cf7e2bed859933b9550e2c11e1b07。
Windows ZIP：1,732,253 bytes；SHA-256：42ec8a6c09899ed6ded8bdbf6e497bb0d7930875dc5e0dcac62a1237a19d0b7b。GitHub Release 的资产摘要已核对一致。
Web / Node 制品：15,942,208 bytes；SHA-256：d28d532e8e2ec2648f93e168d8a1017f5be033e004c6b331d0e570cfa23ddb38。

本机：D:/Codex/artifacts/mrright-studio/mrright-studio.exe；独立版本目录 D:/Codex/artifacts/mrright-studio-0.1.1；ZIP 同父目录。旧 0.1.0 ZIP 保留。依赖、编译运行库许可证、使用 / 测试说明与 release.json 随包提供。

## 部署与保护

Web / Node 更新于 2026-11-08 16:12:31 Asia/Shanghai，运行 1763b5ddb06700e869705253cfd00ef00f7cce66；线上 /release.json 与新增存储模块文件摘要核对一致。
C++ 目录服务继续运行 025cb969ad067f589260be366feef50a54cd775d；其二进制、配置、只读角色权限保持，未为桌面修复重复替换服务。

部署后：20 张业务表完整行摘要、13 个上传文件路径 / 摘要全部保持；原 Node / C++ 环境文件与 systemd、nginx 配置摘要一致；两个服务 active；健康检查、admin_summary 及 /admin、/community、/login、/account、首页、作者页正常。

新备份：

- /opt/mrright-portfolio.backup-20261108-081225
- /etc/mrright-portfolio.env.backup-20261108-081225
- /var/backups/mrright-portfolio/releases/before-1763b5d-20261108-081225.dump（pg_restore --list 通过）

基线 /var/backups/mrright-portfolio/native-opt-20261108-before.json；校验记录同目录 native-opt-20261108-verification.json。全部旧备份保留，没有生产测试上传或数据库恢复。回滚只恢复旧运行代码 / 依赖并使用旧桌面包，保留 data、上传与环境文件。

认证、消息、交易和完整后台仍按上一阶段边界沿用现有 API / 在线工作台，继续逐模块迁移。后续文档提交不重复部署。
