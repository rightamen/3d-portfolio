# mrright.blog 自动化规则

你可以使用 MCP：
- github：GitHub 仓库操作
- playwright：浏览器自动测试
- filesystem-full：本机文件读写
- mrright-ops：VPS root SSH 与 PostgreSQL 操作

项目：
- 本地目录：/mnt/g/Code/3d-portfolio
- 域名：https://mrright.blog
- VPS：147.79.20.232
- 服务名：mrright-portfolio
- 数据库：mrright_portfolio

强制安全规则：
1. 不要输出 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。
2. 不要覆盖 /etc/mrright-portfolio.env。
3. 不要删除数据库、表、上传文件、备份目录。
4. 不要 force push。
5. 不要 reset，除非用户明确要求。
6. 修改代码后必须运行 npm run build 和 npm run lint。
7. 部署前必须备份 /opt/mrright-portfolio。
8. 部署前必须确认 ADMIN_TOKEN 和 DATABASE_URL 都是 [set]，但不要输出 value。
9. 部署后必须验证：
   - /api/health
   - admin_summary
   - /
   - /community
   - /admin
   - /login?mode=login
   - /account
   - /explore（作品目录）
   - /w/mrright/md-leimu（单个作品）
   - /u/mrright（创作者主页）
   - /projects/md-leimu 必须是 **301** 且 Location 指向 /w/mrright/md-leimu
     （2026-09-07 起。它不是 200——如果返回 200，说明作品没了或被隐藏了）
   - **公开作品响应里不能出现 `qrUrl` 或 `"methods"`**（2026-09-08 起）：
     `curl -s https://mrright.blog/api/works/mrright/md-leimu | grep -c qrUrl`
     必须是 0。创作者的收款码只给已下单的买家看，
     出现在公开页面上就是任何人都能抓去做骗局的收款码。
10. 数据库写操作前必须先说明 SQL 影响。
11. 不允许 DROP DATABASE、DROP TABLE、TRUNCATE、DELETE without WHERE。
12. Playwright 测试可以自动打开网站、登录、点击、截图，但不要把 token 或密码输出到日志。

## 项目进度记忆

每次开始工作前，必须先阅读：

- PROJECT_PROGRESS.md

每次完成以下任务后，必须更新 PROJECT_PROGRESS.md：

- 修复 bug
- 新增功能
- build/lint 通过
- git commit
- GitHub push
- VPS 部署
- 数据库/API/路由变更
- 线上验证结果变化

记录进度时必须包含：

1. 日期
2. 完成内容
3. 修改文件
4. commit hash
5. build/lint 结果
6. 是否部署 VPS
7. VPS 备份路径
8. 验证接口状态
9. 待办事项

禁止把任何密码、token、ADMIN_TOKEN、DATABASE_URL 写入 PROJECT_PROGRESS.md。
