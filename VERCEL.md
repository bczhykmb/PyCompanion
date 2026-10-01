# PyCompanion: Vercel 部署

## 为什么旧版本出现 500

旧的 server.mjs 是本机启动入口，会创建 .env.local 和 data/classroom.sqlite。GitHub 不包含这些私密文件，Vercel 也不能把函数本地文件当作持久化数据库。现在改为静态网页 + api/classroom.mjs 函数；本机入口改名为 local-server.mjs，仍通过 npm run dev 启动。

## Vercel 项目设置

1. Git 仓库：bczhykmb/PyCompanion，分支 main，Root Directory 为仓库根目录（留空），不是 public 或父项目的目录。
2. Framework Preset：Other。使用仓库的 vercel.json：Build Command 为 npm run build:vercel，Output Directory 为 dist/vercel。撤销旧的自定义构建/输出目录覆盖。
3. Node.js 选择 22.x 或 24.x。不要配置运行本机的 npm run dev 作为构建命令。
4. 配置下面的 Production 环境变量，再重新部署最新提交。需要预览环境时也配置 Preview，但正式研究和测试建议使用不同数据库。

| 变量 | 配置方式 |
| --- | --- |
| ADMIN_PASSWORD | 教师自己设置的至少16位强密码；只填在服务器环境变量，不发给学生 |
| MODEL_MODE | 目前填 demo |
| TURSO_DATABASE_URL | 从自己的 Turso/libSQL 云数据库复制连接地址 |
| TURSO_AUTH_TOKEN | 该数据库的读写令牌，仅保存于 Vercel 环境变量 |

没有大模型密钥也能进行明确标识的演示；没有云数据库则只显示登录页面和配置提示，不能生成学习码、登录或存储对话。本版本没有用浏览器缓存或函数临时文件替代集中保存。

## 云数据库

当前适配 Turso 官方 @libsql/client。新建一个专用于本项目的数据库，从其控制台获取 URL 和读写 token。费用、区域、数据处理要求以服务商当前条款和学校审批为准；代码不会代为创建账户、购买服务或上传原有学生数据。

首次访问 API 时会按 drizzle/*.sql 自动初始化表结构，成功后在数据库记录版本；后续不会清空表。首次连接失败可重试，详细配置错误查看 Vercel Logs。禁止使用 file: 数据库地址。

本机的管理密码、学生学习码和聊天记录不会随 Git 推送自动迁移。线上配置完毕后进入 /manage，用线上 ADMIN_PASSWORD 登录并生成新的个人学习码。需要迁移已有正式记录时，应另做备份和受控迁移，不要把数据库提交进 Git。

## 验收

- 首页 / 和教师页 /manage 显示正确界面。
- /api/classroom/health 返回 ok: true；教师配置缺失会返回明确的 503 JSON，而不是整站 500。
- 教师登录，生成测试码，学生登录、切换9个任务、运行 Python、提问。
- 刷新或重新部署后，学习码及已提交的对话仍在。
- Python 运行组件已随构建发布至 `/python-runtime/v314.0.7/`，学生浏览器不再请求外部 Pyodide CDN。部署端安装依赖时仍需访问 npm 仓库。
- 在机房验证域名、数据库和本站运行组件可访问，再实测30人同时使用；代码测试不能替代实际并发验收。组件首次下载约13MB，应测量全班首次加载耗时。
- 真实模型实验前再配置 MODEL_MODE=live、MODEL_API_KEY 等，重新生成对应真实模式的学习码。

## 本地命令

```powershell
npm install
npm test
npm run build
npm run dev
```

Vercel 构建校验：npm run build:vercel。浏览器测试脚本目前使用开发机的 Chrome/Playwright 绝对路径，不作为 Vercel 构建步骤。

依据：https://vercel.com/docs/functions/runtimes/node-js 、https://vercel.com/kb/guide/is-sqlite-supported-in-vercel 、https://docs.turso.tech/sdk/ts/reference 。
