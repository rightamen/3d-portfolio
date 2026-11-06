# 发布与公网检查流程收整 — 2026-11-06

本轮从干净 main 425436e 接续。GitHub main 与本地一致，公网 release.json
仍对应 765242f / release-2026-11-01-studio。产品代码和线上数据未部署或改写。

## 完成内容

- 公网检查器从 sitemap 发现 /w/:handle/:slug，只接受完整作品路径；
  不再把旧 /projects/、作者页、额外路径段或非 HTTP URL 误认为作品。
- 实际请求作品页面，检查专属标题与 JSON-LD；固定公开路由增加
  /account/works、/explore、/u/mrright。
- 单独检查 /projects/md-leimu 的 301 与 Location，要求目标为同源
  /w/mrright/md-leimu，不跟随跳转掩盖错误。
- release:vps 与 deploy:vps 共用 create-release：拒绝脏源码，重新构建，
  写 dist/release.json，按同一白名单生成 tar.gz 与 SHA-256 sidecar。
- 构建/打包后复核源码和 Git HEAD/分支；若发生变化，保留上一份制品并报错。
- 自动部署必须通过 git ls-remote 确认相同 origin 分支已推送制品对应的提交。
  未提交、未推送、远端无法确认时均在连接 VPS 前失败。
- 两入口共用 buildRemoteScript；制品 SHA-256 在配置备份/程序替换前核验，
  传输损坏立即退出。默认 VPS_BACKUP_RETAIN=0，保留全部应用备份。
- README 移除重复手工脚本，指向 release:vps 生成的同一份脚本。

## 验证

- npm run build、npm run lint：通过。
- npm run test:unit：354 项通过，其中公网检查逻辑 48 项。
- npm run test:release：8 组真实临时 Git / build / tar / bash 场景通过：
  新鲜构建与清单、制品边界、脏源码、构建带入 uploads、构建中改文件、
  构建中生成新提交、未推送拒绝、损坏包在远端修改前拦截。
- npm run test:deploy-script：四种配置组合语法、引号、无敏感值、传输一致性通过。
- npm run test:deploy-backup：硬链接/独立 data/回滚点/retain=0、健康等待与会话撤销通过。
- 新版 npm run check:production -- --json 对真实 HTTPS 执行：22 项通过、0 警告、0 失败。
  sitemap 9 个 URL 中识别 4 件作品；实际检查灭火器标题/JSON-LD；旧雷姆链接 301 正确。
- TLS 验证开启，证书到期 2027-02-01T18:48:41Z；检查时剩余 87 天。
- 检查证据在忽略目录 .deploy-tools/checkpoint-20261106.json，无凭据。

## 影响边界

只修改脚本、测试、操作文档和进度记录，无前端布局、服务端接口、schema 或业务数据变更。
本轮不替换线上程序，不重启服务，也没有创建生产会话或执行 SQL。
线上仍为 765242f，既有应用/配置/数据库备份继续有效，完整路径见
[已发布版本](RELEASE_2026-11-01_STUDIO.md)。

数据库备份机制本轮未改变：实际部署前仍须单独创建并验证 pg_dump；
应用硬链接备份不能替代数据库备份。新测试验证本地行为，不能证明真实 VPS 目录状态。
VPS_DRY_RUN 只输出脚本，全零 SHA-256 为占位符，不能直接拿去部署。

## 后续

- 实际代理链与 TRUST_PROXY_HOPS、外部监控和告警仍待核实。
- 回访线上首页/创作者/详情的桌面与手机交互，依据实际问题继续优化。
- 精选展由真实管理员评选，不给生产作品填充演示评分。
- API v1、资源模型与受控下载契约继续按 API_V1_GAPS.md 推进。

## 提交与完整制品验收

工具提交 504c7561249657a21c4a10384fa9d9f622b533ab 已推送 GitHub main：
https://github.com/rightamen/3d-portfolio/commit/504c7561249657a21c4a10384fa9d9f622b533ab

推送之后从该干净提交实际运行 release:vps，重新构建并生成 178 个文件的制品。
manifest 的 gitCommit 与上述提交一致、sourceClean=true；未打入本地上传或 env。
制品 SHA-256：b5bfef77d20c58c9112c379427bcfece141a937a5fcbbd75c08c4d903fcf29a0。
sidecar、手工脚本中的实际校验值及 bash -n 全部通过。两实际 CLI 在脏源码时拒绝执行，
在重新构建或连接 VPS 前退出。未执行生产部署。

忽略目录证据：release-tooling-20261106.log、release-tooling-artifact-20261106.json。
验收结果作为后续文档提交，不移动已有发布标签，也不为文档重新部署应用。
