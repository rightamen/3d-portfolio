---
description: Full automated workflow: check, commit, push, build, deploy, verify
allowed-tools: Bash
argument-hint: [commit message]
---

执行完整自动化流程：检查 → build/lint → commit → push GitHub → release → 上传 VPS → 部署 → 验证。

项目信息：
- 本地目录：/mnt/g/Code/3d-portfolio
- GitHub 分支：codex/check-project-and-fix-errors
- VPS：root@147.79.20.232
- SSH 端口：22
- 域名：https://mrright.blog
- 服务名：mrright-portfolio
- 线上目录：/opt/mrright-portfolio
- env：/etc/mrright-portfolio.env

绝对安全要求：
1. 不要输出任何密码、token、ADMIN_TOKEN、DATABASE_URL。
2. 不要覆盖 /etc/mrright-portfolio.env。
3. 不要重置数据库密码。
4. 不要删除数据库、表、上传文件、备份目录。
5. 不要 force push。
6. 不要 reset。
7. 如果 GitHub push 失败，不要重新 commit；询问我是否跳过 GitHub 继续部署。
8. 如果部署失败，立即停止，不要继续破坏性操作。

流程：
1. git status --short --branch
2. git diff --stat
3. 检查敏感信息风险。
4. npm run build
5. npm run lint
6. 如果有未提交改动，git add 必要文件并 commit。
   commit message 使用：
   $ARGUMENTS
   如果为空，使用：
   chore: update project
7. git push origin codex/check-project-and-fix-errors
8. push 成功后执行 npm run release:vps。
9. 上传 release 到 VPS。
10. 检查 VPS env key：ADMIN_TOKEN、DATABASE_URL 必须为 [set]。
11. 备份线上目录。
12. 部署 release。
13. 重启服务。
14. 验证：
   - /api/health
   - admin_summary
   - /
   - /community
   - /admin
   - /login?mode=login
   - /account

最终输出完整报告。
