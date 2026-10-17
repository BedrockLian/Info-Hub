# Taiwan News 路由修复（待生产确认）

仅适用于Dockerfile固定的RSSHub基础镜像。用户指定新增Taiwan News，当前官方页面已改用Next.js，原`/taiwannews/hot/en`选择器返回空源。覆盖文件读取公开页面的JSON Flight数据，保留原始发布时间；不执行页面脚本，不新增浏览器、账户或依赖。文章串行读取，沿用RSSHub内容缓存。仅验证英文路由；不宣称繁体中文路由可用。

`taiwannews-parser.mjs`识别嵌套列表、短正文属性和按UTF-8字节长度分帧的长正文，缺少日期或正文时不补造。单篇抓取失败保留列表的真实摘要和日期，交回本站原有提取及审核链路。站内及对外全文权限不变。

本地检查：`node --test ops/rsshub-overrides/taiwannews-parser.test.mjs`，8项通过。隔离RSSHub实读5篇，5篇有日期和正文，重复读取HIT；AP移动接口仍可用。待发布镜像`infohub-rsshub:taiwannews-20261017`，本机服务器镜像ID为`sha256:f9b39cca0d21bad897b7039dc400b531f1d6b89352d973fa5e8947c13423a484`。该镜像尚未用于生产，隔离候选容器已移除。

确认后先核对镜像ID并备份当前运行配置，仅将RSSHUB_IMAGE切换为已验证的本地镜像，使用当前双Compose配置、`--no-deps --no-build --pull never`仅重建rsshub。核对健康及本站预览后才启用`infohub-taiwannews`，首抓最多4篇；失败恢复原固定镜像并保持该源暂停。不重启API／web／worker，不恢复旧数据库覆盖新数据。

回退基础镜像：`ghcr.io/diygod/rsshub@sha256:a1e7e833825780ae29d0f761029cea4cd313856ad63402e8d9caad277b9e2311`。升级上游基础镜像时，必须重新核对覆盖目标文件和工具模块名，不能直接沿用本Dockerfile。公开来源与当前状态见[本轮来源记录](../../docs/rsshub-six-sources-20261017.md)。
