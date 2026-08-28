# mrright.blog 项目进度记录

## 下次从这里继续（截至 2026-08-28 第二十六轮收工）

### 2026-08-28（第二十六轮）：全站不再预加载 971 KB 的 three.js

**做的是未完项第 9 条**（分享出去的项目链接要等 20～35 秒），
**但根因不在项目详情，也不在服务端 —— 在构建的分包上。**

| | 第二十六轮 |
|---|---|
| 做的事 | 入口不再静态依赖 three.js；Tailwind 扫描范围收进 `src/` |
| 未完项 | 第 10 条 ✅ 关闭；**第 9 条只关掉一半**，见下 |
| 前端源码 | **一行没动**（改的是 `vite.config.js` 和 `src/index.css` 顶部的 import） |
| 服务端 | 一行没动 |
| 数据库 | 无变更，本轮没有跑过任何数据库写语句 |
| 部署 | ✅ `cc52af3`，2026-08-28 05:11 UTC |
| 回滚点 | `/opt/mrright-portfolio.backup-20260828-051131` |

⚠️ **根因是 vite 的 `preload-helper` 被 rollup 分进了 `three-fiber` chunk。**
那个 helper 不是任何人的依赖，rollup 可以随便放；而**入口自己要用它**做懒加载，
于是入口就静态 import 了 `three-fiber` → `three-core`，
vite 顺理成章地在 `index.html` 里给这两个挂了 `<link rel="modulepreload">`。
**每一个页面**（包括 `/account`、`/login` 这种根本没有 3D 的页面）
都在最高优先级预载 971 KB 的 three.js。
修法是一行：把 helper 钉到 `react-vendor`（它本来就是入口的静态依赖）。

⚠️ **别把 `manualChunks` 里那条 `preload-helper` 规则删掉。**
`tests/api/contract.spec.js` 里有一条断言盯着「任何页面都不得 modulepreload `three-*`」——
它红了先去看 `vite.config.js` 的分包，再怀疑是不是哪个组件真的 import 了 three。

⚠️ **第 9 条只解决了一半，另一半还开着。**
`/account`、`/login`、`/community` 这些没有 3D 的页面现在**一个字节的 three.js 都不下**
（线上实测 0 KB，原来是预载 971 KB）。
但**首页和项目详情仍然会并行拉 three.js** —— 因为 Hero 一挂载就 import 它。
分享链接的收件人依然要和 971 KB 抢带宽。详见未完项第 9 条。

⚠️ **本轮一度写了「冷启动进项目页时延迟挂载 Hero」，量完删掉了。**
在可复现的 1.6 Mbit/s 节流下，加不加它都是 5.5s（不加反而更稳），
所以它没有留下来。**这不代表那个方向是错的** ——
只代表节流环境没有复现出真实链路上的带宽争抢，需要更好的度量办法才能定论。

**2026-08-28 收工**：当天只做了这一轮，代码已 push、已部署、已逐项验证。
工作树干净、本地与线上同码、本机没有任何服务在跑。
未完项从 10 条降到 **9 条**（第 10 条关闭，第 9 条改写后仍开着）。
「待你决策」仍然是 2 条。

---

### 2026-08-26（第二十五轮，前一天）：JSON-LD，而 CSP 根本不用动

**做的是第二十三轮衍生清单里的 JSON-LD**，但真正的收获是**推翻了那一轮写下的一个前提**。

| | 第二十五轮 |
|---|---|
| 做的事 | 每个可索引页面一份 JSON-LD `@graph` |
| 路线图 | 第 6 条衍生的第 2 条 ✅（还剩帖子配图、`<noscript>` 两条） |
| 前端 | **一行没动**（但构建产物变了，见下面那条 Tailwind 的坑） |
| 服务端 | `server/seo.js` 加图谱构建，`server/index.js` 只多传一个 `owner` |
| CSP | **一个字都没改** |
| 数据库 | 无变更，本轮没有跑过任何数据库写语句 |
| 部署 | ✅ `847701a`，2026-08-26 14:17 UTC |
| 回滚点 | **`/opt/mrright-portfolio.backup-20260826-141025`**（注意不是最新那份，原因见下） |

⚠️ **「CSP 会拦 `ld+json`」是错的，这一轮实测推翻了它。**
第二十三轮据此把 JSON-LD 列为「不做」，理由是要么每次响应算 sha256 塞进 CSP 头、
要么放宽策略。**两者都不需要**：`type` 不是 JavaScript 类型的 `<script>` 是
**data block**，HTML 解析器从不「准备执行」它，所以它要过的那道 CSP 检查根本走不到。
真实 Chromium 实测：带 hash 和不带 hash 两种响应头，元素都在 DOM 里、内容都能解析、
`securitypolicyviolation` 事件 0 条、console 报错 0 条。
再用线上那份真策略（含 report-uri）跑 4 条路由复验，同样干净。

⚠️ **本轮一度真的写了那套 hash 机制，量完之后把它删了。**
每个 HTML 响应都去改写一次安全头是有成本的，而它什么也没换来。
**别再把它加回来**：`tests/api/contract.spec.js` 里有一条断言盯着
「两个图谱不同的页面，CSP 头必须一字不差」。

⚠️ **转义在这里是唯一的防线，比 meta 标签那轮更要紧。**
帖子标题、正文、昵称、简介都会进到 script 元素里，而 `<` 是唯一能提前结束它的字符 ——
一条写着 `</script>` 的简介会把它关掉，后面全被当 HTML 解析。
`encodeJsonLd` 把 `& < >` 和 U+2028/2029 转成 `\uXXXX`。
**CSP 不会替你兜这个底** —— 这正是上面那个实测的另一面：
CSP 不检查的 data block，也就是 CSP 救不了的 data block。

⚠️ **noindex 的页面一律没有图谱。** 私有区、未知路径、查无此行、
被设为私密的资料、被下架的项目 —— 结构化数据是页面上最机器可读的东西，
它必须跟着 head 一起消失，不能比 head 活得久。

⚠️ **站长邮箱没有进 Person 节点，是故意的。** 页面上本来就有 `mailto:` 链接，
但把它变成结构化数据里的一个类型化字段是另一回事。`sameAs` 只放 `https://` 的主页链接。

**2026-08-26 当天收工（这一天做了两轮：第二十四轮和第二十五轮，都已部署）：**

- 提交：`4b04f46`（二十四轮代码）、`f440935`、`c4be183`、`847701a`（二十五轮代码）、
  `919735b`（二十五轮文档）+ 本次收工提交，**全部已 push**，`main` 与 `origin/main` 一致
- 线上跑的就是 `847701a`（14:17 UTC 部署），**本地与线上同码**，`/api/health` 200
- CI：两个代码提交 × 两个 job（`Web and API` / `C++ App Skeleton`）**全绿**
- 本机没有任何服务在跑（验证用的 express 4321 用完已停）
- **当天两轮都没有跑过任何数据库写语句**；只用一次性管理会话验了 admin_summary（用完即撤销）
- 未完项从 7 条涨到 **9 条 → 10 条**（第二十五轮新开第 9、10 条，都是量出来的，
  不是本轮改出来的；本轮没关掉任何一条）
- 「待你决策」仍然是 2 条（17 个翻译 key、`crimson-rune-greatsword` 的中文文案串了）
- 没有半途而废的改动挂在本机

**下次开工**：先读这一节，再看下面「下一轮我建议先做的」。
**我的建议是先做未完项第 9 条**（分享出去的项目链接要等 21～35 秒才看得到面板），
第 10 条（文档改动会冲掉全站 CSS 缓存，一行 `@source` 的事）顺手带上。

⚠️ **本轮我犯了一个操作失误，记在这里免得下次再犯。**
为了读一行备份路径，我把 `npm run deploy:vps` 重跑了一遍 —— 那是**一次真实的重复部署**。
代码没变（同一个 commit），服务正常，但它多占了一个备份位，
**把第二十三轮的回滚点 `...-20260822-034955` 挤掉了**（脚本只保留最新 3 份）。
结果是最新那份 `...-141745` 里装的就是第二十五轮的代码，**当不了本轮的回滚点**；
真正的回滚点是它下面那份 `...-141025`。
**教训：部署输出要一次抓全（`tee` 或抓完整日志），不要为了补看一行而重跑部署。**

---

### 2026-08-26（第二十四轮）：四个项目各自有了地址（当天第一轮）

**做的是第二十三轮衍生出来的第一条**（也是那一轮自己写下的
「本轮之后 SEO 上最大的一块空白」）：项目详情面板原来是 React state，
**没有地址** —— 分享不了、Back 关不掉、爬虫也没有东西可抓。现在它是
`/projects/:slug`。

| | 第二十四轮 |
|---|---|
| 做的事 | 项目详情有了自己的 URL、自己的 head、自己的分享图 |
| 路线图 | 第 6 条衍生的第 1 条 ✅（另外三条仍未做） |
| 前端 | `src/App.jsx`（路由 + 一处滚动例外）、`src/sections/Projects.jsx` |
| 服务端 | `server/seo.js` 加 project 分支，`server/index.js` 加查询与 sitemap |
| 数据库 | 无变更，**本轮没有跑过任何数据库写语句** |
| 部署 | ✅ `4b04f46`，2026-08-26 02:57 UTC |
| 回滚点 | `/opt/mrright-portfolio.backup-20260826-025716` |

⚠️ **`/projects/:slug` 渲染的是和 `/` 完全同一个 `homePage` 元素。**
详情是叠在首页上的浮层，不是另一个页面 —— 同一个元素在同一个位置，
React 才会保住 `HomePage`（以及里面那个 3D 场景）不被卸载重建。
**改这条路由的 element 前先想起这件事**，换成别的元素，进详情就等于重建首页。

⚠️ **打开详情是唯一一次「PUSH 但不滚到顶」。** 走的是
`state.preserveScroll`，`ScrollToTop` 见到就跳过。不做这个例外的话，
浮层底下的首页会被拉到顶，关掉的瞬间访客就丢了自己在网格里的位置。

⚠️ **`resolveRoute` 里项目那条是锚定到行尾的**（`$`），和帖子、资料那两条不一样。
项目详情没有标签页，`/projects/<slug>/anything` 不是项目页 ——
客户端在那里渲染的是干净的首页，服务端必须和它保持一致。

⚠️ **`/projects` 不是页面**：它渲染首页，canonical 指向 `/`，
不让它变成首页的第二个 URL。

⚠️ **隐藏项目和不存在的项目在这里是同一回事，这是故意的。**
`listProjects` 默认丢掉 `is_public = false` 的行，所以下架的项目在 SEO 这条路上
拿到的是 404 + noindex —— 下架必须把 head 一起从页面上拿走。

⚠️ **路由表仍然是两份**（`src/App.jsx` 与 `server/seo.js`），本轮又加了一条。
第二十三轮那句提醒继续有效：**新增公开路由两边都要加。**

**第二十四轮收工时**：代码 `4b04f46`、文档 `f440935` 都已 push，
线上是 `4b04f46`（02:57 UTC 部署），CI 两个提交 × 两个 job 全绿，
未完项仍是 7 条，「待你决策」从 1 条变成 2 条
（新增 `crimson-rune-greatsword` 的中文文案串了另一个项目）。
当天随后又做了第二十五轮，见上面那一节。

---

### 2026-08-22（第二十三轮）：每条路由自己的 `<head>`

**做的是路线图第 6 条 SEO，但没有做 SSR。** 做的是**服务端注入 `<head>`**
（外加一段 `<noscript>`）。被否掉的四个方案（完整 React SSR、构建期预渲染、
prerender 服务、什么都不做）和各自的理由写在
`docs/adr/ADR_WEB_SEO_RENDERING_STRATEGY.md`。

| | 第二十三轮 |
|---|---|
| 做的事 | 每条路由自己的 title / description / canonical / og / twitter |
| 路线图 | 第 6 条 ✅（走「注入 head」这条路，不是 SSR） |
| 前端 | **一行没动**（`src/` 零改动，构建产物只有 index.html 变了） |
| 服务端 | 新增 `server/seo.js`，改 `server/index.js` 的兜底路由与 sitemap |
| 数据库 | 无变更，无写语句 |
| 部署 | ✅ `76260b1`，2026-08-22 03:49 UTC |
| 回滚点 | `/opt/mrright-portfolio.backup-20260822-034955` |

⚠️ **起因不是 Google。** Google 会跑 JS，迟早看得到真页面。看不到的是
**Twitter / Discord / Slack / Telegram / 微信** —— 它们只抓一次 HTML，
一行脚本都不跑。所以在这些地方分享一条社区帖子，标题永远是
「mrright.blog | 3D Portfolio」、配图永远是那个灭火器。

⚠️ **`express.static` 现在带 `index: false`。** 不带的话 `/` 会被 static
用**未改写的模板**直接答掉，永远拿不到自己的 head。动那一行前先想起这件事。

⚠️ **只有「查过、确实不存在」才回 404**（帖子 ID 查无此帖、handle 查无此人）。
**库不在或查询抛错时回 200 + noindex**，不回 404 ——
一次数据库抖动不能把一条活着的帖子变成爬虫记住的 404。
**没匹配上的路径也仍然是 200**（照旧渲染首页），只是挂 noindex：
服务端不知道客户端路由表的全貌，把将来新加的路由 404 掉比不给它建索引更糟。

⚠️ **路由表现在有两份**：`src/App.jsx` 的 `<Routes>` 和 `server/seo.js` 的
`resolveRoute`。**以后新增公开路由，两边都要加**，否则新路由会被当成未知路径
挂上 noindex —— 页面照常渲染，只是不进索引，不会报错，所以不会有人发现。

⚠️ **没有 JSON-LD，是故意的。** `<script type="application/ld+json">`
在 CSP 眼里就是 script，而本站 `script-src` 是 `'self' 'wasm-unsafe-eval'`，
没有 inline 余地。要加就得每次响应算 hash 塞进 CSP 头，或者放宽策略；
在普通 meta 标签还没验证出成效之前不值得动 CSP。

⚠️ **转义是这一轮的承重墙。** 帖子标题、正文、显示名、简介全是访客写的，
最后都进 `content="..."`。`server/seo.js` 对每个值转义 `& < > " '`，
并且每处 `String.replace` 都用函数形式的替换 ——
否则一条标题叫 `$&` 的帖子会把匹配到的整段文本再拼回页面里。

**2026-08-22 收工**：当天只做了这一轮，代码已 push、已部署、已逐项验证，
CI 两个 job 全绿（`api-db` 那个 job 本轮加了 build 步骤，新增用例是真跑了不是跳过）。
工作树干净、本地与线上同码、本机没有任何服务在跑、
**当天没有跑过任何数据库写语句**。
「待你决策」仍然是 1 条（17 个翻译 key），未完项仍然是 7 条，本轮没开新的。
没有半途而废的改动挂在本机。

顺手把这一节里两条已经过期的警告清掉了（都是第二十二轮修好但忘了从这里删的）：
`verify:visitor-studio` 早就不红了，`verify-visitor-studio.mjs` 也早就不是 CRLF 了。

---

### 2026-08-19 当天收工总览

**这一天做了两轮：第二十一轮（react-router，已部署）和第二十二轮（前端单元测试，未部署）。**

| | 第二十一轮 | 第二十二轮 |
|---|---|---|
| 做的事 | 站内跳转不再重建文档 | vitest 单元测试 106 条 |
| 路线图 | 第 4 条 ✅ | 第 5 条 ✅ |
| 服务端 | 一行没动 | 一行没动 |
| 运行时改动 | 有（前端路由） | **无**（只多一个 `export`） |
| 部署 | ✅ `a3799b5`，14:35 UTC | ❌ 不需要 |
| 回滚点 | `/opt/mrright-portfolio.backup-20260819-143533` | 同左 |

当天还顺手结清了三件旧账：
**未完项第 7 条**（`verify:visitor-studio` 红了三轮 —— 定性为脚本错，已修）、
**`admin-visitors.spec.js` 的大小写红灯**（第二十轮起一直红，已修）、
**`.gitattributes` 漏掉的 `*.mjs eol=lf`**（全仓唯一 CRLF 文件的根因，已补）。

收工时：工作树干净、已全部 push，CI 全绿，本机没有任何服务在跑，
当天两轮都没有跑过任何数据库写语句（第二十二轮连读都没有）。
**「待你决策」里新增了一条**（17 个没人渲染的翻译 key 删不删）。

---

**线上运行 `cc52af3`（2026-08-28 05:11 UTC 部署，已逐项验证）。**
第二十六轮**只改了构建**：`vite.config.js` 的分包和 `src/index.css` 顶部那行 import，
`src/` 的组件代码和 `server/` 都一行没动。
回滚到第二十六轮之前：`/opt/mrright-portfolio.backup-20260828-051131`。

（上一轮：第二十五轮 `847701a`，2026-08-26 14:17 UTC 部署。）

**第二十五轮线上是 `847701a`（已逐项验证）。**
第二十五轮**只有服务端改动**（`src/` 一行没动），
每个可索引页面的 head 里多了一份 JSON-LD，**CSP 头一个字没改**。
**API 接口仍然一个都没动**，数据库自第十二轮起仍然无变更。
回滚到第二十五轮之前：`/opt/mrright-portfolio.backup-20260826-141025`
（**不是最新那份**，最新那份是重复部署产生的，里面装的就是第二十五轮）。

（上一轮：第二十四轮 `4b04f46`，02:57 UTC 部署，前端和服务端都有改动
—— 多了 `/projects/:slug` 这条路由。）

（上一轮的说明保留在下面。）

**第二十三轮线上是 `76260b1`（2026-08-22 03:49 UTC 部署，已逐项验证）。**
第二十三轮**有服务端改动**：每个 HTML 响应的 `<head>` 现在是服务端拼的。
第十二至二十三轮都**无数据库变更**；第二十三轮是第十二轮以来
**第一次动服务端的非 API 路径**（`/sitemap.xml` 和那条兜底路由），
API 接口本身仍然一个都没动。
回滚到第二十三轮之前：`/opt/mrright-portfolio.backup-20260822-034955`。

（历史：第二十二轮线上是 `a3799b5`，那一轮没有可上线的运行时改动，也没有部署。）

**第二十二轮做的是前端单元测试**（原「下一轮建议」第 5 条）：
vitest + jsdom，六个文件 106 条，已接进 CI 且排在 build 之前。
同时**定性并关掉了未完项第 7 条**（`verify:visitor-studio` 是脚本错了，
不是按钮被删），顺手补掉 `.gitattributes` 里漏掉的 `*.mjs eol=lf`。
详见下面「2026-08-19（第二十二轮）」。

⚠️ **跑单元测试用 `npm run test:unit`**，它读的是 `vitest.config.js` 而不是
`vite.config.js`（后者带生产分块和一个会清空 `dist/uploads` 的钩子）。
**`include` 写死在 `tests/unit/**`**，别放开——默认 glob 会去捡 Playwright 的 spec。

**第二十一轮做的是 react-router**（原「下一轮建议」第 4 条）：
站内跳转不再把整个文档拆掉重建。详见下面「2026-08-19（第二十一轮）」。
**全部是前端改动，`server/` 一行没动**，但**客户端路由的实现方式换了** ——
不再读 `window.location.pathname`，改成 `BrowserRouter` + `Routes`。

⚠️ **路由写成带尾部 splat（`/account/*`），是为了保住旧的 `startsWith` 前缀语义。**
写成精确的 `/account`，`/account/settings` 就会掉进 `*` 去渲染首页。
13 条路径的对照实测结果在那一节里。

⚠️ **装前端依赖一律用 `npm install --save-dev`。**
不带这个参数，npm 会写进 `dependencies`，而那一栏是
**VPS 上真正会安装的服务端运行时**（express / pg / helmet / multer / cors /
express-rate-limit，只有这六个）；前端的东西全部属于 `devDependencies`。
第二十一轮的 `react-router-dom` 就是这么装错又挪回去的；
第二十二轮的 `vitest` / `jsdom` 带了 `--save-dev`，一次到位。
**核对办法**：`node -e "console.log(Object.keys(require('./package.json').dependencies))"`
应该永远只吐那六个。

**第二十轮做的是后台界面**：三语（中/英/日）、动画、仪表盘上的 3D 运营星图、
多分辨率适配。详见下面「2026-08-18（第二十轮）」。
全部是前端改动，`server/` 一行没动。

**线上内容健康：0 critical / 0 warning / 0 note**（2026-08-18 14:5x UTC 实测，
第二十轮部署后复查，与第十九轮相同；第二十一至二十三轮都没有新增或改动任何资源）。

⚠️ **VPS 只保留最新 3 个应用备份**，脚本每次部署自动清理旧的。
所以下面各轮里写的历史回滚路径**大多已经不存在了**。截至第二十三轮收工，
`/opt` 上实际存在的是：

```text
/opt/mrright-portfolio.backup-20260828-051131   第二十六轮之前 ← 要回滚就用这个
/opt/mrright-portfolio.backup-20260826-141745   （第二十五轮那次多余的重复部署留下的，里面就是第二十五轮）
/opt/mrright-portfolio.backup-20260826-141025   第二十五轮之前
```

（2026-08-28 05:1x UTC 部署输出里实际写的。第二十四轮那份 `...-20260826-025716`
已被本轮部署按 3 份保留策略自动清掉。
⚠️ 第二十五轮那次重复部署的后遗症还在：中间那份是废的，
真要回退两轮得用最下面那份。）

要回滚先 `ls -dt /opt/mrright-portfolio.backup-*` 确认实际有什么，别照抄旧记录。

第十九轮做掉了「下一轮建议」的第 3 条：**拆 `Admin.jsx`（2963 → 1301）
与 `postgresStores.js`（4095 → 40）**。全是重构，运行时行为只有一处变化：
Members 详情在窄屏下不再把整页撑宽（一行 CSS）。
详见下面「2026-08-17（第十九轮）」。

⚠️ **`ADMIN_TOKEN` 不能直接打管理接口，只能用来换会话。**
`curl -H "Authorization: Bearer $ADMIN_TOKEN" .../api/admin/summary` 会 401 ——
本轮照 `mr-deploy` 提示词里那条命令做，被这个假红灯骗了一次。
正确的顺序：`POST /api/admin/session`（token 放头里，**不能放 body**）→
用返回的 session token 打管理接口 → `DELETE /api/admin/session`。
**`mr-deploy` 那份提示词里的第五步第 3 条是过期的写法。**

⚠️ **窄屏收成单列时写 `minmax(0, 1fr)`，不要写 `1fr`。**
`1fr` 是 `minmax(auto, 1fr)`，轨道不肯低于内容的 min-content ——
`.visitor-management-layout` 就是这么在 440px 下被六个详情标签页（并排 646px）
顶到 684px 的，整页横向滚动，而标签条上那句 `overflow-x: auto` 从没机会生效。
**第十八轮专门走过 440px 却没发现，因为那一轮没点开过成员详情。**

⚠️ **拆 store 之后，跨 store 依赖只剩一条**：`adminStore` 收一个 `projectStore`
（overview 要数目录）。三个 store 会调用自己，都保留了具名绑定。
**以后新增 store 间调用，从 `postgresStores.js` 的工厂参数里传，
别在一个 store 文件里 import 另一个 store。**

~~⚠️ `npm run verify:visitor-studio` 是红的~~、
~~⚠️ `scripts/verify-visitor-studio.mjs` 全文是 CRLF~~ ——
**两条都在 2026-08-19 第二十二轮修掉了**，只是当时忘了从这一节删。
脚本现在指向真实存在的标记并且通过（2026-08-22 复跑仍通过），
文件也已经是 LF（`.gitattributes` 补了 `*.mjs eol=lf`）。
来龙去脉见未完项第 7 条和第二十二轮那一节。

**第二十轮收工时的状态（2026-08-18，当天工作到此为止）：**

- 工作树干净；线上是 `fdc602b`，本地与 `origin/main` 多的那一个提交只改这份文档
- 本机 `npm run dev`（5173）用完已停；本轮没有起过带数据库的实例
- 本轮**没有跑过任何数据库写语句**，只用短期会话读了 content-health 和 overview（读完即撤销）
- 「待你决策」清单**已清空**（唯一那条就是本轮要不要上线，已经上了）
- 后台前端验证走的是 fixture + Playwright，已固化成 `tests/e2e/admin-console.spec.js`，
  **同一套测试对线上也跑过一遍并且全绿**

**第十九轮收工时的状态（2026-08-17 15:1x UTC，已冻结）：**

- 工作树干净；本地与 `origin/main` 一致，线上是 `d7924da`（差的几个提交都只改这份文档）
- 本机 `npm run dev`（5173）用完已停；**本轮没有起过带数据库的实例**
- ⚠️ **本轮没能重设 `mrright_local` 的口令**（`ALTER ROLE` 那条命令被
  权限策略挡下了），所以那个 scratch 库这轮**一次也没用上**。
  前端验证改走了另一条路：Playwright 拦 `**/api/admin/**` 喂 fixture 打 `npm run dev`，
  十一个分区 × 两个宽度全走一遍。**这条路不需要数据库，也不需要动任何角色口令**，
  下次做后台 UI 可以优先考虑它。
- 库 `mrright_local_dev` 和第十八轮那套种子数据都还在，只是口令没人知道
- 「待你决策」清单**仍然是空的**
- 线上 `dist/uploads` **不存在**（部署后已复查，第十六轮那道闸仍然有效）

**下次开工第一件事**：读这一节，然后看「下一轮我建议先做的」——
第 3、3b、3c、4、5、6 条都已划掉，路线图上排最前的是**第 7 条 C++ SDK**。
第二十三轮衍生的四条里，项目路由（第二十四轮）和 JSON-LD（第二十五轮）都做掉了，
还剩帖子配图和 `<noscript>`。
未完项**第 10 条已由第二十六轮关闭**（文档改动冲掉全站 CSS 缓存，一行 `@source`）；
**第 9 条只做掉一半**：没有 3D 的页面已经不下 three.js 了，
但首页和项目页仍会并行拉它。**剩下那一半要先有可靠的度量办法再动手** ——
第二十六轮凭直觉写的「延迟挂载 Hero」量下来毫无增益，已删，理由记在第 9 条里。
所以下一轮可以是：第 9 条的后半（先解决度量）、帖子配图，或者路线图第 7 条 C++ SDK。
**「待你决策」里那条还在**（17 个没人渲染的翻译 key 删不删）——
第二十三轮也没有替你删，理由不变：那是产品文案。

**第二十三轮收工时的状态（2026-08-22，工作到此为止）：**

- 工作树干净；已全部 push；**线上是 `76260b1`，本地与线上同码**
- 本轮起过两个本机实例（`PORT=4194` 和 `PORT=4188` 的 express），**都已停**
- 本轮**没有跑过任何数据库写语句**；本机只用一次性 disposable 集群跑了
  `npm run test:api:db`（脚本自带，跑完连集群目录一起销毁）
- 「待你决策」仍然是 1 条（17 个翻译 key），未完项仍然是 7 条，本轮没开新的
- 线上 `dist/uploads` **不存在**（部署后已复查，第十六轮那道闸仍然有效）
- 线上 `journalctl` 自部署起 0 条 error、0 条 500

⚠️ **本轮踩到一个假红灯，记下来免得下次再上当**：
`npm run test:api` 报了两条 admin 503 的失败，看起来像回归。
真实原因是**我自己起的调试服务器占着 4194 端口**，而
`contract.spec.js` 里那个「admin store 不可用」的子服务器正好也用 4194 ——
它绑不上端口，请求全打到我那台没有 `ADMIN_TOKEN` 的实例上，于是 401。
**本机手工起服务不要用 4193 / 4194 / 4195** —— 那三个是 API 契约套件自己的端口
（`contract.spec.js` 用 4193 和 4194，`contract.db.spec.js` 用 4195）。

**第二十二轮收工时的状态（2026-08-19，当天第二轮，工作到此为止）：**

- 工作树干净；**线上仍是 `a3799b5`，本轮没有部署，也不需要**
- 本轮没有起过任何本地服务，没有跑过任何数据库语句
- CI run `32269795765` 全绿（含新增的 Frontend unit tests 步骤）
- 未完项从 8 条降到 7 条（第 7 条已关闭）；「待你决策」从空变成 1 条

**第二十一轮收工时的状态（2026-08-19，当天工作到此为止）：**

- 工作树干净；线上是 `a3799b5`，本地比线上多的是这份文档和 `a160d3f`（只改测试）
- 本机 `npm run dev`(5173) 和 `vite preview`(4188) 用完都已停
- 本轮**没有跑过任何数据库语句**，连读都没有；本机 scratch 库一次也没起
- 「待你决策」清单**仍然是空的**
- 线上 `dist/uploads` **不存在**（部署后已复查，第十六轮那道闸仍然有效）
- 线上 `npm run test:e2e` 24 通过 / 0 失败 / 4 skipped
  （`admin-visitors` 那条自第二十轮起一直红，本轮定性并修掉了；
  第十八到二十轮之间它是什么状态没有查，别当成「历史首次全绿」）

**2026-08-18 的工作到此为止：代码已 push、已部署、已逐项验证，
「待你决策」清单是空的，没有半途而废的改动挂在本机。**

第十八轮是**把后台十一个分区在 440px 下逐个走了一遍**（原「下一轮建议」第 3b 条），
顺手结清了「待你决策」里那条角标对齐。详见下面「2026-08-16（第十八轮）」。

⚠️ **最丑的那块不是没写样式，是样式被自己压掉了。**
`.admin-row span { display:block }` 权重 (0,1,1) 压过 `.visitor-row-status` (0,1,0)，
所以 Members 那条 `flex-direction:row` 整条规则是**死的** ——
两个状态胶囊各撑满 382px、各占 40px 一行，六个人光说「verified / public」
就吃掉约 500px。**以后在 `.admin-row` 里面写布局，选择器前面必须带 `.admin-row`**，
否则会被那条 base 规则吃掉（`.admin-row-title span` 早就为此写过一次）。

⚠️ **公开主页有个存在已久的遮挡 bug，本轮一并修了**：
`.public-profile-head` 用负 margin 抬进横幅里，而横幅是 `position:relative`
（要放 glow），身份区是静态流内容 —— 定位元素画在上面，**头像顶部和
名字的第一行被横幅盖住**。名字一换行就中招，440px 下大多数全名都会换行。
线上目前没有任何用户设过 handle，所以**这个修复只在本机验证过**，
等真有人有公开主页时回去看一眼。

⚠️ **评论审核之前是个死胡同**（不是排版问题，是本轮顺带发现的真 bug）：
服务端一直有 published / pending / spam，未验证邮箱的评论进 pending、
垃圾判定进 spam，两者在站上都不可见；`PATCH /api/admin/comments/:id`
一直能放行、还有契约测试 —— **但前端没有任何调用方**，
Comments 列表既不显示状态、也只有 Delete。于是仪表盘催你「N 条待审」、
侧栏挂角标、按钮把你送过去，然后就没有然后了。误判只能删，
对作者而言和不处理是一个结果。现在**列表显示状态、待办排在最前、
Publish / Mark Spam 就在 Delete 旁边**。

⚠️ **`tests/e2e/admin-visitors.spec.js` 那两条一直是红的，原因是断言写错了**：
泄漏检查用 `/password/i` 匹配**键名**，而访客序列化里永远带
`passwordChangedAt`（一个时间戳）。也就是说它对着**任何**在跑的部署都会红，
只是因为没人本地跑、默认又打线上，所以没人发现。已改成只放行这两个键名。

**第十八轮收工时的状态（2026-08-16 05:1x UTC，当天工作到此为止）：**

- 工作树干净，本地与 `origin/main` 同为 `8322236`
- 线上 `dist/uploads` 仍为 0 个文件；本机 `public/uploads/images` 也是 0
- 本机 scratch 实例（端口 4199）**已停**；库 `mrright_local_dev`
  和角色 `mrright_local` 留着，**里面现在有一套种子数据**
  （6 个访客 / 8 条项目评论含待审与垃圾 / 5 个帖子 / 3 个社区上传 /
  4 条留言 / 5 条下载申请 / 点赞和下载事件），下次做后台 UI 直接起来就有东西看
- ⚠️ `mrright_local` 的口令**每次重置一个新的**（只在本机 scratch 库上），
  下次要用就照「环境事实」里那条 `ALTER ROLE` 再生成一个，别去找旧的
- ⚠️ 种子数据里那三个社区上传**文件是不存在的**，所以本机 Content Health
  会报 1 broken / 1 degraded。**那是对的**，别当成回归去修。
- 「待你决策」清单**已清空**

第十七轮修的是 `/admin` 本身的窄屏排版，和一串吓人的 401。

⚠️ **「没有横向溢出」不等于「能看」。** 第十五轮量过同一个页面、没测到溢出，
于是去修了公开页头 —— 溢出是**选错的指标**。这轮量的是密度：`.admin-stat-grid`
在 640px 以下是单列，六块只装一个词和一个数字的卡片各占 406px 宽，
中间一大片空白。现在**手机两列、`md` 起三列**。

⚠️ **控制台里那 11 条红色 401 是「会话过期」的正常样子，不是故障。**
恢复已存会话时会先用**一个** `getAdminMe` 探活，401 就直接回登录页并说
「That admin session has expired」，不再让 11 个请求各自撞一次墙。

⚠️ **本机现在可以真的把 `/admin` 跑起来看**（第一次做到），做法见下面「环境事实」，
不用再拿线上冒险，也不用有 `right` 的密码。

**第十七轮收工时的状态（2026-08-15 04:0x UTC）：**

- 工作树干净，`origin/main` 与本地同 `ac726bf`（含本次文档）
- `public/uploads` **0 个文件** —— 第十六轮清掉的 20 个测试遗留没有再长回来，
  测试现在跑完自己收拾
- 本机那个 scratch 实例（端口 4199）**已停**；库 `mrright_local_dev`
  和角色 `mrright_local` **留着**，下次直接起
- 认证器绑定那条未完项已由用户确认关闭，未完项从 6 条降到 5 条
- 「待你决策」里有**一条新的、很小的**：后台面板角标在窄屏下的对齐

第十六轮只做一件事：**堵住「本地测试文件搭着构建上生产」这条路**（原未完项第 3 条）。
运行时代码零改动，改的是构建打包和测试。

⚠️ 这一轮把之前那句「目前无害」证伪了一半：泄漏是**真的发生过**的 ——
第十五轮那份线上发布里，`/opt/mrright-portfolio.backup-20260814-162845/dist/uploads`
实际含 **20 个测试文件**（19 个 `pixel.png`）。它们确实从未被服务过（`/uploads`
的 express 挂载读的是持久目录，且注册在 dist 静态处理器之前），但那是**遮蔽规则**，
不是保证。现在线上 `dist/uploads` 已不存在，`find /opt/mrright-portfolio -name '*-pixel.png'` = 0。

⚠️ **以后改 `vite.config.js` 的插件列表，别顺手删掉 `dropUploadsFromBuild`** ——
删了它，`npm run deploy:vps` 会在打包前直接报错拦下（`scripts/lib/release-contents.mjs`），
不会静默地把 uploads 又装进发布包。

第十五轮做了两件事：**社区上传进入 Content Health**（并纠正了第十三轮记错的前提 ——
社区上传从来不进预览器，四个使用点全是下载链接），以及**屏幕适配**。

⚠️ 适配那部分挖出一个存在已久的严重问题：**公开页头在 640–950px 之间，
账号菜单被排到视口外再被 `overflow-x:hidden` 剪掉，平板和小笔电上无法登录。**
起因是桌面导航在 `sm`(640px) 就展开，而整条 header 要 ~960px。已把断点提到 `lg`。
**以后动 `Navbar.jsx` 或 `.nav-ul` 的断点，两边必须一起改** —— 同一个 `<ul>` 服务两种布局。

第十四轮：**Studio 环境光（IBL）第一次真正生效。**
用户提供 `monochrome_studio_02`（1K 影棚 HDRI）。原文件 5.65 MB（32 位浮点 + 一条
恒为 14.37 的无用 alpha），转成半浮点 + ZIP 后 **1.47 MB（-74%）**，
经站点同款 `EXRLoader` 往返校验：最大相对误差 0.0488%，逐行朝向一致。
旧的 `studio-tomoco.exr`（其实是个 shelf 缩略图）已删除，
`StudioEnvironment` 的 error 回调加了一行报错 —— 那是全文件唯一一处 `console.`。
详见下面「2026-08-14（第十四轮）」。

⚠️ **本机 `curl localhost` 会走机场代理**（`http_proxy=...:7897`），
请求会被静默转发到线上，"本地验证"其实在验证线上那份旧代码。
**测本地服务一律 `curl --noproxy '*'`。** 第十四轮踩过，详见那一节的教训。

第十三轮：`/admin` 新增 **Content Health** 分区 + `GET /api/admin/content-health`。
它把目录里每个 URL 在服务端真的打开，按**文件头**而不是扩展名判断格式，
并且查的是**被服务的那份**：构建产物看 `dist/`，上传文件看 `public/uploads`。
顺手修掉一个一直在误报「EN fallback」的翻译状态判断。
新增 `npm run test:content-health`，且做过变异测试。

⚠️ **这一轮的第一版上线后报了 7 条误报的 critical**，因为它对所有资源都要求
在 `dist/` 里，而线上项目的图片和模型全是 `/uploads/...`（从 `public/uploads` 提供）。
已在 `c54c787` 修掉并补了 fixture。**改这个检查器之前，先读那一节的教训。**
详见下面「2026-08-14（第十三轮）」。

第十二轮把 `/admin` 整个重做了：新增 `GET /api/admin/overview` 聚合接口、
分组侧边栏 + 待办角标 + ⌘K 命令面板、Dashboard 分区、System 分区。
（那一轮记的回滚路径 `...-032910` **已被保留策略清掉**，见上面的备份说明。）
详见下面「2026-08-14（第十二轮）」。

⚠️ 第十二轮把侧边栏里的 **Visitors 改名成 Members**，但没同步测试。
`tests/e2e/admin-visitors.spec.js` 里那两条一直红着，直到第十五轮才发现 ——
因为 **`npm run test:e2e` 默认打的是线上**（`E2E_BASE_URL` 不设就是 `https://mrright.blog`），
平时没人跑。**改后台导航文案时记得连测试一起改。**

⚠️ **`npm run deploy:vps` 的干跑开关只认字面量 `true`**：
`VPS_DRY_RUN=1` 是**假值**，会真的部署。要干跑必须写 `VPS_DRY_RUN=true`。
第十二轮就是这么误触发的一次真实部署（结果无害：脚本本来就会备份 env、
备份应用、健康检查、admin session 检查、清理旧备份）。

### 收工时的未完项（截至第二十三轮）

第十四、十五轮关掉了假 EXR 和社区上传无校验，第十六轮关掉了「测试文件漏进生产构建」，
第十七轮关掉了认证器绑定。第十八到二十一轮都没有关掉任何一条
（后台窄屏、拆文件、后台三语、react-router，都不在这张单子上），
但各自新增了：第十八轮加了第 6 条，第十九轮加了第 7、8 条，第二十轮加了 6b、6c。
**第二十二轮关掉了第 7 条**（`verify:visitor-studio`：是脚本错了），
且没有新增未完项。**第二十三、二十四轮都既没关也没开新的**
（两轮 SEO 衍生出来的都属于「可以做得更好」，进的是路线图不是这张单子；
第二十四轮撞见的那条中文标题错是数据不是代码，进的是「待你决策」）。
**第二十五轮没关掉任何一条，但开了两条新的（第 9、10 条）**。
**第二十六轮关掉了第 10 条，并且把第 9 条解决了一半**（改写在下面）。
现在开着的是：

9. **分享一条项目链接仍然要和 971 KB 的 three.js 抢带宽**
   （第二十五轮开的，**第二十六轮解决了一半**）。
   原来的问题是：面板出现前要下 16 个 JS、约 1489 KB，其中 971 KB 是它用不到的 three.js，
   线上实测 21.6s / 34.9s / 30.9s。
   **已经解决的一半**：那 971 KB 原来是被 `index.html` 里的 `modulepreload`
   在**每一个页面**上以最高优先级预载的（根因见第二十六轮那一节）。
   现在没有 3D 的页面一个字节都不下 —— 线上实测 `/account` 475 KB、
   `/login` 444 KB、`/community` 453 KB，**three.js 全是 0 KB**。
   可复现节流（1.6 Mbit/s）下项目详情：**9.6s / 1489 KB → 5.5s / 518 KB**。
   **还开着的一半**：首页和项目详情**仍然会并行拉 three.js**，
   因为 Hero 一挂载就 import 它。线上实测项目页三次 8.8s / 10.3s / 35.0s ——
   中位数比之前好很多，但方差极大，说明带宽争抢还在。
   要收尾就是让**冷启动进项目页时 Hero 晚一点挂载**。
   ⚠️ **第二十六轮试过这条路并且删掉了**：在 1.6 Mbit/s 节流下加不加都是 5.5s。
   **不是说方向错，是节流环境没复现出真实链路的争抢** ——
   再做这条之前，先想清楚怎么可靠地度量它，否则又是一次没有依据的改动。
   ⚠️ 这也是线上跑 e2e 时那 4 条项目详情用例偶尔超时的原因（断言超时 10s），
   不是功能坏了。

10. ~~**文档里的一句话会往生产 CSS 里加规则**~~ —— **2026-08-28 第二十六轮修掉了。**
   根因是 Tailwind v4 的自动内容检测从 git 根开始扫所有没被 gitignore 的文件，`.md` 也算：
   第二十四轮收工文档里写了一个工具类名，那个类就进了生产样式表，
   连带 CSS 和主 JS 的 hash 一起变、所有访客缓存失效。
   修法就是 `src/index.css` 顶部改成 `@import "tailwindcss" source("../src");`。
   样式表因此小了 1.4 KB（除了那条，测试文件里的类名也一并不再进来）。
   ⚠️ **根目录的 `index.html` 里没有任何 class**（改之前确认过），
   所以把扫描范围收进 `src/` 不会漏掉模板里的样式。
   以后**新增 `src/` 以外需要被扫描的模板，要记得加 `@source`**。

1. **模型「能加载」和「能渲染」仍然是两件事。**
   Content Health 现在能确认文件可服务、是真 GLB、所需扩展有解码器，
   但它**不渲染**。四个项目里只有灭火器被人眼确认真的画出来过
   （第十四轮又确认了一次：顶点 9,295 / 三角面 12,649）。
   验证渲染仍然要看这些统计值是不是有数字，不能只看页面能开。

2. **社区上传的检查目前无数据可验。** 第十五轮把 `community_uploads` 接进了
   Content Health，但线上 approved/pending 都是 0，所以 `communityUploads: 0 checked`。
   **等真有人上传后，要回去看一眼它报的东西对不对** —— 现在只有 fixture 和
   一条端到端测试证明它工作。

3. 4K 基础色 + 法线在移动端显存占用不小；真有人反馈卡，重跑
   `scripts/optimize-model.mjs` 出 2K 版（2.12 MB）即可。

4. **仪表盘故意没接内容健康的信号** —— 那个检查要读文件，
   而仪表盘是每次打开都拉的。想改成有 critical 时在侧边栏出角标的话，
   需要给它加缓存，别直接在 overview 里同步跑。

5. `H:\HDRIs\` 里还有三张 4K HDRI（photostudio / citrus orchard / qwantani dusk）。
   想做「按项目切换环境光」时可以复用第十四轮那套转换流程，**先降到 2K 再转**。

6b. **后台三语里有两处仍然是英文**（第二十轮，故意的）：
   带变量的 content-health hint（里面嵌了路径 / 体积 / 解析器报错），
   以及审计日志里的 action 名（`visitor.profile_disabled`）。
   要翻译前者，服务端得把那些值结构化发出来，而不是拼进句子里。

6c. **3D 运营星图不可 Tab 到**（第二十轮）。canvas 里的对象不在焦点顺序里，
   键盘用户走侧边栏、命令面板或平面视图（那里的节点是真按钮）。
   要补，得在画布上叠一层不可见的 DOM 焦点目标。

6. **公开主页那个遮挡修复只在本机验过**（第十八轮）。
   线上没有任何用户设过 handle，`/u/<handle>` 拿不到真实页面，
   所以「名字换行不再被横幅盖住」目前只有本机种子数据作证。
   等第一个用户设了 handle，去 440px 下看一眼那个页头。
   **第二十三轮之后这条多了一件要一起看的事**：那一刻 `/u/<handle>`
   会从 404 变成 200，并且第一次带上真实的 title / description / og:image（头像）。
   到时候顺手抓一次 HTML 确认一下，别只看页面开得出来。

7. ~~**`npm run verify:visitor-studio` 是红的**~~ —— **2026-08-19 第二十二轮定性并修掉了。**
   答案是**脚本错了**：`accountStudioUploadNow` 在 `92dfbae` 里和这份脚本
   一起进的仓库，**从来没有接到任何组件上**（`git log -S` 全仓确认）。
   上传表单一直是好的。**「按钮被拿掉了」这个可能性不成立。**
   现在脚本指向真实存在的标记并且通过。详见第二十二轮那一节。

8. **Members 详情那条窄屏修复，线上没有真人验过**（第十九轮）。
   440px 下的溢出是在本机用 fixture 量的（256px → 0），线上要看它得有
   `right` 的密码登进 `/admin`。**改动本身只有一行 CSS，且已确认打进了线上
   `index-2QBUCxlp.css`**，所以风险很低，但「真在手机上点开一个成员」这件事
   还没发生过。

第十一轮：**在 `/admin` 里做了自助重新绑定认证器的页面，带真正的二维码。**
起因是「我为什么从来没见过什么二维码」—— 查下来是这个项目里**根本就没有过二维码**：
CLI 的 `printEnrolment` 只打印文本密钥，`/admin` 连这个都不显示，
所以此前每个账号都是手输 base32 绑上去的，丢手机只能 SSH 上服务器跑 `reset-totp`。
详见下面「2026-08-14（第十一轮）」。

⚠️ **`9daf048` 含一处 schema 变更**（`admin_users` 加 `pending_totp_secret` /
`pending_totp_expires_at`，`ADD COLUMN IF NOT EXISTS`，服务启动时自动执行）。
部署即生效，无需手工跑 SQL；回滚只需回到上一个备份目录，多出来的两列不影响旧代码。

第十轮起因是一句「模型加载太慢，是服务器太差吗」。**不是慢，是根本加载不出来**：
次世代灭火器的 3D 预览会把 42.4 MB 下完，然后在解析阶段失败、永远停在 86%，
右侧顶点/三角面/材质全是 `Unknown`。原因是 drei 的 `useGLTF` 默认去
`www.gstatic.com` 取 Draco 解码器，而本站 CSP 是 `connect-src 'self'`，
请求被自己拦掉，报错只出现在没人看的 console 里。**任何 Draco 模型都会这样，
包括社区上传的。** 详见下面「2026-08-13（第十轮）」。

⚠️ 教训：第七轮记的「本地和线上（含真实模型预览）全部验证通过」是**不成立的** ——
当时只确认了页面能开、没有 CSP 上报，没有确认模型**真的渲染出来**。
以后验证模型预览，必须看顶点/三角面这些统计值是不是有数字。

第九轮做的是「下一轮建议」里的第 1 项：**命名管理员账号 + TOTP + 审计归因**
（详见下面「2026-08-13（第九轮）」）。至此「管理员」不再等于「知道 `ADMIN_TOKEN` 的人」：
用户名 + 密码 + 6 位码换会话，会话指向具体的人，动作写进 `admin_user_actions.actor_admin_user_id`。
静态 token 降级为**引导 / 救援凭证** —— 它仍能换会话（否则第一个账号无从创建），
但用它做的每件事在审计里都记为「无人」，`/admin` 页头会明说这一点。

**第一个管理员账号 `right` 已于 2026-08-13 12:30 UTC 创建并实测登录通过**
（`totp:confirmed`，10 枚恢复码未用）。创建时的密码 / TOTP secret / otpauth URL / 恢复码
写在 VPS 上一个 root 专属（`chmod 600`）的一次性文件里，**取走后就该 `shred -u` 删掉**，
路径当面给过，不写进这个仓库。

后续要加人或救援，都在 VPS 上跑（密码从终端读，不走 argv）：

```sh
cd /opt/mrright-portfolio
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' /etc/mrright-portfolio.env | cut -d= -f2-)"
node scripts/admin-user.mjs list
node scripts/admin-user.mjs create <用户名> --display-name "名字"
node scripts/admin-user.mjs reset-password <用户名>   # 忘了密码
node scripts/admin-user.mjs reset-totp <用户名>       # 换手机 / 怀疑泄露
```

只取 `DATABASE_URL` 这一行，而不是 `. /etc/mrright-portfolio.env` 整份 source：
整份 source 会把 `ADMIN_TOKEN` 等一并灌进当前 shell 及其所有子进程的环境，
这个脚本只需要数据库连接。（那份 env 本身是可以被 source 的，没有含空格的裸值，
这里是范围最小化，不是绕开语法问题。）

上一轮（第八轮）：**把密钥认证的部署路径固化进 `npm run deploy:vps`**，
所以这次部署是直接一条命令跑完的，不用再手工拼远端脚本。
新文档：`docs/OPERATIONS_DEPLOY.md`（部署方式、环境变量、干跑、测试、回滚）。

### 第七轮（2026-08-12）的三件事，仍然有效

**线上曾运行 `2cdb97d`（2026-08-12 14:09 UTC 部署，已逐项验证）。**

那一轮做完三件事，并且**把积压的「待你决策」清单清空了**（详见下面「2026-08-12（第七轮）」）：

1. **CSP 已从 report-only 切成 blocking 并上线。** report-only 期间只报了两条违规，
   两条都是策略自己写漏了：补 `scriptSrc: ["'self'", "'wasm-unsafe-eval'"]` 与
   `connectSrc: ["'self'", 'blob:']` 后切换，本地和线上（含真实模型预览）全部验证通过，
   部署后收集器 0 上报。`report-uri` 保留，它是没走到的代码路径唯一的报警渠道。
2. **DMARC 已上线并实测 PASS**（方案 B：Cloudflare Email Routing 把 `dmarc@mrright.blog`
   转发到 Gmail，`rua` 指向这个同域地址）。**用户已在 Gmail「显示原始邮件」确认
   SPF / DKIM / DMARC 三行全 PASS。**
3. **两个遗留物清掉了**：`sniproxy.service`（10 天失败 13176 次的重启循环）已停用；
   `/etc/nginx/proxy.conf`（从没被加载过的 Docker 镜像加速模板）已移出 `/etc/nginx`。

**回退办法**：`server/index.js` 的 `contentSecurityPolicy` 里加回 `reportOnly: true`
即可退回只观察不拦截；或直接回滚到 `/opt/mrright-portfolio.backup-20260812-140940`。

~~**注意部署方式变了**：`npm run deploy:vps` 在这台机器上跑不了~~ ——
**2026-08-13 第八轮已固化，这条限制不再成立。** 直接 `npm run deploy:vps` 即可（默认密钥认证）。

### 上一轮（第六轮）的三件事，仍然有效

1. 应用备份改硬链接 + 自动保留策略 —— 一份备份 351M → **34M**，磁盘 49% → **42%**
2. 修掉部署脚本里一个**一直存在的健康检查竞态**（第一次部署就是被它挂掉的）
3. **`ADMIN_ALLOW_STATIC_TOKEN=false` 已收紧并上线** —— 静态管理员令牌现在只能换会话，
   不能直调 API。回退办法见 `docs/OPERATIONS_ADMIN_AUTH.md` 第 2 步。

**收紧后如果要手动调管理端 API，必须先换会话**（直接带静态令牌会 401）：

```sh
SESSION=$(curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://mrright.blog/api/admin/session \
  | node -e 'let s="";process.stdin.on("data",d=>{s+=d}).on("end",()=>process.stdout.write(JSON.parse(s).data.session.token))')
curl -s -H "Authorization: Bearer $SESSION" https://mrright.blog/api/admin/summary
curl -s -X DELETE -H "Authorization: Bearer $SESSION" https://mrright.blog/api/admin/session  # 用完吊销
```

**MCP 已确认可用：** `mrright-ops` 与 `playwright` 在第七轮的新会话里都正常工作
（第六轮重新写入 `~/.claude.json` 的 `mcpServers` 之后需要开新会话才生效，现已生效）。
CSP 这件事能做完，就是因为 playwright 回来了。

### 待你决策的（我没有权限或不该替你决定）

- **`crimson-rune-greatsword` 的中文标题和中文简介是另一个项目的**
  （2026-08-26 第二十四轮截图时撞见，**不是本轮改出来的，是数据本身**）。
  线上 `/api/projects` 里它的 `titleZh` 是「暗影祭坛烛台」、
  `summaryZh` 是那款祭坛壁饰的介绍，而 `title`（赤焰符文长剑）、
  `titleEn`（Crimson Rune Greatsword）、`titleJa`（紅炎ルーン大剣）都是对的 ——
  看起来是照着上一个项目建条目时中文两栏没改。
  **后果**：中文界面里两张卡片同名同简介（首页截图上一眼可见）；
  英文和日文不受影响，本轮新加的 `<head>` 读的是英文栏，所以分享卡片是对的。
  **没替你改**，因为这是你的产品文案，正确的中文标题只有你知道。
  改法：`/admin` 的 Projects 分区直接编辑那两栏即可，不需要跑 SQL。

- **17 个「写了三份翻译、谁也不渲染」的 i18n key，要不要删**（第二十二轮发现）。
  它们是：`accountCenterIntro` / `accountCenterTitle` / `accountDeleteTitle` /
  `accountOverviewIntro` / `accountOverviewTitle` / `accountReloginAction` /
  `accountSessionExpired` / `accountSessionExpiredTitle` / `accountStudioKicker` /
  `accountStudioOpen` / `accountStudioUploadNow` / `authFlowReset` /
  `authHaveAccount` / `authNeedAccount` / `authResetSuccess` /
  `commentStatusPending` / `commentStatusSpam`。
  每个都有中/英/日三份，共 51 条字符串。
  `git log -S` 确认**它们全都从没被任何组件引用过**——是「写了没接上」，
  不是「接过又删了」，所以删掉不会让任何界面变空。
  没替你删，是因为这是翻译好的产品文案，哪些是将来还要用的只有你知道。
  **不删也没关系**：清单已经钉在 `tests/unit/i18n-usage.spec.js` 里，
  第 18 个出现的当天测试就会红。
  （要删的话：从 `src/lib/i18n.js` 的三份词典里各删一遍，
  再把那份清单同步掉，`npm run test:unit` 会告诉你有没有漏。）

（第二十轮那条「要不要上线」当天就定了：已 push、已部署。）

- ~~计数角标在窄屏下位置发飘~~ —— **2026-08-16 第十八轮做掉了。**
  实际肇事的类是 `.admin-section-header`（不是记录里写的 `.admin-panel-head`），
  它用的是 `items-center`，于是角标被垂直居中到「标题 + 说明文字」整块的中间，
  跟谁都不齐。改成 `items-baseline` —— flex item 的基线取自它的第一行，
  所以标题后面还有几行都不影响。当时之所以挂起是因为这个容器全站后台共用，
  第十八轮正好整体走了一遍 440px 和 1280px，改前改后都看过。

下面是历史上已结清的四项，保留作为记录。

**2026-08-12 第七轮把当时积压的四项全部结清。** 下面是它们各自的去向。

**已由你拍板、不再是未决项的：**

- ~~`/etc/nginx/proxy.conf`~~ —— **2026-08-12 已查清并清理，顺带纠正了一条我们自己写错的记录。**
  **它并没有「占用 443」** —— 之前几轮一直这么写，是错的。它**根本没被 nginx 加载**：
  `nginx -T` 列出的加载文件只有 `nginx.conf` / `mime.types` / `modules-enabled/50-mod-stream.conf` /
  `sites-enabled/mrright-portfolio` / `sites-enabled/mrright-portfolio-internal-ssl` /
  `stream-conf.d/mrright-sni.conf`，而 nginx.conf 的 include 只覆盖 `conf.d/*.conf`、
  `sites-enabled/*`、`stream-conf.d/*.conf`、`modules-enabled/*.conf`，**没有一条匹配得到它**。
  最干净的反证：它的证书路径是占位符 `<your 'domain.pem' path>`，
  **一旦被加载 `nginx -t` 必然失败**，而每次部署 `nginx -t` 都是通过的。
  内容是从没填过的 Docker Hub 镜像加速模板（`proxy_pass https://registry-1.docker.io`，
  `server_name <write your domain>`），文件停在 2024-09-22。
  处置：**不删，移出 `/etc/nginx`** → `/root/legacy-nginx-proxy.conf.20260812.bak`
  （万一将来谁加了 `include /etc/nginx/*.conf` 也不会被误捡）。
  **全程没有 reload nginx** —— 它本来就没被加载，没有理由为它去动 443。
  移动后复验：`nginx -t` 通过、加载文件列表一字未变、80/443 仍 3 个监听、
  `/` 200、`/community` 200、`/api/health` 200。
- ~~DMARC 记录~~ —— **2026-08-12 已添加、上线并端到端实测通过**（方案 B，报告收在自己域内）。
  `_dmarc.mrright.blog` = `v=DMARC1; p=none; rua=mailto:dmarc@mrright.blog`。
  **用户已在 Gmail「显示原始邮件」确认 DMARC = PASS**（第一封显示 FAIL 是 DNS 否定缓存，
  不是配置错，原因见下方第七轮记录）。此项完全结案。

- ~~备份异地副本~~ —— **2026-08-12 你明确答复「不需要异地备份」，此项关闭。**
  保留一句风险说明作为背景，不再当作待办：备份与数据库仍在同一块磁盘上，
  硬链接备份防得住误删（`unlink` 只减链接数），但**磁盘或文件系统损坏会让 live
  和全部备份一起没**。`docs/OPERATIONS_BACKUP.md` 里的 rclone 方案留着，哪天改主意可直接用。
- ~~`sniproxy.service` 无限重启失败~~ —— **2026-08-12 已按你的指示停用**，见下方第七轮记录。

### 下一轮我建议先做的

1. ~~管理员账号体系 + TOTP~~ —— **2026-08-13 第九轮已完成并上线**。剩下的收尾（都不大）：
   - **审计归因目前只覆盖两条路径**（资料可见性、资料字段清理），因为只有这两处会写
     `admin_user_actions`。要扩大覆盖面，得先给其他管理动作补审计写入。
   - 没有「改自己密码」的接口，只能用 CLI `reset-password`。
2. ~~把密钥认证的部署路径固化进 `scripts/deploy-vps.mjs`~~ —— **2026-08-13 第八轮已完成并实测部署**。
2b. ~~**把资源检查接到社区上传上**~~ —— **第十五轮已完成并上线。**
   ⚠️ **这条原来写的建议是错的**，别照着做：它说「最好在接收时就拒掉不是 GLB 的文件」。
   但 (a) 按 magic bytes 拒收**早就有了**（`fileSignatures`），
   (b) 社区上传**从来不进预览器**，四个使用点全是 `<a href>` 下载链接，
   允许的扩展名本来就含 `.obj` / `.fbx` / `.zip` —— 所以「渲染不了就拒收」会拒掉能用的文件。
   实际做的是查「行还在、文件没了」。详见第十五轮那一节。
3. ~~拆 `Admin.jsx` 与 `postgresStores.js`~~ —— **2026-08-17 第十九轮做完了**。
   `Admin.jsx` 2963 → 1301，`postgresStores.js` 4095 → 40，
   新代码在 `src/lib/admin/`、`src/components/admin/`、`server/postgres/`。
   现在最大的文件是 `server/postgres/adminStore.js`（1770 行）。
   **它还可以再拆**（summary / moderation / members / audit 四块），
   但已经不再和别的东西挤在一个文件里，所以不急。
3b. ~~**后台窄屏排版整体再走一遍**~~ —— **2026-08-16 第十八轮做完了**，
   十一个分区在 440px 下逐个看过，详见下面那一节。
   剩下**没做**的两处小的，都属于「知道但故意没动」：
   - Downloads 里已经是 approved 的行仍然显示 Approve 按钮（点了是空操作），
     Community 的上传行同理。要改就是按当前状态禁用对应按钮。
   - `.visitor-stat-line` 那条规则也是死的（`.admin-row span` 的 text-xs
     和颜色压过它）。没修是因为它现在的样子跟旁边几行元信息是一致的，
     「修好」反而会让它比邻居更大更亮。哪天统一改后台字号时再一起处理。
3c. ~~**后台三语 + 动画 + 仪表盘 3D**~~ —— **2026-08-18 第二十轮做完并上线了。**
   衍生出来三条小的，都不急：
   - **3D 运营星图不可 Tab 到**（canvas 里的对象不在焦点顺序里）。要补就是在画布上
     叠一层不可见的 DOM 焦点目标；现在键盘用户走侧边栏、⌘K 或平面视图。
   - **服务端写的诊断文案仍是英文**：content-health 里带变量的 hint、
     以及审计日志的 action 名。要翻译，得让服务端把路径/体积/报错**结构化发出来**，
     而不是拼进句子里 —— 那是服务端改动，不是前端补字典。
   - 第十八轮留下的「后台字号统一」还没做（`.visitor-stat-line` 那条死规则等的就是它）。
     现在多了一套 `admin-animate-in` 的进场类，统一字号时**记得把新类名也加进
     `index.css` 末尾那个 reduced-motion 块**。
4. ~~react-router~~ —— **2026-08-19 第二十一轮做完并上线了。**
   衍生出来两条，都不急：
   - **回到首页时 3D 场景仍然会重建**（`HomePage` 被卸载了）。真正省下的是
     整份文档的重建和 bundle 重新解析，不是场景本身。要连场景一起留住，
     得让首页在路由切换时保持挂载（比如藏起来而不是卸载），那是另一件事。
   - **`/admin` 没有进这个 router**，它仍然是 `main.jsx` 里那个独立入口
     （`pathname.startsWith('/admin') ? Admin : App`）。**这是刻意的**：
     访客不该下载 185 kB 的后台包，而且站内没有任何链接指向 `/admin`。
     后台内部的分区切换也不走 URL，接进来得先给它设计 URL 结构。
5. ~~前端单元测试~~ —— **2026-08-19 第二十二轮做完了**（未部署，本来也没有运行时改动）。
   `npm run test:unit`，六个文件 106 条，CI 里排在 build 之前。
   衍生出来一条：**17 个「写了三份翻译、谁也不渲染」的 key**，
   清单钉在 `tests/unit/i18n-usage.spec.js` 里，删不删见「待你决策」。
   还没测的：组件渲染（那一层目前由 Playwright 覆盖）、`modelConversion.js`、
   `useDialogAccessibility.js`、`motion.js`。
6. ~~SSR / 预渲染 SEO~~ —— **2026-08-22 第二十三轮做完并上线了**，
   走的是**服务端注入 `<head>`**，不是 SSR（方案对比见
   `docs/adr/ADR_WEB_SEO_RENDERING_STRATEGY.md`）。衍生出来四条，都不急：
   - ~~**项目没有自己的 URL**~~ —— **2026-08-26 第二十四轮做完并上线了**，
     走的就是这里写的 `/projects/:slug`。四个项目现在各自有 canonical、
     各自有 `og:image`（自己的渲染图，不再是全站那张灭火器），
     并且各自列进了 sitemap。详见下面「2026-08-26（第二十四轮）」。
   - ~~**没有 JSON-LD**~~ —— **2026-08-26 第二十五轮做完并上线了**，
     而且**「挡住它的是 CSP」这句话是错的**：`ld+json` 是 data block，
     CSP 根本不检查它，实测确认（详见下面「2026-08-26（第二十五轮）」和
     `docs/adr/ADR_WEB_SEO_RENDERING_STRATEGY.md` 第 8 节）。
     最终**没有动 CSP 头**，没有 hash 也没有 nonce。
   - **分享卡片的图还是全站一张灭火器**（公开主页除外，那里用头像）。
     帖子想要自己的图，得先有「帖子配图」这个概念。
   - **`<noscript>` 里是纯文本，不是真页面**。不跑 JS 的爬虫看到的是标题+正文，
     不是排版。真要让版面本身参与排名，那才轮到 SSR。
7. Asset Model（checksum / visibility / downloadPolicy）稳定后再回到 C++ SDK
8. 下次恢复演练建议在 2026-11 之前（`docs/OPERATIONS_BACKUP.md` 要求每季度一次）
9. CSP 还可以再紧一格：`style-src` 现在带 `'unsafe-inline'`（Tailwind 与 three.js 的内联样式），
   要去掉得先上 nonce 或 hash，不是小改动，暂不动。

### 环境事实，省得下次重查

- **不装 MCP 也能干 VPS 的活。** `mrright-ops` 本质就是 `ssh -o BatchMode=yes root@147.79.20.232`，
  本机 SSH 密钥可直连，Bash 里直接用即可。
- **本机 `grep` 和 `find` 都是 shell function**（Claude Code 装的，转发到 claude 二进制），
  而那个 native 二进制没装好，所以直接跑会报 "claude native binary not installed"。
  用 `command grep` / `command find`（或 `/usr/bin/...`）绕过。
  ⚠️ 它**不是报错就完事** —— 管道里那一段会静默地变成空输出，
  `command find ... | wc -l` 写成 `find ... | wc -l` 就会得到 0，看着像「干净」。
- **本机有 `http_proxy=http://172.29.176.1:7897`**（WSL 指向 Windows 宿主，
  `https_proxy` 和大写同名变量都有），curl 默认遵守它，**连 localhost 也走代理**。
  ⚠️ 第十四轮实测的后果比「502」严重得多：**请求被转发到了线上 mrright.blog 并返回真实响应** ——
  本地新加的 `.exr` 返回 index.html（线上没这文件，走了 SPA fallback），
  `/api/health` 却返回真 JSON，响应头还带着 `report-uri /api/csp-report`。
  识别信号：**`ss -tlnp` 显示端口上只有 vite、没有 Express，响应却像 Express。**
  **测本地服务一律加 `curl --noproxy '*'`。** 不加的话「本地验证通过」可能是在验证线上旧代码。
- **这台机器原来没有中日文字体**（第二十轮才发现）。本机截图里中文和日文全是方框，
  和站点无关 —— `fc-list | grep -i cjk` 为空。已经装上：
  `apt-get install -y fonts-noto-cjk`（走 `-o Acquire::http::Proxy=http://172.29.176.1:7897`）。
  ⚠️ **评审三语界面前先确认字体在**，否则会对着一屏豆腐块判断排版。
- **Playwright 不受上面那个代理影响**（第二十轮实测：不清 `http_proxy` 直接跑，
  对 `http://127.0.0.1:5173` 一样通）。Chrome 默认绕开 loopback，
  所以只有 `curl` 需要 `--noproxy '*'`。
- **`npm run test:e2e` 默认打线上**（`E2E_BASE_URL` 不设即 `https://mrright.blog`）。
  要测本地构建：`E2E_BASE_URL=http://127.0.0.1:<port> npx playwright test tests/e2e/`
  —— 但 vite preview 没有 API，依赖接口的用例会失败，这是预期的。
  ⚠️ **部署重启后立刻跑 e2e 会有偶发失败**（服务冷启动），等一会儿再跑。
- **`npm run test:api:db` 在这台机器上能跑**：它自己 `initdb` 一个临时 Postgres 集群、
  跑完销毁，不碰任何现有数据库。第十六轮实测 68 通过。
  ~~⚠️ 它每跑一次会在 `public/uploads/images/` 留一个 `pixel.png`~~ ——
  **第十六轮起会自己清理**：跑之前先快照 `public/uploads`，`afterAll` 里只删这一轮新增的文件
  （删之前还要确认路径在 `public/uploads` 之内），跑完那个目录的文件数不变。
  日志里会打印 `[contract.db] removed N test upload(s)`。
- **但 playwright MCP 的浏览器能访问 `http://127.0.0.1:<port>`**（第七轮实测）。
  它是独立进程，不受上面那个沙箱限制 —— 所以「本地起服务 + 浏览器验证」这条路是通的，
  不用拿线上冒险。
- **本机可以把带数据库的 `/admin` 完整跑起来**（第十七轮第一次做到，
  以后要改后台 UI 就不必再对着线上或凭空改）。本机 `systemd` 里有 Postgres 16 在跑，
  但 `postgres` 角色走 TCP 要密码，所以**新建一个本地专用角色和空库**（别动现有角色的密码）：

  ```sh
  su postgres -c "psql -c \"CREATE ROLE mrright_local LOGIN PASSWORD '<自己生成>'\" \
                       -c 'CREATE DATABASE mrright_local_dev' \
                       -c 'GRANT ALL ON DATABASE mrright_local_dev TO mrright_local'"
  su postgres -c "psql -d mrright_local_dev -c 'GRANT ALL ON SCHEMA public TO mrright_local'"
  # 服务端启动时会自己在这个空库里建表
  DATABASE_URL='postgres://mrright_local:<密码>@127.0.0.1:5432/mrright_local_dev' \
    PORT=4199 ADMIN_TOKEN=local-demo-not-a-secret node server/index.js
  ```

  它服务的是 `dist/`，所以**改完前端要重新 `npm run build` 才看得到**。
  进后台不需要 `right` 的密码：用那个假的本地 `ADMIN_TOKEN` 换一个会话塞进
  `localStorage['mrright-admin-token']` 即可（`/api/admin/session`）。
  ⚠️ 换会话要**把 token 放在 `Authorization: Bearer` 头里**，
  放 body 里会被当成没带、直接 401。
  ⚠️ 这个库是**本机 scratch**，与 VPS 上的 `mrright_portfolio` 毫无关系；
  用完可以留着，下次直接起。
  - **角色的口令没有记在任何地方**（每轮临时生成、只用于这个 scratch 库）。
    下次要用就直接重设一个：
    `su postgres -c "psql -q -c \"ALTER ROLE mrright_local PASSWORD '<新生成的>'\""`
    ⚠️ **第十九轮这条命令被权限策略挡下了**（改角色口令属于要人点头的动作）。
    真被挡住时不用僵在那里：**看后台 UI 有不需要数据库的那条路**
    （下面「想看后台真实长什么样」那条），只有要验真实 SQL 时才非起库不可。
  - **库里现在有一套种子数据**（第十八轮塞的，专门用来看后台密度）：
    6 个访客（含一个未验证 + 被管理员停用公开资料的）、8 条项目评论
    （4 published / 3 pending / 1 spam）、5 个社区帖子 + 6 条社区评论、
    3 个社区上传（approved / pending / rejected，文件都不存在，
    所以 Content Health 会如实报 broken 和 degraded —— 那是对的，不是 bug）、
    4 条留言、5 条下载申请、点赞和下载事件若干。
    名字里故意混了长德语姓、西班牙语双姓、中文和单字名，用来撑换行。
  - 想造一个能登录的访客：`POST /api/auth/register`，
    然后直接在库里 `UPDATE visitor_users SET email_verified_at=now()`
    （本机没有 SMTP，验证码发不出来），再 `POST /api/auth/login`
    拿 token 塞进 `localStorage['mrright-visitor-token']`。
- **服务端不设 `DATABASE_URL` 也能起**（`server/index.js:108` 是三元回落到内存 store），
  想在本地跑真实构建验证前端行为时很有用，社区/后台会降级但页面照常渲染。
- **`npm run deploy:vps` 现在在这台机器上能跑**（2026-08-13 第八轮起，默认走 SSH 密钥认证，
  默认主机 `147.79.20.232`）。想先看远端脚本而不连服务器：`VPS_DRY_RUN=true npm run deploy:vps`。
  ⚠️ **只认字面量 `true`** —— `VPS_DRY_RUN=1` 是假值，会真的部署（第十二轮踩过）。
  完整说明见 `docs/OPERATIONS_DEPLOY.md`。
- **本地可跑的检查一览**（不需要数据库、不需要联网）：

  ```sh
  npm run lint
  npm run build
  npm run test:openapi         # 规格文件与错误码
  npm run test:content-health  # 资源完整性检查器（对着故意做坏的 fixture 树）
  npm run test:admin-totp      # RFC 6238 向量 + 重放 + 恢复码
  npm run test:deploy-backup   # 备份硬链接与保留策略
  npm run test:deploy-script   # 远端脚本语法/引号/无密钥
  ```

- **想看后台真实长什么样，不用连线上**：起 `npm run dev`，用 Playwright 拦截
  `**/api/admin/**` 喂假数据即可（第十二、十三轮就是这么核对布局和空状态的）。
  从 scratchpad 目录跑脚本时，Node 的 ESM 解析找不到 `node_modules` ——
  建软链指向仓库的 `node_modules`，或者更省事：**直接写绝对路径 import**，
  例如 `import { EXRLoader } from '/root/Code/3d-portfolio/node_modules/three/examples/jsm/loaders/EXRLoader.js'`
  （它内部对 `three` 的裸导入会相对自身位置解析，照样能找到，第十四轮就是这么转的 HDRI）。
- ⚠️ **拦截 `**/api/admin/**` 喂假数据时注意 Playwright 的路由优先级：
  后注册的先匹配。** 通配规则要先注册，具体路由后注册，否则具体的那条会被通配吃掉
  （第十五轮在这上面卡过一次，表现是面板显示「none stored」）。

## 第五轮收工时的快照（2026-08-11，已冻结，不要照着它动手）

> **这一节是历史，不是当前状态。** 待办与决策清单已在上面的「下次从这里继续」里重新整理过；
> 这里保留原文只是为了看得到当时的判断。当时线上跑的是 `47d1cfc`，
> 下面第 3、5 两项都已在第六轮完成。

**当时已经不需要再排查的事（这部分仍然有效）：**

- 真实客户端 IP 拿不到 —— 原因已查明（443 与机场节点共用 SNI 分流），**已决定不修**，
  已用不依赖 IP 的方案补偿。见 `docs/OPERATIONS_CLIENT_IP.md`。**动 nginx 或 443 之前必读这份文档。**
- 2026-07-25 审查的 7 项 —— 全部确认修复并已上线，包括线上 `/api/v1` 严格信封确实生效。

**待你决策的（我没有权限或不该替你决定）：**

1. ~~配置 SMTP~~ —— **2026-08-11 第五轮已完成并端到端验证通过**（Resend）。
   密码重置邮件已实测**直达 Gmail 收件匣，未进垃圾箱**。详见下方第五轮记录。
   仅剩一项可选加固：**DMARC 记录仍未添加**（不加也能进收件匣，加了更稳）：
   `_dmarc.mrright.blog` TXT `v=DMARC1; p=none; rua=mailto:<你的邮箱>`。
2. **备份异地副本**（现在是最优先的未决项）。当前备份和数据库在同一块磁盘上，磁盘坏了两者一起没。
   恢复演练已证明备份**内容**可还原，但没有解决**同盘**这个单点。
   `docs/OPERATIONS_BACKUP.md` 里有 rclone 方案。
3. ~~`/opt/mrright-portfolio.backup-*` 的保留策略~~ —— **2026-08-12 第六轮已完成并上线**：
   硬链接备份 + 保留最近 3 份的自动裁剪。一份 351M → 34M，磁盘 49% → 42%。
   历史：2026-08-11 第四轮按你的指示手工清理过一次，15 份删到 3 份，磁盘 78% → 49%。
4. ~~**`/etc/nginx/proxy.conf`**~~ —— **2026-08-12 第七轮已查清并清理。**
   **当时写的「占用 443」是错的**：`nginx -T` 证明它根本没被加载。详见顶部说明。
5. ~~设 `ADMIN_ALLOW_STATIC_TOKEN=false`~~ —— **2026-08-12 第六轮已完成并上线**。
   卡住它的两个调用方（部署脚本、admin E2E 套件）已改成先换会话再调 API。
6. ~~CSP 切 blocking~~ —— **2026-08-12 第七轮已完成并上线**，见下方第七轮记录。

**路线图** —— 已上移到顶部「下一轮我建议先做的」，不在这里维护，免得两份清单各走各的。
这一轮当时勾掉的两项留作记录：

- ~~恢复演练~~ —— 2026-08-11 第四轮已完成，顺带修好了文档里一个从来没能跑通的步骤。
- ~~演练遗留的临时库~~ —— 用户已确认，`mrright_restore_drill` 已 `dropdb`（2026-08-11）。
  删除后复查：`mrright_portfolio` 仍在、17 张表、`visitor_users=1`/`project_comments=2`、
  `/api/health` 200，生产库未受影响。

## 2026-08-28（第二十六轮）：全站不再预加载 971 KB 的 three.js

未完项第 9 条。**前端组件和服务端都一行没动，改的是构建。**

### 找根因的过程

第二十五轮量到的是「面板出现前要下 1489 KB，其中 971 KB 是 three.js」。
直觉的修法是**冷启动进项目页时别挂载 Hero**（Hero 是首页唯一的 3D 消费者），
本轮先照这个直觉写了：`useDeferredHero`，用 `requestIdleCallback` 推迟挂载。

**量下来几乎没变：1489 KB → 1437 KB。** 少掉的 51 KB 正好是 Hero 自己那个 chunk，
**971 KB 的 three.js 一个字节没少**。所以拉 three.js 的不是 Hero。

去翻构建产物才看清：

```text
index.html:  <link rel="modulepreload" href="/assets/three-core-….js">
             <link rel="modulepreload" href="/assets/three-fiber-….js">
index-….js:  import"./three-core-OedqFwLA.js";      ← 入口的静态 import
```

**入口静态依赖 three。** 再往下查是分包的锅：`three-fiber` 这个手工 chunk 里
除了 fiber/drei，还混进了 **vite 的 `preload-helper`**。
那个 helper 不是任何模块的依赖，rollup 爱放哪放哪；
而**入口自己要用它**来做懒加载 —— 于是入口只能静态 import `three-fiber`，
`three-fiber` 又静态 import `three-core`，
vite 再顺理成章地给这两个挂上 `modulepreload`。

**每一个页面**都在最高优先级预载 971 KB 的 3D 引擎，
`/account`、`/login` 这种一个 canvas 都没有的页面也不例外。

### 修法（一行）

```js
if (normalizedId.includes('vite/preload-helper')) return 'react-vendor'
```

`react-vendor` 本来就是入口的静态依赖，helper 放那里不增加任何成本；
three.js 则回到了它该在的位置 —— **Hero 或模型预览真的挂载时才去取**。

改完 `index.html` 里只剩 `react-vendor` 一条 modulepreload。

### 数字

可复现节流（1.6 Mbit/s / 150ms RTT，本机 express，各跑三次取一致值）：

| | 之前 | 之后 |
|---|---|---|
| `/projects/:slug` → 面板可见 | 9.6s / 1489 KB（three.js 971 KB） | **5.5s / 518 KB（three.js 0 KB）** |
| `/` → `#projects` 可见 | 9.1s / 1427 KB | **5.0s / 456 KB** |

线上（同一台机器、同一条链路，可与第二十五轮的 21.6/34.9/30.9s 对比）：

```text
/account            475 KB JS   three.js 0 KB
/login?mode=login   444 KB JS   three.js 0 KB
/community          453 KB JS   three.js 0 KB
/projects/md-leimu  8.8s / 10.3s / 35.0s      ← 中位数好很多，但方差还很大
/                   6.7s / 6.2s / 7.0s
```

⚠️ **线上那个字节数别照着读**：脚本统计的是「选择器可见之前」收到的 JS，
而首页和项目页的 Hero 仍然会并行拉 three.js，快链路上它往往赶在面板之前到达，
所以线上项目页仍然记成 1488 KB。**真正确定的是 `modulepreload` 没有了**，
以及没有 3D 的页面确实一个字节都不下。
这一半没解决的部分留在未完项第 9 条里。

### 那段被删掉的改动

`useDeferredHero`（冷启动进项目页时用 `requestIdleCallback` 推迟挂载 Hero）
写完、量完、**删掉了**：分包修好之后，加它 6.1s/7.5s，不加 5.5s ——
不但没有增益，还多一个 hook、一个占位分支和一处单向状态。
**删掉不代表这个方向错**，只代表节流环境没有复现出真实链路上的带宽争抢；
要再做得先有可靠的度量办法。（和第二十五轮那套 CSP hash 一样：写了、量了、删了。）

### 顺手关掉的未完项第 10 条

`src/index.css` 顶部：

```css
@import "tailwindcss" source("../src");
```

Tailwind v4 的自动内容检测从 git 根开始扫所有没被 gitignore 的文件，`.md` 也算 ——
第二十四轮收工文档里写了一个工具类名，那个类就进了生产样式表。
钉住扫描范围后样式表小了 1.4 KB。
**改之前确认过根目录 `index.html` 里没有任何 class**，不会漏掉模板里的样式。

### 验证

| 项 | 结果 |
|---|---|
| `npm run lint` | 通过 |
| `npm run test:unit` | 166 通过 |
| `npm run build` | 通过 |
| `npm run test:api` | 58 通过 / 13 skipped（新增 1 条：任何页面都不得 modulepreload `three-*`） |
| `npm run test:api:db` | 86 通过 / 0 失败 |
| `npm run test:openapi` | 通过 |
| `npm run test:deploy-backup` / `test:deploy-script` | 通过 |
| `npm run test:admin-totp` / `test:content-health` / `verify:visitor-studio` | 通过 |
| `git diff --check` | 通过 |
| 本机 express + `site-routing.spec.js` | 13 通过 |
| 本机真实浏览器 | 首页 Hero canvas 在、模型预览 canvas 在、`/admin` 正常，报错 0 |
| 440px / 1280px 截图 | 排版无变化，横向溢出 0（Tailwind 收窄扫描范围后复查） |
| 部署前 env 检查 | `DATABASE_URL` / `ADMIN_TOKEN` 均为 `[set]`（未输出 value） |
| 部署前备份 | `/opt/mrright-portfolio.backup-20260828-051131` |
| VPS 部署 | 成功，服务重启成功 |
| 线上 | 七条路由全 200，四条路由的 modulepreload 只剩 `react-vendor`，JSON-LD 图谱仍在 |

⚠️ **本轮部署输出是用 `tee` 一次抓全的**，没有为了补看一行而重跑部署
（第二十五轮的教训）。

### 改动的文件

- `vite.config.js`
- `src/index.css`（只有顶部那行 import）
- `tests/api/contract.spec.js`

commit：`cc52af3`（代码）+ 本次文档提交
回滚点：`/opt/mrright-portfolio.backup-20260828-051131`

## 2026-08-26（第二十五轮）：JSON-LD，以及被推翻的那个 CSP 前提

第二十三轮衍生清单的第二条。**纯服务端，`src/` 一行没动。**

### 起因，以及第一件事是先去量

第二十三轮把 JSON-LD 列为「不做」，理由写得很具体：`ld+json` 在 CSP 眼里就是
script，而本站 `script-src` 是 `'self' 'wasm-unsafe-eval'` 没有 inline 余地，
所以要么每次响应算 sha256 塞进 CSP 头，要么放宽策略。

**本轮先照这个理由把那套 hash 机制写了出来**：`renderSeoHtml` 返回
`{ html, cspSource }`，服务端把 helmet 已经设好的头读回来、往 `script-src`
里拼一个 `'sha256-…'`，头拼不成就不发那段脚本。写完之后才去量它到底需不需要。

**量下来是不需要。** 真实 Chromium，两个只有响应头不同的合成页面 ——
一个 `script-src` 里带匹配的 `'sha256-…'`，一个不带 —— 各含一段内联
`<script type="application/ld+json">`。两次都是：元素在 DOM 里、内容能 `JSON.parse`、
`securitypolicyviolation` **0 条**、console 报错 **0 条**。

原因很清楚：`type` 不是 JavaScript MIME 类型的 `<script>` 是 **data block**。
HTML 的「prepare the script element」算法对它提前 return，
**元素压根不会被准备执行**，那道它过不了的 CSP 检查也就永远走不到。
`script-src` 管的是执行，而这里没有执行。

⚠️ **第一版探针得出的「两边都没违规」是靠不住的，差点被它骗过去。**
那个监听 `securitypolicyviolation` 的脚本自己就是一段内联 `<script>`，
**它才是被 CSP 拦掉的那个** —— 所以 `window.__violations` 根本没建起来，
两边都读到空数组。把监听器换成 `addInitScript`（跑在隔离世界、不受页面 CSP 约束）
之后结果才可信。**一个静默失败的安全检查，长得和一个通过了的安全检查一模一样。**

然后用线上那份真策略（带 `report-uri`、`upgrade-insecure-requests`）
在本机服务上跑 `/`、`/community`、`/projects/:slug`、`/account` 四条路由复验：
图谱都在、都能解析、违规 0 条、报错 0 条。

**于是把那套 hash 机制删了。** 每个 HTML 响应都改写一次安全头是实打实的成本，
而它什么都没换来。

### 上线的是什么

每个**可索引**页面的 `<head>` 里一段 `<script type="application/ld+json">`，
装一个 `@graph`：

- 打头永远是同样两个节点：`WebSite` 和站长 `Person`，用 `@id` 互相指。
  重复放是有意的 —— 只抓到一个 URL 的爬虫也应该知道这站是谁发布的。
- 然后是这一页自己的节点：`/community` 是 `CollectionPage`，
  帖子是 `DiscussionForumPosting`（作者、`datePublished`、`dateModified`、正文），
  项目是 `CreativeWork`（配图、`dateCreated`、`keywords`、作者），
  公开主页是 `ProfilePage` 包一个 `Person`。
- 首页以下的每一页都带 `BreadcrumbList`。
- **head 标了 noindex 的页面一个节点都没有。**
- 站长邮箱**没有**进 Person 节点；`sameAs` 只放 `https://` 的主页链接。

`injectSeo` 现在也把已有的 `ld+json` 先剥掉再拼，和它剥托管 meta 标签一样，
所以重复渲染是替换而不是叠加。

### 转义

帖子标题、正文、昵称、简介都会落进 script 元素里，`<` 是唯一能提前结束它的字符。
`encodeJsonLd` 把 `& < >` 和 U+2028/2029 转成 `\uXXXX` ——
对 JSON 解析器完全等价，对 HTML tokenizer 则彻底无害。
**CSP 在这里不是后备**：不检查 data block 的 CSP，也就救不了 data block。

### 验证

| 项 | 结果 |
|---|---|
| `npm run lint` | 通过 |
| `npm run test:unit` | 166 通过（新增 16 条，原 152） |
| `npm run build` | 通过 |
| `npm run test:api` | 57 通过 / 13 skipped（新增 5 条） |
| `npm run test:api:db` | 86 通过 / 0 失败（新增 4 条） |
| `npm run test:openapi` | 通过（本轮没动 API） |
| `npm run test:deploy-backup` / `test:deploy-script` | 通过 |
| `npm run test:admin-totp` / `test:content-health` / `verify:visitor-studio` | 通过 |
| `git diff --check` | 通过 |
| 本机 express + `site-routing.spec.js` | 13 通过 |
| 本机真实浏览器（4 条路由） | 图谱都在、CSP 违规 0、报错 0 |
| 部署前 env 检查 | `DATABASE_URL` / `ADMIN_TOKEN` 均为 `[set]`（未输出 value） |
| 部署前备份 | `/opt/mrright-portfolio.backup-20260826-141025`（硬链接）+ env 备份 |
| VPS 部署 | 成功，服务重启成功 |
| 线上 `production-smoke` + `site-routing` | **15 通过 / 4 失败 / 1 skipped** —— 4 条全是超时，见下 |

线上逐项（2026-08-26 14:2x UTC 实测）：

```text
/api/health                      200
/                                200   WebSite,Person
/community                       200   WebSite,Person,CollectionPage,BreadcrumbList
/projects/md-leimu               200   WebSite,Person,CreativeWork,BreadcrumbList
/community/<真实帖子>             200   WebSite,Person,DiscussionForumPosting,BreadcrumbList
/account                         200   (无图谱)
/no-such-page                    200   (无图谱)
/admin、/login?mode=login         200   noindex
CSP 头                            与本轮之前一字不差，无 sha256、无 nonce
journalctl 自部署起                0 error / 0 500 / 0 条 CSP 上报
```

⚠️ **那 4 条线上 e2e 失败不是功能坏了，是慢。** 全是项目详情那 4 条
（断言超时 10s）。手工量：冷缓存打开线上 `/projects/md-leimu`，
面板可见耗时 21.6s / 34.9s / 30.9s。**本轮 `src/` 一行没动**，
第二十四轮部署时就是这个速度，只是那天链路快到刚好没触发超时。
详情和数字见未完项第 9 条 —— **建议下一轮就修这个**。

### 撞见的第二件事：文档会改变生产 CSS

本轮前端源码一行没动，构建产物的 hash 却变了。查到底：
两份 CSS 只差一条 `.inline-flex` 规则，来源是**第二十四轮收工文档里的一句话** ——
Tailwind v4 的自动内容检测会扫 `.md`。详见未完项第 10 条。

### 改动的文件

- `server/seo.js`
- `server/index.js`（只多传一个 `owner`）
- `tests/unit/seo.spec.js`
- `tests/api/contract.spec.js`
- `tests/api/contract.db.spec.js`
- `docs/adr/ADR_WEB_SEO_RENDERING_STRATEGY.md`（就地纠正 §4 那段错的前提，并加了第 8 节）
- `docs/ARCHITECTURE.md`

commit：`847701a`（代码）+ 本次文档提交
回滚点：`/opt/mrright-portfolio.backup-20260826-141025`

## 2026-08-26（第二十四轮）：四个项目各自有了地址

第二十三轮衍生清单里的第一条，也是那一轮自己认定的最大空白。

### 起因

这个站存在的意义就是展示那四件作品，而它们**没有地址**。
点「查看详情」打开的是一个 React state 里的浮层：URL 不变，
所以复制不了链接、分享不出去、Back 关不掉、爬虫也没有东西可抓。
第二十三轮把 sitemap 里那四条假的 `/?project=<slug>` 删掉的时候
就写下了这件事——删掉是对的（没人读那个查询参数），但删完之后
四个项目就只剩首页那一条 `/` 覆盖了。

### 做了什么

`/projects/:slug`。

**前端**

- `src/App.jsx` 加一条路由，element 是**和 `/` 完全同一个** `homePage`。
  详情是叠在首页上的浮层，不是另一个页面；同一个元素在同一个位置，
  React 才会保住 `HomePage` 和里面那个 3D 场景不被卸载重建。
- `src/sections/Projects.jsx` 不再用 `useState` 记「当前打开哪个项目」，
  改成 `useMatch('/projects/:slug')` 从 URL 读。
- 卡片上的「查看详情」从 `<button>` 换成 `<Link>`。这一步不只是为了能复制地址：
  **爬虫要能从首页走进每个项目，靠的就是这个 `<a href>`。**
- 关闭的走向分两种：从网格点进来的（`state.fromCatalogue`）走 `navigate(-1)`，
  这样 Back 仍然是 Back，也不会往历史里多塞一条；
  从外部链接直接落地的走 `navigate('/')`，因为这条 URL 背后没有东西可退。

**服务端**

- `server/seo.js` 多认一种页面：`resolveRoute` 认 `/projects/:slug`，
  `buildPageMeta` 给它拼标题、简介、canonical 和 `og:image`，
  `renderNoscript` 给不跑脚本的爬虫写一段正文加一条回首页的链接。
- `server/index.js` 的 `loadSeoData` 多一条查询，兜底路由多传一个 `project`，
  sitemap 里每个公开项目一条 URL。

### 五个当时想清楚了的决定

1. **项目文案取英文栏**（`titleEn` / `summaryEn`，取不到再退回基础栏）。
   head 对所有人是同一份，而这份 head 的其余部分和模板的 `lang="en"` 都是英文。
   退回基础栏这条路是有用的：`content.js` 里的项目只填了基础栏和中/日翻译，
   压根没有 `titleEn`。
2. **项目那条匹配锚定到行尾**，和帖子、资料那两条不一样。
   那两条底下有标签页，所以 `/u/x/posts` 要收敛到 `/u/x`；
   项目详情**没有标签页**，`/projects/<slug>/anything` 不是项目页 ——
   客户端在那里渲染干净的首页，服务端必须同意它。
3. **`/projects` 不是页面**：渲染首页，canonical 指向 `/`。
   否则它就成了首页的第二个 URL。
4. **隐藏的项目和不存在的项目，在这里是同一回事**。
   `listProjects` 默认丢掉 `is_public = false` 的行，所以下架的项目拿到
   404 + noindex —— 下架必须把 head 一起拿走，而不只是从网格里消失。
5. **打开详情是唯一一次「PUSH 但不滚到顶」**（`state.preserveScroll`）。
   不做这个例外，浮层底下的首页会被拉到顶，关掉的瞬间访客就丢了自己的位置。

### 分享卡片终于不全是灭火器了

项目是这个站上**第一批有自己配图的页面**（公开主页用头像那次不算，
那是访客自己的图）。`og:image` 现在是项目自己的渲染图：

```text
/projects/shadow-altar-candle-shrine   og:image=/uploads/images/1781587765165-sc-jitan.png
/projects/crimson-rune-greatsword      og:image=/uploads/images/1781583835117-tl-jian.png
/projects/md-leimu                     og:image=/uploads/images/1780997894761-md-leimu-final.png
/projects/fire-extinguisher-next-gen   og:image=/uploads/images/1780998862555-tl-meihuoqi-render.png
```

（**帖子仍然是全站那张灭火器**，那条还在路线图上没做。）

### 验证

| 项 | 结果 |
|---|---|
| `npm run lint` | 通过 |
| `npm run test:unit` | 152 通过（新增 14 条，原 138） |
| `npm run build` | 通过 |
| `npm run test:api` | 53 通过 / 13 skipped（新增 6 条） |
| `npm run test:api:db` | 82 通过 / 0 失败（新增 5 条，含真建一个项目再下架） |
| `npm run test:openapi` | 通过（本轮没动 API） |
| `npm run test:deploy-backup` / `test:deploy-script` | 通过 |
| `npm run test:admin-totp` / `test:content-health` / `verify:visitor-studio` | 通过 |
| `git diff --check` | 通过 |
| 本机 express + `site-routing.spec.js` | 13 通过（原 8，新增 5） |
| 部署前 env 检查 | `DATABASE_URL` / `ADMIN_TOKEN` 均为 `[set]`（未输出 value） |
| 部署前备份 | `/opt/mrright-portfolio.backup-20260826-025716`（硬链接）+ env 备份 |
| VPS 部署 | 成功，服务重启成功 |
| 线上 `production-smoke` + `site-routing` | 19 通过 / 1 skipped（skip 的那条要访客凭证） |

线上逐项（2026-08-26 02:5x / 03:0x UTC 实测）：

```text
/api/health                                200
/                                          200
/community                                 200
/admin                                     200   noindex
/login?mode=login                          200   noindex
/account                                   200   noindex
/projects/shadow-altar-candle-shrine       200   <title>Shadow Altar Candle Shrine | mrright.blog</title>
/projects/crimson-rune-greatsword          200   <title>Crimson Rune Greatsword | mrright.blog</title>
/projects/md-leimu                         200   <title>MD Leimu | mrright.blog</title>
/projects/fire-extinguisher-next-gen       200   <title>Next-Gen Fire Extinguisher | mrright.blog</title>
/projects                                  200   canonical /
/projects/no-such-project-slug             404   noindex
/projects/fire-extinguisher-next-gen/extra 200   noindex（渲染首页）
/sitemap.xml                               200   7 条（/、/community、4 个项目、1 条帖子）
admin_summary                              200（部署脚本用一次性会话验的，用完即撤销）
journalctl 自部署起                          0 error / 0 500
```

440px 和 1280px 各截了一次首页项目区：`document.scrollWidth - clientWidth`
两边都是 **0**，卡片上那颗按钮换成 `<a>` 之后外观和之前一致
（`.primary-action` 本来就是 `inline-flex`，`w-full` 对 `<a>` 一样生效）。

### 顺手撞见但没动的

**`crimson-rune-greatsword` 的 `titleZh` / `summaryZh` 是另一个项目的文案。**
中文界面里两张卡片同名同简介。**不是本轮改出来的，是数据本身**，
而且只有中文栏错，英文和日文都是对的（所以本轮新加的 head 是对的）。
没替你改产品文案，已记到「待你决策」。

### 改动的文件

- `server/seo.js`
- `server/index.js`
- `src/App.jsx`
- `src/sections/Projects.jsx`
- `tests/unit/seo.spec.js`
- `tests/api/contract.spec.js`
- `tests/api/contract.db.spec.js`
- `tests/e2e/site-routing.spec.js`
- `docs/adr/ADR_WEB_SEO_RENDERING_STRATEGY.md`（加了一节 2026-08-26 修订）
- `docs/ARCHITECTURE.md`

commit：`4b04f46`（代码）+ 本次文档提交
备份路径：`/opt/mrright-portfolio.backup-20260826-025716`

## 2026-08-22（第二十三轮）：每条路由自己的 `<head>`

路线图第 6 条。**有服务端改动，已部署**（`76260b1`，2026-08-22 03:49 UTC）。
`src/` 一行没动。

### 为什么不是 SSR

四个方案都写进了 ADR（`docs/adr/ADR_WEB_SEO_RENDERING_STRATEGY.md`），
这里只记结论：

- **完整 React SSR** —— 组件树里挂着 three.js、`@react-three/fiber`、drei，
  在 Node 里跑不起来；六个 lazy chunk 要在服务端解析；而且**首页
  hydration 一旦对不上，3D 场景是直接坏掉，不是优雅降级**。
- **构建期预渲染** —— 帖子和资料是访客写的数据库行，构建产物出炉那一刻就过期了。
- **prerender 服务**（Prerender.io 之类）—— 多一个外部依赖 + 一条没人跑的渲染路径，
  按 UA 分流本身也接近 cloaking。
- **注入 `<head>`** —— 一次字符串改写，拿到几乎全部收益，且**完全没有
  hydration 风险**（客户端渲染路径一字未改）。选它。

### 做了什么

新增 `server/seo.js`（纯函数，不碰数据库，所以能单测），
改 `server/index.js` 的兜底路由与 `/sitemap.xml`。

覆盖的路由：`/`、`/community`、`/community/:id`、`/u/:handle`。
带尾巴的路径（`/u/:handle/posts`、`/community/:id/comments`）**收敛到父路径**
当 canonical —— 那些 tab 本来就是同一个页面。

每个可索引页面现在都有：`<title>`、`description`、`canonical`、
`og:type/site_name/title/description/image/url`、`twitter:card/title/description/image`；
帖子额外带 `article:published_time / modified_time / author / section`，
资料页额外带 `profile:username`。

`/admin`、`/account`、`/login` 和**没匹配上的路径**：`noindex, follow`，且**不发 canonical**
（robots noindex 和 rel=canonical 是互相矛盾的指令，二选一，noindex 赢，
但 `og:url` 保留 —— 那是分享卡片点回来的地址，没有爬虫把它当索引指令）。

`<noscript>` 里放：帖子正文 / 资料摘要 / **社区帖子列表**。
最后那个是**不跑 JS 时唯一能走到各条帖子的路**。

`sitemap.xml`：`/`、`/community`，加上**每条帖子一行**（带 `lastmod`）。
公开主页仍然**不列**（列了就等于枚举注册用户，而 `/api/users/:handle`
整个设计就是为了防这件事）—— 但它们被链接到时是可索引的。

### 隐私这条线，服务端也守着

`profilePublic: false` 或 `profileAdminDisabled` 的资料页，
**显示名和简介根本不进 HTML**，页面拿默认 head + noindex。
契约测试里有一条专门做这件事：把资料切成私密，再抓一次页面，
断言页面里既没有显示名也没有简介，抓完再切回来。

### 三处容易再踩的地方

1. **`express.static` 必须 `index: false`。** 否则 `/` 被 static
   用未改写的模板答掉，首页永远拿不到自己的 head。
2. **404 只发给「查过、确实不存在」的东西。** 库不在 / 查询抛错 → 200 + noindex。
   一次数据库抖动不能把活帖子变成爬虫记住的 404。
3. **转义 + 函数式 replace。** 用户文本进 `content="..."`；
   而且 `String.replace` 的字符串替换会展开 `$&` / `$1`，
   所以每处替换都写成函数。这两件事各有一条单测钉着。

### 顺手修掉的一个假 sitemap

原来 sitemap 里有四条 `/?project=<slug>`。**客户端从来不读这个查询参数**
（全仓 `grep` 过，`useSearchParams` 只有 `AuthPage` 在用），
所以那四个 URL 全部返回首页 —— 等于对搜索引擎宣称「我有四个和 `/` 一模一样的页面」。
已删掉。要让项目页真的可被索引，得先给它们一条真路由，见路线图第 6 条下面那几条。

### 验证

| 项 | 结果 |
|---|---|
| `npm run lint` | 通过 |
| `npm run test:unit` | 143 通过（新增 `tests/unit/seo.spec.js` 37 条，原 106 条） |
| `npm run build` | 通过 |
| `npm run test:api` | 47 通过 / 0 失败 / 13 skipped（新增 10 条 HTML 用例） |
| `npm run test:api:db` | 77 通过 / 0 失败（新增 9 条，用真实帖子和真实资料行） |
| `npm run test:openapi` | 通过 |
| `npm run test:deploy-backup` / `test:deploy-script` | 通过 |
| `npm run test:admin-totp` / `test:content-health` / `verify:visitor-studio` | 通过 |
| `git diff --check` | 通过 |
| 本机 express + `site-routing.spec.js` | 8 通过（确认注入没打断客户端路由） |
| 部署前 env 检查 | `DATABASE_URL` / `ADMIN_TOKEN` 均为 `[set]`（远端脚本的必需键断言，缺任一直接中止；未输出 value） |
| 部署前备份 | `/opt/mrright-portfolio.backup-20260822-034955`（硬链接）+ env 备份 |
| VPS 部署 | 成功，服务重启成功 |
| 线上 `production-smoke` + `site-routing` | 14 通过 / 1 skipped（skip 的那条要访客凭证） |

线上逐项（2026-08-22 03:5x UTC 实测）：

```text
/api/health              200
/                        200   <title>mrright.blog | 3D Portfolio</title>       canonical /
/community               200   <title>Community | mrright.blog</title>          canonical /community
/community/<真实帖子>     200   <title>分三次都是 | mrright.blog Community</title>  og:type=article
/admin                   200   noindex
/login?mode=login        200   noindex
/account                 200   noindex
/robots.txt              200
/sitemap.xml             200   3 条（/、/community、1 条帖子带 lastmod）
/u/not-exist-test-handle 404   noindex（原来是 200）
/community/<不存在>       404   noindex
admin_summary            200（部署脚本用一次性会话验的，用完即撤销）
journalctl 自部署起       0 error / 0 500
```

⚠️ **线上那条帖子是中文的，正好顺带验证了 UTF-8 和转义**：
`<title>分三次都是 | mrright.blog Community</title>`、
`og:description` 是 `撒大苏打的地方`、`article:author` 是 `111111`，
`content-type: text/html; charset=utf-8`。

⚠️ **`/u/not-exist-test-handle` 的状态码从 200 变成了 404。**
`production-smoke.spec.js` 只断言 `< 500`，所以它照旧绿；
但如果以后有什么监控在盯这个路径的 200，会开始报警。**这是有意的改动。**

### CI

`api-db-contract` 那个 job 加了一步 `npm run build`。
它原来不构建，而新增的 9 条用例要读 `dist/index.html` ——
不加这一步它们会自己 skip 掉，帖子和资料的 head 就等于没测。
两个套件里的 HTML 用例都写了 `test.skip(!existsSync(distIndex), ...)`，
所以本机忘了 build 时是「跳过并说明原因」，不是一堆 503 失败。

### 改动的文件

- `server/seo.js`（新）
- `server/index.js`
- `tests/unit/seo.spec.js`（新）
- `tests/api/contract.spec.js`
- `tests/api/contract.db.spec.js`
- `docs/adr/ADR_WEB_SEO_RENDERING_STRATEGY.md`（新）
- `docs/ARCHITECTURE.md`
- `.github/workflows/web.yml`

commit：`76260b1`（代码）+ 本次文档提交
备份路径：`/opt/mrright-portfolio.backup-20260822-034955`

## 2026-08-19（第二十二轮）：前端单元测试，以及未完项第 7 条的定性

原「下一轮建议」第 5 条。**本轮没有可上线的运行时改动，没有部署。**
唯一进到 `src/` 的改动是给 `i18nAdmin.js` 的 `dictionaries` 加了个 `export`，
构建产物大小一字未变（`Admin` 仍是 185.86 kB，只有内容 hash 变了）。

### 装了什么

`vitest` 4.1.11 + `jsdom` 30.0.1，都在 `devDependencies`（第二十一轮那条教训已生效，
这次是 `npm install --save-dev`，装完就在对的栏里）。

新增 `vitest.config.js`，**没有复用 `vite.config.js`**：那份配置带着生产分块
和一个会清空 `dist/uploads` 的 `closeBundle` 钩子，不该因为有人敲了
`npm run test:unit` 就跑起来。

⚠️ **`include` 必须写死 `tests/unit/**`。** 默认 glob 会把 `tests/e2e/*.spec.js`
一起扫进来，那些是 Playwright 的 spec，在 vitest 里跑不了。

新脚本：`npm run test:unit`（`vitest run`）、`npm run test:unit:watch`。

### 六个文件、106 条

- **`i18n.spec.js`** —— 三份词典 key 集合一致、没有空串，以及各种兜底
  （未知语言、未知错误码、未知标签）。
- **`i18n-usage.spec.js`** —— 对 `src/` 做静态分析（**排除后台**，
  它有自己的词典，而且 `AdminDashboard.jsx` 里有个同名的局部变量 `copy`，
  扫进来会把 `copy.icon` 报成缺失 key）。两条断言：
  代码里每个 `copy.<key>` 都要能解析；每个词典 key 都要有东西在渲染它。
- **`i18n-admin.spec.js`** —— 后台词典同款，外加它自己文件头声明的那条不变量：
  **`en` 必须完整**，因为其它语言都往它兜底。为此把 `dictionaries` 导出了——
  翻译函数答的是 `en[key] ?? key`，**它自己看不见缺口**。
  还检查后台源码里每个字面量 `t('...')` 都能解析。
- **`api.spec.js`** —— 请求层（`request()` 没导出，通过调用方 + stub `fetch` 测）：
  响应信封、错误的四种到达形状、Authorization 头在/不在、隐藏 iframe 下载及其清理定时器。
- **`admin-logic.spec.js`** —— 文本助手、导航模型
  （**每个分区和分组的标签在三种语言里都要能解析**）、图表刻度、翻译状态。
- **`asset-categories.spec.js`** —— 推断顺序、那一条 legacy 别名、本地化。

⚠️ **有两条是我预期写错了、代码是对的**，现在都固化成测试而不是假设：
1. **HTML 错误页在失败响应上得到的是 `Request failed` + 状态码**，
   不是 `Unexpected server response`——后者只出现在 **2xx 却返回非 JSON** 时
   （`!response.ok` 那条分支里 `.catch(() => ({}))` 把解析错误吞掉了，这是故意的）。
2. `toTitle` 只去掉**最后一个**扩展名，且 `\b\w` 会把点号后的词也大写：
   `a  b.tar.gz` → `A B.Tar`。

做过证伪：往 `Footer.jsx` 里塞一个 `copy.thisKeyDoesNotExist`，
`i18n-usage` 立刻红，并且**报出了是哪个文件**。

### 未完项第 7 条：定性完毕，是脚本错了

`npm run verify:visitor-studio` 从第十九轮起一直红，只差一个标记
`accountStudioUploadNow`。文档说过两种可能后果完全不同，所以没盲改。

**是脚本错的。** `git log -S accountStudioUploadNow -- src/pages` 没有任何提交——
这个 key 是在 `92dfbae` 里**和这份检查脚本一起**加进 `i18n.js` 的，
**从来没有接到任何组件上**。上传表单一直好好的，它渲染的是
`copy.communityUploadTitle`、提交走 `submitUpload`。
标记已改成指向真实存在的东西，脚本现在通过。

⚠️ **顺带发现这不是孤例：全站有 17 个 key 是「写了三份翻译、谁也不渲染」**
（`git log -S` 确认 17 个全都从没被组件引用过，不是用过又删）。
清单钉在 `i18n-usage.spec.js` 里，**第 18 个出现的当天会让测试变红**。
**没有删**——那是翻译好的产品文案，删哪些是你的决定，见「待你决策」。

### 顺手修掉的：仓库唯一一个 CRLF 文件

⚠️ **`.gitattributes` 给 js/jsx/ts/tsx/json/md/css 都声明了 `eol=lf`，唯独漏了 `.mjs`。**
全仓唯一的 CRLF 文件正好就是那个 `scripts/verify-visitor-studio.mjs`，
这就是「往里加任何一行 `git diff --check` 都报 trailing whitespace」的原因——
存的是 CRLF，那个 CR 就是尾随空白。

第十九轮把它记成「不是新问题，别当回归修」，这话没错，但也把陷阱留在那里了。
补一行属性 + 转一次行尾（`02e53b1`，**该提交不含任何内容改动**，
所以标记修正那一版的 diff 是 9 增 2 删，读得动）。

### CI

`npm run test:unit` 已接进 `.github/workflows/web.yml` 的 `checks` job，
**排在 build 之前**——少一个 key 应该在几秒内失败，而不是等一整轮 vite。
实测 run `32269795765` 全绿，干净检出上 106 条通过
（这也顺带证明了 `npm ci` 能从锁文件解出新依赖）。

### 验证

- `npm run lint`：通过（eslint 本来就覆盖 `tests/**`）
- `npm run build`：通过，**产物大小与第二十一轮完全一致**
- `npm run test:unit`：**106 通过 / 6 个文件**
- `npm run verify:visitor-studio`：**通过**（第十九轮以来第一次）
- `npm run test:openapi` / `test:content-health` / `test:deploy-script`：全通过
- `git diff --check`：干净
- 线上 `npm run test:e2e`：24 通过 / 0 失败 / 4 skipped
- 线上 `/api/health` 200、`/` 200（线上仍是 `a3799b5`，本轮没动它）

### 新增/修改文件

- `vitest.config.js`（新增）
- `tests/unit/i18n.spec.js`、`i18n-usage.spec.js`、`i18n-admin.spec.js`、
  `api.spec.js`、`admin-logic.spec.js`、`asset-categories.spec.js`（均新增）
- `src/lib/admin/i18nAdmin.js`（`dictionaries` 加 `export`，无行为变化）
- `scripts/verify-visitor-studio.mjs`（标记修正 + 行尾归一）
- `.gitattributes`（`*.mjs text eol=lf`）
- `.github/workflows/web.yml`（新增 Frontend unit tests 步骤）
- `package.json` / `package-lock.json`

commit：`02e53b1`（行尾）、`4d72390`（标记修正）、`a2028bd`（单元测试套件）

## 2026-08-19（第二十一轮）：站内跳转不再重建文档 —— react-router

原「下一轮建议」第 4 条。**本轮只动前端，`server/` 一行没改。**

线上运行 `a3799b5`（2026-08-19 14:35 UTC 部署，已逐项验证）。
回滚点：`/opt/mrright-portfolio.backup-20260819-143533`。

### 做了什么

公开站原来是在渲染时读 `window.location.pathname` 来决定画哪一页，
所以**换页的唯一办法就是把 URL 交还给浏览器**。每一次跳转都把整个文档拆掉重建：
bundle 重新解析、访客会话重新拉一次、首页那块 WebGL 场景从零再搭一遍。

`react-router-dom` 7.18.2 换掉了 `App.jsx` 里那四条前缀判断。

⚠️ **路由用的是带尾部 splat 的写法（`/account/*`），不是精确路径。**
旧代码是 `startsWith('/account')`，`/account/settings` 也会渲染账号页。
写成精确的 `/account` 会悄悄改掉这个语义。已用 13 条路径逐一对照实测：
`/`、`/login`、`/login/`、`/login?mode=register`、`/account`、`/account/settings`、
`/u/rin-sato`、`/u/rin-sato/posts`、`/community`、`/community/`、`/community/post-1`、
`/community/post-1/extra`、`/no-such-page` —— 落点与改动前完全一致
（splat 能匹配到裸父路径，这一点是实测确认的，不是照文档推的）。

三个自己解析 URL 的页面改成从路由拿：

- `CommunityPage`：帖子 id 从 `useParams` 来（**路由已经解过码**），
  它原来为 Back 键自己挂的那个 `popstate` 监听器可以删了。
- `PublicProfilePage`：handle 同上，`decodePathSegment` 删掉。
- `AuthPage`：`mode` 改成**直接从 `useSearchParams` 读**，不再镜像进 state。
  这样从 `/account` 点「去验证邮箱」跳 `?mode=verify` 时，
  即使登录页已经挂着，也会落到正确的那一步。
  四处 `window.location.replace('/account')` 换成 `navigate(..., { replace: true })`。

站内 20 处 `<a href="/...">` 换成 `<Link>`。
`Navbar` 是混合的：`#about` 这类页内锚点**仍然是普通 `<a>`**（哈希滚动交给浏览器），
只有 `/community` 那一条变成 `Link`。

### 两个不显眼但要记住的决定

⚠️ **`react-router-dom` 放在 `devDependencies`，不是 `dependencies`。**
npm 默认装进了 `dependencies`，但那一栏是 **VPS 上真正会安装的服务端运行时**
（express / pg / helmet / multer / cors / express-rate-limit），
前端的 react / three / motion 全部在 `devDependencies` 里。
放错栏会让线上多装一份永远用不到的包。**以后 `npm install` 任何前端依赖都要挪一次。**

⚠️ **它在 `vite.config.js` 里被并进了 `react-vendor` 块。**
不并的话它落在每次部署都会变的 `index` 入口块里，等于每次发版都让用户重下一遍。
并进去之后：`index` 216.1 → 216.8 kB（几乎不变，路由代码换掉了原来的手写分支），
`react-vendor` 192.5 → 230.5 kB。**首屏净增约 13.6 kB（gzip），这就是这次改动的全部代价。**

### 验证

⚠️ **这轮的核心改动在截图里是看不见的**，所以测试断言的是另一件事：
首次加载后往 `window` 上写一个哨兵，**跳转之后它还在，就说明文档没被重建**。
固化成 `tests/e2e/site-routing.spec.js`（8 条）。

**做过证伪**：`git stash` 掉本轮改动、对旧代码跑同一套 —— **5 条红**
（全是断言「客户端跳转」的那几条），另外 3 条只断言渲染的两边都绿。

其它验证：

- `npm run lint`：通过
- `npm run build`：通过
- `npm run test:openapi` / `test:content-health` / `test:deploy-script` / `test:deploy-backup`：全通过
- `git diff --check`：通过
- 本机 `npm run dev`(5173) 与 `vite preview`(4188) 两边各跑一遍路由测试：8/8 通过
- 跨路由探针：首页→社区→Back，**全程只有 1 次 document load**，console 0 错误
- 440px / 1440px 截图与横向溢出量测：社区页两个宽度都是 **0px 溢出**
- 线上部署后：`/api/health` 200、`/` 200、`/community` 200、`/admin` 200、
  `/login?mode=login` 200、`/account` 200、`/u/not-exist-test-handle` 200、
  `/community/does-not-exist` 200、`/no-such-page` 200
- admin_summary：部署脚本用短期会话验过并已吊销（**不是拿静态 token 直调**）
- 线上 API：`/api/profile` 200、`/api/projects` 200、`/api/community/posts` 200、
  `/api/account/profile` 未登录 401、`/api/users/not-exist-test-handle` 404
- 线上首页引用的 chunk 与本机构建产物一致（`index-BhYYYMmB.js` / `react-vendor-rtWop11s.js`）
- 线上 `npm run test:e2e`：**24 通过 / 0 失败 / 4 skipped**

### 顺手修掉的一条红灯（不是本轮弄红的）

⚠️ **`tests/e2e/admin-visitors.spec.js` 自第二十轮起就一直红**，
今天跑线上 e2e 才撞见。原因是**一个词的大小写**：
第二十轮（`156d9ac`）把后台文案挪进 `i18nAdmin.js` 时，最后一个标签写的是
`Moderation log`（句首大写，与 `Visitor management` / `Last login` / `Delete account`
这一整套英文一致），而测试里还写着 `Moderation Log` 且 `exact: true`。
**过期的是测试**，已改测试那一侧（`a160d3f`）。

这和第十二轮那条教训是同一件事的第二次发生（那次是 Visitors 改名 Members 没同步测试）。
**改后台英文文案时，连读它的 spec 一起改。**

### 撞见但没修

- **本机 scratch 库这轮又没用上。** `su postgres -c "psql ... ALTER ROLE mrright_local PASSWORD ..."`
  **仍然被权限策略挡下**（和第十九轮同一条）。走的还是那条备用路线：
  Playwright 拦 `**/api/**` 喂 fixture。**做前端的活基本不需要那个库，别再为它卡住。**
- `npm run verify:visitor-studio` 仍然是红的（未完项第 7 条），本轮没碰 `/account` 的 Studio 分区。

### 新增/修改文件

- `src/App.jsx`（路由；首页拆成 `HomePage`，数据拉取跟着它走，
  原来那道 `pathname !== '/'` 守卫随之消失）
- `src/pages/AuthPage.jsx`、`src/pages/CommunityPage.jsx`、`src/pages/PublicProfilePage.jsx`
- `src/pages/AccountPage.jsx`、`src/components/AccountMenu.jsx`、`src/components/CommentSection.jsx`
- `src/sections/Navbar.jsx`、`src/sections/Community.jsx`
- `vite.config.js`（`react-router` / `react-router-dom` → `react-vendor`）
- `package.json` / `package-lock.json`
- `tests/e2e/site-routing.spec.js`（新增）
- `tests/e2e/admin-visitors.spec.js`（顺手修的那条）

commit：`a3799b5`（路由）、`a160d3f`（测试大小写）

## 2026-08-18（第二十轮）：后台三语 + 动画 + 3D 运营星图

**日期**：2026-08-18
**commit**：`156d9ac`（代码）、`fdc602b`（文档）—— 都已 push 到 `origin/main`
**build / lint**：`npm run build` 通过，`npm run lint` 零错误零警告
**是否部署 VPS**：**是**，2026-08-18 14:49 UTC，`npm run deploy:vps`，线上现为 `fdc602b`
**VPS 备份路径**：`/opt/mrright-portfolio.backup-20260818-144934`
（env 也备份了：`/etc/mrright-portfolio.env.backup-20260818-144934`，原文件没有被覆盖）
**数据库 / API / 路由变更**：**无**，本轮只改前端

### 起因

公开站从第一天就有中英日三语，后台**一个字都没有**：每一个按钮、每一句空状态、
每一条「3 项待处理」都是写死在组件里的英文。而且整个后台是静止的 ——
换分区是内容瞬间替换，仪表盘的数字是直接落在那里的。

### 一、三语（487 个 key × 3 种语言）

新增 `src/lib/admin/i18nAdmin.js`：字典 + 插值 + **按语言的格式化器**。

- 字典和公开站的 `src/lib/i18n.js` **是分开的**，故意的：公开站那份是可以随便重写的
  宣传文案，这份命名的是「删除账号」这种按钮。分开之后改一边不用读另一边，
  后台的包也不用背着 1600 行 hero 文案。
- **中文是源语言，英文是兜底**。任何一种语言缺 key 都会回落到英文，
  再缺才显示 key 本身（故意难看，这样截图里能看出漏翻，而不是变成一片空白）。
- **界面语言存在 `mrright-admin-language`，和公开站的 `mrright-language` 分开。**
  首次进来才读公开站那个，再不行才读浏览器语言。
  理由：在后台用中文审评论的人，完全可能用日文读作品集。
- 语言切换器同时放在**侧边栏和登录页**。登录页那个是重点：
  看不懂登录表单的人，正是最需要它的人。

⚠️ **日期、时长、年龄、数字全都跟着语言走了。**
原来 `components/admin/charts.js` 和 `lib/admin/format.js` 里那几个格式化函数
**写死了 `en-US` 和英文单位词**（`11 days ago`）—— 这正是必须随界面语言变的东西。
它们已经从那两个文件里**删掉**，统一由 `createAdminFormatters(language, t)` 提供。
以后要在后台格式化时间或数字，**从 `useAdminI18n()` 里拿 `fmt`，别再往那两个文件里加**。

⚠️ **内容体检的 findings 是服务端写的英文散文，本轮按 `code` 翻译了。**
查找顺序是 `finding.<code>.<severity>.<字段>` → `finding.<code>.<字段>` → 服务端原文。
所以服务端明天新增一条 finding，界面上仍然会显示（英文），不会消失。
**但带变量的那几条 hint 仍然是英文**（里面嵌了路径、体积、解析器报错），
翻译一个缺了数字的壳比留一句英文更糟。同理，**审计日志里的 action 名
（`visitor.profile_disabled`）也仍然是英文原样**。

⚠️ **`src/lib/admin/sections.js` 和 `projectEditor.js` 里的 label 已经全部变成
key**（`labelKey`），`group` 保留成稳定 id。**以后加分区就是加 key，
不要再往那两个文件里写显示文案。** 下载策略的 `value`（`Open download` 等）
**没动**，那是存进数据库、公开站要读的值。
资源分类的名字直接用 `assetCategories.js` 里已有的三语表，没有再抄一份。

### 二、动画

全部是声明式 CSS（`src/index.css` 末尾新增一整节）：分区进场、行错峰淡入、
数字滚动（这条是 JS：`useCountUp`）、柱状图从基线升起、迷你折线描边、
进度条横向生长、骨架屏微光、导航悬停位移、汉堡按钮变叉、有待办的队列卡缓慢呼吸。

⚠️ **进场动画一律用 `animation-fill-mode: backwards`，不要用 `forwards`。**
`forwards` 会把 transform 钉在最后一帧，同一元素上的 `:hover` 位移就全死了
（`.admin-stat:hover` 的 `-translate-y-0.5` 就是这么被压掉的）。

⚠️ **文件顶部那个 `prefers-reduced-motion` 全局块不管 `animation-delay`。**
它把 duration 压到 0.01ms，但一个带 `backwards` 和 400ms 延迟的元素
**照样会先隐身 400ms**。所以本轮在文件末尾又加了一个 reduced-motion 块，
专门把这些类的 `animation` 整个关掉。**以后再加错峰进场，记得把类名加进那个块。**

### 三、3D 运营星图（`AdminGalaxy` + `AdminGalaxyScene`）

仪表盘顶部，公开站之外**后台第一次出现三维内容**。它是一张地图，不是装饰：

- 一个分区一个球，**半径 = 该分区在当前时间窗里的事件量**，
  **颜色 = 有没有人在等你**（珊瑚色有待办、青色已清空），**点一下进那个分区**。
- 十个节点分三层轨道。一层十一个球，从任何一个像样的机位看都会叠成一串手链。
- 标签是 **DOM（drei 的 `Html`），不是 3D 文字**：三种语言里有两种是 CJK，
  为了一行说明去打包字体图集不值得。
- 标签会在**节点转到核心背后时自动隐藏**（每帧算一次投影，只在布尔值翻转时 setState）。
- **窄屏（≤640px）只在悬停时出标签**：400px 宽的画布上六个胶囊会互相压。
  那个宽度下有名字的是平面图。

三种降级路径，**同一张图**：WebGL 能用就用；不能用就用 CSS 平面星图；
场景 chunk 还在路上时先显示平面星图。三种形态里每个节点都能点、都带同样的数字。
右上角有开关，选择记在 `mrright-admin-galaxy-mode`。
`three.js` **只在仪表盘挂载时才加载**（新 chunk 4.3 kB，three 本体和公开站共用）。

⚠️ **星图不可 Tab 到**（canvas 里的对象不在焦点顺序里）。这不是遗漏：
每个分区都能从侧边栏和命令面板（⌘K）到达，平面视图里的节点则是真按钮、可 Tab。
要给三维节点做键盘可达，得再叠一层不可见的 DOM 焦点目标。

⚠️ **eslint 的 `react-hooks/purity` 和 `immutability` 会挡两种写法**，
本轮撞到两次，都记下来：
- `Math.random()` 在渲染期（**包括 useMemo 里**）会报错。星域改成了
  模块加载时用固定种子生成一次（`mulberry32`），顺带保证每次渲染是同一片天。
- **不能改 `useThree()` 返回的 `camera`**。要动相机，从 `useFrame((state) => state.camera)`
  里拿，那个不是 React 交给你的值。

### 四、多分辨率

`tests/e2e/admin-console.spec.js`（**本轮新增**）在 **440 / 768 / 1440** 三个宽度、
**中英日三种语言**下把十一个分区逐个走一遍，断言：**零 console 错误、零横向溢出**，
并且**在 440px 下点开成员详情之后再测一次溢出** —— 那正是第十九轮修过的地方。

⚠️ **这套测试不需要数据库、不需要会话、不需要种子数据。**
它拦 `**/api/admin/**` 喂 fixture（注意：`lib/api.js` 的 `normalizeApiPayload`
要求信封里 **`data` 和 `error` 两个键都在**才会解包，只给 `data` 会静默拿到空对象）。
第十九轮建议的那条路，现在固化成仓库里的测试了。
默认 `npm run test:e2e` 打的是线上；本地跑要 `E2E_BASE_URL=http://127.0.0.1:5173`。

### 修改文件

新增：
- `src/lib/admin/i18nAdmin.js`（字典 + 翻译器 + 格式化器 + context）
- `src/lib/admin/motion.js`（`usePrefersReducedMotion` / `useMediaQuery` / `useDocumentVisible` / `useCountUp` / `stagger`）
- `src/components/admin/AdminLanguageSwitcher.jsx`
- `src/components/admin/AdminGalaxy.jsx`（壳、平面降级、WebGL 探测、懒加载）
- `src/components/admin/AdminGalaxyScene.jsx`（r3f 场景）
- `tests/e2e/admin-console.spec.js`

改动：`src/Admin.jsx`、后台十一个分区组件、`AdminTotpEnrolment.jsx`、
`Charts.jsx` / `charts.js`、`lib/admin/{format,projectEditor,sections}.js`、
`src/index.css`（+528 行）。

### 验证结果

本机：

- `npm run lint`：通过（0 error / 0 warning）
- `npm run build`：通过
- `npx playwright test tests/e2e/admin-console.spec.js`（对本机 5173）：**6 条全绿**
- `npm run test:openapi`：通过（206 个 $ref / 36 个错误码）

线上（2026-08-18 14:49–14:5x UTC，部署后）：

- `/api/health` → 200
- admin_summary → 200（由部署脚本自己做的：换短期会话 → 打接口 → 撤销会话）
- `/` `/community` `/admin` `/login?mode=login` `/account` → 全部 200
- `/api/admin/overview?days=30` → 200（3D 星图和仪表盘读的就是它）
- 线上内容健康：**0 critical / 0 warning / 0 note**
- `dist/index.html` 里的入口 hash 与本机构建**逐字一致**，
  `Admin-*.js` 和 `AdminGalaxyScene-*.js` 两个 chunk 都能取到 200
- **`tests/e2e/admin-console.spec.js` 对 `https://mrright.blog` 又跑了一遍：6 条全绿**
  （三种语言 × 十一个分区 × 三个宽度，零 console 错误、零横向溢出）
- `tests/e2e/production-smoke.spec.js`：6 过 1 跳过（跳过的那条要访客凭证）
- 服务状态 active，备份保留 3 份，磁盘 42%

⚠️ **部署日志里那条 `TRUST_PROXY_HOPS is unset` 是老问题**，
和本轮无关，见「真实客户端 IP」那一节。

⚠️ **`npm run verify:visitor-studio` 仍然是红的，和第十九轮同一个原因**
（要求 `AccountPage.jsx` 里出现 `accountStudioUploadNow`，而页面里根本没引用它）。
**不是本轮弄红的，别当回归修。**

### 这一轮学到的

- **本机截图里的中日文如果是方框，是容器没装 CJK 字体，不是站点的问题。**
  本轮装了 `fonts-noto-cjk` 才看到真实排版。**评审三语界面前先确认字体在。**
- `page.addInitScript` **每次导航都会重跑**。用它塞语言，测「刷新后还记得吗」
  就会被自己覆盖掉 —— 本轮为此改了两次测试，不是应用的 bug。
- 不设置语言时，后台跟随浏览器语言（Playwright 的 Chrome 是 en-US），
  这和公开站 `getInitialLanguage()` 的行为一致。

## 2026-08-17（第十九轮）：拆 `Admin.jsx` 与 `postgresStores.js`

**日期**：2026-08-17
**状态**：**已部署并逐项验证**。无数据库变更；运行时行为只有一处变化
（Members 详情在窄屏下不再撑宽整页）。

### 起因

「下一轮我建议先做的」排在最前的第 3 条。第十八轮收工时
`Admin.jsx` 2963 行、`postgresStores.js` 4095 行，两个文件加起来
7058 行，占了这个项目里最常改的两处。

### 一、`Admin.jsx`：2963 → 1301 行

分两步，两个 commit，每步单独过 build + lint。

**第一步（`0a14edc`）：组件上面那 733 行根本不是组件的事。**
`const Admin` 出现在第 782 行 —— 在它前面是预设常量、格式化函数，
以及一整套浏览器内 FBX/OBJ → GLB 转换器。这些代码不读任何 React 状态，
写在那里只是因为当初就写在那里。原样搬进 `src/lib/admin/`：

- `format.js` —— 日期、文件大小、slug、`searchInItem`、`needsCommentReview`
- `sections.js` —— 分组导航、可搜索分区集合、Members 的两组常量
- `projectEditor.js` —— 语言矩阵、各种预设、空表单、翻译状态判断
- `modelConversion.js` —— 转换器（three.js 仍是动态 import，不进主包）

**第二步（`20b2283`）：render 里是十一个 `activeSection === '...' &&` 串起来的 1080 行。**
想看 Members 的列表，要先滚过整个项目编辑器。十一个分区里已有五个在自己的文件里
（第十二轮起的约定），这轮把剩下六个加编辑器也搬出去：

- `AdminProjectsSection` / `AdminProjectEditor`（489 行，最大的一块）
- `AdminDownloadsSection` / `AdminCommunitySection` / `AdminCommentsSection`
- `AdminLikesSection` / `AdminMembersSection` / `AdminMessagesSection`

**每个子组件只收数据和回调，不持有状态。**删除动作仍然走外壳里的 `deleteItem()`，
所以「确认对话框 + 成功后重新拉数据」还是一处；子组件也就**永远看不到 session token**。

### 二、`postgresStores.js`：4095 → 40 行

拆进 `server/postgres/`：

- `mappers.js`（324 行）—— 行 → API 形状的映射。**这些才是真正的契约**：
  同一行 `visitor_users` 对公开页、对本人、对管理员是三个不同的对象，
  差别就锁在这里（`includeEmail` 只有 adminStore 的调用点会传）。
- `schema.js`（419 行）—— 全部 `CREATE TABLE` / `ADD COLUMN IF NOT EXISTS`
- 七个 store 各一个文件：`adminStore.js`（1770）、`authStore.js`（662）、
  `communityStore.js`（534）、`interactionsStore.js`（202）、
  `downloadRequestsStore.js`（146）、`projectStore.js`（48）、
  `contactMessagesStore.js`（23）

每个 store 变成 `create<Name>Store({ pool })` 工厂。
**跨 store 依赖只有一处**：`adminStore` 的 overview 要数目录，
所以它额外收一个 `projectStore`。三个 store 会调用自己
（`projectStore.listProjects`、`authStore.getAccountProfile`、`adminStore.getVisitor`），
这些保留了具名绑定（`const xStore = {...}; return xStore`），调用点一个字没改。

`postgresStores.js` 现在只剩：开池、跑 schema、把七个接起来。
**没有任何调用点变化** —— 外面只有 `server/index.js` 和一个迁移脚本
`import { createPostgresStores }`。

### 三、顺手修的一个真 bug：手机上点开一个成员，整个后台被撑到 684px

第十八轮走 440px 时**没有点开过成员详情**，所以没看见。

`.visitor-management-layout` 在 ≤1100px 收成一列，写的是 `1fr` ——
也就是 `minmax(auto, 1fr)`，**轨道不肯低于内容的 min-content**。
六个详情标签页并排是 646px，于是选中一个成员就把 `.admin-main` 顶到 684px，
440px 的视口整页横向滚动，而 `.visitor-detail-tabs` 上那句
`overflow-x: auto`（本来就是为它准备的）**从来没机会生效**。

改成 `minmax(0, 1fr)`。**实测 440px 下文档横向溢出 256px → 0**，
标签条自己滚动，页面不动。（`c8207d9`）

⚠️ **以后在窄屏收成单列时，写 `minmax(0, 1fr)`，别写 `1fr`。**
`1fr` 保护的是内容不被压扁，代价是它会把整个祖先链一起撑宽。

### 修改文件

新增：

- `src/lib/admin/format.js`、`sections.js`、`projectEditor.js`、`modelConversion.js`
- `src/components/admin/AdminProjectsSection.jsx`、`AdminProjectEditor.jsx`、
  `AdminDownloadsSection.jsx`、`AdminCommunitySection.jsx`、`AdminCommentsSection.jsx`、
  `AdminLikesSection.jsx`、`AdminMembersSection.jsx`、`AdminMessagesSection.jsx`
- `server/postgres/mappers.js`、`schema.js`、`adminStore.js`、`authStore.js`、
  `communityStore.js`、`contactMessagesStore.js`、`downloadRequestsStore.js`、
  `interactionsStore.js`、`projectStore.js`

修改：

- `src/Admin.jsx`（2963 → 1301）
- `server/postgresStores.js`（4095 → 40）
- `src/index.css`（那条 `minmax(0, 1fr)`）
- `scripts/verify-visitor-studio.mjs`（四个社区方法的标记改指 `communityStore.js`）

### commit

- `0a14edc` admin: the 780 lines above the component were never about the component
- `20b2283` admin: eleven sections were one component with eleven if-statements
- `c8207d9` ui: selecting a member on a phone stretched the console to 684px
- `d4ca731` server: seven stores and a 415-line schema shared one 4,095-line file

### 验证结果

- `npm run lint`：通过
- `npm run build`：通过
- `npm run test:api:db`：**68 通过**（自建临时 Postgres 集群，跑完销毁；
  这是拆 store 最有力的一道验证 —— 七个 store 全部被真实跑过一遍）
- `npm run test:openapi`：通过
- `npm run test:content-health`：通过
- `npm run test:admin-totp`：通过
- `npm run test:deploy-backup`：通过
- `npm run test:deploy-script`：通过
- `git diff --check`：除 `scripts/verify-visitor-studio.mjs` 外全部通过（原因见下）
- **前端逐分区验证**：用 Playwright 拦 `**/api/admin/**` 喂 fixture，
  在 `npm run dev` 上把**十一个分区在 1280px 和 440px 各走一遍**，
  其中项目编辑器打开、成员详情打开并切到 Comments 标签页。
  **0 条 console error，0 条 pageerror，两个宽度下横向溢出全为 0。**
  截图在 `scratchpad/shots/`（会话结束即失效，不入库）
- GitHub push：成功（`origin/main` = `d7924da`）
- VPS 部署：成功（`npm run deploy:vps`，密钥认证），服务重启成功
- 部署前 VPS 检查：node v22.22.2 / npm 10.9.7 / `nginx -t` 通过 / 服务 active /
  `ADMIN_TOKEN=[set]`、`DATABASE_URL=[set]`（未输出 value）/ `/opt` 剩余 8.2G
- 健康检查：**一次通过**
- 部署脚本自带的 admin summary 检查：通过（短会话，用完即撤）
- 备份清理：按保留策略删掉 `...-20260815-031633`，保留最新 3 份
- 线上 `/` `/community` `/admin` `/login?mode=login` `/account` `/api/health`：均 200
- 线上 admin（另换一个短会话独立复验，用完撤销）：
  `/api/admin/summary` 200、`/api/admin/overview?days=30` 200、`DELETE /api/admin/session` 200
- **线上内容健康：0 critical / 0 warning / 0 note**（`checkedAt` 2026-08-17T15:10:46Z）
  —— 第十八轮欠的那次重测，这轮补上了
- 线上 `/api/account/profile` `/downloads` `/comments`：未登录 401，正常
- 线上 `/api/users/not-exist-test-handle`：404，正常
- 线上 production-smoke：**6 通过 / 1 跳过**
- 线上 CSS 确实带上了那条修复：
  `index-2QBUCxlp.css` 里有 `visitor-management-layout{grid-template-columns:minmax(0,1fr)}`
- 线上 `Admin-BYeAsRMs.js` 含 `Mark Spam` / `Visitor Management` / `Download Requests` /
  `Translation Coverage`，即拆分后的十一个分区确实都上了线
- 线上 `/opt/mrright-portfolio/server/postgres/` 九个文件都在，
  `postgresStores.js` 40 行
- 线上 `dist/uploads`：不存在（第十六轮那道闸仍然有效）
- 服务日志近 15 分钟：0 条 error

**备份路径**：`/opt/mrright-portfolio.backup-20260817-150516`
（env 备份 `/etc/mrright-portfolio.env.backup-20260817-150516`）

部署后 `/opt` 上实际存在的备份：

```text
/opt/mrright-portfolio.backup-20260817-150516   第十九轮之前 ← 要回滚就用这个
/opt/mrright-portfolio.backup-20260816-045603   第十八轮之前
/opt/mrright-portfolio.backup-20260815-034745   第十七轮之前
```

⚠️ **用 `ADMIN_TOKEN` 直接打 `/api/admin/summary` 会 401** —— 本轮踩过一次，
以为是回归，其实是**静态 token 只能用来换会话**：
先 `POST /api/admin/session`（token 放 `Authorization: Bearer` 头），
拿到 session token 再打管理接口，用完 `DELETE /api/admin/session`。
`mr-deploy` 那份提示词里写的那条 `curl -H "Authorization: Bearer $ADMIN_TOKEN" .../summary`
**是过期的写法**，照抄会得到一个假的红灯。

### 这一轮撞见但没修的两件事

1. **`npm run verify:visitor-studio` 是红的，而且和本轮无关。**
   它要求 `src/pages/AccountPage.jsx` 里出现 `accountStudioUploadNow`，
   但那个 key 只在 `src/lib/i18n.js` 里有三份翻译，**页面里没有任何引用**。
   拆分前后都红（已 `git stash` 对照确认）。要么是脚本的期望过期了，
   要么是「上传资源」那个按钮在某一轮被拿掉了 —— **两种可能后果完全不同，
   所以没有盲改**。下次谁碰 `/account` 的 Studio 分区，顺便定一下性。
2. **`scripts/verify-visitor-studio.mjs` 整个文件是 CRLF**（67 行全是）。
   所以往里加任何一行，`git diff --check` 都会报 trailing whitespace。
   本轮那一行沿用了文件自己的换行约定，没有为一行改动去动全文件 67 行。

### 这一轮学到的

- **拆文件之前先想清楚「谁需要谁」，比想「怎么分组」更省事。**
  七个 store 里只有一条跨 store 依赖（adminStore → projectStore），
  发现这一点之后，整个 server 侧的拆分就是机械操作了。
- **有一套能跑的测试，纯搬运才敢做。** `test:api:db` 那 68 条覆盖了七个 store
  的真实 SQL 路径；没有它，把 4095 行切成九个文件只能靠肉眼。
  前端那边没有等价的东西，所以另外写了一个喂 fixture 的 Playwright 脚本来补。
- **「第十八轮走过 440px」不等于「440px 都看过」。** 那一轮没点开成员详情，
  于是这个 256px 的横向溢出躲过了一整轮专门的窄屏排查。
  以后走窄屏，**每个能展开的东西都要展开一次**。

## 2026-08-16（第十八轮）：后台十一个分区逐个走 440px，外加一个死胡同的审核流程

**日期**：2026-08-16
**状态**：**已部署并逐项验证**。无数据库变更。

### 起因

第十七轮留下的建议第 3b 条：仪表盘的密度修了，其余分区只验过「不溢出」，
没有从密度角度逐个看。这轮把十一个分区（Dashboard / Projects / Content Health /
Community / Comments / Downloads / Messages / Members / Likes / Security / System）
在 440px 下逐个看过，改前改后都截了图。

### 方法：先造数据，再看

**空库看不出密度问题** —— 第十七轮那个 scratch 库是空的，
所有列表都是空面板。这轮先往库里塞了一套种子数据（内容见「环境事实」），
名字故意混了长德语姓、西班牙语双姓、中文和单字名，用来撑换行。
真实的行长出来以后，问题一眼就能看见。

### 改了什么

1. **Members：状态胶囊各占一整行**（最丑的一处）。
   `.admin-row span { display:block }` 权重 (0,1,1) 压过 `.visitor-row-status` (0,1,0)，
   所以那条 `display:flex` + 窄屏 `flex-direction:row` 的规则**整条是死的**：
   两个胶囊各撑满 382px、各高 40px，六个人光说「verified / public」吃掉约 500px。
   规则前面补上 `.admin-row` 让它赢回来，胶囊按「行内状态标」重新定尺寸
   （`min-h-10 px-4` 是给 Downloads 那排审批按钮设计的，不是给它的）。
   **整页高度 2499px → 2084px。**
   ⚠️ **这是本轮最该记住的一条：在 `.admin-row` 里写布局，选择器必须带 `.admin-row`。**
   `.admin-row-title span` 早就为同一个原因写过一次，只是没人把这条经验写下来。

2. **Members 的四个筛选下拉**在 ≤640px 是一列，加上搜索框和按钮 = 六行界面
   挡在数据前面。改成**两两一排**，搜索框和 Search 按钮保持整行。

3. **Content Health 的 findings**：`grid-cols-[auto_minmax(0,1fr)]` 里那个 `auto` 轨道
   和下一行的「Open community」按钮共用，所以严重度标签那一列被按钮撑到 128px，
   **正文只剩 382px 里的 230px**，旁边一大片空白。手机改单列，`sm` 起恢复三列。

4. **System 的 Runtime / Request chain**：八对「标签 + 值」一对一行，
   值是「8m」「24 ms」这种。改成**手机两列**（16 行 → 8 行）。

5. **`.account-stat-grid` 同样的毛病** —— 四张只装一个数字的卡片排成一列，
   出现在 `/account` 和每个公开主页上。改成手机两列。

6. **角标对齐**（原「待你决策」那条）：`.admin-section-header` 用 `items-center`，
   于是计数角标被垂直居中到「标题 + 说明文字」整块的中间。改 `items-baseline`。
   这个容器 `/admin`、`/account`、`/u/<handle>` 都在用，所以 440px 和 1280px
   两个宽度都过了一遍。

7. **公开主页的遮挡 bug**（不是密度问题，是撞见的）：
   `.public-profile-head` 用负 margin 抬进横幅，横幅是 `position:relative`（放 glow），
   身份区是静态流内容 —— **定位元素画在上面**，头像顶部和名字第一行被盖住。
   440px 下大多数全名都会换行，也就是大多数人的名字第一行是看不见的。
   加 `relative z-10`。⚠️ **线上无人设过 handle，此项只在本机验过**（见未完项第 6 条）。

8. **评论审核之前是死胡同**（真 bug，不是排版）：
   服务端一直有 published / pending / spam，`PATCH /api/admin/comments/:id`
   一直能放行、契约测试第 63 条就在测它 —— 但 `src/lib/api.js` 里**没有对应的调用方**，
   Comments 列表既不显示状态、也只有 Delete。仪表盘催「N 条待审」、侧栏挂角标、
   按钮把人送过去，然后没有然后了。**垃圾判定误伤只能删，对作者而言等于没处理。**
   现在：列表显示状态标、待办排最前、Publish / Mark Spam 在 Delete 旁边。
   本机实测：把一条 pending 放行后，它出现在 `GET /api/projects/:slug/interactions` 里。

9. **修了两条一直红着的 e2e**：泄漏检查用 `/password/i` 匹配键名，
   而访客序列化永远带 `passwordChangedAt`（时间戳）。它对**任何**在跑的部署都会红，
   只是没人本地跑、默认又打线上，所以没被发现。

### 修改文件

- `src/index.css`（1–7）
- `src/Admin.jsx`、`src/lib/api.js`（8）
- `tests/e2e/admin-visitors.spec.js`（9）

### commit

- `3981b8f` ui: a narrow screen was paying a whole row for a single word
- `ceec805` admin: pending and spam comments could be deleted, never approved
- `2536931` tests: passwordChangedAt is a timestamp, not a leaked credential

### 验证结果

- `npm run build`：通过
- `npm run lint`：通过
- `git diff --check`：通过
- `npm run test:openapi`：通过
- `npm run test:content-health`：通过
- `npm run test:api:db`：**68 通过**（跑完 `public/uploads` 文件数不变）
- 本机 e2e（`E2E_BASE_URL=http://127.0.0.1:4199`）：**12 通过 / 2 跳过**
  （修之前是 10 通过 / 2 失败 / 2 跳过）
- GitHub push：成功（`origin/main` = `2536931`）
- VPS 部署：成功，服务重启成功，健康检查一次通过
- 部署脚本自带的 admin summary 检查：通过（短会话，用完即撤）
- 线上 `/` `/community` `/admin` `/login?mode=login` `/account` `/api/health`：均 200
- 线上 `/api/account/profile` `/downloads` `/comments`：未登录 401，正常
- 线上 `/api/users/not-exist-test-handle`：404，正常
- 线上 production-smoke：**6 通过 / 1 跳过**
- 线上 CSS 已带新规则（`.admin-row .visitor-row-status` / `admin-state-spam` /
  `public-profile-head{...position:relative}` 都在 `/assets/index-B18RXnEH.css` 里）
- 线上 `dist/assets/Admin-BiTslGWC.js` 含 `Mark Spam`，即新后台确实上了线
- 线上 `dist/uploads`：0 个文件（第十六轮那道闸仍然有效）
- 服务日志近 10 分钟：0 条 error

**备份路径**：`/opt/mrright-portfolio.backup-20260816-045603`
（env 备份 `/etc/mrright-portfolio.env.backup-20260816-045603`；
脚本按保留策略清掉了 `...-20260814-162845`）

### 这一轮学到的

- **空数据看不出密度问题。** 第十七轮在空库上看过同样这些分区，
  只发现了「Members 是块空面板」；数据一填进去，真正难看的地方立刻显形。
  以后要评审后台 UI，**先造数据**。
- **「样式没生效」不一定是没写，可能是被自己的 base 规则压掉了。**
  本轮有三条这样的死规则（`.visitor-row-main`、`.visitor-row-status`、
  还有没修的 `.visitor-stat-line`），都是同一个 `.admin-row span` 造成的。
  改这一片 CSS 之前，先想一下选择器权重。
- **顺着一个 UI 问题往下看，能撞见功能问题。** 评论审核那条死胡同，
  是因为看 Comments 分区排版时发现「三条待审在列表里根本认不出来」才挖出来的。

## 2026-08-15（第十七轮）：`/admin` 的窄屏排版，以及那 11 条 401

**日期**：2026-08-15
**状态**：**已部署并逐项验证**。无数据库变更。

### 起因

用户带着一张截图：开着 devtools 的 `https://mrright.blog/admin`，
内容区约 440px 宽，控制台里 11 条红色 401。原话是「UI 你没有修好，布局太难看了，
还有一个报错」。

⚠️ **这是同一个抱怨的第二次。** 第十五轮收到的是「你忘了做屏幕适配」（也是对着 `/admin`），
当时量了溢出、发现 `/admin` 在任何宽度都不溢出，于是修了公开页头 ——
**溢出是选错的指标**。这轮量密度，问题立刻出来了。

### 一、布局：不是溢出，是密度

`.admin-stat-grid` 之前是 `gap-3 sm:grid-cols-2 xl:grid-cols-3`，
即 **640px 以下单列**。六块统计卡（MEMBERS / COMMENTS / LIKES / DOWNLOADS /
COMMUNITY / MESSAGES）每块只装一个词和一个数字，却各占 406px 宽，
数字在最左、迷你趋势线贴最右，中间空一大片；六块叠起来就是一根望不到头的长柱。
`sm:grid-cols-2` 那一档也不够：**800px 时仍是两列 361px 的空卡**。

改成：

| 改动 | 内容 |
| --- | --- |
| `.admin-stat-grid` | `grid-cols-2 md:grid-cols-3` —— 手机也两列，768 起三列 |
| `.admin-stat-body` | 低于 `sm` 时数字与趋势线**改为上下堆叠**，趋势线占满卡片宽 |
| `.admin-sparkline` | 低于 `sm` 时 `w-full`（它本来就是 `preserveAspectRatio="none"`，拉宽无代价） |
| `.visitor-detail-panel` | 1100px 以下补 `min-height: 0` —— 布局已经堆叠，那 360px 只是「Select a visitor to inspect the account」下面的一大块空板 |

**十个宽度实测**（320 / 375 / 440 / 540 / 640 / 768 / 800 / 1024 / 1280 / 1440）：
无一处横向溢出；768 以下两列、768 起三列；440px 页面高度 2927 → 2630（-297px）。
桌面（1280/1440）渲染与改前一致。

### 二、那 11 条 401：会话过期的正常样子

恢复已存会话时直接调 `loadAdminData`，它一次并发 11 个管理端请求。
会话一旦过期（`ADMIN_SESSION_HOURS` 默认 12 小时，属于常态），
**11 个请求各撞一次墙，控制台就刷出 11 条红字**，而界面其实已经正确回到了登录页。
截图里那一片就是这个。

改成先用 **一个** `GET /api/admin/me` 探活：401 就清 token、回登录页，
提示语从「Enter the ADMIN_TOKEN again」换成
「That admin session has expired. Sign in again to continue.」
（那句旧文案还停在 `ADMIN_TOKEN` 时代，现在的登录方式是账号 + 密码 + 6 位码）。
非 401 的失败（网络抖动、老服务端没有这条路由）**不丢会话**，继续走完整加载，
由那些响应来判断。成功路径的请求数不变（本来也要调 `me` 拿身份）。

### 验证

- 本地起了一个真实实例（见「环境事实」）：
  - 失效会话：`/api/admin/me` **1 个 401**，界面显示新提示语 —— 改前是 11 个
  - 有效会话：`me` 200，随后 11 个管理端请求全部 200，仪表盘照常
- 十宽度测量表见上
- 逐个分区在 440px 下扫过（Dashboard / Projects / Content Health / Community /
  Comments / Downloads / Messages / Members / Likes / Security / System）：**零溢出**
- `npm run build`、`npm run lint`、`npm run test:api`（37 通过 / 13 跳过）：全通过
- 线上 CSS 实测含新规则（`repeat(2,...)` + 媒体查询里的 `repeat(3,...)`、`min-height:0`）
- 线上失效会话复测：**1 个 401 + 新提示语**

### 部署

- commit：`ba8e81a`
- 备份（回滚点）：`/opt/mrright-portfolio.backup-20260815-034745`
- 部署时间：2026-08-15 03:47 UTC，健康检查通过，admin session 检查通过
- env 检查：`ADMIN_TOKEN` `[set]`、`DATABASE_URL` `[set]`（未取值）
- 线上验证：六路由全 200、`admin_summary` 200、`admin_me` 200、
  Content Health 0/0/0、`dist/uploads` 仍不存在、`npm run test:e2e` 10 通过 / 4 跳过

### 教训

**上一轮量错了指标。** 「在所有宽度都不溢出」被当成了「适配没问题」的证明，
可它只排除了一种失败方式。用户看到的是**要滚十屏才看得完六个零**。
以后做适配验收，除了溢出，至少还要看：**同一块内容在窄屏下的高度**、
**列数**、**单元格里内容占卡片宽度的比例**。

## 2026-08-15（第十六轮）：测试文件不再搭着构建上生产

**日期**：2026-08-15
**状态**：**已部署并逐项验证**。运行时代码零改动。

### 起因

原未完项第 3 条。`npm run test:api:db` 跑的是真实上传接口，服务端因此往
`public/uploads/images/` 写真文件，没人负责收拾 —— 攒到了 20 个（19 个 `pixel.png` +
1 个 `health-checked.png`）。vite 把 `public/` 整个拷进 `dist/`，`deploy:vps` 打包的正是
`dist server scripts package*.json`，所以这些文件**每次部署都上了服务器**。

之前记的是「目前无害」。**只对了一半**：确实从没被服务过，但泄漏是真发生了 ——
第十五轮那份线上发布的备份里，`dist/uploads` 实打实有 20 个测试文件（19 个 `pixel.png`）。
「不会被服务」靠的是 `/uploads` 的 express 挂载注册在 dist 静态处理器之前这条**遮蔽规则**，
不是任何保证；哪天挂载顺序变了，本地测试垃圾就直接可被公网访问。

### 三处一起堵

| 位置 | 做法 |
| --- | --- |
| `tests/api/contract.db.spec.js` | `beforeAll` 快照 `public/uploads` 整棵树，`afterAll`（在服务进程退出之后）只删这一轮新增的文件；预先存在的文件一个不碰，路径不在 `public/uploads` 之内的一律跳过 |
| `vite.config.js` | 新增 `dropUploadsFromBuild` 插件，`closeBundle` 的 post 序删掉 `dist/uploads`（它本来就不可达） |
| `scripts/deploy-vps.mjs` / `scripts/package-vps-release.mjs` | 打包前调 `assertNoUploadsInBuild()`，`dist/uploads` 还在就直接报错停下 —— 挡的是陈旧的 `dist`，或者用没有那个插件的配置构建出来的产物 |

新文件 `scripts/lib/release-contents.mjs` 同时收了那份重复写在两个打包脚本里的
`archiveItems` 清单（`dist server scripts package.json package-lock.json`）。

**清理选择说明**：测试删的是**自己这一轮写出来的**文件，且删之前二次确认路径在
`public/uploads` 之内 —— 不会碰到任何真实上传。已存在的那 20 个是**用户明确同意后**才删的
（安全规则第 3 条），它们全部匹配 `*-pixel.png` / `*-health-checked.png` 且都 < 2K，
不在 git 里（`public/uploads` 已 gitignore），线上那份持久目录**没动**（仍 31 个文件）。

### 验证

- `npm run build`：通过，构建后 `dist/uploads` 不存在
- `npm run lint`：通过
- `npm run test:api:db`：**68 通过**；跑完 `public/uploads` 文件数不变，日志有
  `[contract.db] removed 1 test upload(s)`（另一个被那条内容健康用例自己删掉了）
- `npm run test:api`：37 通过 / 13 跳过
- `npm run test:content-health`、`test:openapi`、`test:deploy-script`、`test:deploy-backup`：全通过
- **变异测试**：手工在 `dist/uploads/images/` 放一个文件，`assertNoUploadsInBuild()`
  如期报错；删掉后恢复通过 —— 证明那道拦截不是摆设

### 部署

- commit：`54bc670`
- `origin/main`：已推送
- 备份（回滚点）：`/opt/mrright-portfolio.backup-20260815-031633`
- 部署时间：2026-08-15 03:16 UTC，健康检查 1 次通过，admin session 检查通过，
  旧备份按保留策略清掉 1 个（`...-20260814-141513`）
- env 检查：`ADMIN_TOKEN` `[set]`、`DATABASE_URL` `[set]`（未取值）
- 数据库变更：无

### 线上验证

- `/api/health` 200、`/` 200、`/community` 200、`/admin` 200、`/login?mode=login` 200、`/account` 200
- `admin_summary` 200（换会话调用，用完立即吊销）
- Content Health：**0 critical / 0 warning / 0 note**
- `/api/account/profile`、`/downloads`、`/comments`：未登录 401，正常
- `/api/users/not-exist-test-handle` 404、`/api/community/uploads` 200
- **资源仍然照常提供**（这轮的关键回归点）：
  `/uploads/images/...sc-jitan.png` 200 / 2.75 MB、`/uploads/models/...sc-jitan.glb` 200 / 930 KB、
  `/uploads/images/...meihuoqi-render.png` 200 / 8.89 MB、
  `/models/fire-extinguisher-4k...glb` 200 / 3.88 MB（这个来自 dist，一并确认没误伤）
- 线上 `dist/uploads`：已不存在；`find /opt/mrright-portfolio -name '*-pixel.png'` = **0**
- 线上持久上传目录：`public/uploads` 仍 31 个文件，未受影响
- `npm run test:e2e`（打线上）：10 通过 / 4 跳过（跳过的是需要管理员令牌与访客凭证的用例）

### 教训

**「被遮蔽所以无害」不是安全边界。** 一条依赖注册顺序的隐性规则，
在记录里被写成了「永远不会被服务」。真正的答案是：**根本别让它进包**。

## 2026-08-14（第十五轮）：社区上传进入内容健康检查 —— 顺带纠正一个记错的前提

**日期**：2026-08-14
**状态**：**已部署并逐项验证**。

### 部署

- commit：`cd2b655`（内容健康）+ `854d138`（屏幕适配），均已 push 到 `origin/main`
- 部署：2026-08-14 16:25 UTC / 16:28 UTC（见下方注意），服务已重启
- **回滚到本轮之前：`/opt/mrright-portfolio.backup-20260814-162519`**
- 部署前确认：`ADMIN_TOKEN=[set]`、`DATABASE_URL=[set]`
- 无数据库变更（新增的只是一个 SELECT 查询方法）

⚠️ **本轮 `deploy:vps` 跑了两次。** 第一次成功，第二次只是为了拿备份路径而重跑，
结果又完整部署了一遍（代码相同，无害），多产生一个备份 `...-162845`
并按保留策略挤掉了 `...-042611`。**要拿备份路径就看第一次的输出，别重跑部署。**

### 线上验证

- `/api/health`、`/`、`/community`、`/admin`、`/login?mode=login`、`/account`：全部 200
- `admin_summary`：200（短会话，用后已吊销）
- `/admin → Content Health`：0 critical / 0 warning / 0 note，
  `communityUploads: 0 checked`（线上目前没有 approved/pending 的上传，与后台
  「no uploads pending review」一致 —— 所以新检查是**接通了但还没有数据可查**）
- 适配：线上 6 个宽度复测，账号菜单无一 OFFSCREEN；`/admin` 在 490px 下
  `alignItems: stretch`（修复前是 center）、侧栏 `visibility: hidden`、无横向溢出
- `npm run test:e2e`（打线上）：**连续两次 10 通过 / 4 跳过 / 0 失败**

⚠️ 部署重启后**立刻**跑 e2e 有一次 `admin-visitors:233` 失败，单独重跑通过、
之后连续两次全套也通过 —— 服务冷启动导致的偶发，不是回归。**重启后先等一会再跑 e2e。**

### 先纠正前提

第十三轮把这条写成未完项时的理由是：「访客上传的文件同样可能是 Draco 压缩的，
第十轮那个 bug 的原话就是『任何 Draco 模型都会这样，**包括社区上传的**』」。

**这个前提是错的。** 第十轮那个 bug 是**预览器**加载失败，而社区上传**从来不进预览器**：
`CommunityPage.jsx:490`、`AccountPage.jsx:856`、`PublicProfilePage.jsx:157`、
`Admin.jsx:2486` —— 四个使用点全部只渲染 `<a href>` 下载链接，图片才有缩略图。
允许的扩展名里本来就有 `.obj` / `.fbx` / `.zip`，这就是「分享资源」的语义。

所以「渲染不了就拒绝上传」是错的方向：一个 `KHR_texture_basisu` 的 GLB 下载下来
在 Blender 里照样能开。**没有做上传时的新拒绝逻辑**，这是有意的，理由写进了代码注释。

顺带确认：magic bytes 校验其实**早就有**（`fileSignatures` 里检查 `glTF`），
文档里「没有任何校验」也不准确。真正缺的是下面这件事。

### 真正的缺口

**`community_uploads` 完全没被 Content Health 看过。** 数据库里有行、磁盘上文件没了，
访客点下载就是 404，而在此之前没有任何东西会说这件事 —— 行和文件是两个东西，
只有其中一个在数据库里。

### 完成内容

1. **把上传时的签名校验抽成 `server/fileSignatures.js`**，上传路由和健康检查
   共用**同一份**实现。写了注释说明为什么必须共用：两份"等价"实现，
   正是检查器开始祝福上传方会拒绝的文件的方式。
2. **`checkCommunityUploads`**：查 approved + pending 的行（rejected 的文件本就不可达，
   缺失是系统在正常工作）。三类问题 ——
   - `upload-missing-file`：approved 记 critical（访客现在就能点到），pending 记 warning（轮到审核的人）
   - `upload-wrong-format`：存进来的字节和扩展名不符（早于签名校验的老行）
   - `upload-size-drift`：文件大小和入库时记录的不一致，廉价的截断信号
3. **`listUploadsForHealth`**（`postgresStores.js`）、路由接线（store 缺失时降级为空数组）
4. **`/admin → Content Health` 新增 Community uploads 面板**，问题同时进入顶部 Findings 列表，
   带「Open community」跳转
5. 给 sniffer 补了 `zip` 类型，否则 `.zip` 会落到 `unknown`，读起来像损坏

### 修改文件

- `server/fileSignatures.js`（新增，从 `index.js` 抽出）
- `server/contentHealth.js`、`server/index.js`、`server/postgresStores.js`
- `src/components/admin/AdminContentHealth.jsx`
- `scripts/verify-content-health.mjs`、`tests/api/contract.db.spec.js`
- `docs/openapi/api-v1.yaml`
- 屏幕适配：`src/index.css`、`src/sections/Navbar.jsx`、`tests/e2e/admin-visitors.spec.js`

### 验证结果

- `npm run build`、`npm run lint`（exit 0）、`npm run test:openapi`：通过
- `npm run test:content-health`：通过，新增 7 条断言
- `npm run test:api`：37 通过 / 13 跳过
- `npm run test:api:db`：**68 通过**（原 67 + 新增 1 条端到端）
- `npm run test:e2e`（打线上）：**10 通过 / 4 跳过 / 0 失败**（修好那两条之后）
- 后台面板用假数据在浏览器里渲染确认过四种状态：缺文件、格式不符、正常 zip、正常图片

**变异测试**（新断言必须真的会咬，四处全部被抓到）：

| 变异 | 被抓的断言 |
|---|---|
| approved 缺文件降级为 warning | a missing approved upload was not critical |
| 跳过签名校验 | a PNG stored as .glb was not reported |
| 上传问题不计入 counts | counts (14) disagree with issues (17) |
| 路由不把 uploads 传给检查器 | 端到端：a stored upload was not checked at all |

### 同轮追加：屏幕适配

用户截图指出 `/admin` 在窄屏下没适配。先说清楚：**截图看到的是线上 `39ac799`，不含本轮改动**，
所以不是这轮弄坏的；但查下去发现了四个真问题，一并修掉。

**1. 后台顶栏在窄屏整块居中**（`index.css`）。
`.admin-console .admin-header` 写了 `items-center`，而基类在窄屏是 `flex-col` ——
列方向上 `items-center` 的含义是**把每个子元素水平居中**，于是顶栏居中、下面所有面板左对齐。
更能说明问题的是：`@media (max-width: 767px)` 里早就有人写了 `.admin-header { items-stretch }`
想修它，但 `.admin-console .admin-header` 特异性更高（0,2,0 > 0,1,0），**那条修复从来没生效过**。
改成 `md:items-center` 后，窄屏回到 stretch。

**2. 关闭的侧栏抽屉仍可点、仍在 Tab 顺序里**（`index.css`）。
`-translate-x-full` 只是视觉移走，按钮照样能点。窄屏第一次按 Tab 会掉进看不见的菜单。
改用 `visibility: hidden` + 延迟 200ms 的过渡，关闭动画不受影响。

**3. 公开页头在 640–950px 之间是坏的**（`Navbar.jsx`，**这条最严重**）。
桌面导航在 `sm`(640px) 就展开，但整条 header（品牌 + 6 链接 + 语言切换 + 账号菜单）
要 ~960px 才放得下。**640px 到 ~950px 之间账号菜单被排到视口外，
再被 `body{overflow-x:hidden}` 剪掉 —— 平板和小笔电上根本无法登录。**
断点提到 `lg`(1024px)，和后台侧栏停靠断点一致。移动面板里本来就有导航、
语言切换和账号菜单，所以这些宽度是**拿回**功能而不是失去。
配套把 `.nav-ul` / `.nav-li` 的 `sm:` / `max-sm:` 一起提到 `lg:` / `max-lg:` ——
同一个 `<ul>` 服务两种布局，不同步的话面板里的链接会从 640px 起挤成紧贴左边的一行。

**4. `/community` 在 360px 裁切**（`index.css`）。`.auth-nav` 不换行，
品牌 + 返回链接 + 语言切换放不下，`日` 按钮被切掉。加 `flex-wrap`。

**顺带修好一个坏了三轮的测试**：`tests/e2e/admin-visitors.spec.js` 找名为 `Visitors`
的导航按钮，但第十二轮重做 `/admin` 时已改名 `Members`。`npm run test:e2e` 默认打线上，
所以这两条一直在失败、只是没人跑。

适配验证方式：5 个页面 × 9 个宽度（320→1440）逐一量 `scrollWidth` 与逐元素越界，
排除 `overflow-x:auto` 的横向滚动筛选条和 `100vw` 与滚动条差值这两类假阳性。
修完 45 个组合里 0 个真问题。

### 待办

1. 本地跑 `test:api:db` 会往 `public/uploads/` 漏测试文件（现有 20 个 `pixel.png`），
   vite 再把它们拷进 `dist/`，部署时一路带到线上。目前无害
   —— 线上 `/uploads` 从持久化的 `public/uploads` 提供，`dist/uploads` 被遮蔽 ——
   但这是垃圾在往生产环境流。按安全规则第 3 条没有擅自删除。

## 2026-08-14（第十四轮）：真 HDRI 进场 —— IBL 第一次真的亮起来

**日期**：2026-08-14
**状态**：本地完成，**未 commit、未 push、未部署**。

### 完成内容

用户提供了一张真正的影棚 HDRI（`monochrome_studio_02`，1K，来自本机 `H:\HDRIs\`），
把第十轮起就挂着的那条未完项关掉了。

**1. 确认旧文件到底是什么。** `studio-tomoco.exr` 的前 4 字节不是 EXR magic
（`76 2f 31 01`），而是 UTF-16 键值：`resource_version` / `resource_usage` /
`relative_shelf_path` / `/environments/Studio previews`，后面跟一段 `RIFF....WEBP VP8`。
**它是某个 DCC 工具（Substance 一类）的 shelf 资源缩略图，被改名成了 `.exr`。**
`StudioEnvironment` 的 error 回调只做了 `generator.dispose()`，
所以失败是**完全静默**的：`environment` 恒为 `null`，组件 `return null`，
四个 `useEnvironment: true` 的档案一直只有 key/fill/rim 三盏点光源在照。

**2. 转换，而不是直接丢进去。** 原文件 1024×512、PIZ 压缩、**4 条 FLOAT32 通道**，
其中 alpha 恒为 `14.3716`（无意义的常量通道）—— 5.65 MB 里绝大部分是浪费。
本机没有 oiiotool / imagemagick / OpenEXR / numpy，**也装不了**，
所以转换是用 Node 直接写的：解码用站点同款 `EXRLoader`，编码手写，
按 `EXRLoader` 的 `predictor` + `interleaveScalar` 做**精确逆运算**，
输出半浮点 + ZIP、只保留 B/G/R 三通道。结果 **1.47 MB（-74%）**。

**3. 验收标准定成往返比对**，不是"看着像"：新文件用同一个 `EXRLoader` 解回来，
与原始浮点数据逐像素比 —— **最大相对误差 0.0488%**（纯半浮点量化）、平均 0.017%，
y=0/128/256/384/511 各行均值与原文件完全一致（证明**没有上下颠倒** ——
`EXRLoader` 在 `outLineOffset` 处会做 Y 翻转，编码时必须翻回去）。

**4. 浏览器里做了 A/B。** 临时页面（用完即删）渲染 5 颗不同金属度/粗糙度的球，
刻意**不加任何点光源**以隔离环境贡献：旧行为全黑，新 HDRI 下铬球能清楚照出
左右两块柔光箱和中间的八角灯，金球有正确的金属反射。

### 修改文件

- `public/assets/environments/monochrome-studio-02-1k.exr`（新增，1.47 MB）
- `src/components/ModelPreview.jsx`（`environmentUrl` 指向新文件）
- `server/contentHealth.js`（检查目标改为新文件，路径提为局部常量，原本硬编码了两处；
  顶部注释改为过去时）
- `scripts/verify-content-health.mjs`（fixture 文件名跟着改，否则检查器找不到文件）
- `public/assets/environments/studio-tomoco.exr`（**删除**）

### 部署

- commit hash：`39ac799`（已 push 到 `origin/main`）
- 部署：`npm run deploy:vps`，2026-08-14 14:15 UTC 完成，服务已重启
- **VPS 应用备份：`/opt/mrright-portfolio.backup-20260814-141513`**（回滚回这里）
- 部署前确认：`ADMIN_TOKEN=[set]`、`DATABASE_URL=[set]`
- 无数据库变更

### 验证结果

本地：

- `npm run build`：通过
- `npm run lint`：通过（exit 0）
- `npm run test:content-health`：通过

线上（全部 200）：

- `/api/health`、`/`、`/community`、`/admin`、`/login?mode=login`、`/account`
- `admin_summary`：200（短会话，用后已吊销）
- `/assets/environments/monochrome-studio-02-1k.exr`：200、`image/aces`、1537452 字节，
  且远端取前 4 字节是 `76 2f 31 01` —— **线上这份是真 EXR**
- **`/admin → Content Health`：0 critical / 0 warning / 0 note**（那条 warning 归零了）
  环境贴图那项：`found=exr`、`issue=none`

浏览器端到端（Playwright，线上真实页面）：

- 打开次世代灭火器的模型预览，`.exr` 请求 200、302 ms
- **console 0 errors** —— 以前每次打开必留的
  `Cannot read properties of undefined (reading 'image')` 不再出现
- 顶点 9,295 / 三角面 12,649 / 材质 1，都是真数字（不是 `Unknown`），
  按第十轮的教训，这才算确认"真的渲染出来了"

### 用户拍板的三件事（同一轮内完成）

1. **删掉 `public/assets/environments/studio-tomoco.exr`**（`git rm`，可从历史取回）。
   `server/contentHealth.js` 顶部那条"信文件头不信扩展名"的注释改成了过去时 ——
   规则的由来要留，但不能再指着一个已经不存在的文件说"它是"。
2. **给 `StudioEnvironment` 的 error 回调加了一行 `console.error`**（带 URL 和原始 error）。
   这是全文件唯一一处 `console.`，破例的理由写在紧挨着的注释里：
   这次的 bug 藏了好几轮，就是因为这里当初什么都不说。
3. **提交 + 部署**（见下面「部署」）。

### 教训

1. **本机 `curl localhost` 会走机场代理。** 环境变量里有
   `http_proxy=http://172.29.176.1:7897`（`https_proxy` / 大写同名变量都有）。
   这一轮起初测本地 `vite preview`，`/assets/.../新文件.exr` 返回 index.html、
   `/api/health` 却返回真 JSON、响应头还带着 `report-uri /api/csp-report` ——
   **因为请求根本没到本地，被代理转发到线上 mrright.blog 去了。**
   `ss` 显示 4173 上只有 vite、没有任何 Express 进程，就是这个矛盾的线索。
   **以后验证本地服务一律加 `curl --noproxy '*'`。**

2. **信文件头，不信扩展名 —— 这条第十三轮记过一次，这一轮又验证一次。**
   区别是这次连"它到底是什么"都查清楚了：是 shelf 缩略图，不是随便一段坏数据。

3. **换二进制资源，验收要用往返比对，不能靠肉眼。** 肉眼看不出半浮点量化，
   但**能看出上下颠倒** —— 而恰恰是朝向这种事，逐行均值比对一秒就能确认。

## 2026-08-14（第十三轮）：内容健康检查 —— 让沉默的资源损坏自己说话

日期：2026-08-14
commit：`a681ee7`（功能）+ `c54c787`（修误报），均已 push 并部署
备份路径：`/opt/mrright-portfolio.backup-20260814-042611`

起因是第十轮那件事的**根因还在**：灭火器预览「从来没加载出来过」，
而且**没人知道**，因为报错只出现在没人看的 console 里。
同类问题现在还活着一个：`studio-tomoco.exr` 根本不是 EXR 文件。
所以这一轮做的不是「修那个模型」，而是**让这类沉默失败有地方报警**。

### 完成内容

**新模块 `server/contentHealth.js` + 路由 `GET /api/admin/content-health`。**
它会把目录里每个 URL 在服务端**真的打开**，然后回答：

1. **查的是被服务的东西，不是仓库里的东西。** express 服务的是 `dist/`，
   所以只存在于 `public/`、没进构建的文件对访客就是 404。
   优先在 `dist/` 里找，只在 `public/` 找到的会明确报「未构建」。
2. **信文件头，不信扩展名。** `studio-tomoco.exr` 名字是 .exr、
   代码按 EXR 加载、但它不是 —— 头几个字节是 UTF-16 文本。
   扩展名是声明，文件头才是证据。
3. **每条结论都说明访客会看到什么。**「图片缺失」是事实，
   「项目卡片会渲染成一张破图」才是它为什么要紧。

具体检查：图片/模型是否 404、是否是声称的格式、GLB 的
`extensionsRequired`、**Draco 模型是否有本地解码器**（第十轮那个 bug 变成了断言）、
模型是否过大、以及**语言缺口**。

### 顺手修掉一个一直在误报的东西

`pickLocalized()` 里，**无后缀的 `title`/`summary`/`workflow` 本身就是英文原文**，
也是所有语言的兜底。而 `/admin` 的翻译状态标签一直把 `En` 当成和 `Zh`/`Ja` 一样的后缀，
于是**每一个项目**都被标成「EN fallback」—— 这正是让人学会无视状态面板的那种噪音。
已修：`En` 的完整度改为按无后缀字段判断。新检查器也只报 `Zh`/`Ja` 缺口，
无后缀字段为空则是更严重的「内容缺失」。

### 新增测试 `npm run test:content-health`

对着一棵**故意做坏的** fixture 树跑：缺失的模型、名为 .glb 的 PNG、
只存在于 `public/` 的图片、两边都存在时必须读 `dist/` 的那份、
路径穿越、以及**删掉解码器后 Draco 模型必须被点名**。

**做过变异测试**，确认它不是摆设：把 `En` 改回按后缀判断、
关掉文件头嗅探、把 `public/` 排到 `dist/` 前面、禁用 Draco 断言 ——
四种改法全部被测试抓到并失败。（前两轮的写法漏掉了后两种，是补测试补上的。）

### 前端

`/admin` → Catalogue → **Content Health**：先列**结论**（按严重度排序，
`note` 默认折叠，因为 5 条「没有 3D 预览」会把 2 条真故障挤下去），
再列每个项目的文件详情（可展开看真实路径、格式、字节数、从哪个目录服务、
glTF 的网格/材质/贴图数与所需扩展）、以及不属于任何项目的共享资源。

### 修改文件

- `server/contentHealth.js`（新）
- `server/index.js`：新增 `/api/admin/content-health` 路由
- `scripts/verify-content-health.mjs`（新）+ `package.json` 加 `test:content-health`
- `src/components/admin/AdminContentHealth.jsx`（新）
- `src/components/admin/AdminIcon.jsx`：加 `ok` / `alert` 图标
- `src/Admin.jsx`：加 Content Health 分区；修 `getTranslationState` 的 En 误报
- `src/lib/api.js`：`getAdminContentHealth`
- `src/index.css`：content health 样式段
- `docs/openapi/api-v1.yaml`：补 `/admin/content-health`

### 数据库变更

**无。**

### ⚠️ 第一版上线后报了 7 条 critical，全是误报 —— 已修（`c54c787`）

**教训值得记下来，因为它正是这个模块想避免的那种失败。**

第一版断言「所有资源都必须在 `dist/` 里」，结果对着一个**全部资源都返回 200**
的生产站点报了 7 条 critical。原因：线上四个项目的图片和模型**全是 `/uploads/...`**，
而这个路径是**直接从 `public/uploads` 提供**的，挂载顺序在 dist 静态之前 ——
对上传文件来说，`public/` 不是过期副本，它就是正确答案。

修法：**按 URL 分别推导预期来源**（构建产物 → `dist/`，上传文件 → `public/uploads`）。
反向的情况仍然算真故障：只存在于 `dist/` 里的上传文件，下次部署就会被抹掉。

已补 fixture 并做变异测试：把 `expectedRootFor` 改回常量，两条断言立刻失败。

也顺带证明了那条备忘：**线上目录跟 `content.js` 完全不是一套**
（线上是 crimson-rune-greatsword / md-leimu / shadow-altar-candle-shrine /
fire-extinguisher-next-gen），本地对着 `content.js` 跑出来的结论不能代表线上。

### 线上真实结论（修复后，对线上库 + 线上文件跑的结果）

- **0 critical / 1 warning / 0 note**
- 四个项目全部 clean
- 唯一那条真警告：`studio-tomoco.exr` 不是 EXR（第十轮就记过，现在后台会自己说）
- 灭火器已可验证正常：`glb · 3.7 MB · served from dist/`、
  `requires EXT_texture_webp, KHR_draco_mesh_compression`，解码器在位

### 线上验证

- `/api/health` 200 · `/` 200 · `/community` 200 · `/admin` 200 ·
  `/login?mode=login` 200 · `/account` 200
- `/api/admin/content-health` 200；未带凭证 401
- 资源实测：`/uploads/images/...` 200、`/uploads/models/...` 200、
  `/models/fire-extinguisher-4k...glb` 200、`/draco/draco_decoder.wasm` 200
- 线上 Playwright：`/admin`、`/`、`/community`、`/account` 无 console 报错、无 5xx
- 用于验证的短时会话已 revoke

### 待办

1. **`studio-tomoco.exr` 仍然需要一张真的 HDRI**。这是美术资产决定，不是代码改动。
   现在的区别是：不修的话，后台每次都会提醒你。
2. 仪表盘**没有**接内容健康的信号 —— 那个检查要读文件，
   而仪表盘是每次打开都拉的。故意让它按需触发。

## 2026-08-14（第十二轮）：/admin 整体重构 —— 仪表盘、分组侧边栏、System 面板

日期：2026-08-14
commit：`b54fcce`（已 push 到 `origin/main`，已部署并线上验证）

起因是一句「现在的管理员后台好简陋」，加一句「不要吝啬创造力，可以完全重构」。

### 完成内容

**1. 新接口 `GET /api/admin/overview?days=7|30|90`** —— 仪表盘的唯一数据源。
一次请求返回：各项计数 + 本窗口/上一等长窗口的对比、按天的时间序列、
待办队列（含最老一条的等待时长）、项目互动排行、合并活动流、
站点常量（存储、已验证会员、管理员二次验证状态）、以及运行时状态。

**为什么是一个接口而不是十一个**：仪表盘是一个视图，要么加载出来要么没有。
十一个并行请求在 100ms 链路上就是「仪表盘」和「进度条」的区别。
`days` 在服务端夹到 1–365，异常值只会让查询慢，不会让答案错。

**2. `/admin` 外壳重构**：横排药丸 → **分组侧边栏**（Overview / Catalogue /
Moderation / People / Operations），导航项带**待办角标**（只显示"要干的活"，
不显示库存数：以前"Comments 412"什么也没说明，现在"Comments 3"旁边就是三条待审）。
新增 **⌘K/Ctrl+K 命令面板**（跳转 + 新建项目 + 刷新 + 登出），
移动端抽屉 + 遮罩，搜索框只在能过滤的分区出现。

**3. 新增 Dashboard 分区**：主数字（窗口内全部事件 + 同比）、运行时状态条、
"Needs you"待办卡片（全清时是一句明确的"没有任何事等你"）、
6 个带迷你走势图和同比的指标卡、**每日互动堆叠柱状图**（悬停提示 + 表格视图切换）、
项目互动排行、活动时间线、站点与安全态势（含 meter）。

**4. 新增 System 分区**：进程运行时（uptime、Node、内存、数据库往返、CSP 上报数、
邮件是否配置）、**请求链诊断**（解析出的客户端 IP / XFF / 信任跳数 —— 正好对应
备忘里那条"真实客户端 IP 拿不到"）、在线管理员会话、审计流水。
这些以前只能 SSH 上去看，所以平时没人看。

### 图表配色是算出来的，不是挑出来的

三条序列色 `#00a3ad` / `#c01762` / `#8b7af0` 是把品牌色（aqua/coral/lavender）
在 OKLCH 里重新取阶，跑校验脚本直到六项全过（深色面板 `#101321`）：
亮度带、彩度下限、**色盲分离度（最差相邻对 ΔE 12.9，目标 8）**、
常视觉下限、对比度全部 ≥3:1。**品牌原色本身过不了亮度带**，所以不能直接用
`--color-aqua`。改这三个值必须重跑校验。

坐标轴刻度按"步长取整"而不是"上限取整"：后者会给出 12.5 和 37.5 这种刻度，
而这里每个序列都是件数，半条评论不存在。空窗口时刻度也被限制为整数。

### 修改文件

- `server/postgresStores.js`：新增 `adminStore.getOverview()`
- `server/index.js`：新增 `/api/admin/overview` 路由（含 `system` 块）
- `src/lib/api.js`：`getAdminOverview` / `getAdminActions` / `getAdminSessions` / `getAdminDiagnostics`
- `src/Admin.jsx`：外壳重构、分组导航、角标、命令面板、range 切换
- `src/components/admin/AdminDashboard.jsx`（新）
- `src/components/admin/AdminSystemPanel.jsx`（新）
- `src/components/admin/AdminCommandPalette.jsx`（新）
- `src/components/admin/AdminIcon.jsx`（新，内联 SVG 图标，不用 emoji）
- `src/components/admin/Charts.jsx`（新，Sparkline / StackedColumns / BarList / Meter）
- `src/components/admin/charts.js`（新，配色与几何辅助）
- `src/index.css`：新增 admin console 样式段
- `docs/openapi/api-v1.yaml`：补 `/admin/overview`

**没有动 `.admin-shell`**：`/account` 和 `/u/:handle` 也在用它，控制台改用
新的 `.admin-console`。

### 数据库变更

**无。** 没有新表、没有新列、没有 DDL。全部是只读聚合查询。

### 验证结果

- `npm run build`：通过
- `npm run lint`：通过
- `npm run test:openapi`：通过（203 个 $ref、36 个错误码）
- 全部 SQL 已对**线上库**逐条实跑通过（只读 SELECT）
- `getOverview()` 真实代码已在 VPS 上对线上库跑通（7/30/90 天，
  序列长度分别为 7/30/90）。运行在 `/root/overview-check` 临时目录，
  `node_modules` 用软链引用，**临时目录已删除，`/opt` 未被触碰**，
  且该次运行把 `ensureSchema` 注释掉了，没有执行任何 DDL。
- 本地 Playwright：/admin 全部十个分区逐个打开，**console 零报错**；
  已截图核对桌面版、移动版（430px）、命令面板、空数据态
- VPS 部署：**成功**（2026-08-14 03:29 UTC）
- 备份路径：`/opt/mrright-portfolio.backup-20260814-032910`
  （env 备份 `/etc/mrright-portfolio.env.backup-20260814-032910`）
- 服务状态：active，磁盘 42%
- GitHub push：**已执行**，`origin/main` 与本地同步（含积压的五个 commit）

### 线上验证结果

- `/api/health` 200 · `/` 200 · `/community` 200 · `/admin` 200 ·
  `/login?mode=login` 200 · `/account` 200
- `admin_summary` 200
- **新接口**：`/api/admin/overview?days=7|30|90` 全部 200，
  序列长度分别 7/30/90；未带凭证时 401
- `/api/admin/sessions`、`/api/admin/actions`、`/api/admin/diagnostics` 全部 200
- 线上数据库往返 9ms
- 线上 Playwright：`/admin`、`/`、`/community`、`/account` 均无 console 报错、无 5xx
- 用于验证的短时会话已 revoke

### 待办

1. **线上数据现在很少**（2 赞 / 2 评论 / 1 会员 / 0 上传），所以仪表盘大面积是空状态。
   这是照着这个前提设计的，不是 bug。
2. 第十、十一轮遗留的未完项仍然有效（认证器实绑、studio-tomoco.exr 不是 EXR 文件等），
   见上面「收工时的未完项」。

## 2026-08-14（第十一轮）：自助换认证器 + 补上从来没有过的二维码

日期：2026-08-14
commit：`9daf048`

### 完成内容

`/admin` 新增 **Security** 标签页：填用户名 + 账号密码 → 显示二维码（外加可手输的
base32 密钥）→ 扫码后输入 6 位码 → 完成切换，并一次性给出新恢复码。

**为什么是两步而不是一步。** 新密钥先作为候选存进 `pending_totp_secret`，
放在还在用的密钥**旁边**，只有用候选生成的码验证通过才替换 `totp_secret`。
一步式重置会把「扫错 / 扫漏 / 中途关页面」直接变成锁死账号 ——
而那正是这条流程要救的处境。**中途放弃，原来的认证器照常能登录。**
提升动作是单条带条件的 UPDATE，所以两个并发确认不会互相覆盖。

**为什么两步都要密码。** 光有 admin 会话不够：共享令牌开出来的会话背后没有具体的人，
不能让它把某个具名账号的第二因素挪到新设备上。用户名不存在与密码错返回完全一致的
响应（且都跑一次 pbkdf2），不做账号枚举器。确认步骤收 6 位码，而账号锁定只统计**登录**
失败、盖不住这里，所以这两个路由自带限流（`ADMIN_TOTP_ENROL_LIMIT_PER_WINDOW`，
默认 15 分钟 10 次）。

**不吊销现有会话**，与 `reset-password` 一致：这条流程是「手机丢了」的恢复；
CLI 的 `reset-totp` 是「怀疑泄露」的响应，那个才需要把别人踹下线，两者刻意不同。

二维码用动态 import，落在单独的 25.8 kB chunk 里，只有真正打开这个面板的人才会下载，
Admin 主包只涨 4.6 kB。

### 修改文件

- `server/index.js`（两个端点 + 限流）
- `server/postgresStores.js`（两列 schema + 三个 store 方法 + mapper）
- `src/components/AdminTotpEnrolment.jsx`（新增）
- `src/Admin.jsx`、`src/lib/api.js`、`src/index.css`
- `tests/api/admin-auth.db.spec.js`（+4 项）
- `docs/OPERATIONS_ADMIN_AUTH.md`
- `package.json` / `package-lock.json`（devDep：qrcode）

### 数据库变更

`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS pending_totp_secret text,
pending_totp_expires_at timestamptz;` —— 幂等，随服务启动的 `ensureSchema` 自动执行，
不改动任何现有数据。

### 验证结果

- npm run build：通过
- npm run lint：通过
- npm run test:api:db：**67 项全过**（`admin-auth.db.spec.js` 13 项，其中重新绑定 4 项）
- npm run test:admin-totp：通过（RFC 6238 向量）
- npm run test:openapi：通过（200 个 $ref、36 个错误码）
- npm run test:deploy-backup：通过
- VPS 部署：成功（2026-08-13 16:20 UTC）
- VPS 备份路径：`/opt/mrright-portfolio.backup-20260813-162029`
- schema 迁移：已生效，`admin_users` 上 `pending_totp_secret` / `pending_totp_expires_at` 两列已存在
- /api/health：200；/：200，/community：200，/admin：200，/login?mode=login：200，/account：200
- 模型预览：仍 200（3,881,284 字节）
- 服务日志近 10 分钟 error/500：0
- **线上接口实测（失败路径，token 全程只在服务器 shell 变量里）**：
  无凭证 401；有会话 + 错密码 401；有会话 + 不存在的用户 401 且**文案与错密码逐字相同**；
  未开始就确认 401。事后查库：`right` 账号**没有**被这些失败调用写入任何候选密钥。
- 线上前端：Admin chunk 里能取到 `Show QR code` / `Authenticator QR code` /
  `Confirm and switch`，二维码 chunk `browser-rVazBmbX.js` 200（25,783 字节）
- **成功路径未由我实测**：需要 `right` 的账号密码，按既定做法密码不进对话，
  留给用户在浏览器里走完最后一步
- GitHub push：未执行

新增的 4 项测试断言的不是「顺利路径能走通」，而是**每一种中断方式都不动到还在用的密钥**：
绑定进行中旧码照样登录、旧码不能确认新绑定、切换后旧码与旧恢复码同时失效、
没开始就确认会被拒绝、候选密钥不出现在任何列表里。

### 待办事项

1. **用户在浏览器里走完一次真实绑定**（/admin → Security），确认扫码与切换成功 ——
   成功路径需要账号密码，不由 Claude 代跑。
2. push 到 GitHub（本地领先五个 commit）。
3. 第十轮遗留的 `studio-tomoco.exr` 不是 EXR 文件的问题仍未处理，见下。

## 2026-08-13（第十轮）：模型预览根本没加载出来，以及 42.4 MB 的贴图

日期：2026-08-13
commit：`edf33da`

### 完成内容

**1. 真正的 bug：Draco 解码器被自家 CSP 拦掉，模型永远加载不出来。**

drei 的 `useGLTF` 默认把 DRACOLoader 指向 `https://www.gstatic.com/draco/...`，
而本站 CSP 是 `connect-src 'self'`。灭火器模型是 `KHR_draco_mesh_compression`
**required** 的，于是：42.4 MB 下完 → 解析阶段 `Failed to fetch` → 卡在 86% 不动，
统计栏全是 `Unknown`。用户看到的是「加载很慢」，实际是永远加载不完。

解码器已从 `three/examples/jsm/libs/draco/gltf/` 复制进 `public/draco/`（同源），
并通过 `src/three/dracoDecoderPath.js` 显式传给每一处 `useGLTF` / `preload`
（不用 `useGLTF.setDecoderPath` 全局设置，因为它依赖「在第一次加载前执行」这个
没人保证的时序）。

**2. 体积：42.4 MB 里有 40.35 MB 是三张 4096×4096 无损 PNG。**

几何体只有 12,649 三角面，而且本来就压过 Draco。传输层压缩没有意义
（`gzip -9` 压整个 GLB 只省 0.04%，PNG 已经 deflate 过），所以只能改像素编码。
新增 `scripts/optimize-model.mjs`，按贴图用途分别选参数，参数是**量出来的**：

| 贴图 | 前 | 后 | 依据 |
| --- | --- | --- | --- |
| baseColor | 17.68 MB | 0.81 MB | q82，PSNR 37.8 dB |
| normal | 11.38 MB | 1.21 MB | q92，法线平均角度误差 1.0° |
| metal/rough | 11.29 MB | 1.60 MB | near-lossless + 限制 2K |

金属/粗糙度图是唯一需要特殊对待的：它的蓝通道是接近二值的金属遮罩，
有损编码在硬边上的振铃把 **0.63% 的像素判成了错误材质**（材质交界处一圈毛边），
而且**从 q88 提到 q95 完全没改善**（0.635% → 0.628%）—— 说明这是边缘振铃，
不是码率不够，加质量只是白花体积。near-lossless 把它压到 0.03%；
它同时是三张图里最不依赖分辨率的一张（粗糙度是平滑场、金属是大块遮罩），
所以把它限制在 2K 来付这笔账。

**42.4 MB → 3.7 MB，基础色和法线仍然是 4K。**

**3. 缓存。** 优化后的预览文件名带 8 位内容哈希，`setStaticCacheHeaders`
现在对任何带哈希的文件名发 `max-age=31536000, immutable`
（之前几 MB 的 GLB 每次访问都要付一次回源验证）。`/draco/` 给一周。

**4. 归位。** 11 MB 的 2K 源文件从 `public/models/` 移到 `art-source/`，
不再被打包进 dist、不再每次部署都传一遍。**VPS 上那个 42.4 MB 的上传文件原样保留**，
它是这份资产的存档，`public/uploads/models/1781017698552-tl-miehuoqi.glb`。

### 修改文件

- `src/three/dracoDecoderPath.js`（新增）
- `src/components/ModelPreview.jsx`、`src/three/objects/Astronaut.jsx`
- `scripts/optimize-model.mjs`（新增）
- `public/draco/`（新增，来自 three r182）
- `public/models/fire-extinguisher-4k.3fa834b2.glb`（新增，3.7 MB）
- `public/models/fire-extinguisher.glb` → `art-source/models/fire-extinguisher.glb`
- `server/content.js`（modelUrl、modelSize、workflow 文案）
- `server/index.js`（`setStaticCacheHeaders`）
- `package.json` / `package-lock.json`（devDeps：sharp、@gltf-transform/\*、draco3d）

### 数据库变更

`project_overrides` 里 `slug = 'fire-extinguisher-next-gen'` 的**一行**，
`UPDATE 1`：`model_url` 指向新预览文件，`model_size` / `model_size_en` /
`model_size_zh` / `model_size_ja` 从「40 MB」「11.1 MB GLB 预览」改成 3.7 MB。
（`model_size_en` 之前存的是中文，一并改正。）没有删除任何行。

### 验证结果

- npm run build：通过
- npm run lint：通过
- VPS 部署：成功（2026-08-13 15:01 UTC）
- VPS 备份路径：`/opt/mrright-portfolio.backup-20260813-150109`
- /api/health：200
- admin_summary：200（部署脚本用短时会话验证后已吊销）
- /：200，/community：200，/admin：200，/login?mode=login：200，/account：200
- /api/account/profile：未登录 401，正常
- /api/users/not-exist-test-handle：404，正常
- 服务日志近 20 分钟 error/500：0
- **线上 Playwright 实测模型预览：模型渲染成功，顶点 9,295 / 三角面 12,649 /
  材质 1 / 贴图 3 / 包围盒 0.30 × 0.61 × 0.17 —— 修复前这些全是 `Unknown`**
- 线上实际请求：`/models/fire-extinguisher-4k.3fa834b2.glb`（3.88 MB，
  `cache-control: public, max-age=31536000, immutable`）+ `/draco/draco_wasm_wrapper.js`
  + `/draco/draco_decoder.wasm`，全部 200，无 CSP 违规
- GitHub push：**未执行**（本地领先 origin/main 一个 commit）

### 待办事项

1. **`public/assets/environments/studio-tomoco.exr` 不是 EXR 文件。**
   它的文件头是 UTF-16 文本 `resource_ver...`，`file(1)` 判定为 `data`。
   于是 `EXRLoader.parse()` 抛错，Studio 环境光（IBL）**从来没生效过**，
   并且因为 three 的 `DataTextureLoader` 在调用 `onError` 之后没有 `return`，
   还会在 console 留一条 `Cannot read properties of undefined (reading 'image')`。
   这是旧问题，之前被「模型永远加载不出来」挡住了（环境和模型在同一个 Suspense 里）。
   修它需要一张真的 HDRI/EXR，属于美术资产决定，等用户定。
2. 4K 基础色 + 4K 法线在移动端显存占用不小（各 4096²×4 ≈ 67 MB 解码后）。
   如果移动端反馈卡，把它们也降到 2K 即可：改 `scripts/optimize-model.mjs` 里的
   `MAX_DATA_MAP_SIZE` 适用范围重跑，产出 2K 版只有 2.12 MB。
3. 其它项目的模型预览没有逐个点开验证过，只验证了第一个（能正常渲染）。
4. push 到 GitHub。

## 2026-08-13（第九轮）：命名管理员账号 + TOTP + 审计归因

日期：2026-08-13
commit：`fa64795`（主体）、`a041014`（CLI 用户名大小写）
线上版本：`a041014`（2026-08-13 12:16 UTC 部署）

在此之前，「管理员」的意思是「知道 `ADMIN_TOKEN` 的人」：一个共享密钥、没有第二因素，
而且审计表 `admin_user_actions` 记的是**对哪个访客做了什么**，不是**谁做的**。
第六轮把静态令牌收紧成「只能换会话」是这个方向的第 2 步，这一轮是第 3 步。

现在：用户名 + 密码 + 6 位 TOTP（或一枚恢复码）→ `POST /api/admin/login` → 12 小时会话，
`admin_sessions.admin_user_id` 指向这个人，这期间的动作写 `admin_user_actions.actor_admin_user_id`。
静态 token 仍能换会话（引导 / 救援），但那种会话在审计里记为「无人」，
`/admin` 页头会写明 **Signed in with the shared admin token (actions are not attributed)** ——
不可归因应该在干活时就看得见，而不是事后才发现。

### 修改文件

| 文件 | 作用 |
| --- | --- |
| `server/adminTotp.js`（新） | TOTP 生成 / 校验、恢复码 |
| `server/passwordHash.js` | 抽出与访客共用的 pbkdf2 实现 |
| `server/postgresStores.js` | `admin_users` 表、两处 `ADD COLUMN IF NOT EXISTS`、账号与归因查询 |
| `server/index.js` | `/api/admin/login`、`/me`、`/users`、`/me/recovery-codes`、`/actions` |
| `server/responses.js` | 新错误码 |
| `src/Admin.jsx`、`src/lib/api.js` | 账号 / 恢复码 / 共享令牌三种登录模式，页头显示当前身份 |
| `scripts/admin-user.mjs`（新） | 引导与救援 CLI（create / list / reset-totp / recovery-codes / disable） |
| `scripts/verify-admin-totp.mjs`（新） | 对着 RFC 6238 测试向量验证 TOTP |
| `tests/api/admin-auth.db.spec.js`（新） | 真数据库端到端 9 项 |
| `docs/OPERATIONS_ADMIN_AUTH.md`、`docs/openapi/api-v1.yaml` | 文档与契约 |

### 几个刻意的设计选择

- **`totp_last_step` 让 6 位码一次性。** TOTP 天然在 30 秒内可重放；记住上次成功的时间步、
  拒绝小于等于它的步之后重放才真的被挡住，抢同一个码的两个请求只有一个能赢
  （`UPDATE ... WHERE totp_last_step < $2`）。
- **恢复码是敢于强制第二因素的前提。** 手机丢了的答案是信封里的一枚恢复码，
  不是 SSH 上去手写 UPDATE。SHA-256 存哈希、一枚一用；不用 pbkdf2 是因为它们是 80 位机器熵，
  而且「若还在则删掉这一枚」必须是单条语句才没有竞态。
- **密码错与用户名不存在返回完全相同的码和文案**，且都跑一次 pbkdf2 —— 否则这个接口就是账号枚举器。
- **停用账号同步删掉它的会话**，否则「停用」最长 12 小时后才生效；**不能停用自己正在用的账号**。
- **CLI 的密码从终端读，不走 argv**（argv 会进 `ps` 和 shell 历史）。
- `a041014`：CLI 现在和 API 一样按大小写不敏感匹配用户名 —— 两边不一致会让
  「明明创建过却 reset 不了」这种问题很难查。

### 验证

- `npm run build`：通过
- `npm run lint`：通过
- `npm run test:admin-totp`：通过（RFC 6238 向量 + 窗口 + 重放 + 恢复码格式）
- GitHub push：`a041014` 已推，本地与 `origin/main` 一致
- VPS 部署：成功（`npm run deploy:vps`，密钥认证一条命令跑完）
- 服务重启：成功，健康检查第 1 次即通过
- 数据库迁移（服务启动时自动、幂等、纯加法）：
  `admin_users` 建表；`admin_sessions.admin_user_id`、`admin_user_actions.actor_admin_user_id`
  两个 `ADD COLUMN IF NOT EXISTS`。线上复验两列均已存在，无删除无改写。
- 线上 `/api/health`、`/`、`/community`、`/admin`、`/login?mode=login`、`/account`：全部 200
- 线上 admin_summary：200（部署脚本用短时会话验证并已吊销）
- 线上 `POST /api/admin/login`（不存在的用户 + 错密码）：401，文案为统一的
  「Username, password or verification code is incorrect.」，不泄露账号是否存在
- 线上 `GET /api/admin/me` 未带凭证：401；带共享令牌会话：`username: null`（归因如预期为空）
- 线上 `GET /api/admin/users`：部署后为 `[]`；12:30 UTC 创建第一个账号 `right` 后不再为空
- **账号体系端到端实测（2026-08-13 12:31 UTC，拿真实 TOTP 码打线上接口）**：
  `POST /api/admin/login` 201 并签发会话；`GET /api/admin/me` 返回 `username: "right"`
  （归因生效，不再是 `null`）；该会话调 `/api/admin/summary` 200；
  **重放同一个 6 位码 401**（`totp_last_step` 在线上确实挡住重放）；
  `DELETE /api/admin/session` 200，验证用的会话已吊销；
  `admin-user.mjs list` 显示 `enabled totp:confirmed codes:10`
- 磁盘：42%

备份路径：

- `/opt/mrright-portfolio.backup-20260813-121618`（应用，硬链接）
- `/etc/mrright-portfolio.env.backup-20260813-121618`（env）
- 本轮裁剪掉 `/opt/mrright-portfolio.backup-20260812-051116`，保留最新 3 份

待办：

- ~~线上还没有任何管理员账号~~ —— **同日 12:30 UTC 已创建 `right` 并实测登录通过**。
  一次性的凭证文件在 VPS 上（root 专属），取走后应 `shred -u`。
- 审计归因目前只覆盖两条会写 `admin_user_actions` 的路径。
- 没有「改自己密码」的接口。

## 2026-08-13（第八轮）：把密钥认证的部署路径固化进 `npm run deploy:vps`

结论：**这台机器上现在可以直接 `npm run deploy:vps`**，并且已经用它真实部署过一次作为验收。

第七轮留下的问题是：`deploy-vps.mjs` 只会 ssh2 的**密码认证**（要 `VPS_HOST` + `VPS_PASSWORD`），
而工作机上只有 SSH 密钥、没有密码，所以那条命令实际跑不了；那次上线是**临时拼一份等价的
远端脚本再 `ssh bash -s`** 完成的。能拼对是因为 shell 片段是 import 的，但那条路径
**没固化、没测试，也没人能保证下次拼得一样** —— 真正的风险不是「麻烦」，是「不可复现」。

### 改了什么

| 文件 | 作用 |
| --- | --- |
| `scripts/lib/deploy-remote-script.mjs`（新） | **远端脚本的唯一生成器**（原来内联在 `deploy-vps.mjs` 里） |
| `scripts/lib/ssh-transport.mjs`（新） | 两种传输方式同一个接口：`run` / `upload` / `end` |
| `scripts/deploy-vps.mjs` | 只剩「读环境变量 → 打包 → 上传 → 驱动」 |
| `scripts/verify-deploy-script.mjs`（新） | 不连服务器的校验，`npm run test:deploy-script` |
| `docs/OPERATIONS_DEPLOY.md`（新） | 部署方式、环境变量、干跑、测试、回滚 |

关键设计（两条都是为了「两条路做的事必须一样」这件事能被验证，而不是被承诺）：

- **远端脚本只有一个生成器。** 密钥路径和密码路径共用它，校验脚本再逐字节比一遍两者的输出。
- **密钥路径直接调系统 `ssh`**，不去教 ssh2 认密钥 —— `~/.ssh/config`、agent、`known_hosts`
  这些系统客户端本来就都会处理。制品用 `ssh 'cat > ...'` 流式传（不用 scp）。

新增开关：`VPS_AUTH`（`key` / `password`，无密码时默认 `key`）、`VPS_SSH_KEY`、
`VPS_DRY_RUN=true`（只打印远端脚本就退出，不连接、不打包、不需要先 build）。
`VPS_HOST` 默认 `147.79.20.232`，不再是必填。

### 顺手修掉的一个隐患（还没发作过）

远端脚本以前是**喂给 `bash -s`** 的。这么做时**脚本正文占着远端 stdin**，
中途任何读 stdin 的命令都会把剩下的脚本吃掉 —— 现在没踩到只是因为 `npm ci` 不读 stdin，
而 `systemctl status` 带了 `--no-pager`。改成**先把脚本上传成文件再 `bash <文件> < /dev/null`**，
顺带的好处是部署半途失败时服务器上留得下现场。两种传输方式都走这条路径。

### 验证

- `npm run test:deploy-script`：通过。断言四件事 ——
  1. 生成的脚本 `bash -n` 通过（`VPS_REWRITE_NGINX` × `VPS_REWRITE_SERVICE` 四种组合都测）
  2. 环境变量里的值都被正确引号包住：用 `/opt/we ird'dir; touch <marker>` 和
     `svc'$(touch <marker>)` 这类恶意值试注入，回读值必须原样、marker 必须不存在
  3. 脚本正文**不含任何密钥**（`ADMIN_TOKEN` 是在服务器上从 env 文件读的）——
     这条是 `VPS_DRY_RUN` 能放心打印全文的前提
  4. `VPS_AUTH=key` 与 `VPS_AUTH=password` 的干跑输出**逐字节相同**
- `npm run test:deploy-backup`：通过（未改动那部分，回归确认）
- **传输层真机冒烟**（不部署，只验传输）：3MB 文件上传后 sha256 与本地一致；
  远端路径带引号和空格也正确；读 stdin 的命令不会挂也不会吃脚本；
  非零退出会 reject；流式输出正常
- `npm run build`：通过（`vite build`，5.98s）
- `npm run lint`：通过（`eslint .`，无输出）

日期：2026-08-13（第八轮）
完成内容：`npm run deploy:vps` 支持 SSH 密钥认证并固化；远端脚本改为上传后执行；新增校验与文档
修改文件：`scripts/deploy-vps.mjs`、`scripts/lib/deploy-remote-script.mjs`（新）、
`scripts/lib/ssh-transport.mjs`（新）、`scripts/verify-deploy-script.mjs`（新）、
`docs/OPERATIONS_DEPLOY.md`（新）、`package.json`
commit：见本轮提交
build：通过　lint：通过
部署 VPS：是（2026-08-13 10:21 UTC，**就是用新路径部署的，这次部署本身就是验收**）
VPS 备份路径：`/opt/mrright-portfolio.backup-20260813-102109`（硬链接）；
env 备份 `/etc/mrright-portfolio.env.backup-20260813-102109`；
本次自动裁剪掉最旧的 `...backup-20260812-044929`，保留最新 3 份；磁盘仍 42%
验证接口：`/api/health` 200、`admin_summary` 200（部署脚本用短会话查的，用完已吊销）、
`/` `/community` `/admin` `/login?mode=login` `/account` 全部 200（HTTPS 外部实测）

部署过程中值得记一句：**健康检查是在第 2 次轮询才通过的** —— 第六轮修的那个竞态
（`systemctl restart` 返回时 node 还没 `listen()`）在这次部署里确实起了作用，
按老逻辑这次就会误报部署失败。

### 还没做的（不属于本轮范围）

`scripts/package-vps-release.mjs` 打印的手工脚本仍是自己拼的一个**子集**
（不写 nginx/systemd）。它 import 的是同几段 shell 片段，所以不会在备份/健康检查/admin
校验这些关键处漂移，但它没有共用新的 `buildRemoteScript`。要彻底消除漂移，
可以让它也走生成器 + 一个「跳过 nginx/systemd」的开关。

## 2026-08-12（第七轮）：CSP 切 blocking + DMARC 上线 + 清掉两个遗留物

本轮把「待你决策」清单清空了：CSP 切换（下面主体部分）、DMARC 端到端跑通（「DMARC」小节）、
`sniproxy` 停用（「收尾」小节）、`/etc/nginx/proxy.conf` 结案（顶部「已由你拍板」）。

结论：**CSP 现在真的会拦了**，不再只是记录。策略从 2026-08-11 起 report-only 跑了一天，
收集器一共只报了两条违规，而且两条都是**策略自己写漏了**，不是应用有问题：

| 上报 | 真实原因 | 改法 |
| --- | --- | --- |
| `script-src <- wasm-eval` | `scriptSrc` 根本没写，回落到 `defaultSrc 'self'`，three.js 的解码器编译不了 WebAssembly | `scriptSrc: ["'self'", "'wasm-unsafe-eval'"]` |
| `connect-src <- blob` | 后台上传预览要 fetch 自己刚 `createObjectURL` 出来的 blob | `connectSrc: ["'self'", 'blob:']` |

`'wasm-unsafe-eval'` **只放开 WebAssembly 编译，不会把 `eval()` 或内联脚本放回来** ——
这一点是实测过的，不是查文档得来的（见下面的验证方法）。
顺带把 `upgrade-insecure-requests` 收了回来：它是 helmet 默认项，之前因为 report-only 模式下
浏览器忽略它、还每页刷一条 console error 才被关掉，现在切 blocking 就没有这个理由了。

线上最终生效的头（`content-security-policy`，已无 `-report-only` 那条）：

```
default-src 'self'; base-uri 'self'; font-src 'self' data: https://fonts.gstatic.com;
form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none';
script-src 'self' 'wasm-unsafe-eval'; script-src-attr 'none';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; upgrade-insecure-requests;
worker-src 'self' blob:; connect-src 'self' blob:; report-uri /api/csp-report
```

`report-uri` 特意留着：切 blocking 之后一条违规就等于一个坏掉的页面，
它是**这次浏览器没走到的代码路径**唯一的报警渠道。

### 验证方法（这次学到的两个坑）

1. **不能靠「日志里没有新的 `[CSP]` 行」判断没违规。** 收集器只在第 1、10、每 100 次时打日志
   （`server/index.js` 的 `cspReportCounts`），第 2～9 次是**静默**的。
   可靠信号是浏览器控制台 0 error。
2. **不能用 Playwright 的 `browser_evaluate` 直接测 `WebAssembly.instantiate`。**
   CDP 注入的脚本不受页面 CSP 约束，那么测必然是**假阳性**。
   正确做法是往 `dist/` 里放一个**同源的 `<script src>`**，让页面自己的脚本去跑。

用后一种方法在**本地真实构建 + blocking 策略**下跑出来的结果：

```
["wasm: OK", "blob-fetch: OK", "blob-worker: OK", "eval: correctly blocked"]
```

最后一条是关键：`eval` 仍然被拦，证明加 `'wasm-unsafe-eval'` 没有把 `script-src` 放宽。
探针文件测完已删除。

本地验证（`PORT=4300`、不设 `DATABASE_URL`，走内存 store）：
`/`、`/community`、`/login`、`/admin`、`/account` 全部 0 console error，
宇航员 GLB 正常加载，blob worker 正常启动。

线上验证（部署后用真实数据过了一遍）：

- `/` 200，WebGL canvas 存活，GLB 已加载，外部主机只有 `fonts.googleapis.com` / `fonts.gstatic.com`
- `/community` 200，真实数据渲染正常（1 Discussion / 6 Selected Work）
- 社区帖子详情页 200
- **「Open Model Preview」实测**：真实上传的 `/uploads/models/1781587753846-sc-jitan.glb`（908KB）
  正常渲染，2 个 WebGL canvas 都活着，模型统计信息正常 —— 这是 drei/meshopt 那条 WASM 分支
- `/admin`、`/login?mode=login`、`/account` 全部 200
- **部署后收集器 0 条上报**，浏览器 0 console error

日期：2026-08-12（第七轮）
完成内容：CSP 切 blocking，补齐 `scriptSrc` 与 `connectSrc`，恢复 `upgrade-insecure-requests`
修改文件：`server/index.js`
commit：`2cdb97d`
build：通过（`vite build`，7.02s）
lint：通过（`eslint .`，无输出）
部署 VPS：是（2026-08-12 14:09 UTC）
VPS 备份路径：`/opt/mrright-portfolio.backup-20260812-140940`（硬链接）；
env 备份 `/etc/mrright-portfolio.env.backup-20260812-140940`；
本次部署后自动裁剪掉最旧的 `...backup-20260812-043445`，保留最新 3 份；磁盘仍 42%
验证接口：`/api/health` 200、`admin_summary` 200（短会话，用完已吊销）、
`/` `/community` `/admin` `/login?mode=login` `/account` 全部 200

### 部署方式的一个变化（下次会用到）

`npm run deploy:vps`（`scripts/deploy-vps.mjs`）**这台机器上跑不了** —— 它用 ssh2 的
**密码认证**，要求 `VPS_HOST` 和 `VPS_PASSWORD`，而本机没有这两个环境变量。
本机是 **SSH 密钥直连**可用。

这次的做法是：写一个小生成器，**import `scripts/lib/deploy-backup-script.mjs` 里那几段 shell
片段**（`BACKUP_AND_EXTRACT` / `WAIT_FOR_HEALTH` / `ADMIN_SESSION_CHECK` / `PRUNE_FUNCTION`），
拼出和 `deploy-vps.mjs` 等价的远端脚本，再 `ssh root@... 'bash -s' < script`。
**import 而不是手抄，正是为了不和被测试覆盖的那份漂移** —— 那个模块的注释里就是这么要求的。
制品用 `ssh 'cat > /tmp/...'` 流式传（不用 scp）。
本轮没有改写 nginx vhost 与 systemd unit（两者都存在，`deploy-vps.mjs` 本来也只在缺失时才写），
**443 与机场节点共用，重写 vhost 会丢 TLS**，见 `docs/OPERATIONS_CLIENT_IP.md`。

待办：把这条路径固化成脚本（比如给 `deploy-vps.mjs` 加一个密钥认证分支），
否则下次还得临时拼一遍。

### 收尾：停用 sniproxy（按用户指示）

查 CSP 日志时发现 `sniproxy.service` 在无限重启失败，**10 天内失败 13176 次**，
每 5 秒一轮，报 `error parsing /etc/sniproxy.conf at 507`（配置是 2024-04-15 的，3.6KB）。

停之前确认过它确实是死的、且和 443 分流无关：

- `systemctl is-active` = `activating`（永远起不来），**无进程、无监听端口**
- 它配置里要占的是 `0.0.0.0:80` 与 `0.0.0.0:443`，而这两个端口**早就被 nginx 占着** ——
  就算配置能解析也绑不上
- SNI 分流是 nginx stream 做的（`docs/OPERATIONS_CLIENT_IP.md`），不是它

用户 2026-08-12 指示停用，已执行 `systemctl disable --now sniproxy`：
现在 `inactive` / `disabled`，`multi-user.target.wants` 里的软链已移除，之后无重启日志。
停用后复验：80/443 仍是 nginx（3 个监听项）、nginx 与 mrright-portfolio 均 `active`、
`/` 200、`/community` 200、`/api/health` 200。

**注意 `mcp__mrright-ops__ssh_exec` 会吞掉 `--` 开头的参数** —— 第一次
`systemctl disable --now sniproxy` 经 MCP 执行时，实际跑成了裸 `systemctl`（打印了单元列表），
服务纹丝不动；`journalctl -u xxx --since` 也中过同样的招（把别的单元的日志混进来）。
**要带长参数就用 Bash 里的 `ssh root@147.79.20.232 '...'` 直连**，别走 MCP。

### DMARC：记录内容与一个必须避开的坑

2026-08-12 用 VPS 的 `node:dns` 查到的现状：

| 名称 | 现状 |
| --- | --- |
| `mrright.blog` NS | `kayden.ns.cloudflare.com` / `lorna.ns.cloudflare.com`（DNS 在 Cloudflare） |
| `_dmarc.mrright.blog` | **不存在** |
| `send.mrright.blog` TXT | `v=spf1 include:amazonses.com ~all`（SPF 在） |
| `resend._domainkey.mrright.blog` | DKIM 公钥在（**在根域，不在 `send.` 子域**） |
| `mrright.blog` MX | **无** —— 这个域不收信 |
| `SMTP_FROM` 的域 | `@mrright.blog` |

因为发件域是 `mrright.blog`，DMARC 就查 `_dmarc.mrright.blog`。
对齐关系是够的：DKIM 的 `d=` 是根域（严格对齐也过），SPF 的信封域是 `send.mrright.blog`
（宽松对齐过，宽松是默认）。所以 `p=none` 完全安全。

**坑：`rua` 不能直接填 Gmail 地址。** RFC 7489 §7.1 规定，报告地址与 DMARC 记录不同域时，
接收方必须先查 `<你的域>._report._dmarc.<对方域>` 拿授权。实测：

```
mrright.blog._report._dmarc.gmail.com        => ENOTFOUND   ← Gmail 没开这个口子
mrright.blog._report._dmarc.dmarc.postmarkapp.com => "v=DMARC1;"  ← 通配符，已授权
```

也就是说 `rua=mailto:<你的 Gmail>` 写了，**Google/Microsoft/Yahoo 这些大厂根本不会把报告发过来**，
等于白写。

**用户 2026-08-12 选定方案 B：报告收在自己域内。** 即先用 Cloudflare Email Routing
（免费）把 `dmarc@mrright.blog` 转发到 Gmail，`rua` 填这个同域地址 —— 同域就不需要外部授权记录。

最终记录：`_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@mrright.blog`
（Name 只填 `_dmarc`，Cloudflare 会自动补上域名）。

启用 Email Routing 会给**根域**加 MX 和一条 SPF TXT。两个已核实的前提：

- 根域**当前无 MX**（`ENODATA`），不会冲突；
- 根域**当前无 TXT**，Cloudflare 加的 `v=spf1 include:_spf.mx.cloudflare.net ~all`
  **不会影响 Resend 发信** —— Resend 的信封域是 `send.mrright.blog`，SPF 查的是那条
  （`include:amazonses.com`），根域这条管的是「谁能以 @mrright.blog 作信封域发信」。
  而且 DMARC 这边本来就靠 DKIM 对齐（`d=` 就是根域）。

#### 已完成的最终状态（2026-08-12）

用户当天完成了全部四步，逐项复验结果：

**Cloudflare Email Routing（用户操作，截图确认）**

- 目标地址 `adieb623@gmail.com`：**已验证**
- 路由规则 `dmarc@mrright.blog` → Gmail：**活跃**
- catch-all「全收」：**保持禁用**（不然会收一堆垃圾）
- 自动下发的 DNS：MX `route1/2/3.mx.cloudflare.net`（优先级 42/33/32）、
  根域 SPF、Cloudflare 自己的 DKIM `cf2024-1._domainkey`

**DNS 复验（VPS 上用 `node:dns` 查）**

```
_dmarc.mrright.blog  =>  v=DMARC1; p=none; rua=mailto:dmarc@mrright.blog
标签解析：v=DMARC1 / p=none / rua=mailto:dmarc@mrright.blog
rua 域 = mrright.blog，与 DMARC 域同域 → 不需要外部授权记录（这正是选方案 B 的原因）
send.mrright.blog SPF、resend._domainkey 均未被改动
```

**踩到的第二个缓存坑**：刚加完时 `1.1.1.1` 已能查到，但 `8.8.8.8` / `9.9.9.9` 仍报
`ENOTFOUND`。原因是我**在记录添加之前查过这些解析器**，留下了否定缓存：
`mrright.blog` 的 SOA `minimum` 是 **1800 秒**，所以要等 30 分钟才会自己消失。
分辨方法是**直接问权威 NS**（`kayden.ns.cloudflare.com` → `162.159.44.74`），
权威上有记录就说明写对了，剩下的只是等缓存。

**发信实测**（两封，都用线上应用的真实 Resend 通道发出，`{"delivery":"email","sent":true}`）

1. 发给 `dmarc@mrright.blog` —— 验证「Resend 发信 → Cloudflare MX 收信 → 转发到 Gmail」整条链路
2. 加完 DMARC 后发给 `adieb623@gmail.com` —— 验证新增的根域 MX/SPF 没有破坏原有发信

**第一封实测信 Gmail 判定 DMARC = FAIL —— 不是配置错，是我自己造成的 DNS 否定缓存。**

用户贴的「显示原始邮件」显示：SPF **PASS**、DKIM **PASS（domain: mrright.blog）**、
DMARC **FAIL**。这个组合本身就自相矛盾 —— DKIM 的 `d=` 就是 From 域，
对齐关系成立，DMARC 没有理由失败。真正的线索在 header 里：
Google 的 `Authentication-Results` **压根没有 `dmarc=` 这一行**，
说明它当时**没找到 DMARC 记录**，而不是找到了判定不通过。

时间对得上：邮件 15:05 UTC 到达，而我在 **15:00 UTC** 用 `8.8.8.8`/`9.9.9.9`
查过 `_dmarc`（当时记录还没加完），把 NXDOMAIN 缓存了 **1800 秒**。
Google 收信时用的正是自家解析器，看到的还是「没有这条记录」。

**决定性证据**（15:14 UTC 复查，同一家的两台解析器结论相反）：

```
8.8.8.8  => ENOTFOUND        ← 正是我探过的那台，仍在缓存 NXDOMAIN
8.8.4.4  => v=DMARC1; ...    ← 同属 Google，没被我探过，正常
9.9.9.9  => v=DMARC1; ...    ← 缓存到期，自己恢复
1.1.1.1  => v=DMARC1; ...
```

处置：写了个脚本**轮询等 `8.8.8.8` 自己看到记录**（不靠猜时间），
15:15:34 缓存过期后立刻重发一封。

**教训（下次别再踩）：查一条「还没添加」的 DNS 记录时，不要去问公共解析器** ——
一次探测就会在那台解析器上种下最长 1800 秒的否定缓存，而它可能正是收信方要用的那台。
要确认记录是否写对，**直接问权威 NS**；要确认全球可见性，等否定缓存自然过期再查。

**最终结果：用户在 Gmail「显示原始邮件」里确认重发的那封 DMARC = PASS。**
至此 SPF / DKIM / DMARC 三行全部 PASS，邮件链路端到端验证完成，此项结案。

顺带记一句方法论：**`sent:true` 不算送达凭据** —— 这是第五轮定下的规矩，
而这次「Gmail 判 FAIL 但其实是我的探测污染了它的解析器缓存」是它的又一个例证：
真正的判据永远是收件方那一侧看到的东西，不是发送侧的返回值。

## 2026-08-12（第六轮）：应用备份改硬链接 + 自动保留策略

结论：部署脚本每次留下的 351M 全量备份改成了硬链接备份，并加上「保留最近 N 份」的自动裁剪。
根治的是那个反复出现的磁盘问题 —— 上一轮手工从 15 份清到 3 份，但机制没变，攒回去只是时间问题。
**已部署上线并验证通过**，实测一份备份 351M → **34M**，三次部署后磁盘 49% → **42%**。
过程中还发现并修掉了部署脚本里一个一直存在的健康检查竞态，
并顺带完成了被它卡住的 `ADMIN_ALLOW_STATIC_TOKEN=false` 收紧。

日期：2026-08-12。

commit：`24e069b`（备份改动）→ `4855438`（合并到 main）→ `615b961`（竞态修复）。
分支 `ops/deploy-backup-retention-20260812` 已推送，`--no-ff` 合并进 main 并推 GitHub。
未 force push、未 reset。

完成内容：

1. **应用备份改为 `cp -al` 硬链接**
   - 未被本次部署改动的文件只占一个目录项，不再逐字节重复。一份备份 351M 里有 252M 是
     `public/uploads` 的重复副本，这部分开销消失。
   - `cp -al` 失败时（异种文件系统、跨设备）自动回退到 `cp -a` 全量拷贝 ——
     **绝不允许因为省空间而让某次部署没有回滚点**。

2. **`data/` 单独做真实拷贝，不走硬链接**
   - 原因：`contactMessagesStore.js:16` 与 `downloadRequestsStore.js:17` 用 `appendFile`
     **原地追加**，同一个 inode，会把历史写进所有硬链接备份里。
   - 这两个 store 只在 `DATABASE_URL` 缺失时才加载（`server/index.js:108`），生产走 Postgres
     用不到；但 `data/` 只有 8KB（线上实测：2 个文件，最后修改停在 6 月 3 日，是迁移后的冻结遗留物），
     与其赌那个前提永远成立，不如直接真实拷贝。
   - `interactionsStore.js:35-36` 是 temp + `rename`，换 inode，本身安全。

3. **解包加 `tar --unlink-first`**
   - `package.json` / `package-lock.json` 不在被 `rm -rf` 的列表里，会被直接覆盖到备份仍链接着的路径上。
   - **实测确认：GNU tar 1.35 默认就是先 unlink**（live inode 会变），所以这不是在修现存 bug。
     加它是为了把行为钉死 —— 实测 `TAR_OPTIONS=--overwrite` 会翻转成原地截断并**确实写穿备份**，
     而带上 `--unlink-first` 后备份完好。
   - 值得一提：**VPS 上是 GNU tar 1.34，本机是 1.35**。正因为显式加了这个 flag，
     版本差异不构成风险 —— 这类「本机验证过就以为线上一样」的假设，正是应该用 flag 钉死的地方。
   - 顺带纠正一条我一开始写错的注释：原本写的是「tar 默认 `O_TRUNC` 会写穿」，与实测不符，已改。

4. **自动裁剪 `prune_app_backups`（`VPS_BACKUP_RETAIN`，默认 3，设 0 关闭）**
   - **只在部署健康检查通过之后执行**。远程脚本是 `set -euo pipefail`，部署中途失败会在裁剪前中止，
     所以失败的部署不损失任何回滚点。
   - **只匹配脚本自己写出的时间戳格式**（`.backup-` + 8 位日期 + `-` + 6 位时间）。
     手工命名的目录（如 `…​.backup-before-migration`）永远不是删除候选。
   - **env 备份不裁剪**：每份约 1KB，不是磁盘压力来源，而它是 env 损坏时唯一的退路。

5. **新增本地验证 `npm run test:deploy-backup`，并接入 CI**
   - 这段逻辑既做硬链接又做删除，且正确性取决于光看代码定不下来的文件系统行为。
     不验证就上线不可接受 —— 尤其这个项目上一轮刚踩过「文档里的备份步骤从来跑不通」。
   - 为此把这两段 shell 抽到 `scripts/lib/deploy-backup-script.mjs`，部署脚本和测试
     **导入同一个字符串**，所以不存在「测试的是实现的副本」这种漂移。
     部署脚本其余部分（env 校验、nginx、systemd）一行未动。

修改文件：

- `scripts/deploy-vps.mjs`（备份/解包/裁剪/健康检查；新增 `VPS_BACKUP_RETAIN`、`VPS_APP_ORIGIN`）
- 新增 `scripts/lib/deploy-backup-script.mjs`（三段可导入的 shell 片段）
- 新增 `scripts/verify-deploy-backup.mjs`（本地验证）
- `package.json`（新增 `test:deploy-backup`）
- `.github/workflows/web.yml`（checks job 增加一步）
- `docs/OPERATIONS_BACKUP.md`（新增「应用目录备份」整节 + 修正已知缺口的表述）
- `PROJECT_PROGRESS.md`

build / lint / 测试结果（部署前后各跑一次，全绿）：

- `npm run lint`：通过
- `npm run build`：通过；`dist/` 保持 untracked
- `npm run test:api`：37/37 通过
- `npm run test:api:db`：54/54 通过（一次性 PostgreSQL 集群已销毁）
- `npm run test:openapi`：通过（200 个 `$ref`、33 个 error code）
- `npm run test:deploy-backup`：通过（新增）
- production smoke（线上）：6 passed，1 skipped

**注入回归验证（证明新测试确实抓得住问题，不是白跑）**：逐个把 6 个 bug 注入回去，
全部被抓到并给出对应报错：

| 注入 | 结果 |
| --- | --- |
| `cp -al` 退回 `cp -a` | 抓到：uploads 未共享 inode + 增量成本等于全量 |
| 删掉 `--unlink-first` | 抓到：备份的 `package.json` 被写穿 |
| `data/` 也走硬链接 | 抓到：inode 相同 + 追加污染了备份 |
| 裁剪改成宽松通配 `.backup-*` | 抓到：删掉了手工命名的目录 |
| 健康检查退回不等待的裸 curl | 抓到：curl 只被调用 1 次，没有重试到第 3 次 |
| 健康检查超限后不退出 | 抓到：服务从未应答却判为通过 |

> 过程中我自己写错过两处，记一笔省得下次重犯：一是用 `du` 测单个备份目录来证明硬链接省空间
> —— **`du` 只在单次调用内对硬链接去重**，只测备份一个路径照样报全量，必须把 live 和备份
> 一起传给同一次 `du`；二是备份目录名只到秒，两个测试用例在同一秒内跑完会撞名，
> `cp -al` 于是把新备份塞进旧目录里（`app.backup-<stamp>/app/`），断言读到的是上一个用例的结果。

### 部署过程中发现并修掉的 bug：健康检查竞态（`615b961`）

**第一次部署失败了**，但失败的不是这轮的新代码，而是部署脚本里一个一直存在的竞态：
`systemctl restart` 一返回就立刻 `curl /api/health`，中间不等待。日志显示
`Started` 在 04:34:48、`listening on http://localhost:4173` 在 04:34:50 —— curl 撞进了那 2 秒窗口，
拿到 connection refused，`set -euo pipefail` 于是中止整个脚本。

**发布本身是好的，服务 1 秒后就健康了，部署却报失败。** 这次能撞上纯属运气；
第二次部署同样的脚本就 `Health check passed after 1 attempt(s)`，说明它一直是概率性的。

顺带确认了一件好事：中止发生在裁剪之前，**4 份备份一个没删** —— 「失败的部署不损失回滚点」
这个设计意图在真实故障里被验证了。

修复：健康检查改成轮询直到服务应答，上限 `HEALTH_ATTEMPTS`（默认 30 次）。
服务真起不来仍然让部署失败，并把 journal 尾部打到 stderr，让人看到原因而不是一个 curl 退出码。

另外给 curl 加了 `--noproxy "*"`：目标是 loopback，代理不该介入。
**这不是理论问题** —— 本机 WSL 有 `http_proxy`，复现时 curl 被劫持成 502，
如果哪天 VPS 的 root 环境里有 `http_proxy`，部署会以同样莫名其妙的方式失败。
端口也从 3 处硬编码收敛成一个变量（`VPS_APP_ORIGIN`）。

新增测试用**打桩 curl**而不是真 socket：要证明的是循环的契约（重试、报告尝试次数、
到上限后非零退出），打桩比跟真实监听器赛跑更直接，而且从 39 秒降到 5 秒。
（本机沙箱会阻断子进程访问 localhost，真 socket 方案在这里根本跑不了。）
注入「退回裸 curl」和「超限不退出」两个 bug，都被抓住。

### 收紧 `ADMIN_ALLOW_STATIC_TOKEN`（`48d3f69`）

`docs/OPERATIONS_ADMIN_AUTH.md` 的收紧路径第 2 步写着「确认没有脚本还在直接用静态 token 调 API
之后再设 false」，紧接着又写「注意：部署脚本会用静态 token 调 `/api/admin/summary`」。
**卡了几轮的就是这一条，而且答案一直写在文档里。** 排查确认只有两个调用方：

- `scripts/deploy-vps.mjs:252` 与 `scripts/package-vps-release.mjs:78`（部署后验证）
- `tests/e2e/admin-visitors.spec.js`（8 处）

三处都改成先 `POST /api/admin/session` 换会话再调 API。该端点**刻意不走 `requireAdmin`**
（`server/index.js:2840`），所以收紧后它仍然接受静态 token —— 这正是设计意图。

**部署脚本用完必定吊销会话，包括检查失败的路径。** 失败路径才是遗留 12 小时管理员会话
最容易被忽视的地方。E2E 套件不吊销（operator-run、偶发，且 `afterAll` 钩子拿不到 test 作用域的
`request` fixture），会话自行过期，理由写在该文件注释里。

会话 token 用 `node` 解析而不是 `grep`：它是 JSON 信封里的 base64url，
手写匹配器正是「响应被截断了检查还通过」的经典来源。

顺带修掉一个隐患：**`package-vps-release.mjs` 是部署步骤的第二份拷贝，而且已经漂移了** ——
还是 `cp -a` 全量备份、没有裁剪、`sleep 3` 代替等待服务、静态令牌。现在它 emit 的是同一批
共享片段，从根上不会再漂。

线上实测（2026-08-12 05:12 UTC 切换后）：

| 调用 | 结果 |
| --- | --- |
| 静态 token → `/api/admin/summary`、`/visitors`、`/comments` | 全部 **401 `ADMIN_AUTH_REQUIRED`** |
| 静态 token → `POST /api/admin/session` | **201** |
| 会话 → 上述三个端点 | 全部 200 |
| 吊销后复用该会话 | 401 |
| 伪造 token → 换会话 | 401 |
| **部署脚本那段 admin 检查（收紧后重跑）** | **通过** —— 证明将来的部署不会被这次收紧打断 |

env 变更：**追加**一行 `ADMIN_ALLOW_STATIC_TOKEN=false`，追加前已备份到
`/etc/mrright-portfolio.env.backup-20260812-051212`，文件权限仍为 `600 root`，未覆盖。
回退：删掉该行或改成 `true`，然后 `systemctl restart mrright-portfolio`。

### 部署结果

是否部署 VPS：**是**，本轮共 3 次部署：

| 时刻 (UTC) | commit | 结果 |
| --- | --- | --- |
| 04:34 | `4855438` | **失败**（健康检查竞态；发布本身是好的，裁剪未执行，4 份备份一个没删） |
| 04:49 | `615b961` | 成功，裁剪掉最旧 2 份，磁盘 49% → 45% |
| 05:11 | `48d3f69` | 成功，裁剪掉最后一份全量备份，磁盘 45% → **42%（8.2G）** |

上线 commit：`48d3f69`。

部署方式：与前几轮相同 —— `scripts/deploy-vps.mjs` 需要 `VPS_PASSWORD`，本机只有 SSH 密钥。
但这次**没有手工复述远程步骤**：用一个假的 `ssh2` 模块把 `deploy-vps.mjs` 会发送的原始远程脚本
原样捕获下来（脚本本身一字未改），再喂给远端 bash。所以跑的确实是新代码本身。

> 传输踩坑更新：上一轮记的「21MB scp 传不完」这次**没有复现**，因为改用了
> `cat file | ssh 'cat > /tmp/...'` 流式传输，两次部署都是**第 1 次就成功且 SHA-256 一致**。
> 建议以后就用这个方式，不要再跟 scp 的超时较劲。

VPS 备份路径：

- 数据库（部署前手工）：`/var/backups/mrright-portfolio/mrright-portfolio-20260812-043143.dump`
  （41.9 KB，17 个 table data 项，SHA-256 旁文件已写入）
- 应用目录：`/opt/mrright-portfolio.backup-20260812-044929`（本次回滚点，硬链接）
- env：`/etc/mrright-portfolio.env.backup-20260812-044929`
- 备份 timer 确认 active，当天 03:40 自动跑过一次

**新逻辑在真实生产上的实测数据（本轮最该记住的一组数字）：**

| 项 | 结果 |
| --- | --- |
| 硬链接是否生效 | `public/uploads` 各目录 `links=2` ✓ |
| 新备份增量成本 | **34116 KB ≈ 33M**（live 351M）—— 部署前预测 32M，命中 |
| `data/` 是否真实拷贝 | inode 132318 vs 25823，不同 ✓ |
| 回滚点内容 | 备份里的 `package.json` 是旧版本 ✓ |
| 裁剪 | 删掉最旧 2 份，保留最新 3 份 ✓ |
| 磁盘 | **49%（7.2G）→ 45%（7.9G）**，释放约 700MB |
| 备份总占用 | 1053M（3×351M）→ **427M**（359M 旧全量 + 2×34M 硬链接） |

**收工时的最终状态**：三份备份**全部**是硬链接（34116 / 34144 / 34152 KB），
最后一份 351M 全量拷贝已在第 3 次部署时被自然裁剪掉。
备份总占用 1053M → **100M**，磁盘 49%（7.2G）→ **42%（8.2G）**。

验证接口状态（线上 HTTPS，全部通过）：

- 第 9 条必需项：`/api/health` 200、`/api/admin/summary` 200、`/` 200、`/community` 200、
  `/admin` 200、`/login?mode=login` 200、`/account` 200
- 运维端点：`/robots.txt` 200、`/sitemap.xml` 200、`/api/v1/health` 200 且仍是严格信封
- **数据库完全未变**：`visitor_users=1`、`community_posts=1`、`community_uploads=0`、
  `download_requests=0`、`project_comments=2`、`project_likes=2`、`visitor_sessions=6`、
  17 张表 —— 与部署前逐项一致（本轮无 schema 变更，无迁移）
- production smoke（Playwright）：**6 passed，1 skipped**（需 `E2E_VISITOR_*` 的用例按设计跳过）
- 部署后日志窗口内 internal error 计数 **0**
- 启动自检：仅剩 `TRUST_PROXY_HOPS` 一条（在本机拓扑下无意义，见 `docs/OPERATIONS_CLIENT_IP.md`）

待办事项：

- 备份异地副本仍未配置 —— 现在更值得强调：应用备份是硬链接，**和 live 共享 inode 且同盘**。
  防得住误删（`unlink` 只减链接数），但磁盘损坏、文件系统损坏、原地写坏会让 live 和全部备份
  一起完蛋。这是备份体系最后一个结构性缺口，需要你提供 rclone 目标与凭据。
- ~~`ADMIN_ALLOW_STATIC_TOKEN` 收紧~~ —— **本轮已完成并上线**。
- **CSP 切 blocking 的答案已经查到，但没做**：线上收到的两条报告分别是
  `script-src <- wasm-eval` 和 `connect-src <- blob`，对应 `server/index.js:169-177` 里
  `scriptSrc` 未设（回落到 `defaultSrc 'self'`）且 `connectSrc: ['self']` 缺 `blob:`。
  改法应是加 `scriptSrc: ["'self'", "'wasm-unsafe-eval'"]` 与 `connectSrc: ["'self'", 'blob:']`，
  然后把 `reportOnly` 去掉。**没做的原因**：切 blocking 前必须用真浏览器过一遍全站，
  而当前会话的沙箱阻断子进程访问 localhost，本地 Playwright 跑不起来 ——
  漏一条指令就是线上白屏，不能靠推理上线。下轮 MCP 恢复后用 playwright 过一遍再切。
- **DMARC 仍未添加**（需要你在 Cloudflare 操作，我没有 DNS 权限）。已用 VPS 上的 `node:dns` 复查：
  `_dmarc.mrright.blog` 无记录；`send.mrright.blog` 的 SPF 与 `resend._domainkey` 的 DKIM 都在。
  要加的记录：`_dmarc.mrright.blog` TXT `v=DMARC1; p=none; rua=mailto:<你的邮箱>`。先用 `p=none` 只观察。
- `/etc/nginx/proxy.conf` 遗留文件待确认 —— **本轮刻意没碰**：它占用 443，而 443 是
  网站与机场节点按 SNI 分流共用的，动它有打挂机场节点的风险。见 `docs/OPERATIONS_CLIENT_IP.md`。
  **（2026-08-12 第七轮更正：「它占用 443」是错的，`nginx -T` 证明它从未被加载；
  谨慎本身没错，但依据是错的。已清理，见顶部。）**
- 注册验证码邮件仍未单独实测（走的是同一套 `emailDelivery.js`，理论上已可发）。
- `.gitattributes` 漏了 `*.mjs`，所以 `scripts/deploy-vps.mjs` 在 git 里是 CRLF，
  `git diff --check` 对它的新增行一律报 trailing whitespace。补 `*.mjs text eol=lf` 会产生
  全文件重新规范化的 diff，建议单独做一个规范化提交，不要混在功能改动里。

## 2026-08-11（第五轮）：接入 Resend，SMTP 首次配置完成

结论：`mrright.blog` 首次接入邮件服务（Resend），**端到端验证通过**。启动自检的 SMTP 告警消失，
密码重置邮件实测**直达 Gmail 收件匣、未落垃圾箱**。至此「忘记密码」这条链路第一次真正可用 ——
在此之前接口一直返回「已受理」但用户永远收不到信。

日期：2026-08-11。

诊断前提（起因是用户说「忘记了 SMTP 凭证」，实际结论相反，下次不用重查）：

- **这个域名从来没有接过任何邮件服务**，所以不存在「找回旧凭证」，是首次配置。
  证据：查 `mrright.blog` 的 MX 无、TXT(SPF) 无、DMARC 无、10 个常见 DKIM selector 全无。
  顺带一提，任何服务商的 SMTP 密码都只在创建时显示一次，本来也只能重置、不能找回。
- **本机 `dig` 未安装**，直接跑 `dig` 会得到空输出，**极易被误判成「没有记录」**。
  VPS 上用 `node:dns` 查是可靠的 —— 第一次查就是踩了这个坑，结论对但证据无效，重查过。
- **VPS 出站 25 / 465 / 587 全部可连通**，机房没封 SMTP 端口，服务商可自由选。
- **DNS 托管在 Cloudflare**（`lorna/kayden.ns.cloudflare.com`），`mrright.blog` 的 A 记录
  直指 `147.79.20.232`，即灰云。SPF/DKIM/DMARC 都是 TXT 记录，**不涉及橙云开关，
  加它们不会影响机场节点**（与 `docs/OPERATIONS_CLIENT_IP.md` 的约束不冲突）。

代码侧需要的键（`server/emailDelivery.js` 是手写 SMTP 客户端，非 nodemailer）：
`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`，
可选 `SMTP_SECURE`（`true` 时走 465 隐式 TLS，否则 587 + STARTTLS）、`SMTP_STARTTLS`。
支持 AUTH LOGIN 与 AUTH PLAIN。

**两个坑：**

- **`SMTP_FROM` 必须是裸地址**（`noreply@mrright.blog`）。`escapeAddress()` 会剥掉 `<>`，
  写成 `名字 <addr>` 会让 `MAIL FROM` 变成畸形指令被服务器拒绝。
- **`SMTP_USER` 是字面量 `resend`**，不是邮箱、不是账号名。这是 Resend 的设计，填错必然认证失败。

完成内容：

1. **确认这个域名此前从未接过邮件服务**（见上方诊断前提），所以是首次配置而非凭证找回。
2. **域名验证记录已在 Cloudflare 生效**（用 VPS 上的 `node:dns` 实测）：
   - `send.mrright.blog` TXT `v=spf1 include:amazonses.com ~all`
   - `send.mrright.blog` MX `feedback-smtp.ap-northeast-1.amazonses.com`
   - `resend._domainkey.mrright.blog` TXT（DKIM 公钥）
   - **DMARC 仍未配置** —— 建议加 `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:<你的邮箱>`
3. **env 追加 5 个 SMTP 键**：`SMTP_HOST=smtp.resend.com`、`SMTP_PORT=587`、
   `SMTP_USER=resend`（字面量，不是邮箱）、`SMTP_PASS`（Resend API key）、
   `SMTP_FROM=noreply@mrright.blog`。**追加而非覆盖**，追加前已备份，文件权限仍为 `600 root`。
4. 重启服务，**启动自检从 2 条告警降为 1 条**（只剩 `TRUST_PROXY_HOPS`，在本机拓扑下无意义）。

修改文件：无（本轮不改代码，只改 VPS 上的 env 与本记录）

commit hash：本次提交（最终 hash 以 git log 为准）

build / lint 结果：**未运行 —— 本轮未修改任何业务代码**。线上仍是 `47d1cfc`。

是否部署 VPS：**否**（仅 env 变更 + 重启）。

VPS 备份路径：

- env：`/etc/mrright-portfolio.env.backup-20260811-153040`（追加 SMTP 键之前）

验证接口状态：

- 启动自检：SMTP 告警消失
- `POST /api/auth/forgot-password`（对已注册且已验证的地址）：
  - **注意 `delivery:"accepted"` 是写死的常量**，无论发信成败都返回它 —— 这是刻意设计，
    避免接口沦为「账号是否存在」的探测器。**不要拿它当发信成功的证据。**
  - 真正的证据是：`email_verified_at` 非空（说明没走静默跳过分支）、
    `password_reset_code_hash` 已写入且过期时间与响应一致（说明进入了发信路径）、
    且日志中**没有** `Password reset email delivery failed:`（说明 SMTP 握手/AUTH/DATA 全部成功）。
  - **最终收件确认：用户已回报收到（2026-08-11 23:34 UTC+8 / 15:34 UTC）。**
    邮件落在 **Gmail 收件匣，不是垃圾箱**；发件人显示 `noreply@mrright.blog`；
    主题 `mrright.blog password reset code`；正文含 6 位验证码与过期时间，
    并带「Continue on mrright.blog」链接。至此端到端闭环成立。
  - 值得记一笔：**只有 SPF + DKIM、尚未加 DMARC 的情况下就直达收件匣**，
    说明 Resend 的域名验证配置是干净的。
- 无法从服务端核对 Resend 投递日志：该 API key 是只写的，读操作返回
  `restricted to only send emails`。权限收紧是好事，但意味着投递状态只能到 Resend 后台看。
  （后台列表把这把 key 显示为 Full access，与 API 实际行为不符，建议下次顺手核对一眼。）

待办事项：

- DMARC 记录仍未添加（可选加固，当前不加也能进收件匣）：
  `_dmarc.mrright.blog` TXT `v=DMARC1; p=none; rua=mailto:<你的邮箱>`。先用 `p=none` 只观察。
- 注册验证码邮件走的是同一套 `emailDelivery.js`，**理论上现在也能发了，但本轮未单独实测**。
- 备份异地副本仍未配置（备份体系最后一个结构性缺口）。
- CSP 仍是 report-only；`ADMIN_ALLOW_STATIC_TOKEN` 仍未收紧；`/etc/nginx/proxy.conf` 遗留文件待确认。
- 应用备份的自动保留策略仍未做。

## 2026-08-11（第四轮）：清理应用备份 + 第一次真正跑通恢复演练

结论：按用户明确指示清理了积压的应用目录备份（磁盘 78% → 49%），并完成路线图上排第一的
**恢复演练**。演练本身通过了，但过程中发现 `docs/OPERATIONS_BACKUP.md` 里写的演练步骤
**从来就跑不通** —— 这正是「没演练过的备份等于没备份」的实例。文档已修正。

日期：2026-08-11。

完成内容：

1. **清理 `/opt` 应用备份（用户明确授权，覆盖 CLAUDE.md 第 3 条）**
   - 删除前先做了安全检查：逐个比对 12 份待删备份里的 `public/uploads` 与 `data`，
     确认**没有任何一个文件是 live 目录缺失的**（live: uploads 31 个文件 252M、data 2 个文件）。
     应用备份里的代码部分 git 都有，真正不可再生的只有上传文件，所以这一步是必须的。
   - 15 份 → 保留最近 3 份（`20260808-091326`、`20260811-115304`、`20260811-141721`），删除 12 份
   - 磁盘 `78%（剩 3.2G）` → **`49%（剩 7.2G）`**，释放约 4.2G
   - 删除后复查：服务 active、`/api/health` 200、uploads 31 个文件、data 2 个文件、
     数据库 dump 3 份、env 备份 8 份 —— **全部未被波及**
   - `/var/backups/mrright-portfolio`（数据库备份）**一份都没动**

2. **恢复演练（第一次真正执行）**
   - 目标归档：`mrright-portfolio-20260811-140623.dump`（本次部署前那一份）
   - `sha256sum -c` 通过 → `createdb mrright_restore_drill` → `pg_restore` 无错误
   - **表数量 17 = 生产 17**；行数 `visitor_users=1`、`community_posts=1`、`community_uploads=0`、
     `download_requests=0`、`project_comments=2`、`project_likes=2` —— 与生产逐项一致
   - 内容抽查为真实数据：最早评论 2026-06-03、1 个带邮箱的账号，不是空表
   - 演练库中 `project_comments` **没有 `status` 列** —— 正确，这份 dump 取于迁移之前，
     由此确认它是本次部署的**有效回滚点**

3. **修正 `docs/OPERATIONS_BACKUP.md` 中跑不通的演练步骤**
   - 原步骤让人 `cd /var/backups/mrright-portfolio` 后以 `postgres` 身份跑 `pg_restore` 相对路径。
     但该目录是 `0700 root`，`postgres` 既进不去也读不到，报错还是**误导性的**
     `could not open input file ... No such file or directory`（文件明明在，只是没权限）。
   - 已改为：先 `install -m 0600 -o postgres` 把 dump 暂存到 `/tmp`，恢复后 `shred -u` 销毁暂存副本
     （副本含真实用户数据，不能留、也不能用 0644）。
   - 同时补上「表数量也要和生产对齐」这一判定 —— 只看行数看不出缺表；并写明第 6 步
     `dropdb` 受 CLAUDE.md 第 11 条约束，需用户确认。

修改文件：

- `docs/OPERATIONS_BACKUP.md`
- `PROJECT_PROGRESS.md`

commit hash：本次提交（最终 hash 以 git log 为准）

build / lint 结果：**未运行 —— 本轮未修改任何业务代码**（只改文档）。线上运行的仍是 `47d1cfc`。

是否部署 VPS：**否**（本轮无代码变更，无需部署）。

VPS 备份路径（本轮保留下来的）：

- 数据库：`/var/backups/mrright-portfolio/` 共 3 份，最新 `mrright-portfolio-20260811-140623.dump`
- 应用目录：`/opt/mrright-portfolio.backup-20260811-141721`（本次部署的回滚点，已演练验证同期 dump 可还原）、
  `…-20260811-115304`、`…-20260808-091326`
- env：8 份，未动

验证接口状态：清理后 `/api/health` 200，服务 active。本轮未改代码，未重跑全量线上验证。

待办事项：

- **临时演练库 `mrright_restore_drill` 仍在 VPS 上**，等你确认后 `dropdb`（第 11 条禁止我自行 DROP）。
  它含真实用户数据副本，不宜久留。
- 应用备份的**自动保留策略**仍未做；一份备份 351M 中 252M 是 `public/uploads` 重复副本，
  值得考虑把上传目录移出应用目录或在备份时排除。
- SMTP 仍未配置（需要你的凭证）。
- 备份异地副本仍未配置 —— 演练证明了备份能还原，但它和数据库仍在同一块磁盘上，
  磁盘一坏两者一起没。这是现在备份体系里最后一个结构性缺口。

## 2026-08-11（第三轮）：把 47d1cfc 部署上线（签名 Cookie 身份 + 评论先审后发）

结论：上一轮写完但未部署的改动已全部上线，**线上代码与 main 的代码部分一致**。数据库迁移按预期
幂等执行，**部署前后所有表行数完全一致**。本轮未改任何业务代码，只做部署与验证，外加本条进度记录。

日期：2026-08-11（部署时刻 14:23 UTC）。

完成内容：

- 部署 `47d1cfc` 到 VPS，服务重启成功。
- 执行 `project_comments` 的幂等迁移（新增 `status` / `moderated_at` + 一个索引）。
- 按 `CLAUDE.md` 第 9 条逐项验证，并补充验证本轮新增的评论审核端点与签名 Cookie。

修改文件：

- `PROJECT_PROGRESS.md`（仅本条记录；本轮未改业务代码）

commit hash：

- 上线的代码：`47d1cfc`
- 本条记录的提交：本次提交（最终 hash 以 git log 为准）

build / lint / 测试结果（部署前本地全绿）：

- `npm run lint`：通过
- `npm run build`：通过
- `npm run test:api`：37/37 通过
- `npm run test:api:db`：54/54 通过
- `npm run test:openapi`：通过（33 个 error code）
- `git diff --check`：通过

是否部署 VPS：**是**（2026-08-11 14:23 UTC）。

VPS 备份路径（部署前全部先做好）：

- 数据库：`/var/backups/mrright-portfolio/mrright-portfolio-20260811-140623.dump`
  （41.4 KB，17 个 table data 项，SHA-256 旁文件已写入）
- 应用目录：`/opt/mrright-portfolio.backup-20260811-141721`
- env：`/etc/mrright-portfolio.env.backup-20260811-141721`
- 既有备份全部保留，未删除任何备份

部署方式：与上一轮相同 —— `scripts/deploy-vps.mjs` 需要 `VPS_PASSWORD`，本机只有 SSH 密钥，
因此按该脚本的同一套远程步骤用密钥手动执行。**未改写 nginx 配置，未改写 systemd unit**，
只替换 `dist`/`server`/`scripts`/`package.json`/`package-lock.json` 并 `npm ci --omit=dev`
（安装 106 个包）；`data`、`public/uploads`、env 与全部 backup 未动。

release 完整性：本地与 VPS 上 SHA-256 一致（`f8c23126…5fe2bc`）。

> 传输踩坑记录（下次会遇到）：21MB 的 release 用 `scp` 单次传不完，300 秒超时后在离终点约 4KB
> 处被中断；而且**中断产物不是本地文件的干净前缀**（前缀哈希对不上），所以不能靠续传字节拼接。
> VPS 上**没有装 rsync**。可行做法是重传并逐次校验 SHA-256（脚本重试 4 次，实际第 1 次即成功）。

数据库迁移结果：

- `project_comments` 迁移前 6 列（`id/project_slug/author/message/created_at/user_id`），
  迁移后新增 `status:text` 与 `moderated_at:timestamptz` —— 确认存在
- 新增索引 `project_comments_status_created_idx` —— 确认存在
- 存量 2 条评论全部为 `status=published`，与设计一致，线上已有评论未受影响
- **数据完全一致**：`visitor_users=1`、`community_posts=1`、`community_uploads=0`、
  `download_requests=0`、`project_comments=2`、`visitor_sessions=6` —— 部署前后完全相同
- 本轮无过期会话清理输出（上一轮清了 22 条），与 `visitor_sessions` 保持 6 相符

验证接口状态（线上 HTTPS，全部通过）：

- 必需项：`/api/health` 200、`/api/admin/summary` 200、`/` 200、`/community` 200、`/admin` 200、
  `/login?mode=login` 200、`/account` 200
- 本轮新端点：`GET /api/admin/comments?status=pending` 200（队列当前为空）、
  不带参数的全量视图 200（行为未变）
- `PATCH /api/admin/comments/:id` 错误码正确：不存在的 id 返回 `COMMENT_NOT_FOUND`，
  非法状态返回 `VALIDATION_ERROR`（两者均不改数据）
- 运维端点：`/robots.txt` 200、`/sitemap.xml` 200
- `/api/v1/health` 仍返回严格信封（仅 data/pagination/error）
- production smoke（Playwright）：**10 passed，4 skipped**（跳过的是需要 `E2E_VISITOR_*`
  与管理员令牌的可选用例，按测试设计跳过）
- 部署后日志窗口内 internal error 计数为 **0**

签名 Cookie 线上实测（唯一一次写入式验证，净变化为零）：

- 首次 `POST /api/projects/:slug/like` 返回
  `Set-Cookie: mrright-vid=…; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax` —— 与设计一致
- 带同一 Cookie 再请求一次，**不再重新签发** Cookie，说明签名校验通过并沿用
- 第二次请求故意传了**完全不同**的客户端 `visitorId`，结果仍然切换的是同一个赞
  （`liked:true,count:1` → `liked:false,count:0`）—— **确认客户端 visitorId 的值确实已被忽略**，
  身份来自服务端签发的 Cookie
- toggle 回到原值，`project_likes` 仅剩 6 月的 2 条历史数据（不同项目、旧 UUID 格式），本次测试零残留

启动自检线上输出：仍是 2 条告警（SMTP 未配置、`TRUST_PROXY_HOPS` 未设置）。
后者在本机拓扑下无意义 —— 443 由 nginx stream 按 SNI 分流，改跳数也拿不到真实 IP，
详见 `docs/OPERATIONS_CLIENT_IP.md`（该文档本轮已随代码上线）。

待办事项：

- **磁盘保留策略已升级为最紧迫项**：`/opt/mrright-portfolio.backup-*` 已 15 份约 5.2G，
  磁盘 78%（剩 3.2G），每次部署 +351M。
- SMTP 仍未配置，忘记密码/注册验证码邮件发不出去（接口返回「已受理」但用户收不到）。
- 备份异地副本仍未配置（备份与数据库同机）；恢复演练仍未在生产备份上跑过。
- CSP 仍是 report-only（线上已收到 `script-src`、`connect-src blob`、`wasm-eval` 若干报告，
  切 blocking 前需要先看这些报告是否属于自家资源）。
- `ADMIN_ALLOW_STATIC_TOKEN` 仍未收紧；`/etc/nginx/proxy.conf` 遗留文件仍待确认。

## 2026-08-11（第二轮）：接受 IP 不可得的现实，改用不依赖 IP 的补偿措施

结论：查明 443 端口由网站与机场节点（sui / sing-box）通过 nginx stream 的 SNI 分流共用，
四层裸 TCP 转发导致**所有 HTTPS 访客在应用侧都是 127.0.0.1**。经评估**决定不修基础设施**
（唯一的标准修法会打挂正在服务用户的机场节点），转而把任何依赖「区分匿名访客」的功能
改成不依赖 IP 的实现。本轮已完成本地开发与验证，**未部署**。

背景与决策全文见新增的 `docs/OPERATIONS_CLIENT_IP.md`。

完成内容：

1. **修正上一轮点赞防刷的连带缺陷**
   - 上一轮把点赞身份改成 `HMAC(IP + UA + slug)`，方向对，但在这台机器上 IP 恒为 127.0.0.1，
     结果退化成「按浏览器 UA 字符串去重」—— 同一款浏览器的所有匿名访客塌缩成一个点赞
   - 改为**服务端签发的签名 Cookie**（`mrright-vid`，HttpOnly / SameSite=Lax / 一年）：
     值为 `随机 id.HMAC 签名`，客户端无法伪造；完全不依赖 IP
   - 已知取舍：清 Cookie 可以再点一次。门槛远高于原先「改一个 localStorage 字符串」，
     且方向仍是少算而非虚高

2. **项目评论改为先审后发（补偿失效的 IP 限流）**
   - `project_comments` 新增 `status`（`published`/`pending`/`spam`）与 `moderated_at`，
     存量行默认 `published`，线上已有评论不受影响
   - 登录且**邮箱已验证**的访客直接发布；匿名访客进审核队列
   - 垃圾特征直接判 `spam`，不进人工队列：链接数 ≥ 3、短文本几乎全是链接、
     单字符长串重复、常见垃圾关键词、以及**同一项目下重复发送相同内容**
   - 按账号的滚动窗口限额（默认 10 条/小时），不使用 IP
   - 公开读取只返回 `published`；作者在个人中心能看到自己待审核的评论，不会以为丢了
   - 对垃圾判定**不告知具体原因**：告诉刷子哪条规则拦住了他等于免费调优建议，
     而误判在作者自己的页面里看得到

3. **管理端审核**
   - `GET /api/admin/comments?status=pending` 驱动审核队列（不带参数仍是原来的全量视图，行为不变）
   - 新增 `PATCH /api/admin/comments/:id`（`published`/`pending`/`spam`）

修改文件：`server/index.js`、`server/postgresStores.js`、`src/components/ProjectDetail.jsx`、
`src/lib/i18n.js`、`tests/api/contract.db.spec.js`；新增 `docs/OPERATIONS_CLIENT_IP.md`。

本轮验证结果：

- `npm run lint`、`npm run build`：通过
- `npm run test:api`：37/37 通过
- `npm run test:api:db`：**54/54 通过**（上一轮 48 个 + 本轮 6 个）
- `npm run test:openapi`：通过（33 个 error code，未新增）
- `git diff --check`：通过

新增测试覆盖：签名 Cookie 的签发/沿用/伪造替换、同一 Cookie 下更换 visitorId 只会来回切换同一个赞、
匿名评论进队列且不公开、已验证用户直接发布、链接堆砌与重复内容判为 spam 且永不显示、
管理员审核放行、非法状态与不存在评论的错误码。

数据库影响：`ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS status/moderated_at` +
一个索引。幂等新增，无 DROP/TRUNCATE/DELETE，存量数据不变。

待办：本轮**尚未部署**。部署前仍需按 `docs/OPERATIONS_BACKUP.md` 备份（备份 timer 已在线上运行）。

## 2026-08-11：第二阶段安全加固（备份、账号生命周期、管理员会话、上传与下载）

结论：完成一轮以「静默失效的安全控制」为主线的加固。这一轮修的不是崩溃，而是那些**系统照常运行、但某个安全属性其实什么都没做**的地方：数据库从来没有备份、忘记密码的用户永久失去账号、管理员令牌永久有效且明文存在浏览器里、点赞身份由客户端自己声明、上传只看文件名后缀。全部改动均在本地完成，**未部署、未读取或输出任何 token/password/secret、未触碰生产环境与生产数据库**。数据库 schema 有新增列与新增表，但只通过 `ensureSchema` 的 `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` 增量执行，未删除任何列、表或数据。

完成内容：

1. **数据库备份（此前完全没有）**
   - `scripts/backup-database.mjs`：`pg_dump --format=custom` + `pg_restore --list` 结构校验 + SHA-256 旁文件 + 可选保留策略
   - `scripts/systemd/mrright-backup.service` / `.timer`：每日 03:30，`Persistent=true` 补跑，复用主服务的 `EnvironmentFile`
   - `docs/OPERATIONS_BACKUP.md`：安装、异地副本方案、**恢复演练步骤**、灾难恢复流程、已知缺口（无 PITR）
   - 三条安全性质：连接串永不输出；清理必须显式开启且跳过无校验旁文件的 dump；只有归档可被 `pg_restore` 解析才算成功
   - 已用一次性集群完成端到端验证：成功路径、校验和、保留策略裁剪、截断归档被拒、**真实恢复演练（2 行数据成功还原）**

2. **账号维度限流（此前只有按 IP 限流）**
   - `visitor_users` 新增 `failed_login_count` / `locked_until` / `verification_attempts`
   - 连续失败 `LOGIN_LOCK_AFTER`（默认 8）次锁定 `LOGIN_LOCK_MINUTES`（默认 15）分钟，**锁定期间正确密码也拒绝**
   - 验证码失败达 `VERIFICATION_MAX_ATTEMPTS`（默认 6）次即作废该验证码；重发验证码会重置计数，避免账号被永久卡死
   - 不存在的邮箱永远返回和密码错误相同的 401，不会因为锁定状态泄露账号是否注册

3. **账号生命周期（忘记密码/改密码/改邮箱/注销/登出其他设备，此前全部缺失）**
   - 新增 `POST /api/auth/forgot-password`、`POST /api/auth/reset-password`
   - 新增 `PUT /api/account/password`、`POST /api/account/sessions/revoke-all`
   - 新增 `POST /api/account/email`、`POST /api/account/email/confirm`、`DELETE /api/account/email`
   - 新增 `DELETE /api/account`（需当前密码 + 输入 DELETE 确认）
   - 重置密码会作废该账号**全部**会话；修改密码保留当前设备、踢掉其他设备
   - 改邮箱的确认码只发往**新地址**，确认前旧地址仍可登录
   - 注销：删除上传文件、匿名化 `project_comments.author` 与 `download_requests` 的姓名邮箱、保留他人可见的帖子与评论（避免连带删除别人的回复）
   - 密码强度校验：拒绝常见弱口令、包含邮箱前缀或昵称的密码、单字符重复

4. **管理员短时会话取代永久静态令牌**
   - 新增 `admin_sessions` 表（只存 SHA-256 哈希，记录 IP / User-Agent / 最后使用时间）
   - 新增 `POST /api/admin/session`（用 ADMIN_TOKEN 换 12 小时会话）、`DELETE /api/admin/session`、`GET /api/admin/sessions`
   - `src/Admin.jsx` 换取会话后**丢弃**静态令牌，localStorage 里不再存永久密钥；登出会真正吊销
   - 静态令牌仍可直接调 API（`ADMIN_ALLOW_STATIC_TOKEN=true`），为部署脚本保留兼容；收紧路径写在 `docs/OPERATIONS_ADMIN_AUTH.md`

5. **点赞防刷：身份改为服务端派生**
   - 登录用户用账号 id；匿名用户用 `HMAC(VISITOR_ID_SECRET, IP|UA|slug)`
   - 客户端传的 `visitorId` 仍在请求 schema 中（v1 契约冻结），但**值已被完全忽略**，下个契约版本移除

6. **上传加固**
   - 魔数校验：jpg/png/gif/webp/glb/zip 校验文件头，gltf/obj 校验文本开头且不含 NUL，fbx 支持二进制与 ASCII 两种
   - 账号级配额：滚动 24 小时内 30 个文件 / 1GB，在 multer 落盘**之前**用 Content-Length 预判
   - 文件名加 4 字节随机后缀，消除同毫秒同名互相覆盖，也让存储路径不可从原文件名推测

7. **下载链路修复**
   - 新增一次性下载票据 `POST /api/projects/:slug/download-ticket`（2 分钟有效、单次使用、绑定项目）
   - 前端不再用 `fetch` → `Blob` 把整个压缩包读进内存（大包会让标签页 OOM），改为浏览器直接流式下载
   - `response.download` 带 `Content-Disposition`；新增 `download_events` 审计表记录谁在何时下载
   - 归档路径从 `process.cwd()` 改为 `rootDir`，与文件内其他路径一致

8. **下载审批通知（此前审批结果对用户不可见）**
   - `emailDelivery.js` 抽出通用 `sendMail`，新增密码重置、改邮箱、下载审批三类模板
   - 审批/拒绝后自动发邮件并记录 `notified_at`；邮件失败不会让已提交的审批变成 500

9. **/uploads 授权缓存与 CSP 报告**
   - 授权查询加 30 秒 TTL 缓存（上限 1000 条），消除每个静态资源一次数据库查询；审核状态变更与删除时显式失效
   - CSP 增加 `report-uri`，新增 `POST /api/csp-report` 收集端点（聚合计数，避免刷屏）

10. **运维可见性**
    - 新增 `/robots.txt` 与 `/sitemap.xml`（动态生成，**不列出公开主页以免枚举注册用户**）
    - 新增 `GET /api/admin/diagnostics` 回显解析到的客户端 IP，用于核对 trust proxy 跳数
    - 启动自检：缺少 DATABASE_URL / ADMIN_TOKEN / VISITOR_ID_SECRET / SMTP / CORS_ORIGIN / TRUST_PROXY_HOPS 时打印告警
    - 过期清理扩展到管理员会话与下载票据

11. **修复 dist/ 重新被跟踪的回归**
    - `8ec237d` 取消跟踪 dist/ 之后，`46f53ea` 又把 62 个文件加了回来，CI 的 dist 门禁在 main 上一直是失败的
    - 已重新 `git rm -r --cached dist`（**未删除磁盘文件**，只移出索引）

修改文件：

- 新增：`scripts/backup-database.mjs`、`scripts/systemd/mrright-backup.service`、`scripts/systemd/mrright-backup.timer`、`docs/OPERATIONS_BACKUP.md`、`docs/OPERATIONS_ADMIN_AUTH.md`
- 后端：`server/index.js`、`server/postgresStores.js`、`server/responses.js`、`server/emailDelivery.js`
- 前端：`src/App.jsx`、`src/Admin.jsx`、`src/lib/api.js`、`src/lib/i18n.js`、`src/pages/AuthPage.jsx`、`src/pages/AccountPage.jsx`
- 契约与文档：`docs/openapi/api-v1.yaml`、`docs/API_ERRORS.md`
- 测试：`tests/api/contract.db.spec.js`

新增 API error code（27 → 33）：`ACCOUNT_LOCKED`、`PASSWORD_INCORRECT`、`PASSWORD_RESET_INVALID`、`EMAIL_CHANGE_INVALID`、`UPLOAD_QUOTA_EXCEEDED`、`DOWNLOAD_TICKET_INVALID`

commit hash：`ca28780`（功能提交）→ `fe80a62`（合并到 main）。分支 `security/phase-2-hardening-20260811` 已推送，已 `--no-ff` 合并进 main 并推送 GitHub，未使用 force push、未 reset。

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过。
- `npm run test:api`：37/37 通过。
- `npm run test:api:db`：**48/48 通过**（原 26 个 + 新增 22 个安全回归测试）。
- `npm run test:openapi`：通过（200 个本地 `$ref`、33 个 API error code）。
- `git diff --check`：通过。
- 备份脚本一次性集群验证：成功路径 / 校验和 / 保留策略 / 截断归档被拒 / 真实恢复演练全部通过。
- 本地服务冒烟：`/api/health`、`/robots.txt`、`/sitemap.xml`、`/api/csp-report`（204）、`/`、`/community`、`/account`、`/login?mode=forgot`、`/login?mode=reset` 全部 200。
- 本地 Playwright 渲染检查：登录页「忘记密码」入口、忘记密码页、重置密码页三语（中/英/日）文案与表单字段全部正确，无 console 错误。

新增测试覆盖（22 个）：

- 登录锁定：耗尽预算后正确密码也被拒；成功登录清空计数；未知邮箱永不锁定也不泄露
- 验证码预算：耗尽后真实验证码失效；重发后可正常完成
- 密码重置：注册与未注册地址响应完全一致；重置后旧会话与旧密码均失效；错误验证码；弱密码拒绝
- 改密码：需当前密码；当前设备保留、其他设备被踢
- 改邮箱：需当前密码；确认前旧邮箱仍可登录；错误验证码；确认后新邮箱生效且旧邮箱失效
- 注销账号：需确认字符串 + 当前密码；注销后会话与登录均失效
- 管理员会话：静态令牌换会话、会话可用、吊销后立即失效、伪造令牌被拒
- 上传：伪造扩展名被拒、真实 PNG 通过
- 点赞：更换客户端 visitorId 无法重复点赞
- 下载票据：无审批被拒、单次使用、伪造票据被拒
- 运维端点：robots / sitemap（不含 `/u/`）/ CSP 报告 / 管理员诊断

是否部署 VPS：**是**（2026-08-11 11:53 UTC）。

VPS 备份路径：

- 数据库（本轮新增的第一份）：`/var/backups/mrright-portfolio/mrright-portfolio-20260811-110750.dump`
  - 结构校验通过（14 个 TABLE DATA 项），SHA-256 旁文件已写入
  - 备份时行数：visitor_users=1、community_posts=1、community_uploads=0、download_requests=0、project_comments=2、visitor_sessions=27
- 应用目录：`/opt/mrright-portfolio.backup-20260811-115304`
- env：`/etc/mrright-portfolio.env.backup-20260811-115304`
- 既有 backup 全部保留，未删除任何备份

部署方式：`scripts/deploy-vps.mjs` 需要 `VPS_PASSWORD` 密码认证，本次环境只有 SSH 密钥，因此按该脚本的同一套远程步骤用密钥手动执行。**未改写 nginx 配置，未改写 systemd unit**（与脚本默认的幂等行为一致），只替换 `dist`/`server`/`scripts`/`package.json`/`package-lock.json` 并重装生产依赖；`data`、`public/uploads`、env 与全部 backup 未动。

release 完整性：本地与 VPS 上 SHA-256 一致（`b810a989…c995e1`）。

env 变更：`/etc/mrright-portfolio.env` **追加**一行 `VISITOR_ID_SECRET`（`openssl rand -hex 32` 生成，值未输出到任何地方）。文件未被覆盖，追加前已备份。

数据库迁移结果：

- `visitor_users` 新增 11 列、`download_requests` 新增 2 列、新建 3 张表 —— 全部确认存在
- **数据完全一致**：visitor_users=1、community_posts=1、community_uploads=0、download_requests=0、project_comments=2 与备份时相同
- `visitor_sessions` 由 27 降为 5，是新增的过期会话清理按设计执行（日志：`Removed 22 expired visitor session(s)`），非数据丢失

验证接口状态（线上 HTTPS，全部通过）：

- 必需项：`/api/health` 200、`/api/admin/summary` 200、`/` 200、`/community` 200、`/admin` 200、`/login?mode=login` 200、`/account` 200
- 新增端点：`/robots.txt` 200、`/sitemap.xml` 200（6 条 URL，确认不含 `/u/`）、`/api/csp-report` 204
- 管理员会话：静态令牌换会话 → 用会话调 summary 200 → 吊销后再调 401，闭环成立
- `/api/v1/health` 返回严格信封（仅 data/pagination/error）——**确认 API v1 契约确实已上线**，2026-07-25 审查的第 3 项漂移问题就此关闭
- 新流程线上实测：忘记密码对未注册地址返回统一 200 且不泄露 devCode；错误重置码返回 `PASSWORD_RESET_INVALID`；弱密码被拒；未认证访问改密码/注销返回 `AUTH_REQUIRED`；无审批申请下载票据返回 `RESOURCE_FORBIDDEN`；伪造票据返回 `DOWNLOAD_TICKET_INVALID`
- production smoke（Playwright）：6 passed，1 skipped（未提供 `E2E_VISITOR_EMAIL`/`E2E_VISITOR_PASSWORD`，按测试设计跳过）
- 启动自检线上输出：仅剩 2 条告警（SMTP 未配置、TRUST_PROXY_HOPS 未设置），其余配置项均已就绪
- 部署后日志窗口未出现新的 API internal error

## 2026-08-11 部署时发现的线上问题（尚未修复，需人工决策）

**1. 真实客户端 IP 没有到达应用 —— 所有 IP 限流实际上是一个全局桶（高优先级）**

本轮新增的 `GET /api/admin/diagnostics` 第一次使用就抓到了这个问题。从**外部**发起的请求，应用侧解析结果是：

```
resolvedIp    127.0.0.1
forwardedFor  127.0.0.1
protocol      https
trustProxyHops 1
```

后果：

- `/api/auth/login`、`/api/auth/register` 等所有按 IP 的限流退化成全站共享一个桶。
  一个攻击者可以独占全部配额，同时把正常用户挤掉。
- `download_requests.ip`、`admin_sessions.ip` 记录的全是 `127.0.0.1`，审计轨迹没有价值。
- 本轮新增的账号维度限流**不受影响**（它按账号计数，不依赖 IP），这也正是当初把预算放在账号上的原因。

现场证据：

- `/etc/nginx/` 下**没有任何** `set_real_ip_from` / `real_ip_header` 配置，而 nginx 访问日志里出现过 Cloudflare 段的地址（`104.23.239.45`），说明 Cloudflare 确实在链路中。
- 站点配置只有 `listen 80`，`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`。
- 同机还跑着 `nps`（内网穿透代理，端口 8025），部分请求在 nginx 侧的 `$remote_addr` 就是 `127.0.0.1`。

建议修复（**本轮没有执行**，因为改的是生产边缘配置，且 `set_real_ip_from` 写错会引入 IP 伪造漏洞，必须先确认拓扑）：

```nginx
# 仅在确认 Cloudflare 是唯一入口后加入
set_real_ip_from <Cloudflare IPv4/IPv6 段>;   # https://www.cloudflare.com/ips/
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

配好后用 `GET /api/admin/diagnostics` 复验：外部请求的 `resolvedIp` 应等于你的真实公网 IP。若确认链路是 Cloudflare → nginx 两跳，还需把 `TRUST_PROXY_HOPS` 设为 2。

**2. `/etc/nginx/proxy.conf` 是一个未配置的遗留文件**

它占用 443，`server_name` still 是占位符 `<write your domain>`，内容是把请求代理到 `registry-1.docker.io` 的 Docker 镜像加速模板。与本项目无关，建议确认是否还需要，以及它是否影响 mrright.blog 的 TLS 入口。

**（2026-08-12 第七轮更正并结案：「它占用 443」是错的 —— `nginx -T` 显示它从未被加载，
证书路径还是占位符，真被加载 `nginx -t` 就会失败。已移到
`/root/legacy-nginx-proxy.conf.20260812.bak`。）**

**3. 磁盘水位**

`/` 已用 73%（剩 3.9G），其中 `/opt/mrright-portfolio.backup-*` 合计 4.5G。按规则未删除任何备份，但需要你决定保留策略，否则再几次部署就会写满。数据库备份很小（37K），不是压力来源。

待办事项：

- **最高优先级**：修复真实客户端 IP 不可见的问题（见上「部署时发现的线上问题」第 1 条）。在修好之前，所有按 IP 的限流等同于失效。
- **SMTP 尚未配置**，所以忘记密码邮件目前发不出去：接口返回「已受理」但用户收不到验证码。密码重置要真正可用必须先配 `SMTP_HOST` 等键。注册验证码一直是同样状态。
- 安装备份 timer（`docs/OPERATIONS_BACKUP.md` 的安装步骤，release 里已包含脚本与 unit 文件）并做第一次恢复演练，把结果记进本文件。本轮的手动备份只是部署前的一次性保险。
- 决定 `/opt/mrright-portfolio.backup-*` 的保留策略（现已占 4.5G，磁盘 73%）。
- 确认 `/etc/nginx/proxy.conf` 这个 Docker 镜像加速遗留配置是否还需要。
- 配置备份异地副本（rclone 目标），当前备份仍与数据库同机。
- 观察 CSP 报告若干天后，把 `contentSecurityPolicy` 从 report-only 切成 blocking。
- 确认无脚本依赖静态管理员令牌后，设置 `ADMIN_ALLOW_STATIC_TOKEN=false`。
- 仍未做：管理员账号体系 + TOTP、匿名项目评论的审核队列与反垃圾、react-router、拆分 `Admin.jsx`（2400+ 行）与 `postgresStores.js`（3000+ 行）、前端单元测试、SSR/预渲染 SEO。

## 2026-08-08：第一阶段基础设施改进（CI、部署安全、数据清理、SQL 安全）

结论：完成第一阶段 4 项基础设施改进，全部通过 lint/build/test:api/test:api:db/test:openapi 验证。这一轮修复的是结构性问题：Web/API 完全没有 CI、部署脚本每次覆盖 nginx 配置会丢失 TLS 设置、visitor_sessions 只增不减、公开接口 SQL 查询仍在选取 email 列（虽然 mapper 会丢弃）、以及 `.map(toX)` 把数组索引当 options 传入的脆弱性。本轮**未部署、未改数据库 schema、未读取或输出任何 token/password/secret、未触碰生产环境**。

完成内容：

1. **CI for Web and API** (`.github/workflows/web.yml`)
   - checks job: lint + build + API contract (37 tests, no DB) + OpenAPI validation (200 $ref, 27 error codes) + gate that fails if dist/ reappears in git
   - api-db-contract job: Postgres 16 service + DB contract suite (23 tests including new regression tests)
   - E2E tests (production-smoke, admin-visitors) stay operator-run since they default to the live site

2. **Untrack dist/ from version control**
   - Removed 79 files (4355 lines) that were committed before .gitignore
   - `npm run build` generates dist/ locally; `npm run release:vps` archives it
   - Every build changes hashes → spurious `git restore` loops in PROJECT_PROGRESS.md
   - New CI gate enforces dist/ stays untracked

3. **Idempotent deployment**
   - `scripts/deploy-vps.mjs` now checks if nginx/systemd configs exist before writing
   - `VPS_REWRITE_NGINX=true` / `VPS_REWRITE_SERVICE=true` required to overwrite
   - Nginx was HTTP-only (listen 80); overwriting a certbot-modified config dropped HTTPS
   - `systemctl reload nginx || restart` keeps connections open when config unchanged
   - `js-yaml` now explicit devDependency (was transitive via @eslint/eslintrc)

4. **Session cleanup + SQL email leak prevention + .map fragility**
   - `authStore.deleteExpiredSessions()`: sweeps visitor_sessions WHERE expires_at <= now(), called every 6 hours (configurable via SESSION_SWEEP_INTERVAL_MS)
   - Removed `visitor_users.email` from 11 public-path SELECTs (interactionsStore, communityStore); adminStore queries retain it with explicit `includeEmail: true`
   - Wrapped 9 bare `.map(toComment|toCommunityUpload|toCommunityPost)` calls in explicit arrows so the numeric index isn't silently passed as options
   - New regression tests (4 tests, now 23 total in contract.db.spec.js):
     * Public endpoints never expose registration email, even to authenticated viewers reading their own rows
     * Public user summaries carry exactly `{id, displayName, accessLevel}`
     * Admin endpoints still include email (proves removal was scoped, not global)
     * Verified the tests catch the leak by injecting the 2026-07-25 bug back in

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过；dist/ 现已 untracked，构建产物不再进入 git。
- `npm run test:api`：37/37 通过。
- `npm run test:api:db`：23/23 通过（新增 4 个 PII containment 回归测试）。
- `npm run test:openapi`：通过（200 个本地 `$ref`、27 个 API error code）。
- `git diff --check`：通过。
- 回归验证：临时注入 2026-07-25 原始 bug（toUserSummary 无条件返回 email + 公开查询重新 SELECT email），测试套件报错 `/api/community/posts leaked contract-db-a@example.com`，证明新测试能抓到真实回归。

待办（后续阶段）：

- 第二阶段（1-2 周）：download 授权落地、CSP report-uri + blocking、project like 防刷
- 第三阶段（1 个月）：react-router、拆 Admin.jsx、getProject 单查询、i18n 拆分
- 第四阶段：Asset Model 实现（checksum、visibility、downloadPolicy）
- C++ SDK：建议冻结在当前状态，等 Asset Model 稳定后再继续

## 2026-08-08：社区页面增加返回首页入口

结论：社区页面顶部导航现在提供明确的“返回首页”链接，桌面和移动布局均可使用；补齐 zh/en/ja 文案。本轮已部署到 VPS，未改数据库、未读取或输出任何 token/password/secret。

完成内容：

- `src/pages/CommunityPage.jsx`：在社区页 logo 与语言切换之间加入返回 `/` 的 secondary action，使用箭头和本地化文案，保持现有社区帖子详情返回社区列表功能不变。
- `src/lib/i18n.js`：新增 `communityBackHome` 的中文、英文、日文文案。
- `tests/e2e/production-smoke.spec.js`：社区页面 smoke 增加返回首页链接可见性断言。

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过；构建生成的 tracked `dist/` 已恢复，未提交构建产物。
- 本地 Playwright 社区页面回归：通过（1/1），返回首页链接正常显示。
- `git diff --check`：通过。

部署结果：

- `npm run release:vps` 成功生成 release archive；上传前后 SHA-256 一致。
- 部署前确认 `DATABASE_URL`、`ADMIN_TOKEN` 均为 `[set]`，未输出值。
- 已创建 `/opt/mrright-portfolio.backup-20260808-091326` 和 `/etc/mrright-portfolio.env.backup-20260808-091326`；既有 backup 继续保留。
- 只替换 release 中的 `dist`、`server`、`scripts`、`package.json`、`package-lock.json`，重新安装生产依赖；保留 `data`、`public/uploads`、env 和所有 backup。
- `mrright-portfolio` 重启后保持 active，health 200，admin summary 200。
- 线上 `/community` 200，返回首页链接实际渲染并由 smoke 断言通过；线上 `/`、`/login?mode=login`、`/account`、`/admin`、`/u/not-exist-test-handle` 均通过页面验证。
- production smoke：6 passed，真实账号登录场景因未提供 `E2E_VISITOR_EMAIL` / `E2E_VISITOR_PASSWORD` 而按测试设计跳过。
- 认证接口仍返回 `Cache-Control: no-store`；未修改数据库 schema、数据、上传文件或生产环境变量。

## 2026-08-08：修复访客登录成功后立即掉线

结论：已修复线上“密码正确但无法登录/登录后回到登录页”的认证回归。根因是旧的匿名 `GET /api/auth/me` 响应被浏览器条件缓存，登录成功后再次请求该接口时服务端返回 `304 Not Modified`；`304` 没有 JSON body，前端把空响应当成无效会话并清除了刚保存的 token。认证接口现在统一禁止缓存、忽略条件请求验证头并始终返回完整 JSON，前端认证请求也显式使用 `cache: 'no-store'`。本轮已部署、未改数据库、未读取或输出任何 token/password/secret。

完成内容：

- `server/index.js`：为 `/api/auth/*` 增加 `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`、`Pragma: no-cache` 和 `Expires: 0`，阻止匿名会话响应被复用为 304。
- `server/index.js`：认证中间件移除 `If-None-Match` / `If-Modified-Since`，即使浏览器或代理发送条件请求，认证接口也不会返回空 body 的 304。
- `src/lib/api.js`：`/api/auth/me`、login、logout、register、verify-email、resend-verification` 请求显式使用 `cache: 'no-store'`。
- `scripts/run-api-db-tests.mjs`：仅为一次性 PostgreSQL 测试进程注入 `EXPOSE_DEV_VERIFICATION_CODE=true`，不改变生产默认，保证测试可以在无 SMTP 环境完成邮箱验证。
- `tests/api/contract.db.spec.js`：新增注册→邮箱验证→密码登录回归，确认密码登录签发可用 session；新增认证响应 `no-store` 和条件请求不会返回 304 的断言。

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过；构建生成的 tracked `dist/` 已恢复，未提交构建产物。
- `npm run test:api`：37/37 通过。
- `npm run test:api:db`：19/19 通过；覆盖真实 PostgreSQL 认证、密码登录、session 和 multipart 错误合约。
- `npm run test:openapi`：通过（200 个本地 `$ref`、27 个 API error code）。
- 本地 Playwright 页面回归：`/`、`/community`、`/login?mode=login`、`/account`、`/u/not-exist-test-handle` 通过（5/5）。无数据库环境下账户只读接口返回既定 `503 SERVICE_UNAVAILABLE`，与现有 API 合约一致。

线上核查：部署前日志确认登录 POST 曾返回 200，紧接着 `/api/auth/me` 返回 304，与本次根因完全吻合；本轮已完成 VPS 备份、替换、重启和接口/页面验证。后续条件请求回归也必须返回 200 完整 JSON。

部署结果：

- `npm run release:vps` 成功生成 release archive；上传前后 SHA-256 一致。
- 部署前确认 `DATABASE_URL`、`ADMIN_TOKEN` 均为 `[set]`，未输出值。
- 已创建 `/opt/mrright-portfolio.backup-20260808-085858` 和 `/etc/mrright-portfolio.env.backup-20260808-085858`；既有 backup 继续保留。
- 只替换 release 中的 `dist`、`server`、`scripts`、`package.json`、`package-lock.json`，重新安装生产依赖；保留 `data`、`public/uploads`、env 和所有 backup。
- `mrright-portfolio` 重启后保持 active。
- 线上验证通过：`/api/health` 200、`/api/admin/summary` 200、`/api/auth/me` 200、未认证 account 接口 401、`/admin`/`/community`/`/login?mode=login`/`/account`/`/u/not-exist-test-handle` 均 200；带 `If-None-Match` 的 `/api/auth/me` 也返回 200 完整 JSON，不再返回 304。
- production smoke：6 passed，真实账号登录场景因未提供 `E2E_VISITOR_EMAIL` / `E2E_VISITOR_PASSWORD` 而按测试设计跳过。
- 部署后最近日志窗口未发现新的 API internal error；未修改数据库 schema、数据、上传文件或生产环境变量。

## 2026-08-08：作品集 UI、可访问性与前端稳定性收尾

结论：本轮继续完善 Web 作品集的首屏体验、公开主页错误状态、对话框键盘交互与移动端可用性。重点把弹窗从“能显示”提升为键盘用户可安全操作的 dialog surface，并用稳定 API error code 驱动三语言文案。所有改动均在本地完成，**未部署、未改数据库、未读取或输出任何 token/password/secret、未触碰生产环境**。

完成内容：

- 修复 `useDialogAccessibility` 的 React Hook 兼容性：补齐 `useRef`、避免渲染阶段写 ref，保留最新 `onClose` 回调而不反复绑定全局监听器。
- 完善 dialog 行为：Escape 关闭、Tab/Shift+Tab focus trap、焦点意外跑出 dialog 时自动拉回、打开时聚焦 Close、关闭后恢复触发按钮焦点，并保存/恢复原始 `body` overflow；ProjectDetail 与 ModelPreview 均通过 `aria-labelledby` 关联可见标题。
- 验证嵌套弹窗：ProjectDetail 打开 ModelPreview 时，第一次 Escape 只关闭 3D Viewer，第二次才关闭详情；页面滚动锁定和焦点恢复均正确。
- 为公开主页的 `RESOURCE_FORBIDDEN` 增加 zh/en/ja 稳定错误码文案，避免把服务端错误消息直接暴露给用户；不存在用户页面显示明确的本地化“Profile Not Found”状态。
- 为作品卡片、社区资源、公开主页资源和头像补充 `loading="lazy"` / `decoding="async"`，减少非首屏图片对首屏网络与解码的抢占。
- 为 API 请求 timeout 增加旧浏览器能力回退；AccountMenu 的弹出项补齐 `role="menuitem"`，让已有 ARIA 菜单语义更完整。
- 统一社区发帖、资源上传、评论和访客账户中心的 API 失败提示：按稳定 error code 调用 `getApiErrorMessage`，只在未知错误时使用对应场景的安全 fallback，不再把 raw server message 直接渲染到普通访客界面。
- 继续保留并验证移动端 Hero CTA（View Work / Contact Me）、移动导航 `aria-expanded`/`aria-controls`、AccountMenu `aria-haspopup`/`aria-expanded`，以及 `prefers-reduced-motion` 下不加载 Hero Canvas。
- 保留首页基础 SEO metadata 与自定义 favicon；作品图片使用标题化 alt 文案；Three.js Viewer 保留错误边界和资源清理逻辑。

本轮验证结果：

- `npm run lint`：通过。
- `npm run build`：通过；build 生成的 tracked `dist/` 已恢复，未提交构建产物。
- `git diff --check`：通过。
- `npm run test:api`：37/37 通过。
- 最终 error-message 扫描：普通访客页面不再存在直接渲染 `error.message` 的路径；Admin 与模型错误边界仍保留管理员/开发诊断语义。
- 本地 Playwright 页面回归：`/`、`/community`、`/login?mode=login`、`/account`、`/u/not-exist-test-handle` 均正常渲染（5/5）；移动端 Hero CTA、移动菜单和 AccountMenu 状态均通过；桌面端 ProjectDetail/ModelPreview dialog 键盘交互通过，浏览器无前端错误。
- 本地完整 `production-smoke` 的只读账号接口在无 `DATABASE_URL` 的开发环境返回既有合约规定的 `503 SERVICE_UNAVAILABLE`，而 smoke 文件的线上断言期望 `401`；未为了迎合本地环境改坏既有 API 语义。API contract tests 已确认无数据库时账号读接口应为 503。

后续待办：

1. 延迟加载 Hero 3D Canvas，并为移动端提供静态 poster/质量档，进一步降低首屏 JS 与 GPU 成本。
2. 继续统一剩余前端错误状态的 error-code 本地化，避免界面直接显示 raw API message。
3. 在具备真实 PostgreSQL 的隔离环境中补充认证、上传、下载和移动端视觉回归；部署前仍需按规则备份并执行完整 VPS 验证。

## 2026-08-08：提交、推送与 VPS 部署

本轮已将上述 UI、可访问性、性能和错误处理改动提交并推送到 `fix/security-and-ui-2026-07-25`：

- commit：`ef5aa64 feat: polish portfolio ui and accessibility`
- GitHub 分支已推送，可从仓库页面创建 Pull Request。
- `npm run release:vps` 成功生成 release archive；部署前远端只检查了 `DATABASE_URL` 和 `ADMIN_TOKEN` 是否为 `[set]`，没有输出值。
- 部署前已创建 `/opt/mrright-portfolio` 时间戳备份和 `/etc/mrright-portfolio.env` 时间戳备份；`data`、`public/uploads` 和旧备份均保留。
- 只替换了 release 中的 `dist`、`server`、`scripts`、`package.json`、`package-lock.json`，并重新安装生产依赖；没有替换 env 文件或数据库内容。
- `mrright-portfolio` systemd 服务已重启并保持 active。
- 线上验证通过：`/api/health`、`/api/admin/summary`、`/admin`、`/community`、`/login?mode=login`、`/account`、`/u/not-exist-test-handle`、`/favicon.svg` 均返回预期状态；线上入口引用的新 hash JS 可下载。
- 未修改数据库 schema、数据、上传文件或生产环境变量；没有输出任何 secret/token/password。

后续待办：

1. 创建并审查 Pull Request，合并策略由项目维护者决定。
2. 继续做 Hero 3D 延迟加载、移动端 poster 和质量档优化。
3. 在真实 PostgreSQL 隔离环境补认证、上传、下载和视觉回归。

## 2026-07-16：C++ Qt AuthSessionService adapter 第一批

结论：本轮在 Qt UI adapter 层新增 `AuthSessionService`，实现现有 `AuthService` boundary 并复用 SDK `AuthSession`。adapter 不提供 production default backend，而是拥有显式注入的 `HttpClient` 与 `TokenStore`，从而保证 `AuthSession` 引用依赖的生命周期安全。测试仅使用 `MockHttpClient` + `MemoryTokenStore`，不创建 `CurlHttpClient`，不访问真实或本地 API。Qt shell 的 `main_qt.cpp` 未修改，默认实现继续是 `MockAuthService`。SDK core 继续 Qt-free。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未启用真实网络、未改 Web/API/OpenAPI contract、未修改 QML/Qt 视觉、未做 cache、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/app/ui/qt/AuthSessionService.hpp` / `.cpp`：
  - 实现 `AuthService` 的 login、logout、session state、safe user label、message 和 clear-message 操作。
  - 拥有 injected `std::shared_ptr<HttpClient>`、`std::unique_ptr<TokenStore>` 与基于它们创建的 `AuthSession`；不使用裸 owning pointer。
  - `QString` / UTF-8 `std::string` 转换只发生在 Qt adapter 内；Qt 类型未进入 SDK core。
  - `isLoggedIn()` 直接调用 `AuthSession::hasSession()`，不维护可能漂移的独立 bool；只缓存非敏感 user label 和 UI message。
  - login success 使用 SDK user 的 displayName、handle、email 或 trimmed submitted email 作为安全 label；existing stored session 无 profile payload 时使用明确的 generic `Signed in` fallback。
  - SDK error 集中使用 `ApiError.message` 映射为 UI message，不展示 raw code、response body、Authorization header 或 token。
  - logout success/error 都遵守既有 `AuthSession::logoutAndClearSession()` 契约：本地 session 被清除，strict error message 仍可显示。
- 新增 `cpp-app/tests/unit/qt_authsession_service_tests.cpp`：
  - 使用 `QCoreApplication`，不启动 GUI/window，不运行 QML automation。
  - 覆盖 empty/existing session、login success、strict error、failed replacement login、invalid JSON、non-envelope response、missing mock response、logout success/strict error、clearMessage 和 `AuthService` polymorphism。
  - 验证 strict `POST /api/v1/auth/login` / `POST /api/v1/auth/logout` request construction，不使用 legacy/admin path。
  - 验证 login body 精确只有 email/password；response token 只进入 `MemoryTokenStore`，logout 时只进入 Authorization header，不进入 URL/body/UI result/label/message。
- 更新 `cpp-app/tests/unit/qt_appcontroller_tests.cpp`：
  - 注入由 `MockHttpClient` + `MemoryTokenStore` 驱动的 `AuthSessionService`，确认 controller 继续只通过 `AuthService` polymorphism 工作。
  - 确认 adapter-specific type 不进入 QML property surface。
- 更新 `cpp-app/CMakeLists.txt` 和 `.github/workflows/cpp-app.yml`：
  - `MRRIGHT_ENABLE_QT_UI=OFF` 默认行为不变；OFF 时不找 Qt、不构建 adapter/tests。
  - ON 时 Qt shell 编译 adapter，但默认仍实例化 `MockAuthService`；新增并注册 `mrright_qt_authsession_service_tests`。
  - Qt CI job 运行全部 `mrright_qt_` tests，不启动 GUI、Node server 或真实 HTTP backend。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 记录 AuthSession adapter 第一批完成、existing-session label 限制和既有 SDK login/logout session 契约。
  - 后续保留 asynchronous auth API、local-only real login、platform SecureTokenStore injection、project list、cache 和 packaging。

本轮本地验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 tracked `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：configure/build 通过；CTest 6/6 无失败，其中 `mrright_cpp_secure_tokenstore_tests` 因本机 D-Bus session / desktop keyring 不可用而 skipped。
- temporary parser fallback CMake：configure/build 通过；CTest 5/5 无失败，其中 `mrright_cpp_secure_tokenstore_tests` 因本机 D-Bus session / desktop keyring 不可用而 skipped。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`）。按要求未安装新依赖、未伪造本地 Qt 成功；Qt shell、controller test 和新 adapter test 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. asynchronous auth service API
2. local-only real login integration
3. platform SecureTokenStore injection
4. project list UI
5. local cache strategy
6. packaging strategy spike

## 2026-07-16：C++ Qt UI AuthService integration boundary 第一批

结论：本轮在现有 optional Qt/QML mock auth flow 上新增 Qt UI 层 `AuthService` boundary。`AppController` 不再保存或实现完整 mock authentication 状态逻辑，而是默认创建 `MockAuthService`，并支持注入 test fake / future adapter；登录、登出、状态读取和 message clearing 均通过 service 完成。此批只建立下一批真实 `AuthSession` adapter 所需边界，未调用真实 `AuthSession::login`。SDK core 继续 Qt-free；Qt build/tests 继续仅在 `MRRIGHT_ENABLE_QT_UI=ON` 时启用。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未改 Web/API/OpenAPI contract 行为、未做 cache、未做 secure TokenStore 新实现、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/app/ui/qt/AuthService.hpp`：
  - 定义 Qt UI adapter boundary，login result 只包含 `success`、`userLabel`、`message`，不包含 token。
  - 暴露 login/logout、signed-in state、current user label、last message 和 clear-message 操作。
  - 接口只位于 `app/ui/qt`，允许使用 `QString`，不改变 `sdk/core` public API。
- 新增 `cpp-app/app/ui/qt/MockAuthService.hpp` / `.cpp`：
  - 保留现有 mock email trimming、空 email/password validation、signed-in/signed-out state 与 UI message 行为。
  - 成功 message 明确 mock authentication、no network request、no token persisted。
  - 不创建 network object、不调用 `AuthSession`、不访问 TokenStore、不读环境变量、不写文件、不保存或打印 password。
- 更新 `cpp-app/app/ui/qt/AppController.hpp` / `.cpp`：
  - 默认构造注入 `MockAuthService`；新增 `std::unique_ptr<AuthService>` constructor 供 tests/future adapter 使用。
  - 保留全部 QML-facing `Q_PROPERTY` 和 `Q_INVOKABLE` 名称。
  - properties 直接读取 service state；actions 委托给 service。
  - 新增细粒度 `isLoggedInChanged` / `currentUserLabelChanged` notify signals，保留 `authStateChanged` 供 `status` 使用，并避免值不变时重复 signal。
- 更新 `cpp-app/tests/unit/qt_appcontroller_tests.cpp`：
  - 直接覆盖 `MockAuthService` initial state、success、email/password validation、logout、clearMessage。
  - 通过 lightweight `FakeAuthService` 覆盖 dependency injection、login/logout/clearMessage delegation、success/failure property synchronization 与 notify signals。
  - fake 不记录 password 内容；测试确认 password/token/visitorToken 不作为 controller property 暴露。
  - 使用 `QCoreApplication`，不启动 GUI、不运行 QML automation、不访问网络或 TokenStore。
- 更新 `cpp-app/CMakeLists.txt`、`cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - Qt shell/test target 包含新 service files；默认 `MRRIGHT_ENABLE_QT_UI=OFF` 与非 Qt targets 不变。
  - 记录本批 boundary 完成和后续 real `AuthSession` adapter / local-only real login integration test 待办。
  - `.github/workflows/cpp-app.yml` 无需修改；现有 optional Qt/QML shell job 已 configure/build Qt shell/tests 并运行 `mrright_qt_appcontroller_tests`。

本轮本地验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 tracked `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（6/6 tests passed；`mrright_cpp_secure_tokenstore_tests` 因本机 D-Bus session / desktop keyring 不可用而 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（5/5 tests passed；`mrright_cpp_secure_tokenstore_tests` 因本机 D-Bus session / desktop keyring 不可用而 skipped）。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`），按要求未安装新依赖、未伪造本地 Qt 成功。Qt shell 和 `mrright_qt_appcontroller_tests` 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. real AuthSession adapter for Qt UI
2. local-only real login integration test
3. project list UI
4. local cache strategy
5. packaging strategy spike

## 2026-07-08：C++ Qt AppController mock auth unit tests

结论：本轮为 optional Qt/QML mock auth flow 新增 `AppController` 单元测试。测试只覆盖 UI controller 状态逻辑，不接真实 `AuthSession`，不创建 `CurlHttpClient`，不访问 API，不读取或写入 TokenStore，不启动 GUI，不做真实登录。SDK core 继续 Qt-free；Qt tests 仅在 `MRRIGHT_ENABLE_QT_UI=ON` 时构建。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未改 Web/API 行为、未做 SQLite cache、未做 secure TokenStore 新实现、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/tests/unit/qt_appcontroller_tests.cpp`：
  - 使用 `QCoreApplication` 和简单断言测试 `AppController`，不使用 GUI window，不做 QML 自动化。
  - 覆盖初始 signed-out state、mock login success、空 email / 空 password validation、logout、clearMessage。
  - 验证 `password` 不作为 Qt property 暴露，mock input text 不反射到 controller properties。
- 更新 `cpp-app/CMakeLists.txt`：
  - `MRRIGHT_ENABLE_QT_UI=OFF` 默认保持不变；OFF 时不找 Qt、不构建 Qt shell、不构建 Qt tests。
  - ON 时构建 `mrright_qt_shell` 和 `mrright_qt_appcontroller_tests`，并注册 CTest。
  - Qt test 只链接 Qt Core 和 SDK core，不把 Qt 引入 SDK core。
- 更新 `.github/workflows/cpp-app.yml`：
  - 保留 existing C++ checks。
  - optional Qt/QML shell job 现在 configure/build 后运行 `mrright_qt_appcontroller_tests`，不启动 GUI shell。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 记录 Qt mock auth controller 状态测试已加入。
  - 明确测试不访问 API、不保存 token、SDK core 仍 Qt-free。

本轮本地验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`），按要求未安装新 Qt 依赖、未伪造成功。Qt AppController test build/run 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. real AuthSession integration in Qt UI
2. project list UI
3. local cache strategy
4. packaging strategy spike

## 2026-07-08：C++ Qt/QML mock auth UI flow 第一批

结论：本轮在 optional Qt/QML shell 基础上新增最小 mock auth UI flow。`AppController` 只维护 UI 状态，`Main.qml` 新增 email/password mock login form；mock login 只根据输入更新 UI，不访问网络、不读取 token、不写入 TokenStore、不调用真实 `AuthSession` login。SDK core 继续 Qt-free。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问 production API、未访问 local API、未改 Web/API 行为、未做 SQLite cache、未做 secure TokenStore 新实现、未做 packaging、未提交构建产物**。

完成内容：

- 更新 `cpp-app/app/ui/qt/AppController.hpp` / `.cpp`：
  - 保留 `appName`、`sdkVersion`、`apiPrefix`。
  - 新增 `status`、`isLoggedIn`、`currentUserLabel`、`loginMessage` UI 状态。
  - 新增 mock-only `mockLogin(email, password)`、`logout()`、`clearMessage()`。
  - `mockLogin` 只检查输入并更新 UI 状态；不访问网络、不读取或写入 TokenStore、不保存 token、不调用 `AuthSession`。
  - password 不保存为成员、不暴露为 property、不打印。
- 更新 `cpp-app/app/ui/qt/Main.qml`：
  - 显示 app name、SDK version、`/api/v1 strict`、status。
  - 新增 email/password input、Mock login button、Logout button。
  - 登录前显示 `Not signed in`，mock login 后显示 `Signed in as <email>`，logout 后回到未登录状态。
  - 明确 UI 文案：mock auth only、no network request、no token persisted。
- CMake / CI：
  - `MRRIGHT_ENABLE_QT_UI=OFF` 默认保持不变。
  - Qt target 仍只在 option ON 时构建。
  - 未新增 Qt 到 SDK core，未新增 vcpkg 依赖。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 记录 Qt/QML mock auth flow 第一批完成。
  - 说明 production login 后续通过 `AuthSession` + secure TokenStore。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。
- 本地 Qt build：本机没有 Qt6 CMake package，按要求不安装新 Qt 依赖；Qt target 由 GitHub Actions optional Qt/QML shell job 验证。

后续待办保留：

1. real AuthSession integration in Qt UI
2. project list UI
3. local cache strategy
4. packaging strategy spike

## 2026-07-08：C++ Qt/QML desktop app shell 第一批

结论：本轮新增可选 C++ Qt/QML desktop app shell 第一批。默认 SDK build 仍不依赖 Qt；只有显式 `MRRIGHT_ENABLE_QT_UI=ON` 时才查找 Qt6 并构建 `mrright_qt_shell`。Qt/QML 代码仅位于 `cpp-app/app/ui/qt`，SDK core 保持 Qt-free。本批只做最小可启动窗口和架构边界，不做真实登录、项目列表、下载、本地缓存或 packaging。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 SQLite cache、未做 secure TokenStore 新实现、未做正式安装包、未提交构建产物**。

完成内容：

- 新增 `cpp-app/app/ui/qt/main_qt.cpp`：
  - 创建 `QGuiApplication` 和 `QQmlApplicationEngine`。
  - 通过 `loadFromModule("Mrright.QtShell", "Main")` 加载 QML。
  - 只注入只读 `AppController`，不创建网络 client，不读取 token，不调用 `AuthSession`。
- 新增 `cpp-app/app/ui/qt/Main.qml`：
  - 显示 app name、SDK version、API mode `/api/v1 strict`、status `UI shell only, no network`。
  - 不包含登录、项目列表、下载、缓存或 admin 功能。
- 新增 `cpp-app/app/ui/qt/AppController.hpp` / `.cpp`：
  - 暴露只读 `appName`、`sdkVersion`、`apiPrefix`、`status`。
  - 读取 `ApiClientConfig::apiPrefix` 作为 SDK 边界信息。
  - 不把 Qt 类型传入 SDK core public API。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_QT_UI=OFF` option。
  - 默认 OFF 时不调用 `find_package(Qt6)`，不构建 Qt target。
  - ON 时 `find_package(Qt6 COMPONENTS Core Gui Qml Quick REQUIRED)`，构建 `mrright_qt_shell` 并链接 `Qt6::Core`、`Qt6::Gui`、`Qt6::Qml`、`Qt6::Quick`。
- 更新 `.github/workflows/cpp-app.yml`：
  - 保留 existing C++ checks。
  - 新增独立 Ubuntu `optional Qt/QML shell` job，只安装 Qt dev 包并 configure/build `mrright_qt_shell`，不运行窗口、不上传构建产物、不读取 secrets、不访问 API。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明 Qt/QML shell opt-in、默认 build 不需要 Qt。
  - 说明 SDK core 与 Qt UI 分层边界。
  - 说明本批 Qt shell 不访问网络、不读取 token、不做缓存。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。
- 本地 Qt configure：未通过；本机没有 Qt6 CMake package（`Qt6Config.cmake` / `qt6-config.cmake`），按要求未安装新 Qt 依赖。Qt build 由独立 CI job 验证。
- PR #17 初次 CI 失败原因：Ubuntu runner 使用 Qt 6.4.2，`QQmlApplicationEngine::loadFromModule()` 不可用，`mrright_qt_shell` 在 `main_qt.cpp` 编译时报错 `class QQmlApplicationEngine has no member named loadFromModule`。修复为 Qt 6.4 兼容的 `engine.load(QUrl("qrc:/qt/qml/Mrright/QtShell/Main.qml"))`，并在 CMake 中固定 `Main.qml` resource alias。

后续待办保留：

1. real Qt login screen
2. project list UI
3. local cache strategy
4. packaging strategy spike

## 2026-07-08：C++ Linux Secret Service TokenStore backend

结论：本轮新增 C++ SDK Linux Secret Service TokenStore backend，并更新 `SecureTokenStore` 工厂：Windows 继续返回 Windows Credential Manager backend，macOS 继续返回 Keychain backend，Linux 在 `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON` 且已编译 libsecret backend 时返回 Secret Service backend。`MemoryTokenStore` 仍仅用于 tests/dev session。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/sdk/platform/LinuxSecretServiceTokenStore.hpp` / `LinuxSecretServiceTokenStore.cpp`：
  - 仅在 `__linux__` 且 `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE` 下编译。
  - 使用 libsecret / Secret Service API 保存 visitor token。
  - 默认 schema 为 `mrright.blog`，attribute 为 `account=visitor_token`。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken`、`hasVisitorToken`。
  - 不写普通文件、不读环境变量、不打印 token、不保存 admin token。
- 更新 `cpp-app/sdk/platform/SecureTokenStore.cpp`：
  - Windows 返回 `WindowsCredentialTokenStore`。
  - macOS 返回 `MacOSKeychainTokenStore`。
  - Linux 返回 `LinuxSecretServiceTokenStore` when compiled/enabled。
  - unsupported 平台仍返回 `nullptr`，不降级到 `MemoryTokenStore` 或明文文件。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON` option。
  - Linux 下通过 pkg-config 查找 system `libsecret-1` 并链接 `PkgConfig::LIBSECRET`。
  - Linux option 开启但缺少 pkg-config 或 libsecret dev package 时 CMake 清晰失败。
  - Windows/macOS backend 条件编译和系统库链接保持不变。
- 更新 `cpp-app/tests/unit/secure_tokenstore_tests.cpp`：
  - 保留 Windows Credential Manager guarded test。
  - 保留 macOS Keychain guarded test。
  - Linux enabled build 验证 factory support，并用 fake token 覆盖 save/load/overwrite/clear。
  - 运行时 D-Bus session 或 desktop keyring 不可用时返回 CTest skip code 77 并输出清晰说明。
- 更新 `.github/workflows/cpp-app.yml`：
  - Ubuntu C++ jobs 安装 `libsecret-1-dev`，确保 compile/link 覆盖 Linux Secret Service backend。
  - 保留 temporary parser fallback、default nlohmann/json with vcpkg、libcurl backend with vcpkg checks。
- 更新 `cpp-app/README.md` 和 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明 secure TokenStore 当前支持 Windows Credential Manager、macOS Keychain、Linux Secret Service。
  - 说明 Linux 运行时可能需要 desktop keyring / D-Bus session。
  - 明确 `MemoryTokenStore` 仅用于 tests/dev session，禁止明文 token 落盘，admin token 不进入 C++ SDK。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed, 1 skipped）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` skipped：本机 D-Bus session 或 desktop keyring 不可用；5/5 tests passed, 1 skipped）。

后续待办保留：

1. local cache strategy
2. Qt/QML prototype
3. packaging strategy spike

## 2026-07-07：C++ macOS Keychain TokenStore backend

结论：本轮新增 C++ SDK macOS Keychain TokenStore backend，并更新 `SecureTokenStore` 工厂：Windows 继续返回 Windows Credential Manager backend，macOS 返回 Keychain backend，Linux 继续 explicit unsupported（返回 `nullptr`）。`MemoryTokenStore` 仍仅用于 tests/dev session。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 Linux Secret Service、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/sdk/platform/MacOSKeychainTokenStore.hpp` / `MacOSKeychainTokenStore.cpp`：
  - 仅在 `__APPLE__` 下编译。
  - 使用 Security.framework Keychain Services 保存 visitor token。
  - 默认 service 为 `mrright.blog`，account 为 `visitor_token`。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken`、`hasVisitorToken`。
  - 不写普通文件、不读环境变量、不打印 token、不保存 admin token。
- 更新 `cpp-app/sdk/platform/SecureTokenStore.cpp`：
  - Windows 返回 `WindowsCredentialTokenStore`。
  - macOS 返回 `MacOSKeychainTokenStore`。
  - Linux/其他平台继续返回 `nullptr`。
  - `isPlatformSecureTokenStoreSupported()` 在 Windows/macOS 为 true，Linux/其他平台为 false。
- 更新 `cpp-app/CMakeLists.txt`：
  - Windows 后端仍只在 `WIN32` 编译并链接 `Advapi32`。
  - macOS 后端只在 `APPLE` 编译并链接 `Security.framework`。
  - Linux 构建不新增平台后端源、不引入 Qt 或新 vcpkg 依赖。
- 更新 `cpp-app/tests/unit/secure_tokenstore_tests.cpp`：
  - Linux 继续验证 secure factory unsupported/nullptr。
  - Windows guarded Credential Manager test 保持可用。
  - macOS guarded Keychain test 使用独立 test service/account 和 fake token 覆盖 save/load/overwrite/clear。
  - macOS CI 遇到 Keychain interaction/permission 类限制时返回 CTest skip code 77 并输出清晰 skip 信息，不伪造 secure backend 成功。
- 更新 `cpp-app/README.md`：
  - 说明 secure TokenStore 当前支持 Windows Credential Manager 与 macOS Keychain。
  - 说明 Linux Secret Service 后续实现。
  - 说明 `MemoryTokenStore` 仅用于 tests/dev session。
  - 明确禁止明文 token 落盘，admin token 不进入 C++ SDK。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 macOS Keychain TokenStore backend 完成。
  - Linux Secret Service 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；5/5 tests passed）。

后续待办保留：

1. Linux Secret Service TokenStore
2. local cache strategy
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ secure platform TokenStore backend entrypoint

结论：本轮新增 C++ SDK secure platform TokenStore 第一批入口。`SecureTokenStore` 工厂位于 `cpp-app/sdk/platform`，Windows 下返回 Windows Credential Manager backend，非 Windows 平台明确 unsupported（返回 `nullptr`），不会静默降级到 `MemoryTokenStore` 或明文文件。`MemoryTokenStore` 继续保留为 tests/dev session 实现。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 packaging、未提交构建产物**。

完成内容：

- 新增 `cpp-app/sdk/platform/SecureTokenStore.hpp` / `SecureTokenStore.cpp`：
  - `createPlatformSecureTokenStore()` 返回平台 secure `TokenStore`。
  - `isPlatformSecureTokenStoreSupported()` 暴露当前平台是否支持 secure backend。
  - Windows 返回 `WindowsCredentialTokenStore`；macOS/Linux 当前返回 `nullptr`，明确 unsupported。
- 新增 `cpp-app/sdk/platform/WindowsCredentialTokenStore.hpp` / `WindowsCredentialTokenStore.cpp`：
  - 仅在 `_WIN32` 下编译。
  - 使用 Windows Credential Manager API 保存 visitor token。
  - 默认 credential target 为 `mrright.blog.visitor_token`。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken`、`hasVisitorToken`。
  - 不写普通文件、不读环境变量、不打印 token、不保存 admin token。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `mrright_sdk_platform_tokenstore` 静态库。
  - Windows 下额外编译 `WindowsCredentialTokenStore.cpp` 并条件链接 `Advapi32`。
  - 新增 `mrright_cpp_secure_tokenstore_tests` CTest target。
- 新增 `cpp-app/tests/unit/secure_tokenstore_tests.cpp`：
  - 非 Windows 验证 secure factory 明确 unsupported，不伪装为 MemoryTokenStore。
  - Windows guarded test 使用独立 test credential target 覆盖 fake token save/load/overwrite/clear，结束时 clear。
  - 不访问网络、不依赖 admin token、不读取 `.env`、不打印 token。
- 更新 `cpp-app/README.md`：
  - 说明 Windows Credential Manager 是第一批 secure backend。
  - 说明 macOS Keychain / Linux Secret Service 后续实现。
  - 说明 `MemoryTokenStore` 仍仅用于 tests/dev session。
  - 明确禁止明文 token 落盘，admin token 不进入 C++ SDK。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 secure TokenStore backend 第一批完成。
  - macOS/Linux secure backend 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；6/6 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_secure_tokenstore_tests` passed；5/5 tests passed）。

后续待办保留：

1. macOS Keychain TokenStore
2. Linux Secret Service TokenStore
3. local cache strategy
4. Qt/QML prototype
5. packaging strategy spike

## 2026-07-07：C++ Auth session flow

结论：本轮新增 C++ SDK mock-driven Auth session flow。`AuthSession` 组合 `AuthClient`、`TokenStore`、`ApiClientConfig` 和 injected `HttpClient`；登录成功后可把 visitor token 保存到 `TokenStore`，后续 typed client 可通过 `configWithStoredToken()` 让 `ApiClient` 统一注入 `Authorization` header，logout/clear 后清理 `TokenStore`。全程只用 `MockHttpClient` 测试，不访问真实 API，不落盘、不打印 token、不调用 admin endpoints。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 secure platform TokenStore backend、未做 packaging**。

完成内容：

- 新增 `cpp-app/sdk/core/AuthSession.hpp`：
  - `loginAndStoreToken(email, password)`：调用 `AuthClient::login`，成功后保存 visitor token 到注入的 `TokenStore`。
  - `loadToken()` / `hasSession()` / `clearSession()`。
  - `logoutAndClearSession()`：使用 stored token 构造 bearer config，调用 `AuthClient::logout()`，然后清理 `TokenStore`。
  - `configWithStoredToken()`：从 `TokenStore` 读取 token 并写入 `ApiClientConfig::bearerToken`，让 `ApiClient` 统一注入 header。
- 更新 `cpp-app/sdk/core/ApiClientConfig.hpp`：
  - 新增 `withTokenStoreBearerToken(config, tokenStore)` helper。
- 更新 `cpp-app/sdk/core/AuthClient.hpp`：
  - 保留现有显式 token overload。
  - 新增 `logout()` / `me()` overload，用于通过 `ApiClientConfig.bearerToken` 走统一 Authorization header 注入。
- 新增 `cpp-app/tests/unit/auth_session_tests.cpp` 和 CTest target `mrright_cpp_auth_session_tests`：
  - login 成功后 token 保存到 `MemoryTokenStore`。
  - login 失败 strict envelope 不保存 token。
  - authenticated request 使用 stored token 构造 `Authorization` header。
  - token 不进入 request URL。
  - token 不进入 request body。
  - `clearSession()` 后 `hasSession()` false。
  - logout 成功后清理 token。
  - logout strict envelope error 时返回 `ApiResult` error 并清理 token。
  - 全部使用 `MockHttpClient`，不访问网络、不调用 admin endpoint。
- 更新 `cpp-app/README.md`：
  - 说明当前 Auth session flow 为 mock-driven SDK flow。
  - 说明 `MemoryTokenStore` 只用于 tests/dev session。
  - 说明 production secure TokenStore 仍后置。
  - 明确禁止明文 token 落盘。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 Auth session flow 第一批完成。
  - secure platform TokenStore implementation 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；5/5 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_auth_session_tests` passed；4/4 tests passed）。

后续待办保留：

1. platform secure TokenStore implementation
2. local cache strategy
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ TokenStore strategy and MemoryTokenStore

结论：本轮明确 C++ SDK TokenStore strategy，并新增 test/dev-session only 的 `MemoryTokenStore`。当前 `TokenStore` 抽象保持不破坏；`MemoryTokenStore` 只在内存中保存 visitor token，不落盘、不读环境变量、不打印 token、不访问网络。生产级 token 存储后置到平台安全凭证库。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未做 secure TokenStore backend、未做 packaging**。

完成内容：

- 新增 `docs/adr/ADR_CPP_TOKENSTORE_STRATEGY.md`：
  - 短期使用 `MemoryTokenStore` 仅支持 tests/dev session。
  - 产品级存储目标为 Windows Credential Manager、macOS Keychain、Linux Secret Service。
  - Qt/QML 阶段可评估 QtKeychain。
  - 明文 JSON/config token persistence 禁止。
  - encrypted local file fallback 需要单独 ADR。
  - admin token 永远不进入 C++ SDK。
- 新增 `cpp-app/sdk/core/MemoryTokenStore.hpp`：
  - header-only。
  - 实现 `TokenStore` interface。
  - 支持 `saveVisitorToken`、`loadVisitorToken`、`clearVisitorToken` 和 `hasVisitorToken`。
  - 不落盘、不读环境变量、不打印 token。
- 新增 `cpp-app/tests/unit/tokenstore_tests.cpp` 和 CTest target `mrright_cpp_tokenstore_tests`：
  - 初始无 token。
  - save 后可 load。
  - clear 后不可 load。
  - 覆盖保存会替换旧 token。
  - 不创建 token 相关文件。
  - 不依赖网络或平台凭证库。
- 更新 `cpp-app/README.md`：
  - 说明 MemoryTokenStore 只用于 tests/dev session。
  - 说明生产 token 存储必须使用平台安全凭证库。
  - 明确禁止明文落盘。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 TokenStore strategy 已决策。
  - secure platform implementation 后置。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；4/4 tests passed）。
- temporary parser fallback CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_tokenstore_tests` passed；3/3 tests passed）。

后续待办保留：

1. platform secure TokenStore implementation
2. local cache strategy
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ nlohmann/json parser backend set as default

结论：本轮将 C++ SDK parser 默认路径切换为 nlohmann/json，并保留 temporary `JsonValue` parser 作为显式 fallback。默认 CMake 路径现在需要通过 vcpkg manifest 找到 `nlohmann_json`；如需 no-dependency emergency fallback，可显式配置 `MRRIGHT_USE_TEMPORARY_JSON=ON`。JSON 解析仍集中在 `JsonValue.hpp` / `EnvelopeParser.hpp` 边界，typed clients 不直接解析 JSON。**未部署、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未做 Qt/QML、未做 SQLite cache、未做 secure TokenStore、未做 packaging、未改 Web/API 行为**。

完成内容：

- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_USE_TEMPORARY_JSON=OFF`。
  - 默认 OFF 时使用 nlohmann/json parser backend，执行 `find_package(nlohmann_json CONFIG REQUIRED)`。
  - fallback ON 时定义 `MRRIGHT_USE_TEMPORARY_JSON`，不查找 nlohmann/json，使用 temporary parser。
  - `mrright_cpp_nlohmann_json_tests` 现在随默认 parser path 构建。
- 更新 parser boundary：
  - `cpp-app/sdk/core/JsonValue.hpp` 默认 include `NlohmannJsonValue.hpp`。
  - `cpp-app/sdk/core/EnvelopeParser.hpp` 默认 include `NlohmannEnvelopeParser.hpp`。
  - `MRRIGHT_USE_TEMPORARY_JSON=ON` 时回到 temporary parser / envelope implementation。
- 更新 `.github/workflows/cpp-app.yml`：
  - Windows/macOS/Linux matrix 改为验证 temporary parser fallback no-dependency path。
  - Ubuntu nlohmann/vcpkg job 改为验证默认 nlohmann/json parser path。
  - 保留 Ubuntu libcurl/vcpkg regression job。
- 更新文档：
  - `cpp-app/README.md` 说明 nlohmann/json now default parser、temporary parser fallback、default vcpkg build 命令、fallback no-dependency build 命令。
  - `docs/CPP_APP_MIGRATION_PLAN.md` 标记 nlohmann/json default parser 完成，并保留后续待办。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 nlohmann/json CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；3/3 tests passed）。
- fallback/no-dependency CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_TEMPORARY_JSON=ON`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- libcurl/vcpkg regression：
  - `cmake -S cpp-app -B cpp-app/build-curl -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_ENABLE_CURL_HTTP=ON -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-curl`：通过。
  - `ctest --test-dir cpp-app/build-curl --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；`mrright_cpp_curl_compile_tests` passed；4/4 tests passed）。

后续待办保留：

1. SQLite/local cache strategy
2. secure TokenStore
3. Qt/QML prototype
4. packaging strategy spike

## 2026-07-07：C++ optional nlohmann/json parser backend

结论：本轮在现有 temporary `JsonValue` parser / `EnvelopeParser` 边界基础上，接入 optional nlohmann/json parser backend。默认 CMake build 仍不依赖 vcpkg/nlohmann/json，继续使用 temporary parser；显式开启 `MRRIGHT_USE_NLOHMANN_JSON=ON` 时才 `find_package(nlohmann_json CONFIG REQUIRED)`、定义 `MRRIGHT_USE_NLOHMANN_JSON`，并让 SDK tests 使用 nlohmann-backed parser boundary。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未做 Qt/QML、未做 SQLite cache、未做 secure TokenStore、未做 packaging、未改 Web/API 行为**。

完成内容：

- 更新 `cpp-app/vcpkg.json`：
  - 保留 `curl`。
  - 新增 `nlohmann-json`。
  - 未加入 sqlite3 或 Qt。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_USE_NLOHMANN_JSON=OFF`。
  - OFF 时不调用 `find_package(nlohmann_json)`，默认 no-dependency build 继续走 temporary parser。
  - ON 时查找 `nlohmann_json`、链接 `nlohmann_json::nlohmann_json`、定义 `MRRIGHT_USE_NLOHMANN_JSON`，并构建 `mrright_cpp_nlohmann_json_tests`。
  - 未破坏 `MRRIGHT_ENABLE_CURL_HTTP` 和 local API smoke 的 opt-in 边界。
- 新增 parser backend 文件：
  - `cpp-app/sdk/core/NlohmannJsonValue.hpp`
  - `cpp-app/sdk/core/NlohmannEnvelopeParser.hpp`
  - 解析 strict `/api/v1` envelope：`data` / `pagination` / `error`。
  - 保留 unknown `error.code` raw string。
  - 拒绝 invalid JSON、非 strict envelope、legacy mirror top-level key、缺少 `data`/`pagination`/`error` 的响应。
- 新增 `cpp-app/tests/unit/nlohmann_json_parser_tests.cpp`：
  - success envelope parse。
  - error envelope parse。
  - unknown error.code raw string 保留。
  - legacy mirror 被拒绝。
  - `ProjectClient::listProjects` 使用 nlohmann backend 解析 mock response。
  - invalid JSON 返回 parse error。
  - strict envelope 缺字段返回 contract error。
  - auth/session 最小字段通过 `AuthClient::login` 覆盖。
- 更新 `.github/workflows/cpp-app.yml`：
  - 保留默认 no-dependency Windows/macOS/Linux matrix。
  - 保留 libcurl/vcpkg job。
  - 新增 Ubuntu `cpp-app-nlohmann-vcpkg` job，验证 vcpkg manifest、`MRRIGHT_USE_NLOHMANN_JSON=ON` configure/build/CTest。
- 更新文档：
  - `cpp-app/README.md` 说明默认 temporary parser、optional nlohmann/json backend、启用命令和后续默认化决策。
  - `docs/CPP_APP_MIGRATION_PLAN.md` 记录 nlohmann/json parser backend 已进入验证，temporary parser 仍保留为 no-dependency fallback。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认 no-dependency CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- nlohmann-enabled vcpkg CMake：
  - `cmake -S cpp-app -B cpp-app/build-json -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_USE_NLOHMANN_JSON=ON -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-json`：通过。
  - `ctest --test-dir cpp-app/build-json --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_nlohmann_json_tests` passed；3/3 tests passed）。
- libcurl/vcpkg CMake regression check：
  - `cmake -S cpp-app -B cpp-app/build-curl -G Ninja -DCMAKE_BUILD_TYPE=Debug -DMRRIGHT_ENABLE_CURL_HTTP=ON -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：通过。
  - `cmake --build cpp-app/build-curl`：通过。
  - `ctest --test-dir cpp-app/build-curl --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；`mrright_cpp_curl_compile_tests` passed；3/3 tests passed）。

后续待办保留：

1. decide when to make nlohmann/json default
2. SQLite/local cache strategy
3. secure TokenStore
4. Qt/QML prototype
5. packaging strategy spike

## 2026-07-06：C++ local API smoke actual validation passed

结论：本地 C++ local API smoke 已实际跑通。本轮只记录验证结果，未改代码、未改 Web/API 行为、未改 C++ 实现、未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未提交构建产物。

本地 API server：

- 启动命令：`npm run dev:server`
- URL：`http://127.0.0.1:4173`

代理注意事项：

- 当前环境存在 `HTTP_PROXY` / `http_proxy`，会影响 localhost / 127.0.0.1 请求。
- curl 验证需要使用 `--noproxy '*'`。
- C++ smoke 需要 unset `HTTP_PROXY` / `http_proxy` / `HTTPS_PROXY` / `https_proxy` / `ALL_PROXY` / `all_proxy`，并设置：
  `NO_PROXY=localhost,127.0.0.1,::1`

curl 验证：

- 命令：`curl --noproxy '*' http://127.0.0.1:4173/api/v1/health`
- 返回 strict JSON envelope：
  - `data.ok: true`
  - `data.service: "mrright-portfolio"`
  - `pagination: {}`
  - `error: null`

C++ local smoke：

- `MRRIGHT_API_BASE_URL=http://127.0.0.1:4173`
- 命令：`ctest --test-dir cpp-app/build-curl-smoke --output-on-failure`
- 代理环境：unset HTTP/HTTPS/ALL proxy，并设置 `NO_PROXY=localhost,127.0.0.1,::1`
- 结果：
  - `mrright_cpp_smoke` passed
  - `mrright_cpp_sdk_tests` passed
  - `mrright_cpp_curl_compile_tests` passed
  - `mrright_cpp_local_api_smoke` passed
  - 4/4 tests passed

覆盖 endpoints：

- `GET /api/v1/health`
- `GET /api/v1/projects`
- missing project 404 strict envelope

安全说明：

- 未访问生产 API。
- 未部署 VPS。
- 未 push GitHub。
- 未改代码。
- 未改数据库、token、secret。
- 未提交 `cpp-app/build-curl-smoke`、`dist`、`build`、`node_modules`、`vcpkg_installed` 或其他构建产物。

## 2026-07-06：修复 /api/v1 dual mount rewrite

结论：本轮只修复本地 `/api/v1` dual mount rewrite 和相关 API contract 测试。发现普通本地请求中 `/api/v1/health` 曾落到 SPA fallback，表现为返回 `text/html` index，而不是进入 `/api/health` handler。已将 `/api/v1` rewrite 改为明确的字符串匹配逻辑，确保 `/api/v1/*` 进入同一套 `/api/*` handler，并通过 `request.apiVersion = 'v1'` 保持 strict envelope mode。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未运行 C++ local smoke、未改 C++ 代码、未改 Web 前端**。

完成内容：

- 修复 `server/index.js`：
  - `/api/v1/health` rewrite 到 `/api/health`。
  - `/api/v1/projects` rewrite 到 `/api/projects`。
  - `/api/v1?x=1` rewrite 到 `/api?x=1`。
  - `/api/v1x` 不 rewrite。
  - rewrite 命中时继续设置 `request.apiVersion = 'v1'`，由 `server/responses.js` 输出 strict envelope。
- 更新 `tests/api/contract.spec.js`：
  - 强化 `GET /api/v1/health` JSON content-type 和 strict top-level keys 检查。
  - 明确断言 `/api/v1/health` 不包含 legacy `ok` / `service` 顶层镜像。
  - 将 v1 前缀误匹配覆盖改为 `/api/v1x/health`。

本地 curl 验证：

- `curl --noproxy '*' -i http://127.0.0.1:4173/api/health`：返回 `application/json`，保留 legacy-compatible 顶层 `ok` / `service` 镜像。
- `curl --noproxy '*' -i http://127.0.0.1:4173/api/v1/health`：返回 `application/json` strict envelope，顶层只有 `data` / `pagination` / `error`。
- `curl --noproxy '*' -i http://127.0.0.1:4173/api/v1x/health`：未 rewrite，返回 SPA HTML fallback。

注意：当前 shell 设置了 `HTTP_PROXY` / `http_proxy`，且没有 `NO_PROXY`，普通 `curl http://127.0.0.1:4173/...` 可能经代理转发；本轮本地验证使用 `--noproxy '*'` 确认命中本机 dev server。

后续需要：

1. C++ local smoke 仍待下一步实际运行。

## 2026-07-05：C++ local API smoke actual run blocked by missing vcpkg

结论：本轮尝试实际运行 C++ local API smoke test，但在环境检查阶段被本地缺少 vcpkg 阻塞。当前仓库工作区开始时干净，后端本地启动命令已确认：`npm run dev:server`（`node server/index.js`）。按要求未自动安装 vcpkg、未修改代码绕过 libcurl/vcpkg、未启动本地 API server、未运行 C++ local smoke、未访问生产 API。**未部署、未 push、未改生产数据库、未读取或修改 `.env`/token/secret、未改 Web/API 行为、未做 Qt/QML、未做 SQLite、未做 TokenStore、未做 packaging**。

环境检查：

- `git status --short --branch`：开始时干净，当前分支 `test/cpp-run-local-api-smoke`。
- `package.json` scripts：
  - 优先后端/API 启动命令：`npm run dev:server` -> `node server/index.js`。
  - 全栈命令：`npm run dev:full`。
- vcpkg/libcurl toolchain 检查：
  - `which vcpkg`：未找到。
  - `VCPKG_ROOT`：空。
  - `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：不存在。
- 阻塞原因：缺少 vcpkg/toolchain，无法按要求配置
  `MRRIGHT_ENABLE_CURL_HTTP=ON` + `MRRIGHT_ENABLE_LOCAL_API_SMOKE=ON`
  的 `cpp-app/build-curl-smoke`。

未执行内容：

- 未启动 local API server。
- 未请求 `http://127.0.0.1:3000/api/v1/health`。
- 未配置 `cpp-app/build-curl-smoke`。
- 未运行 C++ local API smoke CTest。
- 未访问生产域名。

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist/`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- C++ local API smoke：
  - 未配置 libcurl-enabled CMake。
  - 未运行 CTest。
  - 未覆盖 `/api/v1/health`、`/api/v1/projects`、missing project 404；原因是本地缺少 vcpkg/toolchain。

后续需要：

1. 安装或配置 vcpkg。
2. 设置 `VCPKG_ROOT` 指向 vcpkg 根目录。
3. 确认 `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake` 存在。
4. 重新运行 local API smoke actual validation。

## 2026-07-05：C++ SDK local dev server API smoke test entrypoint

结论：新增 C++ SDK local/dev API smoke test 入口，用于通过 `CurlHttpClient` 真实请求本地开发服务器的 `/api/v1` strict envelope API。该入口默认关闭，普通 no-dependency CMake build 和普通 CTest 不构建、不运行、不联网；只有显式开启 `MRRIGHT_ENABLE_CURL_HTTP=ON` 与 `MRRIGHT_ENABLE_LOCAL_API_SMOKE=ON` 时才构建并注册 CTest。运行时必须设置 `MRRIGHT_API_BASE_URL`，并且只允许 `http://localhost`、`http://127.0.0.1` 或 `http://[::1]`（可带端口）。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未改 Web/API 行为、未做 Qt/QML、未做 SQLite cache、未实现 secure TokenStore、未替换 nlohmann/json、未做 packaging**。

完成内容：

- 新增 `cpp-app/tests/integration/local_api_smoke.cpp`：
  - 使用 `CurlHttpClient` 执行真实 HTTP 请求。
  - `MRRIGHT_API_BASE_URL` 未设置时以 CTest skip code `77` 跳过，并输出清晰说明。
  - `MRRIGHT_API_BASE_URL` 不是 loopback HTTP URL 时拒绝运行。
  - 不读取 `.env`，不使用 token，不登录、不注册、不上传、不调用 admin endpoint、不做写操作。
  - 覆盖 `GET /api/v1/health`：HTTP 200、strict `data`/`pagination`/`error` envelope、`error: null`、`data.ok === true`。
  - 覆盖 `GET /api/v1/projects`：允许 HTTP 200 或当前 local store 不可用时的明确 API error envelope；拒绝 legacy 顶层 `projects` 镜像，并通过 `ProjectClient::listProjects()` / `EnvelopeParser` 解析。
  - 覆盖不存在 project 的 `GET /api/v1/projects/__mrright_cpp_smoke_missing_project__`：验证 404 strict error envelope 且 `error.code` / `error.message` 存在。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_LOCAL_API_SMOKE=OFF`。
  - ON 时要求 `MRRIGHT_ENABLE_CURL_HTTP=ON`，否则 CMake fatal error。
  - ON 且 curl backend 可用时构建 `mrright_cpp_local_api_smoke` 并注册 CTest。
  - 默认 OFF 时不构建、不注册 local API smoke test，不破坏默认无依赖 build。
- 更新 `cpp-app/README.md`：
  - 增加 local API smoke 的配置、构建、运行命令。
  - 明确只允许 localhost/127.0.0.1/[::1]。
  - 明确不访问生产、不读取 `.env`、不做写操作。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 local/dev API smoke test 入口已加入。
  - 保留后续待办。

后续待办保留：

1. nlohmann/json replacement
2. SQLite cache
3. secure TokenStore
4. Qt/QML prototype
5. packaging strategy spike

本轮验证结果：

- `git diff --check`：通过。
- `npm run lint`：首次在 fresh clone 环境中因缺少本地 `node_modules` 而调用系统 ESLint 6.4 失败；执行 `npm ci` 安装本地依赖后重跑通过。`node_modules/` 未提交。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist/`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- 本地 libcurl/local API smoke build：
  - 本机未发现可用 `vcpkg`，`VCPKG_ROOT` 为空，`$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake` 不存在。
  - 按要求未自动安装 vcpkg，未在仓库内创建 `build-curl-smoke`。
  - 额外尝试在 `/tmp/mrright-cpp-build-curl-smoke` 配置 opt-in smoke target；CMake 因缺少 `CURL::libcurl` 按预期失败并给出需要 vcpkg toolchain 或 curl development package 的错误。
  - `c++ -std=c++20 -Wall -Wextra -Wpedantic -Icpp-app -fsyntax-only cpp-app/tests/integration/local_api_smoke.cpp`：通过。
  - 未启动 local dev server，未访问生产 API。

安全说明：

- 未部署 VPS。
- 未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未访问生产 API。
- 未改 Web/API 行为。
- 未提交 `cpp-app/build`、`cpp-app/build-curl`、`cpp-app/build-curl-smoke`、`vcpkg_installed`、`dist`、`build`、`node_modules` 或其他构建产物。
- 未做下一步任务：Qt/QML、SQLite cache、secure TokenStore、nlohmann/json replacement、packaging。

## 2026-07-05：C++ libcurl-enabled build with vcpkg validation

结论：完成 optional libcurl backend 的 vcpkg validation 路径。本机未配置可用 `vcpkg`（`VCPKG_ROOT` 为空，未找到 `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`），按要求未自动安装；已改由独立 GitHub Actions job `cpp-app-curl-vcpkg` 在 Ubuntu runner 上 bootstrap vcpkg、解析 `cpp-app/vcpkg.json` manifest、以 `MRRIGHT_ENABLE_CURL_HTTP=ON` 配置/build/CTest。默认 no-dependency CMake build 保持独立路径。**未部署、未 push、未改数据库、未读取或修改 `.env`/token/secret、未访问生产 API、未做 local API smoke test、未开发 UI、未做 SQLite cache、未替换 nlohmann/json、未实现 secure TokenStore、未做 packaging、未改 Web/API 行为**。

完成内容：

- 更新 `.github/workflows/cpp-app.yml`：
  - 保留原有 Windows/macOS/Linux 默认 no-dependency C++ skeleton matrix。
  - 新增 `cpp-app-curl-vcpkg` job，先覆盖 `ubuntu-latest`。
  - CI 手动 clone Microsoft vcpkg 到 `$RUNNER_TEMP/vcpkg`，bootstrap 后使用 vcpkg toolchain。
  - 使用 `cpp-app/vcpkg.json` manifest 解析 `curl`。
  - 以 `MRRIGHT_ENABLE_CURL_HTTP=ON` 配置 `cpp-app/build-curl`、构建并运行 CTest。
  - 不上传构建产物、不读取 secrets、不访问生产 API、不运行 local API smoke test。
- 更新 `cpp-app/CMakeLists.txt`：
  - `MRRIGHT_ENABLE_CURL_HTTP` 仍默认 `OFF`。
  - 默认 OFF 时仍不 `find_package(CURL)`，不需要 vcpkg/libcurl。
  - ON 时 `CurlHttpClient.cpp` 继续编译进 `mrright_sdk_curl_http`。
  - ON 时新增 no-network compile/link CTest binary `mrright_cpp_curl_compile_tests`，用于确认 curl backend 真实进入 target 构建链路。
- 新增 `cpp-app/tests/unit/curl_http_compile_tests.cpp`：
  - 只构造 `CurlHttpClient` 并检查 `ApiClientConfig` 保留。
  - 不发送请求、不访问真实 API、不读取 token。
- 更新 `cpp-app/README.md`：
  - 补充 `VCPKG_ROOT` + `MRRIGHT_ENABLE_CURL_HTTP=ON` 本地验证命令。
  - 说明默认 build 仍不需要 vcpkg/libcurl。
  - 说明 CI 有单独 `cpp-app-curl-vcpkg` job。
  - 说明 curl-enabled CTest 是 compile/link-only，不访问真实 API。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 libcurl-enabled build validation 已加入 CI。
  - 说明 CMake/CTest 会验证 optional backend 进入构建链路。

本地 vcpkg 状态：

- `which vcpkg`：未找到。
- `VCPKG_ROOT`：空。
- `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake`：不存在。
- 按要求未自动安装 vcpkg；本地 `build-curl` configure/build/CTest 未运行，改由 CI workflow 验证。

本轮验证结果：

- `git diff --check`：通过（仅提示既有前端文件 CRLF 将被 Git 规范化；本轮未修改这些文件）。
- `npm run lint`：通过。
- `npm run build`：通过；产生的 `dist/` 变动已 `git restore dist/`，未提交。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- libcurl-enabled CMake：
  - 本地因缺少 vcpkg 未运行。
  - 已加入 CI `cpp-app-curl-vcpkg` 验证 manifest、libcurl dependency resolve、`MRRIGHT_ENABLE_CURL_HTTP=ON` configure、build、CTest。

后续待办保留：

1. local dev server API smoke test
2. nlohmann/json replacement
3. SQLite cache
4. secure TokenStore
5. Qt/QML prototype
6. packaging strategy spike

安全说明：

- 未部署 VPS。
- 未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未访问生产 API。
- 未做 local API smoke test。
- 未提交 `cpp-app/build`、`cpp-app/build-curl`、`vcpkg_installed`、`dist`、`build`、`node_modules` 或其他构建产物。
- 未做下一步任务：nlohmann/json replacement、SQLite cache、secure TokenStore、Qt/QML prototype、packaging。

## 2026-07-05：C++ SDK skeleton branch pushed / PR ready

结论：当前分支 `feat/cpp-sdk-skeleton` 已成功 push 到 GitHub，并已设置 upstream：`origin/feat/cpp-sdk-skeleton`。GitHub 已提示可创建 PR：`https://github.com/rightamen/3d-portfolio/pull/new/feat/cpp-sdk-skeleton`。本轮只记录进度，**未改代码、未改 Web/API/C++ 实现、未改数据库、未部署、未 push**。

当前分支状态：

- 本地分支：`feat/cpp-sdk-skeleton`
- 远程 upstream：`origin/feat/cpp-sdk-skeleton`
- `git status --short --branch`：`## feat/cpp-sdk-skeleton...origin/feat/cpp-sdk-skeleton`
- 当前分支可创建 PR：`feat/cpp-sdk-skeleton -> main` 或对应目标分支。

当前阶段已完成：

- API v1 strict envelope
- OpenAPI contract extraction
- OpenAPI auto validation
- C++ cross-platform SDK skeleton
- C++ CMake skeleton
- GitHub Actions C++ skeleton workflow
- MockHttpClient
- strict envelope parser
- typed clients
- ApiClientConfig
- HTTP backend strategy ADR
- dependency manager strategy ADR
- optional libcurl backend spike

已验证：

- `npm run lint`
- `npm run build`
- `npm run test:api`
- `npm run test:api:db`
- `npm run test:openapi`
- local WSL CMake configure/build/CTest
- default no-dependency C++ build
- libcurl-enabled build 在缺少 libcurl 时按预期失败并给出清晰错误

当前仍未完成：

1. 等待 GitHub Actions 三平台 C++ workflow 结果
2. libcurl-enabled build with vcpkg
3. local dev server API smoke test
4. nlohmann/json replacement
5. SQLite cache
6. secure TokenStore implementation
7. Qt/QML prototype
8. packaging strategy spike

下一步建议：

1. 先检查 GitHub Actions 是否通过。
2. 再开 PR review。
3. PR 通过后再继续下一批：vcpkg/libcurl-enabled build 验证或 local API smoke test。

安全说明：

- 未部署 VPS。
- 未执行新的 push。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API/C++ 源码。
- 未提交 build/dist/node_modules/cpp-app/build/cpp-app/build-curl/vcpkg_installed 或其他构建产物。

## 2026-07-05：C++ optional libcurl HTTP backend spike

结论：完成 optional libcurl HTTP backend spike。新增 `cpp-app/vcpkg.json`（仅 `curl`）、可选 `CurlHttpClient` concrete backend，以及 `MRRIGHT_ENABLE_CURL_HTTP` CMake wiring。默认 build 仍为无外部依赖路径：不查找 libcurl、不要求 vcpkg、`MockHttpClient` 和 SDK tests 继续构建通过。**未做 local API smoke test、未访问生产 API、未接 Qt、未替换 JSON parser、未实现 SQLite cache、未实现 secure TokenStore、未开发 UI、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `cpp-app/vcpkg.json`：
  - package name：`mrright-cpp-app`。
  - 当前只声明 `curl` 依赖。
  - 未加入 `nlohmann-json`、sqlite3、Qt 或其他依赖。
- 更新 `cpp-app/CMakeLists.txt`：
  - `MRRIGHT_ENABLE_CURL_HTTP` 继续默认 `OFF`。
  - 默认 OFF 时不调用 `find_package(CURL)`，不链接 libcurl，默认 smoke/tests 保持无依赖构建。
  - ON 时先尝试 `find_package(CURL CONFIG QUIET)`，再尝试 `find_package(CURL QUIET)`。
  - 找不到 libcurl 时给出明确 fatal error，提示使用 vcpkg toolchain 或安装 curl development package。
  - ON 且找到 libcurl 时构建 `mrright_sdk_curl_http`，链接 `CURL::libcurl`。
- 新增 `cpp-app/sdk/network/CurlHttpClient.hpp` / `.cpp`：
  - 实现 `HttpClient::send(HttpRequest)`。
  - 支持 GET、POST、PUT、DELETE、PATCH。
  - 支持 request URL/path、headers、body、`ApiClientConfig.timeoutMs`。
  - 返回 `HttpResponse.statusCode`、body、best-effort response headers。
  - 网络错误通过 `ApiResult` 返回，不以 throw 作为主路径。
  - 不解析业务 JSON，不理解 Project/User/Community，不保存 token，不打印 `Authorization`，不写死 `/api/v1`。
  - `ApiClient` 仍负责 `/api/v1` path、legacy/admin path 拒绝、通用 headers 和 bearer token header。
- `RealHttpClient` 保持 placeholder：
  - 默认继续返回 `REAL_HTTP_BACKEND_NOT_ENABLED`。
  - 默认 build 下不依赖 libcurl。
- 更新 `.gitignore`：
  - 忽略 `cpp-app/build-curl/` 与 `cpp-app/vcpkg_installed/`。
- 更新 `cpp-app/README.md` 与 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明默认 build 不需要 libcurl。
  - 说明如何用 vcpkg toolchain 启用 optional libcurl backend。
  - 明确不提交 `vcpkg_installed`、`cpp-app/build`、`cpp-app/build-curl`。
  - 明确 real API smoke test 不是本批任务，后续必须指向 local/dev server。

仍未实现 / 后续待办：

1. local API smoke test against dev server
2. nlohmann/json replacement
3. SQLite cache
4. secure TokenStore
5. Qt/QML prototype
6. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- 默认无依赖 CMake：
  - `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
  - `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
  - `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。
- libcurl-enabled build：
  - 本机未发现可用 `vcpkg` / `curl-config` / pkg-config libcurl，未安装新依赖。
  - 已验证 `MRRIGHT_ENABLE_CURL_HTTP=ON` 且缺少 libcurl 时 CMake 给出清晰错误：需要 vcpkg toolchain 或 curl development package 提供 `CURL::libcurl`。
  - 因缺少本地 libcurl/vcpkg，未完成 `build-curl` 编译和 CTest；后续由 dependency-enabled 本地/CI 环境验证。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未访问生产 API。
- 未做 local API smoke test。
- 未提交 dist/build/node_modules/cpp-app/build/cpp-app/build-curl/vcpkg_installed 或其他构建/依赖产物。
- 未做 nlohmann/json replacement、SQLite cache、secure TokenStore、Qt/QML prototype、packaging 等下一步任务。

## 2026-07-05：C++ dependency manager strategy ADR

结论：完成 C++ dependency manager 策略 ADR。最终选择 vcpkg manifest mode 作为 SDK/backend native dependencies 的首选策略；本批不新增实际依赖、不新增 `vcpkg.json`、不改 CMake 依赖 wiring，继续保持当前无外部依赖 mock build。下一批 libcurl backend spike 时再引入 vcpkg manifest。**未实现 libcurl backend、未接 Qt、未替换 JSON parser、未改 C++ SDK 代码、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `docs/adr/ADR_CPP_DEPENDENCY_MANAGER_STRATEGY.md`：
  - 记录当前 `cpp-app` CMake skeleton 无外部 runtime 依赖。
  - 记录 JSON 长期倾向 `nlohmann/json`、HTTP backend 下一步倾向 libcurl。
  - 比较 vcpkg manifest、Conan、系统包、CMake `FetchContent`、vendoring。
  - 接受推荐方案：vcpkg manifest 管理 libcurl、nlohmann-json、sqlite3 等 SDK/backend 依赖。
  - 明确 Qt 在 Qt/QML 阶段单独评估，可用 vcpkg、Qt 官方安装器或 aqtinstall，但本批不引入。
  - 明确不提交 `vcpkg_installed/`、依赖缓存、第三方源码或构建产物。
- 更新 `cpp-app/README.md`：
  - 增加 dependency strategy 简述。
  - 说明当前 skeleton 无外部 C++ runtime 依赖。
  - 说明后续 libcurl / nlohmann-json / sqlite3 倾向 vcpkg manifest 管理。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 dependency manager strategy 已决策。
  - 下一步调整为 libcurl backend spike + vcpkg manifest。

仍未实现 / 后续待办：

1. libcurl backend spike
2. vcpkg manifest
3. local API smoke test
4. nlohmann/json replacement
5. SQLite cache
6. secure TokenStore
7. Qt/QML prototype

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
- `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
- `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ SDK HTTP backend strategy ADR

结论：完成 C++ SDK HTTP backend 策略 ADR。最终路线是继续保持 `HttpClient` abstraction，业务 client 不依赖具体网络库；短期 `RealHttpClient` 仍是 placeholder，不实现真实网络；下一批优先做可选 libcurl backend spike；Qt Network backend 后置到 Qt/QML prototype 阶段。**未实现真实 HTTP、未接 Qt、未接 libcurl、未开发 UI、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `docs/adr/ADR_CPP_HTTP_BACKEND_STRATEGY.md`：
  - 记录当前 `HttpClient` / `MockHttpClient` / `RealHttpClient` / `/api/v1` request construction / `EnvelopeParser` 状态。
  - 比较 libcurl first、Qt Network first、继续 placeholder、抽象 + libcurl first + Qt later 四种方案。
  - 接受推荐方案：`HttpClient` abstraction + optional libcurl backend first + Qt backend later。
  - 明确 `ApiClient`、`HttpClient backend`、`EnvelopeParser`、typed clients 的职责边界。
  - 明确 backend/network error 与 `/api/v1` envelope API error 的区别。
  - 明确 token 只通过内存配置或未来 `TokenStore`，`HttpClient` 不持久化 token，日志不得输出 `Authorization`。
  - 明确 `MRRIGHT_ENABLE_CURL_HTTP` 当前默认 OFF，后续 libcurl 通过 vcpkg manifest 或 Conan 管理，不 vendoring。
- 更新 `cpp-app/README.md`：
  - 说明 `RealHttpClient` 当前仍是 no-network placeholder。
  - 说明 `MockHttpClient` 用于 request construction 和 envelope parsing 测试。
  - 链接 HTTP backend strategy ADR。
  - 说明当前不访问生产 API，token 不写入配置文件或日志。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 HTTP backend strategy 已决策。
  - 下一步调整为 libcurl backend spike / dependency manager decision。

本地 WSL CMake 状态：

- 已记录并继续有效：`cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`、`cmake --build cpp-app/build`、`ctest --test-dir cpp-app/build --output-on-failure` 均已通过。
- 本批会重新运行 CMake configure/build/CTest；`cpp-app/build/` 不提交。

仍未实现 / 后续待办：

1. libcurl backend spike
2. dependency manager strategy：vcpkg vs Conan
3. real API smoke test against local dev server
4. JSON parser replacement with nlohmann/json
5. SQLite cache
6. secure TokenStore implementation
7. Qt/QML prototype

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。
- `cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`：通过。
- `cmake --build cpp-app/build`：通过（`ninja: no work to do.`）。
- `ctest --test-dir cpp-app/build --output-on-failure`：通过（`mrright_cpp_smoke` passed；`mrright_cpp_sdk_tests` passed；2/2 tests passed）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ local WSL CMake validation

结论：已在 `/mnt/g/Code/3d-portfolio` 下完成 `cpp-app` 本地 WSL Ninja Debug CMake 验证。`mrright_cpp_smoke` 与 `mrright_cpp_sdk_tests` 均通过，CTest 结果为 `2/2 tests passed`。本批只更新验证记录文档，**未改代码、未改 Web/API 行为、未改数据库、未部署、未 push**。

执行记录：

- CMake configure：`cmake -S cpp-app -B cpp-app/build -G Ninja -DCMAKE_BUILD_TYPE=Debug`
- CMake build：`cmake --build cpp-app/build`
- CTest：`ctest --test-dir cpp-app/build --output-on-failure`

测试结果：

- `mrright_cpp_smoke`：passed。
- `mrright_cpp_sdk_tests`：passed。
- `2/2 tests passed`。

Git / 构建产物状态：

- `git status --short --branch` 保持干净：`## feat/cpp-sdk-skeleton`。
- `cpp-app/build/` 未提交，已由 `.gitignore` 忽略。
- 未提交 `dist` / `build` / `node_modules` / `cpp-app/build`。

验证结果：

- `git diff --check`：待运行。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。

## 2026-07-05：C++ SDK JSON parser dependency decision

结论：完成 C++ SDK JSON 解析策略决策。短期保留当前 `JsonValue.hpp` temporary parser，仅用于 early SDK prototype / mock-driven strict-envelope tests，并继续把 JSON 边界收敛在 `EnvelopeParser.hpp`；长期选择通过未来 C++ dependency manager 接入 `nlohmann/json`。本批不新增第三方依赖、不 vendored 大文件、不让 CMake 默认联网下载依赖。**未实现真实 HTTP、未开发 UI、未接 SQLite、未改 Web/API 行为、未改数据库、未部署、未 push**。

方案比较结论：

- 继续保留当前 `JsonValue` parser：跨平台和离线构建最好，适合当前 contract fixtures；但 Unicode、number、诊断、完整 JSON 兼容性不足，只能作为临时 parser。
- `nlohmann/json`：长期首选。跨平台成熟、header-only 使用方便、CMake/vcpkg/Conan 集成简单，适合 SDK core typed model decoding，不依赖 Qt UI，也不妨碍未来 Qt/QML。
- Boost.JSON：技术上可行，但为了 JSON 单独引入 Boost 生态偏重，不适合当前轻量 SDK 阶段。
- Qt JSON：适合未来 Qt UI/network 层，但现在接入会让 SDK core 过早依赖 Qt。
- simdjson：适合未来大规模 JSON 性能场景；当前 envelope/client 阶段过早。

完成内容：

- 新增 `docs/adr/ADR_CPP_JSON_STRATEGY.md`：
  - 记录背景、当前 parser 限制、方案比较、最终决策、短期/长期策略、CMake/CI/SDK model 影响，以及明确不做事项。
- 更新 `cpp-app/sdk/core/JsonValue.hpp`：
  - 增加注释，标明它是 early SDK contract tests 的 temporary prototype JSON boundary。
  - 明确不得扩展成 production JSON library，业务 client 不应直接散落 JSON 解析逻辑。
- 更新 `cpp-app/README.md`：
  - 说明当前 JSON 策略仍使用 temporary parser。
  - 说明长期目标是通过未来 C++ dependency manager 引入 `nlohmann/json`。
  - 说明本批不 vendored 大文件、不让 CMake 默认联网下载依赖。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 JSON parser strategy 已决策。
  - 保留后续真实 HTTP backend / Qt-vs-libcurl dependency strategy 作为下一步。

仍未实现 / 后续待办：

1. real libcurl or Qt Network backend
2. OpenAPI generated client spike
3. SQLite cache
4. secure TokenStore implementation
5. Qt/QML prototype
6. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `c++` 直接编译 smoke + SDK tests：通过（`SDK contract tests passed.`）。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ SDK HTTP client configuration / backend abstraction 第一批

结论：在现有 `MockHttpClient` / `EnvelopeParser` / typed clients 基础上，完成真实 HTTP backend 的可替换接口层第一批：新增 `ApiClientConfig`、统一请求构造、内存 bearer token header、`RealHttpClient` 占位实现、更多 typed client 方法和请求构造测试。默认构建仍不依赖 Qt/libcurl，不做真实联网。**未开发 UI、未接 SQLite、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `cpp-app/sdk/core/ApiClientConfig.hpp`：
  - `baseUrl`：默认空，不硬编码生产域名；README 示例使用 `http://localhost:3000`。
  - `apiPrefix`：默认 `/api/v1`。
  - `timeoutMs`：默认 30000。
  - `userAgent`：默认 `mrright-cpp-sdk/0.1`。
  - `bearerToken`：可选，仅内存配置，不落盘。
- 更新 `ApiClient`：
  - 所有业务 path 统一由 `ApiClient` 构造。
  - 自动拼接 `baseUrl + /api/v1 + path`。
  - 自动设置 `Accept: application/json`。
  - POST/PUT/PATCH 且 body 非空时自动设置 `Content-Type: application/json`。
  - `ApiClientConfig.bearerToken` 存在时自动设置 `Authorization: Bearer <token>`。
  - 继续拒绝 `/admin...` 与 legacy `/api/...` path。
  - 明确只支持 strict `/api/v1`，拒绝非 `/api/v1` prefix。
- 新增 `cpp-app/sdk/network/RealHttpClient.hpp`：
  - 可替换真实 backend 占位实现。
  - 当前不联网，返回 `REAL_HTTP_BACKEND_NOT_ENABLED`。
  - 后续可在同一 `HttpClient` interface 后接 Qt Network 或 libcurl。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `MRRIGHT_ENABLE_CURL_HTTP` option，默认 OFF。
  - 当前启用该 option 会明确失败，避免误以为 libcurl backend 已实现；默认构建不依赖外部 HTTP 包。
- typed clients 扩展：
  - `AuthClient::logout(token)`：mockable `POST /api/v1/auth/logout`。
  - `AuthClient::me(token)`：mockable `GET /api/v1/auth/me`。
  - `ProjectClient::likeProject(slug, visitorId, token)`：mockable `POST /api/v1/projects/{slug}/like`。
  - `ProjectClient::createComment(slug, request, token)`：mockable `POST /api/v1/projects/{slug}/comments`。
  - `CommunityClient::listPosts()`、`getPost(id)`、`listComments(postId)`、`createComment(...)`、`likeComment(...)` 第一批 mockable 方法。
  - 未实现不确定 endpoint 的完整业务流；未调用 admin；未编造 OpenAPI 未确认字段。
- 新增/扩展 C++ tests：
  - `ApiClientConfig` 默认 `apiPrefix == /api/v1`，`baseUrl` 不硬编码生产域名。
  - `ProjectClient::listProjects` 构造 `GET /api/v1/projects`。
  - `AuthClient::login` 构造 `POST /api/v1/auth/login`。
  - POST 请求设置 `Content-Type`。
  - bearer token 只进入 `Authorization` header。
  - legacy `/api` path 被拒绝。
  - `/admin` path 被拒绝。
  - error envelope 让 typed client 返回 `ApiResult` error。
  - invalid/non-envelope JSON 返回 contract error。
  - `RealHttpClient` 当前返回 backend-not-enabled error，不联网。

本地 CMake 状态：

- 本地仍无 `cmake` 命令；未安装新依赖，未执行正式 CMake configure/build/ctest。
- 使用直接 `c++` compile 验证：
  - `mrright_cpp_smoke`：通过。
  - `mrright_cpp_sdk_tests`：通过。
- CI workflow 负责三平台 CMake configure/build/smoke 验证；默认构建无 Qt/libcurl 依赖。

仍未实现 / 后续待办：

1. real libcurl or Qt Network backend
2. JSON parser dependency decision
3. OpenAPI generated client spike
4. SQLite cache
5. secure TokenStore implementation
6. Qt/QML prototype
7. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `c++` 直接编译 smoke + SDK tests：通过（`SDK contract tests passed.`）。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ SDK JSON / HTTP abstraction 第一批（mock-driven typed client）

结论：把 `cpp-app` SDK 从纯 skeleton 推进到可测试的 typed client 基础层。新增无外部依赖的最小 JSON/envelope decoding 边界、`HttpClient` mock、`AuthClient::login` / `ProjectClient::{listProjects,getProject}` 的 mock-driven 行为，以及 C++ unit test binary。**未实现真实 HTTP、未接 Qt/libcurl、未开发 UI、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新增 `cpp-app/sdk/core/JsonValue.hpp`：
  - header-only 最小 JSON AST/parser，只覆盖当前 strict envelope contract fixture 需要的 object/array/string/number/bool/null。
  - 不引入第三方 JSON 库、不新增 npm 依赖、不 vendored 大文件、不依赖系统包。
  - Unicode escape 仅作为占位保留，真实 parser 作为后续 dependency strategy 决策。
- 新增 `cpp-app/sdk/core/EnvelopeParser.hpp`：
  - 统一解析 strict `/api/v1` envelope，业务 client 不直接散落 JSON 解析逻辑。
  - 支持成功 envelope：`data` object、`pagination` object、`error: null`。
  - 支持错误 envelope：`data: null`、`error.code` / `error.message`。
  - 支持 `Pagination` 六字段基础解析。
  - 未知 `error.code` 映射到 `ApiErrorCode::Unknown`，保留原始 code 字符串。
  - 非 strict envelope / legacy 顶层镜像返回 `RESPONSE_CONTRACT_ERROR`。
- 更新 `cpp-app/sdk/network/HttpClient.hpp`：
  - `HttpRequest`：`method`、`path`、`headers`、`body`。
  - `HttpResponse`：`statusCode`、`headers`、`body`。
  - `HttpClient::send(HttpRequest) -> ApiResult<HttpResponse>`。
  - `NullHttpClient` 保持不联网。
  - 新增 `MockHttpClient`：队列式固定响应、记录 requests，用于 typed client 单测。
- 更新 typed clients：
  - `ApiClient` 统一拼接 `/api/v1` path，拒绝 `/admin...` 与 `/api/...` path。
  - `AuthClient::login(...)` 通过 `HttpClient` 发送 mockable `POST /api/v1/auth/login`，解析 `session.token` / `expiresAt` / `user`。
  - `ProjectClient::listProjects()` 发送 `GET /api/v1/projects` 并解析 `projects[]`。
  - `ProjectClient::getProject(slug)` 发送 `GET /api/v1/projects/{slug}` 并解析 `project`。
  - 不实现 admin endpoint，不支持 legacy `/api/*`，不读取 token。
- 新增 `cpp-app/tests/unit/sdk_contract_tests.cpp`：
  - 成功 envelope 可以解析。
  - 错误 envelope 可以解析。
  - unknown `error.code` 保留原始字符串并映射 Unknown。
  - legacy mirror / 非 strict envelope 被拒绝。
  - `MockHttpClient` 能驱动 `ProjectClient::listProjects`。
  - `ProjectClient` 构造 `/api/v1/projects`，不是 legacy `/api/projects`。
  - admin path 在 `ApiClient` 层被拒绝，且不会调用 `HttpClient::send`。
- 更新 `cpp-app/CMakeLists.txt`：
  - 新增 `mrright_cpp_sdk_tests` binary。
  - CTest 增加 `mrright_cpp_sdk_tests`。
  - smoke binary 保留。
- 更新 `cpp-app/README.md` 与 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 说明当前支持 mock-driven typed client tests。
  - 说明尚无真实 HTTP backend。
  - 说明 JSON parser 当前为无依赖最小 parser，后续需做依赖策略决策。
  - 下一步为真实 HTTP backend / dependency strategy。

本地 CMake 状态：

- 本地仍无 `cmake` 命令；未安装新依赖，未执行正式 CMake configure/build/ctest。
- 使用直接 `c++` compile 尽量验证：
  - `mrright_cpp_smoke`：通过。
  - `mrright_cpp_sdk_tests`：通过。
- CI workflow 负责三平台 CMake configure/build/smoke 验证；本批新增 test binary 已接入 CMake/CTest，后续 CI 会一并构建运行。

仍未实现 / 后续待办：

1. Real HTTP backend
2. JSON parser dependency decision
3. OpenAPI generated client spike
4. SQLite cache
5. secure TokenStore implementation
6. Qt/QML prototype
7. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `c++` 直接编译 smoke + SDK tests：通过（`SDK contract tests passed.`）。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：OpenAPI 自动校验工具接入（API v1 freeze 工程化）

结论：把 `docs/openapi/api-v1.yaml` 从静态文档升级为可自动校验的 contract artifact。新增 `scripts/validate-openapi.mjs` 与 `npm run test:openapi`，校验 YAML、`$ref`、strict envelope、response envelope 使用方式以及 `API_ERROR_CODES` 与 OpenAPI enum 一致性。**未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新建 `scripts/validate-openapi.mjs`：
  - 使用项目现有依赖树中的 `js-yaml` 解析 `docs/openapi/api-v1.yaml`，不新增重量级依赖。
  - 校验 YAML 可解析。
  - 校验顶层 `openapi` 存在。
  - 校验 `paths` 存在且非空。
  - 校验 `components.schemas` 存在。
  - 校验 `components.schemas.ResponseEnvelope` / `ApiError` / `Pagination` 存在。
  - 遍历并解析全部本地 `$ref`，缺失路径会失败。
  - 校验所有 `application/json` response schema 必须通过 `ResponseEnvelope` 或 `ErrorEnvelope`，避免裸返回业务模型。
  - 校验 strict `/api/v1` envelope 顶层只允许 `data` / `pagination` / `error`，且 `additionalProperties: false`。
  - 从 `server/responses.js` 读取 `API_ERROR_CODES`，与 OpenAPI `components.schemas.ApiErrorCode.enum` 做集合一致性比对；缺失或多余 code 都会失败。
- 更新 `package.json`：
  - 新增 `"test:openapi": "node scripts/validate-openapi.mjs"`。
- 更新 `docs/API_V1_FREEZE_PLAN.md`：
  - §18 标记 OpenAPI 自动校验脚本已接入。
  - checklist #9 标记为 ✅，说明已校验 YAML、`$ref`、response envelope、strict envelope 顶层键、error code enum。
- CI 说明：
  - 当前仓库只有独立的 C++ App Skeleton workflow，没有现成 Web/API lint/build/test workflow；本批未混改 C++ workflow。
  - 后续新增 Web/API CI 时，应把 `npm run test:openapi` 与 lint/build/API contract tests 放入同一质量门。

仍未实现 / 后续待办：

1. C++ HTTP backend
2. JSON parser/serialization
3. Qt/QML UI prototype
4. SQLite cache
5. secure TokenStore implementation
6. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。
- `npm run test:openapi`：通过（YAML 可解析；200 个本地 `$ref` 可解析；27 个 API error code 与 OpenAPI enum 一致）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 dist/build/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ cross-platform skeleton 工程化验证批次（CI matrix / ignore / docs）

结论：在不实现真实 HTTP、不开发 UI、不改 Web/API 行为的前提下，完成 `cpp-app` skeleton 的工程化验证入口补强。新增三平台 GitHub Actions matrix、补 CMake 构建产物 ignore 规则，并更新 README / 迁移计划 / 进度记录。

CMake skeleton 审查结果：

- `cpp-app/CMakeLists.txt` 已包含 `app/platform/AppPaths.cpp`，并通过 `mrright_app_platform` 静态库链接到 `mrright_cpp_smoke`。
- include 目录使用 `${CMAKE_CURRENT_SOURCE_DIR}`，与当前 include 写法（`#include "sdk/..."`、`#include "app/..."`）匹配。
- C++20 设置清晰：`CMAKE_CXX_STANDARD 20`、`CMAKE_CXX_STANDARD_REQUIRED ON`、`CMAKE_CXX_EXTENSIONS OFF`，同时 `mrright_sdk_core` 暴露 `cxx_std_20`。
- warning flags 跨平台安全：MSVC 使用 `/W4 /utf-8`，其他编译器使用 `-Wall -Wextra -Wpedantic`。
- `CMakePresets.json` 保留 `debug`、`release`、`relwithdebinfo`，不强绑单一 generator，适合 Windows/macOS/Linux 用各自默认生成器。
- build 输出目录为 `cpp-app/build` 或 preset 下的 `cpp-app/build/<preset>`；本批已在 `.gitignore` 排除，不污染 git。
- README 构建命令已改为跨平台更稳的 `cmake --build ... --config Debug` + `ctest --test-dir ... --build-config Debug`，避免直接写死单配置生成器下的可执行文件路径。

完成内容：

- 新增 `.github/workflows/cpp-app.yml`：
  - workflow 名称：`C++ App Skeleton`
  - matrix：`ubuntu-latest`、`macos-latest`、`windows-latest`
  - 每个平台执行：
    - `cmake -S cpp-app -B cpp-app/build -DCMAKE_BUILD_TYPE=Debug`
    - `cmake --build cpp-app/build --config Debug`
    - `ctest --test-dir cpp-app/build --build-config Debug --output-on-failure`
  - 不部署、不读取 secrets、不 push、不上传构建产物。
- 更新 `.gitignore`：
  - `cpp-app/build/`
  - `cpp-app/out/`
  - `cpp-app/.cache/`
  - `CMakeFiles/`
  - `CMakeCache.txt`
  - `compile_commands.json`
- 更新 `cpp-app/README.md`：
  - 说明本地需要 CMake 3.20+ 与 C++20 compiler。
  - 说明无本地 CMake 时可用 GitHub Actions CI 验证。
  - 说明支持 CMakePresets：`debug`、`release`、`relwithdebinfo`。
  - 说明 smoke binary 只验证 SDK skeleton / platform paths / no-network CLI，不调用 `/api/v1`、不读取 token、不测试真实业务。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：
  - 标记 C++ App Skeleton CI matrix 已加入。
  - 下一步明确为 HTTP backend / JSON parser / OpenAPI validation；Qt/QML 后置到 SDK 边界稳定后。

本地 CMake 状态：

- 本地仍无 `cmake` 命令；未安装新依赖，未执行正式 CMake configure/build。
- CI workflow 已提供 Windows/macOS/Linux 验证入口。

仍未实现 / 后续待办：

1. OpenAPI 自动校验工具接入
2. C++ HTTP backend
3. JSON parser/serialization
4. Qt/QML UI prototype
5. SQLite cache
6. secure TokenStore implementation
7. packaging strategy spike

验证结果：

- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 build/dist/node_modules/cpp-app/build 或其他构建产物。

## 2026-07-05：C++ cross-platform skeleton 第一批（SDK / CMake / smoke CLI）

结论：从零创建 `cpp-app/`，完成 C++ cross-platform prototype skeleton 第一批。范围严格限定为 SDK/架构骨架、CMake、平台路径抽象、TokenStore 接口和最小 smoke binary；**未开发正式 UI、未实现真实 HTTP、未改 Web/API 行为、未改数据库、未部署、未 push**。

完成内容：

- 新建 `cpp-app/` 目录结构：
  - `CMakeLists.txt`、`CMakePresets.json`、`README.md`
  - `cmake/`、`include/`
  - `src/main.cpp`
  - `sdk/core/`、`sdk/network/`、`sdk/models/`、`sdk/cache/`、`sdk/download/`
  - `app/platform/`、`app/ui/`
  - `tests/unit/`
  - `packaging/windows/`、`packaging/macos/`、`packaging/linux/`
- CMake：
  - 默认只构建 `mrright_cpp_smoke` CLI smoke binary，不引入 Qt UI。
  - `CMakePresets.json` 包含 `debug`、`release`、`relwithdebinfo`。
  - `ctest` 注册 smoke test（后续 CI 可直接跑 configure + build + test）。
- SDK model headers（来自 `docs/openapi/api-v1.yaml` 与 `docs/API_V1_MODEL_MAPPING.md`）：
  - `ApiError.hpp`、`Pagination.hpp`、`ResponseEnvelope.hpp`
  - `User.hpp`、`Profile.hpp`、`Project.hpp`
  - `Asset.hpp`、`CommunityPost.hpp`、`Comment.hpp`、`DownloadRequest.hpp`
  - nullable 使用 `std::optional`，array 使用 `std::vector`，datetime 暂用 ISO-8601 `std::string` 占位；README 说明后续再决定 `std::chrono` 或 Qt 边界类型。
  - `Asset` 明确标注 aspirational target model：受控 `downloadUrl`、`checksum`、`mimeType`、`etag` 等字段尚未由 API 完整实现。
  - 未把 admin-only model 放入 SDK public surface。
- SDK core/network interfaces：
  - `ApiResult.hpp`：Result-style 返回，不把 exception 作为主路径。
  - `ApiClient.hpp`：默认 base path 为相对 `/api/v1`，不硬编码生产域名。
  - `AuthClient.hpp`、`ProjectClient.hpp`、`CommunityClient.hpp`、`AssetClient.hpp`：只定义最小 stub，不发真实 HTTP。
  - `HttpClient.hpp`：网络抽象 + `NullHttpClient`，真实 backend 后续实现。
  - `TokenStore.hpp`：只定义接口；注释明确未来使用 Windows Credential Manager、macOS Keychain、Linux Secret Service 或显式加密文件降级；禁止普通配置文件明文存 token。
  - `ApiError` 保留 raw `code` 字符串，同时映射到 enum；未知错误码落 `ApiErrorCode::Unknown`。
- 平台路径抽象：
  - `app/platform/AppPaths.hpp/.cpp` 定义 `configDir()`、`cacheDir()`、`dataDir()`、`logDir()`、`downloadDir()`、`tempDir()`。
  - Windows/macOS/Linux 使用条件编译占位；当前基于 HOME/XDG/APPDATA/LOCALAPPDATA 的安全占位，不写死 Windows-only 路径。
  - README 说明后续替换为 Qt StandardPaths 或平台原生 API。
- `src/main.cpp`：
  - 打印 SDK skeleton 名称和版本。
  - 构造 `Pagination` / `ApiError` / `ResponseEnvelope` 示例。
  - 不联网、不读取 secret。

验证结果：

- `c++ -std=c++20 -Wall -Wextra -Wpedantic -Icpp-app cpp-app/src/main.cpp cpp-app/app/platform/AppPaths.cpp -o /tmp/mrright_cpp_smoke && /tmp/mrright_cpp_smoke`：通过。
- 本地 `cmake --version`：失败（当前环境无 `cmake` 命令），因此未执行正式 `cmake -S cpp-app -B cpp-app/build -DCMAKE_BUILD_TYPE=Debug` / `cmake --build cpp-app/build`。未安装新依赖；README 已记录后续本地/CI 验证方式。
- `git diff --check`：通过。
- `npm run lint`：通过。
- `npm run build`：通过（`dist/` 构建产物已还原，未提交）。
- `npm run test:api`：通过（37 passed）。
- `npm run test:api:db`：通过（18 passed，一次性 PostgreSQL cluster 已销毁）。

修改文件：

- `cpp-app/`（新建）
- `docs/CPP_APP_MIGRATION_PLAN.md`
- `PROJECT_PROGRESS.md`

仍未实现 / 后续待办：

1. OpenAPI 自动校验工具接入
2. C++ HTTP backend
3. Qt/QML UI prototype
4. SQLite cache
5. secure TokenStore implementation
6. CI build matrix
7. packaging strategy spike

安全说明：

- 未部署 VPS、未 push GitHub。
- 未读取、修改或输出 `.env`、ADMIN_TOKEN、DATABASE_URL、token、secret。
- 未连接或修改数据库。
- 未改 Web/API 行为。
- 未提交 build/dist/node_modules 或 C++ build 产物。

## 2026-07-05：OpenAPI v1 初稿 + C++ SDK model mapping 抽取（freeze checklist #9/#10 初稿）

结论：把已被 `tests/api/contract.spec.js`/`tests/api/contract.db.spec.js` 锁住的 `/api/v1` strict envelope 契约，沉淀为正式 OpenAPI 规范初稿与 TS/C++ model mapping 文档。纯文档/契约抽取批次，**零 API 行为改动、零 C++ 代码、零 C++ UI**。

完成内容：

- 新建 `docs/openapi/api-v1.yaml`（OpenAPI 3.0.3）：
  - 38 paths / 42 operations，`servers` 均以 `/api/v1` 为 base path。
  - 覆盖 Health、Auth（register/login/logout/verify-email/resend-verification/me）、Projects（含 interactions/like/comments/download-requests）、Account（profile 读写、avatar/banner multipart 上传、community/downloads/comments 只读、删除 upload/post）、Community（posts/uploads 读写、comments、like、delete）、Users（profile/resources/posts/activity）、Contact；另加 4 个代表性 Admin 端点（summary、visitors 分页列表、visitor 详情、profile-visibility）演示 Web-only 边界。
  - 全部端点仅取自 `server/index.js` 真实路由 + 已被 contract 测试或 `src/lib/api.js` 实际消费的形状；不确定字段（如 `community/comments/:id/like` 精确返回 key、`account/comments` 行形状、`Project.downloadPolicy` 未来枚举）在 spec 中留白/注明，转记到新建的 `docs/API_V1_GAPS.md`，**不编造**。
  - `components.schemas.ApiErrorCode.enum`（27 个）与 `server/responses.js` 的 `API_ERROR_CODES` 用一次性脚本比对：逐一致，零缺失零多余。
  - 全部 admin operation 显式 `x-cpp-sdk: false`，独立 tag `Admin (Web-only)`；`adminToken` security scheme 的 description 明确写"SDK 不得实现或存储此凭证"。
  - strict envelope 规则在 `ResponseEnvelope`/`ErrorEnvelope` schema 中硬编码：顶层仅 `data`/`pagination`/`error`（`additionalProperties: false`）。
- 新建 `docs/API_V1_GAPS.md`：记录 7 类缺口——(1) 缺 DB-backed sample 的端点、(2) admin 路由未逐条枚举的清单与理由、(3) Asset/download 字段按上传类型的逐字段缺失对照表（checksum/mimeType/downloadUrl 等）、(4) `Project.downloadPolicy` 尚非冻结枚举、(5) pagination 缺口清单（与 freeze 文档 §8 一致）、(6) token 生命周期未定（freeze checklist #5）、(7) 刻意排除在 C++ SDK 外的端点边界（admin）。
- 新建 `docs/API_V1_MODEL_MAPPING.md`：
  - Web `normalizeApiPayload` 与 strict v1 envelope 关系说明（结论：该函数隐含依赖 legacy 顶层镜像做兼容展开，未针对纯 strict payload 验证过；Web 暂不切 v1，本轮不改前端代码）。
  - TypeScript 类型草图（`ApiResponse<T>`/`ApiError`/`Pagination`/`User`/`AccountProfile`/`Project`/`Asset`/`CommunityPost`/`Comment`/`DownloadRequest`/`UploadError`）——仅文档参考，不引入 TS 编译，不迁移前端。
  - C++ struct 草图（`ResponseEnvelope<T>`/`ApiError`+`ApiErrorCode` enum/`Pagination`/`User`/`AccountProfile`/`Project`/`Asset`(aspirational，标注未实现)/`CommunityPost`/`Comment`/`DownloadRequest`/`LocalAsset`/`DownloadTask`/`SyncStatus`），字段与 OpenAPI schema 一一对应。
  - 字段类型映射表（string/number/boolean/ISO datetime/nullable/array/object → JS/TS/C++ 三栏对照）。
  - 明确写死：SDK 不依赖 legacy 顶层镜像字段、不消费 admin 端点。
  - upload/download 错误 → `Result<T, ApiError>` 映射表；pagination → `PageRequest`/`Pagination` 请求响应模型映射；asset cache 仍缺失字段清单（与 API_V1_GAPS.md 交叉引用）。
- 更新 `docs/API_V1_FREEZE_PLAN.md`：§18/§19 补"已实现"说明；§21 checklist #9/#10 从 ❌ 改为 🟡（初稿完成，CI 自动漂移检测与"定稿"状态仍未达成，原因已注明）；关联文档列表补三个新文件。
- 更新 `docs/CPP_APP_MIGRATION_PLAN.md`：关联文档列表补三个新文件并注明 C++ Prototype 应从 model mapping 文档的 struct 草图开始而非重新设计；§22 优先级列表逐项标注当前完成状态（1/2 已完成，5/6 部分完成并注明剩余缺口，3/4 仍未开始）。

哪些接口进入了 `/api/v1`（C++ SDK public surface，`x-cpp-sdk: true`）：

- Health/Auth/Projects/Account/Profile Upload/Community/Users/Downloads/Contact 全部公开只读与已鉴权写接口，共 38 个 operation。

admin 是否进入 v1 SDK：**否**。`/api/v1/admin/*` 机械可达（双挂载天然覆盖）且 strict envelope 生效，但认证方式是 Web-only 静态 `ADMIN_TOKEN`，与 C++ App 使用的 visitor bearer token 完全不同凭证体系；spec 中所有 admin operation 标 `x-cpp-sdk: false`，SDK 的 `ApiClient` 不应实现任何 admin 方法。

C++ SDK model mapping 核心结论：

- 一个 JSON 形状对应一个 struct，不做客户端侧改名；`std::optional` 表达缺失字段，未知 JSON key 忽略（前向兼容），未知 `error.code` 落 `ApiErrorCode::Unknown` 且保留原始字符串。
- 统一 Asset Model 仍是"目标形状"而非"现状"——`Asset` struct 标注 aspirational，所有新字段（checksum/mimeType/downloadUrl/version/etag）在 SDK 落地前必须先等 freeze checklist #6/#7 完成。
- `Project` 暂无独立于 `slug` 的稳定 `id`；受控下载端点 `GET /api/v1/assets/:id/download` 尚未实现，SDK 的 `DownloadManager`/`CacheManager` 设计需以 `docs/API_V1_GAPS.md` §3/§8 的缺口表为起点，而非假设字段已存在。

仍缺哪些字段/sample（详见 `docs/API_V1_GAPS.md`）：

1. `community/comments/:id/like`、`account/comments` 的精确响应形状缺 DB-backed 断言。
2. Asset 统一模型：checksum、mimeType、downloadUrl、version、etag 全部端点均未populate。
3. `Project.downloadPolicy` 仍是自由文本，非冻结枚举。
4. 6 类公共列表端点仍无真实分页（与 freeze 文档 §8 待办一致）。
5. token 生命周期（过期/刷新/多设备）未定义（freeze checklist #5）。

修改文件：

- docs/openapi/api-v1.yaml（新建）
- docs/API_V1_MODEL_MAPPING.md（新建）
- docs/API_V1_GAPS.md（新建）
- docs/API_V1_FREEZE_PLAN.md
- docs/CPP_APP_MIGRATION_PLAN.md
- PROJECT_PROGRESS.md

commit：docs(api): extract v1 openapi and sdk model mapping（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（dist/ 构建产物已还原，未提交）
- npm run test:api：通过（38 passed，无 API 行为改动）
- npm run test:api:db：通过（18 passed，一次性集群已销毁）

OpenAPI 校验方式说明（未新增重量级依赖）：用项目已有的传递依赖 `js-yaml` 写了一次性脚本（`scripts/validate-openapi-tmp.mjs`，运行验证后已删除，未提交），确认：YAML 可解析、全部 `$ref` 可解析、`ApiErrorCode` 枚举与 `API_ERROR_CODES` 逐一致（27/27，零缺失零多余）。未安装 OpenAPI validator 类重量依赖。

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：本轮未连接、未修改任何数据库（含测试用一次性集群，仅复用既有 test:api:db 基础设施跑现有用例，未新增数据库写操作）。

待办事项（下一批，按优先级，延续 freeze checklist）：

1. OpenAPI CI 自动漂移检测接入（checklist #9 剩余部分——把本轮的一次性人工校验脚本变成可重复运行的 CI 步骤）
2. token storage 与 refresh 策略评估并文档化（checklist #5）
3. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
4. 公共列表 pagination 补齐方案（checklist #8）
5. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，完成后 1–5+11 齐备可宣告 freeze）
6. C++ SDK `sdk/core/models/*.h` 真实头文件骨架（本轮只有 markdown struct 草图，非可编译代码）
7. cpp-app/ 骨架 + 三平台 CI matrix
8. packaging strategy spike

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未改任何 API 行为（server/index.js、server/responses.js 均未改动，仅新增/修改文档）。
- 本轮未开发任何 C++ 代码或 C++ UI（仅 markdown 中的 struct 草图，非可编译产物，无 cpp-app/ 目录生成）。
- 本轮未提交 dist/ 或任何构建产物；临时验证脚本 `scripts/validate-openapi-tmp.mjs` 与临时 package.json script 均已在提交前删除/还原，未进入 git 历史。

## 2026-07-04：修复 avatar/banner upload 文件类型错误分类 bug（freeze 前错误码一致性）

结论：确认并修复 bug——avatar/banner 非法文件类型真实触发时会被误分类为 `INTERNAL_ERROR` 500，而非契约要求的 `INVALID_FILE_TYPE` 400。此风险在 2026-07-03 的技术备注中已记录（见下方历史记录），本轮排查确认属实并修复。不改任何业务行为，只修正错误分类；community/admin 上传现有行为不变。

Bug 确认：

- server/index.js 中两处 `fileFilter`：
  - 通用上传（community/admin，line ~138）拒绝时抛 `new Error('Unsupported file type.')`。
  - profile 头像/封面上传（`createProfileImageUpload`，line ~162）拒绝时抛 `new Error('Only JPG, PNG, and WebP images are allowed.')`——消息不同。
- server/responses.js 的 `describeUploadError` 此前只按 `error.message === 'Unsupported file type.'` 匹配，avatar/banner 分支永远匹配不到，`next(error)` 落到 index.js 末尾的 INTERNAL_ERROR 兜底 → 500，而不是 400 INVALID_FILE_TYPE。

修复方式：

- 不再依赖脆弱的 message 字符串。两处 `fileFilter` 拒绝时均附加稳定 `error.code = 'INVALID_FILE_TYPE'`（与 `API_ERROR_CODES.INVALID_FILE_TYPE` 同值），消息文案本身不变（仍分别是各自原有的用户可读文案）。
- `describeUploadError` 判定顺序调整为：MulterError 分支不变 → 新增 `error.code === 'INVALID_FILE_TYPE'` 判定（优先）→ 原 message 字符串匹配降级为兜底（保留，避免其他未打 code 的调用方漏判）。
- community/admin 上传现有行为逐字节不变（同一 error.code 命中同一分支，仍输出 400 + 原消息）。
- strict `/api/v1/*` 下该错误同样只输出 data/pagination/error 三个顶层键（复用 checklist #4 的 response mode 机制，未新增代码路径）。

新增测试：

- tests/api/contract.spec.js（+1 单测，37→38 total）：`describeUploadError` 对携带 `error.code = 'INVALID_FILE_TYPE'` 但消息文案不同（avatar/banner 文案）的错误正确分类，独立于 message 字符串。
- tests/api/contract.db.spec.js（+4 用例，14→18 total）：
  - avatar 非法文件类型 → legacy `/api/account/avatar` 400 INVALID_FILE_TYPE（非 500/INTERNAL_ERROR，`error` 非字符串）。
  - avatar 非法文件类型 → strict `/api/v1/account/avatar` 顶层仅 data/pagination/error，`error.code === INVALID_FILE_TYPE`。
  - banner 同上两条（legacy + strict v1）。
  - 均为端到端真实 multipart 触发（复用既有 DB-backed 环境，无需新增 fixture）。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- tests/api/contract.db.spec.js
- docs/API_V1_FREEZE_PLAN.md（§12 补已修复说明）
- PROJECT_PROGRESS.md

commit：fix(api): classify profile upload file type errors（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（dist/ 构建产物已还原，未提交）
- npm run test:api：通过（38 passed）
- npm run test:api:db：通过（18 passed，一次性集群已销毁）

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：仅 test:api:db 在临时目录一次性集群内写测试数据（含本轮新增的 avatar/banner 非法文件上传探针），跑完销毁。未连接、未修改生产库。

待办事项（下一批，按优先级，延续 freeze checklist）：

1. token storage 与 refresh 策略评估（checklist #5）
2. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
3. 公共列表 pagination 补齐方案（checklist #8）
4. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，完成后 1–5+11 齐备可宣告 freeze）
5. OpenAPI / typed client 抽取 + CI 漂移检测
6. C++ SDK data model extraction
7. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
8. CI build matrix 规划
9. packaging strategy spike

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未改任何业务行为，只修正错误分类逻辑（fileFilter 拒绝仍是同样的拒绝，仅错误对象多了一个 code 属性；describeUploadError 输出的 HTTP status/code 语义未变，只是让 avatar/banner 路径命中正确分支）。
- 本轮未混入 OpenAPI / C++ SDK / 新功能改动。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-04：/api/v1 双挂载 + strict envelope（无镜像）+ 反向镜像断言 — freeze checklist #4 完成

结论：`/api/v1/*` 稳定入口上线。`/api/*` 保持 legacy-compatible（顶层 data 镜像 + code/message 兼容镜像，Web 前端零影响）；`/api/v1/*` 使用 strict envelope，顶层键固定为 data/pagination/error 三个，成功与失败一致。两前缀共用同一 handler（URL-rewrite 双挂载），零业务复制、零行为分叉。C++ App 未来只消费 `/api/v1/*`。上一轮待办第 1 项完成。

实现方式：

- server/index.js：在 `express.json` 之前注册 v1 rewrite 中间件——命中 `^/api/v1(?=/|?|$)` 的请求打 `request.apiVersion = 'v1'` 标记并把 `request.url` 重写为 `/api/...`，之后走既有全部路由（含 upload 错误中间件与 REQUEST_BODY_INVALID/INTERNAL_ERROR 兜底）。`originalUrl` 保留 v1 前缀供日志。非精确前缀（如 `/api/v1x...`）不重写。这是本轮唯一 server/index.js 改动，无 handler 复制、无大重构。
- server/responses.js：`sendData/sendPage/sendError` 检测 `response.req.apiVersion === 'v1'` 走 strict 分支——不做 `withLegacyData` 顶层展开、不带顶层 code/message；分页对象原样保留在 envelope `pagination`，`items`/`visitors` 等 legacy 键不上顶层；runtime contract 校验以 `allowCompatibilityKeys=false, allowLegacyKeys=false` 运行。legacy 分支代码路径与行为完全不变。
- 进入 v1 的接口：全部 `/api/*` 路由自动获得 v1 别名（health、profile、projects+interactions、community、auth、account、users、download-requests、contact、experience、admin、uploads）。
- admin 边界结论：`/api/v1/admin/*` 因双挂载机械可达且 strict envelope 生效，但 admin 是 Web-only 面（静态 ADMIN_TOKEN 认证），**不属于 C++ App 可依赖的 v1 公开契约**；C++ SDK 不得调用 admin 端点。已写入 freeze 文档 §3。

反向镜像断言（防止 legacy mirror 回流 v1 / v1 模式误伤 legacy）：

- tests/api/contract.spec.js 新增 8 用例（28 → 36）：`expectReverseMirror` helper 对同一路径同时请求两前缀，断言 legacy 侧必须保留顶层镜像键、v1 侧顶层 keys 精确等于 `[data, error, pagination]`（`Object.keys` 排序全等）、两侧 data deep-equal（同 handler 无漂移）、status 一致。覆盖：health（ok/service）、projects、profile/experience/community/users-activity 只读、404 PROJECT_NOT_FOUND（code/message 镜像不入 v1）、503 SERVICE_UNAVAILABLE、contact 成功 201 + VALIDATION_ERROR 400、v1 malformed JSON → strict REQUEST_BODY_INVALID（验证中间件先于 body parser）、admin 401 strict envelope、`/api/v1x...` 非精确前缀不被重写。
- tests/api/contract.db.spec.js 新增 2 用例（12 → 14）：真实 `sendPage` 分页（admin/visitors limit=1、visitor posts 子分页）在 v1 下六字段 pagination 原样保留、顶层无 visitors/items 镜像、与 legacy 侧 pagination/data deep-equal。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- tests/api/contract.db.spec.js
- docs/API_V1_FREEZE_PLAN.md（§3 补已实现说明；§21 checklist #4 置 ✅）
- docs/CPP_APP_MIGRATION_PLAN.md（十大问题表 #2、#6 置已修复）
- PROJECT_PROGRESS.md

commit：refactor(api): add strict v1 envelope routes（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（dist/ 构建产物已还原，未提交）
- npm run test:api：通过（36 passed）
- npm run test:api:db：通过（14 passed，一次性集群已销毁）

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：仅 test:api:db 在临时目录一次性集群内写测试数据，跑完销毁。未连接、未修改生产库。

待办事项（下一批，按优先级）：

1. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档；checklist #5）
2. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
3. 公共列表 pagination 补齐方案（checklist #8）
4. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，完成后 1–5+11 齐备可宣告 freeze）
5. OpenAPI / typed client 抽取 + CI 漂移检测
6. C++ SDK data model extraction（从冻结表映射 struct 草案）
7. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
8. CI build matrix 规划（GitHub Actions win/mac/linux）
9. packaging strategy spike（NSIS / dmg+notarization / AppImage）

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未改任何业务行为/auth/权限判定（仅 API mounting + response mode + tests + docs；legacy /api/* 响应字节级不变）。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-03：DB-backed contract tests（一次性 PostgreSQL）— freeze checklist #2/#3 完成

结论：新增 `npm run test:api:db` DB-backed contract 套件（12 用例全通过），锁定此前不可达的三类路径：admin 200 成功形状 + 真实 sendPage pagination、真实 multipart multer 错误端到端、store 存在时的 AUTH_REQUIRED(401)。上一轮待办第 1、2 项完成（原 #1 admin 200 与 #2 upload E2E 合并在同一 suite），并顺带补掉历史遗留的"store 存在时 401 路径"。

完成内容：

- scripts/run-api-db-tests.mjs（新建）：一次性 PostgreSQL provisioner。
  - 未提供 `API_TEST_DATABASE_URL` 时：用本机 PostgreSQL 二进制（PG_TEST_BIN → /usr/lib/postgresql/<v>/bin → PATH）在 os.tmpdir 临时目录 `initdb` 一次性集群（loopback、随机空闲端口、trust auth、fsync=off；root 环境经 `su postgres` 执行），`createdb mrright_api_contract_test`，跑完 `pg_ctl stop -m immediate` 并删除整个集群目录。
  - 提供 `API_TEST_DATABASE_URL`（CI service container 场景）时直接使用，不 provisioning、不 teardown。
  - 双层安全闸（脚本与 suite 各自独立校验）：库名必须含 test/e2e/local/dev，且不得含 `mrright_portfolio`；不读取、不复用生产 DATABASE_URL。
- tests/api/contract.db.spec.js（新建，12 用例）：
  - seed 只经公开 API（register → verify-email devCode → login → community post → contact），不写直连 SQL；schema 由 server 启动 ensureSchema 自建；ADMIN_TOKEN 为进程内随机 throwaway 值，不落日志。
  - admin 200：summary / visitors 列表（pagination 六字段 hasNext/hasPrevious/limit/page/pages/total 精确断言 + limit=1 分页数学）/ visitor 详情 / 5 个详情子分页（items + 真实 pagination）/ 8 个列表端点（legacy 镜像 deep-equal，含 seed 数据非空断言）。
  - admin 写：PATCH profile-visibility 404 VISITOR_NOT_FOUND envelope + 对测试 visitor 的 disable→restore 200 往返（profileAdminDisabled 断言）。
  - store 存在时鉴权：错误 admin token → 401 ADMIN_AUTH_REQUIRED；/api/account/profile|downloads|comments 未登录 → 401 AUTH_REQUIRED（历史遗留补测）；登录后 profile → 200。
  - 真实 multer 错误 E2E：3MiB jpg 上传 avatar（限 2MiB）→ 413 FILE_TOO_LARGE envelope；.txt 上传 community uploads → 400 INVALID_FILE_TYPE envelope（error 非字符串）。
  - 无 `API_TEST_DATABASE_URL` 时整个文件 test.skip，不报错。
- playwright.api.db.config.js（新建）：独立 config，workers=1（共享 server + seed fixture）。
- playwright.api.config.js：`testIgnore: '**/contract.db.spec.js'`，`npm run test:api` 保持无 DB 基线。
- package.json：新增 `test:api:db` 脚本。
- docs/API_V1_FREEZE_PLAN.md：§17 补已实现说明；§21 checklist #1（上轮已完成的 INTERNAL_ERROR 兜底）、#2、#3 置 ✅。

修改文件：

- scripts/run-api-db-tests.mjs（新建）
- tests/api/contract.db.spec.js（新建）
- playwright.api.db.config.js（新建）
- playwright.api.config.js
- package.json
- docs/API_V1_FREEZE_PLAN.md
- PROJECT_PROGRESS.md

commit：test(api): add db-backed contract suite with disposable postgres（最终 hash 以 git log 为准）

build/lint/test 结果：

- npm run lint：通过
- npm run build：通过（dist/ 构建产物已 git restore/clean 还原，未提交）
- npm run test:api：通过（28 passed，基线不受影响）
- npm run test:api:db：通过（12 passed，一次性集群已销毁）
- git diff --check：通过

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

数据库说明：所有写操作仅发生在临时目录内一次性集群的 mrright_api_contract_test 库（seed 2 个测试 visitor、1 条社区帖、1 条联系消息、1 次 profile_admin_disabled 翻转并还原），测试结束整个集群目录已删除。未连接、未修改生产库。

待办事项（下一批，按优先级）：

1. /api/v1 双挂载 + 无镜像模式 + 反向镜像断言（freeze checklist #4）
2. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档；checklist #5）
3. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全（checklist #6/#7）
4. 公共列表 pagination 补齐方案（checklist #8）
5. §7 错误码表与 API_ERROR_CODES 一致性复核（checklist #11，1–5+11 齐后可宣告 freeze）
6. OpenAPI / typed client 抽取 + CI 漂移检测
7. C++ SDK data model extraction（从冻结表映射 struct 草案）
8. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
9. CI build matrix 规划（GitHub Actions win/mac/linux，第一 commit 起；test:api:db 可用 postgres service container 直接接入）
10. packaging strategy spike（NSIS / dmg+notarization / AppImage 各走通一次）

技术备注（非本轮改动，供后续参考）：avatar/banner 的 fileFilter 错误消息（'Only JPG, PNG, and WebP images are allowed.'）不匹配 describeUploadError 的 'Unsupported file type.' 分支，会落到 INTERNAL_ERROR 500 而非 INVALID_FILE_TYPE 400；如需修正属 additive 语义微调，建议并入 checklist #11 复核时一起处理。

安全说明：

- 本轮未部署 VPS、未 push GitHub、未连接或修改生产数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret（测试用 ADMIN_TOKEN 为随机 throwaway 值，仅存在于测试进程内存）。
- 本轮未修改任何 server 业务代码/auth/admin/token 判定逻辑（仅测试、脚本与配置）。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-03：INTERNAL_ERROR / unhandled API errors envelope 兜底（freeze 前唯一服务端小改动）

结论：/api/* 未捕获异常与 JSON body parse 错误全部收敛到统一 envelope，Express 默认 HTML 500 不再可达。上一轮待办第 1 项完成。

完成内容：

- server/responses.js：API_ERROR_CODES 新增两个错误码（与 freeze 文档 26+1 冻结表对齐）：
  - `INTERNAL_ERROR`（未捕获 API 异常 → HTTP 500）
  - `REQUEST_BODY_INVALID`（JSON body parse 失败 → HTTP 400）
- server/index.js：在既有 upload error middleware 之后、express.static/SPA fallback 之前新增最终 API error-handling middleware：
  - 仅对 path 为 `/api` 或 `/api/*` 的请求生效；非 API 请求 `next(error)` 落回 Express 原有行为，静态资源与 SPA fallback 不受影响。
  - express.json 抛出的 parse 错误（`type === 'entity.parse.failed'` 或带 body 的 SyntaxError/400）→ `sendError(response, REQUEST_BODY_INVALID, ..., 400)`。
  - 其余未捕获错误 → server-side `console.error`（含完整 error/stack，仅落日志）+ `sendError(response, INTERNAL_ERROR, 'Internal server error.', 500)`；响应体不含 stack trace、SQL、路径等内部细节。
  - `headersSent` 时委托给 Express 默认处理，避免二次写响应。
  - 不改动既有 upload/multer error middleware（describeUploadError 命中仍优先返回 FILE_* envelope）。
- server/index.js：新增测试专用路由 `/api/__test__/throw`（同步 throw），仅 `NODE_ENV === 'test'` 时注册，production 不存在；代码注释注明仅供 contract test 使用。
- tests/api/contract.spec.js：主测试服务器改为 `NODE_ENV: 'test'` 启动；第二个服务器（admin 授权套件）显式 `NODE_ENV: 'production'`。新增 3 个测试（25 → 28）：
  1. malformed JSON POST /api/contact → 400 + data === null + pagination 为对象 + error.code === REQUEST_BODY_INVALID + error.message 非空 + error 非字符串。
  2. GET /api/__test__/throw（test 模式）→ 500 + INTERNAL_ERROR envelope + raw body 断言不含 stack 帧（`    at `）、原始错误文本、`server/index.js` 路径、HTML。
  3. GET /api/__test__/throw（production 模式服务器）→ 非 500 且不含 INTERNAL_ERROR，证明测试路由未在 production 注册。

非 API 行为确认：

- 静态资源仍由 `express.static(distDir)` 处理，未变。
- SPA fallback 仍 `sendFile(distIndexPath)`，未变。
- 非 /api/* 错误不强制 envelope（next(error) 透传）。
- /api/health 仍返回 envelope（contract test 覆盖，未变）。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- PROJECT_PROGRESS.md

commit：refactor(api): envelope unhandled API errors（最终 hash 以 git log 为准）

build/lint/test 结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过（构建产物 dist/ 已 git restore 还原，未提交）
- npm run test:api：通过（28 passed）

是否部署 VPS：否。

验证接口状态：未涉及线上，无变化。

待办事项（下一批，按优先级）：

1. DB-backed admin 200 contract tests（一次性 PostgreSQL，绝不指向生产库）
2. DB-backed real upload multer error E2E（FILE_TOO_LARGE / INVALID_FILE_TYPE 端到端）
3. /api/v1 双挂载 + 无镜像模式 + 反向镜像断言
4. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档）
5. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全
6. OpenAPI / typed client 抽取 + CI 漂移检测
7. C++ SDK data model extraction（从冻结表映射 struct 草案）
8. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
9. CI build matrix 规划（GitHub Actions win/mac/linux，第一 commit 起）
10. packaging strategy spike（NSIS / dmg+notarization / AppImage 各走通一次）

安全说明：

- 本轮未部署 VPS、未 push GitHub、未修改数据库。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未修改 auth/admin/token/db 判定逻辑。
- 本轮未提交 dist/ 或任何构建产物。

## 2026-07-03：C++ 跨平台迁移前架构审查 + API v1 freeze 文档化

结论：纯文档轮次，零代码/零 API 行为改动。三项状态标记：

1. **API envelope migration 已完成**（2026-07-02 审计确认，全部业务路由经 sendData/sendPage/sendError，25 contract 测试通过）。
2. **当前进入 API v1 freeze 文档化阶段**（freeze 规范已定稿，freeze 本身未宣告，见 docs/API_V1_FREEZE_PLAN.md §21 checklist）。
3. **C++ App 迁移目标已升级为跨平台客户端**：Windows 10/11 / macOS (Apple Silicon + Intel) / Linux x86_64 三端 P0，从第一版起为架构约束（SDK、缓存、路径、token、下载、日志、打包、CI、3D viewer 全部按三端一致性设计），不是后期移植。

完成内容：

- 项目重新定位：以稳定 API 契约为核心的 3D 内容/资源/社区/账号权限平台；Web 负责展示、社区、账号中心与 admin；API 承载全部权限与分发决策；C++ 跨平台 App 负责高性能资源消费（模型查看、下载、本地缓存、离线库）。不是"用 C++ 重写网站"。
- 现有架构评分 7/10；识别十大问题，最高优先级三项：
  1. /uploads 为 express.static 公开直出，downloadPolicy 未在文件层执行（需受控下载端点 + Range/ETag）；
  2. 无 /api/v1 版本前缀；
  3. 未捕获异常仍落 Express 默认 HTML 500（无 INTERNAL_ERROR envelope 兜底，2026-07-02 待办复核确认未完成）。
- API v1 freeze 规范定稿：/api/v1 双挂载策略（v1 下不带 legacy 顶层镜像）、envelope/success/error 规范、26+1 错误码冻结表（含待实现 INTERNAL_ERROR）、pagination 六字段规范与补齐清单、auth token 生命周期决策项、permission/downloadPolicy 枚举化、Asset Model（含 checksum/downloadUrl）、upload 错误规范、additive-only 兼容策略、deprecation 策略、DB-backed contract test 方案、OpenAPI 漂移检测策略、C++ SDK model 映射规则、freeze 前 11 项 checklist。
- C++ 迁移五阶段路线图：Phase 1 API v1 freeze → Phase 2 三平台 prototype（登录/token 安全存储/项目/受控下载/缓存/日志，三平台 CI 第一 commit 起全绿）→ Phase 3 跨平台 3D viewer（GLB + Qt RHI）→ Phase 4 打包（NSIS/.dmg+notarization/AppImage）→ Phase 5 离线+同步。
- 技术栈结论：Qt 6.8 LTS + Qt Quick/QML；CMake + CMakePresets；vcpkg（manifest）；Qt Network（藏于可替换 HttpBackend 接口后）；SQLite + content-addressed 文件缓存；3D 走 Qt RHI（Quick 3D 起步）；tinygltf 起步（服务端统一转 GLB）、Assimp 后置；手写 C++ SDK（OpenAPI 仅作 spec/漂移检测）；QtKeychain（Credential Manager/Keychain/Secret Service，加密文件仅降级）；spdlog；crashpad 推迟 Phase 4；GitHub Actions 三平台 matrix。
- 跨平台设计：AppPaths/Config/Cache/Log/Download/Temp 六 provider 三平台路径映射（AppData/LocalAppData、Application Support/Caches/Logs、XDG）；token 禁止明文落盘；构建矩阵 MSVC/Clang/GCC + Debug/Release/RelWithDebInfo；20 项跨平台风险按严重度排序并附规避策略。
- 用户补充跨平台强制要求（P0 Win/macOS/Linux、P1 Steam Deck/portable、P2 移动端不承诺）逐条核对：技术栈 10 项、目录抽象、构建/打包矩阵、SDK 解耦、10 项风险、章节与五阶段路线图均已在文档中覆盖；唯一缺口为显式 "Phase-by-phase Platform Support" 章节，已补 §20.1（各阶段 × 各平台验收矩阵 + P1 不阻塞 P0 / P2 仅架构兼容规则）。

修改文件：

- docs/CPP_APP_MIGRATION_PLAN.md（新建）
- docs/API_V1_FREEZE_PLAN.md（新建）
- PROJECT_PROGRESS.md

commit：docs(api): define v1 freeze and cross-platform cpp app plan（最终 hash 以 git log 为准）

build/lint/test 结果：见下（验证通过后回填）。

- npm run lint：通过
- npm run build：通过
- npm run test:api：通过（25 passed）

是否部署 VPS：否（纯文档，无需备份）。

验证接口状态：未涉及线上，无变化。

待办事项（下一批，按优先级）：

1. INTERNAL_ERROR / unhandled API errors envelope 兜底（确认尚未完成；唯一 freeze 前服务端小改动）
2. DB-backed admin 200 contract tests（一次性 PostgreSQL，绝不指向生产库）
3. DB-backed real upload multer error E2E（FILE_TOO_LARGE / INVALID_FILE_TYPE 端到端）
4. /api/v1 双挂载 + 无镜像模式 + 反向镜像断言
5. token storage 与 refresh 策略评估（v1 建议长效 token + 无 refresh，决策写入 freeze 文档）
6. 受控资产下载端点设计定稿（Range/ETag/checksum）+ asset/download metadata 补全
7. OpenAPI / typed client 抽取 + CI 漂移检测
8. C++ SDK data model extraction（从冻结表映射 struct 草案）
9. C++ cross-platform prototype skeleton（cpp-app/ 骨架）
10. CI build matrix 规划（GitHub Actions win/mac/linux，第一 commit 起）
11. packaging strategy spike（NSIS / dmg+notarization / AppImage 各走通一次）

安全说明：

- 本轮未部署 VPS、未 push GitHub、未修改数据库、未修改任何 API 行为或业务代码。
- 本轮未读取、修改或输出 .env、ADMIN_TOKEN、DATABASE_URL、密钥或任何 secret。
- 本轮未开发任何 C++ UI 代码（仅文档）。

## 2026-07-02：API envelope 最终审计（v1 freeze 准备）

结论：后端 API response envelope 化已完整闭环。本轮为审计 + 必要注释，无业务逻辑改动。

一、后端裸响应复查（server/index.js、server/responses.js、server/contracts）：

- `grep response.json / res.json / json({ / sendStatus / status(...).end / status(...).json`：
  - 全部业务响应均经 sendData / sendPage / sendError（内部统一 `response.status(x).json()`）。
  - 唯一 `json({` 命中为 `express.json({ limit: '96kb' })` body parser 配置，非响应。
  - 无 `sendStatus`；唯一 `.end(` 为 postgresStores.js 的 `pool.end()`（DB 连接池，非 Express response）。
- 非 API / 静态响应（保留，已加注释说明原因）：
  - `express.static(distDir, ...)` 与 SPA fallback `response.sendFile(distIndexPath)`：
    服务已构建的前端单页，不属于 API 契约，刻意不走 JSON envelope。本轮补注释说明。
  - 缓存头 setNoStoreHeaders / setStaticCacheHeaders：仅设 header，非响应体。
- `/api/health`：已用 sendData 输出 envelope（含 legacy ok/service 顶层镜像）。

二、错误码完整性复查（server/responses.js API_ERROR_CODES）：

- index.js 中所有 `sendError` 使用的 code 均存在于 API_ERROR_CODES（20 个在用）。
- 定义但当前未在 index.js 直接引用：FILE_TOO_LARGE / FILE_UPLOAD_ERROR / INVALID_FILE_TYPE
  （由 responses.js describeUploadError 使用）、INVALID_TOKEN / RATE_LIMITED（预留词表，
  保留不动，删除属 unrelated cleanup）。
- HTTP status ↔ code 语义核对：
  - 401：ADMIN_AUTH_REQUIRED、AUTH_REQUIRED
  - 403：RESOURCE_FORBIDDEN（部分）、PROFILE_ADMIN_DISABLED
  - 404：各 *_NOT_FOUND；`/api/users/:handle*` 刻意用 RESOURCE_FORBIDDEN + 404 防用户枚举
    （已有注释 server/index.js:954-958）
  - 409：HANDLE_TAKEN、PROJECT_SLUG_TAKEN
  - 413：FILE_TOO_LARGE（describeUploadError）
  - 400：VALIDATION_ERROR、FILE_UPLOAD_ERROR、INVALID_FILE_TYPE
  - 503：SERVICE_UNAVAILABLE
  - 均匹配，无语义不准的错误码复用。
  - 500：当前无显式 sendError(...,500)；未捕获异常经全局 error 中间件 `next(error)`
    落到 Express 默认处理（HTML 500）。见待办（freeze 前可加 INTERNAL_ERROR envelope 兜底）。

三、contract 测试复查（tests/api/contract.spec.js，25 用例）：

- 覆盖确认：GET 成功 envelope、GET 错误 envelope（404）、auth 错误 envelope（503）、
  visitor/community/contact 写接口 envelope（201/400/404/503）、admin 未授权 envelope（401）、
  admin 有 token 但 store 缺失（503）、upload/global error envelope（multipart 503 +
  describeUploadError 单测）、legacy 顶层字段镜像（payload.X === payload.data.X）、
  每个 payload 的 pagination 均断言为对象。
- 未新增测试：无低成本可达遗漏；剩余均为 DB 门禁路径（见待办）。

四、前端兼容性复查（src/lib/api.js、src/Admin.jsx）：

- `createApiError` 优先读 envelope `payload.error.message`，回退 legacy 字符串 →
  `payload.message` → fallback；上传错误 payload.error 由字符串变对象不影响。
- `normalizeApiPayload` 合并 data 顶层键 → legacy 顶层字段兼容。
- Admin.jsx 分页读顶层 `payload.pagination` / 子分页 pagination，sendPage 已保留，正常。
- 结论：前端无需改动。

修改文件：

- server/index.js（仅新增静态 / SPA fallback 注释，说明其刻意保留非 envelope；零逻辑改动）
- PROJECT_PROGRESS.md

验证结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，25 passed

commit：

- chore(api): audit envelope migration

待办事项（API v1 freeze 前）：

- DB-backed admin 200 contract tests：配置 DATABASE_URL 后补 admin 成功响应（200）与
  真实 pagination（sendPage）+ legacy 顶层字段镜像断言。
- DB-backed real upload multer error E2E：配置 DB + 通过 auth 门禁后，补真实 multipart
  触发 multer 错误（FILE_TOO_LARGE / INVALID_FILE_TYPE / FILE_UPLOAD_ERROR）端到端断言。
- 未捕获异常兜底：评估在全局 error 中间件为非 upload 错误加 INTERNAL_ERROR(500) envelope，
  替代当前落到 Express 默认 HTML 500 的行为（需权衡是否影响非 API 路径）。
- API v1 freeze docs：整理 envelope 契约 + 错误码表（API_ERROR_CODES）文档。
- SDK contract extraction：从 responses.js / contract 测试抽取 OpenAPI 或 typed client。
- store 缺失环境下 AUTH_REQUIRED(401) 路径补测（历史遗留）。

安全说明：

- 本轮未部署 VPS，无需备份。
- 本轮未 push GitHub。
- 本轮未修改数据库结构、登录判断、session 生成、visitor token、ADMIN_TOKEN、
  权限判定或任何生产配置（仅新增静态/ SPA fallback 注释）。
- 本轮未输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：统一错误处理收尾 — 全局 multer 上传错误 envelope 化

完成内容：

- 将 server/index.js 末尾共享的 multer / 全局上传错误中间件从裸响应
  `{ error: "字符串" }` 迁移到统一 envelope（sendError）。这是全项目最后一个
  `{ error: string }` 裸响应点，迁移后 server/index.js 已无裸 JSON 错误。
- 中间件不再直接返回 `response.status(400).json({ error })`，改为调用
  `describeUploadError(error)` 分类后走 `sendError(response, CODE, message, httpStatus)`。
- 按错误类型选用/新增语义准确的错误码（server/responses.js API_ERROR_CODES 新增）：
  - MulterError `LIMIT_FILE_SIZE` → FILE_TOO_LARGE，HTTP 413
  - 其它 MulterError（如 LIMIT_UNEXPECTED_FILE）→ FILE_UPLOAD_ERROR，HTTP 400
  - fileFilter 抛出的 `Unsupported file type.` → INVALID_FILE_TYPE，HTTP 400
  - 未匹配的错误仍 `next(error)`，行为不变（不吞其它错误）。
- 新增纯函数 `describeUploadError(error)`（server/responses.js），不 import multer，
  用 `error.name === 'MulterError'` + `error.code` 判定，便于无 DB / 无 multer 单测。
- 错误体统一为 `{ data: null, pagination: {}, error: { code, message } }`
  （含顶层 code/message 兼容镜像，与既有 sendError 一致）。
- 该中间件同时服务 community 上传、admin 上传、profile avatar/banner 上传，四处上传
  路由（/api/community/uploads、/api/admin/uploads、/api/account/avatar、
  /api/account/banner）共享同一处理，本次迁移对四处一致生效。

前端错误消费核查（未改前端）：

- src/lib/api.js 的 `createApiError` 已同时兼容 envelope（`payload.error.message`）
  与 legacy 字符串（`typeof payload.error === 'string'`），并回退 `payload.message`
  / fallbackMessage；上传 helper（uploadCommunityResource、uploadAccountImage、
  uploadAdminAsset）与 `request` 均通过 `createApiError` 构造 `error.message`。
- Admin.jsx / community 上传 / profile avatar-banner 上传均消费 `error.message`，
  不直接把 `payload.error` 当字符串展示。
- 结论：前端已通过 createApiError 兼容 error.message，无需改动，未做 UI 重构。

测试：

- tests/api/contract.spec.js：
  - 新增可达上传错误路径 contract 断言：multipart POST `/api/community/uploads`
    （无 DB，requireAuthStore 在 multer 前短路）→ 503 SERVICE_UNAVAILABLE，断言
    envelope（data===null、pagination 为对象、error.code/message 存在、
    `typeof payload.error !== 'string'`）。
  - 新增 `describeUploadError` 映射单测（直接测真实分类器，无需 DB/multipart）：
    FILE_TOO_LARGE/413、FILE_UPLOAD_ERROR/400、INVALID_FILE_TYPE/400、
    以及 null / 无关错误返回 null。
  - contract 覆盖从 20 增至 25 个用例。
- 说明：四个上传路由都在 multer 之前有 requireAuthStore/requireAdmin 门禁，无 DB
  环境下会先返回 503，真实 multer 上传错误（FILE_TOO_LARGE 等）通过路由不可达；
  故用纯函数单测覆盖真实映射逻辑，并保留可达路径（503）的 contract 断言。
  → 待办：配置 DATABASE_URL 的环境中补一条真实 multipart 触发 multer 错误的端到端断言。

修改文件：

- server/index.js（中间件迁移 + import describeUploadError）
- server/responses.js（新增 FILE_TOO_LARGE / FILE_UPLOAD_ERROR / INVALID_FILE_TYPE
  错误码 + describeUploadError 分类器）
- tests/api/contract.spec.js
- PROJECT_PROGRESS.md

验证结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，25 passed
- 全局复查：`grep -n "json({ *error:"`、`res\.json`、`response\.json` 于
  server/index.js 均无裸 JSON 错误命中（错误响应统一经 sendData/sendError/sendPage）。

commit：

- refactor(api): envelope global upload errors

待办事项：

- 配置 DATABASE_URL 的 adminStore/authStore 环境中：
  - 补 admin 真正 200 成功响应与 legacy 顶层字段镜像断言（上一批遗留）。
  - 补真实 multipart 触发 multer 上传错误（FILE_TOO_LARGE / INVALID_FILE_TYPE）的
    端到端 contract 断言（当前受门禁 + 无 DB 限制不可达）。
  - store 缺失环境下 AUTH_REQUIRED(401) 路径补测（上一批遗留）。

安全说明：

- 本轮未部署 VPS，无需备份。
- 本轮未 push GitHub。
- 本轮未修改数据库结构、登录判断、session 生成、visitor token、ADMIN_TOKEN 或
  任何权限判定逻辑（仅将上传错误响应体改为 envelope，中间件匹配范围与放行行为不变，
  MulterError LIMIT_FILE_SIZE 由 400 细化为 413 更贴合语义，非 2xx 前端行为不受影响）。
- 本轮未输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：Admin 管理接口 API envelope 迁移

完成内容：

- requireAdmin 中间件迁移到 sendError：
  - 缺 / 错 ADMIN_TOKEN → 401 ADMIN_AUTH_REQUIRED
  - adminStore 缺失 → 503 SERVICE_UNAVAILABLE
- 全部 /api/admin/* handler 的裸 response.json 迁移到 sendData/sendError，覆盖：
  - 只读列表：summary、comments、likes、contact-messages、download-requests、projects、community-uploads/posts/comments
  - 分页接口：visitors 列表、visitor 详情子分页（comments/posts/uploads/download-requests/actions）
  - 写操作：visitor access-level / email-verification / profile-visibility / profile-moderation / 删除、community-upload 状态更新与删除、community-post/comment 删除、admin 素材上传、project 创建/更新/删除、download-request 状态更新与删除、comment / contact-message 删除
- 分页接口改用 sendPage(response, data, pagination)：
  - 原因：sendData 会把 envelope 的 pagination 强制为 {}，会覆盖真实分页；admin 前端（Admin.jsx）依赖顶层 payload.pagination 做翻页。sendPage 保留真实 pagination，同时保留顶层 visitors/items legacy 镜像。
- 保留 admin 前端依赖的 legacy 顶层字段：visitors、visitor、recentActions、items、pagination、summary、file、conversion、project、upload、request、deleted、ok 等（api.js normalizeApiPayload 合并 data + 顶层，UI 读取不受影响）。
- server/responses.js 新增错误码：ADMIN_AUTH_REQUIRED、COMMENT_NOT_FOUND、CONTACT_MESSAGE_NOT_FOUND、DOWNLOAD_REQUEST_NOT_FOUND、PROJECT_SLUG_TAKEN、VISITOR_NOT_FOUND。
- 扩展 tests/api/contract.spec.js：新增 admin 用例，contract 覆盖从 15 增至 20 个用例。

修改文件：

- server/index.js
- server/responses.js
- tests/api/contract.spec.js
- PROJECT_PROGRESS.md

验证结果：

- git diff --check：通过
- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，20 passed
- admin contract 覆盖：
  - 无 Authorization 访问 admin GET / 写操作：401 ADMIN_AUTH_REQUIRED
  - 错误 token 访问 admin GET：401 ADMIN_AUTH_REQUIRED
  - 有效 ADMIN_TOKEN 但 store 缺失（独立 server，DATABASE_URL 置空）：admin GET / 写操作 503 SERVICE_UNAVAILABLE

待办事项：

- admin 真正的 200 成功响应与 legacy 顶层字段镜像断言，需要配置了 DATABASE_URL 的 adminStore 环境补测（当前无 DB，成功路径不可达）。
- server/index.js 末尾的 multer 全局错误中间件仍返回 `{ error: string }`；它被 community 上传与 admin 上传共享，不属于 /api/admin/* handler，按"仅 admin、不动 community 写"约束本批未迁移，留作后续统一错误处理批次。

安全说明：

- 本轮没有部署 VPS，无需备份。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构、登录判断、session 生成、visitor token 或 ADMIN_TOKEN 逻辑（仅将 ADMIN_TOKEN 判定失败的响应体改为 envelope，判定逻辑不变）。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：换行符规范化 + Auth/写接口 API envelope 迁移

完成内容：

- 任务 A（换行符规范化，独立提交）：
  - 新增 `.gitattributes`，统一 `*.js/.jsx/.ts/.tsx/.json/.md/.css` 为 `eol=lf`。
  - 将 `server/index.js` 由 CRLF/LF 混用规范化为纯 LF（仅换行符，零逻辑改动，`git diff --ignore-space-at-eol` 无差异）。
  - 目的：让后续 envelope 迁移 diff 可读。
- 任务 B（auth 与写操作 envelope 迁移）：
  - 认证接口迁移到 sendData/sendError：register、resend-verification、login、verify-email、logout。
  - community 写操作迁移：create post、comment create、comment like、comment delete、post/upload delete、community upload。
  - profile/account 写操作迁移：profile PUT、avatar upload、banner upload。
  - 访客交互写接口迁移：project like、project comment、download-requests、contact。
  - 错误体统一为 `{ error: { code, message } }`（含顶层 code/message 兼容），不再返回 `{ error: '字符串' }`。
  - 成功响应保持 legacy 顶层字段兼容：user、session、verification、post、comment、profile、avatarUrl、bannerUrl、upload、request、access、ok。
  - `server/responses.js` 新增错误码：COMMUNITY_COMMENT_NOT_FOUND、COMMUNITY_UPLOAD_NOT_FOUND、EMAIL_ALREADY_REGISTERED、EMAIL_ALREADY_VERIFIED、EMAIL_NOT_REGISTERED、EMAIL_NOT_VERIFIED、HANDLE_TAKEN。前端依赖的 EMAIL_NOT_VERIFIED、HANDLE_TAKEN 已保留。
  - `/api/users/:handle*` 的 RESOURCE_FORBIDDEN + 404 补充防用户枚举说明注释（刻意对"不存在/非法 handle"统一返回，不泄露 handle 是否存在）。
  - `withLegacyData` 附近补注释：data 顶层展开可能与 data/pagination/error/code/message 保留字段名碰撞，新接口需避免。
  - 扩展 tests/api/contract.spec.js：新增 postJson helper 与写/认证接口用例，contract 覆盖从 10 增至 15 个用例。

修改文件：

- .gitattributes（新增）
- server/index.js
- server/responses.js
- tests/api/contract.spec.js

commit：

- 2049d5d feat(api): migrate read endpoints to envelope（上一轮读接口迁移，本轮先独立提交）
- 2d306e8 chore: normalize line endings
- cd5c207 refactor(api): migrate auth and write responses to envelope

验证结果：

- npm run lint：通过
- npm run build：通过
- npm run test:api：通过，15 passed
- 本地 store 缺失环境 API 状态抽查：
  - POST /api/auth/register：503 SERVICE_UNAVAILABLE
  - POST /api/community/posts：503 SERVICE_UNAVAILABLE
  - POST /api/projects/:slug/comments：201（成功）/ 400 VALIDATION_ERROR / 404 PROJECT_NOT_FOUND
  - POST /api/projects/:slug/like：400 VALIDATION_ERROR / 404 PROJECT_NOT_FOUND
  - POST /api/contact：201（成功，ok:true）/ 400 VALIDATION_ERROR

待办事项：

- admin 管理接口块（约 40 个 handler，含 requireAdmin 中间件 401/503）仍为裸 response.json，尚未 envelope 化，作为下一批迁移。
- store 缺失环境下 requireAuthStore 会先于 auth 校验返回 503，未登录 AUTH_REQUIRED(401) 路径需在配置了 DATABASE_URL 的环境中补测。

安全说明：

- 本轮没有部署 VPS，无需备份。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构、登录判断、session 生成、visitor token 或 ADMIN_TOKEN 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：Auth 与 Account 只读 API envelope 迁移

完成内容：

- 继续推进 API-first response envelope 迁移，新增覆盖 auth/account 只读接口：
  - GET /api/auth/me
  - GET /api/account/profile
  - GET /api/account/community
  - GET /api/account/downloads
  - GET /api/account/comments
- 新增 requireUser() 小 helper，用于只读 account 接口统一返回 AUTH_REQUIRED envelope。
- requireAuthStore() 的 visitor account store 缺失错误迁移为 SERVICE_UNAVAILABLE envelope。
- account 只读接口成功响应继续保持 legacy 顶层字段兼容：
  - user
  - profile
  - posts
  - uploads
  - requests
  - comments
  - likeCount
- 扩展 tests/api/contract.spec.js，API contract 覆盖从 8 个用例增加到 10 个用例。

验证结果：

- npm run test:api：通过，10 passed
- npm run build：通过
- npm run lint：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/auth/me：200
  - GET /api/account/profile：503
  - GET /api/account/community：503
  - GET /api/account/downloads：503
  - GET /api/account/comments：503

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改登录判断、session 生成、visitor token 或 ADMIN_TOKEN 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：Community 公开只读 API envelope 迁移

完成内容：

- 继续推进 API-first response envelope 迁移，新增覆盖 community 公开只读接口：
  - GET /api/community/uploads
  - GET /api/community/posts
  - GET /api/community/posts/:id
  - GET /api/community/posts/:id/comments
- 保持 legacy 顶层字段兼容：
  - uploads
  - posts
  - post
  - comments
- API_ERROR_CODES 新增 COMMUNITY_POST_NOT_FOUND。
- 将 community post 详情的不存在错误迁移为 COMMUNITY_POST_NOT_FOUND envelope。
- 扩展 tests/api/contract.spec.js，API contract 覆盖从 7 个用例增加到 8 个用例。

验证结果：

- npm run test:api：通过，8 passed
- npm run build：通过
- npm run lint：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/community/uploads：200
  - GET /api/community/posts：200
  - GET /api/community/posts/not-a-real-post：404
  - GET /api/community/posts/not-a-real-post/comments：200

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 本轮没有修改 visitor token 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：公开只读 API envelope 第二批迁移

完成内容：

- 继续推进 API-first response envelope 迁移，新增覆盖低风险公开只读接口：
  - GET /api/experience
  - GET /api/projects/:slug/interactions
  - GET /api/users/:handle/resources
  - GET /api/users/:handle/posts
  - GET /api/users/:handle/activity
- 保持 legacy 顶层字段兼容：
  - experience
  - comments
  - likeCount
  - resources
  - posts
- 将 /api/projects/:slug/interactions 的项目不存在错误迁移为 PROJECT_NOT_FOUND envelope。
- 将公开用户 activity 子接口的公开主页禁用错误迁移为 PROFILE_ADMIN_DISABLED envelope。
- 扩展 tests/api/contract.spec.js，API contract 覆盖从 5 个用例增加到 7 个用例。

验证结果：

- npm run test:api：通过，7 passed
- npm run build：通过
- npm run lint：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/experience：200
  - GET /api/projects/not-a-real-project/interactions：404
  - GET /api/users/not-exist-test-handle/resources：200
  - GET /api/users/not-exist-test-handle/posts：200
  - GET /api/users/not-exist-test-handle/activity：200

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 本轮没有修改 visitor token 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：API envelope 版本提交到 GitHub

提交内容：

- 提交 API envelope/contract 第一阶段代码、文档、测试配置和进度记录。
- 同步当前分支 codex/check-project-and-fix-errors 到 GitHub。
- 首次 HTTPS push 因当前环境无 GitHub HTTPS 凭据失败，未重复提交、未 reset、未 force push。
- 已验证本机 GitHub SSH key 可用，并将 origin 改为 git@github.com:rightamen/3d-portfolio.git。
- 已通过 SSH push 成功。

提交前验证：

- npm run build：已通过
- npm run lint：已通过
- npm run test:api：已通过，5 passed
- npx playwright test tests/e2e/production-smoke.spec.js：部署后已通过，6 passed，1 skipped
- git diff --check：通过

提交信息：

- e01f721 feat(api): add response envelope contract
- 远端分支：origin/codex/check-project-and-fix-errors

安全说明：

- 本轮没有 force push。
- 本轮没有 reset。
- 本轮没有修改生产 env 文件内容。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token 或 VPS 密码。

## 2026-07-02：API envelope 版本部署到 VPS

部署内容：

- 将 API envelope/contract 第一阶段和前端兼容解析版本部署到 VPS。
- release 包：.deploy-tools/mrright-portfolio-release.tar.gz
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260702-042140
- 线上目录：/opt/mrright-portfolio
- 服务名：mrright-portfolio
- 服务状态：active

部署前验证：

- npm run build：通过
- npm run lint：通过
- npm run release:vps：通过

部署安全检查：

- ADMIN_TOKEN=[set]
- DATABASE_URL=[set]
- 未输出 env value、token、数据库密码。
- 已备份 /opt/mrright-portfolio 到 /opt/mrright-portfolio.backup-20260702-042140。
- 保留 /etc/mrright-portfolio.env、data、public/uploads、backup。
- 未修改生产数据库密码。
- 未删除数据库、表、上传文件或备份目录。

部署后验证：

- systemctl is-active mrright-portfolio：active
- local /api/health：200
- local admin_summary：200
- https://mrright.blog/api/health：200，包含 data、pagination、error envelope 字段
- remote admin_summary：200
- https://mrright.blog/admin：200
- https://mrright.blog/community：200
- https://mrright.blog/login?mode=login：200
- https://mrright.blog/account：200
- npx playwright test tests/e2e/production-smoke.spec.js：通过，6 passed，1 skipped

Skip 原因：

- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD。

回退说明：

- 当前可回退备份目录：/opt/mrright-portfolio.backup-20260702-042140
- 如需回退，应先备份当前 /opt/mrright-portfolio，再用该备份目录恢复线上目录并重启 mrright-portfolio。

安全说明：

- 本轮按用户要求部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改生产 env 文件内容。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-07-02：API envelope 自动化测试复跑

测试内容：

- 复跑 API envelope 相关自动化测试。
- 复跑本地前端页面 smoke，验证前端 API helper 可消费 envelope 响应。
- 直接校验本地 API 关键接口状态和 envelope 必填字段。

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:api：通过，5 passed
- 本地 API 服务：PORT=4194 npm run dev:server，启动成功
- 本地 Web 服务：VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174，启动成功
- npx playwright test tests/e2e/production-smoke.spec.js --grep "renders"：通过，5 passed
- 本地 API 只读状态与 envelope 字段检查：
  - GET /api/health：200
  - GET /api/profile：200
  - GET /api/projects：200
  - GET /api/projects/not-a-real-project：404
  - GET /api/users/not-exist-test-handle：404

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改业务代码，只更新自动化测试记录。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-07-02：API envelope 兼容层收尾与验证

完成内容：

- 补齐 Web 前端 API helper 的 envelope/legacy 双兼容解析：
  - 成功响应优先展开 data，保留现有调用读取 profile、projects、project 等顶层字段的方式。
  - 错误响应兼容 legacy 字符串 error 和新 envelope error.code/error.message。
  - fetch 与 XMLHttpRequest 上传路径统一使用同一套错误解析，避免新错误对象显示为 [object Object]。
- 修正文档与实现不一致：
  - 非分页响应 pagination 统一记录为 {}。
  - sendError 文档签名改为 sendError(response, code, message, status = 400)。
- 修正项目列表异常错误码：
  - API_ERROR_CODES 新增 SERVICE_UNAVAILABLE。
  - /api/projects store 异常返回 SERVICE_UNAVAILABLE 和 503，不再误用 RESOURCE_FORBIDDEN。
- 复查 API-first 文档：
  - docs/API_CONTRACT.md
  - docs/API_ERRORS.md
  - docs/ARCHITECTURE.md

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:api：通过，5 passed
- git diff --check：通过
- 本地前后端分端口 smoke：
  - PORT=4194 npm run dev:server：启动成功
  - VITE_API_BASE=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 5174：启动成功
  - npx playwright test tests/e2e/production-smoke.spec.js 使用 E2E_BASE_URL=http://127.0.0.1:5174：页面渲染 5 passed，1 个 API status 子测试失败，原因是该子测试按同源请求 /api/*，本地 Vite 与 API 分端口运行时会请求到 Vite 端口，不代表 API envelope 失败。
  - curl --noproxy '*' http://127.0.0.1:4194/api/health：返回 200 envelope。

安全说明：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 本轮没有修改 visitor token 逻辑。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-07-01：API contract 校验层与测试

完成内容：

- 新增 server/contracts/responseValidator.js：
  - validateResponseShape()
  - 校验 data、pagination、error 必填。
  - 校验错误响应必须有 error.code 和 error.message。
  - 校验 pagination 必须是对象。
  - 校验 undefined 字段。
  - 校验顶层 key 只允许 envelope、迁移期兼容 key 和声明的 legacy key。
  - 校验 legacy 顶层字段必须同时存在于 data 中。
- 在 server/responses.js 的 sendData、sendPage、sendError 中接入轻量 runtime contract 检查。
  - 校验失败只 console.warn，不阻断请求。
  - 成功响应包含 data、pagination、error:null。
  - 错误响应包含 data:null、pagination、error.code、error.message。
  - 继续保留迁移期 legacy 顶层字段，保证现有 Web 前端兼容。
- 新增 docs/API_CONTRACT.md、docs/API_ERRORS.md、docs/ARCHITECTURE.md，记录 API-first 响应 envelope、错误码、资产模型和迁移阶段。
- 新增 tests/api/contract.spec.js：
  - 启动本地 API server。
  - 验证 /api/health、/api/profile、/api/projects、/api/projects/:slug、/api/users/:handle。
  - 验证 envelope 必填字段、错误码、legacy 兼容字段和顶层 key 白名单。
- 新增 npm run test:api 脚本。

安全说明：

- 本轮没有修改业务逻辑。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 权限逻辑。
- 本轮没有修改前端 UI。
- 本轮没有修改 Three.js 渲染逻辑。
- 本轮没有新增 npm 依赖。
- 本轮没有部署 VPS。
- 本轮没有 push GitHub。

## 2026-07-01：API-first response 层最小侵入第一阶段

完成内容：

- 新增 server/responses.js 统一响应工具层：
  - sendData(response, data, httpStatus)
  - sendPage(response, data, pagination, httpStatus)
  - sendError(response, code, message, httpStatus)
  - API_ERROR_CODES 常量包含 AUTH_REQUIRED、INVALID_TOKEN、PROFILE_ADMIN_DISABLED、RESOURCE_FORBIDDEN、PROJECT_NOT_FOUND、VALIDATION_ERROR、RATE_LIMITED、SERVICE_UNAVAILABLE。
- 仅迁移低风险 API 到 response helper：
  - GET /api/health
  - GET /api/profile
  - GET /api/projects
  - GET /api/projects/:slug
  - GET /api/users/:handle
- 保持 legacy 顶层字段兼容：
  - ok
  - service
  - profile
  - skills
  - projects
  - project
- 错误响应新增 envelope error.code/error.message，同时保留迁移期顶层 code/message。

安全说明：

- 本轮没有修改业务逻辑。
- 本轮没有修改数据库结构。
- 本轮没有修改认证系统。
- 本轮没有修改 /admin 权限逻辑。
- 本轮没有修改前端 UI。
- 本轮没有修改 Three.js 渲染逻辑。
- 本轮没有新增依赖。
- 本轮没有部署 VPS。
- 本轮没有 push GitHub。

## 2026-07-01：后台访客管理 E2E 覆盖部署到 VPS

部署内容：

- 将后台访客管理 E2E 覆盖增强版本部署到 VPS。
- 部署 commit：f11546c
- release 包：.deploy-tools/mrright-portfolio-release.tar.gz
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260701-004849
- 服务名：mrright-portfolio
- 服务状态：active

部署前验证：

- npm run build：通过
- npm run lint：通过
- npm run release:vps：通过

部署安全检查：

- ADMIN_TOKEN=[set]
- DATABASE_URL=[set]
- 未输出 env value、token、数据库密码。
- 已备份 /opt/mrright-portfolio。
- 保留 /etc/mrright-portfolio.env、data、public/uploads、backup。
- 未修改生产数据库密码。
- 未删除数据库、表、上传文件或备份目录。

部署后验证：

- local /api/health：200
- local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog/admin：200
- https://mrright.blog/community：200
- https://mrright.blog/login?mode=login：200
- https://mrright.blog/account：200
- GET https://mrright.blog/api/admin/visitors 无 token：401
- GET https://mrright.blog/api/account/downloads 未登录：401
- GET https://mrright.blog/api/account/comments 未登录：401
- npx playwright test tests/e2e/production-smoke.spec.js：通过，6 passed，1 skipped
- npx playwright test tests/e2e/admin-visitors.spec.js：通过，4 passed，3 skipped

Skip 原因：

- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD。
- admin visitors 有 token API 只读测试：缺少 E2E_ADMIN_TOKEN。
- admin visitors 详情敏感字段只读测试：缺少 E2E_ADMIN_TOKEN。
- admin visitors 本地写闭环测试：生产环境按安全规则 skip。

注意：

- 本轮按用户要求部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改业务代码。
- 本轮没有修改认证系统或 /admin 权限逻辑。
- 本轮没有执行生产写测试。

## 2026-07-01：后台访客管理 E2E 闭环补全与稳定性验证

完成内容：

- 继续完善 tests/e2e/admin-visitors.spec.js，把后台访客管理从可用状态补强为可验证闭环。
- API 安全与权限覆盖增强：
  - GET /api/admin/visitors 未登录返回 401。
  - 新增 page、limit、query、sort 等筛选参数未登录请求覆盖，确认返回 401 且不报 500。
  - 有 admin token 的列表筛选和详情敏感字段检查仍保留为可选只读测试，缺少 E2E_ADMIN_TOKEN 时自动 skip。
- UI 稳定性覆盖保持：
  - /admin 加载不白屏。
  - Visitors 列表、搜索框、筛选、排序、分页、详情入口存在。
  - Visitor Detail 可打开。
  - Overview、Comments、Posts、Resources、Downloads、Moderation Log tabs 均存在。
  - 新增所有详情 tabs 逐个点击切换检查，确认任意 tab 不白屏且不触发 console/network 500 错误。
  - 空访客列表状态不白屏。
- 管理操作闭环测试补强：
  - 写闭环现在强制要求 E2E_ADMIN_VISITOR_WRITE=1、localhost/127.0.0.1 baseURL、本地 admin token、E2E_TEST_DATABASE_URL。
  - E2E_TEST_DATABASE_URL 必须指向名称明显包含 test/e2e/local/dev 的数据库，且不能是 mrright_portfolio。
  - 无 test DB 时自动 skip，不报错。
  - 覆盖 admin 禁用公开主页后公开接口 403 PROFILE_ADMIN_DISABLED。
  - 覆盖 admin 禁用/恢复后 /u/:handle 前端页面壳不返回 500；公开主页权限状态以 /api/users/:handle 数据接口验证。
  - 覆盖 admin 恢复公开主页后公开接口可访问。
  - 资料清理从 bio/contacts 扩展到 avatar/banner/bio/contacts。
  - 通过 test DB 直接确认 avatar_url、banner_url、bio、public_email、contact_links、contacts_public、profile_admin_disabled 等字段变更。
  - 通过 test DB 直接确认 admin_user_actions 写入 profile_disabled 和 profile_fields_cleared，并包含 avatar/banner/bio/contacts 字段记录。

修改文件：

- tests/e2e/admin-visitors.spec.js
- PROJECT_PROGRESS.md

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，10 passed，4 skipped
- git diff --check：通过

Skip 原因：

- admin visitors 有 token API 只读测试：缺少 E2E_ADMIN_TOKEN，按安全规则 skip。
- admin visitors 详情敏感字段只读测试：缺少 E2E_ADMIN_TOKEN，按安全规则 skip。
- admin visitors 本地写闭环测试：未设置 E2E_ADMIN_VISITOR_WRITE=1，且默认 baseURL 是生产站点；没有 E2E_TEST_DATABASE_URL 时也会自动 skip。
- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD，按既有规则 skip。

安全说明：

- 本轮没有部署 VPS。
- 本轮按用户要求提交并同步 GitHub 远端分支。
- 本轮没有修改业务代码。
- 本轮没有修改 /admin 权限认证逻辑。
- 本轮没有修改 visitor token 或认证系统。
- 本轮没有操作线上数据库，没有执行线上写操作。
- 本轮没有输出或记录 ADMIN_TOKEN、DATABASE_URL、数据库密码或任何 env value。

## 2026-06-25：后台访客管理自动化测试补充

完成内容：

- 将 /admin 访客用户管理的一次性本地 Playwright review 扩展为可重复运行的正式 E2E 覆盖。
- 在 tests/e2e/admin-visitors.spec.js 中新增 admin visitors API 只读/权限测试：
  - GET /api/admin/visitors 无 admin token 返回 401，且不是 500。
  - 有 admin token 的列表分页、query、verified、profileStatus、accessLevel、sort 参数测试已加入，但默认缺少 E2E_ADMIN_TOKEN 时自动 skip。
  - 访客详情敏感字段泄露检查已加入，但默认缺少 E2E_ADMIN_TOKEN 或无访客数据时自动 skip。
- 扩展后台 UI mock 冒烟测试：
  - /admin 可打开。
  - Visitors 区域、搜索框、4 个筛选/排序控件、Search 按钮、分页控件存在。
  - 用户列表不白屏，点击用户详情不白屏。
  - 详情 tabs 覆盖 Overview、Comments、Posts、Resources、Downloads、Moderation Log。
  - 新增空访客列表状态测试，确认 No visitors match these filters. 正常显示且页面不白屏。
- 新增本地安全写操作闭环测试骨架：
  - 仅在 E2E_ADMIN_VISITOR_WRITE=1、baseURL 为 localhost/127.0.0.1、并提供本地 admin token 时运行。
  - 默认 npm run test:e2e 下自动 skip，不会写生产数据。
  - 覆盖专用测试用户创建、管理员禁用公开主页、公开接口 403 PROFILE_ADMIN_DISABLED、用户尝试恢复仍被管理员禁用、清理 bio/contacts、admin_user_actions 审计记录、恢复公开主页。
  - 如果本地非生产服务不返回 dev verification code，则该闭环自动 skip。

修改文件：

- tests/e2e/admin-visitors.spec.js
- PROJECT_PROGRESS.md

验证结果：

- npm run build：通过
- npm run lint：通过
- npx playwright test tests/e2e/admin-visitors.spec.js：通过，3 passed，3 skipped
- npm run test:e2e：通过，9 passed，4 skipped
- git diff --check：通过

Skip 原因：

- admin visitors 有 token API 只读测试：缺少 E2E_ADMIN_TOKEN，按安全规则 skip。
- admin visitors 本地写闭环测试：未设置 E2E_ADMIN_VISITOR_WRITE=1，且默认 baseURL 是生产站点，按安全规则 skip。
- production smoke 可选登录测试：缺少 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD，按既有规则 skip。

注意：

- 本轮没有部署 VPS。
- 本轮没有 push GitHub。
- 本轮没有修改 /admin 权限认证逻辑。
- 本轮没有修改 visitor token 或 ADMIN_TOKEN 认证逻辑。
- 本轮没有操作线上真实用户，没有连接线上数据库做写操作。
- 本轮没有覆盖 /etc/mrright-portfolio.env。
- 本轮没有删除数据库、表、上传文件或备份目录。
- npm run build 首次运行时发现本地 node_modules 缺少 Rollup optional native package；执行 npm install 补齐本地依赖后 build 通过，package.json 和 package-lock.json 未改变。

## 2026-06-24：/admin 访客用户管理功能上线

部署信息：

- 使用 commit：f49b6e6
- release 包：已生成并上传到 /tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260624-051010
- 服务状态：mrright-portfolio active
- nginx 状态：active
- 部署前 env 检查：ADMIN_TOKEN=[set]，DATABASE_URL=[set]

Schema：

- schema 安全扫描：通过
- schema ensure：成功
- visitor_users 4/4 个新增字段存在
- admin_user_actions 表存在

验证状态码：

- /api/health：200
- admin_summary：200
- https://mrright.blog/：200
- https://mrright.blog/admin：200
- https://mrright.blog/account：200
- https://mrright.blog/community：200
- https://mrright.blog/u/not-exist-test-handle：200，页面正常，不是 500

Admin Visitors 接口：

- GET /api/admin/visitors：200
- GET /api/admin/visitors?page=1&limit=30：200
- GET /api/admin/visitors?query=test：200
- GET /api/admin/visitors/:id：200
- 未提供 admin token：401，符合预期，未出现 500

Playwright 线上冒烟：

- /admin 可打开
- Visitors 区域可显示
- 搜索/筛选/分页 UI 存在
- 点击用户详情不白屏
- /account 不受影响
- /community 不受影响

截图路径，仅记录，不提交：

- G:\Code\3d-portfolio\test-results\admin-visitors-production-smoke
- admin-visitors.png
- admin-visitor-detail.png
- account.png
- community.png
- u_not-exist-test-handle.png

错误检查：

- network 500：0
- 非预期 console error：0
- 有 1 个预期 404：/api/users/not-exist-test-handle，这是缺失公开主页测试的正常结果，不是页面崩溃

备注：

- 如果浏览器还显示旧版 /admin，需要 Ctrl+Shift+R 强制刷新一次
- GitHub push 仍待后续凭证可用时执行

## 2026-06-23: Local admin visitor management implementation

Completed locally:

- Added paginated visitor search, verification/profile/access filters, and sorting.
- Added lazy-loaded visitor detail with Overview, Comments, Posts, Resources, Downloads, and Moderation Log tabs.
- Added admin profile disable/restore controls and profile-field moderation for avatar, banner, bio, and contacts.
- Added compatible visitor moderation columns and the admin_user_actions audit table.
- Added paginated admin APIs for visitor details and visitor-owned content.
- Public profile, resource, post, and activity APIs now respect administrator profile disable state.
- Added zh/en/ja copy for the friendly administrator-disabled public-profile state.
- Added a local Playwright visitor-management review with mocked administrator data.

Validation:

- npm run build: passed
- npm run lint: passed
- npm run test:e2e: passed (6 passed, 2 skipped)
- Local admin visitor Playwright review: passed (1 passed)
- git diff --check: passed
- Browser review: /admin opens; /account, /community, and missing public profile remain available; no console errors observed.

Notes:

- No VPS deployment was performed.
- No GitHub push was performed.
- No production database or environment file was modified.
- Review screenshot: test-results/admin-visitors-review/admin-visitors.png (ignored by Git).

## 项目信息

- 项目目录：/mnt/g/Code/3d-portfolio
- GitHub 仓库：rightamen/3d-portfolio
- 当前分支：codex/check-project-and-fix-errors
- 域名：https://mrright.blog
- VPS：147.79.20.232
- 部署目录：/opt/mrright-portfolio
- 服务名：mrright-portfolio
- 数据库：mrright_portfolio
- env 文件：/etc/mrright-portfolio.env

## 当前线上状态

- /api/health：200
- admin_summary：200
- /admin：200
- /community：200
- /login?mode=login：200
- /account：200
- /api/account/downloads：未登录 401，正常
- /api/account/comments：未登录 401，正常

## 最近完成

### 2026-06-18：模型预览优化上线

完成内容：

- 模型预览 UI 已优化并部署上线
- 新增专业 loading overlay：百分比、加载文案、loading ring、大模型慢加载提示
- 新增 ModelErrorBoundary：模型失败时显示友好错误卡片和 Reload Model 按钮
- 新增工具栏：重置视角、全屏、自动旋转、Studio/Dark/Grid、信息面板开关
- 新增模型信息面板：名称、格式、模型大小、顶点、三角面、材质、贴图、bounds、下载权限
- 优化相机适配：bounding box、自动居中、相机位置、Orbit target、reset 回到最佳视角
- 优化移动端：降低 DPR、关闭移动端阴影、工具栏适配、信息面板适配手机
- 优化资源释放：dispose cloned geometry/material/texture，并清理 useGLTF cache
- 保持 lazy loading，没有首页预加载全部模型

修改文件：

- src/components/ModelPreview.jsx
- src/index.css
- src/lib/i18n.js

部署信息：

- 使用 commit：a5f3d401bd2615e8cf8b5fb29e4089376055576a
- release 包：.deploy-tools/mrright-portfolio-release.tar.gz
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz
- VPS 备份路径：/opt/mrright-portfolio.backup-20260618-121102
- 服务状态：active

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed, 1 skipped
- npm run release:vps：通过
- VPS local /api/health：200
- VPS local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog/：200
- https://mrright.blog/admin：200
- https://mrright.blog/account：200
- https://mrright.blog/community：200

线上 Playwright 模型预览冒烟测试：

- 首页正常
- 模型预览弹窗正常打开
- loading 截图已捕获
- Canvas、工具栏、模型信息面板存在
- 人为拦截模型资源后，错误态显示 LOAD FAILED 和 Reload Model，页面未崩溃
- 未发现生产 500
- console：正常预览未发现明显 error；错误态测试中有预期模型资源 404

截图路径，仅记录，不提交：

- test-results/model-viewer-production-smoke/home.png
- test-results/model-viewer-production-smoke/model-preview-loading.png
- test-results/model-viewer-production-smoke/model-preview.png
- test-results/model-viewer-production-smoke/model-preview-error.png
- test-results/model-viewer-production-smoke/admin.png
- test-results/model-viewer-production-smoke/account.png
- test-results/model-viewer-production-smoke/community.png

备注：

- 截图文件不提交
- 浏览器如仍看到旧样式，需要 Ctrl+Shift+R 强制刷新
- GitHub push 仍待后续凭证可用时执行

### 2026-06-18：UI 视觉升级已部署到 VPS

本地 commit：

- afc0838a8dc90f2fb572b08e02cb9c9ed6c32f00

完成内容：

- 将本地 UI 视觉升级 release 包上传到 VPS 并部署到 /opt/mrright-portfolio。
- 部署前按要求运行 npm run build、npm run lint、npm run test:e2e、npm run release:vps。
- 部署前仅检查 ADMIN_TOKEN 和 DATABASE_URL 为 [set]，未输出 value。
- 部署前已备份 /opt/mrright-portfolio。
- 部署未覆盖 /etc/mrright-portfolio.env，未修改数据库密码，未删除数据库、表、data、public/uploads 或备份目录。
- 本轮未重新 commit，未 push GitHub。

release 包：

- .deploy-tools/mrright-portfolio-release.tar.gz：生成成功
- VPS 上传路径：/tmp/mrright-portfolio-release.tar.gz

备份路径：

- /opt/mrright-portfolio.backup-20260618-111302

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- npm run release:vps：通过
- VPS service active：active
- VPS local /api/health：200
- VPS local admin_summary：200
- https://mrright.blog/api/health：200
- https://mrright.blog admin_summary：200
- https://mrright.blog/：200
- https://mrright.blog/account：200
- https://mrright.blog/login?mode=login：200
- https://mrright.blog/admin：200
- https://mrright.blog/community：200
- https://mrright.blog/u/not-exist-test-handle：200，页面显示缺失资料友好错误
- 线上 500 错误数量：0
- console error：仅 /u/not-exist-test-handle 缺失用户接口返回 404，属于预期缺失资料页场景

截图路径：

- test-results/ui-production-smoke/home.png
- test-results/ui-production-smoke/account.png
- test-results/ui-production-smoke/login.png
- test-results/ui-production-smoke/admin.png
- test-results/ui-production-smoke/community.png
- test-results/ui-production-smoke/public-profile-missing.png

注意：

- 截图文件未提交。
- 若用户浏览器仍看到旧 CSS/JS，可执行 Ctrl+Shift+R 强制刷新。

### 2026-06-18：本地 UI 视觉升级完成

本地 commit：

- 未提交

完成内容：

- 联网参考现代 3D portfolio、YouTube 频道页、YouTube Studio、Dribbble/Behance 深色 SaaS dashboard 风格后，完成本地 UI 视觉升级。
- 首页 /：增强 hero 层次、3D 氛围、按钮、标签、筛选和作品卡片质感。
- /account：升级为更接近 YouTube Studio + 个人资料中心的深色 dashboard 视觉。
- /u/:handle：增强频道页式封面、头像、handle、简介、链接、tabs 和内容卡片层级。
- /community：升级为现代社区流布局，优化帖子卡片、统计、上传区和资源卡片。
- /login?mode=login：升级为独立玻璃登录面板，统一品牌区、模式切换、输入框和按钮视觉。
- 未新增依赖，未修改服务端认证逻辑，未修改数据库 schema，未部署 VPS，未 push GitHub。

新增/修改文件：

- src/App.jsx
- src/components/HeroText.jsx
- src/index.css
- src/pages/AccountPage.jsx
- src/pages/AuthPage.jsx
- src/pages/CommunityPage.jsx
- src/pages/PublicProfilePage.jsx
- src/sections/Hero.jsx

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- git diff --check：通过
- 本地 Express 预览截图：通过，页面非白屏
- 本地截图检查 500：未发现 500
- console error：仅 /u/not-exist-test-handle 缺失用户接口返回 404，属于预期缺失资料页场景

截图路径：

- test-results/ui-review/home.png
- test-results/ui-review/community.png
- test-results/ui-review/login.png
- test-results/ui-review/account.png
- test-results/ui-review/public-profile-missing.png
- test-results/ui-review/mobile-home.png
- test-results/ui-review/mobile-community.png
- test-results/ui-review/mobile-login.png
- test-results/ui-review/mobile-account.png
- test-results/ui-review/mobile-public-profile-missing.png

注意：

- 本轮只做本地 UI 改版。
- 未写入任何真实用户数据。
- 未输出或修改 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。

### 2026-06-18：线上 Playwright 冒烟测试完成

本地 commit：

- 本次提交（最终 hash 以 git log 为准）

完成内容：

- 对线上 YouTube 式用户个人中心 / 公开主页功能完成 Playwright 冒烟测试。
- 测试过程未登录真实账号、未修改线上数据、未上传文件。
- 本轮测试未提交代码、未部署 VPS、未 push GitHub。

测试结果：

- https://mrright.blog/：打开成功，非白屏
- https://mrright.blog/community：打开成功，非白屏
- https://mrright.blog/login?mode=login：打开成功，登录表单正常
- https://mrright.blog/account：打开成功，未登录提示正常
- https://mrright.blog/u/not-exist-test-handle：打开成功，显示 Profile Not Found 友好错误
- /api/health：200
- /api/account/profile：未登录 401，正常
- /api/account/downloads：未登录 401，正常
- /api/account/comments：未登录 401，正常
- /api/users/not-exist-test-handle：404，正常
- 线上 500 错误数量：0

截图路径：

- test-results/smoke/home.png
- test-results/smoke/community.png
- test-results/smoke/login.png
- test-results/smoke/account.png
- test-results/smoke/public-profile-missing.png

注意：

- test-results/ 和 playwright-report/ 已加入 .gitignore。
- 截图文件未提交。

### 2026-06-18：新增正式 Playwright E2E 冒烟测试

本地 commit：

- 未提交

完成内容：

- 新增 Playwright 测试配置 playwright.config.js。
- 新增正式 E2E 测试 tests/e2e/production-smoke.spec.js。
- 新增 npm run test:e2e、npm run test:e2e:headed、npm run test:e2e:report 脚本。
- 新增 @playwright/test 开发依赖并更新 package-lock.json。
- E2E 覆盖：
  - 首页 /
  - /community
  - /login?mode=login
  - /account 未登录状态
  - /u/not-exist-test-handle 公开用户页 404/友好错误
  - /api/health 200
  - /api/account/profile 未登录 401
  - /api/account/downloads 未登录 401
  - /api/account/comments 未登录 401
  - /api/users/not-exist-test-handle 404
- 新增可选登录冒烟测试，仅使用 E2E_VISITOR_EMAIL 和 E2E_VISITOR_PASSWORD；未设置环境变量时自动 skip。

新增/修改文件：

- package.json
- package-lock.json
- playwright.config.js
- tests/e2e/production-smoke.spec.js

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run test:e2e：通过，6 passed，1 skipped
- VPS 部署：未部署
- GitHub push：未执行

注意：

- 未写入真实账号或密码。
- 测试只做页面渲染和只读 API 状态检查，不登录、不上传、不修改线上数据。
- 首次运行 E2E 时安装了 Playwright Chromium 浏览器运行时。

### 2026-06-18：访客个人中心升级为公开资料中心

本地 commit：

- 74369497099d184b6ffef8e7e419eaab97628146

完成内容：

- 将 /account 设置页升级为类似 YouTube 频道资料中心，可编辑头像、封面图、显示名称、handle、简介、所在地、网站、公开邮箱、社交链接和隐私开关。
- 新增公开个人主页路由 /u/:handle，包含封面、头像、简介、公开联系方式、统计和 Overview/Resources/Posts/Comments/About tabs。
- 新增访客私有 API：
  - GET /api/account/profile
  - PUT /api/account/profile
  - POST /api/account/avatar
  - POST /api/account/banner
- 新增公开 API：
  - GET /api/users/:handle
  - GET /api/users/:handle/activity
  - GET /api/users/:handle/resources
  - GET /api/users/:handle/posts
- 兼容扩展 visitor_users 资料字段，使用 ALTER TABLE ADD COLUMN IF NOT EXISTS。

新增/修改文件：

- server/index.js
- server/postgresStores.js
- src/App.jsx
- src/lib/api.js
- src/lib/i18n.js
- src/pages/AccountPage.jsx
- src/pages/PublicProfilePage.jsx
- src/index.css

验证结果：

- npm run build：通过
- npm run lint：通过
- npm run release:vps：通过
- git diff --check：通过
- VPS 部署：成功
- 服务重启：成功
- /api/health：200
- admin_summary：200
- /：200
- /account：200
- /login?mode=login：200
- /admin：200
- /community：200
- /api/account/profile：未登录 401，正常
- /api/account/downloads：未登录 401，正常
- /api/account/comments：未登录 401，正常
- /api/users/not-exist-test-handle：404，正常
- 线上 Playwright 冒烟测试：通过
- 线上 /：200，页面正常
- 线上 /community：页面正常
- 线上 /login?mode=login：页面正常
- 线上 /account：未登录提示正常
- 线上 /u/not-exist-test-handle：显示 Profile Not Found
- 线上 /api/health：200
- 线上 /api/account/profile：未登录 401，正常
- 线上 /api/account/downloads：未登录 401，正常
- 线上 /api/account/comments：未登录 401，正常
- 线上 /api/users/not-exist-test-handle：404，正常
- 线上 500 错误数量：0
- 线上冒烟测试截图路径：test-results/smoke/
- GitHub push：未执行

备份路径：

- /opt/mrright-portfolio.backup-20260618-053201

注意：

- 未修改 /admin 的 ADMIN_TOKEN 登录逻辑。
- 访客中心继续使用 visitor token。
- 公开接口不返回 visitor token，不默认暴露真实邮箱；只有 public_email 且 contacts_public 开启时才公开联系邮箱。
- 头像和封面上传保存到 public/uploads/avatars 与 public/uploads/banners，不删除旧文件。
- 部署时 env 仅检查 ADMIN_TOKEN 和 DATABASE_URL 为 [set]，未输出 value。

### 2026-06-18：项目规则、进度记录和 Claude 自动化命令本地提交

本地 commit：

- 本次提交（最终 hash 以 git log 为准）

完成内容：

- 新增项目协作规则 AGENTS.md。
- 新增 Claude 自动化规则 CLAUDE.md。
- 新增 PROJECT_PROGRESS.md 作为项目进度记录。
- 新增 .claude/commands/ 下的自动化命令。
- 将 .claude/settings.local.json 加入 .gitignore，避免提交本地设置。

验证结果：

- 敏感信息扫描：未发现实际 token、密码、ADMIN_TOKEN value、DATABASE_URL value、GitHub token 或 VPS 密码。
- npm run build：未运行（未修改业务代码）。
- npm run lint：未运行（未修改业务代码）。
- VPS 部署：未部署。
- GitHub push：未执行。

注意：

- 未提交 .claude/settings.local.json。
- 未修改业务代码。

### 2026-06-17：访客个人中心改版上线

本地 commit：

- 98cae36

完成内容：

- 将 /account 改成与 /admin 风格统一的访客版后台中心
- 新增访客只读接口：
  - GET /api/account/downloads
  - GET /api/account/comments
- 新增/修改文件：
  - server/postgresStores.js
  - server/index.js
  - src/lib/api.js
  - src/lib/i18n.js
  - src/pages/AccountPage.jsx
  - src/index.css

验证结果：

- npm run build：通过
- npm run lint：通过
- VPS 部署：成功
- 服务重启：成功
- 新版 /account：已上线

备份路径：

- /etc/mrright-portfolio.env.backup-20260617-045006
- /opt/mrright-portfolio.backup-20260617-045006

注意：

- GitHub push 跳过，因为当前环境无法读取 GitHub 凭证
- 后续本机有 GitHub 凭证时执行：
  git push origin codex/check-project-and-fix-errors

## 固定安全规则

1. 不要输出 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。
2. 不要覆盖 /etc/mrright-portfolio.env。
3. 不要重置数据库密码，除非用户明确要求。
4. 不要删除数据库、表、上传文件、备份目录。
5. 不要 force push。
6. 不要 reset，除非用户明确要求。
7. 修改代码后必须运行 npm run build 和 npm run lint。
8. 部署前必须备份 /opt/mrright-portfolio。
9. 部署前必须确认 ADMIN_TOKEN 和 DATABASE_URL 都是 [set]，但不要输出 value。
10. 部署后必须验证 /api/health、admin_summary、/admin、/community、/login、/account。
11. GitHub push 失败时，不要重复 commit，不要 reset，只说明原因。
