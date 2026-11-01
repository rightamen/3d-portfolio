# 前端视觉重构 — 2026-10-31

用户选择：深色专业工作室。采用石墨底色、浅青绿强调、清晰字体层级和克制边框。
本轮沿用现有仓库，直接在 Ubuntu 内开发；未新增平台托管项目，未变更服务端或数据库。

## 已完成

- 新版首页：双栏品牌介绍、程序化 3D 雕塑展台、真实作品网格、社区动态和页脚。
- 去除旧首页太空图片背景和入场延迟。3D 雕塑无需下载外部模型/纹理，按需渲染，闲置时不持续动画。
- 统一品牌标记、导航、搜索、语言切换、发布入口和当前页导航状态。
- 作品标题/作者/价格常显，图片链接以作品标题提供无障碍名称；缩略图链路保留。
- 统一发现、详情、登录、账号状态、社区和创作者主页；保留创作者页面主题强调色。
- 手机双列作品网格、横向可滚动筛选，三语文案和键盘焦点状态。

## 主要文件

src/studio.css、src/sections/Hero.jsx、src/components/HeroText.jsx、
src/three/scenes/StudioScene.jsx、src/sections/Navbar.jsx、src/sections/Projects.jsx、
src/components/WorkCard.jsx、src/sections/Footer.jsx、src/App.jsx、src/main.jsx、src/lib/i18n.js。

样式限定在 studio-app 内；管理后台保留既有独立界面。未删除上传文件或原始 3D 资产。

## 验证

- build / lint：通过。
- 348 项单元测试、22 项本地浏览器回归：通过。
- 13 个桌面/390px 页面组合完成截图与溢出检查，无横向溢出、无脚本异常；社区和创作者页收尾后另行复查。
- en/ja/zh 手机首页均无溢出。
- 实际拖动 3D 展台确认视图变化；直接访问发现页不加载 StudioScene 或 React Three Fiber。
- 预览使用线上公开 GET 数据；拦截所有写请求及账号/后台接口，不会产生生产业务写入。

## 预览与状态

本地预览：http://localhost:5174/（已从 Windows 主机验证返回 200）。
截图：.deploy-tools/studio-ui/，其中 home.png / mobile.png 为首页桌面/手机。
预览配置与验证脚本位于忽略的 .deploy-tools/，不会进入发布包。

本轮尚未部署，线上仍是此前发布版本。未创建新 commit，未 push，VPS 备份不适用。
后续发布沿用现有构建、备份、上传与验证流程。
