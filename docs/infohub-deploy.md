# Info-Hub 部署与回退

当前目标：`news.blian117.dpdns.org` → `43.128.10.41`，服务器主机名 `VM-0-4-opencloudos`。2026-10-10 已上线，全站及订阅需要认证。共享 Nginx 主配置、`bedrock117.dpdns.org`、PHP、MySQL、trendradar-postgres 及其数据目录均不在改造范围。

## 网络限制与 Windows 部署

2026-10-10 的 Codex 环境曾无法连接服务器，GitHub Actions Secrets/权限接口也返回 403。2026-10-11 已从当前可信 Windows 环境实测 SSH 直连可用，可以完成服务器预检和发布；下面保留站点所有者可执行的 Windows 部署步骤。

1. 将 Info-Hub 开发分支检出到本机，或更新已有本机仓库。SSH 私钥和原有 known_hosts 放在本机 `.ssh`；不要将明文 ZIP 或私钥提交到 Git。
2. 打开 PowerShell，执行：

```powershell
powershell -File "<Info-Hub路径>\ops\deploy\windows.ps1" -RepositoryPath "<Info-Hub路径>" -SshDirectory "$env:USERPROFILE\.ssh"
```

脚本先只读检查主机名、Docker、证书、目标 vhost 和 Nginx 配置，再上传已提交版本的发布包。它明确使用上传的身份文件和严格 known_hosts 校验，不执行 ZIP 中的 SSH config。可核对服务器 ED25519 指纹：`SHA256:TtqUknO3nzVo19SaK2YdX8B82zo/5sNskeFbJqioLyk`。

预检失败时，保留从 `Connecting to the server` 开始的输出。脚本逐项报告服务器身份、Docker Compose、Docker 守护进程、站点配置与证书、Nginx 配置；失败后不上传发布包，也不修改服务。仅排查时在上述 PowerShell 命令末尾加 `-PreflightOnly`，即使预检成功也不会继续部署。

2026-10-10 的服务器只读检查确认系统为 OpenCloudOS 9.6 x86_64，未安装 Docker。该系统可在命令末尾加 `-PrepareDocker`：脚本按 [OpenCloudOS 官方 Docker 文档](https://docs.opencloudos.org/OCS/Virtualization_and_Containers_Guide/Docker_guide/) 从已配置的系统仓库安装 `moby`，保留 RPM 签名验证；仅当插件缺失时安装官方 Compose v5.6.0 和 Buildx v0.38.0，并校验仓库脚本中固定的 SHA-256（来自官方 GitHub release）。随后启动 Docker 并继续预检、部署。加 `-PrepareDocker -PreflightOnly` 则准备 Docker 后止于预检，不发布应用。

准备脚本只支持指定主机上的 OpenCloudOS 9 x86_64，不删除软件，不修改 Docker daemon 配置、不关闭 SELinux 或防火墙，也不重启现有站点、数据库、Nginx。若发现已运行的非 Docker containerd 或冲突安装，会停止供排查。软件安装中途失败不自动卸载已装组件；核对错误后可重跑。GitHub 下载失败时保留输出，不能跳过校验或关闭 TLS 验证。

Windows PowerShell 通过原生进程管道发送文本时会附加 CRLF，即使源 Shell 文件是 LF。部署工具在服务端统一移除实际回车字符，再交给 Bash，覆盖环境准备、预检和部署三阶段。已安装 Docker 和插件后，普通部署命令即可继续；无需重复安装。`-PrepareDocker` 保留为需要时可重跑的环境准备选项。

所有部署 Docker 子进程隔离标准输入，烟测和数据库转储禁用交互输入，防止 Docker 读取 SSH 管道中余下的部署脚本。只有完成 news vhost 切换、HTTPS 检查和 `current` release 标记后，Windows 工具才报告部署成功。若初次发布中断但本站容器已启动，可重跑；端口 18082 必须由唯一运行中的 Info-Hub Web 容器精确绑定于 `127.0.0.1`，不能以缺少 `current` 为由覆盖未知服务。数据卷保留。

最终 HTTPS 检查直连服务器回环，保留 TLS 验证，并显示 curl 传输错误或不符合预期的 HTTP 状态。失败依然回退，不能使用 `-k` 或忽略状态强行发布。

Nginx 的 reload 命令返回时，新 worker 未必已经接管请求。部署工具最多检查 30 次，每次间隔一秒，等待 news HTTPS 返回登录跳转 302；期间报告仍在收到的旧状态。若始终不符合预期或发生 TLS/传输错误，仍然回退并保留具体错误。

发布目录 `/opt/infohub/releases/<commit>`；运行密钥 `/opt/infohub/shared/.env`；项目名 `infohub`。只创建自己的容器、卷和路径；仅 Web 绑定宿主机回环 18082。先完成迁移、种子及认证冒烟，再替换目标 news vhost 并运行原有 Nginx `-t`、reload。部署失败会还原原 vhost 与前一应用 release；初次部署失败只停止本站应用。不会自动删除任何旧数据。

成功后脚本将运行配置下载到本机 `.ssh/InfoHub-runtime.env`，访问密码为其中 `ADMIN_PASSWORD`。该文件含密钥，保存在 Git 外。初次部署保持采集、模型和外发关闭。

## 启用新闻处理

使用 SSH 编辑 `/opt/infohub/shared/.env`：

```dotenv
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-flash
LLM_EXTRA_JSON={"thinking":{"type":"disabled"}}
LLM_API_KEY=<只在服务器填写>
COLLECT_ENABLED=true
MODEL_CALLS_ENABLED=true
MODEL_BUDGET_DAY_USD=0.50
MODEL_BUDGET_30D_USD=10
```

该附加参数作为未知场景的兜底。私有站已知 AI 场景由 [分场景思考配置](reasoning.md) 覆盖：预筛、归组和综述低档；评分、理解与归组复核高档；抽取、普通摘要、日报短导语及翻译关闭。无需修改运行密钥或全局附加参数。

在 `/opt/infohub/current` 运行 `INFOHUB_RELEASE=<当前commit> docker compose -p infohub up -d --force-recreate api worker web`。查看 `/admin/settings` 金额与请求上限、`/admin/runs` 回执和错误。后台不能绕过谷价或金额熔断。首次回填每源最多 8 条；旧模型榜、Codex 监控、自动全文翻译和自动周月报关闭。

RSS 阅读器须支持自定义 `Authorization: Bearer <令牌>` 请求头。令牌在 `/admin/tokens` 创建，数据库只保存摘要，可设有效期或撤销；不接受查询字符串中的 token。令牌没有后台权限。

## 谷价与预算依据

2026-10-10 核对官方价格：https://api-docs.deepseek.com/quick_start/pricing 。Flash 谷价为每百万输入 token $0.15、输出 $0.60；缓存命中更便宜，预算不计这个折扣。峰时是工作日 UTC 01:00–04:00、06:00–10:00，即北京时间 09:00–12:00、14:00–18:00。周末全日谷价。谷价结束前按请求超时加 30 秒停止接收新模型请求。

规划使用 `node scripts/cost-plan.ts`，是假设而非实测：60% 候选通过，预筛 3800/160 token；每个通过项两次评分各 7000/24、结构 3000/220、写作 3500/400；另假设 50% 需归组 7000/180、15% 需综述 6000/350，每日日报 10000/900。

上述脚本和下表是关闭思考时的历史基线，尚未计入本次分场景思考输出，不能据此承诺新配置吞吐量。上线后应以回执中的总输出 token、费用和积压重新校准；现有金额上限继续优先执行。

| 每天候选 | 估计日费用 USD | 估计30天 USD |
|---:|---:|---:|
|60|0.194|5.82|
|100|0.322|9.66|
|150|0.482|14.46|

因此初期上限设为每日 $0.50、30 天 $10；高于约 100 候选/天时可能积压，不自动加预算。首周用实际回执的 token 用量校准。费用预留用最终请求 UTF-8 字节上界和最大输出量，完成后以谷价估算结算；超时、崩溃及未知用量保留预留额，重试独立预留。此上限控制本站估算值，服务商价格调整或账单规则变化需更新定价再启用；不是服务商账户额度。没有真实模型请求，不能宣称实测费用或筛选准确率。

2026-10-11 运行核查：852 条已采集文章仅完成 106 条分析，52 条可阅读、其中 2 条精选；模型发送恰好 500 次而金额占用仅 USD0.14322486，触发原每日次数上限。迁移0042将未被运营者调整过的默认次数阀改为10/min、100/h、2400/滚动24h；保留USD0.50/24h、USD10/30d金额阀和统一谷价规则。金额占用是本地估算，供应商账单为准。每日次数阀只作速率保护，不替代费用预算。运营者自定义或归零的次数阀不覆盖。

该迁移恢复早期明确HTTP402拒绝的失败文章，并唤醒因默认每日次数上限等待的任务；其余失败、待审决定和金额熔断不改动。正常的每五分钟处理巡检会重新排队，已收到的步骤回执继续复用，避免从头付费。私人RSS首轮回填仍限每源8条，此后记录并跳过首轮未收录的旧条目，继续接收新文章和已收录文章的更新；既有852条资料保留。首页“精选”与“全部情报动态”是不同列表，媒体精选门槛仍为两次评分平均76，不为增加篇数自动降低。

## 回退

2026-10-11 补充实查：当前服务器已运行 `dde526e1d9c4528b86ad91d0c4234175d9e93730`，迁移0042已完成，当前环境可直接连接 SSH。用户授权的五项 RSS 已通过管理功能写入数据库并首次抓取成功，启用来源由24增至29；本地初始化清单已同步。此操作不需要替换应用镜像，原有信源设置和筛选、预算配置保持不变。详见 [验证记录](infohub-validation.md)。

vhost 备份和更新前数据库转储位于 `/opt/infohub/shared/backups`。恢复 vhost 后用原有 Nginx 检查并 reload。应用可切换到前一 release，设置对应 `INFOHUB_RELEASE` 再 `docker compose -p infohub up -d`。迁移仅增量，应用回退不自动删表；先核对备份再决定数据库恢复。禁止 `docker compose down -v` 用于生产回退。
