# 小助手规划 Harness Eval

运行环境为 Node.js 22+，先在 `backend` 安装依赖并生成 Prisma Client。

```bash
cd backend
npm run eval:harness
npm run eval:memory -- --retrieval-only
```

`eval:harness` 使用临时 SQLite、合成账户、固定中国时间、真实 Express 路由和假 provider。它检查提案时长、追问与补答、修复上限、忙碌时段、改期、权限及确认后的数据库。默认 Kimi 与 DeepSeek 都覆盖。成功标准由用例独立定义，模型请求不会出网。确认操作检查任务写入与记忆确认信号，普通任务创建兼容原路由。

## 真实模型对照

从仓库根目录执行以下命令。环境中需要已授权的 `DEEPSEEK_API_KEY`。可设置 `DEEPSEEK_MODEL`，同轮对照应使用相同模型标识。

```bash
node backend/scripts/harness-eval/live.js --checkout . --out /tmp/harness-after.json
node backend/scripts/harness-eval/live.js --checkout /path/to/baseline --out /tmp/harness-before.json
```

每臂各跑三道合成中文题，每题两次，每次最多三次模型调用，每臂最多 18 次。所有账户使用同样的初始任务和预设证据。只确认通过独立检查的提案，再核对 SQLite 里的父子任务、标题及实际时间。报告记录分题结果、调用、Token、耗时与两次都通过的题数。样本量适合核对具体故障与回归。
