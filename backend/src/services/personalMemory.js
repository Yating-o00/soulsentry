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

export async function retrievePersonalMemories({ prisma, userId, query, limit = 5 }) {
  if (!userId || !String(query || "").trim()) return [];
  const terms = termsFor(query);
  const records = await prisma.memoryRecord.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: { id: true, title: true, content: true, tags: true, memoryType: true, updatedAt: true },
  });
  return records.filter((record) => {
    const searchable = [record.title, record.content, ...(Array.isArray(record.tags) ? record.tags : [])]
      .filter(Boolean).join(" ").toLowerCase();
    return record.memoryType === "instruction" || terms.some((term) => searchable.includes(term));
  }).sort((a, b) => Number(b.memoryType === "instruction") - Number(a.memoryType === "instruction"))
    .slice(0, Math.max(0, Math.min(limit, 5)));
}
