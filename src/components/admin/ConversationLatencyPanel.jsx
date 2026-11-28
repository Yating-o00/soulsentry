import React, { useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { httpRequest } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const entries = { companion: "主助理消息", task_harness: "通用 Harness" };
const paths = {
  chat: "普通聊天", schedule: "排程 Harness", memory_write: "显式记忆", buddy: "搭子",
  action_proposal: "修改动作提案", browser_agent: "浏览器小助手",
  message: "通用任务 · 初次请求", reply: "通用任务 · 补答", confirm: "通用任务 · 确认",
};
const outcomes = {
  reply: "正常回复", clarification: "等待澄清", proposal: "待确认提案", confirmed: "已确认",
  fallback: "回退", timeout: "超时", blocked: "已拦截", unverified: "结果待核实", error: "错误", interrupted: "连接中断",
};
const phases = {
  ingress: "请求接入", context: "上下文", memory: "记忆检索", action_extraction: "动作提取",
  dialogue_model: "对话模型", planner_model: "规划模型", harness_decision: "Harness 决策",
  model_attempt: "供应商请求", capability: "能力执行", validation: "校验", replay_wait: "等待确认结果", persistence: "写入记录",
};
const details = {
  buddy_routing: "搭子路由", message_history: "会话历史", previous_proposal: "上一版提案", credit_check: "模型额度检查",
  relevant_memories: "检索相关记忆", memory_context: "加载记忆上下文", remembered_commitments: "读取约定记忆", transcript_search: "搜索历史会话",
  persona: "人格偏好", dialogue_context: "对话上下文", image_attachment: "图片附件", file_attachment: "文件附件",
  busy_windows: "忙碌时段", existing_tasks: "已有约定", plan_insights: "规划参考", planning_constraints: "解析规划约束",
  draft: "出稿", repair: "修复", planner_output: "检查模型草案", planned_schedule: "检查排程约束", proposed_schedule: "检查提案",
  schedule_snapshot: "复核可用时间", decision_schema: "检查决策格式", evidence: "核对证据", receipt: "核对回执",
  buddy: "处理搭子消息", browser_agent_start: "启动浏览器小助手", read: "读取", prepare: "准备提案", apply: "执行已确认操作",
  user_message: "用户消息", assistant_message: "助手回复", explicit_memory: "保存记忆和回执", model_usage: "记录模型用量",
  task_create: "创建任务状态", task_load: "读取任务状态", task_update: "更新任务状态",
  deepseek: "DeepSeek", kimi_primary: "Kimi 主端点", kimi_fallback: "Kimi 备用端点",
  memory_embedding: "记忆向量模型",
};
const spanStatus = { ok: "完成", error: "失败", timeout: "超时", interrupted: "响应结束时尚未完成" };
const endpoint = "/api/admin/stats/conversation-latency";
const control = "min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800";
const timeFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function formatMs(ms) {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function request(path, filters) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();
  return httpRequest(`${endpoint}${path}${params ? `?${params}` : ""}`);
}

function SelectFilter({ label, value, options, onChange, withAll = true }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {label}
      <select aria-label={label} className={control} value={value} onChange={(event) => onChange(event.target.value)}>
        {withAll && <option value="">全部</option>}
        {Object.entries(options).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
    </label>
  );
}

function Metrics({ data, showRate }) {
  const attempts = data.total.count + data.interrupted.count;
  const rate = showRate && attempts ? `${(data.interrupted.count / attempts * 100).toFixed(1)}%` : null;
  const cards = [
    ["已响应样本", data.total.count], ["响应 P50", formatMs(data.total.p50)], ["响应 P95", formatMs(data.total.p95)],
    ["模型请求次数", data.modelCalls, "含重试和中断"],
    ["连接中断", rate ?? data.interrupted.count, `${data.interrupted.count} 轮 · 断开前 P95 ${formatMs(data.interrupted.p95)}`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cards.map(([label, value, note]) => (
        <div key={label} className="rounded-md bg-slate-50 px-3 py-2.5">
          <dt className="text-xs text-slate-600">{label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-[#384877]">{value}</dd>
          {note && <dd className="text-xs text-slate-500">{note}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Trend({ daily }) {
  return (
    <section aria-label="每日响应耗时趋势">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">每日响应耗时</h3>
      <ResponsiveContainer width="100%" height={235}>
        <LineChart data={daily} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="date" tickFormatter={(date) => date.slice(5)} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={formatMs} width={63} tick={{ fontSize: 11 }} />
          <Tooltip formatter={formatMs} labelFormatter={(date) => `${date} · ${daily.find((day) => day.date === date)?.count ?? 0} 轮`} />
          <Legend />
          <Line name="P50" dataKey="p50" stroke="#0f766e" strokeWidth={2} isAnimationActive={false} />
          <Line name="P95" dataKey="p95" stroke="#384877" strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

function LatencyTable({ title, label, rows, grouped = false }) {
  if (!rows.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full whitespace-nowrap text-left text-sm tabular-nums">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>{[label, "样本数", "P50", "P95", grouped ? "中断数" : "模型请求"].map((name) => <th key={name} className="px-3 py-2" scope="col">{name}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.name}>
                <th scope="row" className="px-3 py-1.5 font-medium text-slate-700">{row.name}</th>
                <td className="px-3 py-1.5">{row.count}</td><td className="px-3 py-1.5">{formatMs(row.p50)}</td>
                <td className="px-3 py-1.5">{formatMs(row.p95)}</td>
                <td className="px-3 py-1.5">{grouped ? row.interrupted : row.modelCalls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TraceTimeline({ trace }) {
  const end = Math.max(1, trace.totalMs);
  return (
    <section className="space-y-2 rounded-md border border-slate-200 p-3" aria-label="单轮耗时时间轴">
      <h3 className="text-sm font-semibold text-slate-800">{paths[trace.path]} · {outcomes[trace.outcome]} · {formatMs(trace.totalMs)}</h3>
      <p className="text-xs text-slate-600">{timeFormat.format(new Date(trace.startedAt))} 北京时间 · {trace.httpStatus ? `HTTP ${trace.httpStatus} · ` : ""}{trace.modelCalls} 次模型请求</p>
      <p className="break-all text-xs text-slate-600">请求 ID <code className="select-all">{trace.id}</code></p>
      <div className="overflow-x-auto">
        <div className="grid min-w-[620px] grid-cols-[minmax(190px,1fr)_minmax(190px,3fr)_145px] items-center gap-x-3 gap-y-1 text-xs text-slate-700">
          <span className="font-medium">执行阶段</span>
          <div className="flex justify-between tabular-nums" aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <span key={fraction}>{formatMs(Math.round(trace.totalMs * fraction))}</span>)}
          </div>
          <span className="text-right font-medium">开始偏移 / 持续时间</span>
          {trace.spans.map((span, index) => (
            <React.Fragment key={index}>
              <span>{phases[span.phase] ?? span.phase}{span.detail ? ` · ${details[span.detail] ?? span.detail}` : ""}</span>
              <div className="relative h-3 rounded-sm bg-slate-100" aria-hidden="true">
                <div
                  className={`absolute inset-y-0 rounded-sm ${span.status === "ok" ? "bg-[#5266a0]" : "bg-amber-600"}`}
                  style={{ left: `calc(${span.startMs / end * 100}% - ${span.startMs / end * 2}px)`, width: `${span.durationMs / end * 100}%`, minWidth: 2 }}
                />
              </div>
              <span className="text-right tabular-nums" title={spanStatus[span.status]}>
                +{formatMs(span.startMs)} / {formatMs(span.durationMs)}
                {span.status !== "ok" && <span className="sr-only"> {spanStatus[span.status]}</span>}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
      {trace.outcome === "interrupted" && <p className="text-xs text-slate-600">时间轴截至连接断开。</p>}
    </section>
  );
}

export default function ConversationLatencyPanel() {
  const [filters, setFilters] = useState({ days: "7", from: "", to: "", entry: "", path: "", outcome: "" });
  const [sort, setSort] = useState("slowest");
  const [selectedId, setSelectedId] = useState(null);
  const invalidRange = filters.from && filters.to && filters.from > filters.to;
  const summary = useQuery({
    queryKey: ["conversation-latency", filters], queryFn: () => request("", filters), enabled: !invalidRange,
    placeholderData: keepPreviousData,
  });
  const list = useInfiniteQuery({
    queryKey: ["conversation-latency-list", filters, sort], queryFn: ({ pageParam }) => request("/traces", { ...filters, sort, cursor: pageParam }),
    initialPageParam: null, getNextPageParam: (page) => page.next ?? undefined, enabled: !invalidRange,
  });
  const selected = useQuery({ queryKey: ["conversation-latency-detail", selectedId], queryFn: () => request(`/traces/${selectedId}`, {}), enabled: Boolean(selectedId) });
  const dates = summary.data?.range;
  const data = !invalidRange && !summary.isPlaceholderData ? summary.data : null;
  const traces = list.data?.pages.flatMap((page) => page.traces) ?? [];
  const patch = (change) => {
    setFilters((current) => ({ ...current, ...change }));
    setSelectedId(null);
  };
  const changeDate = (field, value) => {
    if (!value) return patch({ from: "", to: "" });
    patch({ from: filters.from || dates?.from || "", to: filters.to || dates?.to || "", [field]: value });
  };
  const pathOptions = Object.fromEntries(Object.entries(paths).filter(([key]) => {
    const isHarness = ["message", "reply", "confirm"].includes(key);
    return !filters.entry || isHarness === (filters.entry === "task_harness");
  }));

  return (
    <Card className="border-[#c9d5ef] bg-white">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle role="heading" aria-level={2} className="text-base text-[#384877]">助理响应耗时</CardTitle>
        <Button variant="outline" size="sm" disabled={Boolean(invalidRange) || summary.isFetching || list.isFetching} onClick={() => {
          void summary.refetch();
          void list.refetch();
        }}>刷新耗时数据</Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-2">
          <SelectFilter label="最近窗口" value={filters.from || filters.to ? "custom" : filters.days} withAll={false} options={{ 7: "最近 7 天", 30: "最近 30 天", ...(filters.from || filters.to ? { custom: "自选日期" } : {}) }}
            onChange={(days) => days !== "custom" && patch({ days, from: "", to: "" })} />
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">起始日期
            <input type="date" className={control} value={filters.from || dates?.from || ""} min={dates?.minDate} max={dates?.today} onChange={(event) => changeDate("from", event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">结束日期
            <input type="date" className={control} value={filters.to || dates?.to || ""} min={dates?.minDate} max={dates?.today} onChange={(event) => changeDate("to", event.target.value)} />
          </label>
          <SelectFilter label="请求入口" value={filters.entry} options={entries} onChange={(entry) => patch({ entry, path: "" })} />
          <SelectFilter label="执行路径" value={filters.path} options={pathOptions} onChange={(path) => patch({ path })} />
          <SelectFilter label="结果" value={filters.outcome} options={outcomes} onChange={(outcome) => patch({ outcome })} />
        </div>
        {invalidRange && <p role="alert" className="text-sm text-red-700">结束日期应在起始日期当天或之后。</p>}
        {!invalidRange && (summary.isPending || summary.isPlaceholderData) && <p role="status" className="text-sm text-slate-600">正在加载耗时统计…</p>}
        {!invalidRange && summary.isError && <p role="alert" className="text-sm text-red-700">{summary.error?.message || "耗时统计加载失败"}</p>}
        {data && (
          <>
            <Metrics data={data} showRate={!filters.outcome} />
            {data.total.count > 0 && <Trend daily={data.daily} />}
            {!data.paths.length && <p className="text-sm text-slate-600">当前筛选范围内暂无请求轨迹。</p>}
            <div className="grid gap-4 lg:grid-cols-2">
              <LatencyTable title="各阶段耗时" label="阶段" rows={Object.keys(phases).flatMap((phase) => {
                const stage = data.stages.find((item) => item.phase === phase);
                return stage ? [{ name: phases[phase], ...stage }] : [];
              })} />
              <LatencyTable title="各执行路径耗时" label="执行路径" grouped rows={data.paths.map((row) => ({ ...row, name: paths[row.path] }))} />
            </div>
          </>
        )}
        {!invalidRange && <section className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">单轮轨迹</h3>
            <SelectFilter label="排序" value={sort} withAll={false} options={{ slowest: "耗时最长", recent: "最近请求" }} onChange={setSort} />
          </div>
          {list.isPending && <p role="status" className="text-sm text-slate-600">正在加载轨迹…</p>}
          {list.isError && <p role="alert" className="text-sm text-red-700">{list.error?.message || "轨迹列表加载失败"}</p>}
          {traces.length > 0 && <ul className="max-h-72 divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200">
            {traces.map((trace) => (
              <li key={trace.id}>
                <button type="button" aria-pressed={selectedId === trace.id} onClick={() => setSelectedId(trace.id)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 aria-pressed:bg-indigo-50 sm:text-sm">
                  <span className="tabular-nums">{timeFormat.format(new Date(trace.startedAt))}</span>
                  <span>{paths[trace.path]} · {outcomes[trace.outcome]}</span><strong className="tabular-nums">{formatMs(trace.totalMs)}</strong>
                </button>
              </li>
            ))}
          </ul>}
          {list.hasNextPage && <Button variant="outline" size="sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>加载更多</Button>}
          {selectedId && selected.isPending && <p role="status" className="text-sm text-slate-600">正在加载时间轴…</p>}
          {selectedId && selected.isError && <p role="alert" className="text-sm text-red-700">{selected.error?.message || "时间轴加载失败"}</p>}
          {selected.data && <TraceTimeline trace={selected.data} />}
        </section>}
      </CardContent>
    </Card>
  );
}
