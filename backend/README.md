# SoulSentry Standalone Backend

这是一个可独立部署的后端骨架，用于替代当前项目对 Base44 的平台依赖。

## 技术栈

- Node.js + Express
- Prisma ORM
- SQLite（本地开发）
- JWT 鉴权

## 已实现

- 健康检查：`GET /api/health`
- 账号注册：`POST /api/auth/register`
- 账号登录：`POST /api/auth/login`
- 当前用户：`GET /api/auth/me`
- 用户资料：`GET/PATCH /api/users/me`
- AI 点数余额：`GET /api/credits/balance`
- AI 点数明细：`GET /api/credits/transactions`
- AI 点数充值占位接口：`POST /api/credits/top-up`
- 任务列表与创建：`GET/POST /api/tasks`
- 笔记列表与创建：`GET/POST /api/notes`

## 本地启动

1. 复制环境变量

```bash
cp .env.example .env
```

2. 安装依赖

```bash
npm install
```

3. 初始化数据库

```bash
npm run prisma:generate
npm run prisma:push
npm run db:seed
```

4. 启动服务

```bash
npm run dev
```

默认演示账号：

- 邮箱：`demo@soulsentry.local`
- 密码：`demo123456`

## 迁移建议

- 本地开发先使用 SQLite，生产环境切换到 PostgreSQL 或 MySQL
- 将前端的 `base44.auth / base44.entities / base44.functions` 逐步收敛到显式 REST API
- 优先迁移鉴权、任务、笔记、点数、通知，再迁移 AI 编排与第三方连接器
