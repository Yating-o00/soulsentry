# 独立后端迁移方案

## 目标

- 让产品可以在国内网络环境独立运行
- 去除对 Base44 平台运行时、托管鉴权、实体系统和函数系统的依赖
- 保留现有 React 前端，按模块分阶段替换数据与后端能力

## 推荐架构

- 前端：Vite + React
- API 网关：Node.js + Express
- 数据层：Prisma + PostgreSQL
- 鉴权：JWT + HttpOnly Cookie 或 Bearer Token
- 对象存储：阿里云 OSS / 腾讯云 COS / MinIO
- 消息能力：阿里云短信、Resend/SES 邮件
- AI 能力：OpenAI 兼容接口 / Gemini / Moonshot，统一封装在 `aiProvider`
- 实时能力：SSE / WebSocket

## 迁移阶段

### 第一阶段：搭骨架

- 建立独立后端目录 `backend/`
- 落地鉴权、用户、任务、笔记、点数等基础模型
- 增加本地运行能力与数据库初始化脚本

### 第二阶段：前端解耦

- 移除 Vite 中的 Base44 插件
- 抽离 `src/api/base44Client.js` 为统一平台适配层
- 新增 `src/api/httpClient.js`、`src/services/*.js`
- 将产品页、账户页、任务页优先切到独立后端

### 第三阶段：核心业务迁移

- `Task / Note / User / UserPreference / Notification`
- Push 订阅与通知中心
- AI 点数、支付订单、信用流水

### 第四阶段：AI 与自动化迁移

- `analyzeIntent`
- `executeAutomation`
- 文档上传与结构化抽取
- Google Calendar / Gmail / WeChat 等第三方连接器

## 当前代码库迁移优先级

### P0

- 鉴权上下文：`src/lib/AuthContext.jsx`
- SDK 入口：`src/api/base44Client.js`
- 产品页与点数：`src/pages/Pricing.jsx`
- 用户缓存：`src/lib/userCache.js`

### P1

- 任务页：`src/pages/Tasks.jsx`
- 笔记页：`src/pages/Notes.jsx`
- 通知页：`src/pages/Notifications.jsx`
- 账户页：`src/pages/Account.jsx`

### P2

- 欢迎页 AI 解析：`src/pages/Welcome.jsx`
- 自动化执行：`src/components/automation/*`
- 地理围栏、设备心跳、知识库、团队协作

## 国内部署建议

- 应用服务器：阿里云 ECS / 腾讯云 Lighthouse / 华为云 ECS
- 数据库：阿里云 PolarDB / 腾讯云 MySQL / 自建 PostgreSQL
- 对象存储：OSS / COS
- CDN：阿里云 CDN / 腾讯云 CDN
- HTTPS：Nginx + Let's Encrypt 或云厂商证书

## 现阶段产出

- 已新增 `backend/` 独立 Node 后端骨架
- 已定义 Prisma 数据模型和基础鉴权/任务/笔记/点数 API
- 后续建议先把产品页和账户页切换到新后端，再扩大迁移范围
