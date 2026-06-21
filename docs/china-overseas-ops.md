# 国内/海外双线运营更新手册

## 1. 当前架构

- `main`：海外主线，继续服务 Base44 / 海外运营。
- `china-standalone`：国内主线，部署到国内服务器，前端走 `nginx`，后端走独立 Node + Prisma。
- 国内服务器当前目录：
  - 前端/后端代码：`/opt/soulsentry/china-app`
  - 前端静态文件：`/var/www/soulsentry`
  - 后端服务：`soulsentry-backend.service`
  - Nginx 配置：`/etc/nginx/conf.d/soulsentry.conf`

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

    ssl_certificate /etc/letsencrypt/live/www.xinzhan-soulsentry.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.xinzhan-soulsentry.cn/privkey.pem;

    return 301 https://www.xinzhan-soulsentry.cn$request_uri;
}
```

说明：

- 如果后续给裸域名单独申请证书，证书路径应改成裸域名自己的 `live` 目录。
- 如果当前浏览器里裸域名已经能正常打开，而你也接受裸域名直接服务，那可以暂时不改；但长期推荐统一跳转到 `www`。

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

## 6. 国内站更新流程

### 6.1 代码更新

如果 `china-standalone` 已有新代码，服务器执行。

注意：

- 可以删除并重建 `china-app` 代码目录
- 但数据库必须在 `/opt/soulsentry/data/china.db`
- `.env` 必须先备份在 `/opt/soulsentry/config/backend.env`
- 更新前先做一次数据库备份

先备份：

```bash
mkdir -p /opt/soulsentry/backups
cp /opt/soulsentry/data/china.db /opt/soulsentry/backups/china-$(date +%F-%H%M%S).db
cp /opt/soulsentry/config/backend.env /opt/soulsentry/backups/backend-$(date +%F-%H%M%S).env
```

再更新代码：

```bash
cd /opt/soulsentry
rm -rf china-app soulsentry-china.tar.gz soulsentry-china-standalone
curl -L -o soulsentry-china.tar.gz https://codeload.github.com/Yating-o00/soulsentry/tar.gz/refs/heads/china-standalone
tar -xzf soulsentry-china.tar.gz
mv soulsentry-china-standalone china-app
```

### 6.2 后端更新

```bash
cp /opt/soulsentry/config/backend.env /opt/soulsentry/china-app/backend/.env
cd /opt/soulsentry/china-app/backend
npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
# 只有 schema 真的变化时，才执行下面这条
# npx prisma db push --accept-data-loss
sudo systemctl restart soulsentry-backend
sudo systemctl status soulsentry-backend --no-pager
```

如果这次后端 schema 有改动，建议先备份数据库再执行：

```bash
cp /opt/soulsentry/data/china.db /opt/soulsentry/backups/china-before-schema-$(date +%F-%H%M%S).db
npx prisma db push --accept-data-loss
```

### 6.3 前端更新

```bash
cd /opt/soulsentry/china-app
cat > .env.production <<EOF
VITE_API_MODE=standalone
VITE_API_BASE_URL=
EOF

npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
npm run build
sudo rm -rf /var/www/soulsentry/*
sudo cp -r dist/* /var/www/soulsentry/
sudo systemctl reload nginx
```

### 6.4 更新后检查

```bash
curl https://www.xinzhan-soulsentry.cn/api/health
curl -I https://www.xinzhan-soulsentry.cn
ls -lh /opt/soulsentry/data/china.db
grep '^DATABASE_URL=' /opt/soulsentry/china-app/backend/.env
sudo systemctl status soulsentry-backend --no-pager
sudo nginx -t
```

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
