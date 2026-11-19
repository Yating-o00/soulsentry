import { z } from "zod";

const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const observation = z.object({
  sourceId: z.string().min(1),
  quote: z.string().trim().min(4).max(280),
  topic: key,
  attribute: key,
  aliases: z.array(z.string().trim().min(2).max(30)).max(6).default([]),
  expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
});
const retirement = z.object({
  obsoleteId: z.string().min(1),
  currentId: z.string().min(1),
  reason: z.enum(["duplicate", "correction"]),
});
const modelOutput = (item) => z.object({ items: z.array(z.unknown()).max(20) }).transform(({ items }) => (
  items.flatMap((value) => {
    const result = item.safeParse(value);
    return result.success ? [result.data] : [];
  })
));
const correction = /(?:现在|从今|今后|以后|改成|改为|调整为|改掉|换成|不再|已经|新的上限)/;
const temporary = /(?:仅限|暂时|今天|明天|本周|这周|下周|这几天|这个月|本月|下个月|\d{1,2}月\d{1,2}[日号])/;
const sensitive = /(?:密码|验证码|银行卡号|身份证号|社保号|通行密钥|信用卡号)/;
const otherSubject = /(?:妹妹|姐姐|哥哥|弟弟|朋友|同事|伴侣|父亲|母亲|孩子)(?:的|在|要|复习|每次|考试)/;
const explicit = /^(?:请)?(?:帮我)?记住[：:,，\s]*/;
const questions = /[?？]$/;

export function isHistoricalMemory(text) {
  return /^(?:以前|上个月|原来|曾经)/.test(String(text || "")) && !/现在|如今|目前/.test(text);
}

export function containsSensitiveMemory(text) {
  return sensitive.test(String(text || ""));
}

function readableMessages(messages) {
  return messages.filter(({ role, content }) => role === "user" && typeof content === "string")
    .slice(-20)
    .map(({ id, content, createdAt, meta }) => ({
      id, content: content.slice(0, 1200), at: createdAt || null,
      ...(meta?.memoryProposalId ? { purpose: "user_stated_plan_feedback" } : {}),
    }));
}

function readableRecords(records) {
  return records.slice(0, 30).map(({ id, title, content, fact, sourceIds, reason }) => ({
    id, title, content: String(content || "").slice(0, 300), fact, sourceIds, reason,
  }));
}

const extractionSchema = modelOutput(observation);
const consolidationSchema = modelOutput(retirement);

export function memorySlot(fact) {
  return [fact.subject, fact.topic, fact.attribute].join(":");
}

function buildObservation({ sourceId, quote, topic, attribute, aliases = [], expiresAt = null }, source) {
  const fact = { subject: "self", topic, attribute, aliases, expiresAt, status: "active" };
  return { title: quote.slice(0, 100), content: quote, sourceIds: [sourceId], fact, slot: memorySlot(fact), isCorrection: correction.test(source) };
}

// Preserve verbatim, high-confidence statements even when the model elects not
// to write. Leave uncertain, sensitive, and time-limited language to review.
function explicitPersonalObservation({ id, content }) {
  if (containsSensitiveMemory(content) || temporary.test(content) || otherSubject.test(content)
      || /(?:可能|也许|比如|例如|假设|如果|想试试|听说|是不是)/.test(content)) return null;
  const duration = /(?:\d{1,3}|[一二两三四五六七八九十]{1,4})\s*(?:分钟|小时)|半小时/;
  const topics = [
    { topic: "english_vocabulary", terms: /词汇|单词|生词|背词/, session: true },
    { topic: "reading", terms: /读书|阅读/, session: true },
    { topic: "podcast", terms: /播客/, session: true },
    { topic: "commute", terms: /上班|下班|通勤|去公司|到公司/ },
    { topic: "fitness", terms: /锻炼|训练|练背|健身|在家练/ },
  ];
  const topic = topics.find(({ terms }) => terms.test(content));
  const choose = (attribute, scope, aliases = [], quote = content) =>
    buildObservation({ sourceId: id, topic: scope, attribute, aliases, quote: quote.trim().slice(0, 280) }, content);
  if (topic?.session && /(?:每次|一次|单次|一轮).{0,16}(?:最多|只能|不超过|上限)/.test(content) && duration.test(content)) {
    // Use the clause giving the current limit, excluding an appended prior value.
    return choose("session_limit", topic.topic, ["单次时长", "上限"], content.split(/[，；。]/)[0]);
  }
  if (topic?.session && /喜欢|习惯|偏爱|更愿意/.test(content) && /词卡|单词卡|卡片|闪卡|跟读|听写|错题本/.test(content)) {
    return choose("study_method", topic.topic, ["复习方式", "自测"]);
  }
  if (topic?.topic === "fitness" && /(?:只用|只有|仅有|没别的|主要用).{0,18}(?:哑铃|弹力带|壶铃|杠铃|自重|徒手)/.test(content)) {
    return choose("equipment", topic.topic, ["器械", "器材"], content.split(/[，；。]/)[0]);
  }
  if (topic?.topic === "commute" && /(?:一般|通常|平常|大概|需要|花|要)/.test(content)) {
    if (duration.test(content)) return choose("travel_time", topic.topic, ["通勤时长", "用时"]);
    if (/骑车|自行车|单车|地铁|公交|开车|步行|骑行/.test(content)) return choose("transport", topic.topic, ["通勤方式"]);
  }
  if (/工作日|周[一二三四五六日天末]|礼拜[一二三四五六日天]|星期[一二三四五六日天]/.test(content)
      && /有空|没空|空闲|不能安排|可以安排/.test(content) && /上午|中午|下午|晚上|早上|晚间/.test(content)) {
    return choose("availability", "calendar", ["方便时段", "可用时间"]);
  }
  return null;
}

export async function extractMemoryObservations({ messages, records, invoke, now = new Date(), runWhenEmpty = false }) {
  const eligible = readableMessages(messages).filter(({ content }) => !questions.test(content.trim())
    && !explicit.test(content) && !sensitive.test(content));
  const grounded = eligible.map(explicitPersonalObservation).filter(Boolean);
  const captured = new Set(grounded.flatMap(({ sourceIds }) => sourceIds));
  const remaining = eligible.filter(({ id }) => !captured.has(id));
  if (!remaining.length && !runWhenEmpty) return grounded;
  const { data } = await invoke({
    systemPrompt: [
      "从用户亲口说的话中捕捉可在未来复用的本人偏好、长期限制或正在进行的目标。",
      "只保存明确、低风险、自身相关的事实。跳过假设、第三方属性、助手推断、敏感资料、刚提过的显式记忆。",
      "计划反馈只学习用户明确说出的长期原因。确认、拒绝或错过计划本身不能推出偏好。",
      "quote 必须是来源原文中的连续片段，包含主语、活动范围、数值及单位（如有）。改口时优先引用新值。",
      "topic 和 attribute 用简短英文标识，延用同一语义的已知标识，例如 english_vocabulary/session_limit；不同活动不要共用标识。",
      "临时情况只有在原文有可确定的截止时间才写入 expiresAt（ISO 8601），长期事实填 null。只输出 JSON。",
    ].join("\n"),
    prompt: JSON.stringify({
      now: now.toISOString(),
      output: { items: [{ sourceId: "原文 ID", quote: "逐字引文", topic: "topic_key", attribute: "attribute_key", aliases: ["检索词"], expiresAt: null }] },
      recent: remaining, known: readableRecords(records),
    }),
    temperature: 0.15,
    maxTokens: 1700,
    withUsage: true,
  });
  const observed = new Map(remaining.map(({ id, content }) => [id, content]));
  const mined = extractionSchema.parse(data).flatMap(({ sourceId, quote, topic, attribute, aliases, expiresAt }) => {
    const source = observed.get(sourceId);
    if (!source?.includes(quote) || sensitive.test(quote) || otherSubject.test(quote) || (questions.test(quote) && quote === source)) return [];
    if (temporary.test(source) && !expiresAt) return [];
    if (expiresAt && (!temporary.test(source) || Date.parse(expiresAt) <= now.getTime())) return [];
    return [buildObservation({ sourceId, quote, topic, attribute, aliases, expiresAt }, source)];
  });
  const order = new Map(eligible.map(({ id }, index) => [id, index]));
  const latestBySlot = new Map();
  for (const item of [...grounded, ...mined].sort((a, b) => order.get(a.sourceIds[0]) - order.get(b.sourceIds[0]))) {
    latestBySlot.set(item.slot, item);
  }
  return [...latestBySlot.values()];
}

export async function proposeMemoryRetirements({ messages, records, invoke, runWhenEmpty = false }) {
  const shown = readableRecords(records);
  if (shown.length < 2 && !runWhenEmpty) {
    return shown.filter((record) => !["edit", "restore"].includes(record.reason) && isHistoricalMemory(record.content || record.title))
      .map(({ id }) => ({ obsoleteId: id, reason: "historical" }));
  }
  const { data } = await invoke({
    systemPrompt: [
      "归整私人记忆。找出语义相同的重复记录，或有新原话证据的旧值。",
      "主体（本人/第三方）、活动和时间范围必须相同。临时例外不覆盖常态。近期值只有明确纠正才能替换。",
      "不可停用用户在界面编辑或恢复的记录。不可创造事实。不要用助手的猜测当证据。",
      "每项返回 obsoleteId, currentId, reason（duplicate 或 correction）。只输出 JSON。",
    ].join("\n"),
    prompt: JSON.stringify({ output: { items: [{ obsoleteId: "记录 ID", currentId: "保留记录 ID", reason: "correction" }] }, records: shown, evidence: readableMessages(messages) }),
    temperature: 0.15,
    maxTokens: 1200,
    withUsage: true,
  });
  const byId = new Map(records.map((record) => [record.id, record]));
  const sourceById = new Map(readableMessages(messages).map(({ id, content }) => [id, content]));
  const proposed = consolidationSchema.parse(data);
  const retiring = new Set();
  const retained = new Set();
  const accepted = proposed.filter(({ obsoleteId, currentId, reason }) => {
    const obsolete = byId.get(obsoleteId);
    const current = byId.get(currentId);
    if (!obsolete || !current || obsoleteId === currentId || retiring.has(obsoleteId) || retiring.has(currentId) || retained.has(obsoleteId)) return false;
    if (["edit", "restore"].includes(obsolete.reason)) return false;
    if (!current.sourceIds?.some((id) => sourceById.has(id))) return false;
    if (obsolete.fact && current.fact && memorySlot(obsolete.fact) !== memorySlot(current.fact)) return false;
    if (obsolete.fact?.subject && !current.fact?.subject) return false;
    if (current.fact?.expiresAt && !obsolete.fact?.expiresAt) return false;
    if (reason === "correction") {
      const newEvidence = current.sourceIds.some((id) => correction.test(sourceById.get(id) || ""));
      if (!newEvidence || (obsolete.createdAt && current.createdAt && new Date(obsolete.createdAt) > new Date(current.createdAt))) return false;
      // Older records without typed scope can still have obvious third-party owners.
      if (!obsolete.fact && otherSubject.test(obsolete.content || obsolete.title)) return false;
    } else if (!obsolete.fact || !current.fact) {
      const oldText = String(obsolete.content || obsolete.title).replace(/[\s，。]/g, "");
      const newText = String(current.content || current.title).replace(/[\s，。]/g, "");
      if (oldText !== newText) return false;
    }
    retiring.add(obsoleteId);
    retained.add(currentId);
    return true;
  });
  const historical = records.filter(({ id, content, title, reason }) => !retiring.has(id) && !retained.has(id)
    && !["edit", "restore"].includes(reason) && isHistoricalMemory(content || title));
  return [...accepted, ...historical.map(({ id }) => ({ obsoleteId: id, reason: "historical" }))];
}
