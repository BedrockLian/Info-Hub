# Radar / Info-Hub 重写交接：需求、SSH、域名与 RSS 修缮

交接日期：2026-10-10（北京时间）。本文件可单独交给接手开发者，无需沿用旧项目代码。地址来自当前本机配置及删除前的生产数据库，不包含密码、私钥、会话或供应商密钥。

## 1. 重写范围与云端状态

用户决定放弃当前实现、重新开发，并授权删除云端 Radar 站点。此次仅处理 `43.128.10.41` 上的 Radar 专属资源，不删除本地源码、不操作其他云服务器。新闻业务模型仍停用；交接与重写决定不自动恢复模型调用。

删除前实测：SSH 成功；当前发布 `/opt/radar/releases/20261009-radar-detail-layout-03`；`radar-api`、`radar-web`、`radar-worker`、`radar-database` 均 active/enabled。删除结果见本文末尾回执；不要将此段当作删除后的状态。

## 2. 重写时接入的域名

| 项目 | 地址或说明 |
| --- | --- |
| 应用域名 | `news.blian117.dpdns.org` |
| HTTPS 入口 | `https://news.blian117.dpdns.org` |
| 原工作台 | `https://news.blian117.dpdns.org/workbench`；重写可重新设计路径 |
| 原登录页 | `https://news.blian117.dpdns.org/admin/login` |
| 原部署服务器 IPv4 | `43.128.10.41` |
| 原代理方式 | 共享 Nginx 将该域名转发至 `127.0.0.1:18082` |
| 必须保留的其他站点 | `bedrock117.dpdns.org`，与 Radar 无关，禁止覆盖其配置、目录、证书或数据库 |

复用原服务器时，确认该子域名的 DNS A 记录指向 `43.128.10.41`；换服务器时，只修改 `news.blian117.dpdns.org` 对应的记录，并检查是否存在需要更新的 AAAA/CDN 配置。此次没有修改 DNS，也没有登录域名管理平台；上述 IP 是原部署目标，不是对当前 DNS 控制台记录的验证。

只接入这个子域名，不改父域 `blian117.dpdns.org`、其他子域或其他站点。重写应用使用独立端口、服务、目录与数据库；确认新版本后再替换该域名的退役响应。

## 3. SSH 详细接入方法（Windows PowerShell）

| 项目 | 值 |
| --- | --- |
| SSH 别名 | `campus-server` |
| 地址 / 端口 / 用户 | `43.128.10.41` / `22` / `root` |
| 主机名（本次实测） | `VM-0-4-opencloudos` |
| 认证方式 | 现有 Ed25519 私钥；本次密钥认证成功 |
| SSH 配置 | `C:\Users\ASUS\.ssh\config` |
| 私钥路径 | `C:\Users\ASUS\.ssh\id_ed25519` |
| 公钥路径 | `C:\Users\ASUS\.ssh\id_ed25519.pub` |
| 可信主机记录 | `C:\Users\ASUS\.ssh\known_hosts` |

### 3.1 在当前电脑连接

先检查系统 OpenSSH 与配置，以下步骤不连接服务器：

```powershell
Get-Command ssh
ssh -V
ssh -G campus-server | Select-String '^(hostname|user|port|identityfile|identitiesonly|stricthostkeychecking) '
```

本机别名对应配置如下；只用于核对，不要覆盖其他主机条目：

```sshconfig
Host campus-server
    HostName 43.128.10.41
    User root
    Port 22
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

只读连接验证（可直接复制）：

```powershell
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 campus-server "hostname; id -un"
```

交互登录：

```powershell
ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=10 campus-server
```

不用别名的连接：

```powershell
ssh -p 22 -i "C:\Users\ASUS\.ssh\id_ed25519" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 root@43.128.10.41
```

输入 `exit` 退出。自动化使用 `BatchMode=yes`，不回落到交互密码登录。本机共享 SSH 配置原为 `StrictHostKeyChecking=accept-new`，上述命令显式覆盖为 `yes`，未改动全局配置。

### 3.2 主机指纹与新电脑接入

当前可信电脑的 known_hosts 记录指纹如下（主机公钥指纹可公开，不是私钥）：

| 算法 | SHA-256 指纹 |
| --- | --- |
| ED25519 | `SHA256:TtqUknO3nzVo19SaK2YdX8B82zo/5sNskeFbJqioLyk` |
| RSA | `SHA256:unywRck22+1g6ymQGSp996GDsbdbWWwYnLwUAKJvEpE` |
| ECDSA | `SHA256:KdnQsxTTKBiLkdDH0Ts2K6ES22nO9+mb732DZLlXty0` |

在可信电脑重新核对：

```powershell
ssh-keygen -F 43.128.10.41 -f "C:\Users\ASUS\.ssh\known_hosts" | ssh-keygen -lf -
```

新电脑需要自己的 SSH 客户端、获授权的登录密钥和可信主机记录。优先在新电脑生成独立密钥，由已有访问权限的管理员把新公钥追加到服务器 `/root/.ssh/authorized_keys`；不要覆盖已有公钥。也可由密钥所有者通过安全渠道迁移现有私钥，但不要放入交接文档、仓库、聊天或发布包。

在可信旧电脑导出该主机的公开可信记录：

```powershell
ssh-keygen -F 43.128.10.41 -f "C:\Users\ASUS\.ssh\known_hosts" | Set-Content -Encoding ascii "$env:USERPROFILE\campus-server.known_hosts"
```

将此公开记录文件安全传至新电脑并核对上表指纹，可先通过 `-o UserKnownHostsFile="记录文件的实际路径"` 指定它，再使用 `StrictHostKeyChecking=yes` 登录。配置中的私钥路径需改为新电脑的实际路径。指纹发生变化时先核实是否重装或换机；不关闭主机校验，也不盲删 known_hosts。

### 3.3 文件传输与本地隧道

传输指定文件的语法（仅供未来部署使用；替换实际文件名）：

```powershell
scp -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 "C:\实际目录\release.tar.gz" campus-server:/tmp/new-radar-release.tar.gz
```

传输不等于部署。重写后若应用仍监听云端 `127.0.0.1:18082`，可建立仅本机可见的隧道：

```powershell
ssh -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -N -L 127.0.0.1:28082:127.0.0.1:18082 campus-server
```

访问 `http://127.0.0.1:28082`，按 Ctrl+C 关闭。删除旧项目后没有应用监听原端口，此命令不会恢复应用。原网站认证受 HTTPS/Cookie 配置约束，正式访问使用域名 HTTPS。

### 3.4 常见问题

| 现象 | 排查 |
| --- | --- |
| 别名不存在 | 确认以 ASUS 用户运行；检查配置路径；改用明确地址与私钥路径 |
| `Permission denied (publickey)` | 核对 root、密钥路径、公钥授权和 IdentitiesOnly；不要打印私钥 |
| 主机指纹变化 | 先与可信记录核对；不绕过校验 |
| 超时 | 检查服务器在线状态、网络与云防火墙 TCP 22 |
| 私钥权限过宽 | 限制为密钥所有者可读；不要给 Everyone/Users 读取权限 |
| 隧道端口占用 | 更换本机端口，保持只监听 127.0.0.1 |

SSH 密码登录是否启用未验证；网站密码不等于 SSH 密码。旧应用凭据不会在本文提供，重写应重新生成应用和数据库凭据。

## 4. 完整来源 RSS 清单

2026-10-10 14:09（北京时间）只读查询生产 `sources` 表：58 个 RSS 信源，52 个启用、6 个禁用；地址与启用状态和本地 `.local/legacy-config.json` 完全一致。以下保存原地址，未逐个联网验证来源当前可访问性；启用不代表健康。没有新增或自动修复来源。

禁用的 6 项使用 `https://legacy.invalid/...`，属于占位值，不是真实订阅地址；重写时保持禁用，取得有效地址后再决定是否启用。原信源默认只保留来源摘要和原文链接，RSS 地址不构成全文抓取或转载许可。

| ID | 来源 | 分类标签 | 原状态 | RSS 地址 |
| --- | --- | --- | --- | --- |
| radar-404-media | 404 Media | tech_ai | 启用 | <https://www.404media.co/rss/> |
| radar-aeon | Aeon | society_culture | 启用 | <https://aeon.co/feed.rss> |
| radar-ars-technica | Ars Technica | tech_ai | 启用 | <https://feeds.arstechnica.com/arstechnica/index> |
| radar-atlantic | The Atlantic | global_affairs | 启用 | <https://www.theatlantic.com/feed/all/> |
| radar-bbc-world | BBC 国际 | global_affairs | 启用 | <https://feeds.bbci.co.uk/news/world/rss.xml> |
| radar-bbc-zh | BBC 中文 | china_economy | 启用 | <https://feeds.bbci.co.uk/zhongwen/simp/rss.xml> |
| radar-bellingcat | Bellingcat | global_affairs | 启用 | <https://www.bellingcat.com/feed/> |
| radar-diplomat | The Diplomat | china_economy | 启用 | <https://thediplomat.com/feed/> |
| radar-dispatch | The Dispatch | global_affairs | 启用 | <https://thedispatch.com/feed/> |
| radar-dw-zh | 德国之声中文 | china_economy | 启用 | <https://rss.dw.com/rdf/rss-chi-all> |
| radar-engadget | Engadget | tech_ai | 启用 | <https://www.engadget.com/rss.xml> |
| radar-foreign-policy | Foreign Policy | global_affairs | 启用 | <https://foreignpolicy.com/feed/> |
| radar-ft-cn | FT 中文网 | china_economy | 启用 | <https://www.ftchinese.com/rss/news> |
| radar-game-developer | Game Developer | games | 启用 | <https://www.gamedeveloper.com/rss.xml> |
| radar-gamediscoverco | GameDiscoverCo | games | 启用 | <https://newsletter.gamediscover.co/feed> |
| radar-gematsu | Gematsu | games | 启用 | <https://www.gematsu.com/feed> |
| radar-guardian-china | 卫报：中国 | china_economy | 启用 | <https://www.theguardian.com/world/china/rss> |
| radar-guardian-world | 卫报：国际 | global_affairs | 启用 | <https://www.theguardian.com/world/rss> |
| radar-hacker-news | hacker-news |  | 禁用（占位） | `https://legacy.invalid/hacker-news` |
| radar-hani-en | hani-en |  | 禁用（占位） | `https://legacy.invalid/hani-en` |
| radar-hkfp | Hong Kong Free Press | china_economy | 启用 | <https://hongkongfp.com/feed/> |
| radar-icij | ICIJ | society_culture | 启用 | <https://www.icij.org/feed/> |
| radar-iran-international | Iran International | global_affairs | 启用 | <https://www.iranintl.com/en/feed> |
| radar-iranwire-en | iranwire-en |  | 禁用（占位） | `https://legacy.invalid/iranwire-en` |
| radar-japan-times | japan-times |  | 禁用（占位） | `https://legacy.invalid/japan-times` |
| radar-kyiv-independent | Kyiv Independent | global_affairs | 启用 | <https://kyivindependent.com/news-archive/rss/> |
| radar-kyiv-post | Kyiv Post | global_affairs | 启用 | <https://www.kyivpost.com/feed> |
| radar-meduza-en | Meduza English | global_affairs | 启用 | <https://meduza.io/rss/en/all> |
| radar-mit-technology-review | MIT Technology Review | tech_ai | 启用 | <https://www.technologyreview.com/feed/> |
| radar-nhk-economy | NHK 经济 | east_asia | 启用 | <https://news.web.nhk/n-data/conf/na/rss/cat2.xml> |
| radar-nhk-politics | NHK 政治 | east_asia | 启用 | <https://news.web.nhk/n-data/conf/na/rss/cat4.xml> |
| radar-nikkei-asia | Nikkei Asia | east_asia | 启用 | <https://asia.nikkei.com/rss/feed/nar> |
| radar-nintendo-life | Nintendo Life | games | 启用 | <https://www.nintendolife.com/feeds/latest> |
| radar-nk-news | nk-news |  | 禁用（占位） | `https://legacy.invalid/nk-news` |
| radar-npr-news | NPR News | global_affairs | 启用 | <https://feeds.npr.org/1001/rss.xml> |
| radar-nyt-cn | 纽约时报中文网 | china_economy | 启用 | <https://cn.nytimes.com/rss/> |
| radar-openai-news | OpenAI News | tech_ai | 启用 | <https://openai.com/news/rss.xml> |
| radar-pbs-newshour | PBS NewsHour | global_affairs | 启用 | <https://www.pbs.org/newshour/feeds/rss/headlines> |
| radar-pc-gamer | PC Gamer | games | 启用 | <https://www.pcgamer.com/rss/> |
| radar-playstation-blog | PlayStation Blog | games | 启用 | <https://blog.playstation.com/feed/> |
| radar-politico-eu | POLITICO Europe | global_affairs | 启用 | <https://www.politico.eu/feed/> |
| radar-propublica | ProPublica | society_culture | 启用 | <https://www.propublica.org/feeds/propublica/main> |
| radar-reason | Reason | global_affairs | 启用 | <https://reason.com/feed/> |
| radar-rest-of-world | Rest of World | tech_ai | 启用 | <https://restofworld.org/feed/> |
| radar-rfi-zh | 法广中文 | china_economy | 启用 | <https://www.rfi.fr/cn/rss> |
| radar-rock-paper-shotgun | Rock Paper Shotgun | games | 启用 | <https://www.rockpapershotgun.com/feed> |
| radar-rpg-site | RPG Site | games | 启用 | <https://www.rpgsite.net/feed> |
| radar-steam-news | Steam News | games | 启用 | <https://store.steampowered.com/feeds/news.xml> |
| radar-taipei-times | 台北时报 | china_economy | 启用 | <https://www.taipeitimes.com/xml/index.rss> |
| radar-techcrunch | TechCrunch | tech_ai | 启用 | <https://techcrunch.com/feed/> |
| radar-the-conversation | The Conversation | society_culture | 启用 | <https://theconversation.com/global/articles.atom> |
| radar-the-verge | The Verge | tech_ai | 启用 | <https://www.theverge.com/rss/index.xml> |
| radar-washpost-world | Washington Post World | global_affairs | 启用 | <https://feeds.washingtonpost.com/rss/world> |
| radar-wired | WIRED | tech_ai | 启用 | <https://www.wired.com/feed/rss> |
| radar-xbox-wire | Xbox Wire | games | 启用 | <https://news.xbox.com/en-us/feed/> |
| radar-yahoo-finance | yahoo-finance |  | 禁用（占位） | `https://legacy.invalid/yahoo-finance` |
| radar-yonhap-cn-economy | 韩联社中文：经济 | east_asia | 启用 | <https://cn.yna.co.kr/RSS/economy.xml> |
| radar-yonhap-cn-politics | 韩联社中文：政治 | east_asia | 启用 | <https://cn.yna.co.kr/RSS/politics.xml> |

分类是原信源配置的分类标签，重写可据此导入：`tech_ai` 科技与 AI、`games` 游戏、`society_culture` 社会与文化、`china_economy` 中国/经济/国际关系、`global_affairs` 全球政治与公共事务、`east_asia` 日本与韩国。表中 ID 是旧站稳定标识，不必继承其数据库结构。

## 5. Radar 自身的 RSS 输出地址（旧实现）

这些地址是 Radar 对外输出，不是上表的采集来源。删除旧站后均不再提供旧订阅内容；新项目若需要兼容，可重新实现路径。

| 旧地址 | 原用途 |
| --- | --- |
| `https://news.blian117.dpdns.org/feed.xml` | 精选摘要 |
| `https://news.blian117.dpdns.org/feed/full.xml` | 精选全文；仅允许再分发的内容内联全文 |
| `https://news.blian117.dpdns.org/feed/all.xml` | 全部动态输出；仍受原发布条件过滤，并非生产数据库的全部文章 |
| `https://news.blian117.dpdns.org/feed/daily.xml` | 日报 |
| `https://news.blian117.dpdns.org/feed/category/{slug}.xml` | 分类精选摘要 |
| `https://news.blian117.dpdns.org/feed/full/category/{slug}.xml` | 分类精选全文 |

旧输出分类 slug 来自上游分类：`ai-models`、`ai-products`、`industry`、`paper`、`tip`、`opinion`，与上面的六个来源分类标签不同，不能直接混用。路由见旧代码 `apps/api/src/routes/feeds.ts`、`industry/taxonomy.ts`。

删除前实测 `/feed.xml` 匿名 HTTPS 返回 401。原 RSS 必须使用有 read 权限的 Bearer 凭据或有效浏览器会话；普通阅读器若不支持认证，不能只粘贴地址订阅。不要把令牌放在 URL 中。此次没有创建新令牌或验证认证后的 RSS 内容。

## 6. 原部署位置与共享资源边界

下表用于识别旧资源、避免重写碰错位置；删除后的存在状态以回执为准。

| 路径 / 服务 | 原用途 |
| --- | --- |
| `/opt/radar/` | 应用发布、current 链接、专属数据库程序 |
| `/opt/radar-runtime/` | Radar 专用 Node 运行时；实际路径 `/opt/radar-runtime/current/bin/node` |
| `/var/lib/radar/` | 状态、部署记录和已有备份 |
| `/var/lib/radar-db/` | 专属 PostgreSQL 数据，原端口 55434 |
| `/etc/radar/` | 应用、会话、数据库与供应商私密配置 |
| `radar-api / radar-web / radar-worker / radar-database` | 四个专属 systemd 服务 |
| `/www/wwwroot/news.blian117.dpdns.org` | 该域名原站点根目录 |
| `/www/server/panel/vhost/nginx/news.blian117.dpdns.org.conf` | 原 Nginx 虚拟主机 |
| `/www/server/panel/vhost/nginx/proxy/news.blian117.dpdns.org/` | 原反向代理配置 |
| `/www/server/panel/vhost/cert/news.blian117.dpdns.org/` | 该域名 TLS 证书及私钥；不得输出私钥 |

共享 Nginx 程序是 `/www/server/nginx/sbin/nginx`，主配置 `/www/server/nginx/conf/nginx.conf`；不是 `/etc/nginx/conf.d` 布局。原 Web/API 只监听 `127.0.0.1:18082/18083`，数据库只监听 `127.0.0.1:55434`，不要直接开放公网。

`bedrock117.dpdns.org`、MySQL、PHP、共享 Nginx，以及独立的 `trendradar-postgres`（`/opt/postgresql18`、`/var/lib/trendradar-postgres`）不属于此次 Radar 删除范围。不得仅凭名称相似删除共享 PostgreSQL。

## 7. 云端删除回执

执行完成：2026-10-10 14:14:59（北京时间）。先完成生产信源导出，再按用户要求删除；没有调用业务模型，没有新增备份。

- 已停止并取消开机启动，随后删除四个 Radar 专属 systemd 服务及其附加配置。
- 已删除 `/opt/radar`（包括所有旧发布与专属数据库程序）、`/opt/radar-runtime`、`/var/lib/radar-db`、`/etc/radar` 和原 `/var/lib/radar`。旧应用凭据与生产数据库已不再可用。
- 已删除原站点根目录、专属代理及扩展配置、其他 Web 服务器的同域名站点配置、对应站点日志和 `/tmp` 下已核实的 Radar 发布包及脚本。面板数据库中的该站点与域名绑定记录已移除；其他站点记录逐行比较一致。
- 仅保留该域名证书和 `/www/server/panel/vhost/nginx/news.blian117.dpdns.org.conf` 的最小退役配置，HTTP/HTTPS 返回 410，不再反代任何应用。这样原域名不会误落入其他站点。重写部署时需替换这个配置；它不代表旧项目仍在运行。
- 原有两份备份迁至 `/var/backups/radar-existing-20261010/`，迁移前后 SHA-256 一致：`20261009-radar-no-model-01-pre-migration.dump`、`20261009-radar-detail-layout-03-pre-switch.dump`。它们是已有备份，未新增备份；生产工作数据已删除。
- `18082`、`18083`、`55434` 均无监听。服务器本地经 HTTPS/SNI 请求原工作台得到 410。
- `bedrock117.dpdns.org` 删除前后通过原服务器 HTTPS/SNI 均返回 200。其 Nginx 配置与共享 Nginx 主配置 SHA-256 完全未变；Nginx 仅平滑重载、主进程 PID 未变。`nginx`、`mysqld`、`php-fpm-82`、`trendradar-postgres` 均 active。
- 本地项目、完整 RSS 清单、SSH 配置/密钥与 DNS 未删除或修改；没有连接或修改其他云服务器。HTTP 状态与配置检查不代表对其他站点全部业务流程进行了验收。

独立复查：四个 Radar 服务均为 `LoadState=not-found / inactive`，上述核心目录不存在；本机通过公网域名请求 Radar 的 HTTP 与 HTTPS 均返回 410，`bedrock117.dpdns.org` 的 HTTPS 返回 200；Nginx 配置检查通过。

私密本地操作回执保存在旧工作目录 `.local/delete-radar-site-receipt-20261010.json`；本文已收录必要结果，单独传交本文不依赖该文件。


## 8. Info-Hub 重写需求与 RSS 修缮（2026-10-10 15:00，北京时间）

本节是本次对话核对与联网审查结果，优先用于新站选源。第 1–7 节保留为历史交接与资源边界记录；其中旧部署、旧凭据和旧删除授权不代表本次操作指令。第 4 节的 58 项表是历史快照，**不得整体作为新站启用清单**。

### 8.1 已经由用户明确的目标

- 用于个人阅读与研究：国际时事、外媒对华报道、科技与游戏、公共事务。
- 用户不想看到明显亲共立场的报道。筛选应围绕具体文本与证据；报道中国、引用中共官方说法、出现正面事实或研究某种主张，本身均不足以认定作者在宣传或辩护。不仅凭国别、中文语言或媒体名称判定单篇立场。
- 全站及订阅需要认证。网页、RSS、API、MCP、Markdown 导出、分享图和承载内容的图片均应执行访问控制；只允许登录流程和无内容的必要技术资源匿名访问。
- 少而精、质量优先；用事件归并减少重复阅读，以信息增量、证据强度、个人相关性与研究价值挑选内容。
- 用户已明确选择：保留核心模型处理，删除无关模块并减少调用。此项确定功能范围，但模型服务、密钥和调用预算尚未配置；开发与测试继续关闭真实调用。

### 8.2 联网验证结果与限制

审查位置是本次 Linux 云端工作区，并非目标服务器。52 个原启用 URL 中，49 个返回 HTTP 200 且可解析为含条目的 RSS/Atom/RDF；2 个返回 HTTP 错误，1 个在代理连接阶段受阻。验证了近期条目样本，不代表全面评估该媒体的所有内容，也不代表获得全文转载许可。

| 来源 | 当前结果 | 新站处理 |
| --- | --- | --- |
| Foreign Policy | 当前请求返回 HTTP 403 | 暂不启用，目标服务器复核；不直接断言源永久失效 |
| POLITICO Europe | 当前请求返回 HTTP 402 | 暂不启用，核实可用的官方订阅方式；不绕过访问限制 |
| 纽约时报中文网 | HTTPS 代理隧道被拒绝，未取得来源响应 | 暂不启用，目标服务器复核；不能据此判定 RSS 无效 |
| 6 个 legacy.invalid 占位地址 | 明确不是真实地址 | 从新站导入名单淘汰；历史表仅作记录 |
| Nikkei Asia | RDF 可解析，50 项均无发布日期，条目仅见标题和链接 | 暂不作为核心来源；需验证正文日期与有效材料，不能把抓取时间伪装成发布时间 |

可复查的原 58 项探测明细另存为 `rss-audit-20261010.json`，其中包括地址、HTTP 结果、条目数量与少量标题/日期/摘要样本。

### 8.3 已核实的地址与含义修正

- 原“NHK 经济”的 `cat2.xml` 实际订阅标题是 `NHKONEニュース|暮らし`（生活），并非经济。经济订阅应为 **<https://news.web.nhk/n-data/conf/na/rss/cat5.xml>**，实测标题 `NHKONEニュース|経済`，106 项；`cat6.xml` 则为国际。核心名单暂只保留 NHK 政治，经济地址作为修正记录而非额外启用。
- Steam News 的近期样本集中于 Valve 游戏更新，不能宣称它覆盖全部 Steam 新游、平台行业新闻或市场趋势；默认不纳入核心。
- The Diplomat 覆盖亚太而不限于中国；BBC 中文、德国之声中文、法广中文也包含广域国际新闻。来源标签不能代替每篇文章的内容分类。
- 卫报中国与卫报国际来自同一发布机构，有交叉覆盖；核心只保留国际订阅。若以后同时订阅，热度不能把两条订阅当作两个独立媒体。

### 8.4 首轮核心候选：24 项（23 项保留 + 1 项补充）

以下按本次明确用途收缩原清单，作为待用户审阅的首轮启用建议。最终入选依赖逐篇筛选，不保证每个来源的每篇报道都符合用户偏好。所有来源 `site_fulltext=false`、`syndicate_fulltext=false`，默认仅提供摘要与原文链接；名称、语言、地域和作者立场须如实呈现。

| 方向 | ID / 来源 | RSS 地址 | 与需求的关联 |
| --- | --- | --- | --- |
| 国际时事 | `radar-bbc-world` / BBC 国际 | <https://feeds.bbci.co.uk/news/world/rss.xml> | 广域国际新闻基线；用于掌握事件与时间线 |
| 国际时事 | `radar-guardian-world` / 卫报：国际 | <https://www.theguardian.com/world/rss> | 补充国际报道与公共政策议题；与 BBC 按事件去重 |
| 国际时事 | `radar-bellingcat` / Bellingcat | <https://www.bellingcat.com/feed/> | 开源证据调查和可复查的方法，适合公共事务研究 |
| 国际时事 | `radar-meduza-en` / Meduza English | <https://meduza.io/rss/en/all> | 俄罗斯及俄乌相关报道；保留原文、证据和来源身份 |
| 外媒对华与港台报道 | `radar-bbc-zh` / BBC 中文 | <https://feeds.bbci.co.uk/zhongwen/simp/rss.xml> | 中文国际与对华报道入口；不把整个订阅固定归为中国经济 |
| 外媒对华与港台报道 | `radar-dw-zh` / 德国之声中文 | <https://rss.dw.com/rdf/rss-chi-all> | 中文对华、欧洲视角与公共事务报道；与 BBC 中文去重 |
| 外媒对华与港台报道 | `radar-ft-cn` / FT 中文网 | <https://www.ftchinese.com/rss/news> | 中国经济政策、国际贸易及政经分析；付费内容仅保留可得摘要与链接 |
| 外媒对华与港台报道 | `radar-hkfp` / Hong Kong Free Press | <https://hongkongfp.com/feed/> | 香港公共事务、法治及中国相关报道；官方引述需区分于作者立场 |
| 外媒对华与港台报道 | `radar-taipei-times` / 台北时报 | <https://www.taipeitimes.com/xml/index.rss> | 台湾、两岸及地区政治报道；观点与事实分别标注 |
| 外媒对华与港台报道 | `radar-diplomat` / The Diplomat | <https://thediplomat.com/feed/> | 亚太政治、对华关系与政策分析；不是中国经济专栏 |
| 科技 | `radar-404-media` / 404 Media | <https://www.404media.co/rss/> | 平台权力、隐私、监控及科技公共影响调查 |
| 科技 | `radar-ars-technica` / Ars Technica | <https://feeds.arstechnica.com/arstechnica/index> | 科技变化、技术解释与政策影响；过滤促销及纯消费推荐 |
| 科技 | `radar-mit-technology-review` / MIT Technology Review | <https://www.technologyreview.com/feed/> | 科技发展、AI 能力边界及其社会影响 |
| 科技 | `radar-rest-of-world` / Rest of World | <https://restofworld.org/feed/> | 全球尤其非西方地区的科技、产业与社会影响 |
| 游戏 | `radar-gematsu` / Gematsu | <https://www.gematsu.com/feed> | 新作与重要更新；覆盖日本游戏，避免堆入普通宣传片 |
| 游戏 | `radar-game-developer` / Game Developer | <https://www.gamedeveloper.com/rss.xml> | 开发者、劳动、经营与游戏产业变化 |
| 游戏 | `radar-gamediscoverco` / GameDiscoverCo | <https://newsletter.gamediscover.co/feed> | 游戏市场、发行、平台机制与有数据的行业分析 |
| 游戏 | `radar-rock-paper-shotgun` / Rock Paper Shotgun | <https://www.rockpapershotgun.com/feed> | PC 游戏与独立作品报道；过滤攻略刷屏和硬件促销 |
| 公共事务研究 | `radar-propublica` / ProPublica | <https://www.propublica.org/feeds/propublica/main> | 调查报道、制度运行与公共问责；美国地域偏重需如实标注 |
| 公共事务研究 | `radar-icij` / ICIJ | <https://www.icij.org/feed/> | 跨境调查、权力与资金流、治理和问责 |
| 公共事务研究 | `radar-the-conversation` / The Conversation | <https://theconversation.com/global/articles.atom> | 研究者撰写的公共政策与社会议题解释；评论不等同已验证事实 |
| 东亚公共事务补充 | `radar-nhk-politics` / NHK 政治 | <https://news.web.nhk/n-data/conf/na/rss/cat4.xml> | 日本政治与公共政策补充；日文正文需翻译且保留原文 |
| 东亚公共事务补充 | `radar-yonhap-cn-politics` / 韩联社中文：政治 | <https://cn.yna.co.kr/RSS/politics.xml> | 韩国政治与东亚外交的中文信息入口；只用于区域补充 |
| 科技 | `infohub-stratechery` / Stratechery | <https://stratechery.com/feed/> | 补充科技商业模式、平台战略及公共影响分析；有付费墙，材料不足时不生成超出原文的摘要 |

唯一补充项 Stratechery 来自用户指定的 <https://github.com/plenaryapp/awesome-rss-feeds> 的 Tech 清单；使用经验证的 HTTPS 官方地址替代清单的 HTTP 地址。实测 200、10 项，近期条目为 2026-10-09。其商业战略分析补足上述技术新闻和调查报道，避免再加一家通用快讯站。

### 8.5 淘汰、暂缓与默认不启用

“默认不启用”表示为了减少重复和主题分散而收缩，并非断言这些来源低质或亲共；用户后续明确需要时可替换核心来源，不优先扩张总数。

| ID / 来源 | 新站决定 | 理由 |
| --- | --- | --- |
| `radar-aeon` / Aeon | 默认不启用 | 哲学与文化随笔为主，当前用途优先公共政策与调查；保留为长文阅读备选 |
| `radar-atlantic` / The Atlantic | 默认不启用 | 广域美国政治评论，与现有公共事务及国际来源交叉；如需美政深读可替换 |
| `radar-dispatch` / The Dispatch | 默认不启用 | 美国政治及评论覆盖，与当前主清单交叉；不据媒体标签推断每篇立场 |
| `radar-engadget` / Engadget | 默认不启用 | 消费科技、产品新闻与促销占用注意力，已有科技解释与分析来源 |
| `radar-foreign-policy` / Foreign Policy | 暂停待复核 | 当前网络请求失败，详见 8.2；不能视为永久失效 |
| `radar-guardian-china` / 卫报：中国 | 默认不启用 | 与卫报国际属于同一机构且有交叉，避免重复订阅与重复计热 |
| `radar-hacker-news` / hacker-news | 淘汰占位 | legacy.invalid 不是订阅；没有自动启用或猜测新地址 |
| `radar-hani-en` / hani-en | 淘汰占位 | legacy.invalid 不是订阅；没有自动启用或猜测新地址 |
| `radar-iran-international` / Iran International | 默认不启用 | 聚焦伊朗，适合专题而非当前广域核心；需要时替换国际来源 |
| `radar-iranwire-en` / iranwire-en | 淘汰占位 | legacy.invalid 不是订阅；没有自动启用或猜测新地址 |
| `radar-japan-times` / japan-times | 淘汰占位 | legacy.invalid 不是订阅；没有自动启用或猜测新地址 |
| `radar-kyiv-independent` / Kyiv Independent | 默认不启用 | 乌克兰专题来源，当前 BBC、卫报及 Meduza 已提供覆盖；可按研究题目替换 |
| `radar-kyiv-post` / Kyiv Post | 默认不启用 | 与乌克兰专题来源交叉，避免同一冲突快讯刷屏 |
| `radar-nhk-economy` / NHK 经济 | 默认不启用 | 原地址误标为经济，实际为生活；已记录正确经济地址，暂不增加核心源 |
| `radar-nikkei-asia` / Nikkei Asia | 默认不启用 | 订阅缺发布日期和摘要；待正文日期及材料质量验证后再考虑替换 |
| `radar-nintendo-life` / Nintendo Life | 默认不启用 | 任天堂平台报道，与 Gematsu 的重要更新有交叉；平台偏好尚未确认 |
| `radar-nk-news` / nk-news | 淘汰占位 | legacy.invalid 不是订阅；没有自动启用或猜测新地址 |
| `radar-npr-news` / NPR News | 默认不启用 | 广域美国快讯，与现有基线来源交叉；可作为替换备选 |
| `radar-nyt-cn` / 纽约时报中文网 | 暂停待复核 | 当前网络请求失败，详见 8.2；不能视为永久失效 |
| `radar-openai-news` / OpenAI News | 默认不启用 | 厂商一手更新有价值，但近期样本偏客户案例；当前优先独立科技分析，有需要再设重要发布专源 |
| `radar-pbs-newshour` / PBS NewsHour | 默认不启用 | 广域美国快讯，与现有国际及公共事务来源交叉 |
| `radar-pc-gamer` / PC Gamer | 默认不启用 | 与 RPS 的 PC 游戏报道交叉，样本还包含显示器等硬件；保留游戏重要事件，压缩重复 |
| `radar-playstation-blog` / PlayStation Blog | 默认不启用 | 厂商宣发与平台更新，当前未确认 PlayStation 专项偏好 |
| `radar-politico-eu` / POLITICO Europe | 暂停待复核 | 当前网络请求失败，详见 8.2；不能视为永久失效 |
| `radar-reason` / Reason | 默认不启用 | 主要为美国公共事务与评论；当前优先调查与有研究依据的解释，可按研究需求替换 |
| `radar-rfi-zh` / 法广中文 | 默认不启用 | 中文国际报道与 BBC 中文、DW 中文重叠，先压缩入口数量 |
| `radar-rpg-site` / RPG Site | 默认不启用 | RPG 专项报道；尚未确认 RPG 专项偏好，Gematsu 暂承担日本游戏覆盖 |
| `radar-steam-news` / Steam News | 默认不启用 | 实际近期主要为 Valve 游戏补丁，不代表整个 Steam 平台行业资讯 |
| `radar-techcrunch` / TechCrunch | 默认不启用 | 科技商业快讯已有交叉，优先保留技术解释、社会影响与战略分析 |
| `radar-the-verge` / The Verge | 默认不启用 | 消费科技、平台新闻与当前科技核心有交叉；保留为替换备选，不扩大总量 |
| `radar-washpost-world` / Washington Post World | 默认不启用 | 与两家广域国际基线交叉，保留为替换备选 |
| `radar-wired` / WIRED | 默认不启用 | 科技与社会报道有价值，但当前 404 Media、MIT Tech Review、Rest of World 已覆盖主要角色 |
| `radar-xbox-wire` / Xbox Wire | 默认不启用 | 厂商宣发与平台更新，当前未确认 Xbox 专项偏好 |
| `radar-yahoo-finance` / yahoo-finance | 淘汰占位 | legacy.invalid 不是订阅；没有自动启用或猜测新地址 |
| `radar-yonhap-cn-economy` / 韩联社中文：经济 | 默认不启用 | 与韩联社政治同一发布机构；以政治订阅补充东亚公共事务，压缩重复入口 |

### 8.6 指定候选库的补充审查

候选库用于发现地址，不代表地址可用、分类正确或内容适合。没有批量导入 OPML。

| 候选 | 实测与决定 |
| --- | --- |
| Hacker News `https://news.ycombinator.com/rss` | 200、30 项，可替代旧占位地址；但它是讨论与外链聚合，不作为一手报道，本轮不启用 |
| Japan Times `https://www.japantimes.co.jp/feed/topstories/` | 200、5 项，但最新条目为 2025-02-27，明显滞后；不补入 |
| Indie Games Plus `https://indiegamesplus.com/feed` | 200、10 项，有近期独立游戏内容；已有游戏核心源，本轮不补入 |
| Stratechery `https://stratechery.com/feed/` | 200、10 项，有近期科技战略分析；作为唯一新增核心候选 |
| Yahoo Finance `https://finance.yahoo.com/news/rssindex` | 当前请求 404；用户未提出证券行情需求，不修复旧占位、不补入 |
| Gaming 清单的 Makeup and Beauty Blog | 美妆博客被错分到游戏；排除，不因进入候选库就接受 |

### 8.7 改造方向与云端接入现状

推荐保留 AIHOT 的采集、判重、任务队列、事件归组、日报与统一读取层，在 Info-Hub 中修改个人主题、中文写作和筛选规则，并增加应用层全站认证。主分类建议为国际时事、外媒对华、科技、游戏、公共事务；日本、韩国、俄罗斯等作为跨分类专题。网页与 RSS 使用同一内容池，不能出现网页挡住但订阅、API 或导出泄露内容的情况。收藏和已读首轮复用浏览器本地能力，不擅自增加账户同步系统。

明显亲共立场的排除要求应在内容审核中执行并保留理由、原文依据与人工复核入口；材料不足时标记待核实，不能靠标题、国别或单一关键词判断。评分保留既有多维结构，替换价值与噪声示例；门槛需要用户标注样本校准，不能把旧 AI 行业门槛宣称为已经适配个人偏好。

当前从工作区 DNS 解析 `news.blian117.dpdns.org` 得到 `43.128.10.41`，HTTPS 返回 410，与旧站退役记录一致。本环境没有 SSH 私钥或代理会话，尚未登录目标服务器，未修改云端任何资源。Windows 上的 SSH 与原文路径不在本环境挂载范围；发布前需建立获授权的安全接入渠道，不能把私钥放进文档、仓库或聊天。服务器资源隔离和 `bedrock117.dpdns.org` 的保护边界沿用第 2、6 节。

这是需求核对和选源审查记录，**不代表已经完成代码改造、部署或真实模型调用的恢复**。


## 9. Info-Hub 改造设计规格（待用户审阅）

### 9.1 方案选择与成功条件

推荐方案 A：基于已检出的 AIHOT `589f79e` 定制，在 Info-Hub 中保留成熟的采集、判重、队列、写作、事件归组和统一读取层，重做个人主题配置，并新增全站认证与个人内容排除规则。该方案符合用户希望改造 AIHOT 的目标，后续可继续对照上游维护。

备选方案 B：重新实现轻量采集器、阅读页和模型流水线。能够从一开始围绕个人用途设计，但需重新验证采集调度、幂等、模型回执、事件归组和费用控制，首次发布工作明显增多；本轮不推荐。

成功条件：登录后可以按国际时事、外媒对华、科技、游戏、公共事务浏览中文摘要与原文；同一事件的多篇报道尽量合并；明确触发个人排除规则的内容不进入阅读池；RSS 等出口与网页保持一致；匿名请求无法获得个人内容；代码和运行资源独立于其他站点。

首轮不新增多用户系统、跨设备收藏同步、行情面板、社交机器人或自动发消息功能。模型判定不是百分之百可靠，必须能在后台查看原文依据、纠正错误和重新处理。

### 9.2 内容组织与处理

- 站名 Info-Hub；首页是个人精选。保留全部动态、事件、主题、搜索、收藏及日报。浏览器本地收藏与已读继续使用，明确不保证跨设备同步。
- 主分类使用独立且稳定的 key：`global_affairs` 国际时事、`china_coverage` 外媒对华、`technology` 科技、`games` 游戏、`public_affairs` 公共事务。日本、韩国、俄罗斯、台湾、香港等为专题标签；文章主分类按内容判定，不直接复制来源的旧分类。
- 科技不限于 AI；游戏不仅是新作宣发，也包括开发、发行、商业变化和有事实支持的分析；公共事务重视制度、政策实施、权利、透明度和问责。
- 原 AIHOT 预筛只允许 AI 内容，必须修改为上述个人主题的相关性预筛，避免把国际新闻和普通科技误挡。评分保留类型、多维加权、噪声压制与安全边界；内容类型的语义和例子同步扩展到新主题。未用个人标注样本验证前，评分门槛标注为待校准，不能宣传已精准适配。
- 写作使用简体中文，先写事件与信息增量，再交代证据、立场和不确定性；不能把指控写成定论，不能因为符合读者观点就给无证据评论高分。英文与日文原文始终可追溯。
- 清单固定为第 8.4 节 24 个来源。现有来源仍应在目标服务器测试抓取；若有失败，先暂停而非为了凑满数量随意补源。新源首次回灌每源最多 8 项，遵守旧文不进今天的现有规则。

### 9.3 个人排除规则

把明显亲共立场作为个人阅读过滤条件，而不是事实真假标签。模型须给出具体文本依据，例如无批判距离地采用中共宣传口号、为党国压制或侵权作辩护而没有可核查论据、以宣传式叙事替代事实检验。不能仅凭中国主体出现、客观叙述积极结果或转述官方主张作排除判定。针对指控、报道引用、学术讨论和作者支持立场，要明确区分。

判定至少区分通过、排除、待核实，并保存原因及证据片段。明确排除与待核实的内容均不进入精选/全部动态等阅读池；待核实项供后台人工处理。人工操作必须留下审计记录，人工修改不被模型自动覆盖。

优先将此判断融入现有预筛调用，以免每篇额外增加一次模型请求；若现有返回结构需要扩展，则使用明确字段与向后兼容迁移，而不把质量评分伪装成政治立场判断。无论网页、RSS、API、MCP、搜索、详情或报告引用，均使用统一读取层执行同一阅读池规则。直接访问被排除文章的地址也不能看到其内容；管理员仍可在后台审查。

### 9.4 全站认证

复用现有服务端管理会话进行网页登录，保留登录频率限制与写操作 CSRF 防护，并修正只允许返回 `/admin` 的旧登录返回路径逻辑，使用户可以安全返回站内阅读页。返回地址拒绝跨站 URL、协议相对 URL 等形式。

认证同时位于 API 和 Web 层；不能只靠前端隐藏、Nginx 或“知道文章 ID 才能访问”。Web 的 SSR HTTP 请求通过每次请求独立传递用户认证信息访问 API，不能把用户会话放在共享全局变量，也不能仅信任客户端可伪造的 SSR 标头。

- 浏览器未登录：进入登录页。匿名 RSS/API/MCP 等机器请求：返回 401，不返回正文。
- RSS/API/MCP 可使用独立只读 Bearer 凭据。随机高强度令牌仅展示一次、数据库只存哈希，支持到期和撤销；只读令牌不能用于后台写操作。令牌不进入 URL、日志、缓存键或发布包。
- 受保护的响应统一使用 `Cache-Control: private, no-store`，关闭共享缓存，按认证状态正确处理 304/ETag。登录后或退出后不能复用其他会话的缓存。
- 登录流程、必要的固定 JS/CSS/字体/图标可匿名访问；健康检查不返回内容，生产优先只供本机使用。上传文件、代理图片、分享图、Markdown 导出等含个人内容的入口需要认证。
- 关闭公开索引：`robots.txt` 禁止抓取，不暴露内容型 sitemap/llms/API 说明；对受保护页面发送 noindex。匿名内容访问仍靠认证拒绝，不能仅靠 robots.txt。

普通阅读器若不支持认证请求头或会话，不能直接订阅本站；首轮不为兼容它们把密钥放进 URL。

### 9.5 模型功能与调用压缩

经源码核对，采集、URL 判重、页面阅读、收藏与已读无需模型；预筛、双次评分、中文摘要、结构抽取、事件关系判断、综述与报告写作使用模型。事件候选召回可在无向量模型时走已有词法回退，但归组判断仍依赖语言模型。

保留核心处理，采取以下措施减少真实调用：

1. 24 个核心源代替原 52 个启用入口；首次每源最多回灌 8 项，历史内容不推入今日精选。
2. 预筛阶段融入个人主题及立场偏好，排除后不再评分、写作或归组；先做原有机械判重。
3. 保留双次独立评分与按分级的门槛，不用单次评分冒充原流程。
4. 沿用请求回执和结果复用；刷新网页、重复抓取、重启与任务重试不无故重新付费。
5. 关闭模型榜与 Codex 重置监控的入口、API、启动任务、定时任务和第三方采集；不启用飞书或 IndexNow 外发。
6. 首轮仅提供摘要与链接，不自动翻译全文；报告优先每日生成，周/月自动写作先关闭。事件综述只在有新进展时按已有缓存机制更新。

开发和测试不调用真实模型。真实上线处理使用 AIHOT 已有的 OpenAI 兼容 HTTP 配置；不预设必须购买 OpenAI 服务。模型供应商、端点、型号、密钥和调用上限要通过部署配置提供，不提交仓库。上游预算熔断按分钟/小时/日的请求次数限制，并非人民币费用硬上限；不得把它宣传为金额预算。配置前维持 `MODEL_CALLS_ENABLED=false`。

### 9.6 品牌、版权与隐私说明

替换 MyHOT/AIHOT 的用户可见名称、图标、提示词和页面文案；保留上游 MIT 版权声明与 NOTICE，再补充 Info-Hub 的版权归属。不得仅使用目标仓库已有许可证覆盖上游的版权要求。

使用规则与隐私页按个人用途重写，供用户上线前确认：仅本人认证访问、摘要与原文链接、自动生成内容可能出错；站点保存登录会话、必要的请求日志、内容处理与后台操作记录；收藏/已读保存在当前浏览器；必要文章材料会发送给用户配置的模型服务。密钥与密码不写在页面中。没有授权全文转载时不开全文展示。

### 9.7 部署与验证

目标：`https://news.blian117.dpdns.org`、`43.128.10.41`。推荐独立 Docker Compose 项目，专属应用目录、容器、数据库用户/数据卷和环境配置。Web 入口只映射 `127.0.0.1:18082`，API/数据库留在内部网络，不开放公网数据库。已有共享 Nginx 只修改此子域名的退役配置；验证独立入口后再切换。若服务器没有满足要求的容器运行环境，先核查再确定独立 systemd 方案，不修改其他项目的运行时或数据库。

必须保留 `bedrock117.dpdns.org`、共享 Nginx 主配置、其他虚拟主机、证书、MySQL/PHP 以及独立 trendradar-postgres。现有证书可在核验后复用，不输出私钥。切换前备份仅涉及本次站点的配置，失败可退回该域名的 410 响应；不能回滚或重建其他站点。

验证范围：类型检查、后端测试、Web 构建与既有前端测试、运行烟测；新增访问控制测试覆盖匿名拒绝、会话登录/退出、只读令牌撤销与权限边界、SSR 数据响应、图片/导出旁路、缓存泄露。内容测试覆盖四项关注、无关与营销噪声、明确排除、单纯引述和材料不足，以及站点各出口一致。开发检查保持模型和外发阀门关闭。

线上验收必须检查 HTTPS、登录、匿名 RSS/API/MCP 返回 401、认证后可读、源采集、后台处理、数据库持久化和重新启动；同时验证其他站点的配置未变及原服务仍正常。模型配置未就绪时只能声明部署了应用框架，不能把空的精选页称为完成了完整情报站。

### 9.8 已获授权与当前外部条件

- 用户已说明用途与偏好、选择全站及订阅认证，并明确“可以开工了”；这取代此前等待启动确认的状态。
- 用户选择保留核心模型处理、删除无关模块、减少调用；模型为 DeepSeek / deepseek-flash，随后明确要求“统一在谷价时段调取，再做预算决定”。
- SSH 凭据已经提供并校验，原 ZIP 的加密副本已上传 Info-Hub 私有库；明文私钥和解密口令均保存在 Git 外，不进入应用镜像或发布包。
- 当前 Codex 环境的目标 SSH TCP 通道仍不可用。凭据可用不等于网络可达；未通过此环境登录或改动目标服务器。实际部署由可信 Windows 环境运行仓库内部署脚本，或恢复受支持的 TCP 接入后继续。
- 当前环境无法直接覆盖 Windows 文档。修订稿保存为 `/workspace/rewrite-handoff-20261010.md`，下载后覆盖原路径；仓库同步保存于 `docs/superpowers/specs/2026-10-10-infohub-design.md`。

## 10. 本轮实现补充：谷价、预算与发布状态（2026-10-10）

### 10.1 统一谷价调用

核对官方价表：<https://api-docs.deepseek.com/quick_start/pricing>。当前 Flash 谷价未命中缓存输入为 $0.15 / 百万 token，输出 $0.60 / 百万 token；预算忽略缓存折扣。官方峰时是周一至周五 UTC 01:00–04:00、06:00–10:00，对应北京时间 09:00–12:00、14:00–18:00；其余时段及周末为谷价。

所有核心模型请求经过统一入口，峰时暂停发送，谷价结束前按请求超时加 30 秒预留完成时间。文章处理、事件归组和综述等待下一可处理时间；已有付费回执可直接复用，读页面不调用模型。初期禁用向量和图片模型，只允许官方 DeepSeek Flash 文本接口。附加参数不能覆盖模型、输入、输出上限或引入额外工具载荷；费用预留依据最终请求的字节上界和最大输出。

### 10.2 谷价下的预算决定

先完成谷价限制，再用 `scripts/cost-plan.ts` 估算：每天 60 / 100 / 150 条候选、60% 通过预筛，保留两次评分、结构与中文写作，另计部分事件归组、综述和一份日报。对应估计费用约为 $0.194 / $0.322 / $0.482 每日，30 天约 $5.82 / $9.66 / $14.46。此为假设，不是实测，也不承诺精确筛选效果。

据此初期设置滚动 24 小时 $0.50、滚动 30 天 $10，另保留每分钟 10、每小时 100、每日 500 次模型请求上限。金额预留在发送前以数据库锁串行核准，成功后按 token 回执估算结算；超时或未知结果保留预留，重试另占额度。超过上限暂停，不自动加预算。首周按真实回执校准候选量、通过率、token 用量和积压；服务商账单为准，供应商改价后须更新本地价表。

### 10.3 已实现的阅读与排除边界

核心源仅启用第 8 节列出的 24 个，新增来源只有从指定 awesome-rss-feeds 清单选出的 Stratechery。域名审查结果不等于每篇文章通过，明显支持中共立场的内容按原文证据排除；单纯引用官方观点不直接排除，材料不足进入后台待审。

页面、React Router 数据、RSS、API、MCP、导出和内容附件需要有效会话或只读令牌。令牌仅展示一次、数据库存哈希、支持过期与撤销；后台写操作保留会话及 CSRF。私人内容不使用共享缓存。

排除或人工撤回后，文章退出阅读池；相关事件的旧综述、摘要和进展立即失效。旧日报的导语、主题文字和被排除引用不再返回；历史增量 upsert 转成无正文的删除记录。模型写作过程中发生撤回时，提交前的证据与版本核验阻止旧结果重新发布。后台保留历史与审计供复查。

### 10.4 部署边界与剩余验收

代码按独立 Docker Compose 项目准备，复用目标 news 子域的 Nginx 和证书，Web 只绑定回环 18082，API/数据库仅容器内部可达。脚本先只读预检，再上传已提交版本、备份本站、启动迁移种子与应用、运行认证烟测，最后改目标 vhost；失败恢复原 vhost 与前一应用版本，初次部署失败则只停止本站应用。不会删除旧数据库或碰其他站点。

本轮真实模型调用及外部通知始终关闭。测试、构建及容器认证烟测在当前工作环境完成；目标云端上线、外部 HTTPS、持续采集、真实模型处理、重启持久化以及其他线上服务保持正常，仍需从可 SSH 的可信环境完成，不能将本地验证宣称为线上发布。详细执行步骤见仓库 `docs/infohub-deploy.md`。
