# 更新量适中的传统媒体RSS候选

后续状态：2026-10-16已启用France 24亚太、卫报中国，并按确认清单精简为30个启用来源，见[应用与验收记录](rss-cleanup-20261016.md)。以下频率为10月15日核验快照。

2026-10-15核验。以[awesome-rss-feeds](https://github.com/plenaryapp/awesome-rss-feeds)为发现入口，筛选报纸、广播电视及科学杂志的官方订阅；不把博客、聚合器、播客冒充传统新闻源。部分专题由目录所列出版社的官网进一步发现，下面明确标注。没有变更本站来源、抓取配置、发布权限或预算。

## 频率口径

目标是给本站补充约每天1–10条的专题供给，避免再加入每天几十至上百条的综合入口。这是选择建议，不是来源的固定日配额。北京时间10月15日23:34为统计截止，以RSS条目的pubDate统计滚动7日与24小时；不把RSS刷新时间当文章发布时间。

这些数字是单次抓取时RSS中可见的条目，不是连续监测所得的全部发稿量或长期均值。来源可能截断或保留置顶旧文，故即使最旧条目超过7日，也不能保证窗口完整；较旧发布日期也不证明文章没有后续更新。配置前还需观察若干天的新增GUID／规范URL、重复与视频比例。

## 优先候选

| 来源／专题 | 近7日可见条目 | 近24小时 | 本站建议抓取间隔 | 用途与限制 |
|---|---:|---:|---|---|
| France 24 — Asia Pacific | 21 | 4 | 120–180分钟 | 新增法国国际电视媒体视角，涵盖亚洲政治、外交与社会；含视频节目，先排除无可读正文的项目 |
| The Guardian — Science | 15 | 4 | 180–360分钟 | 补科学研究与解释报道；与现有Guardian World同机构，不增加独立来源数 |
| BBC — Science & Environment | 30 | 16 | 120–180分钟 | 补科学、环境与公共政策交叉内容；近期有明显高峰，亦包含地方环境新闻，不保证每天仅4条 |
| The Guardian — China | 14 | 2 | 180–360分钟 | 更集中地发现对华报道；与现有World可能重叠，应合并去重，不能当成14条净新增 |

France 24与BBC科学源在目录中可直接找到相应媒体，其中BBC科学是目录原列入口（从HTTP升级为HTTPS）。France 24原列综合RSS，本次改查其官方亚太栏目；Guardian原列World，本次按其[官方栏目RSS规则](https://www.theguardian.com/help/feeds)发现Science与China。这里不是把所有专题都说成目录原有链接。

官方RSS：

- [France 24亚太](https://www.france24.com/en/asia-pacific/rss)
- [Guardian科学](https://www.theguardian.com/science/rss)
- [BBC科学与环境](https://feeds.bbci.co.uk/news/science_and_environment/rss.xml)
- [Guardian中国](https://www.theguardian.com/world/china/rss)

本地全部订阅返回200且XML有效；BBC科学、Guardian科学、France 24亚太另在云端正常读取。样文检查：BBC和Guardian本地取得可读正文，France 24本地403但云端200且取得可读正文；Guardian及France 24样文均标记isAccessibleForFree=true。这只证明本次样文可用，不承诺整个来源永久免费，也不自动授予本站全文转载权限。

BBC海外网站可能因地区显示付费墙，尤其美国、加拿大用户；其RSS有效不保证所有读者原文免费。见[BBC官方帮助](https://help.bbc.com/hc/en-us/articles/50329168037267-I-have-a-UK-TV-Licence-fee-why-am-I-seeing-a-paywall-on-BBC-com-or-the-BBC-app)。Guardian官网开放阅读政策与App订阅不同，见[官方说明](https://www.theguardian.com/help/insideguardian/2023/mar/22/an-update-on-reader-support-via-the-app)。

## 少量付费补充与条件候选

| 来源 | 近7日可见条目 | 近24小时 | 建议 | 官方订阅 |
|---|---:|---:|---|---|
| NYT — Science | 26 | 5 | 抓取180–360分钟；RSS有效，原文与当前阅读限制尚未验收，不列免费主力，26条不代表完整一周 | [RSS](https://rss.nytimes.com/services/xml/rss/nyt/Science.xml) |
| Scientific American | 41 | 11 | 抓取180–360分钟；补科学杂志报道，有计量或订阅限制，不列免费主力 | [当前RSS](https://www.scientificamerican.com/platform/syndication/rss/) |
| Los Angeles Times — World & Nation | 16 | 2 | 抓取180–360分钟；适合美国公共事务补充，但夹杂加州政治且有阅读限制，优先级低于免费候选 | [RSS](https://www.latimes.com/world-nation/rss2.0.xml) |
| POLITICO Playbook | 7 | 1 | 抓取360分钟已够；专业数字新闻机构的日更简报，非传统纸媒。RSS有效，但本地及云端样文403，暂不建议直接接入 | [RSS](https://rss.politico.com/playbook.xml) |

NYT Science、LA Times及Playbook是目录原列RSS。Scientific American也在目录，但其旧rss.sciam.com入口本次失败；上表为另外核验的当前官方域名入口。其[官方FAQ](https://www.scientificamerican.com/page/frequently-asked-questions/site-information-navigation/)说明非订阅者只能阅读有限内容，因此不能因为RSS可抓就当作全文免费。没有尝试绕过任何付费或访问限制。

LA Times的阅读限制见[官方订阅说明](https://www.latimes.com/about/register-for-l-a-times-unlimited-digital-access)。NYT帮助页本次受检索访问限制，未把其原文可用性算作已通过。

## 不建议直接选用的入口

- **WSJ World旧RSS**：HTTP200、XML有效，但最新条目为2025-01-27，近7日0条。不能误判为更新量小的优质低频源。
- **France 24总RSS**：只保留24条，全部来自最近约4小时，且含大量视频。这是高频、截断的综合入口，24条不能当全天发稿量；本次更推荐亚太栏目。
- **Japan Today总RSS**：30条库存中29条属于近24小时，含体育、社会和国际杂项，不符合本轮收窄供给的方向。
- **Guardian Environment**：近7日18条、24小时8条，量级也合适；但本站已有Carbon Brief，可作为环境方向备选，不与Science、China三个同机构栏目一起铺开。[RSS](https://www.theguardian.com/environment/rss)
- **France 24猜测的analysis专题URL**：返回404，不列为已验证入口。
- **DW英文总RSS**：本次本地Node访问失败，未验证其当前更新量；本站已有DW中文，不以此次失败认定媒体停更，也不额外加入总源。

## 对本站的具体建议

优先考虑France 24亚太与Guardian科学；BBC科学是第三候选，但须考虑近期16条／24小时的峰值与阅读地区限制。若主要目标是外媒对华，更可用Guardian中国替代第二个科学候选，并对现有World做重叠检查。科学杂志的付费补充可考虑Scientific American；NYT科学先完成原文验收，不同时堆入。

总数仍以50为目标；这是待确认的候选顺序，不指定立即撤掉哪个现有来源。适合替换的现有入口仍需按已处理样本、独立事件增量和原文可读性判断，不能因为未处理积压而判低质。同机构栏目统一机构组，继续只展示摘要与原文链接，保留现有权限。

抓取间隔不是AI调用上限：每两小时抓一次仍会收录其间所有新文章。减少模型负担要靠栏目范围、重复过滤与处理分配；不应通过人为漏抓新闻或把“每批8件”误当成单次AI批量请求来估费。建议先以自然新增观察7天，再按每个合格独立事件的费用和等待时间复评，低频样本不足则延长。

聚合检查记录在忽略目录 `.data/rss-traditional-20261015/`。本次仅有公开HTTP与只读云端检查，没有执行采集入库、付费AI调用或生产设置写入。
