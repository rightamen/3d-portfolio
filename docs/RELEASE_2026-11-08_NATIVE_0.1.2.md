# 原生 0.1.2：输入居中与悬停重绘修复

源码 af4f89cc5efd7b30631071f5573701e4cdfccc0d，标签 native-studio-v0.1.2；先推送 GitHub，再以固定版本构建 EXE 并发布。
发布页：[mrright Studio 0.1.2](https://github.com/rightamen/3d-portfolio/releases/tag/native-studio-v0.1.2)。

## 修复

用户反馈邮箱 / 密码输入内容显示偏上、鼠标悬停时闪屏。单行 EDIT 默认格式区不提供所需纵向内边距，主画布和表单也缺少子窗口绘制裁剪。

新增 Input.hpp / Input.cpp：按当前字体度量在 EDIT 非客户区分配上下留白，字体变化后重新计算；仅绘制留白区域，不覆盖客户区文字。仍使用真实单行 EDIT，保留密码遮罩、光标、选择和原生输入路径。表单邮箱 / 密码 / 标题及主页搜索共用该实现。

主窗口及原生表单增加 WS_CLIPCHILDREN，悬停重绘排除原生输入框和按钮。弹窗禁用父窗口、窗口最小化时，停止作品墙的自动平移重绘。未对 OpenGL 预览强加 GDI 合成绘制。

实现参考：[Windows 窗口区域与子窗口裁剪](https://learn.microsoft.com/en-us/windows/win32/gdi/window-regions)、[单行 / 多行 EDIT 格式区约束](https://learn.microsoft.com/en-us/windows/win32/controls/about-edit-controls)。

## 验证

- build / lint 通过。
- 正式 EXE revision=af4f89cc5efd7b30631071f5573701e4cdfccc0d 的 Windows 回归通过：404 项检查，27 组语言 / 主题 / 窗口宽度布局。
- 增加 5 档字号 / 控件尺寸比例的普通与密码输入检查：文字行中心与字段中心相差不超过 2 像素，密码仍遮罩，选择范围保持，字体改变后内边距重新计算。比例模拟不等同于多显示器 DPI 实测。
- 验证画布有子控件裁剪；悬停卡片不使原生输入框或按钮的客户区失效；弹窗期间背景墙不移动或请求重绘。
- computer-use 独立测试窗口实际输入中文并复核居中，输入框上沿仍可聚焦。未操作或提交用户原登录弹窗及真实凭据。
- 正式 EXE 线上只读自检通过：4 个真实作品，图片 / Draco / WebP 解码，12,649 三角形，跨站与非法 origin 拒绝。
- 后端 / 数据库代码无改动，本轮不重复运行无关数据库用例或重启线上服务。

## 制品与升级

EXE SHA-256：6952f5d7b58c7068d12f0f5579eca4a7eb8d280dc391d3ca2e9668b3936f428d。
ZIP：1736477 bytes；SHA-256：9544ef640369f7a4eaffd3a930697177ffca2969cb04a01bad85f8217a279ec9。GitHub 资产 digest 已核对一致。

本机版本目录 D:/Codex/artifacts/mrright-studio-0.1.2，主程序 mrright-studio.exe；ZIP 位于父目录。依赖许可证、使用 / 测试说明、release.json 随包提供。旧版本、运行进程与用户已输入内容保持；使用新版目录启动后生效。本轮没有覆盖可能正在使用的旧稳定目录或自动关闭登录弹窗。

源码、标签、Release ZIP 和 SHA256SUMS 已发布；旧包可用于回退。线上 Node 保持 1763b5d、C++ 目录服务保持 025cb96；没有生产上传、配置或业务记录写入。后续文档提交不重复构建或部署。
