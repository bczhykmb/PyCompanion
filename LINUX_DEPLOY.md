# 独立Linux服务器部署版

本分支 `deployment/linux-server` 用于阿里云等Linux服务器。原Vercel版仍在 `main`，其启动文件、API入口和部署配置未改动。不要把本分支直接合并到main后触发生产发布。

本地服务器版目录：`D:\hhy\agent-framework\PyCompanion-server-deploy`。
原Vercel版目录：`D:\hhy\agent-framework\edulab\classroom-web`。
两个目录使用Git worktree共享历史，各自保留分支和文件。修改任务材料或提示词后，需要明确哪些提交应同步到另一个分支；不会自动同步。

## 架构

浏览器 -> HTTPS/Nginx -> 仅监听回环地址的Node服务 -> 本机SQLite与外部模型API。
Python仍在浏览器执行。无需Turso或Vercel。此版本采用文件流提供运行环境，不再逐请求解码整个base64运行时；固定版本运行环境可长期缓存，其余页面重新验证缓存。

## 部署前准备

- 服务器Linux、systemd、Nginx，Node.js >=22.13（建议使用仍受支持的Node 22或24版本），npm及Git。
- Node可执行路径用 `command -v node` 核实；以下service模板假设 `/usr/bin/node`，不一致时修改两个service文件。
- 独立子域名解析到服务器，安全组允许80/443。4191仅在本机监听，不对公网开放。
- 已有网站必须新建站点配置，先检查是否有重复域名或端口；若由宝塔管理，使用宝塔站点入口配置，避免混用管理方式。
- 域名备案及接入资格由域名持有人和服务商核实。

## 1. 准备代码和目录

下列命令用于全新目录，已有同名目录时先核实，不能覆盖原网站。

```bash
sudo useradd --system --user-group --home-dir /var/lib/pycompanion --shell /usr/sbin/nologin pycompanion
sudo install -d -o pycompanion -g pycompanion -m 700 /var/lib/pycompanion
sudo install -d -m 755 /opt/pycompanion
sudo install -d -m 750 -o root -g pycompanion /etc/pycompanion
sudo git clone --branch deployment/linux-server https://github.com/bczhykmb/PyCompanion.git /opt/pycompanion
cd /opt/pycompanion
sudo npm ci
sudo node deploy/build.mjs
```

代码文件可由管理员持有，运行进程使用无特权用户。不要上传本地 `.env.local` 或把测试数据库当作正式数据。

## 2. 配置密钥

```bash
sudo install -m 640 -o root -g pycompanion deploy/production.env.example /etc/pycompanion/production.env
sudoedit /etc/pycompanion/production.env
```

填写真实HTTPS域名、教师密码和模型配置。不要提交此文件到GitHub。先用demo检查部署，再切live、重启并生成新的学习码。模式及模型配置按学习码创建时保存，旧码不会自动切换。服务不会读取或生成开发用 `.env.local`，也不会自动回退到演示模式。

## 3. 安装常驻服务

```bash
sudo install -m 644 deploy/pycompanion.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pycompanion
sudo systemctl status pycompanion
curl http://127.0.0.1:4191/api/classroom/health
```

health只检查数据库及配置是否存在，不证明API密钥有效，需额外用测试学习码发送一次真实请求。

## 4. 配置域名与HTTPS

将 `deploy/nginx.conf` 中域名替换为自己的独立子域名，并作为新站点配置加入Nginx。先检查现有站点布局；Ubuntu标准布局示例：

```bash
sudo install -m 644 deploy/nginx.conf /etc/nginx/sites-available/pycompanion
sudoedit /etc/nginx/sites-available/pycompanion
sudo ln -s /etc/nginx/sites-available/pycompanion /etc/nginx/sites-enabled/pycompanion
sudo nginx -t
sudo systemctl reload nginx
```

模板初始仅HTTP，用于证书配置。在域名正确解析后，通过现有证书管理工具或Certbot给该域名配置证书、443监听及HTTP跳转HTTPS，检查证书自动续期。未启用HTTPS前不要让学生登录。配置完成再次执行 `nginx -t` 再reload。

PUBLIC_ORIGIN必须与浏览器访问的HTTPS地址完全一致，不能填本地4191地址。不要信任用户传入的任意代理IP头；模板仅信任本机Nginx覆盖设置的X-Real-IP。当前模板假设浏览器直接连接Nginx，若增加CDN/WAF，要按实际代理链重新配置真实IP，不能直接照搬。

## 5. 备份及数据迁移

```bash
sudo install -m 644 deploy/pycompanion-backup.service deploy/pycompanion-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pycompanion-backup.timer
sudo systemctl start pycompanion-backup.service
```

默认每日03:00（服务器本地时区）备份到数据目录下的backups。使用SQLite一致性快照，不能只复制运行中的.sqlite文件而忽略WAL。定期将备份转存另一台设备，监控磁盘占用并安排保留期限；此脚本不自动删除历史备份。先做一次恢复演练。

新部署使用全新本地数据库；Vercel上的Turso数据、学习码和会话不会自动迁入。若要沿用现有码，先暂停写入，按实际源数据库制定单独迁移方案，校验记录数量、提示词快照和外键后再切换。不要将测试生成的码用于正式实验。

## 6. 验收与更新

- 用正式域名登录教师与学生账号，确认无来源不匹配，Cookie带Secure且数据持久化。
- 验证四组提示词、代码运行及完成提示，使用真实API测试（会产生费用）。
- 用机房真实网络逐步测试到50或100人，分别测冷加载、热加载、聊天和保存；此分支尚不构成容量保证。
- 当前保留45秒模型超时、60秒前端超时和账号限流。未加入全班模型队列、流式回答、自动重试，也未修改研究数据采集范围。
- 使用 `journalctl -u pycompanion` 查看日志。不要把敏感对话或密钥写入运维日志。
- 更新前做备份，确认分支后拉取、安装依赖、构建并重启：

```bash
cd /opt/pycompanion
sudo git pull --ff-only origin deployment/linux-server
sudo npm ci
sudo node deploy/build.mjs
sudo systemctl restart pycompanion
```

出现问题时保留数据和备份，切回上一已验证代码版本重新构建；涉及数据库结构变更时需独立评估回滚，不能盲目覆盖数据库。
