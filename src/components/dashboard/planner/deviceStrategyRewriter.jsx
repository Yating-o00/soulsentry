// 用 Kimi 为每台设备的 Top 策略改写一句更贴合该设备形态的文案
// 设计原则:
//  - 只对每台设备最重要的前 N 条做改写(避免 token 浪费)
//  - 改写规则随设备形态变化(手机短促/手表极简/平板沉浸/音箱口播)
//  - sessionStorage 按 (deviceType+date+原文 hash) 缓存,同日不重复调用
//  - 任何失败都静默回退到原文,不影响 UI

import { base44 } from "@/api/base44Client";

const MAX_PER_DEVICE = 4;
const CACHE_KEY = "soul_device_strategy_rewrite_v1";

// 简单 hash,够区分内容即可
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

function loadCache() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return { date: today, items: {} };
    const parsed = JSON.parse(raw);
    if (parsed.date !== today) return { date: today, items: {} };
    return parsed;
  } catch {
    return { date: new Date().toISOString().slice(0, 10), items: {} };
  }
}

function saveCache(cache) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// 不同设备形态的改写指令
const DEVICE_RULES = {
  phone: "口语化、12-22 字,带动作动词,适合震动后扫一眼",
  pc: "信息密度更高,可 25-40 字,可含具体路径/工具名,适合桌面通知卡片",
  tablet: "沉浸阅读语气,18-30 字,温和不急促,适合早晚安静时段",
  watch: "极简 8-14 字,只保留关键名词+动作,可省主语",
  speaker: "口播文案,适合朗读,18-26 字,加入称呼或情境过渡",
  glasses: "AR 浮窗用语,10-16 字,名词为主,可标注相对方位/对象",
  car: "驾驶安全优先,12-20 字,语音可读,避免要求复杂操作",
  home: "家居场景口播,16-24 字,氛围词+提示,如'天色暗了/晚饭后'",
};

export async function rewriteStrategiesForDevice(deviceType, strategies) {
  if (!strategies || strategies.length === 0) return strategies;
  const rule = DEVICE_RULES[deviceType];
  if (!rule) return strategies;

  // 只改前 N 条,其余保持原样
  const head = strategies.slice(0, MAX_PER_DEVICE);
  const tail = strategies.slice(MAX_PER_DEVICE);

  const cache = loadCache();
  const cacheKeyPrefix = `${deviceType}:`;

  // 拆出需要新调用的条目和已缓存条目
  const needCall = [];
  const cachedMap = new Map();
  head.forEach((s, idx) => {
    const k = cacheKeyPrefix + hash(`${s.time}|${s.content}`);
    if (cache.items[k]) {
      cachedMap.set(idx, cache.items[k]);
    } else {
      needCall.push({ idx, key: k, item: s });
    }
  });

  // 全部命中缓存 → 直接返回
  if (needCall.length === 0) {
    return head.map((s, idx) => ({ ...s, content: cachedMap.get(idx) || s.content })).concat(tail);
  }

  // 调用 Kimi 一次性改写,失败则原样返回
  try {
    const items = needCall.map((n, i) => ({
      id: i,
      time: n.item.time || "",
      content: n.item.content || "",
    }));
    const prompt = `你正在为"${deviceType}"设备改写提醒文案。规则:${rule}。
保持原意,只改文字风格让其更贴合该设备形态。每条独立改写,不要互相关联。
原始条目(JSON):
${JSON.stringify(items)}

请按以下 JSON 格式返回:{"rewrites":[{"id":0,"content":"..."},...]}`;

    const resp = await base44.functions.invoke("invokeKimi", {
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          rewrites: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "number" }, content: { type: "string" } },
              required: ["id", "content"],
            },
          },
        },
        required: ["rewrites"],
      },
      temperature: 0.4,
    });

    const data = resp?.data || resp;
    const rewrites = Array.isArray(data?.rewrites) ? data.rewrites : [];

    rewrites.forEach((r) => {
      const target = needCall[r.id];
      if (!target || !r.content) return;
      const newContent = String(r.content).trim();
      if (!newContent) return;
      cache.items[target.key] = newContent;
      cachedMap.set(target.idx, newContent);
    });
    saveCache(cache);
  } catch (e) {
    // 失败静默,原文返回
    console.warn("[deviceStrategyRewriter] kimi rewrite failed, fallback to original:", e?.message);
  }

  return head.map((s, idx) => ({ ...s, content: cachedMap.get(idx) || s.content })).concat(tail);
}