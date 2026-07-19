# 心栈自建后端运行说明

## 当前状态

仓库已补上一套 `self-host` 兼容层：

- 前端可通过 `VITE_BACKEND_MODE=self-host` 切到自建后端
- 自建后端提供单用户鉴权、通用实体 CRUD、文件上传、LLM 调用和一批核心函数兼容实现
- 国内运行优先走本地 Node 服务，不再强依赖 `Base44` 运行时

## 启动方式

1. 安装依赖

```bash
npm install
```

2. 启动自建后端

```bash
npm run backend:selfhost
```

3. 启动前端

```bash
npm run dev:selfhost
```

默认后端地址为 `http://localhost:8787`。

## 可选环境变量

```bash
PORT=8787
HOST=0.0.0.0
VITE_BACKEND_MODE=self-host
VITE_SELF_HOST_BACKEND_URL=http://localhost:8787
KIMI_API_KEY=your_key
MOONSHOT_API_KEY=your_key
MOONSHOT_MODEL=moonshot-v1-8k
VAPID_PUBLIC_KEY=your_public_key
SELF_HOST_DEFAULT_EMAIL=local@xinzhan.local
SELF_HOST_DEFAULT_NAME=本地用户
```

## 已覆盖能力

- `auth.me / auth.updateMe / auth.logout`
- 通用实体 CRUD：`Task`、`Note`、`Notification`、`UserPreference` 等所有实体统一走 `/api/entities/:name`
- 文件上传、图片生成、LLM 调用
- 任务翻译、心签分析、日/周/月规划、每日简报、RSS 拉取、地理情境卡片、推送订阅保存
- 微信支付本地演示单、邮件记录、本地通知落表

## 仍是简化版的能力

- Google Calendar / Google Tasks 目前返回明确的本地模式提示，未接第三方同步
- Stripe 在自建模式下未接正式收银台
- 自动执行、外部搜索、推送下发、企业微信等已补兼容返回，但仍是本地优先的轻量实现

## 数据存储

- 本地数据文件：`server/data/db.json`
- 上传文件目录：`server/uploads/`

重置本地数据时，删除 `server/data/db.json` 后重启后端即可。
