# SoulSentry

## 当前结构

- `src/`: 前端应用
- `backend/`: 独立后端骨架，替代 Base44 的第一阶段实现
- `docs/backend-migration.md`: 去 Base44 迁移方案

## 前端启动

```bash
cp .env.example .env
npm install
npm run dev
```

## 独立后端启动

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:push
npm run db:seed
npm run dev
```
