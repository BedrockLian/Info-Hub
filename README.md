# Info-Hub

个人情报站：国际时事、外媒对华报道、科技、游戏、公共事务研究。基于 AIHOT 改造，保留中文摘要、两次独立评分、事件归组与日报。本地默认配置为32个核心RSS，包含两项低频RSSHub研究／分析源，见[当前接入记录](docs/rsshub.md)；此前精简清单保留在[30源方案](docs/rss-cleanup-20261016.md)。停用来源暂停尚未开始的文章处理，历史内容与付费回执保留；重新启用后可恢复。

网页、RSS、API、MCP 与内容附件统一认证。浏览器用登录会话；订阅客户端用可撤销、有期限的只读 Bearer 令牌。后台写操作另需会话与 CSRF。生产模式强制私有，内容响应禁用共享缓存。

个人立场判断按文章文字，不按国籍或媒体名称。排除与待审内容不进入阅读出口；后台保留理由、原文证据和人工修正审计。原文版权归来源所有，默认只显示摘要与原文链接。

## 本机启动

```bash
npm ci
node scripts/init-env.ts --quiet
docker compose up -d --build
```

访问 http://127.0.0.1:18082 。访问密码在本机 `.env` 的 `ADMIN_PASSWORD` 字段，勿提交或公开它。默认不采集、不调用模型、不发送通知。

## 模型与费用

使用 DeepSeek `deepseek-flash`，只在官方谷价时段发送请求。工作日北京时间 09:00–12:00、14:00–18:00 为峰时，周末全天谷价；每次调用预留超时完成缓冲。峰时任务排队，阅读不调用模型。

生产运行配置（2026-10-17）：金额上限$2.50/滚动24小时、$75/滚动30天；模型次数60/分钟、1000/小时、12000/日。本站已支持内部RSSHub，后台新建RSS源可选择“本站RSSHub”并预览；来源仍需确认后启用，见[部署及资源记录](docs/rsshub.md)。以下为新安装的默认值，与生产自定义配置分开。

当前默认上限：滚动 24 小时 $0.50、30 天 $10，外加每分钟 10、每小时 100、每日 2400 次请求上限（迁移 0042 调整，保留运营者自定义值）。按谷价未命中缓存价格保守预留，结算估算使用回执 token 及有效的原生缓存命中明细；未知结果保留预留额。仅允许当前已定价的官方文本接口，向量调用关闭。价格和预算说明见 [部署说明](docs/infohub-deploy.md)，Pi 运行方式及缓存统计见 [接入说明](docs/pi-agent.md)。

在服务器 `.env` 填写 `LLM_API_KEY` 后再把 `COLLECT_ENABLED` 和 `MODEL_CALLS_ENABLED` 改为 `true`，重建服务容器。开发与测试保持外部调用关闭。

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

上游：[AIHOT](https://github.com/BedrockLian/AIHOT)。许可证及原作者归属见 LICENSE、NOTICE。详细需求见 `docs/superpowers/specs/2026-10-10-infohub-design.md`。
