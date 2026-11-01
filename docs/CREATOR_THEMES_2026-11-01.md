# 创作者主题扩展 · 2026-11-01

> 发布更新：本功能已随 765242f / release-2026-11-01-studio 于 2026-11-01 21:48:55（Asia/Shanghai）上线。
> 备份与验收见 [发布记录](RELEASE_2026-11-01_STUDIO.md)；下文“本地/未提交”描述保留为开发阶段记录。


## 使用

- /u/:handle 的“预览主题”可直接试选 10 套主题，支持恢复作者主题。
  预览只影响当前页面实例；不会写账号、不会改变作者公开配置，换作者时重置。
- /account/settings 的“个人主题”可选整套预设，实时预览，再明确点击保存。
  保存后作者的公开主页、无限作品墙和作品详情共同应用。
- 可继续微调强调色、背景和字体；恢复默认/放弃修改均只调整草稿。
  颜色与背景对比不足时禁止保存，预览保留已保存配色，并显示三语提示。
- 保存失败保留草稿供重试；加载失败可重试；换语言保留草稿；
  认证会话变更会隔离编辑器，旧会话迟到的保存响应不能覆盖下一会话。

## 十套预设

| ID | 中文 | 背景 | 字体 |
| --- | --- | --- | --- |
| obsidian | 黑曜 · 银紫 | ink | sans |
| graphite | 石墨 · 冷银 | charcoal | sans |
| ocean | 深海 · 冰蓝 | midnight | sans |
| amber | 琥珀 · 暖金 | umber | serif |
| moss | 苔境 · 森绿 | forest | sans |
| rose | 暮玫 · 烟粉 | plum | serif |
| arctic | 极地 · 青灰 | slate | mono |
| ruby | 绯夜 · 红玉 | wine | sans |
| paper | 原纸 · 美术馆 | paper | serif |
| porcelain | 瓷白 · 极简 | porcelain | sans |

名称、简介、背景及字体选项均有中英日文本。字体沿用本机回退字体栈，无新外部字体请求。
主题不是单一强调色：页面/卡片/展台/边框/正文/次要文字/按钮/字体共同变化。
浅色主题额外覆盖公告、经历、联系表单、详情规格、评论和评分控件的旧固定白字。

## 实现与接口

server/themes.js 仍是单一纯解析器，客户端草稿与服务端保存共用 normalizeTheme /
themeToTokens；THEME_PRESETS 组合现有 accent、surface、font 三个存储字段，
默认值与原四种背景保持兼容。新增背景均为白名单，拒绝继承属性名充当选项。

GET /api/theme-options 在原 defaults/fonts/surfaces 上增加 presets，
其每项包含 id、labels、descriptions、theme、themeTokens；背景/字体增加 labels。
GET/PUT /api/account/theme 的路径、访客 token 授权和存储格式不变。
公开 creator.themeTokens 与 profile.themeTokens 保留原四字段，另加 text、muted、panel、
raised、line、soft、stage 七个 --theme-* 色板变量，不含任何私有账户字段。
不允许自由 CSS；主题仅作用于作者内容和隔离预览，站点导航与管理员后台独立。
无数据库 schema 变更，不需迁移。旧主题解析出的派生色板可随代码升级直接生效。

## 文件

server/themes.js、server/index.js、src/components/ThemeEditor.jsx、
src/components/CreatorThemeBrowser.jsx、src/pages/AccountPage.jsx、
src/pages/PublicProfilePage.jsx、src/studio.css、src/lib/i18n.js。
对应 tests/unit/themes.spec.js、tests/api/contract.db.spec.js、tests/review/themes.spec.js，
个人页指针回归增加滚动到目标，避免新增主题工具条后在可视窗口以外模拟鼠标。

## 验证与发布

build/lint、351 单测、完整 55 项浏览器回归与 215 项临时数据库检查通过；
最后评论/评分配色收整后重新 build/lint，17 项个人页/主题回归再次通过。
色板单测验证所有预设有效，
正文与次要文字在各主要背景上至少 4.5:1；自定义强调色继续沿用 3:1 UI 下限，
按钮前景使用纯黑/白中更高的对比值。
真实公开作品只读截图检查覆盖全部预设，桌面 1440px 与 390px 手机，
截图/结果在忽略目录 .deploy-tools/theme-ui/；保存与隔离由临时库 API 检查验证。
浏览器受控响应覆盖预览零写入、真实组件变色、恢复、保存/刷新/跨页面生效、
草稿放弃/重置、非法组合、失败重试、三语手机、换语言与迟到会话响应。

本轮基于 main / 5142194 加前轮个人展厅本地修改；未 commit、未 push、未部署。
线上仍 c6d3334 / release-2026-11-01，不写生产配置或账号主题，VPS 备份不适用。
本地只读预览 http://localhost:5174/u/mrright 可直接试选主题；
该预览的账号写入继续阻断，持久保存由测试环境验证，待正式发布后提供新能力。
