import { invokeAI } from "@/components/utils/aiHelper";

/**
 * 通知个性化文案引擎：
 * 1. 固定类别风格模板（不消耗 AI 点数，作为即时兜底）
 * 2. AI 根据任务具体内容实时生成个性化文案（带超时，超时/失败回退模板）
 */

// 各类别的风格模板
export const CATEGORY_STYLES = {
  work: {
    emoji: "💼",
    tone: "正式、简洁、专业，像一位干练的助理",
    title: (t) => `💼 工作提醒 · ${t.title}`,
    body: (t) => t.description || "到执行时间了，建议现在集中处理这项工作。",
  },
  health: {
    emoji: "🌱",
    tone: "温暖、鼓励、关怀，像一位关心你的朋友",
    title: (t) => `🌱 照顾好自己 · ${t.title}`,
    body: (t) => t.description || "身体是最重要的，现在花点时间照顾一下自己吧。",
  },
  family: {
    emoji: "🏠",
    tone: "亲切、温馨、有人情味",
    title: (t) => `🏠 家人时光 · ${t.title}`,
    body: (t) => t.description || "别忘了这个和家人有关的约定，他们在等你。",
  },
  study: {
    emoji: "📚",
    tone: "激励、正能量、像一位良师",
    title: (t) => `📚 学习时间 · ${t.title}`,
    body: (t) => t.description || "每一次学习都是投资未来，现在开始吧。",
  },
  shopping: {
    emoji: "🛒",
    tone: "轻快、实用、提示要点",
    title: (t) => `🛒 购物提醒 · ${t.title}`,
    body: (t) => t.description || "记得完成这项采购，别错过了。",
  },
  finance: {
    emoji: "💰",
    tone: "严谨、可靠、提示风险与时限",
    title: (t) => `💰 财务事项 · ${t.title}`,
    body: (t) => t.description || "财务事项讲究时效，建议现在处理避免逾期。",
  },
  personal: {
    emoji: "✨",
    tone: "轻松、友好、像朋友间的提醒",
    title: (t) => `✨ 提醒 · ${t.title}`,
    body: (t) => t.description || "你之前记下的这件事，现在是完成它的好时机。",
  },
  other: {
    emoji: "⏰",
    tone: "中性、清晰",
    title: (t) => `⏰ 提醒 · ${t.title}`,
    body: (t) => t.description || "现在是完成这个约定的时间。",
  },
};

// 紧急优先级覆盖：任何类别下 urgent 都用强提醒风格
const URGENT_STYLE = {
  emoji: "🚨",
  tone: "紧迫、直接、强调立即行动",
  title: (t) => `🚨 紧急 · ${t.title}`,
  body: (t) => (t.description ? `${t.description}（此事项为紧急优先级，请立即处理）` : "此事项为紧急优先级，请立即处理！"),
};

export function getStyle(task) {
  if (task.priority === "urgent") return URGENT_STYLE;
  return CATEGORY_STYLES[task.category] || CATEGORY_STYLES.other;
}

/** 纯模板文案（同步、零成本） */
export function buildTemplateCopy(task, isAdvance) {
  const style = getStyle(task);
  return {
    title: isAdvance ? `${style.emoji} 即将到来 · ${task.title}` : style.title(task),
    body: style.body(task),
  };
}

// 内存缓存：同一任务同一场景只生成一次（持续提醒重复触发时复用）
const aiCopyCache = new Map();
const AI_TIMEOUT_MS = 4000;

/**
 * 获取个性化通知文案：AI 实时生成，超时或失败回退到类别模板。
 * @returns {Promise<{title: string, body: string, source: 'ai'|'template'}>}
 */
export async function getPersonalizedCopy(task, isAdvance) {
  const fallback = { ...buildTemplateCopy(task, isAdvance), source: "template" };
  const cacheKey = `${task.id}-${isAdvance ? "adv" : "due"}`;
  if (aiCopyCache.has(cacheKey)) return aiCopyCache.get(cacheKey);

  const style = getStyle(task);
  const aiPromise = invokeAI(
    {
      prompt: `请为以下任务提醒生成一条个性化通知文案。
任务标题：${task.title}
任务描述：${task.description || "（无）"}
类别：${task.category || "personal"}，优先级：${task.priority || "medium"}
场景：${isAdvance ? "提前提醒（任务即将到点）" : "到点提醒（现在该执行了）"}
风格要求：${style.tone}。
要求：title 不超过 20 字（可含 1 个 emoji），body 不超过 40 字，紧扣任务具体内容，不要泛泛而谈，使用中文。`,
      response_json_schema: {
        type: "object",
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
      },
      system_prompt: "你是一个贴心的个人提醒助手，擅长根据任务内容写出简短而有温度的通知文案。",
    },
    "emotional_reminder"
  ).then((data) => {
    if (data?.title && data?.body) return { title: data.title, body: data.body, source: "ai" };
    return fallback;
  });

  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(fallback), AI_TIMEOUT_MS));

  let result;
  try {
    result = await Promise.race([aiPromise, timeoutPromise]);
  } catch {
    result = fallback;
  }
  // 即使超时先用了模板，AI 结果回来后也写入缓存，供后续重复提醒使用
  aiPromise.then((r) => { if (r.source === "ai") aiCopyCache.set(cacheKey, r); }).catch(() => {});
  aiCopyCache.set(cacheKey, result);
  return result;
}