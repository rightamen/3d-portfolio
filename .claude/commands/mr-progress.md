---
description: Update project progress memory after work is completed
allowed-tools: Bash(git status *), Bash(git log *), Bash(git diff *), Read, Edit, Write
argument-hint: [summary]
---

请更新 PROJECT_PROGRESS.md，记录当前项目进度。

用户补充说明：
$ARGUMENTS

要求：
1. 先读取 PROJECT_PROGRESS.md。
2. 执行 git status --short --branch。
3. 执行 git log -5 --oneline。
4. 如果有新 commit，记录 commit hash。
5. 总结本轮完成内容。
6. 记录修改文件。
7. 记录 build/lint 结果，如果不知道就写“未确认”。
8. 记录是否部署 VPS，如果不知道就写“未部署/未确认”。
9. 记录待办事项。
10. 不要写入任何密码、token、ADMIN_TOKEN、DATABASE_URL、数据库密码、GitHub token、VPS 密码。
11. 不要修改代码文件，只更新 PROJECT_PROGRESS.md。

最后输出：
- 已更新的进度标题
- 记录的 commit hash
- 当前待办事项
