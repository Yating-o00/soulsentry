import { z } from "zod";
import { beijingDayRange } from "../lib/behavior.js";
import { retentionStart } from "./conversationLatency.js";

const DAY_MS = 86_400_000;
const beijingDate = (value) => new Date(Number(value) + 8 * 3_600_000).toISOString().slice(0, 10);

const filters = z.object({
  days: z.enum(["7", "30"]).default("7"),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  entry: z.enum(["companion", "task_harness"]).optional(),
  path: z.enum(["chat", "schedule", "memory_write", "buddy", "action_proposal", "browser_agent", "message", "reply", "confirm"]).optional(),
  outcome: z.enum(["reply", "clarification", "proposal", "confirmed", "fallback", "timeout", "blocked", "unverified", "error", "interrupted"]).optional(),
  cursor: z.string().uuid().optional(),
  sort: z.enum(["slowest", "recent"]).default("slowest"),
});

export function conversationLatencyScope(query, now = Date.now()) {
  const parsed = filters.safeParse(query);
  if (!parsed.success) return null;
  const { days, entry, path, outcome, cursor, sort } = parsed.data;
  const earliest = retentionStart(now);
  const minDate = beijingDate(earliest);
  const today = beijingDate(now);
  const defaultFrom = days === "30" ? minDate : beijingDate(now - 6 * DAY_MS);
  const from = parsed.data.from ?? defaultFrom;
  const to = parsed.data.to ?? today;
  if (from > to || to < minDate || from > today) return null;
  const first = from < minDate ? minDate : from;
  const last = to > today ? today : to;
  const [start] = beijingDayRange(first);
  const [, end] = beijingDayRange(last);
  return {
    where: { entry, path, outcome, startedAt: { gte: start > earliest ? start : earliest, lt: end } },
    range: { from: first, to: last, minDate, today },
    cursor, sort,
  };
}

function distribution(values) {
  const n = values.length;
  if (!n) return { count: 0, p50: null, p95: null };
  values.sort((a, b) => a - b);
  return { count: n, p50: values[Math.ceil(n * 0.5) - 1], p95: values[Math.ceil(n * 0.95) - 1] };
}

export function summarizeConversationLatency(rows, range) {
  const finished = [];
  const interrupted = [];
  const byDay = new Map();
  const byPhase = new Map();
  const byPath = new Map();
  const callsByPhase = new Map();
  let modelCalls = 0;
  let finishedModelCalls = 0;

  for (const row of rows) {
    const key = `${row.entry}/${row.path}`;
    if (!byPath.has(key)) byPath.set(key, { entry: row.entry, path: row.path, finished: [], interrupted: 0 });
    const group = byPath.get(key);
    modelCalls += row.modelCalls;
    if (row.outcome === "interrupted") {
      interrupted.push(row.totalMs);
      group.interrupted += 1;
      continue;
    }
    finished.push(row.totalMs);
    group.finished.push(row.totalMs);
    finishedModelCalls += row.modelCalls;
    for (const [phase, calls] of Object.entries(row.modelCallsByPhase)) {
      callsByPhase.set(phase, (callsByPhase.get(phase) ?? 0) + calls);
    }
    const date = beijingDate(row.startedAt);
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(row.totalMs);
    for (const [phase, duration] of Object.entries(row.phaseMs)) {
      if (!byPhase.has(phase)) byPhase.set(phase, []);
      byPhase.get(phase).push(duration);
    }
  }

  const daily = [];
  const [first] = beijingDayRange(range.from);
  const [, end] = beijingDayRange(range.to);
  for (let time = Number(first); time < Number(end); time += DAY_MS) {
    const date = beijingDate(time);
    daily.push({ date, ...distribution(byDay.get(date) ?? []) });
  }
  return {
    range, daily, modelCalls,
    total: distribution(finished),
    interrupted: distribution(interrupted),
    stages: [...byPhase].map(([phase, values]) => ({ phase, ...distribution(values),
      modelCalls: phase === "model_attempt" ? finishedModelCalls : callsByPhase.get(phase) ?? 0,
    })),
    paths: [...byPath.values()].map(({ entry, path, finished: values, interrupted: count }) => ({
      entry, path, ...distribution(values), interrupted: count,
    })),
  };
}
