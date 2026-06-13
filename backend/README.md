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
- Kimi 文本调用：`POST /api/functions/invokeKimi`
- Kimi 联网搜索：`POST /api/functions/kimiWebBrowse`
- Kimi 日程分析：`POST /api/functions/analyzeIntent`

## Kimi 配置

在 `backend/.env` 中配置以下任一变量即可：

```bash
KIMI_API_KEY=your_kimi_key
# 或
MOONSHOT_API_KEY=your_moonshot_key
KIMI_BASE_URL=https://api.moonshot.ai/v1
```

说明：

- 当前已接入文本与结构化 JSON 输出
- `invokeKimi` 的附件上传和文档抽取能力暂未迁移
- 未配置 Key 时，相关接口会返回明确错误：`KIMI_API_KEY 或 MOONSHOT_API_KEY 未配置`
- 请优先使用 Kimi Open Platform / Moonshot Open Platform 的模型 API Key，而不是 Kimi Code 专用 key

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
- 建议下一步把 `Welcome`、`SoulSentryHub`、`SmartDailyPlanner` 直接切到 `analyzeIntent`
