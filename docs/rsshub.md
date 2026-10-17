# RSSHub 内部采集

目的：为没有原生RSS的网站提供可选的RSSHub采集，保持现有发布审核、Pi处理、预算、来源暂停及全文权限。部署RSSHub本身不新增监控来源，也不调用AI。

最新来源状态：2026-10-17按用户指定移除研究院与外交学人，新增六家媒体配置；四项首抓成功启用、Reuters及Taiwan News暂停。Taiwan News修复镜像已完成隔离验证，待生产切换确认，见[六源替换记录](rsshub-six-sources-20261017.md)。下述32源样本为此前上线及恢复的历史记录。

## 上线记录

2026-10-16北京时间23:53，经用户明确要求部署，生产应用切换为 `2cad1acdd564b630acbc739857994bdc0b690242`。RSSHub固定镜像为 `ghcr.io/diygod/rsshub@sha256:a1e7e833825780ae29d0f761029cea4cd313856ad63402e8d9caad277b9e2311`，镜像源版本 `0f184a37d49cbf1ac0d759aa41fe3b3c1ef25f10`。API／web／worker与current一致，RSSHub健康、没有宿主机端口、重启0、OOM0。

生产备份 `/opt/infohub/shared/backups/rsshub-20261016T155337Z` 包含数据库、权限600的运行配置及发布前后快照。发布暂停worker期间核对：30个启用源、22个暂停源及逐源配置相同；2912篇文章、9427条回执、9540次尝试、1017条发布记录和内容哈希均保留。未执行迁移、种子或历史重写。发布包SHA-256：`aea81d3b84eb45b62619de838342a881f22c6110e3f0c80b3cd3a9cf4f040afc`。

首次验收：连接池4、空闲120秒及采集并发2配置下，隔离Linux完整214项后端、14项网页通过；类型检查与网页构建通过，但未覆盖下面发现的实际多队列并发容量问题。隔离后台1440×900及390×844检查RSSHub选择、路由编辑、预览、404提示、修改后恢复及键盘操作，未观察到控制台错误，截图使用明确标记的合成条目。生产后台页面及预览接口200，真实GitHub路由返回3条，普通内网抓取仍被拒绝；生产私有访问烟测含事件页通过。重复读取实际响应头为`rsshub-cache-status: HIT`；本站条件请求逻辑由隔离测试证明，生产RSSHub此样本未返回304，不将二者混为同一种缓存。

23:45上线前本站四容器内存样本合计约641MiB；23:57约602MiB，另新增RSSHub约226MiB，主机可用约454MiB、交换未使用。后续发现worker阻塞，故这组不同负载的样本不能作为有效节省证据。RSSHub翌日09:53约210MiB，健康、重启0、OOM0；恢复后的正常采集与AI负载仍需重测。

2026-10-17 00:00用户另行要求提高模型次数上限，llm与deepseek已改为60/分钟、1000/小时、12000/日；原金额预算与Pi并发不变。该调整在RSSHub发布后独立执行、备份并审计，应用回退不会自动撤销后来确认的次数设置，若需要需单独按审计恢复。积压与待选媒体见[核验清单](rsshub-media-review-20261017.md)。

2026-10-17 09:53继续运行核验发现worker失去进度：三个综述事务和日报保留连接同时占满连接池4，其回调中的独立SQL无法取得连接，定时任务堆积。09:59将worker池恢复10，API保持4、空闲120秒、采集并发2。10:01观察到恢复后22次received、11篇新分析，启用源new从515降到504。新增容量回归在旧配置4下超时失败，在10下通过；完整回归还发现跨日时日报测试替身会返回超过分类上限的简讯，已修正替身遵守原契约，未改生产选题规则。

修正配置持久化在 `/opt/infohub/shared/rsshub.compose.yml`，生产COMPOSE_FILE指向根Compose与该绝对路径，公共DATABASE_POOL_MAX回到10，API在覆盖文件中单独设4。临时恢复覆盖文件留作证据但已不再使用。应用镜像仍为2cad1ac，本次只调整运行配置。10:01原子新增第一财经研究院与澎湃·外交学人，32个启用源、22个暂停源，来源快照及审计保留。

10:03左右，首抓和最终完整回归期间SSH握手及HTTPS开始超时，TCP仍可连接。源写入有成功回执，首抓未返回完成结果，最终215项完整回归没有完成回执；不能把这两项标为通过。已请求云控制台状态并尝试停止隔离测试，需恢复连接后读取首抓、进度与资源数据。隔离容器名为infohub-rsshub-test-run及infohub-rsshub-test-db，仅用于本次验收，未挂载生产数据库或凭据。

10:42连接恢复，HTTPS正常返回私有登录302。系统日志显示10:23重启，未据此推断10:03超时的原因。两项新源在10:25–10:26完成抓取，各4篇；10:50核对旧52源配置及权限不变，32个启用／22个暂停，模型与金额预算不变；重启恢复以来75篇完成分析，启用源待分析462、失败55。10:45正常处理样本：worker184MiB、API113MiB、web54MiB、数据库369MiB、RSSHub171MiB，主机可用462MiB、交换未使用；负载不同，不与上线前样本作节省结论。

补跑完整回归时短暂停止worker与RSSHub，将生产阅读服务保持在线；隔离数据库192MiB、测试容器384MiB，退出钩子先停止测试再恢复生产处理。新一轮215项中213通过、2项失败，原因仍为日报测试替身未对同事件候选去重；已补齐替身的事件去重，未放宽生产校验，随后在另一个空测试数据库补跑。

最终补跑215项后端、14项网页全部通过，类型检查通过；10:51:46恢复生产采集与AI处理。公网HTTPS私有烟测（真实事件页、SSR/data、RSS、API、MCP、令牌撤销与退出）通过；后台RSSHub预览200、3条真实GitHub条目、普通内网抓取仍拒绝。应用三镜像及current仍为2cad1ac，共享Compose文件与本机修正版SHA-256一致。两个隔离容器、匿名测试数据卷及内部网络已清理；失败和成功测试日志保存在本机`.data/rsshub-20261016/`，恢复来源与次数核验另存原备份目录的recovery-verify.json及recovery-limits.json。

10:52正常处理资源样本：worker187MiB、API136MiB、web87MiB、数据库305MiB、RSSHub143MiB，主机可用423MiB、交换未使用，RSSHub健康且未观察到OOM。该样本只说明当前资源余量，不证明RSSHub带来净内存节省。启用源仍有462篇待分析、55篇失败，暂停源1185篇待分析、152篇失败继续保留；未强行重置未知付费回执，积压尚未清空。

## 后台使用

新建信源选择RSS，再把“获取方式”选为“本站RSSHub”。只填路由，例如 `/github/issue/DIYgod/RSSHub`，先预览核对条目及日期，再创建。该示例仅用于连接验收，不代表新增监控。普通RSS仍填feedUrl。

已建信源可在配置JSON中使用 `{"rsshubRoute":"/namespace/route"}`。rsshubRoute与feedUrl互斥；查询参数参与判重，参数顺序不影响身份。RSSHub仅改变采集方式，不使转载源变成一手来源，不自动授予全文展示权限。

RSSHub地址由服务器的RSSHUB_BASE_URL配置，信源不能修改origin。只有RSS采集适配器获得访问该精确origin的能力，重定向也不能跳出；普通网页、图片、付费API等抓取继续拒绝内网。不要启用ALLOW_PRIVATE_NETWORK_FETCH（生产会拒绝启动）。RSSHub响应最多2MiB，内部连接最多2条，读取超时25秒，沿用ETag／Last-Modified条件请求。

## 轻量部署

将 `ops/rsshub.compose.yml` 与根docker-compose.yml合并。RSSHUB_IMAGE填经核验的普通镜像digest；不附带Chromium，不启用Browserless和Redis。只接入本站Docker网络，不映射宿主机端口，不配置公网入口。

当前生产环境文件保存 `COMPOSE_FILE=docker-compose.yml:/opt/infohub/shared/rsshub.compose.yml` 及RSSHUB_BASE_URL、DATABASE_POOL_MAX、DATABASE_IDLE_TIMEOUT、FETCH_CONCURRENCY。共享覆盖文件采用本仓库修正后的ops/rsshub.compose.yml，避免旧应用镜像的覆盖文件再次将worker池设为4。Linux的COMPOSE_FILE分隔符是冒号，Windows应按本机格式设置；显式传-f会覆盖COMPOSE_FILE，部署工具必须保留两份配置。

```sh
RSSHUB_IMAGE=ghcr.io/diygod/rsshub@sha256:<经核验的digest> \
docker compose -f docker-compose.yml -f ops/rsshub.compose.yml up -d --no-build rsshub api worker web
```

RSSHub内存硬上限384MiB、Node旧生代256MiB、0.5核CPU；32项内存缓存，路由缓存30分钟，内容缓存1小时。缓存项数不等于字节上限，实际限制以容器为准。浏览器路由不可用；登录路由仍需要相应凭据。镜像更新需固定新digest并重新验证，不自动追踪latest。

本站仅API数据库连接池由默认10降为4；worker必须保留10，为跨模型请求持有的锁及其嵌套查询留出空间。空闲回收由600秒降为120秒，采集并发由默认8降为2。连接减少有助于降低PostgreSQL的进程开销，采集并发降低有助于减少解析峰值；不降低模型档位、不修改数据库shared_buffers、不动其他站点服务。实际内存变化需用正常负载观察，不能将容器上限当作实际节省。

## 验收及回退

检查RSSHub健康、普通真实路由的RSS及重复读取、网站后台预览、不写入监控来源；隔离测试覆盖内网隔离、重定向逃逸、相对路径校验、条件请求和重复来源身份。执行项目类型检查、Linux完整回归、网页构建和私有访问烟测。

发布前排空worker并备份数据库及现有运行配置。回退恢复上一应用镜像、Compose启动参数和current指向，停止RSSHub；保留文章、回执及发布后的新数据，不恢复旧数据库覆盖新写入。本版没有数据库迁移或信源种子变更。

官方参考：[部署](https://github.com/RSSNext/rsshub-docs/blob/main/src/deploy/index.md)、[配置](https://github.com/RSSNext/rsshub-docs/blob/main/src/deploy/config.md)、[Compose示例](https://github.com/DIYgod/RSSHub/blob/master/docker-compose.yml)。
