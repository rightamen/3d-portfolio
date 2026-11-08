# mrright Studio · 原生创作工作台 0.2.0

Windows x64 原生客户端 + C++20 公共资源目录服务。界面由 Win32、Direct2D/DirectWrite 绘制，模型由本地 OpenGL 渲染。没有 WebView、Electron 或网页套壳。

## 本阶段可用

- 七类资源浏览、中文搜索、服务端筛选和分页，独立 3D 模型细分类。
- 管理员 / 用户评分门槛控制的精选展览；鼠标引导、拖动的无限展墙。
- 资源详情、图片缩放、GLB/Draco 模型旋转 / 缩放 / 平移、线框与材质切换。
- 原生账号登录、我的作品、创建草稿、批量上传原件、上传封面 / 预览、提交审核。
- 选择具体附件下载、受保护的单次下载票据、进度与取消、打开下载目录。
- 中文 / English / 日本語，石墨青绿 / 午夜蓝 / 暖纸白主题，动效开关。本机设置持久化，登录令牌只在内存中。
- 视频 / 音频的公开预览可交给 Windows 默认播放器。原件不会自动执行。
- 原生创作者工作台：真实统计、7 / 30 / 90 天趋势、动态星图与逐作品表现。
- 私人收藏库与自建收藏夹：新建 / 改名 / 删除、按收藏夹筛选、加入 / 移除作品。
- 好友、关注、创作者发现、申请接受 / 拒绝 / 撤回与解除好友；原生资料编辑。
- 原生消息中心、消息请求、聊天历史、草稿、屏蔽、已读与未读提示；关注动态和购买 / 销售记录。

## 迁移边界

| 模块 | 当前实现 |
| --- | --- |
| 桌面界面、网络、上传 / 下载流、文件对话框 | C++ 原生 |
| 公开目录 / 类型筛选 / 分页 / 精选资格 / 公开详情 | C++20 + libpq + PostgreSQL 只读视图 |
| 密码与会话、发布写入、审核、订单、社交、消息和通知 | 沿用经过验证的现有 Node API，后续逐模块迁移 |
| 创作者数据、收藏夹、好友 / 关注、消息、动态、资料、订单列表界面 | C++ 原生，调用现有私有 API |
| 管理后台、社区编辑、支付 / 收款确认与完整账号安全操作 | 尚未迁移到桌面，现有网站继续提供 |

这是逐步迁移中的可运行版本，**不是整个平台已经全部改写为 C++**。既有网站继续独立运行；原件权限、访客令牌和管理员授权规则保持。

渲染范围是静态 GLB 的网格、节点变换、基础材质和内嵌 PNG/JPEG/WebP 贴图；支持 Draco。暂不支持骨骼动画、完整 glTF PBR/IBL、外部纹理、稀疏 accessor 和所有模型格式。不可预览的资源仍可按权限下载原件。

## 构建

依赖归档和单头库的固定版本、SHA-256 见 third_party/sources.json；许可证随桌面包发布。

Ubuntu 构建服务：

~~~sh
cmake -S native -B native/out/server -G Ninja -DMR_BUILD_DESKTOP=OFF -DCMAKE_BUILD_TYPE=Release -DMR_REVISION=SOURCE_SHA
cmake --build native/out/server --target mrright-catalogue -j2
~~~

Windows x64 交叉编译（Ubuntu 安装 cmake、ninja-build、g++-mingw-w64-x86-64-posix）：

~~~sh
cmake -S native -B native/out/windows -G Ninja -DCMAKE_TOOLCHAIN_FILE="$PWD/native/cmake/mingw64.cmake" -DMR_BUILD_SERVER=OFF -DMR_BUILD_DESKTOP=ON -DCMAKE_BUILD_TYPE=Release -DMR_REVISION=SOURCE_SHA
cmake --build native/out/windows --target mrright-studio -j4
~~~

首次构建会下载固定版本的 Draco 和 libwebp，可用 MR_DRACO_ARCHIVE / MR_WEBP_ARCHIVE 指向已校验的本地归档。GCC 运行库静态链接，用户无需安装 WSL、Node、Qt 或编译器。需要 Windows 10/11 x64，系统 Direct2D、WinHTTP 和 OpenGL。

## 服务部署

默认监听 127.0.0.1:4286。环境项 NATIVE_DATABASE_URL 使用独立只读角色；NATIVE_PORT 可选。只授予 native_public_works_v1、native_public_assets_v1 的 SELECT 和 public schema 的 USAGE。禁止给该角色基表读取 / 写入、角色管理权限。管理者执行 sql/public_views.sql 创建增量视图，不修改业务记录。

nginx 将 /api/native/v1/ 转发给独立进程，旧 /api/ 路由继续交给原服务。systemd 模板见 deploy/mrright-native.service。旧站点环境文件不得覆盖。

健康检查 GET /api/native/v1/health 返回 runtime=cpp20 和构建源码 revision，数据库不可用时 503。目录 GET /api/native/v1/works 支持 resourceType、category、q、creator、page、limit、exhibition=true；详情 GET /api/native/v1/works/:handle/:slug。

下载原件 URL 永不出现在公共 C++ DTO；同 URL 的预览别名也会遮蔽。桌面使用既有经过权限校验的下载票据接口。模型解码在独立子进程中执行，有 512 MiB 进程内存上限及 30 秒超时；失败不应阻塞主窗口。

## 验证

~~~sh
cmake -S native -B native/out/test -G Ninja -DMR_BUILD_DESKTOP=OFF -DMR_BUILD_MODEL_TESTS=ON
cmake --build native/out/test --target mrright-catalogue mrright-model-tests -j2
native/out/test/mrright-model-tests public/models/fire-extinguisher-4k.3fa834b2.glb public/models/tenhun_falling_spaceman_fanart.glb
NATIVE_TEST_BINARY="$PWD/native/out/test/mrright-catalogue" node native/tests/api.integration.mjs
~~~

API 测试自动创建并销毁独立 PostgreSQL；不读取生产 DATABASE_URL。包含分类 / 分页 / Unicode 搜索 / SQL 注入 / 审核可见性 / 两类推荐资格 / 评分版本 / 原件遮蔽 / 只读角色 / 中文文件名上传校验。

EXE 的 --self-test REPORT.json [--server URL] 验证真实目录、图片、Draco 与纹理解码；--integration-test CONFIG.json REPORT.json 仅用于隔离测试账号，验证登录、批量上传、发布审核、单次票据、逐字节下载和退出会话。CONFIG 包含测试凭据，应短暂生成、使用后立即移除，绝不能提交。开发 HTTP 仅允许 localhost / 127.0.0.1；线上必须 HTTPS。

## 下一阶段

按“契约测试 → 独立 C++ 模块 → 同库增量迁移 → 回滚验证”顺序推进：账号 / 会话服务，资源写入 / 上传 / 审核，收藏和创作者数据接口，关注 / 好友 / 消息 / 动态接口，最后交易和管理端。每个模块上线前保留对应旧路径作为受控回滚点；不得一次替换整个生产后端。

## 0.1.1 优化

上传可取消并保留已完成的草稿附件；取消 / 失败下载不覆盖已有文件。新增详情失败重试、连接状态恢复、全局快捷键、搜索提示、分类状态保留和 DPI 字体更新；重复 3D 加载被合并，无限展墙在中心静止时停止重复重绘。原生回归流程见 [tests/README.md](tests/README.md)。

## 0.1.2 输入与重绘修复

使用真实单行 EDIT 的非客户区内边距统一垂直居中，适用于邮箱、密码、标题和搜索；保留密码遮罩、原生输入法、光标和选择。父窗口使用子窗口裁剪，悬停作品时不连带重绘原生控件；弹窗打开或窗口最小化时暂停作品墙自动移动。Windows 回归现为 404 项，包括 5 档字号 / 尺寸组合的普通与密码输入。

## 0.2.0 原生工作台

重构分组侧栏与工作台画布，个人资料入口替代旧在线工作台入口。上述创作者核心操作直接在桌面完成。三种主题和三种语言覆盖新模块，DPI 字体、单行居中和悬停不连带重绘保护继续使用。原生消息采用 8 秒轮询，非实时推送；只对前台窗口当前可见的消息提交已读。陌生人只能发首条请求，接受后才能继续；重试使用稳定 clientId。

开发测试新增 --studio-test CONFIG.json REPORT.json，覆盖实际私有 API 和 Win32 控件；--studio-preview CONFIG.json 仅允许 http://127.0.0.1:端口 的隔离账号预览。配置短暂存在且不得提交。此测试模式不能用于生产自动登录。详见 tests/README.md 与 docs/NATIVE_WORKSPACE_0.2.0.md（仓库根目录下）。
