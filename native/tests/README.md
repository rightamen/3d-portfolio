# Windows 原生回归

先按 ../README.md 构建 mrright-catalogue 和 Windows EXE。

1. 在 Ubuntu 运行 NATIVE_TEST_BINARY=/绝对路径/mrright-catalogue node native/tests/api.integration.mjs --hold。
2. 该进程创建独立 PostgreSQL 和独立临时服务器副本，上传写入临时目录，结束后清理；目录 / 模型静态预览复用本地 dist。不要将测试配置指向生产账号。
3. .deploy-tools/native-checks/session.json 是短期测试配置（0600），包含 server、legacyServer、测试账号和测试管理员授权。不要打印或提交。
4. 在 Windows 短暂生成 CONFIG.json，复制上述字段，并添加 png（有效小 PNG 的 Windows 路径）、notes（中文名 TXT）、download（测试输出文件）的绝对路径。
5. 执行 mrright-studio.exe --integration-test CONFIG.json REPORT.json；完成后立即移除 CONFIG.json。
6. 执行 mrright-studio.exe --ui-test UI-REPORT.json --server 测试配置中的server地址。
7. 写入 .deploy-tools/native-checks/stop 结束服务。进程删除临时服务器目录、数据库及 session.json。

集成回归验证：真实账号登录、中文多附件上传、审核发布、原件权限和单次票据、逐字节下载、取消前 / 中途取消 / 连接截断时保留已有文件、完整传输后的原子替换、直连后端中途取消不生成残缺附件和孤儿文件、会话退出失效。

UI 回归创建真实 Win32 窗口和控件、Direct2D 画布，共 27 组语言 / 主题 / 窗口尺寸组合。验证控件不遮挡详情，长文件名布局，主题切换保留筛选，搜索提示，子控件聚焦时 F5 / Escape，详情失败保留列表并能重试，过期请求不污染状态，3D 加载去重，网络恢复状态以及展墙静止 / 关闭动效时不自动移动。

--self-test REPORT.json 可连接公开线上目录，仅执行读取和本地解码。它不能代替隔离环境的上传 / 取消 / 授权回归。

## 0.2.0 工作台回归

隔离夹具在原有 76 项公共目录断言完成后，创建两个额外的测试创作者、收藏夹、关注及消息请求。session.json 额外包含 peerEmail / peerPassword / peerHandle、strangerEmail / strangerPassword / strangerHandle。禁止输出或提交这些短期凭据。

Windows 执行 --studio-test CONFIG.json REPORT.json：真实收藏夹管理、关注动态、资料编辑、好友申请 / 接受、好友直聊、陌生人首条请求限制、幂等发送、历史分页保留、原生 Unicode 多行输入、会话草稿、已读、退出清理和跨账号过期事件保护；7 页 × 3 尺寸 × 3 主题 × 3 语言，共 189 组布局。源代码拒绝非 127.0.0.1 的配置。每轮完整用例使用新夹具，避免把既有好友或速率计数误当测试初态。

--studio-preview CONFIG.json 用于在同一隔离夹具上人工检查真实原生画面，不打开登录弹窗，不操作真实用户凭据。临时公共 assets / models 使用只读流程中的现有静态文件，uploads 独立。结束时只删除 mkdtemp 生成的临时根目录，不遍历或删除仓库 public/uploads。
