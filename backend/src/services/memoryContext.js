import { z } from "zod";
import { activeMemoryScope, currentMemoryVersion, knownSources, memoryInclude, recallableMessageScope } from "./memoryStore.js";
import { containsSensitiveMemory } from "./memoryLearning.js";

export const RECENT_CHAT_WINDOW = 12;
const MAX_RECAP_MESSAGES = 48;
const MAX_RECAP_POINTS = 8;
const pointSchema = z.object({
  sourceId: z.string().min(1),
  kind: z.enum(["decision", "goal", "open"]),
  quote: z.string().min(4).max(180),
});

function readPoints(value) {
  const parsed = z.array(pointSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

async function recallableIds(db, userId, ids) {
  if (!ids.length) return new Set();
  const rows = await db.companionMessage.findMany({
    where: { ...recallableMessageScope(userId), id: { in: [...new Set(ids)] } }, select: { id: true },
  });
  return new Set(rows.map(({ id }) => id));
}

export async function loadMemoryContext(db, userId) {
  const [rows, recap] = await Promise.all([
    db.memoryRecord.findMany({
      where: {
        AND: [
          activeMemoryScope(userId),
          { OR: [{ isPinned: true }, { memoryType: "instruction" }] },
          { OR: [{ fact: null }, { fact: { is: { expiresAt: null, subject: "self" } } }] },
        ],
      },
      include: memoryInclude,
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }, { id: "desc" }], take: 8,
    }),
    db.memoryRecap.findUnique({ where: { userId } }),
  ]);
  const points = readPoints(recap?.points);
  const allowed = await recallableIds(db, userId, [...rows.flatMap(knownSources), ...points.map(({ sourceId }) => sourceId)]);
  const profile = rows.filter((row) => knownSources(row).every((id) => allowed.has(id))).slice(0, 3).map((row) => ({
    id: row.id, version: currentMemoryVersion(row), title: row.title, content: row.content || row.title,
  }));
  return { profile, recap: points.filter(({ sourceId }) => allowed.has(sourceId)) };
}

function summarizeRecords(items) {
  return items.map(({ title, content }) => ({ title: String(title || "").slice(0, 100), content: String(content || "").slice(0, 200) }));
}

export function buildMemoryTopicSummary(records) {
  const byTopic = new Map();
  for (const item of records) {
    if (!item.fact?.topic || !["self", undefined].includes(item.fact.subject)) continue;
    const items = byTopic.get(item.fact.topic) || [];
    items.push(item);
    byTopic.set(item.fact.topic, items);
  }
  const top = [...byTopic].sort((a, b) => b[1].length - a[1].length)[0];
  if (!top || top[1].length < 2) return null;
  return {
    topic: top[0],
    entries: top[1].slice(0, 3).map((item) => ({
      id: item.id, version: currentMemoryVersion(item),
      quote: String(item.content || item.title || "").slice(0, 150),
    })),
  };
}

export function renderMemoryContext({ profile = [], recap = [], memories = [], transcript = [], topicSummary, commitments = [] } = {}) {
  const covered = new Set(topicSummary?.entries.map(({ id }) => id));
  const remaining = memories.filter(({ id }) => !covered.has(id));
  return [
    profile.length && "长期偏好（以当前用户要求为准）：" + JSON.stringify(summarizeRecords(profile.slice(0, 3))),
    recap.length && "历史对话摘要（可能已变化，以最近对话为准）：" + JSON.stringify(recap.slice(0, MAX_RECAP_POINTS).map(({ kind, quote }) => ({ kind, quote }))),
    topicSummary && "专题摘要（当前事实）：" + JSON.stringify({ topic: topicSummary.topic, facts: topicSummary.entries.map(({ quote }) => quote) }),
    remaining.length && "相关记忆（个人背景）：" + JSON.stringify(summarizeRecords(remaining.slice(0, 5))),
    transcript.length && "按需查到的历史原话（核对时间与主体；以当前事实为准）：" + JSON.stringify(summarizeRecords(transcript.slice(0, 2))),
    commitments.length && "已确认约定（当前状态；不代表用户偏好）：" + JSON.stringify(commitments.slice(0, 3).map(({ title, status }) => ({ title: title.slice(0, 100), status }))),
  ].filter(Boolean).join("\n");
}

export async function loadRememberedCommitments(db, userId, query) {
  if (!/(?:上次|以前|之前|继续|照旧|进展|当前).{0,16}(?:计划|约定|任务)/.test(query)) return [];
  const signals = await db.memoryTaskSignal.findMany({
    where: { userId, kind: "confirmed_plan" }, orderBy: { createdAt: "desc" },
    select: { evidenceId: true }, take: 8,
  });
  if (!signals.length) return [];
  return db.task.findMany({
    where: { userId, id: { in: signals.map(({ evidenceId }) => evidenceId) }, deletedAt: null, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, status: true },
    take: 3,
  });
}

export async function proposeMemoryRecap(db, { userId, invoke }) {
  const [previous, recent] = await Promise.all([
    db.memoryRecap.findUnique({ where: { userId } }),
    db.companionMessage.findMany({
      where: recallableMessageScope(userId), select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: RECENT_CHAT_WINDOW,
    }),
  ]);
  const boundary = recent.at(-1);
  if (recent.length < RECENT_CHAT_WINDOW) return null;
  const candidates = await db.companionMessage.findMany({
    where: {
      ...recallableMessageScope(userId),
      AND: [
        { OR: [{ createdAt: { lt: boundary.createdAt } }, { createdAt: boundary.createdAt, id: { lt: boundary.id } }] },
        ...(previous ? [{ OR: [{ createdAt: { gt: previous.cursorAt } }, { createdAt: previous.cursorAt, id: { gt: previous.cursorId } }] }] : []),
      ],
    },
    select: { id: true, role: true, content: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: MAX_RECAP_MESSAGES,
  });
  if (!candidates.length) return null;
  const prior = readPoints(previous?.points);
  const allowed = await recallableIds(db, userId, prior.map(({ sourceId }) => sourceId));
  const usablePrior = prior.filter(({ sourceId, quote }) => allowed.has(sourceId) && !containsSensitiveMemory(quote));
  const input = candidates.filter(({ content }) => !containsSensitiveMemory(content))
    .map(({ id, role, content, createdAt }) => ({ id, role, content: content.slice(0, 700), createdAt }));
  const { data } = await invoke({
    systemPrompt: [
      "压缩较早的陪伴对话，延续明确的决定、目标和未决事项。",
      "结合已有要点与新增对话，近期消息优先，删除已结束的事项。不要写身份证、密码等敏感信息。",
      "最多保留8点。quote 必须是原文中连续片段，保留日期、数字和单位。助手猜测不得作为用户偏好。",
      "只输出 JSON：{points:[{sourceId,kind:'decision'|'goal'|'open',quote}]}",
    ].join("\n"),
    prompt: JSON.stringify({ previous: usablePrior, messages: input }),
    temperature: 0.2, maxTokens: 1300, withUsage: true,
  });
  const proposals = readPoints(data?.points);
  if (!Array.isArray(data?.points) || proposals.length !== data.points.length) throw new Error("Invalid memory recap");
  const byId = new Map(input.map(({ id, content }) => [id, content]));
  const unique = new Map();
  for (const point of proposals) {
    const supported = byId.get(point.sourceId)?.includes(point.quote)
      || usablePrior.some(({ sourceId, quote }) => point.sourceId === sourceId && point.quote === quote);
    if (supported) unique.set(point.sourceId + ":" + point.quote, point);
  }
  const cursor = candidates.at(-1);
  return { points: [...unique.values()].slice(0, MAX_RECAP_POINTS), cursorAt: cursor.createdAt, cursorId: cursor.id };
}

export async function saveMemoryRecap(tx, userId, recap) {
  const allowed = await recallableIds(tx, userId, recap.points.map(({ sourceId }) => sourceId));
  const data = { ...recap, points: recap.points.filter(({ sourceId }) => allowed.has(sourceId)) };
  await tx.memoryRecap.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}
