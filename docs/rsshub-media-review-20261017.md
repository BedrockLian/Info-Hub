# RSSHub媒体核验与当前积压

## 判断

先解除调用次数瓶颈，再少量引入低频研究／分析来源。用户要求查看积压、提高调用上限后继续，2026-10-17 10:01已原子新增下列两项，启用源30→32，22个暂停源保留。云端连接恢复后，核实两源于10:25–10:26成功抓取，各保留4篇。导入不代表自动进入精选，既有内容审核、模型档位、发布及全文权限保持。

## 当前积压（2026-10-16 23:48，北京时间）

| 范围 | 待处理new | 失败failed | 合计 |
|---|---:|---:|---:|
| 30个启用源 | 515 | 54 | 569 |
| 22个暂停源（保留、不继续处理） | 1185 | 152 | 1337 |

启用源有438篇new已等待超过24小时，最老收录于10月10日。515篇new的最近错误均为`Budget for llm exhausted (hour)`；失败54篇中53篇关联未知回执，另1篇为其他失败，不能因提高次数就擅自释放或抹去这些付费证据。

启用源最近24小时收录135篇、产生分析的不同文章207篇。总模型实际发送1700次（包含失败尝试），最近一小时100次；滚动24小时费用／预算计入额约$1.444，未到$2.50金额上限。这个窗口在消化旧内容，但不能据此保证长期清空时间。主要积压来源：BBC World103、CNBC International98、德国之声中文86、Rock Paper Shotgun52、The Conversation43。

2026-10-17 00:00，经用户明确要求提高调用上限，原子更新llm与deepseek两行：每分钟10→60、每小时100→1000、每天2400→12000；已记录budget.update审计及旧值备份。金额上限$2.50/滚动24小时、$75/滚动30天和Pi并发2未变。00:02后台设置接口确认新值，小时模型调用110次，超过旧阀；变更后已有10次新尝试（7次received、2次failed、1次pending）和4篇不同文章的新分析记录。没有将短时记录等同于积压已经清空。

## 传统媒体路由实测

发现材料为用户指定的[传统媒体列表](https://rsshub.netlify.app/zh/routes/traditional-media)。在本机云端固定RSSHub镜像、无浏览器、无登录凭据条件下串行预览；没有保存任何新监控源、没有为测试调用AI。

| 候选 | 实测结果 | 适配判断 |
|---|---|---|
| 第一财经研究院 `/yicai/author/100005663` | 20条均有日期；样本近7天1条，最近10月15日；公开原文可读 | 首选。补充经济调查、企业出海和碳市场研究，低频；活动及企业推广需过滤 |
| 澎湃·外交学人 `/thepaper/list/25481` | 10条均有日期；样本近7天3条，最近10月16日北京时间 | 可作少量观点分析补充；政策立场及宣传段落仍逐篇审核，不当作中立事实或一手机构发布 |
| 澎湃·全球智库 `/thepaper/list/25446` | 10条均有日期；样本近7天5条 | 混有讲座预告与活动信息，本轮低于前两项 |
| NHK World中文 `/nhk/news/zh` | 20条可读、有日期，前5条时间完全相同 | 暂缓。需进一步核对单篇时间；不凭共同更新时间估算每日流量 |
| 公视·数位叙事 `/pts/projects` | RSSHub503，上游403 | 本机不可用，暂不导入 |
| 公视·专题策展 `/pts/curations` | RSSHub503，上游403 | 本机不可用，暂不导入 |
| 转角国际·深度专栏 `/udn/global/tag/深度專欄` | RSSHub503，上游403 | 本机不可用，暂不导入 |
| 路透·调查报道 `/reuters/investigates` | RSSHub503 | 不列为可用候选，暂不导入 |

频率仅根据当前返回样本估计，不承诺未来发稿量。可用只是传输和解析通过，不保证每篇符合本站观点与质量要求。RSSHub说明“无需浏览器”也不代表云端IP一定能通过上游防护；未尝试绕过上游访问限制。

第一财经官方[作者页](https://www.yicai.com/author/100005663.html)确认其为旗下研究院；本次[最新样本原文](https://www.yicai.com/news/103394609.html)公开可读、日期和作者可核对。路由实现核对固定镜像源码：[一财研究院](https://github.com/DIYgod/RSSHub/blob/0f184a37d49cbf1ac0d759aa41fe3b3c1ef25f10/lib/routes/yicai/author.ts)、[澎湃栏目](https://github.com/DIYgod/RSSHub/blob/0f184a37d49cbf1ac0d759aa41fe3b3c1ef25f10/lib/routes/thepaper/list.ts)。

## 本次导入范围

本次小量新增前两项，30→32源；原30源均保留，CNBC International未停用。其余候选暂不加入。执行前原配置预览验证研究院30条、首篇内部正文7525字符，外交学人10条、首篇2836字符；来源快照及source.create审计保留。遇到云端超时后没有重跑导入；10:50只读核对旧52源配置及权限均保留，两个新源健康、各4篇。研究院最早一次采集因中断留下running历史记录，后续成功抓取新增3篇，连同此前1篇共4篇，未删除中断证据。

恢复后10:50样本：启用源待分析462、失败55；暂停源保留待分析1185、失败152。自10:24重启恢复以来有75篇新分析。未知付费回执仍保留，未强制放行；上述样本不代表积压已清空。

两项均采用RSS类型、T2、editorial、每360分钟抓取、首次最多4条、一手身份false、站内及对外全文false。路由不加输出limit，避免低频轮询漏掉期间新增；首次限量通过本站既有_aihot配置控制。若启用summaryIsBody，只用于内部理解公开可读正文，不授予展示或转发全文的许可。

候选配置：

```json
[
  {
    "id": "infohub-yicai-research",
    "name": "第一财经研究院",
    "kind": "rss",
    "config": {
      "rsshubRoute": "/yicai/author/100005663",
      "summaryIsBody": true,
      "_aihot": {"initialBackfillLimit": 4},
      "ingestNoiseFilter": {"dropMarkersTitleOnly": ["讲座预告", "活动预告", "论坛预告", "案例征集", "招募"]}
    },
    "tier": "T2", "participation_mode": "editorial", "interval_minutes": 360,
    "first_party": false, "site_fulltext": false, "syndicate_fulltext": false,
    "tags": ["公共事务", "经济研究"]
  },
  {
    "id": "infohub-thepaper-diplomacy",
    "name": "澎湃·外交学人",
    "kind": "rss",
    "config": {
      "rsshubRoute": "/thepaper/list/25481",
      "summaryIsBody": true,
      "_aihot": {"initialBackfillLimit": 4},
      "ingestNoiseFilter": {"dropMarkersTitleOnly": ["讲座预告", "活动预告", "论坛预告", "招募"]}
    },
    "tier": "T2", "participation_mode": "editorial", "interval_minutes": 360,
    "first_party": false, "site_fulltext": false, "syndicate_fulltext": false,
    "tags": ["国际时事", "公共事务"]
  }
]
```

原始证据：`.data/rsshub-20261016/backlog.json`、`media-check.jsonl`、`media-check-2.jsonl`、`model-limits-change.json`、`limits-check.json`、`import-preview.json`、`import-result.jsonl`。来源新增基于用户的优质导入及继续要求，未将提高次数用作更改其他来源、模型或金额预算的授权。
