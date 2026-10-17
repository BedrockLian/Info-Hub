# 当前 SSH 连接

2026-10-17 20:02发布复验：本机使用已配置的默认SSH身份可正常连接相同主机，严格主机校验保持开启；旧`D:\下载\1.pem`路径当前不存在，未复制或重新分发私钥。当前可用只读命令为：

```powershell
ssh -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 root@43.128.10.41 "hostname; id -un"
```

下表及显式`-i`示例保留2026-10-14的历史连接信息，仅在原私钥路径重新可用后使用，不能因路径失效关闭主机验证。

2026-10-14（北京时间）实测：以下密钥成功连接 `VM-0-4-opencloudos`，登录用户为 `root`。

| 项目 | 当前值 |
|---|---|
| 服务器 | `43.128.10.41` |
| 端口 / 用户 | `22` / `root` |
| 用户提供的资源 ID | `lhkp-j68u02w7` |
| 密钥标识 | `skey-643k6wrb`，RSA |
| 本机私钥路径 | `D:\下载\1.pem` |
| 可信主机记录 | `C:\Users\ASUS\.ssh\known_hosts` |
| 已核验的主机 ED25519 指纹 | `SHA256:TtqUknO3nzVo19SaK2YdX8B82zo/5sNskeFbJqioLyk` |

资源 ID 和密钥标识不是 SSH 连接别名。本次未修改 `C:\Users\ASUS\.ssh\config`；已有 `campus-server` 别名仍可能选择旧私钥，当前优先使用下面的显式命令。

## 连接与传输

PowerShell 只读登录验证：

```powershell
ssh -p 22 -i "D:\下载\1.pem" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 root@43.128.10.41 "hostname; id -un"
```

交互终端：

```powershell
ssh -p 22 -i "D:\下载\1.pem" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 root@43.128.10.41
```

上传指定文件（替换本地文件路径）：

```powershell
scp -P 22 -i "D:\下载\1.pem" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 "C:\实际目录\release.tar" root@43.128.10.41:/tmp/release.tar
```

私钥曾因继承的访问权限过宽而被 Windows OpenSSH 拒绝，已将该文件 ACL 收紧为当前 Windows 用户只读，登录复验成功。不要将私钥复制到仓库、发布包或文档；也不要发送私钥内容、密码或 API Key。迁移文件后如再次出现 `UNPROTECTED PRIVATE KEY FILE`，检查文件 ACL，不能靠关闭主机验证解决。

## 操作范围

仅操作 Info-Hub：`/opt/infohub`、Compose 项目 `infohub`、新闻域名 `news.blian117.dpdns.org`。运行密钥仍在服务器 `/opt/infohub/shared/.env`，不要输出文件内容。保留服务器其他站点、数据库、共享 Nginx 配置及既有 SSH 授权。

部署与回退见 [部署说明](infohub-deploy.md)。本次新密钥成功登录不代表 Pi 版本已发布，具体版本与验证状态见 [Pi 接入记录](pi-agent.md)。
