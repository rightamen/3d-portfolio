# 真实客户端 IP 不可得：现状、原因与已接受的取舍

状态：2026-08-11 查明并**决定不修**。这份文档解释为什么，以及在这个前提下哪些安全控制仍然有效、
哪些必须换一种做法。

## 现象

从外部请求 `https://mrright.blog`，应用侧 `GET /api/admin/diagnostics` 返回：

```
resolvedIp     127.0.0.1
forwardedFor   127.0.0.1
protocol       https
trustProxyHops 1
```

也就是说，**每一个 HTTPS 访客在应用眼里都是 127.0.0.1**。这不是 `trust proxy` 配错，
调整跳数救不回来 —— 信息在到达应用之前就已经丢失了。

## 原因：443 端口由网站和机场节点共用

```
客户端 ──443──> nginx stream 块（ssl_preread，按 SNI 分流）
                        │
                        ├── SNI = mrright.blog / www ──> 127.0.0.1:9444  （nginx TLS vhost → node:4173）
                        └── SNI = 其它（default）    ──> 127.0.0.1:9443  （sui / sing-box，机场节点）
```

nginx 的 **stream 模块是四层裸 TCP 转发**：它不解析 HTTP，因此不会写 `X-Forwarded-For`，
并且以本机身份连接后端。内层 vhost 的 `$remote_addr` 因此永远是 `127.0.0.1`，
它据此生成的 `X-Forwarded-For: 127.0.0.1` 从源头就是错的。

对照证据：**80 端口是直接监听、不经分流**，所以它的 access log 里是真实 IP
（`152.32.131.245`、`45.205.1.131` 等）。只有 443 的流量会塌缩。

## 为什么不修

标准修法是在 stream 与内层 vhost 之间启用 PROXY protocol：

```nginx
# stream server：  proxy_protocol on;
# 内层 vhost：      listen 127.0.0.1:9444 ssl http2 proxy_protocol;
#                  set_real_ip_from 127.0.0.1;
#                  real_ip_header proxy_protocol;
```

**但 `proxy_protocol on;` 是加在 stream 的 server 块上的，对 map 解析出的所有后端一起生效**，
包括 `127.0.0.1:9443` 的 sing-box。sing-box 会在 TLS 握手最前面收到一段无法解析的 PROXY 头，
**机场节点会对所有用户失效**，除非同时给它的 inbound 打开 proxy_protocol 接收。

nginx stream 也无法按 map 的分支条件性地只对某一个后端启用 proxy_protocol；
串两跳同样无效，因为第二跳看到的已经是 `127.0.0.1`。

结论：**为了网站的 IP 限流去改动一个正在服务用户的机场节点，风险与收益不成比例。**
决定维持现状。

## 受影响 / 不受影响

**受影响：**

| 项 | 后果 |
| --- | --- |
| 所有按 IP 的 express-rate-limit | 全站共用一个桶。一个攻击者可以吃掉全局配额，把正常用户挤掉 |
| `download_requests.ip`、`admin_sessions.ip` | 记录的永远是 `127.0.0.1`，审计价值为零 |
| 匿名点赞去重（改造前） | 曾经依赖 `IP + UA`，IP 恒定后退化成「按浏览器 UA 去重」——**已改为签名 Cookie，见下** |

**不受影响（这是重点）：**

| 项 | 为什么仍然有效 |
| --- | --- |
| 登录失败锁定 | 计数落在 `visitor_users` 行上，与来源地址无关 |
| 验证码 / 密码重置尝试预算 | 同上，按账号计数 |
| 上传配额 | 按账号在滚动窗口内统计文件数与字节数 |
| 登录用户的点赞去重 | 按账号 id |
| 所有认证与授权 | 从不依赖 IP |

**所以密码爆破防护是完好的。** IP 限流失效是可用性问题，不是数据安全问题 ——
这正是当初刻意把攻击预算放在账号维度、而不是只依赖 IP 限流的原因。

## 补偿措施

既然 IP 不可用，任何需要「区分匿名访客」的功能都不能建立在 IP 上：

1. **匿名点赞**改用**服务端签发的签名 Cookie** 作为身份，完全不依赖 IP。
   客户端伪造不了签名；清 Cookie 可以再点一次，门槛远高于原先改一个 localStorage 字符串。
2. **匿名项目评论**改用「先审后发」而不是靠 IP 限流拦截刷屏。

## 如果以后想真正修好

代价最小的路径是**把 mrright.blog 放到 Cloudflare 橙云后面**：

`CF-Connecting-IP` 位于 TLS 载荷**内部**，stream 层是裸 TCP 透传，不会破坏它。
因此只需要改网站自己的 vhost，机场那一路完全不用碰：

```nginx
# 只加在 server { listen 127.0.0.1:9444 ssl ... } 里
set_real_ip_from 127.0.0.1;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

前置条件与注意事项：

- `mrright.blog` 目前解析到 `147.79.20.232`（灰云 / 仅 DNS），必须先开橙云，否则没有这个头。
- **机场用的域名（`jp.mrright.blog` 或其它走 `default` 分支的 SNI）必须保持灰云。**
- 开橙云后别人仍可直连 `147.79.20.232` 并伪造 `CF-Connecting-IP`，要堵死需要开
  Cloudflare Authenticated Origin Pulls。
- 改完用 `GET /api/admin/diagnostics` 从外部复验：`resolvedIp` 应等于你的真实公网 IP。

## 复验方法

任何时候想确认现状，从**外部**（不是在 VPS 上）执行：

```bash
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" https://mrright.blog/api/admin/diagnostics
```

`resolvedIp` 是 `127.0.0.1` 就说明仍是本文描述的状态。
