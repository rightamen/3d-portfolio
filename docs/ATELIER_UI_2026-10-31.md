# 3D 展厅视觉精修 — 2026-10-31

承接空间画廊，按用户“更炫酷、现代、有品位”的要求继续优化，使用黑银色、珍珠紫点缀和金属灯光，保持作品优先。

## 完成内容

- 首页改为宽幅展厅，标题与操作分区；统一导航、按钮和作品浏览区域的视觉层次。
- 空间画廊加入圆角金属画框、程序化环境反射、展台、柔和阴影及悬浮反馈；拖动不误触选择。
- 缩略图导航展示实际作品，保留方向键、前后按钮、重置视角和详情入口。
- 新增沉浸模式：展开后聚焦退出按钮、限制焦点在弹窗内、锁定背景滚动；Escape 关闭并恢复焦点，跳转作品也会释放滚动锁。
- 修复共享 useDialogAccessibility 中触发按钮与初始焦点为同一节点时错误转移焦点的问题。
- 中英日翻译齐全；减少动态偏好下禁用悬浮位移，渲染继续按需唤醒。环境光由程序生成，无额外 HDR 下载。
- 展厅展示实际作品封面在三维空间的布局；原有作品详情源模型查看器保持可用。

## 文件

src/components/HeroText.jsx、src/components/SpatialGallery.jsx、
src/three/scenes/StudioScene.jsx、src/studio.css、src/lib/i18n.js、
src/hooks/useDialogAccessibility.js，以及 tests/review/marketplace.spec.js。

## 验证

- npm run build、npm run lint 通过；单元测试 348 项通过。
- test:marketplace-ui 28 项通过；新增沉浸模式焦点/Tab/Escape/滚动锁恢复与跳转详情释放滚动锁的回归。
- 实际画布拖动、滚轮缩放检查通过；悬浮反馈和点击画作选中经截图/实际操作检查通过。
- 桌面沉浸布局与 390px zh-CN/en/ja 普通及沉浸布局通过，未出现横向溢出或脚本异常。
- 本地只读公开数据预览 http://localhost:5174/；截图和结果在忽略目录 .deploy-tools/atelier-ui/、.deploy-tools/spatial-ui/。

本轮未部署、未 commit、未 push。基线仍为 7005b60 加前几轮本地修改。无 API/schema 变化或生产业务写入；VPS 备份不适用。设计预览的公开缩略图缓存与代理不进入生产制品。
