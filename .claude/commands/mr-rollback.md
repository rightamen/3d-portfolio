---
description: Roll back VPS deployment to a backup directory
allowed-tools: Bash(ssh *)
argument-hint: [backup-path]
---

请安全回退 VPS 部署。

参数：
$ARGUMENTS

要求：
1. 不要删除任何目录。
2. 不要覆盖 /etc/mrright-portfolio.env。
3. 不要修改数据库。
4. 不要重置密码。
5. 如果没有提供 backup 路径，先列出 /opt/mrright-portfolio.backup-*，让我选择。
6. 回退前把当前失败版本改名为 /opt/mrright-portfolio.failed-当前时间。
7. 将指定备份恢复为 /opt/mrright-portfolio。
8. 重启 mrright-portfolio。
9. 验证：
   - /api/health
   - admin_summary
   - https://mrright.blog
   - https://mrright.blog/admin
   - https://mrright.blog/community

最后告诉我：
- 是否回退成功
- 使用的备份路径
- 当前失败版本保存路径
- 服务状态
