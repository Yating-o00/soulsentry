# 国内/海外双线运营更新手册

## 1. 当前架构

- `main`：海外主线，继续服务 Base44 / 海外运营。
- `china-standalone`：国内主线，部署到国内服务器，前端走 `nginx`，后端走独立 Node + Prisma。
- 国内服务器当前目录：
  - 前端/后端代码：`/opt/soulsentry/china-app`
  - 前端静态文件：`/var/www/soulsentry`
  - 后端服务：`soulsentry-backend.service`
  - Nginx 配置：`/etc/nginx/sites-enabled/default`（注意：是实体文件，与 `sites-available` 没有软链，改 available 不生效；改完 `sudo nginx -t && sudo systemctl reload nginx`）

## 2. 域名与路由

### 2.1 当前域名

- `https://www.xinzhan-soulsentry.cn`：国内正式站点。
- `https://xinzhan-soulsentry.cn`：裸域名，建议长期保持可访问并跳转到 `www`。

### 2.2 裸域名建议

如果裸域名已能访问，建议仍然统一收口到 `www`，避免搜索引擎和分享链接出现两个主地址。

推荐 DNS：

- `www`：`A` 记录，指向国内服务器公网 IP。
- `@`：`A` 记录，指向同一台国内服务器公网 IP。

推荐 Nginx 收口方式：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name xinzhan-soulsentry.cn;
    return 301 https://www.xinzhan-soulsentry.cn$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name xinzhan-soulsentry.cn;

    client_max_body_size 50M;

    ssl_certificate /etc/letsencrypt/live/www.xinzhan-soulsentry.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.xinzhan-soulsentry.cn/privkey.pem;

    return 301 https://www.xinzhan-soulsentry.cn$request_uri;
}
```

说明：

- 如果后续给裸域名单独申请证书，证书路径应改成裸域名自己的 `live` 目录。
- 如果当前浏览器里裸域名已经能正常打开，而你也接受裸域名直接服务，那可以暂时不改；但长期推荐统一跳转到 `www`。

> ⚠️ `client_max_body_size 50M` 必须同时加在 **`www.xinzhan-soulsentry.cn` 的 443 server 块**（实际服务 `/api`、`/uploads` 的块）里，不能只加在裸域名跳转块。缺了它，nginx 默认 1MB 上限会在请求到达 Node 之前直接返回 `413 Request Entity Too Large` HTML 错误页，表现为"附件上传失败：服务端返回非 JSON 响应（413）"。修复：
>
> ```bash
> sudo grep -n 'client_max_body_size' /etc/nginx/sites-enabled/default  # 确认 www 块里有没有
> # 在 www 的 443 server{} 内补一行：client_max_body_size 50M;
> sudo nginx -t && sudo systemctl reload nginx
> ```
>
> 验证：不带 token 上传一个 2MB 文件到 `/api/uploads`，应返回 401 JSON（到达后端）而不是 413 HTML。后端 multer 上限同为 50MB（`backend/src/routes/uploads.js`），两边保持一致。

## 3. 国内配置与持久化

### 3.1 持久化目录

为避免后续更新代码时再次丢失数据库或 `.env`，国内服务器固定使用下面两个目录：

- 数据库：`/opt/soulsentry/data/china.db`
- 后端环境变量备份：`/opt/soulsentry/config/backend.env`

推荐先执行一次初始化：

```bash
sudo mkdir -p /opt/soulsentry/data /opt/soulsentry/config /opt/soulsentry/backups
```

如果后端当前 `.env` 可用，立刻备份一份：

```bash
cp /opt/soulsentry/china-app/backend/.env /opt/soulsentry/config/backend.env
```

### 3.2 数据库固定路径

后端 `.env` 中的数据库地址固定为：

```env
DATABASE_URL="file:/opt/soulsentry/data/china.db"
```

不要再使用 `file:./prisma/dev.db` 这种项目内相对路径，否则重新拉代码目录时容易把数据库一起删掉。

### 3.3 国内 Kimi Key 配置

配置位置建议分两份：

- 当前运行文件：`/opt/soulsentry/china-app/backend/.env`
- 永久备份文件：`/opt/soulsentry/config/backend.env`

至少配置以下字段：

```env
KIMI_API_KEY=sk-你的国内Key
KIMI_BASE_URL=https://api.moonshot.cn/v1

# 可选国际备用
KIMI_FALLBACK_API_KEY=sk-你的国际备用Key
KIMI_FALLBACK_BASE_URL=https://api.moonshot.ai/v1
```

### 3.4 安全修改步骤

在服务器执行：

```bash
sed -n '1,160p' /opt/soulsentry/config/backend.env
```

确认后编辑：

```bash
nano /opt/soulsentry/config/backend.env
```

填入或修改：

```env
NODE_ENV=production
PORT=3001
DATABASE_URL="file:/opt/soulsentry/data/china.db"
JWT_SECRET=你的长随机串至少16位
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://www.xinzhan-soulsentry.cn,https://xinzhan-soulsentry.cn,http://39.105.75.92

KIMI_API_KEY=sk-你的国内Key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_FALLBACK_API_KEY=sk-你的国际备用Key
KIMI_FALLBACK_BASE_URL=https://api.moonshot.ai/v1
```

保存后同步回当前代码目录，再重启后端：

```bash
cp /opt/soulsentry/config/backend.env /opt/soulsentry/china-app/backend/.env
sudo systemctl restart soulsentry-backend
sudo systemctl status soulsentry-backend --no-pager
```

### 3.5 验证方式

先检查后端是否存活：

```bash
curl https://www.xinzhan-soulsentry.cn/api/health
```

再在页面里实际测试：

- Welcome 输入一段自然语言
- Dashboard 的 AI 日程规划输入一条指令
- Notes / Tasks 中执行一次 AI 相关功能

如果 Kimi Key 未配置或失效，常见现象是：

- 后端返回 500/502
- 页面提示 AI 调用失败
- 终端日志出现 `KIMI_API_KEY 或 MOONSHOT_API_KEY 未配置`

## 4. 海外改动如何同步到国内

推荐原则：

- 海外 Base44 / 产品主线改动，先进入 GitHub `main`
- 国内部署改动，只进入 `china-standalone`
- 需要同步时，把 `main` 的通用产品改动合并进 `china-standalone`

适合同步到国内的内容：

- 页面文案
- UI 样式
- 通用组件
- 不依赖 Base44 平台的前端功能
- 通用业务逻辑

不建议直接同步的内容：

- Base44 平台专属函数实现
- 海外专用环境变量
- 海外支付/鉴权配置
- 只存在于 Base44 平台但未回写 GitHub 的改动

## 5. 国内改动如何回流海外

建议分两类：

- 产品层改动：如果是通用页面/文案/组件，可以从 `china-standalone` 挑选提交，回合并到 `main`
- 部署层改动：如 `backend/`、国内独立鉴权、国内 Nginx/Node/Prisma 适配，不回流 `main`

简单原则：

- 能被 Base44 继续使用的改动，才考虑回流海外
- 只为国内独立后端服务的改动，留在 `china-standalone`

## 6. 国内发布：本地构建、校验产物、查询结果

使用 [部署留档流程](deployment-observability.md)。生产服务器不执行前端构建，也不复用历史 dist。不要再使用 `SKIP_FRONTEND_BUILD=0`；构建占满生产资源会影响服务。

### 6.1 本地或 CI

提交源代码后在干净的目标 commit 上构建：

```bash
npm ci
npm run build:release -- --output /tmp/soulsentry-artifacts
```

构建输出唯一部署 ID、完整 commit SHA、产物包和 SHA-256。上传产物并在服务器将源码切到同一 commit，然后执行输出中的 `deploy.sh --deployment-id ... --artifact ... --sha256 ...` 命令。

### 6.2 服务器配置与数据库

- 权威运行环境文件为 `/opt/soulsentry/shared/backend.env`，不输出 Key，不上传公开仓库。
- `current` 软链指向当前 release，上传文件存放于 shared/uploads。
- 部署不修改数据库结构，schema 与上一 release 不同会拒绝。需要迁移时另行备份、审阅并执行迁移，不使用自动接受数据丢失的命令。
- 不从本机直接执行服务器脚本；使用既有 SSH 或阿里云命令助手入口。

### 6.3 查询与验收

```bash
sudo node scripts/deployment/status.mjs --reconcile
curl -fsS https://www.xinzhan-soulsentry.cn/api/health
curl -fsS https://www.xinzhan-soulsentry.cn/api/version
curl -fsS https://www.xinzhan-soulsentry.cn/release-identity.json
```

部署记录保存在 shared/deployments，不随旧 release 清理。只有前后端版本和健康检查全部通过才标记成功。中断或回滚无法核实的记录保留未知状态，阻止未经核实的下一次发布。GitHub 摘要同步故障可重试，原始运行日志留在服务器。

## 7. 日常巡检

建议每次上线后至少检查：

- 首页是否正常打开
- `/api/health` 是否返回 `ok: true`
- Welcome 是否能正常进入 Dashboard
- AI 入口是否能正常调用 Kimi
- `/opt/soulsentry/data/china.db` 是否仍存在且大小正常
- 后端服务是否仍为 `active (running)`

建议常用命令：

```bash
sudo systemctl status soulsentry-backend --no-pager
sudo journalctl -u soulsentry-backend -n 100 --no-pager
sudo nginx -t
curl https://www.xinzhan-soulsentry.cn/api/health
ls -lh /opt/soulsentry/data/china.db
```

## 8. 推荐长期策略

- 海外线：继续用 `main` + Base44
- 国内线：继续用 `china-standalone` + 独立后端
- 产品改动优先在 GitHub 管理，避免只留在平台里
- Base44 上发生的重要产品改动，要尽量定期同步回 GitHub
- 国内环境变量、域名、证书、数据库路径，只保留在国内部署体系中
- 国内数据库与 `.env` 必须外置到代码目录之外
