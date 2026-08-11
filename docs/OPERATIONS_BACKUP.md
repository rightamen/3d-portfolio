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

## 已知缺口

- 只有每日全量，没有 WAL 归档 / PITR。最坏情况丢失 24 小时数据。
  数据量增长后应升级为 `archive_mode=on` + 基础备份。
- 上传文件（`public/uploads`）不在这份备份里，由部署脚本的目录备份覆盖，
  但同样没有异地副本 —— 建议纳入同一个 rclone 目标。
