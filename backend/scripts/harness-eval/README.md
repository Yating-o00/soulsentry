# Harness Eval

运行环境为 Node.js 22+，先在 `backend` 安装依赖并生成 Prisma Client。

```bash
cd backend
npm run eval:harness
npm run eval:memory -- --retrieval-only
```

`eval:harness` 运行通用 Harness 评测器的自测，以及现有排程 Harness 的离线回归。排程回归使用临时 SQLite、合成账户、固定中国时间、真实 Express 路由和假 provider。它检查提案时长、追问与补答、修复上限、忙碌时段、改期、权限及确认后的数据库。默认 Kimi 与 DeepSeek 都覆盖。成功标准由用例独立定义。确认操作检查任务写入与记忆确认信号，普通任务创建兼容原路由。

## 通用 Harness 专项题

用合成记录和固定初始状态验证工具选择、运行续接、确认和写入。每道题重新初始化环境。两个批量移动题留给 M4，检验新适配器能否复用同一套运行规则。

| 题目 | 输入和处理轨迹 | 通过条件 |
| --- | --- | --- |
| 1. 带同名诱饵的查询 | 问周报 A 是否已完成。集合里有同名项，另一账号还有一条同名且已完成的记录 | 读取本人周报 A，回答仍开着，零写入 |
| 2. 追问后续接 | 用户说「把那条还开着的周报标记为完成」。查到 A、B 后追问。用户选 B，再确认提案 | 三个不同 `runId` 共享 `taskId`，只修改 B，确认前零写入 |
| 3. 软偏好无需追问 | 查询周报 B 在哪个集合，格式由 Agent 决定，偏好简短 | 读取记录与所属集合，直接返回收件箱，零写入 |
| 4. 旧提案失效 | 先提议标为完成。用户改为暂缓，依次提交旧提案和新提案的确认 | 旧确认被拒绝，只应用新提案中的暂缓 |
| 5. 并发确认 | 对同一个提案并行发出两次确认 | 两次结果都指向已处理的动作，同一操作 ID，实际只提交一次 |
| 6. 跨账号确认 | 另一账号先确认，然后本人确认同一提案 | 外账号不拿到提案内容且无写入尝试，本人确认成功 |
| 7. 批量读后写（M4 留出） | 查收件箱和评审箱容量，预览一次性移动 A、B，再确认 | 提案引用查到的记录和目标版本。一次原子提交，两条都移动 |
| 8. 提交后超时 | 模拟工具完成写入，但第一次响应只返回超时 | 用操作 ID 查到提交结果再报告成功，写工具只调用一次 |
| 9. 核实服务不可用 | 模拟工具完成写入后超时，同时查证接口不可用 | 返回 `unverified`，保留待核实状态，写工具只调用一次 |
| 10. 确认前容量变化（M4 留出） | 生成批量移动提案后，外部动作占用一个名额。旧确认被拦截，用户改选备用箱，再确认 | 旧提案零写入。重查目标并生成新提案，最终两条一起进备用箱 |

从 `backend` 单独运行评测器自测，无需 API key。

```bash
node --test scripts/harness-eval/general-cases.test.js
```

自测用脚本提供已知正确和错误的处理轨迹，验证 grader 和模拟环境。真实 Harness 接入后，向 `runGeneralCase` 传入它的驱动即可测同一批题。

```js
import { generalCases } from "./scripts/harness-eval/general-cases.js";
import { runGeneralCase } from "./scripts/harness-eval/general-runner.js";

for (const fixture of generalCases) {
  const report = await runGeneralCase(fixture, createDriver);
  console.log(JSON.stringify(report));
}
```

`createDriver({ capabilities })` 为每个试次创建一个驱动，返回 `run(input, { callTool })`。输入提供经过验证的 `actorId`、消息或确认、续接时的 `taskId`，以及确认时的 `proposal: { id, version }`。驱动输出 `status`、`taskId`、`runId`，并在适用时附带 `code`、`facts`、`question` 和 `choices`，或 `proposal: { id, version, actions }`。每个动作包含 `capability` 和 `args`。运行时用 `callTool(name, args, operationId)` 调用写工具，并在写入结果中返回同一个 `operationId`。这个操作 ID 由驱动负责关联到已确认的动作。

报告记录每步输入、运行结果、实际工具调用、提交次数和最终记录。grader 从工具环境读取证据，接受不同的有效调用顺序。期望值和实际状态只由评测器读取。

### M2 只读试跑

`read-pilot.test.js` 让第 1、3 题和第 2 题的首轮澄清经过真实的 Harness 循环与模型决策适配器，再交给通用 grader。测试注入模型响应，调用的是按账号隔离的记录和集合模拟工具。第 2 题的续接和确认属于 M3。

```bash
node --test scripts/harness-eval/read-pilot.test.js
```

真实 DeepSeek 评测从仓库根目录运行。使用与排程对照独立的 Token 统计，每个场景默认跑三次。

```bash
node backend/scripts/harness-eval/read-pilot-live.js --out /tmp/harness-m2-live.json
```

### M3 可续接任务

`workflow-pilot.test.js` 让原 10 道题里的 8 道经过真正的任务运行时，再用独立 grader 校对。两道批量移动题保留给 M4。额外验证用户改口时旧确认被拦截、写入后进程丢失时从回执恢复，以及拒绝其他操作的回执。`run.test.js` 用实际 Express 和临时 SQLite 检查三次运行的完整链路，并验证确认前修改标题时旧提案失效，包括更新时间相同的情况。

`POST /api/companion/harness` 使用当前账号的登录凭证，是新 Harness 的按需入口。正文使用以下三种结构，每次返回新的 `runId`。补答、修改提案和确认沿用 `taskId`。确认阶段复核已保存的动作并直接执行和核实。

| 调用 | JSON 字段 | 成功结果 |
| --- | --- | --- |
| 初次请求 | `type: "message"`、`text` | 有证据的回答、待澄清问题或提案 |
| 补答或修改 | `type: "reply"`、`taskId`、`text` | 新的运行结果。出提案时返回新版本 |
| 确认 | `type: "confirm"`、`taskId`、`proposal: { id, version }` | 经核实的回执或 `unverified`。过期或数据已变更时返回 HTTP 409 |

入口先支持查找和完成或重新打开本人普通顶层约定。状态和完成时间与回执在同一个 SQLite 事务内提交，回执为现有 `TaskChangeLog` 记录。运行间的状态保存在新的 `HarnessTask` 表，本地旧数据库用项目现有的 Prisma schema 流程更新。模型只有提案权限。已有聊天和排程的客户端按原路由使用。前端以后可以按这个协议接入对话卡和确认按钮。

## 原有排程的真实模型对照

从仓库根目录执行以下命令。环境中需要已授权的 `DEEPSEEK_API_KEY`。可设置 `DEEPSEEK_MODEL`，同轮对照应使用相同模型标识。

```bash
node backend/scripts/harness-eval/live.js --checkout . --out /tmp/harness-after.json
node backend/scripts/harness-eval/live.js --checkout /path/to/baseline --out /tmp/harness-before.json
```

每臂各跑十道合成中文题，每题默认两次，每轮聊天最多三次模型调用。两题需要第二轮对话，每臂最多 72 次调用。排查时可加 `--repeats 1`，每臂最多 36 次。所有账户使用同样的初始任务和预设证据。报告记录逐轮结果、调用、Token、耗时与两次都通过的题数。

| 用例 | 主要验收条件 |
| --- | --- |
| 阅读避障 | 每周三次、正好 25 分钟，避开已有约定和工作日晚间 |
| 词汇记忆 | 采用本人 25 分钟上限，每次使用纸质词卡 |
| 哑铃训练 | 仅使用可用器械，每次 35 分钟，列出组数和次数 |
| 缺参与补答 | 第一轮追问时长，规划器调用为零。第二轮按补充条件出稿 |
| 本轮上限与记忆干扰 | 采用本轮 18 分钟上限。其他主题、过期和第三方记录不能覆盖。外账号识别词不得出现在模型输入或答复 |
| 两条有效记忆冲突 | 追问当前上限，提案和规划器调用为零 |
| 两周排程 | 逐周检查次数，检查两周的日历冲突 |
| 局部改期 | 周六从 10 点改到 11 点，其他安排一致，改期阶段规划器调用为零 |
| 确认前新增冲突 | 确认返回冲突，任务表只新增作为扰动的约定 |
| 跨账号与并发确认 | 另一账号无法确认。本人并发确认两次，数据库只保存一套父子任务 |

普通提案经独立检查后才进入确认，再核对 SQLite 里的父子任务、标题及实际时间。追问题按是否进入澄清评分，新增冲突题按确认拒绝和数据库状态评分。
