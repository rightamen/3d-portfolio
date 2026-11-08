# 2026-11-08 Windows C++ / 服务迁移第一阶段发布

用户已确认目标为 Windows 桌面，界面和后端逐步改写为 C++。此次交付原生 Win32 / Direct2D / OpenGL 客户端，并上线直接读取 PostgreSQL 公共投影的 C++20 服务。认证、写入、审核、交易、社交、消息后端仍经现有 Node API，完整后台仍由明确的在线工作台入口访问。迁移边界详见 ../native/README.md。

## 源码与制品

- 源码提交：025cb969ad067f589260be366feef50a54cd775d。
- 发布标签：release-2026-11-08-native-studio。先推送 GitHub，再构建 / 部署。
- Web / Node 运行提交与 C++ health revision 均为上述提交。后续发布记录提交不改变运行源码。
- Web 制品 SHA-256：ea30288d6352967f8d519fa3839972db6a16fd913bb9a918c8b91f03af1936bf。
- Debian 12 原机构建的 C++ 服务 SHA-256：fa87309a3494180b735f9f2049ffb1c1ac1579b11a0a3f2e45318b337b797718。
- Windows x64 EXE：5,816,291 bytes；SHA-256：5e8906ded36dd84555c9fc8c82c378d30234d40310dcf4ca8d53dced4a251dac。
- Windows ZIP：1,703,697 bytes；SHA-256：681863d068895ef84b4ab9b50b3840dda18d8d894116644a14ad83a0662c0a66。
- 本机交付：D:/Codex/artifacts/mrright-studio/mrright-studio.exe 与 D:/Codex/artifacts/mrright-studio-0.1.0-windows-x64.zip。附开始使用说明、迁移边界、依赖与编译运行库许可证、release.json。

## 验证结果

- npm run build / lint 通过；368 单元测试、267 隔离 PostgreSQL API 测试通过。
- 新 C++ API 在自动创建 / 销毁的独立 PostgreSQL 上通过 76 项检查：七类资源、分类、Unicode 搜索、分页、草稿不可见、管理员推荐 / 用户推荐阈值、评分版本、公开 DTO、原件及同 URL 别名遮蔽、只读角色、文件名安全。
- Windows EXE 实际请求隔离服务完成登录、两个中文文件流式上传、提交审核 / 测试管理员发布、选择指定原件下载、逐字节核对、票据单次使用、退出后的令牌失效。测试凭据配置已移除。
- C++ 解码真实 Draco GLB：12,649 三角形；普通 GLB：16,038 三角形。WebP 纹理成功解码。
- 使用 computer-use 技能在实际 Windows 窗口验收：资源库、分类、精选、详情、3D 拖动旋转、三主题设置、暖纸白即时切换、无限展墙。修复窄窗口详情叠放和按钮未绘制背景。
- 正式 EXE 通过线上 --self-test：cpp20、4 个真实作品、图片、Draco、模型纹理、64 位、外站 URL 与非法 origin 拒绝，revision 与发布提交一致。
- HTTPS 新旧目录公开作品 ID 完全一致；C++ 详情中的保护原件 URL 均为 null。已打开正式桌面版供用户查看，未自动登录用户真实账号。
- 运行时导入仅有 Windows 系统 DLL，GCC / winpthread 静态链接。用户无需 WSL、Node、Qt、编译器。

## 服务器变更与数据保留

- Web / Node 发布完成于 2026-11-08 14:36:39 Asia/Shanghai；随后安装并上线独立 C++ 服务。
- 新服务 mrright-native，二进制 /opt/mrright-native/releases/025cb969ad067f589260be366feef50a54cd775d/mrright-catalogue；current 指向该版本。
- 仅监听 127.0.0.1:4286。新的 /etc/mrright-native.env 权限 0600，独立 mrright_native 数据库登录角色只能 SELECT 两个公开视图；禁止访问 visitor_users / works / work_assets 基表。
- 只增加 native_public_works_v1 / native_public_assets_v1 视图；不修改任何已有业务记录。
- nginx 两处 server 仅插入 /api/native/v1/ location；去掉插入块后的配置 SHA-256 与部署前一致，原 TLS / 路由保持。
- 20 张业务表的完整字段 / 行摘要全部一致；13 个上传文件路径 / SHA-256 全部一致。
- 原 /etc/mrright-portfolio.env 和旧 systemd 单元摘要一致。两项服务 active，/api/health、admin_summary 及 /admin、/community、/login、/account、首页、作者页验证正常。
- 生产基线 /var/backups/mrright-portfolio/native-20261108-before.json；校验记录同目录 native-20261108-verification.json。均 0600，不包含凭据原值。

## 新备份与回滚

- /opt/mrright-portfolio.backup-20261108-063633
- /etc/mrright-portfolio.env.backup-20261108-063632
- /var/backups/mrright-portfolio/releases/before-025cb96-20261108-063632.dump（pg_restore --list 通过）
- 两处 nginx 各保留 .native-before-时间戳 备份；所有既有备份保留。

C++ 服务可独立停用，并恢复两处 nginx 插入前配置；原 Node 路由继续工作。回滚旧应用时只恢复 dist / server / scripts / package 与依赖，保留 data / public/uploads / 环境文件及备份。新增视图可保留，不需要恢复数据库或删除业务表。本次未执行生产数据库恢复。

## 后续阶段

认证与会话 → 资源写入 / 上传 / 审核 → 收藏与原生创作者数据后台 → 关注 / 好友 / 消息 / 动态 → 交易与原生管理端。各模块先做行为契约和权限验证，再独立替换；本次未将这些剩余模块冒称为已完成的 C++ 重写。
