# 心栈 LLM 排查、留存与验收

本文提供代码对应的操作流程，不表示已在生产执行。发布后，按下面的记录模板保存真实证据；历史运行状态无法确认时写“未知”。原始日志、状态报告、测试账号资料和服务器配置留在服务器或受控存储，勿提交到公开仓库。

## 0. 上线前只读确认当前状态

在现有服务器 checkout 中运行（不重新构建、不重启、不部署）：

```bash
cd /opt/soulsentry/china-app
umask 077
sudo node scripts/observability/current-state.mjs > /tmp/soulsentry-current-state.json
```

`current-state.mjs` 只读取 current 链接、systemd 主进程/启动时间、进程工作目录、runtime/release/frontend 的发布身份、本地与公网 `/api/version`、公网前端 `/release-identity.json`、健康、内存/磁盘、最近一小时追踪标记数量及 journal 持久目录。它不执行 `.env` 内的 shell 内容，只输出 Kimi/DeepSeek Key 存在性和实验开关布尔值（Kimi 同时支持 MOONSHOT_API_KEY 别名）。启动进程环境 `startupEnvironmentPresence`、运行目录 `.env` 的 `runtimeEnvironmentFile`、共享配置分别记录；`/proc` 环境可能没有 Node dotenv 后续添加的值，不能把其中缺 Key 当作实际内存配置缺 Key。`null` 表示未知（包括权限不足、超时、旧版本无身份文件），不能据此补记部署成功。

| 证据项 | 记录 |
| --- | --- |
| 观察 UTC 时间 | 待执行 |
| current 实际 release / 主进程目录是否一致 | 待执行 |
| 运行 deploymentId / 完整 commit SHA | 待执行；旧版可能未知 |
| 网页 artifact 与 backend identity 是否一致 | 待执行 |
| `[chatAi]` / `[aiAttempt]` 最近一小时数量 | 待执行；无流量时零不证明功能故障 |
| runtime 实验开关 / 两个 Key 存在性 | 待执行，仅布尔值 |
| systemd active / 磁盘 / 内存 / HTTP health | 待执行 |
| 日志时间缺口及未知项 | 待执行 |

## 1. 日志契约

新日志使用 `schemaVersion: 2`，UTC `timestamp`，关联 `deploymentId → requestId → attemptId`。

- `[chatAi] event=request_started` 标识业务请求开始。HTTP 与后台分别使用 `kind=http/background`。
- `[aiAttempt] event=started/completed` 标识单次尝试。`reason` 是错误分类；`status` 是 HTTP 状态；`elapsedMs` 是耗时。`errorCode` 与 `upstreamRequestId` 仅保留安全元数据。
- `[chatAi] event=request_completed` 标识最终业务结果。`businessSuccess` 显式为 true/false/null；`source` 区分 ai/fallback/cached/local/system/error；一次模型成功不等于业务成功。
- 心签分析成功但回应使用模板时，`analysisSource=ai`、`source=fallback`，分析业务仍可成功；分析尚在处理的回执为 `system`、业务结果未知，不能算缓存成功。
- 业务已结束的调用仍保留同一个 request ID。其后完成的尝试带 `late=true`，不会改写已经返回给用户的结果。

只读查询器再次按字段白名单清洗输入，不输出 Key、提示词、回复正文、错误正文或原始 journal 行。解析失败只计数，不回显出错行。

## 2. 持久化 journal

仓库中的 `config/journald/soulsentry-observability.conf` 设置持久化、压缩、512 MiB 上限、保留 1 GiB 空间和 30 天最大保留时间。该配置影响整台主机的 systemd journal，应先检查磁盘容量及已有 journald 配置。磁盘限制、日志轮转或 rate limiting 都可能使实际历史少于 30 天，不能把最大保留时间当成完整性保证。

在维护窗口由管理员安装一次（以下命令尚未自动执行）：

```bash
sudo mkdir -p /etc/systemd/journald.conf.d /var/log/journal
sudo install -m 0644 config/journald/soulsentry-observability.conf \
  /etc/systemd/journald.conf.d/soulsentry-observability.conf
sudo systemd-tmpfiles --create --prefix /var/log/journal
sudo systemctl restart systemd-journald
sudo journalctl --flush
sudo journalctl --disk-usage
sudo systemd-analyze cat-config systemd/journald.conf
sudo systemctl show soulsentry-backend -p StandardOutput -p StandardError
sudo journalctl --list-boots
```

确认服务 stdout/stderr 都进入 journal；若现有 unit 写到文件，先评审该 unit 后添加 `StandardOutput=journal` 和 `StandardError=journal`，不要直接覆盖现有 unit。安装后选一个真实 request ID 查询，正常重启应用服务后再次查询同一个 ID，验证保留。机器重启后的验证在维护窗口执行，不为测试随意重启生产。

## 3. 按请求定位完整链路

可以从文本 journal、`journalctl -o json`、JSONL 或 stdin 读取。查询脚本仅通过 `journalctl` 读取日志，无服务器写操作。输出保留在受控位置。

```bash
sudo node scripts/observability/ai-logs.mjs --journal \
  --since 2026-11-25T00:00:00Z --until 2026-11-26T01:00:00Z \
  --request-id REQUEST_ID

node scripts/observability/ai-logs.mjs --file /tmp/private-ai-window.jsonl \
  --request-id REQUEST_ID

sudo journalctl -u soulsentry-backend --since '1 hour ago' --no-pager -o json \
  | node scripts/observability/ai-logs.mjs
```

只有 `--journal` 未指定 `--since` 时默认最近 24 小时。文件/stdin 默认统计全部输入。时间参数必须带显式时区；起点包含、终点不包含。`--request-id` 返回全部安全事件、最终结果、每个尝试的开始/结束及缺失标记。查询窗口应覆盖超时后的完成事件；窗口截断导致 pending 时，扩大读取窗口，不能将未完成尝试直接算成失败。

`--route`、`--provider`、`--error`、`--deployment-id` 选择整条请求链，因此查 Kimi 错误仍能看到后续 DeepSeek 的尝试，不会把恢复过程切掉。时间窗按请求开始时间筛选；原日志缺开始时使用完成或首次观察时间，但该请求不会进入完整样本成功率。

## 4. 六组生产入口验收

先完成部署留档机制的临时环境测试及评审，再使用有持久记录的发布流程上线。使用专用测试账号，生产只发正常请求；429、超时、解析错误等由本地 mock 验证。每次新建测试内容，特别是心签避免缓存。

| 入口 | 选择 | UTC 时间 | deploymentId | frontend deploymentId | requestId | 实际模型 / 尝试顺序 | 业务结果 / 耗时 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 今日小助手 | 系统默认 | 待验收 | | | | | |
| 今日小助手 | DeepSeek | 待验收 | | | | | |
| 搭子文本聊天 | 系统默认 | 待验收 | | | | | |
| 搭子文本聊天 | DeepSeek | 待验收 | | | | | |
| 心签文本分析（新内容） | 系统默认 | 待验收 | | | | | |
| 心签文本分析（新内容） | DeepSeek | 待验收 | | | | | |

浏览器只保存响应里的请求 ID、版本、trace 字段和业务结果，不保存认证头或会话令牌。每组用只读查询器关联服务器记录，检查 frontendVersion 与当前发布是否对应。默认路径允许 Kimi→DeepSeek 回退；DeepSeek 选择核对选择头和实际尝试顺序；再切回默认检查恢复。图片与联网按其专用服务验证，不强制文本 DeepSeek。HTTP 200 或“收到”不单独作为业务成功证明。主页供应商标签继续隐藏。

## 5. 24 小时运行报告

先记录明确起止时间，保留导出边界余量以覆盖晚完成事件，再按请求开始时间筛选 24 小时窗口。以下日期是命令格式示例，不代表已经收集了这些样本：

```bash
umask 077
sudo journalctl -u soulsentry-backend --no-pager -o json \
  --since '2026-11-25 23:55:00 UTC' --until '2026-11-27 01:00:00 UTC' \
  > /tmp/private-ai-window.jsonl
node scripts/observability/ai-logs.mjs --file /tmp/private-ai-window.jsonl \
  --since 2026-11-26T00:00:00Z --until 2026-11-27T00:00:00Z \
  > /tmp/private-ai-report.json
```

报告按 deploymentId 与入口分组，输出：

- 完整 HTTP 用户请求数与显式已知业务结果成功率；未知业务结果单独列出。
- Kimi 尝试成功率，分母是尝试次数，不是用户请求数。
- Kimi 出错后的 DeepSeek 接管业务成功率：分母为业务结束前存在已完成 Kimi 错误的完整 HTTP 请求，分子须由 DeepSeek 在该错误完成后才开始尝试、在业务结束前成功调用且最终业务成功、实际 provider 为 DeepSeek。并行独立子调用和请求结束后的错误不当成接管证据。`modelSucceeded` 单列模型接管数量。
- `source=fallback` 模板兜底比例、缓存/本地处理/系统回执分类、P50/P95 用户响应耗时和耗时样本数。
- 按尝试计算的错误分布，以及按受影响请求计算的 `requestErrorImpact`；后者优先按最终业务失败数排序，再按受影响数量排序。每类错误可与其他错误共现，不能把共现当成根因证明。

旧版日志、缺开始/结束、pending 尝试、重复最终事件、缺发布身份等放入 `coverage.incomplete`，不与完整追踪样本混算。完全缺时间的请求无法放入指定时间窗，单列在 `coverage.unplacedRequestsWithoutTime`；按具体 request ID 查询时仍返回这些未知链路。后台请求单列。`journalCompleteness=unknown` 明确表示导出不能证明没有日志缺失；还应记录服务重启窗口、轮转覆盖、限流抑制和采样边界。空样本率和分位数为 null，不生成 0% 的虚假结论。

### 首次归因报告模板

```text
状态：待收集，不能声称已观察 24 小时。
窗口（UTC）：
deploymentId / 完整 commit：
完整用户请求 / 不完整 / 旧版未知 / 后台请求样本数：
服务或 journal 缺失时间段 / 证据：
业务成功率（分子/分母）、未知业务结果数：
Kimi 尝试成功率（分子/分母）：
DeepSeek 接管业务成功率（分子/分母）：
模板兜底比例、缓存/本地/系统回执数：
P50/P95（样本数）：
按最终业务失败影响排序的错误分类：
1. 分类 / 受影响请求 / 最终失败 / 已恢复 / 示例 requestId：
2. …
结论与证据：余额不足、超时预算、DeepSeek 接管失败、解析失败或其他。
修复优先级与理由：
无法确定的归因 / 下一步补充证据：
```

本地测试：`node --test scripts/observability/*.test.mjs`。该测试使用合成事件与临时进程，不调用付费模型或生产服务。`fixtures/mixed-deployments.journal.jsonl` 是合成导出，覆盖服务重启造成未完成请求、两个部署重用同一请求 ID、旧版缺时间日志，不是运行日志。
