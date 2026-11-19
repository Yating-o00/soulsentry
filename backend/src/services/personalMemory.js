import { activeMemoryScope, excludeSuppressedMemories, recallableMessageScope } from "./memoryStore.js";
import { rankMemoryRecords } from "./memoryRanking.js";
import { embeddingModel, memoryVectorScores } from "./memoryEmbeddings.js";

// Retrieve a small amount of user-owned context for a conversation turn.
// Topic aliases help match common Chinese paraphrases before semantic search exists.
const TOPICS = [
  ["健身", "训练", "锻炼", "运动", "哑铃", "弹力带", "器械", "健身房"],
];
const STOP_WORDS = new Set(["帮我", "我们", "你们", "什么", "怎么", "如何", "一个", "一下", "自己", "喜欢", "需要", "希望", "请问", "安排", "记住", "我的", "给我"]);
const segmenter = new Intl.Segmenter("zh", { granularity: "word" });

function termsFor(text) {
  const value = String(text || "").toLowerCase();
  const terms = new Set();
  for (const part of segmenter.segment(value)) {
    const term = part.segment.trim();
    if (part.isWordLike && term.length >= 2 && !STOP_WORDS.has(term)) terms.add(term);
  }
  for (const topic of TOPICS) {
    if (topic.some((word) => value.includes(word))) {
      topic.forEach((word) => terms.add(word));
    }
  }
  return [...terms];
}

export async function retrievePersonalMemories({ prisma, userId, query, limit = 5, mode = "lexical" }) {
  if (!userId || !String(query || "").trim()) return [];
  const terms = termsFor(query);
  const rows = await prisma.memoryRecord.findMany({
    where: activeMemoryScope(userId),
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: {
      id: true, title: true, content: true, tags: true, memoryType: true, updatedAt: true, fact: true, aiInsight: true,
      revisions: { orderBy: { version: "desc" }, take: 1, select: { version: true, sourceMessageIds: true } },
      ...(mode === "hybrid" && embeddingModel() ? {
        embedding: true,
      } : {}),
    },
  });
  const records = await excludeSuppressedMemories(prisma, userId, rows);
  if (mode === "hybrid") return rankMemoryRecords(records, query, { limit, scores: await memoryVectorScores(records, query) });
  return records.filter((record) => {
    const searchable = [record.title, record.content, ...(Array.isArray(record.tags) ? record.tags : [])]
      .filter(Boolean).join(" ").toLowerCase();
    return record.memoryType === "instruction" || terms.some((term) => searchable.includes(term));
  }).sort((a, b) => Number(b.memoryType === "instruction") - Number(a.memoryType === "instruction"))
    .slice(0, Math.max(0, Math.min(limit, 5)));
}

export async function searchMemoryTranscript({ prisma, userId, query, excludeIds = [] }) {
  // Historical lookup is a bounded fallback for requests that depend on prior user facts.
  if (!userId || !/(?:上次|之前|曾经|以前|说过|提过|记得|照旧|按我|我平常|我习惯)/.test(String(query || ""))) return [];
  const messages = await prisma.companionMessage.findMany({
    where: { ...recallableMessageScope(userId), role: "user", id: { notIn: excludeIds.slice(0, 30) } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 180,
    select: { id: true, content: true, createdAt: true },
  });
  const revisions = await prisma.memoryRevision.findMany({
    where: { memory: { userId } },
    select: { memoryId: true, version: true, sourceMessageIds: true, memory: { select: { fact: true } } },
    orderBy: [{ memoryId: "asc" }, { version: "desc" }],
    take: 600,
  });
  const oldSources = new Set();
  const currentSources = new Set();
  const visited = new Set();
  for (const revision of revisions) {
    const fact = revision.memory.fact;
    const current = !visited.has(revision.memoryId) && (!fact || (fact.status === "active" && (!fact.expiresAt || fact.expiresAt > new Date())));
    visited.add(revision.memoryId);
    for (const id of revision.sourceMessageIds) (current ? currentSources : oldSources).add(id);
  }
  const records = messages.filter(({ id, content }) => !oldSources.has(id) && !currentSources.has(id) && !/[?？]\s*$/.test(content)
      && !/密码|验证码|银行卡号|身份证号/.test(content))
    .map(({ id, content, createdAt }) => ({
      id, title: createdAt.toISOString().slice(0, 10),
      content: content.replace(/^(?:请)?(?:帮我)?记住[：:,，\s]*/, "").slice(0, 280),
    }));
  return rankMemoryRecords(records, query, { limit: 2 });
}
