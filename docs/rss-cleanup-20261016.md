# 30源精简与可恢复积压暂停方案

2026-10-16。使用者已确定：加入France 24亚太、卫报中国，启用来源约30个；停用来源尚未开始的处理暂停，文章与付费回执保留并可恢复。下列具体30源清单及生产发布仍待最终确认；本地实现与云端应用状态分开记录。

## 可审阅的取舍

保留现有28源，新增2源，暂停22源。管理记录为52项，其中30项启用；不删除停用来源或历史文章。这个方向替代原先只做二换二的建议。

按10月15日23:45快照，停用组贡献过去24小时338／455条收录（74.3%），占1,964条等待／失败中的1,325条。保留组待处理639条、过去24小时收录117条，另加两个新源的新增与每源最多8条回填。不是长期发稿量或费用保证；材料仍保存，总存档数不会消失。

停用组此前有22条当前精选，包括Guardian World与Daily Maverick。大清洗不是断言这些媒体质量差，而是主动缩小覆盖；已有精选继续可读。BBC World保留全球快讯，CNBC保留经济与科技动态；新France 24亚太补地区视角，Guardian中国收窄涉华发现。

## 保留的28源

- African Arguments（infohub-african-arguments）
- Amnesty International（infohub-amnesty）
- Carbon Brief（infohub-carbon-brief）
- China Media Project（infohub-china-media-project）
- CNBC International（infohub-cnbc-international）
- Construction Physics — Brian Potter（infohub-construction-physics）
- EFF Deeplinks（infohub-eff）
- Eurogamer Reviews（infohub-eurogamer-reviews）
- GitHub Engineering（infohub-github-engineering）
- Godot Engine（infohub-godot）
- Google Research（infohub-google-research）
- Ken Shirriff（infohub-ken-shirriff）
- Krebs on Security（infohub-krebs）
- Martin Fowler（infohub-martin-fowler）
- Nippon.com English（infohub-nippon）
- Our World in Data（infohub-our-world-in-data）
- Bruce Schneier（infohub-schneier）
- Simon Willison（infohub-simon-willison）
- 報導者 The Reporter（infohub-twreporter）
- BBC World（radar-bbc-world）
- Bellingcat（radar-bellingcat）
- 德国之声 中文（radar-dw-zh）
- Game Developer（radar-game-developer）
- ICIJ（radar-icij）
- ProPublica（radar-propublica）
- Rest of World（radar-rest-of-world）
- Rock Paper Shotgun（radar-rock-paper-shotgun）
- The Conversation（radar-the-conversation）

## 新增2源

- [France 24 亚太](https://www.france24.com/en/asia-pacific/rss)（infohub-france24-asia-pacific）：T2媒体，保持摘要和原文链接，不开启全文展示；初次回填最多8条。
- [The Guardian 中国](https://www.theguardian.com/world/china/rss)（infohub-guardian-china）：T2媒体，保持摘要和原文链接，不开启全文展示；初次回填最多8条。

## 暂停22源

| 来源 | 当前待处理 | 24小时收录 | 取舍依据 |
|---|---:|---:|---|
| AUTOMATON WEST | 16 | 3 | 合并游戏快讯入口，保留评测、开发及引擎源 |
| Daily Maverick | 113 | 33 | 高频综合新闻减量；非洲保留African Arguments，接受南非快讯减少 |
| Global Voices | 12 | 2 | 跨地区补充与现有国际／调查源合并，暂让位于核心容量 |
| Indie Games Plus | 9 | 1 | 游戏发现集中在RPS，暂停低样本试验源，不判定长期低质 |
| Mozilla.ai | 6 | 0 | 一手技术来源已有Google Research、GitHub等，压缩AI产品入口 |
| Stratechery | 10 | 1 | 少量付费分析暂让位于免费核心与个人技术作者 |
| Xbox Wire | 16 | 2 | 官方产品公告与游戏快讯减量，接受平台更新覆盖减少 |
| 404 Media | 21 | 4 | 阅读与素材可用性限制，数字权利保留EFF、安全作者及Rest of World |
| Ars Technica | 50 | 11 | 压缩较高频科技综合入口，保留研究、工程、安全与跨地区科技 |
| BBC 中文 | 57 | 8 | 同机构语种入口合并，保留BBC World及DW中文 |
| The Diplomat | 73 | 9 | 亚洲评论入口减量，由France 24亚太、Nippon及调查源补充，非等价替代 |
| FT 中文网 | 27 | 3 | 有阅读限制，经济快讯保留CNBC与公开数据、产业解释源 |
| GameDiscoverCo | 16 | 0 | 付费／行业分析补充合并到Game Developer等 |
| Gematsu | 73 | 29 | 大量发售、移植与DLC通知，压缩发布日历类输入 |
| The Guardian World | 311 | 95 | 由Guardian中国收窄范围；保留BBC全球快讯，接受非涉华卫报报道减少 |
| Hong Kong Free Press | 42 | 6 | 地区入口合并；涉港深度仍有Guardian中国、DW中文等，接受本地快讯减少 |
| Meduza English | 121 | 32 | 高频俄语地区新闻减量，保留BBC国际与调查源，接受当地独立视角减少 |
| MIT Technology Review | 18 | 4 | 科技杂志补充暂让位于免费、可读的研究与解释源 |
| NHK 政治 | 46 | 14 | 较高频且有素材缺失，日本覆盖保留Nippon |
| Taipei Times | 139 | 50 | 综合入口范围宽，素材不足较多；台湾保留報導者 |
| TechCrunch | 83 | 25 | 产品、融资与综合科技快讯减量 |
| 韩联社 中文政治 | 66 | 6 | 韩国政治专门入口合并入France 24亚太与BBC，接受当地快讯减少 |

低频调查、工程、安全、数据与个人作者优先保留，不以未处理导致的零精选淘汰。Eurogamer Reviews仍有403问题，因低更新量与已有有效评测保留，故不能宣称30源全部健康。新源此前RSS与样文可用性见[核验记录](rss-traditional-candidates-20261015.md)。

## 暂停与恢复的实现

- 复用来源enabled状态。文章入队、分析入口、正文抓取入口检查来源是否启用；停用时返回paused，保留文章、重试次数、错误、回执与计费证据，不把暂停当失败。
- 补漏扫描及批量失败重试仅处理启用源；重新启用后，new文章由原队列或五分钟补漏恢复，原failed文章通过正常人工重试恢复。保持原重试时间与未知回执安全阀，未承诺每条立即重跑。
- 已开始的单篇处理允许收尾；生产切换先排空旧worker，避免旧版在停源后继续启动收费链。既有归组、日报与已发布内容保持可读；不批量重评历史。
- 后台分开显示启用源积压与暂停保留；处理积压告警和失败分组只看启用源，原始回执诊断保留。已有队列记录会逐步完成为paused，队列行数可能短暂仍高，不等于仍在发模型请求。
- Guardian World与China统一机构组，BBC英文与中文统一机构组，历史条目也不因栏目／语言不同算两个独立来源。规范URL已存在的材料只增加发现关系，避免重复文章；不同报道URL仍由原事件归组处理。

抓取间隔沿用现有自适应规则；2–3小时／3–6小时仅为前次运营建议，当前自适应会收敛到15–60分钟，本次不夹带调度改造。金额、次数阀、思考强度、缓存规则、精选门槛与全文许可不改。

## 应用与回退准备

本地默认信源已准备为30项，seed仍只新增缺失项，不会自动停用云端22项。另有原子应用脚本：先核对现有50个启用ID和目标30个ID，再在事务内停用22项、创建两源、设置机构组及写审计。只创建这两源，不用seed覆盖保留源的运营设置。重复应用或现有启用集变化时拒绝，避免误覆盖。默认dry-run只读。

生产发布前备份数据库、来源状态与运行配置；排空worker，切换已验收镜像，执行原子来源更新，再验证30启用、历史可读、预算不变与私有访问。失败先停止新版worker，恢复旧镜像及准确的来源快照，新建两源停用保留，不删除回执或回滚已发生费用。不得把22项全部无差别重启以掩盖部分失败。

应用脚本及模拟证据保存在忽略目录 .data/rss-cleanup-20261015/；执行前再次核对脚本哈希、备份和生产ID集合。

## 验证进度

- 暂停分析与正文抓取、禁止批量重新入队、重新启用恢复、付费回执保留、历史可读：针对性3项已通过。
- 类型检查与网页生产构建通过；全新隔离Linux数据库201项后端、13项网页测试通过，0失败／跳过；没有外部收费验收调用。
- 原子应用模拟通过：50→30启用、52条管理记录、22项暂停；文章、费用证据与保留源自定义间隔保持；重复应用被拒绝，重复seed不重新启用停用源。
- 私有访问烟测通过：登录、SSR/data、RSS、API、MCP、只读权限、撤销与注销。后台运行页及新源列表在1440×900、390×844、320×740验证通过，无页面脚本错误或整页横向溢出，截图已检查。
- 午夜后复现了旧日报测试夹具将新闻设为当天未来时刻的问题；在旧生产镜像875f78d上得到同样失败，修正为最近完整北京日期后全量通过，不改生产发布时间规则。预览环境另补齐队列表元数据并等待API就绪后验收，避免将测试环境未初始化误判为产品故障。
- 生产信源和服务尚未应用本方案。
