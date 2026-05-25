/**
 * 个人数据库引擎 - 统一采集层
 * 在关键节点调用 track() 即可沉淀数据，供 Kimi 实时分析
 */
import { base44 } from "@/api/base44Client";

const QUEUE_KEY = "__pde_queue__";
let flushing = false;

function enqueue(record) {
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    list.push(record);
    // 队列保留最近 500 条，防止异常堆积
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-500)));
  } catch (_) {}
}

async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    if (!list.length) return;
    // 一次最多 20 条，避免大请求
    const batch = list.slice(0, 20);
    await base44.entities.UserDataPoint.bulkCreate(batch);
    const rest = list.slice(batch.length);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(rest));
  } catch (e) {
    // 失败保留队列，下次再试
    console.warn("[PDE] flush failed", e?.message);
  } finally {
    flushing = false;
  }
}

/**
 * 采集一个数据点
 * @param {('habit'|'task_outcome'|'ai_decision')} data_type
 * @param {string} event_key
 * @param {{summary?:string, context?:object, weight?:number}} payload
 */
export function track(data_type, event_key, payload = {}) {
  if (!data_type || !event_key) return;
  const record = {
    data_type,
    event_key,
    summary: payload.summary || "",
    context: payload.context || {},
    weight: typeof payload.weight === "number" ? payload.weight : 1,
    occurred_at: new Date().toISOString(),
  };
  enqueue(record);
  // 节流 flush
  if (!flushing) setTimeout(flush, 1500);
}

/** 立即推送队列（如登出前调用） */
export const flushNow = flush;

/** 拉取最近 N 条画像数据（按权重 + 时间） */
export async function fetchRecentDataPoints(limit = 80) {
  try {
    return await base44.entities.UserDataPoint.list("-occurred_at", limit);
  } catch {
    return [];
  }
}