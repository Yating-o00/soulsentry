// 轻量级本地关键词匹配：不消耗 AI 点数，打开任务即时计算

const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一个",
  "上", "也", "很", "到", "要", "去", "会", "着", "没有", "看", "好", "这个",
  "the", "and", "for", "with", "that", "this", "from", "have", "will",
]);

// 从文本提取检索词：中文取滑动二字词，英文取长度>2的单词
export function extractTerms(text) {
  const terms = new Set();
  const clean = (text || "").toLowerCase();

  // 英文/数字单词
  const words = clean.match(/[a-z0-9]{3,}/g) || [];
  words.forEach((w) => !STOP_WORDS.has(w) && terms.add(w));

  // 中文连续片段 → 滑动二字词
  const cjkSegments = clean.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  cjkSegments.forEach((seg) => {
    for (let i = 0; i < seg.length - 1; i++) {
      const bigram = seg.slice(i, i + 2);
      if (!STOP_WORDS.has(bigram)) terms.add(bigram);
    }
  });

  return [...terms];
}

// 统计目标文本命中了多少个检索词
export function scoreText(terms, targetText) {
  const target = (targetText || "").toLowerCase();
  if (!target) return 0;
  let score = 0;
  for (const term of terms) {
    if (target.includes(term)) score++;
  }
  return score;
}