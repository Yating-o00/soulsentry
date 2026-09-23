import { invokeKimiText } from "../lib/kimi.js";

// 提醒文案统一走这里：先尝试用 AI 理解约定内容生成温柔的自然语言提醒，
// 失败则退回暖色兜底文案。文案原则：帮助想起、给一点动力，不催促、不制造焦虑。

const KIND_LABEL = { reminder: "开始提醒", follow_up: "到时跟进", forget: "遗忘唤醒" };

const CATEGORY_LABEL = {
  work: "工作", personal: "个人", health: "健康", study: "学习",
  family: "家庭", shopping: "购物", finance: "财务", other: "其他"
};

// 压力词黑名单：AI 文案里出现这些词说明 tone 跑偏，直接弃用走兜底
const PRESSURE_WORDS = /逾期|超时|必须|赶紧|再不|你还没有|还没完成|已经晚|拖延|来不及了|惩罚|后果/;

// 进程内缓存：同一约定同一类提醒在同一内容版本 + 同一上下文只生成一次，
// 避免每分钟的 cron 重复调用 AI；不落地数据库，避开 reminderSender 的 metadata 写竞争
const copyCache = new Map();
const CACHE_LIMIT = 1000;

function cacheKeyFor(task, kind, context) {
  const updated = task?.updatedAt ? new Date(task.updatedAt).getTime() : 0;
  return `${task?.id}:${kind}:${updated}:${JSON.stringify(context)}`;
}

function trimTitle(s) {
  const t = String(s || "").trim();
  return t.length > 18 ? t.slice(0, 18) : t;
}

function trimBody(s) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  return t.length > 70 ? t.slice(0, 70) : t;
}

// 暖色兜底：同样基于约定内容、不催促，保证 AI 不可用时体验也不掉线
function weatherSentence(weather) {
  if (!weather) return "";
  if (weather.advice) return `${weather.advice}。`;
  if (weather.is_raining) return "外面在下雨，出门记得带伞，慢慢来。";
  if (weather.is_snowing) return "外面在下雪，路有点滑，不着急。";
  return "";
}

function warmFallback(task, kind, context) {
  const title = String(task?.title || "这件事").trim();
  const short = title.length > 12 ? `${title.slice(0, 12)}…` : title;
  const weather = weatherSentence(context?.weather);
  if (kind === "follow_up") {
    return {
      title: `「${short}」的预计时间到了`,
      body: `它进行得怎么样啦？如果这会儿不太方便，把它移到更合适的时候也完全没关系。${weather}`
    };
  }
  if (kind === "forget") {
    const days = context?.days || 7;
    return {
      title: `还记得「${short}」吗`,
      body: `它已经静静陪了你 ${days} 天。如果它对你还重要，我们把它拆成小小的一步重新开始；要是已经不合适了，轻轻放下也没关系。`
    };
  }
  const desc = task?.description ? String(task.description).trim().slice(0, 36) : "";
  return {
    title: `「${short}」的时间到了`,
    body: `${desc ? `你之前记下的${title}：${desc}。` : `${title}。`}不急，喝口水，按你自己的节奏来，我在这里陪你。${weather}`
  };
}

export async function buildReminderCopy({ task, kind, context = {} }) {
  const key = cacheKeyFor(task, kind, context);
  const cached = copyCache.get(key);
  if (cached) return { ...cached, source: "cache" };

  let generated = null;
  try {
    const contextLines = [
      context.days ? `这条约定已经被搁置约 ${context.days} 天。` : "",
      context.location ? `相关地点：${context.location}` : "",
      context.timeText ? `提醒触发时间：${context.timeText}` : "",
      context.weather
        ? `当前天气：${context.weather.text}${context.weather.advice ? `；与这条约定相关的天气建议：${context.weather.advice}` : ""}`
        : ""
    ].filter(Boolean).join("\n");

    generated = await Promise.race([
      invokeKimiText({
        prompt: `你是 SoulSentry，一位温柔、克制、值得信赖的提醒助手。请为下面这条用户自己定下的约定，写一条「${KIND_LABEL[kind] || "提醒"}」文案。

约定标题：${task?.title || "无"}
约定描述：${task?.description || "无"}
分类：${CATEGORY_LABEL[task?.category] || "其他"}
${contextLines}

写之前，请先真正读懂这条约定的内容——它关乎谁、要做什么、对用户意味着什么。文案要求：
1. 文案里要自然体现你理解了这条约定（可以轻轻带出其中的人物、事项或场景），帮助用户一下就想起来它。
2. 口吻像一个了解TA、关心TA的朋友：温柔、从容、有温度；可以点一下这件事对TA的意义，或把下一步说得小而轻，给一点开始的动力。
3. 绝对不要催促、不要制造焦虑：不要用"必须、赶紧、马上、已经逾期、超时、再不……就……、你还没有"这类压迫性表达，不罗列后果。
4. 允许用户按自己的节奏来，可以轻轻带一句"不方便的话可以换个时间"，让TA感到被支持，而不是被监督。
5. 如果提供了天气且与这条约定相关（例如户外事项遇雨、高温），用一句话把温柔的提示或替代建议自然织进文案；与天气无关就不要硬提。
6. title 不超过 16 字，像一句轻轻的话，不要写成"约定提醒："这种标签；body 不超过 60 字，一到两句自然口语。
7. 直接返回 JSON 对象，不要输出 markdown 或解释。`,
        systemPrompt: "你是 SoulSentry 的温柔提醒写手。你写的提醒让人被轻轻唤起，而不是被推动。严格返回 JSON。",
        responseJsonSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "提醒标题，≤16字，温柔自然" },
            body: { type: "string", description: "提醒正文，≤60字，温柔自然、不催促" }
          },
          required: ["title", "body"]
        },
        temperature: 0.7
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 10000))
    ]);
  } catch (err) {
    console.error(`[reminderCopy] Kimi copy failed (kind=${kind}, task=${task?.id}):`, err?.message || err);
  }

  let copy = null;
  if (generated?.title && generated?.body) {
    const candidate = { title: trimTitle(generated.title), body: trimBody(generated.body) };
    if (candidate.title && candidate.body && !PRESSURE_WORDS.test(candidate.title + candidate.body)) {
      copy = { ...candidate, source: "ai" };
    } else {
      console.warn(`[reminderCopy] AI 文案未过 tone 校验，走兜底 (task=${task?.id}, kind=${kind})`);
    }
  }
  if (!copy) copy = { ...warmFallback(task, kind, context), source: "fallback" };

  if (copyCache.size >= CACHE_LIMIT) copyCache.clear();
  copyCache.set(key, { title: copy.title, body: copy.body });

  return copy;
}
