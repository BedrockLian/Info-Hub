# 新环境部署

这是当前Info-Hub配置的安装说明。本站现有云端的版本、双Compose覆盖文件、备份与回退见[生产运维说明](infohub-deploy.md)；更新GitHub代码不等于授权切换生产。需要Node.js 24.11以上、Docker及Compose，容器内使用PostgreSQL 17。2GB服务器已能运行本站，但不宜同时执行完整构建和生产处理；完整构建与回归优先放在独立机器或GitHub CI。

## Docker启动

```bash
git clone https://github.com/BedrockLian/Info-Hub.git
cd Info-Hub
npm ci
node scripts/init-env.ts --quiet
docker compose up -d --build
```

脚本拒绝覆盖已有.env，生成独立管理员密码、会话／图片签名及数据库密钥。访问密码从本机.env的ADMIN_PASSWORD读取；API Key只在本机或服务器运行配置里填写，不放进命令行、仓库或文档。默认不采集、不调用模型、不外发。

浏览器打开http://127.0.0.1:18082，全站需登录，后台为/admin。根Compose只将Web绑定到宿主机回环；API与数据库不暴露宿主机端口。不要以服务器公网地址的3000端口作为默认入口。

首次启动依次执行数据库迁移和种子，再启动API、worker、web。当前默认包36项、35启用、Reuters暂停；seed只插入缺失来源，保留既有频率、启停和权限。出现内容的时间取决于采集开关、模型／金额／次数阀及处理队列，不承诺启动后自动付费或固定时间完成回填。

## 可选的内部RSSHub

默认包中的部分来源需要内部RSSHub。新环境可直接构建本仓库的Taiwan News兼容镜像：

```bash
docker build -t infohub-rsshub:local ops/rsshub-overrides
```

在本机.env追加以下非秘密配置（已有项应修改原项，避免重复）：

```dotenv
RSSHUB_IMAGE=infohub-rsshub:local
RSSHUB_BASE_URL=http://rsshub:1200
```

```bash
docker compose -f docker-compose.yml -f ops/rsshub.compose.yml up -d --build
```

之后继续使用两份Compose文件。覆盖文件将API连接池设为4、worker保留10、空闲回收120秒、采集并发2；RSSHub上限384MiB、0.5核，无宿主机端口、Redis或浏览器。不要把worker池降为4，其事件／日报锁与嵌套查询会发生连接饥饿。

未部署RSSHub时，可在后台暂停配置包含rsshubRoute的来源；不要打开全局私网抓取来代替专用内部入口。后台新建RSS源可选“本站RSSHub”，只填相对路由并先预览。rsshubRoute与feedUrl互斥，RSSHub不会授予全文展示权。更多说明见[RSSHub](rsshub.md)及[覆盖模块](../ops/rsshub-overrides/README.md)。

## 域名与HTTPS

根Compose没有Caddy容器或https profile。用已有Nginx或其他反向代理提供HTTPS，将流量转发到http://127.0.0.1:18082；在.env中设置真实SITE_URL=https://你的域名，有可信代理时启用TRUST_PROXY。PORT是纯数字宿主机端口，默认18082，绑定地址已在Compose中固定为127.0.0.1，不填写127.0.0.1:3000。

RSS客户端使用后台创建的可撤销、有限期只读Bearer令牌。Cookie用于浏览器登录；Bearer没有后台写权限，不在查询参数里传递令牌。生产模式强制私有，内容响应禁用共享缓存。

## 启用与更新

核验信源预览、正文／摘要权限以及模型预算后，在.env配置LLM_API_KEY并按需打开COLLECT_ENABLED与MODEL_CALLS_ENABLED，再以同一Compose组合重建受影响的应用服务。新环境采用默认金额和次数阀；本站生产自定义值见[当前状态](status.md)，不能把两者混为一套。

普通新安装可在备份后更新代码并重新构建。本站生产使用已验收的版本目录与镜像，先确认发布，保留/opt/infohub/shared/rsshub.compose.yml和现有密钥，不直接套用git pull与Compose重建覆盖生产配置。迁移只做向后兼容增量；失败回退应用镜像，保留新增数据和付费回执，不恢复旧整库覆盖新写入。

## 备份与日志

```bash
docker compose exec -T db pg_dump -U infohub -d infohub > infohub-backup.sql
docker compose logs --tail 100 api worker web
```

使用RSSHub时，上述管理命令也保留两份Compose参数。数据库在db卷，上传／图片缓存及本地附件在data卷；根配置没有caddy卷。备份文件和运行.env含敏感内容，应限制访问并留在Git之外。docker compose down -v会删除数据卷，不用于普通更新或回退。对象存储备份配置见.env.example，不能把配置存在当作已验证备份成功。

## 不使用Docker

准备Node.js 24.11以上及独立PostgreSQL数据库，执行npm ci和init-env，填写DATABASE_URL、API_BASE_URL及模型配置；迁移、种子与Web构建后分别运行API、worker和Web。完整命令与检查见[架构](architecture.md)和README。

开发保持采集、模型及外发关闭。完整后端和网页回归以Linux CI为准；Windows存在已有绝对路径动态导入与退出信号差异，不以本地构建代替运行测试。
