# Info-Hub

个人情报站：国际时事、外媒对华报道、科技、游戏、公共事务研究。基于 AIHOT 改造，保留中文摘要、两次独立评分、事件归组与日报。本地默认配置36项，其中35项启用；按用户指定移除第一财经研究院和澎湃·外交学人，加入六家媒体，Taiwan News修复已发布、Reuters暂不可用而暂停，见[本轮来源记录](docs/rsshub-six-sources-20261017.md)。此前精简清单保留在[30源方案](docs/rss-cleanup-20261016.md)。停用来源暂停尚未开始的文章处理，历史内容与付费回执保留；重新启用后可恢复。

网页、RSS、API、MCP 与内容附件统一认证。浏览器用登录会话；订阅客户端用可撤销、有期限的只读 Bearer 令牌。后台写操作另需会话与 CSRF。生产模式强制私有，内容响应禁用共享缓存。

个人立场判断按文章文字，不按国籍或媒体名称。排除与待审内容不进入阅读出口；后台保留理由、原文证据和人工修正审计。原文版权归来源所有，默认只显示摘要与原文链接。

## 当前功能与文档

- [当前状态及版本](docs/status.md)：区分仓库代码、生产应用、RSSHub镜像与运行配置。
- [信源配置](docs/sources.md)：原生RSS、内部RSSHub、首次限量、可恢复暂停与全文权限。
- [关注榜与情报日报](docs/intelligence.md)、[事件系统](docs/event-system-20261016.md)：独立事件、重点／简讯、Pi归组与引用校验。
- [Pi接入与缓存](docs/pi-agent.md)、[思考强度](docs/reasoning.md)：统一付费回执、固定提示前缀、原生缓存与结果复用。
- [新环境部署](docs/deploy.md)、[本站生产运维](docs/infohub-deploy.md)、[RSSHub及回退](docs/rsshub.md)。

## 本机启动

```bash
npm ci
node scripts/init-env.ts --quiet
docker compose up -d --build
```

访问 http://127.0.0.1:18082 。访问密码在本机 `.env` 的 `ADMIN_PASSWORD` 字段，勿提交或公开它。默认不采集、不调用模型、不发送通知。

部分默认源依赖内部RSSHub，启用采集前先按[RSSHub说明](docs/deploy.md#可选的内部rsshub)部署；未部署时可在后台暂停这些源。Taiwan News修复镜像可以从仓库构建，生产本地镜像标签不能直接从公共镜像库拉取。

## 模型与费用

使用 DeepSeek `deepseek-flash`，只在官方谷价时段发送请求。工作日北京时间 09:00–12:00、14:00–18:00 为峰时，周末全天谷价；每次调用预留超时完成缓冲。峰时任务排队，阅读不调用模型。

生产运行配置（2026-10-17）：金额上限$2.50/滚动24小时、$75/滚动30天；模型次数60/分钟、1000/小时、12000/日。本站已支持内部RSSHub，后台新建RSS源可选择“本站RSSHub”并预览；来源仍需确认后启用，见[部署及资源记录](docs/rsshub.md)。以下为新安装的默认值，与生产自定义配置分开。

当前默认上限：滚动 24 小时 $0.50、30 天 $10，外加每分钟 10、每小时 100、每日 2400 次请求上限（迁移 0042 调整，保留运营者自定义值）。按谷价未命中缓存价格保守预留，结算估算使用回执 token 及有效的原生缓存命中明细；未知结果保留预留额。仅允许当前已定价的官方文本接口，向量调用关闭。价格和预算说明见 [部署说明](docs/infohub-deploy.md)，Pi 运行方式及缓存统计见 [接入说明](docs/pi-agent.md)。

在服务器 `.env` 填写 `LLM_API_KEY` 后再把 `COLLECT_ENABLED` 和 `MODEL_CALLS_ENABLED` 改为 `true`，重建服务容器。开发与测试保持外部调用关闭。

后台「设置」顶部提供AI模块总开关：一键暂停／恢复新的AI请求，无需重启。已发出的请求正常收尾，等待中的任务自动继续，预算、模型、信源和各模块启停保持原样。服务器`MODEL_CALLS_ENABLED=false`仍是不可绕过的安全阀；暂停期间采集、阅读及日报规则基础版继续运行。详见[AI运行控制](docs/ai-control.md)。

## 部署与验证

云端部署复用 `news.blian117.dpdns.org` 的现有 Nginx 和证书，仅 Web 绑定 `127.0.0.1:18082`；API、数据库不对宿主机开放。详见 [部署与回退](docs/infohub-deploy.md)。

```bash
npm run typecheck
DATABASE_URL=postgres://postgres@127.0.0.1:15434/infohub_test node scripts/migrate.ts
DATABASE_URL=postgres://postgres@127.0.0.1:15434/infohub_test npm test
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
node --env-file=.env scripts/private-smoke.ts --base http://127.0.0.1:18082
```

SSH 交接归档加密保存在 `ops/credentials`，不进入应用镜像或发布包。解密口令、私钥和运行密钥均在 Git 外。

完整检查以Linux的[GitHub Check](https://github.com/BedrockLian/Info-Hub/actions/workflows/check.yml)为准，使用临时数据库和本地模型替身，不连接生产服务。RSSHub覆盖模块另跑 `node --test ops/rsshub-overrides/taiwannews-parser.test.mjs`。Windows当前网页测试存在绝对路径动态导入限制，后端部分退出信号和Shell测试也依赖Linux；本地类型检查或构建成功不能替代Linux完整回归。GitHub推送只触发检查，不自动部署本站。

上游：[AIHOT](https://github.com/BedrockLian/AIHOT)。许可证及原作者归属见 LICENSE、NOTICE。详细需求见 `docs/superpowers/specs/2026-10-10-infohub-design.md`。
