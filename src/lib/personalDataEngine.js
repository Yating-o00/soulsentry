// 个人数据库引擎 —— 统一采集入口
import { base44 } from "@/api/base44Client";

const recentCache = new Map();
const THROTTLE_MS = 5 * 60 * 1000;

function shouldThrottle(key) {
  const last = recentCache.get(key);
  const now = Date.now();
  if (last && now - last < THROTTLE_MS) return true;
  recentCache.set(key, now);
  if (recentCache.size > 200) {
    const cutoff = now - THROTTLE_MS;
    for (const [k, v] of recentCache.entries()) {
      if (v < cutoff) recentCache.delete(k);
    }
  }
  return false;
}

async function track(data_type, payload) {
  try {
    const subtype = payload.subtype || "";
    const summary = payload.summary || "";
    const key = data_type + ":" + subtype + ":" + summary;
    if (shouldThrottle(key)) return null;

    const now = new Date();
    const record = {
      data_type: data_type,
      subtype: subtype,
      summary: summary,
      category: payload.category,
      weight: payload.weight != null ? payload.weight : 1,
      tags: payload.tags || [],
      occurred_at: payload.occurred_at || now.toISOString(),
      hour_of_day: payload.hour_of_day != null ? payload.hour_of_day : now.getHours(),
      day_of_week: payload.day_of_week != null ? payload.day_of_week : now.getDay(),
      related_task_id: payload.related_task_id,
      related_note_id: payload.related_note_id,
      metadata: payload.metadata || {},
    };
    return await base44.entities.UserDataPoint.create(record);
  } catch (e) {
    console.warn("[personalDataEngine] track failed:", e && e.message);
    return null;
  }
}

export function trackHabit(payload) { return track("habit", payload); }
export function trackOutcome(payload) { return track("outcome", payload); }
export function trackDecision(payload) { return track("decision", payload); }

export async function getPersonalSuggestion(args) {
  const scene = (args && args.scene) || "";
  const context = (args && args.context) || "";
  try {
    const res = await base44.functions.invoke("kimiPersonalInsight", {
      mode: "realtime",
      scene: scene,
      context: context,
    });
    return (res && res.data) || null;
  } catch (e) {
    console.warn("[personalDataEngine] getPersonalSuggestion failed:", e && e.message);
    return null;
  }
}

export async function getProfileInsight() {
  try {
    const res = await base44.functions.invoke("kimiPersonalInsight", { mode: "profile" });
    return (res && res.data) || null;
  } catch (e) {
    console.warn("[personalDataEngine] getProfileInsight failed:", e && e.message);
    return null;
  }
}

export default {
  trackHabit: trackHabit,
  trackOutcome: trackOutcome,
  trackDecision: trackDecision,
  getPersonalSuggestion: getPersonalSuggestion,
  getProfileInsight: getProfileInsight,
};