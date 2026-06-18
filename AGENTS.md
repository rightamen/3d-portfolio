# mrright.blog / 3d-portfolio 项目规则

## 项目信息

- 本地目录：/mnt/g/Code/3d-portfolio
- GitHub 仓库：rightamen/3d-portfolio
- 当前分支：codex/check-project-and-fix-errors
- 域名：https://mrright.blog
- VPS：147.79.20.232
- 线上目录：/opt/mrright-portfolio
- 服务名：mrright-portfolio
- env 文件：/etc/mrright-portfolio.env
- 数据库：mrright_portfolio

## 每次开始工作前

1. 先读取 PROJECT_PROGRESS.md。
2. 执行 git status --short --branch。
3. 不要直接改生产环境，除非用户明确要求部署。

## 安全规则

1. 不要输出 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。
2. 不要覆盖 /etc/mrright-portfolio.env。
3. 不要重置数据库密码，除非用户明确要求。
4. 不要删除数据库、表、上传文件、备份目录。
5. 不要 force push。
6. 不要 reset，除非用户明确要求。
7. GitHub push 失败时，不要重复 commit，不要 reset，只说明原因。
8. 部署前必须备份 /opt/mrright-portfolio。
9. 部署前只检查 ADMIN_TOKEN 和 DATABASE_URL 是否为 [set]，不要输出 value。
10. 部署后必须验证 /api/health、admin_summary、/admin、/community、/login、/account。

## 本地代码规则

1. 修改代码后必须运行 npm run build。
2. 修改代码后必须运行 npm run lint。
3. 新增多语言文案必须补齐 zh/en/ja。
4. 不要破坏 /admin 的 ADMIN_TOKEN 登录逻辑。
5. /account 访客中心继续使用 visitor token。
6. 后台 Save Project 的 slug 只能使用小写字母、数字、短横线。

## 部署规则

部署流程必须是：

1. npm run build
2. npm run lint
3. npm run release:vps
4. 上传 release 到 VPS
5. 检查 env key 是否 [set]
6. 备份 /opt/mrright-portfolio
7. 解包并替换 dist、server、scripts、package.json、package-lock.json、node_modules
8. 保留 data、public/uploads、/etc/mrright-portfolio.env、所有 backup
9. systemctl restart mrright-portfolio
10. 验证接口和页面

## 进度记录

每次完成功能、修复、提交、部署后，更新 PROJECT_PROGRESS.md。
不要把任何密码、token、DATABASE_URL、ADMIN_TOKEN 写入进度文件。
