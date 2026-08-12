# 数据库备份与恢复

状态：新增于 2026-08-11。在此之前 mrright.blog **没有任何数据库备份** —— 部署脚本只备份
`/opt/mrright-portfolio`（代码与上传文件），PostgreSQL 数据完全依赖单块 VPS 磁盘。

这份文档描述备份的执行方式、验证方式，以及最重要的：**如何恢复**。没有演练过的备份等于没有备份。

## 组成

| 文件 | 作用 |
| --- | --- |
| `scripts/backup-database.mjs` | 执行 `pg_dump`、校验归档结构、写 SHA-256 旁文件、可选清理旧备份 |
| `scripts/systemd/mrright-backup.service` | systemd 一次性单元 |
| `scripts/systemd/mrright-backup.timer` | 每日定时触发 |

## 设计上的三个安全性质

1. **连接串永不输出。** 脚本只打印主机名和数据库名，因此 journalctl 与 CI 日志可以安全保留。
2. **清理是显式开启的。** 不设置 `BACKUP_RETENTION_COUNT` 时脚本永不删除任何文件。即使开启，
   最新的 N 份始终保留，且缺少校验旁文件的 dump 会被视为"未验证"而跳过删除，
   不会因为一次中断的运行导致数据丢失。
3. **成功 = 可解析。** 只有 `pg_restore --list` 能解析且包含至少一条 `TABLE DATA` 时才算成功。
   磁盘写满导致的截断 dump 会在这里被发现，而不是在真正需要恢复的那天。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 必填 | 标准 libpq URI |
| `BACKUP_DIR` | `/var/backups/mrright-portfolio` | 备份输出目录 |
| `BACKUP_RETENTION_COUNT` | `0`（不清理） | 保留最新的 N 份 |
| `BACKUP_PGDUMP` / `BACKUP_PGRESTORE` | `pg_dump` / `pg_restore` | 二进制路径覆盖 |
| `BACKUP_OFFSITE_ACKNOWLEDGED` | 未设置 | 设为 `1` 关闭"备份仍在同一台机器"的提醒 |

## 在 VPS 上安装

```bash
# 1. 确认 postgresql-client 已安装（提供 pg_dump / pg_restore）
pg_dump --version

# 2. 放置 systemd 单元
install -m 0644 scripts/systemd/mrright-backup.service /etc/systemd/system/
install -m 0644 scripts/systemd/mrright-backup.timer   /etc/systemd/system/

# 3. 启用每日定时器
systemctl daemon-reload
systemctl enable --now mrright-backup.timer

# 4. 立刻跑一次，确认成功
systemctl start mrright-backup.service
journalctl -u mrright-backup.service -n 40 --no-pager
```

单元通过 `EnvironmentFile=/etc/mrright-portfolio.env` 读取 `DATABASE_URL`，
和主服务用同一份配置，因此不需要在任何地方复制连接串。

## 异地副本（必须做）

脚本刻意**不**实现异地传输：那需要它不该持有的凭证，而且一旦传输失败，
你需要它作为独立的失败信号出现，而不是淹没在备份日志里。

推荐做法 —— 在 timer 之后追加一个独立单元：

```ini
# /etc/systemd/system/mrright-backup-offsite.service
[Unit]
Description=Ship mrright.blog database backups off-site
After=mrright-backup.service
Requires=mrright-backup.service

[Service]
Type=oneshot
ExecStart=/usr/bin/rclone sync /var/backups/mrright-portfolio remote:mrright-backups
```

任何对象存储都可以（S3 / R2 / B2）。要点只有一个：**副本不能和数据库在同一块磁盘上。**

## 恢复演练（每季度至少一次）

恢复到一个临时数据库，验证数据完整，再删除临时库。**不要**直接恢复到生产库。

> **先读这条，否则第 3 步必然失败。** 备份目录是 `0700 root`，而 `pg_restore` 要以 `postgres`
> 用户身份运行 —— 它既进不去这个目录，也读不到里面的 dump，报错是
> `could not open input file ... No such file or directory`（**误导性报错**：文件在，只是没权限）。
> 所以必须先把 dump 暂存到 `postgres` 读得到的位置。dump 里是真实用户数据，
> 暂存副本要 `0600` 且属主为 `postgres`，用完立刻销毁。
>
> 这个坑是 2026-08-11 第一次真跑演练时发现的 —— 在那之前本文档写的流程从来没能执行成功。

```bash
# 0. 换到一个 postgres 用户 cd 得进去的目录，否则每条 sudo -u postgres 都会刷
#    "could not change directory to ..." 的警告
cd /tmp

DUMPDIR=/var/backups/mrright-portfolio
DUMP=$(ls -t $DUMPDIR/*.dump | head -1)   # 或手工指定某一份

# 1. 校验归档完整性
sha256sum -c "$DUMP.sha256"

# 2. 建一个临时库
sudo -u postgres createdb mrright_restore_drill

# 3. 把 dump 暂存到 postgres 可读处，再恢复
install -m 0600 -o postgres -g postgres "$DUMP" /tmp/restore-drill.dump
sudo -u postgres pg_restore \
  --dbname=mrright_restore_drill \
  --no-owner --no-privileges \
  /tmp/restore-drill.dump

# 4. 抽查关键表行数，和生产对比量级
sudo -u postgres psql -d mrright_restore_drill -c "
  SELECT 'visitor_users' AS t, count(*) FROM visitor_users
  UNION ALL SELECT 'community_posts', count(*) FROM community_posts
  UNION ALL SELECT 'community_uploads', count(*) FROM community_uploads
  UNION ALL SELECT 'download_requests', count(*) FROM download_requests
  UNION ALL SELECT 'project_comments', count(*) FROM project_comments;"

# 表数量也要对齐（缺表说明归档不完整，光看行数看不出来）
sudo -u postgres psql -d mrright_restore_drill -At -c \
  "select count(*) from information_schema.tables where table_schema='public';"

# 5. 销毁暂存副本（它含真实用户数据；这不是备份本体，删它不影响备份）
shred -u /tmp/restore-drill.dump

# 6. 清理演练库（只删演练库，不要碰 mrright_portfolio）
#    注意：CLAUDE.md 第 11 条禁止 DROP DATABASE，执行前需要用户明确确认。
sudo -u postgres dropdb mrright_restore_drill
```

判定标准：`pg_restore` 无错误、**表数量与生产一致**、关键表行数与生产同量级，
且抽查到的内容是真实数据而不是空表。只有归档能被 `pg_restore` 解析还不够 ——
备份脚本已经在每次备份时做过那一层校验了，演练要验的是**还原出来的东西真的对**。

把每次演练的日期和行数记进 `PROJECT_PROGRESS.md`。

## 真实灾难恢复

发生数据丢失时：

1. **先停服务**，避免新写入覆盖判断依据：`systemctl stop mrright-portfolio`
2. 按上面的步骤恢复到**新库**（例如 `mrright_portfolio_recovered`），不要覆盖原库 ——
   原库即使损坏也可能保有备份之后的增量数据。
3. 核对数据后，修改 `/etc/mrright-portfolio.env` 中的 `DATABASE_URL` 指向新库。
4. `systemctl start mrright-portfolio`，按 `CLAUDE.md` 第 9 条逐项验证线上接口。

## 应用目录备份（部署脚本产生，与上面的数据库备份是两回事）

`scripts/deploy-vps.mjs` 在每次部署前把 `/opt/mrright-portfolio` 备份成
`/opt/mrright-portfolio.backup-YYYYMMDD-HHMMSS`。它的用途是**回滚点**，不是数据备份。

**2026-08-12 起改为硬链接备份。** 此前是 `cp -a` 全量拷贝，每份 351M，其中 252M 是
`public/uploads` 的逐字节重复副本；攒到 15 份占了 5.2G，磁盘一度到 78%。现在用 `cp -al`，
未被这次部署改动的文件只占一个目录项，一份备份的增量成本降到代码那部分。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VPS_BACKUP_RETAIN` | `3` | 保留最近 N 份应用备份，更旧的在部署验证通过后删除 |
| `VPS_BACKUP_RETAIN=0` | — | 关闭自动裁剪，永不删除（仍然享受硬链接省空间） |

裁剪的三个约束：

1. **只在部署健康检查通过之后执行。** 远程脚本是 `set -euo pipefail`，部署中途失败会在裁剪
   之前中止，所以失败的部署不会损失任何回滚点。
2. **只匹配脚本自己写出的时间戳格式**（`.backup-` + 8 位日期 + `-` + 6 位时间）。
   手工命名的目录（例如 `…​.backup-before-migration`）永远不是删除候选。
3. **env 备份不裁剪。** `/etc/mrright-portfolio.env.backup-*` 每份约 1KB，不是磁盘压力来源，
   而它是 env 文件损坏时唯一的退路。

### 硬链接备份的使用约束（重要）

硬链接备份和 live 目录**共享 inode**。任何**原地写入**（追加、截断后重写）会同时改掉所有备份里
的那份。因此：

- 不要用 `>>` 往 `/opt/mrright-portfolio` 里的文件追加内容；
- 不要在服务器上原地编辑该目录下的文件。`sed -i` 与 `vim` 是安全的（它们写临时文件再 rename，
  换掉 inode），但 `echo x >> file` 不是。

代码侧已知的唯一原地追加点是 `data/` 下的 `.jsonl`（`contactMessagesStore` /
`downloadRequestsStore` 用 `appendFile`）。这两个 store 只在 `DATABASE_URL` 缺失时才加载
（见 `server/index.js:108`），生产环境走 Postgres 用不到，但 `data/` 只有 ~17KB，
**所以备份脚本对它做真实拷贝而不是硬链接**，不去赌那个前提永远成立。

同理，解包用 `tar --unlink-first`：`package.json` 和 `package-lock.json` 不在被 `rm -rf`
的列表里，会被直接覆盖到备份仍然链接着的路径上。GNU tar 1.35 默认就是先 unlink，所以这不是在修
现存 bug，而是把行为钉死 —— `--overwrite`（可由 `TAR_OPTIONS` 环境变量注入）会把它翻转成原地
截断，那样就会写穿到刚做好的备份里。

### 验证

`npm run test:deploy-backup` 在临时目录上跑部署脚本里**同一份** shell 片段（两者从
`scripts/lib/deploy-backup-script.mjs` 导入同一个字符串，不存在测试与实现漂移），断言：
uploads 共享 inode 且增量成本远低于全量、`data/` 未被硬链接且追加不污染备份、
回滚点在新版本解包后仍是旧代码、裁剪保留最新 N 份且不碰手工命名的目录、`retain=0` 确实不删。
CI（`.github/workflows/web.yml` 的 checks job）会跑它。

## 已知缺口

- 只有每日全量，没有 WAL 归档 / PITR。最坏情况丢失 24 小时数据。
  数据量增长后应升级为 `archive_mode=on` + 基础备份。
- 上传文件（`public/uploads`）不在这份备份里，由上面的应用目录备份覆盖。注意它防得住什么：
  live 文件被删或被替换时，备份那一份链接仍在（`unlink` 只减少链接数），所以**误删是防得住的**；
  但它和 live 在**同一块磁盘、同一个 inode 上**，磁盘损坏、文件系统损坏、以及任何原地写入
  都会让 live 和全部备份一起完蛋。上传文件仍然没有任何异地副本，建议纳入同一个 rclone 目标。
