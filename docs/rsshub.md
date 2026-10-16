# RSSHub 内部采集

目的：为没有原生RSS的网站提供可选的RSSHub采集，保持现有发布审核、Pi处理、预算、来源暂停及全文权限。部署RSSHub本身不新增监控来源，也不调用AI。

## 后台使用

新建信源选择RSS，再把“获取方式”选为“本站RSSHub”。只填路由，例如 `/github/issue/DIYgod/RSSHub`，先预览核对条目及日期，再创建。该示例仅用于连接验收，不代表新增监控。普通RSS仍填feedUrl。

已建信源可在配置JSON中使用 `{"rsshubRoute":"/namespace/route"}`。rsshubRoute与feedUrl互斥；查询参数参与判重，参数顺序不影响身份。RSSHub仅改变采集方式，不使转载源变成一手来源，不自动授予全文展示权限。

RSSHub地址由服务器的RSSHUB_BASE_URL配置，信源不能修改origin。只有RSS采集适配器获得访问该精确origin的能力，重定向也不能跳出；普通网页、图片、付费API等抓取继续拒绝内网。不要启用ALLOW_PRIVATE_NETWORK_FETCH（生产会拒绝启动）。RSSHub响应最多2MiB，内部连接最多2条，读取超时25秒，沿用ETag／Last-Modified条件请求。

## 轻量部署

将 `ops/rsshub.compose.yml` 与根docker-compose.yml合并。RSSHUB_IMAGE填经核验的普通镜像digest；不附带Chromium，不启用Browserless和Redis。只接入本站Docker网络，不映射宿主机端口，不配置公网入口。

生产环境文件还保存 `COMPOSE_FILE=docker-compose.yml:ops/rsshub.compose.yml` 及RSSHUB_BASE_URL、DATABASE_POOL_MAX、DATABASE_IDLE_TIMEOUT、FETCH_CONCURRENCY，使后续常规Compose更新沿用支持。Linux的COMPOSE_FILE分隔符是冒号，Windows应按本机格式设置；显式传-f会覆盖COMPOSE_FILE，部署工具必须保留两份配置。

```sh
RSSHUB_IMAGE=ghcr.io/diygod/rsshub@sha256:<经核验的digest> \
docker compose -f docker-compose.yml -f ops/rsshub.compose.yml up -d --no-build rsshub api worker web
```

RSSHub内存硬上限384MiB、Node旧生代256MiB、0.5核CPU；32项内存缓存，路由缓存30分钟，内容缓存1小时。缓存项数不等于字节上限，实际限制以容器为准。浏览器路由不可用；登录路由仍需要相应凭据。镜像更新需固定新digest并重新验证，不自动追踪latest。

本站API／worker数据库连接池由默认10降为4，空闲回收由600秒降为120秒；采集并发由默认8降为2。连接减少有助于降低PostgreSQL的进程开销，采集并发降低有助于减少解析峰值；不降低模型档位、不修改数据库shared_buffers、不动其他站点服务。实际内存变化需用发布前后及日常负载观察，不能将容器上限当作实际节省。

## 验收及回退

检查RSSHub健康、普通真实路由的RSS及重复读取、网站后台预览、不写入监控来源；隔离测试覆盖内网隔离、重定向逃逸、相对路径校验、条件请求和重复来源身份。执行项目类型检查、Linux完整回归、网页构建和私有访问烟测。

发布前排空worker并备份数据库及现有运行配置。回退恢复上一应用镜像、Compose启动参数和current指向，停止RSSHub；保留文章、回执及发布后的新数据，不恢复旧数据库覆盖新写入。本版没有数据库迁移或信源种子变更。

官方参考：[部署](https://github.com/RSSNext/rsshub-docs/blob/main/src/deploy/index.md)、[配置](https://github.com/RSSNext/rsshub-docs/blob/main/src/deploy/config.md)、[Compose示例](https://github.com/DIYgod/RSSHub/blob/master/docker-compose.yml)。
