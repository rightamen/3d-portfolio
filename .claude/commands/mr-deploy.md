---
description: Build release and deploy current local code to VPS
allowed-tools: Bash(npm run build), Bash(npm run lint), Bash(npm run release:vps), Bash(scp *), Bash(ssh *), Bash(git status *)
---

请把当前本地代码构建并部署到 VPS。

项目信息：
- 本地目录：/mnt/g/Code/3d-portfolio
- VPS：root@147.79.20.232
- SSH 端口：22
- 域名：https://mrright.blog
- 线上目录：/opt/mrright-portfolio
- 服务名：mrright-portfolio
- env 文件：/etc/mrright-portfolio.env

安全要求：
1. 不要输出任何 ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。
2. 不要覆盖 /etc/mrright-portfolio.env。
3. 不要重置数据库密码。
4. 不要删除数据库、表、上传文件、备份目录。
5. 不要 force push。
6. 部署前必须备份当前线上目录。
7. 如果任何一步失败，立即停止。

执行流程：

第一步，本地验证：
1. git status --short --branch
2. npm run build
3. npm run lint
4. npm run release:vps
5. 确认 .deploy-tools/mrright-portfolio-release.tar.gz 存在。

第二步，上传：
scp -P 22 .deploy-tools/mrright-portfolio-release.tar.gz root@147.79.20.232:/tmp/

第三步，VPS 部署前检查：
1. node -v
2. npm -v
3. nginx -t
4. systemctl status mrright-portfolio --no-pager --full || true
5. 只检查 env key，不输出 value：
   sudo awk -F= '$1=="ADMIN_TOKEN"||$1=="DATABASE_URL"{printf "%s = %s\n", $1, (length($0)>length($1)+1 ? "[set]" : "[EMPTY]")}' /etc/mrright-portfolio.env
6. 如果 ADMIN_TOKEN 或 DATABASE_URL 不是 [set]，立即停止。

第四步，部署：
1. 备份 /opt/mrright-portfolio 到 /opt/mrright-portfolio.backup-当前时间。
2. 解压 release 到临时目录。
3. 确认包含 dist、server、scripts、package.json、package-lock.json。
4. 执行 npm ci --omit=dev。
5. 只替换线上 dist、server、scripts、package.json、package-lock.json、node_modules。
6. 保留 data、public/uploads、/etc/mrright-portfolio.env、所有备份目录。

第五步，重启和验证：
1. systemctl restart mrright-portfolio
2. curl -i http://127.0.0.1:4173/api/health
3. 不打印 token，验证 admin：
   TOKEN="$(sudo awk -F= '$1=="ADMIN_TOKEN"{print substr($0, index($0,$2))}' /etc/mrright-portfolio.env)"
   curl -fsS -o /dev/null -w 'admin_summary=%{http_code}\n' -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4173/api/admin/summary
4. curl -I https://mrright.blog
5. curl -I https://mrright.blog/community
6. curl -I https://mrright.blog/admin
7. curl -I https://mrright.blog/login?mode=login
8. curl -I https://mrright.blog/account

最后输出：
- build/lint 是否通过
- release 是否生成
- 上传是否成功
- VPS 备份路径
- /api/health 是否 200
- admin_summary 是否 200
- /community 是否 200
- 是否需要 Ctrl+Shift+R 强制刷新浏览器
