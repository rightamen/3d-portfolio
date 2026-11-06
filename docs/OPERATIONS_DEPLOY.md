# 部署

状态：2026-08-13 起 `npm run deploy:vps` 支持 **SSH 密钥认证**，这台工作机上可以直接跑。

在此之前它只会 ssh2 的**密码认证**，要求 `VPS_HOST` + `VPS_PASSWORD`，而工作机上只有密钥、
没有密码，所以这条命令实际上是跑不了的 —— 2026-08-12（第七轮）那次部署是**临时拼一份等价的
远端脚本再 `ssh bash -s`** 完成的。能拼对是因为脚本片段是 import 来的，但那条路径没有固化、
没有测试，也没人能保证下次拼得一样。这份文档描述的就是把它固化之后的样子。

## 2026-11-06：统一制品入口

`release:vps` 和 `deploy:vps` 现在共用 `scripts/lib/create-release.mjs`：
先拒绝未提交源码，再重新 build，写 Git SHA 清单、按白名单打包，并生成 SHA-256 sidecar。
构建/打包期间若源码变脏或 HEAD/分支改变则拒绝发布，保留上一份制品。
自动部署还通过 `git ls-remote origin` 确认对应分支上的提交与制品 SHA 完全一致，
失败发生在建立 VPS 连接之前。打包命令不连接 VPS；手工上传前也必须先 push GitHub。

两条路径共用同一个远端脚本生成器；远端先验制品 SHA-256，才备份配置、替换程序。
应用备份默认全部保留（`VPS_BACKUP_RETAIN=0`）。数据库备份仍需按
[备份文档](OPERATIONS_BACKUP.md)单独创建并验证，这次未改变数据库备份机制。

先按项目要求运行 build/lint、提交并推送，再执行下面的部署命令。

## 日常部署

```sh
npm run deploy:vps
```

默认走**密钥认证**，默认目标是 `147.79.20.232`。整条流程：

1. 检查 Git 干净、读取当前提交和分支，再 `npm run build`
2. 打包 `dist server scripts package.json package-lock.json` → `.deploy-tools/mrright-portfolio-release.tar.gz`
3. 写 `dist/release.json`、制品旁的 `.sha256`；验证打包前后源码仍为同一干净提交
4. 验证相同 origin 分支已推送该提交；生成包含制品校验值的远端脚本
5. 上传制品与脚本到 `/tmp/`，远端执行并实时回显
6. 收尾再查一次 `/api/health`

远端脚本自己会做的事，按顺序：

- 校验上传制品 SHA-256，错误立即退出，不备份/替换任何线上文件
- 检查 `/etc/mrright-portfolio.env` 里 `DATABASE_URL`、`ADMIN_TOKEN` **有值**（不打印值），
  缺了就直接退出，**永远不会重写这个文件**
- 备份 env 与 `/opt/mrright-portfolio`（**硬链接备份**，见 `OPERATIONS_BACKUP.md`）
- 解包、`npm ci --omit=dev`、重启服务
- **轮询**等 `/api/health` 起来（最多 30 次，每次间隔 1 秒）
- 用 `ADMIN_TOKEN` 换一个**短时会话**去查 `/api/admin/summary`，**用完必定吊销**
  （见 `OPERATIONS_ADMIN_AUTH.md`）
- 默认保留全部应用备份；只有显式设置正数保留份数时，才在健康后启用已有裁剪逻辑

nginx vhost 与 systemd unit **只在缺失时才写**。默认不重写是有原因的：生成的模板是
HTTP-only 的，而线上 443 是与机场节点共用的 nginx stream 分流，**重写 vhost 会丢 TLS**
（必读 `OPERATIONS_CLIENT_IP.md`）。要重写得显式 `VPS_REWRITE_NGINX=true`。

## 先看脚本，不连服务器

```sh
VPS_DRY_RUN=true npm run deploy:vps   # 打印将在 VPS 上执行的完整脚本后退出
```

不连接、不打包、不需要先 build；打印脚本里的全零 SHA-256 是占位值，不能用于真实发布。远端那半段是**没有撤销键**的部分（报错时 env 已备份、
制品已解包、服务正要重启），能先读一遍是有意义的。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VPS_AUTH` | 有 `VPS_PASSWORD` 则 `password`，否则 `key` | 认证方式 |
| `VPS_HOST` | `147.79.20.232` | 目标主机 |
| `VPS_PORT` / `VPS_USER` | `22` / `root` | |
| `VPS_SSH_KEY` | 无（用 ssh 默认查找顺序） | 传给 `ssh -i` |
| `VPS_PASSWORD` | 无 | 仅 `VPS_AUTH=password` 时需要 |
| `VPS_DRY_RUN` | `false` | 只打印远端脚本 |
| `VPS_REMOTE_DIR` | `/opt/mrright-portfolio` | |
| `VPS_SERVICE` | `mrright-portfolio` | |
| `VPS_ENV_FILE` | `/etc/mrright-portfolio.env` | |
| `VPS_APP_ORIGIN` | `http://127.0.0.1:4173` | 服务在 VPS 本机上的监听地址 |
| `VPS_BACKUP_RETAIN` | `0` | 默认全部保留；显式正数启用已有裁剪逻辑 |
| `VPS_REWRITE_NGINX` / `VPS_REWRITE_SERVICE` | `false` | 重写 vhost / unit（先读上面的警告） |

## 开启收款

**没有服务端环境变量。** 收款是**按创作者**开启的,不是按站点——
平台不收款,也就没有一个全站的商户身份可配。

创作者在 `/account` 设置里填自己的收款方式(支付宝/微信/转账,最多 4 个),
填了就能卖,清空就停售。

⚠️ **收款码必须是站内上传的图片**(`/uploads/images/...`)。
外链会把收款码的可用性交给别人的服务器,而且等于允许创作者把买家
指向互联网上任意一张图。

⚠️ **抽成恒为 0**,而且是 `platformFeeBasisPoints()` 里强制的,不是默认值——
平台没经手的钱不能抽成,否则创作者看到的到账数字和实际收到的对不上。

### 纠纷时去哪里看

**先去管理台的「订单」一节**（2026-09-09 起）：久未确认的排在最前，
点「完整经过」展开凭证链和买家当初看到的收款方式。下面是对应的接口，
需要脚本化时用：

| 要查什么 | 在哪 |
|---|---|
| 一笔订单的完整经过 | `GET /api/admin/orders/:id/events` |
| 买家当时被展示的收款方式 | 同上,`paymentMethods`(取自订单快照,**不是创作者当前的设置**) |
| 买家说付了、没人确认的单 | `GET /api/admin/orders/stale?hours=48` |
| 谁在什么时候下载了什么 | `download_events` 表 |

⚠️ **`order_events` 是只追加的**,`ordersStore` 里没有任何更新或删除它的方法。
一条能被改写的记录不叫记录。

⚠️ **平台无法强制退款**——它没拿着钱。能做的是停售、封号、以及把上面这些
记录拿出来。这一点必须让买家事先知道。

## 代码是怎么分层的

| 文件 | 职责 |
| --- | --- |
| `scripts/deploy-vps.mjs` | 读环境变量、校验 GitHub 已推送、上传、驱动流程 |
| `scripts/lib/create-release.mjs` | 两入口共用：干净 Git、重新构建、manifest、制品与 SHA-256 |
| `scripts/lib/deploy-remote-script.mjs` | **生成远端脚本**（两种认证方式共用同一份） |
| `scripts/lib/ssh-transport.mjs` | 两种传输方式，同一个接口（`run` / `upload` / `end`） |
| `scripts/lib/deploy-backup-script.mjs` | 备份 / 健康检查 / admin 校验 的 shell 片段 |

两点是刻意这么设计的：

- **远端脚本只有一个生成器。**「密钥这条路和密码那条路做的事一样」因此是代码的性质，
  而不是文档里的一句承诺。
- **脚本是先上传成文件再执行的**，不是喂给 `bash -s`。喂 stdin 的话脚本正文占着 stdin，
  中途任何读 stdin 的命令都会把剩下的脚本吃掉；用文件还能在部署半途失败时留下现场。

密钥这条路直接调系统 `ssh` 而不是教 ssh2 认密钥：`~/.ssh/config`、agent、`known_hosts`、
硬件密钥这些东西系统客户端本来就都会处理，没有理由在这个脚本里重新实现一遍。

## 测试

```sh
npm run test:release          # 临时 Git 仓库、构建、tar、校验、未推送拒绝
npm run test:deploy-script    # 不连服务器
npm run test:deploy-backup    # 真 bash + 临时目录
```

`test:deploy-script` 断言四件事：生成的脚本 `bash -n` 通过（四种 rewrite 组合都测）；
环境变量里的值**都被正确引号包住**（用一个带引号、空格和 `$(...)` 的恶意路径试注入）；
脚本正文里**不含任何密钥**（`ADMIN_TOKEN` 是在服务器上从 env 文件读的）；
两种认证方式生成的远端脚本**逐字节相同**。

`test:deploy-backup` 覆盖的是硬链接备份与裁剪那部分的真实文件系统行为，见
`OPERATIONS_BACKUP.md`。

## 回滚

备份目录就是回滚点：

```sh
systemctl stop mrright-portfolio
mv /opt/mrright-portfolio /opt/mrright-portfolio.failed-$(date +%Y%m%d-%H%M%S)
cp -a /opt/mrright-portfolio.backup-<时间戳> /opt/mrright-portfolio
systemctl start mrright-portfolio
```

`cp -a` 而不是 `mv`：备份之间是硬链接共享的，**保留原备份目录**才不会把回滚点用掉。

## 手工部署（拿不到 SSH 的时候）

```sh
npm run release:vps
```

打出制品并打印一份可以手工粘贴执行的等价脚本（`scripts/package-vps-release.mjs`，
与自动路径共用 create-release 和 buildRemoteScript，不再维护第二份 shell 正文）。
