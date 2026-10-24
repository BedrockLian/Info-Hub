# Info-Hub停用、数据清理与PHP环境检查

后续状态：2026-10-24按新要求进一步清除全部云端程序、密钥配置、保留记录、镜像与遗留测试卷。本文所述`/opt/infohub/retired-20261023`目录已删除；仅原域名和证书保留。见[最新清理与域名复用评估](cloud-cleanup-and-tunnel-20261024.md)。

日期：2026-10-23，北京时间。按用户明确要求停用本站并删除新闻与缓存；检查范围包括云端实际PHP服务及本机XAMPP版本，未执行漏洞利用探测或PHP升级。

## 停用与清理结果

云端`news.blian117.dpdns.org`已停用。HTTP与HTTPS的首页、日报、RSS和API入口均返回410；Nginx不再转发到应用，响应含`Cache-Control: no-store`、`Clear-Site-Data: "cache", "storage"`及禁止索引声明。浏览器收到HTTPS响应后可按其支持情况清理该站缓存与存储；没有现场验证所有客户端的离线副本。

Info-Hub的worker、API、web、RSSHub、数据库及旧setup容器均已停止并删除，`infohub_db`和`infohub_data`两个专属卷已删除；无Info-Hub容器、卷或18082监听。停用前同时关闭采集、模型、通知及索引外发安全阀，取消容器自动重启；未找到指向`/opt/infohub`的systemd启动单元或root定时任务。

删除前最后计数：

| 数据 | 数量 | 处置 |
|---|---:|---|
| 文章 | 4130 | 新闻数据库及对应文件缓存已删除 |
| 发布条目 | 1616 | 已删除 |
| 日报／其他报告 | 20 | 已删除 |
| 事件 | 752 | 已删除 |
| 原始付费回执 | 12269 | 含模型回复等新闻载荷的数据库已删除 |
| 费用尝试记录 | 12419 | 仅保留不含请求、回复、正文、标题或错误文本的费用字段 |

`/opt/infohub/shared/backups`中约2.6GiB的历史备份已删除，避免留下新闻和模型回复副本。另清除144个本站专属临时抓取／预览／测试／上传路径及12个旧上传归档。RSSHub内存及容器可写层随容器删除，图片、附件、数据库内缓存及任务队列随专属卷删除。未配置对象存储备份，未取得存在外部备份的记录。

仅保留当前运行密钥、程序代码及受保护的`/opt/infohub/retired-20261023`记录目录（权限700）：来源／模型／预算配置、管理员身份配置、不含新闻载荷的最小审计与费用记录，以及停用前vhost配置。配置和费用文件不进入Git。共享Nginx、同机PHP、MySQL及其他网站配置未修改，PHP／MySQL进程仍运行。

## 本地清理限制

本机工作区`.data`、网页构建／生成缓存等目录的递归清理请求被自动审批拒绝，工具仅给出`blocked by policy`，没有更具体原因。未改用其他工具绕过，也未将这些本地副本计为已删除；当前仍可见：

- `C:\Users\ASUS\Documents\ChatGPT\个人情报站\Info-Hub\.data`
- `C:\Users\ASUS\Documents\ChatGPT\个人情报站\Info-Hub\apps\web\build`
- `C:\Users\ASUS\Documents\ChatGPT\个人情报站\Info-Hub\apps\web\.react-router`

云端已完成清理。本机历史抓取、测试和发布材料若也需清除，仍需要使用者手动处理上述目录；项目代码和依赖未删除。

## PHP2Shell检查

使用[OpenAI php2shell-checker](https://github.com/openai/php2shell-checker)，固定提交`ffcd3fc82e5b404f2a04a95b2805ca7639d530fa`，版本1.0.0。已审阅脚本：URL模式只读响应头，HEAD仅在405／501时退回GET，不跟随跳转，不运行利用载荷。仓库49项自测通过。脚本SHA-256为`e71dd166ce5b42c926480f516a183f295c12a9fe55c8bff5769050c1fc5c7d0e`。

服务器检查依照其[phpcheck-server流程](https://github.com/openai/php2shell-checker/blob/ffcd3fc82e5b404f2a04a95b2805ca7639d530fa/skills/phpcheck-server/SKILL.md)，核对真正服务网站的二进制、包来源及正在运行的进程，未只凭默认CLI下结论。

| 对象 | 实测 | 判定与边界 |
|---|---|---|
| Info-Hub | Node.js应用，已返回410；URL检查无PHP版本头，退出码3 | 此站自身不使用PHP；URL工具结果为UNKNOWN，不等于验证了主机PHP安全 |
| 云端PHP网站 | Nginx配置引用`enable-php-82.conf`，实际master PID1242，二进制`/www/server/php/82/sbin/php-fpm`，版本8.2.33 | `potentially_vulnerable`；低于上游8.2修复版8.2.35，未找到可确认的回移补丁证据 |
| 云端PHP网页响应头 | 对配置中的PHP站首页执行URL检查，无PHP版本头，退出码3 | UNKNOWN；不能覆盖服务器二进制检查结果 |
| 本机XAMPP | 最终复核`PHP_VERSION`和`phpversion()`均为8.2.35；php.exe、php8ts.dll及Apache模块文件版本均为8.2.35 | 版本达到8.2修复线；未见运行中的本机Apache进程，未验证Web工作进程 |

云端为OpenCloudOS 9.6。实际PHP-FPM不归RPM包管理，编译和文件时间为2026-08-24；运行中master于2026-10-17启动。`/proc/1242/exe`与安装路径文件SHA-256一致，为`8b96dc6fe2d14621e1035c802aa71a1fa5c89c45b0e2f84302ac124f19a6ee17`，没有用其他发行版的回移包门槛替代该自建版本。

本机最初CLI版本输出为8.2.12，后续核验时运行时及各组件已为8.2.35；检查期间本任务没有安装或升级PHP，以最后实测为准。

根据[PHP官方2026-10-21公告](https://www.php.net/archive/2026.php#2026-10-21-5)，CVE-2026-109618及CVE-2026-109619的上游修复版为8.2.35／8.3.36／8.4.27／8.5.12。应将云端实际服务的8.2分支升级至至少8.2.35或同分支更高安全版本，并确认PHP-FPM重启后加载新二进制。本次未获修改其他网站PHP运行环境的授权，因此只报告风险，没有替换PHP或重启该服务。

该检查是版本和补丁状态核验，不是恶意代码扫描或“从未被入侵”的证明。

## 验收

- 公网HTTP／HTTPS各新闻入口410，清理头存在。
- Info-Hub容器及专属卷为0、备份目录不存在、18082无监听，本站临时缓存及上传归档不存在。
- 只保留60项来源配置和12419条最小费用记录，无新闻正文／模型回复导出。
- 其他网站配置未改动，原PHP-FPM／MySQL进程仍在；未把业务首页404解释为本次改动导致或服务健康证明。
- 本机历史缓存的自动清理被拒绝，仍待手动处理。
