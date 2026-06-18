---
description: Diagnose and fix admin Save Project errors
allowed-tools: Bash(git status *), Bash(grep *), Bash(npm run build), Bash(npm run lint), Read, Edit
argument-hint: [error message]
---

请诊断并最小修复 /admin 保存项目失败问题。

当前错误：
$ARGUMENTS

要求：
1. 不要部署 VPS。
2. 不要覆盖 env。
3. 不要输出任何 token、密码、ADMIN_TOKEN、DATABASE_URL。
4. 不要删除数据。
5. 优先修复前端 payload 或后端校验。
6. 如果数据库需要新增字段，只能使用 ALTER TABLE ADD COLUMN IF NOT EXISTS，并先说明原因。

请检查：
1. src/Admin.jsx 保存项目 payload。
2. src/lib/api.js 请求封装和错误处理。
3. server/index.js 中 /api/admin/projects POST/PUT 校验逻辑。
4. server/postgresStores.js 中 custom_projects / project_overrides 保存逻辑。
5. 找出 400/500 真实原因。

修复后运行：
1. npm run build
2. npm run lint

最后输出：
- 失败原因
- 修改文件
- build/lint 是否通过
- 是否需要部署
