import { invokeKimiText } from "../lib/kimi.js";

// 心流对话：用户用聊天的方式告诉 SoulSentry 想记什么，
// AI 负责理解意图（立约定 / 记心签 / 存链接 / 闲聊），
// 信息足够时输出 extracted 提案，由用户确认后客户端再落库。
// Kimi 不可用时走本地规则兜底，保证对话永远能继续。

const CATEGORIES = ["work", "personal", "health", "study", "family", "shopping", "finance", "other"];
const PRIORITIES = ["high", "medium", "low"];
const PRESSURE_WORDS = /必须|赶紧|马上做|再不|来不及了|惩罚|后果|你已经/;
const URL_RE = /https?:\/\/[^\s"'，。）)]+/i;

function chinaNow() {
  const cn = new Date(Date.now() + 8 * 3600 * 1000);
  return {
    date: cn.toISOString().slice(0, 10),
    dateTime: cn.toISOString().slice(0, 16).replace("T", " ")
  };
}

function trim(s, n) {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n) : t;
}

function sanitizeExtracted(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type;
  if (type === "task") {
    const title = trim(raw.title, 60);
    if (!title) return null;
    let dueAt = null;
    if (raw.due_at) {
      const d = new Date(raw.due_at);
      if (!isNaN(d.getTime())) dueAt = d.toISOString();
    }
    return {
      type: "task",
      title,
      description: trim(raw.description, 300) || null,
      category: CATEGORIES.includes(raw.category) ? raw.category : "personal",
      priority: PRIORITIES.includes(raw.priority) ? raw.priority : "medium",
      due_at: dueAt
    };
  }
  if (type === "heart") {
    const content = trim(raw.content, 500);
    if (!content) return null;
    return { type: "heart", content };
  }
  if (type === "link") {
    const text = trim(raw.text, 500);
    if (!text || !URL_RE.test(text)) return null;
    return { type: "link", text };
  }
  return null;
}

// 本地兜底：Kimi 不可用时的规则理解

// 用户否定当前提案：收起提案，温柔引导 TA 说出要改什么
const REJECT_RE = /不对|不是这个?|错了|再聊聊|先不要|重来|重新说/;

function fallbackExtract(lastUserText, lastExtracted) {
  const t = String(lastUserText || "").trim();
  if (!t) return null;

  // 否定提案：返回 null 收起卡片，由 fallbackReply 引导用户说清要改什么
  if (REJECT_RE.test(t) && lastExtracted) return "__reject__";

  const urlMatch = t.match(URL_RE);
  if (urlMatch) return { type: "link", text: t };

  // 简化版时间解析：只覆盖最常见的口语时间
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  let due = null;
  let titleSource = t;

  const minMatch = t.match(/(\d+)\s*分钟后/);
  const hourMatch = t.match(/(\d+)\s*小时后/);
  const tonightMatch = t.match(/(?:今天下午|今晚)\s*(\d{1,2})(?:点|:|：)?(?:30|半)?/);
  const tomorrowMatch = t.match(/明天(?:上午|中午|下午|晚上)?\s*(\d{1,2})(?:点|:|：)?(?:30|半)?/);
  if (minMatch) {
    const d = new Date(now.getTime() + parseInt(minMatch[1], 10) * 60000);
    due = toIso(d);
  } else if (/半小时后/.test(t)) {
    due = toIso(new Date(now.getTime() + 30 * 60000));
  } else if (hourMatch) {
    due = toIso(new Date(now.getTime() + parseInt(hourMatch[1], 10) * 3600000));
  } else if (tonightMatch) {
    const d = new Date();
    d.setHours(parseInt(tonightMatch[1], 10), /半|30/.test(t) ? 30 : 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    due = toIso(d);
  } else if (tomorrowMatch) {
    let h = parseInt(tomorrowMatch[1], 10);
    if ((t.includes("下午") || t.includes("晚上")) && h < 12) h += 12;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, /半|30/.test(t) ? 30 : 0, 0, 0);
    due = toIso(d);
  }

  if (due) {
    const cleaned = t
      .replace(/提醒我?/, "")
      .replace(/(明天|今天|今晚|下午|上午|晚上|中午)?\s*\d{1,2}\s*(点|:|：)?(半|30|分)?\s*(后)?/, "")
      .replace(/[，。,.!\s]+$/, "")
      .trim();
    const title = cleaned ? cleaned.slice(0, 60) : t.slice(0, 60);
    return { type: "task", title, description: t.slice(0, 300), category: "personal", priority: "medium", due_at: due };
  }

  // 情绪/感悟 → 心签；其余也先收进记录，避免对话走进死胡同
  const isHeart = t.length <= 200
    && /[情绪心累烦焦虑难过开心感谢温暖幸福孤独迷茫害怕担心感动感慨突然觉]/.test(t);
  if (isHeart && lastExtracted?.type !== "heart") return { type: "heart", content: t.slice(0, 500) };

  return lastExtracted || null;
}

function fallbackReply(userText, extracted, lastExtracted) {
  const t = String(userText || "").trim();
  if (extracted === "__reject__") {
    return "好，先不急着定～你想改哪一部分？时间、内容，还是它其实不是约定，告诉我就好。";
  }
  if (!extracted) {
    return "我在听～你可以再说一点点：比如想什么时候做这件事，或者这只是当下的一点心情，我都会替你收好。";
  }
  if (extracted.type === "task" && (!lastExtracted || lastExtracted.title !== extracted.title)) {
    return `好，我记下了「${extracted.title}」。时间我也算好了，你看一眼下面的小卡片，没问题就点确认～`;
  }
  if (extracted.type === "heart") {
    return "这句话我替你收进心签里了。点下面的确认就存好，以后随时可以翻出来看看～";
  }
  if (extracted.type === "link") {
    return "这个链接我帮你存进记录。点下面的确认就存好～";
  }
  return "我在听，你继续说～";
}

// ===== Kimi 对话 =====

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "对用户说的话，1-3 句，温柔自然口语" },
    extracted: {
      type: ["object", "null"],
      description: "从对话中提取的待确认内容；信息不足或纯聊天时为 null",
      properties: {
        type: { type: "string", enum: ["task", "heart", "link"] },
        title: { type: "string" },
        description: { type: "string" },
        content: { type: "string" },
        text: { type: "string" },
        category: { type: "string", enum: CATEGORIES },
        priority: { type: "string", enum: PRIORITIES },
        due_at: { type: "string", description: "ISO8601 带 +08:00 时区，如 2026-09-24T15:00:00+08:00" }
      }
    }
  },
  required: ["reply", "extracted"]
};

function buildMessagesBlock(messages) {
  return messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "用户" : "SoulSentry"}：${trim(m.content, 500)}`)
    .join("\n");
}

async function chatWithKimi({ messages, lastExtracted }) {
  const now = chinaNow();
  const extractedCtx = lastExtracted
    ? `（你上一轮提出的待确认提案如下，用户可能正在对它做修改：${JSON.stringify(lastExtracted)}）`
    : "";

  const prompt = `现在是中国时间 ${now.date} ${now.dateTime.slice(11)}。以下是用户与 SoulSentry 的对话${extractedCtx}：

${buildMessagesBlock(messages)}

请按系统要求返回 JSON。`;

  const result = await invokeKimiText({
    prompt,
    systemPrompt: `你是 SoulSentry「心栈」，一个温柔、克制、值得信赖的陪伴式记录助手。用户通过和你聊天的方式，把心里想记的东西告诉你。

你的任务是从对话中理解用户想做什么，并在信息足够时给出待确认的结构化提案（extracted）：
- type=task（立约定）：用户想在未来某个时间做某件事。title 是简短事项名（≤20字），due_at 必须是带 +08:00 的 ISO8601 时间。category 从 ${CATEGORIES.join("/")} 中选，priority 从 high/medium/low 中选。
- type=heart（记心签）：用户在表达情绪、心情、感悟、瞬间。content 保留用户原话。
- type=link（存链接）：用户发来网址想存起来。text 保留用户原话。
- 纯聊天或信息还不足：extracted 为 null。

对话原则：
1. 信息不足时不要硬猜：只问一个最关键的补充问题（通常是时间），语气像朋友，不像表单。
2. 信息足够时：extracted 给出完整提案，reply 里用一两句话温柔复述你要记下什么，提醒用户点确认即可生成，不要催促。
3. 用户修改提案时，更新 extracted；用户说"就这些/对了/确认"时保持 extracted 不变。
4. 用户否定当前提案（比如说"不对""我想改一下"）时：extracted 输出 null，先温柔地问清楚 TA 想改哪一部分（时间、内容，还是这其实不是约定/心签），不要立刻重复同一个提案。
5. 永远温柔从容：不评判、不催促、不制造焦虑；用户想闲聊就好好陪聊。
6. reply ≤80字，自然口语，像微信聊天，不要用列表和 markdown。
7. 严格返回 JSON，不要输出其他内容。`,
    responseJsonSchema: RESPONSE_SCHEMA,
    temperature: 0.7
  });

  if (!result || typeof result !== "object" || typeof result.reply !== "string") {
    throw new Error("invalid chat response");
  }
  if (PRESSURE_WORDS.test(result.reply)) {
    throw new Error("reply failed tone check");
  }
  return {
    reply: trim(result.reply, 120),
    extracted: sanitizeExtracted(result.extracted)
  };
}

/**
 * 对话入口：messages 为完整对话历史（客户端持有），lastExtracted 为当前待确认提案。
 * 返回 { reply, extracted, source }；任何情况下都给出可继续的对话。
 */
export async function runFlowChat({ messages, lastExtracted = null }) {
  const safeMessages = Array.isArray(messages)
    ? messages
        .filter((m) => m && typeof m.content === "string" && ["user", "assistant"].includes(m.role))
        .slice(-30)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }))
    : [];

  const lastUser = [...safeMessages].reverse().find((m) => m.role === "user");

  try {
    if (!safeMessages.length || !lastUser) throw new Error("empty messages");
    const out = await Promise.race([
      chatWithKimi({ messages: safeMessages, lastExtracted }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 15000))
    ]);
    return { ...out, source: "ai" };
  } catch (err) {
    console.warn("[flowChat] Kimi chat failed, fallback:", err?.message || err);
    const raw = fallbackExtract(lastUser?.content, lastExtracted);
    const extracted = raw && raw !== "__reject__" ? sanitizeExtracted(raw) : null;
    return {
      reply: fallbackReply(lastUser?.content, raw === "__reject__" ? "__reject__" : extracted, lastExtracted),
      extracted,
      source: "fallback"
    };
  }
}
