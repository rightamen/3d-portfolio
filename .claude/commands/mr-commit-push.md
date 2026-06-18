---
description: Commit current safe changes and push to GitHub
allowed-tools: Bash(git status *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git push *), Bash(git log *)
argument-hint: [commit message]
---

请把当前本地改动提交并推送到 GitHub。

当前项目：
/mnt/g/Code/3d-portfolio

当前分支：
codex/check-project-and-fix-errors

安全要求：
1. 不要 force push。
2. 不要 reset。
3. 不要删除已有 commit。
4. 不要提交 .env、token、DATABASE_URL、ADMIN_TOKEN、数据库密码、VPS 密码。
5. 如果 push 失败，不要重复 commit，只告诉我失败原因。
6. 如果已经有本地 commit 未 push，只执行 push，不要重新 commit。

执行流程：
1. git status --short --branch
2. git diff --stat
3. 检查 staged/untracked 文件是否包含敏感文件。
4. 如果还没 commit，根据改动提交：
   git add 必要文件，不要盲目添加敏感文件。
5. commit message 使用：
   $ARGUMENTS
   如果 $ARGUMENTS 为空，使用：
   chore: update project changes
6. 推送：
   git push origin codex/check-project-and-fix-errors

最后输出：
- commit hash
- push 是否成功
- 当前分支
- 是否还有 ahead 未推送
