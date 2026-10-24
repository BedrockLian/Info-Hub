# 云端完全清理与原域名内网穿透评估

日期：2026-10-24，北京时间。结论：云端Info-Hub专属资源已清除；原域名可用于内网穿透，SSH反向转发已通过一次临时回环实测。没有发布真实内网服务，域名仍返回410。

## 云端清理

本轮授权范围是“云端情报站全部清空”。在10月23日已删除新闻数据库、运行缓存和历史备份的基础上，本次进一步删除：

- 整个`/opt/infohub`，包括全部版本代码、current标记、共享运行密钥与配置、昨日保留的来源／管理员／费用记录；没有再创建其备份。
- 27个本站程序、Pi／日报验收及RSSHub镜像引用。
- 109条已逐项审阅描述、确认属于本站构建且均未使用的缓存记录；按快照中的ID过滤清理，未使用全局system prune。
- 4个早期匿名PostgreSQL测试卷。删除前检查无容器引用，卷内数据库名分别对应`infohub_rsshub_test`、`infohub_rsshub_pool_test`、RSS清洗测试组和缓存验收测试组，确认归属后才删除。
- 无连接容器的`infohub_default`专属网络。

本轮文件系统可用空间增加5,063,372,800字节，约5.06GB（4.72GiB）。清理后系统盘约11GiB已用、30GiB可用。Docker构建缓存为0、数据卷为0、容器为0；仅留下通用Node/PostgreSQL基础镜像及Docker引擎，没有Info-Hub或RSSHub镜像引用。

保留`news.blian117.dpdns.org`的DNS、HTTPS证书及返回410的Nginx域名配置，以便后续复用。共享Nginx、PHP、MySQL和其他站点未改动；另一站点vhost配置SHA-256前后一致。宿主机原有PostgreSQL位于`/var/lib/trendradar-postgres`，其目录标识未变，与本次删除的Docker测试卷无关。

本次只清理云端。此前本地`.data`等目录清理被自动审批拒绝的状态不变，不计为本轮已删除。

## 域名与连接条件

| 条件 | 实测 |
|---|---|
| 原域名 | `news.blian117.dpdns.org` |
| A记录 | `43.128.10.41`，仍指向现有云主机 |
| IPv6 | 本次查询没有AAAA答复 |
| 权威DNS | `blian117.dpdns.org`使用Cloudflare名称服务器；未核验Cloudflare账户权限 |
| HTTPS | 现有证书覆盖原域名，有效至2026-12-07 |
| 外部连接 | 当前本机可以通过已有认证连接云端SSH；域名HTTP／HTTPS均可访问并返回410 |
| SSH转发配置 | `AllowTcpForwarding yes`、`DisableForwarding no`、`GatewayPorts no`、`PermitListen any` |
| 端口占用 | 旧18082端口空闲；临时测试19190端口已释放 |

## 临时反向转发实测

北京时间11:41:08，在本机创建只监听`127.0.0.1`的随机端口HTTP测试服务，建立仅监听云端`127.0.0.1:19190`的短时SSH反向转发。通过同一SSH会话让云端curl访问该回环端口，收到本机生成的一次性验证内容，成功请求1次。SSH命令退出后核对云端监听已消失，本地测试服务关闭。

测试没有修改DNS、Nginx或SSH配置，没有新建账号、常驻进程或开机任务，没有转发真实业务，也没有向公网开放测试端口。它验证了“当前本机到云主机的SSH反向TCP链路”；真实应用、长期稳定性及业务鉴权尚未测试。

## 推荐方案

如果目标是本机或内网的网页／API，优先复用现有SSH与Nginx：

```text
浏览器 HTTPS
  → news.blian117.dpdns.org:443
  → 云端Nginx
  → 云端127.0.0.1上的转发端口
  → SSH加密连接
  → 内网机器上的目标HTTP服务
```

当前DNS和证书可继续使用，云端转发端口只需回环监听，公网仍通过既有HTTPS入口进入；无需把GatewayPorts改为yes。OpenSSH的[-R与回环绑定语义](https://man.openbsd.org/ssh.1#R)及Nginx的[HTTP反向代理](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)支持这一链路。

| 方案 | 适合情况 | 本轮结论 |
|---|---|---|
| SSH反向转发＋Nginx | 一个或少量网页／API，复用现有云主机 | 首选，反向TCP链路已实测；真实业务路由待配置 |
| frp | 多服务、多机器，或需要TCP／UDP、游戏端口等 | 支持范围合适，但需要部署服务端／客户端并按协议规划端口；本轮未安装 |
| Cloudflare Tunnel | 希望由Cloudflare承接网页入口，避免使用该VPS做中转 | 可选；已有Cloudflare权威DNS是线索，但仍需确认账户／域名管理权限及内网出站连通性，本轮未验证这些条件 |

frp的协议支持和域名映射依据[官方介绍](https://gofrp.org/en/docs/overview/)及[域名访问内网网页示例](https://gofrp.org/en/docs/examples/vhost-http/)。Cloudflare Tunnel通过本地`cloudflared`发起出站连接并映射公开主机名，见[官方说明](https://developers.cloudflare.com/tunnel/)。不要把普通Nginx HTTPS反代当成任意UDP或游戏协议代理；具体选型取决于目标服务。

## 正式启用前需要确定

1. 目标机器和地址／端口，服务是网页、API还是其他协议。
2. 公开访问还是仅自己访问，以及由应用登录或入口鉴权保护。
3. 常驻与断线重连方式；正式使用时采用独立、限制转发端口的隧道身份，避免长期依赖root管理密钥。
4. 若使用本机浏览器登录、WebSocket或大文件上传，核验应用的外部URL、代理头、长连接与上传配置。
5. 切换域名vhost时移除410停用页和`Clear-Site-Data`清理头，再配置业务反代；否则会继续清理新服务的浏览器存储。确认12月7日前的证书续期路径，按实际配置选择HTTP挑战或DNS挑战。

这些属于后续开通工作。本轮没有改变域名当前用途或对外发布任何内网业务。

## 最后复核

- `/opt/infohub`不存在，无Info-Hub容器、卷、网络或镜像；构建缓存为0。
- HTTP／HTTPS仍返回410，Nginx全局配置检查通过，18082和临时19190端口均无监听。
- 其他站点vhost配置哈希未变；PHP／MySQL及TrendRadar PostgreSQL保留。
- 同机PHP-FPM本次实测为8.2.35，与10月23日检查时不同；本任务没有修改或升级PHP。
