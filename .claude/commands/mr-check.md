---
description: Check project status, build, and lint
allowed-tools: Bash(git status *), Bash(git diff *), Bash(npm run build), Bash(npm run lint), Bash(npm install)
---

请检查当前 3d-portfolio 项目状态。

要求：
1. 执行 git status --short --branch。
2. 执行 git diff --stat。
3. 检查是否有敏感信息被改动或准备提交：
   - ADMIN_TOKEN
   - DATABASE_URL
   - 数据库密码
   - GitHub token
   - VPS 密码
   - .env
4. 执行 npm run build。
5. 执行 npm run lint。
6. 最后输出：
   - 当前分支
   - 是否有未提交文件
   - build 是否通过
   - lint 是否通过
   - 是否发现敏感信息风险
