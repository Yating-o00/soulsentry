// 心签 · 共享元数据（与小程序端 pages/notes 口径一致）
// 五类签色、回应浓度、置顶约定、note 归一化

export const TYPE_META = {
  emotion:     { label: "情绪", color: "#c97b8a", bg: "#fce8ec" },
  inspiration: { label: "灵感", color: "#d97706", bg: "#fef3c7" },
  material:    { label: "资料", color: "#5b82a0", bg: "#e8f0f5" },
  memo:        { label: "备忘", color: "#8a7d6b", bg: "#f4f0ea" },
  share:       { label: "分享", color: "#6e8a73", bg: "#e8f5e9" },
};

export const TYPE_ORDER = ["emotion", "inspiration", "material", "memo", "share"];

export const CATEGORY_LABEL_TO_TYPE = {
  情绪: "emotion",
  灵感: "inspiration",
  资料: "material",
  备忘: "memo",
  分享: "share",
};

// 回应浓度三档（后端 analyzeHeartSign / followupHeartSign 均已支持）
export const DENSITY_KEY = "ss_heart_density";
export const DENSITY_OPTIONS = [
  { key: "full", label: "多陪我说说" },
  { key: "light", label: "轻轻回应" },
  { key: "mute", label: "只收不答" },
];

// 分类读取：优先 source_type，回落 metadata.ai_analysis.category 中文映射
export function getNoteType(note) {
  const st = note?.source_type;
  if (TYPE_META[st]) return st;
  const cat = note?.metadata?.ai_analysis?.category || note?.ai_analysis?.category;
  return CATEGORY_LABEL_TO_TYPE[cat] || "emotion";
}

// 置顶约定：metadata.pinned（免 schema 变更，与小程序一致）
export function isPinnedNote(note) {
  return !!note?.metadata?.pinned;
}

// 独立后端把 AI 分析放在 metadata.ai_analysis，统一提升到 note.ai_analysis 便于读取
export function normalizeNote(n) {
  if (!n) return n;
  return {
    ...n,
    ai_analysis: n.ai_analysis || n.metadata?.ai_analysis || null,
  };
}

// 签文纯文本（供抽签/关键词回顾/签卡使用）：去 HTML 标签并解码常见实体
export function notePlainText(note) {
  const decode = (s) => String(s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  const raw = note?.plain_text || String(note?.content || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decode(decode(raw)).replace(/<[^>]+>/g, "").trim();
}

export function isVaultNote(note) {
  return note?.source_type === "vault" || !!note?.metadata?.is_vault;
}
