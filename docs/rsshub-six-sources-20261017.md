# 用户指定的六家媒体替换记录

2026-10-17用户要求移除第一财经研究院、澎湃·外交学人，新增AP News、Financial Times、Reuters、Radio Free Asia、The Nikkei、Taiwan News。按[用户给的RSSHub目录](https://rsshub.netlify.app/zh/routes/traditional-media)及当前固定镜像逐一核验；目录中的FT和日经路径已与镜像实现不同，没有照抄失效路径。

## 生产状态

11:02将两项旧源移出启用列表，暂停未开始的处理；历史文章和付费回执保留。11:09原子创建六项配置，先启用四项；11:26经确认发布RSSHub修复后启用Taiwan News。现为35项启用、25项暂停，Reuters暂停；原来的其余30项启用源和22项暂停源均保留。本机默认配置36项，其中35项启用、Reuters暂停；生产还保留被移除来源及此前暂停历史，数量口径不同。

| 媒体 | 实际配置 | 当前结果 |
|---|---|---|
| AP News·国际动态 | `/apnews/mobile/world-news`，120分钟 | 启用，20条带日期，首抓4篇。目录中的topics全文读取遇到上游429，改用同一RSSHub的公开移动接口；部分条目仅标题／摘要，正文仍经过本站提取审核 |
| Financial Times·FT中文网 | `https://www.ftchinese.com/rss/feed`，360分钟 | 启用，官方RSS20条带日期、首抓4篇。`/ftchinese/simplified/hotstoryby7day`的文章读取429，改用官方摘要RSS，不保证付费原文可读 |
| Reuters·中国 | `/reuters/world/china`，180分钟 | 暂停。RSSHub主接口401、备用404；世界栏目也失败，官网栏目401。当前环境缺少可验证的可用入口，未改抓第三方转载或绕过限制 |
| Radio Free Asia·英文 | `/rfa/english`，180分钟 | 启用，21条带日期、首抓4篇。普通话RSSHub路由返回空，但英文路由及公开正文可用；继续使用中文摘要和逐篇发布审核 |
| The Nikkei·国际免费报道 | `/nikkei/news/international/free`，180分钟 | 启用，3条带日期及正文、首抓3篇，仅选免费文章。文档旧路径`/nikkei/:category`不适用于当前镜像 |
| Taiwan News·英文热点 | `/taiwannews/hot/en`，180分钟 | 启用。旧路由空源，11:26发布已确认的修复；正式返回20条，前4条有日期及正文，首抓4篇。后台预览20条、重复读取HIT |

六项均T2、editorial、一手身份false、首次最多4篇、站内和对外全文false。没有把RSSHub读到的公开正文当作展示或转载授权。抓取本身不调用AI；新增文章按原Pi／回执／预算链路排队，不降低精选门槛。

金额上限仍$2.50/滚动24小时、$75/滚动30天；次数仍60/分钟、1000/小时、12000/日，模型及Pi并发不变。来源变更写入source.update／source.create审计。备份`/opt/infohub/shared/backups/rsshub-six-20261017/`包含权限600的sources-before.json、remove-old.json及apply.jsonl。失败重试保留既有回执规则，不强制释放未知结果。

## Taiwan News修复与验收

[覆盖模块及回退说明](../ops/rsshub-overrides/README.md)只改RSSHub的Taiwan News路由，固定原基础镜像，仅增加两个文件，不重新安装依赖。修复Next.js列表、嵌套标签、短正文属性、跨块且按UTF-8字节长度分帧的长正文、台湾时区及重复卡片。错误或缺失时间不以当前时钟补造。

8项解析测试、类型检查通过。候选RSSHub限256MiB、0.35核、无宿主机端口及生产凭据，串行核验5篇全部有正文及日期，RSSHub原生重复读取HIT，AP既有路由3条仍可用。候选容器约200MiB、无OOM，测试结束移除。该样本不证明净内存或DeepSeek缓存改善。

Windows网页测试因现有测试启动器直接导入C盘绝对路径而失败（ERR_UNSUPPORTED_ESM_URL_SCHEME），与此次来源及RSSHub模块无关；改用不联网、不挂生产凭据的独立Linux应用容器，14项网页测试全部通过。公网HTTPS私有烟测（含原真实事件页、RSS、API、MCP、令牌撤销）通过。11:21生产读取核对34项启用、26项暂停，四项新源健康；旧两源各4篇保留，金额／次数与Pi运行时保持不变。本站后端和网页实现没有改动，不将此前215项后端测试当作新模块覆盖；本轮核心证据是解析回归、真实RSSHub预览、来源首抓及生产访问检查。

11:26经用户确认发布1070175中的RSSHub修复，生产镜像改为`infohub-rsshub:taiwannews-f9b39cca0d21`，ID`sha256:f9b39cca0d21bad897b7039dc400b531f1d6b89352d973fa5e8947c13423a484`。发布仅改变共享`.env`的RSSHUB_IMAGE一行，保留两份Compose配置；仅重建RSSHub，逐项比对API／web／worker的容器ID、启动时间和镜像均相同。健康与正式预览通过后，按审计启用Taiwan News并首抓4篇。公网HTTPS私有烟测再次通过；11:28后台预览200、20条，RSSHub缓存HIT，普通内网抓取仍拒绝。

生产备份`/opt/infohub/shared/backups/rsshub-taiwan-20261017T032612Z`包含权限600的runtime.env、sources-before.json，以及Compose、应用容器前后快照、enable.jsonl、private-smoke.log、verify-final.json、admin-preview.json。未恢复或覆盖数据库，没有模型／预算／来源全文权限变化。11:27 RSSHub约186MiB／384MiB、健康、OOM=false，主机可用355MiB、交换未使用；不据单次样本承诺节省。Reuters继续暂停，需上游恢复或提供可验证的正式接入方式后再启用。

证据集中于本机`.data/rsshub-six-20261017/`及上述服务器备份；不提交页面全文、密码、私钥、运行配置或真实凭据。
