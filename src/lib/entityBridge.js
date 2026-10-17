// 跨入口智能关联层——打破心签/任务/规划/知识库之间的信息孤岛
// 提供"查找关联项"与"一键建议"两类只读/轻写操作，业务代码通过此模块发起关联
import { base44 } from "@/api/base44Client";

/**
 * 给定一条内容（标题+描述），在心签中查找语义相似的条目
 * 返回 [{ id, content, score }]
 */
export async function findRelatedNotes({ title = "", description = "", limit = 3 } = {}) {
  const query = `${title} ${description}`.toLowerCase().trim();
  if (!query) return [];
  try {
    const notes = await base44.entities.Note.list("-updated_date", 50);
    const keywords = query.split(/\s+/).filter((w) => w.length >= 2);
    if (keywords.length === 0) return [];

    const scored = notes
      .filter((n) => !n.deleted_at)
      .map((n) => {
        const hay = (n.plain_text || n.content || "").toLowerCase();
        const score = keywords.reduce((acc, kw) => acc + (hay.includes(kw) ? 1 : 0), 0);
        return { id: n.id, content: (n.plain_text || "").slice(0, 80), score };
      })
      .filter((n) => n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  } catch (e) {
    console.warn("findRelatedNotes failed", e);
    return [];
  }
}

/**
 * 给定一条任务，在现有任务中查找可能重复/相关的条目（用于避免重复录入）
 */
export async function findDuplicateTasks({ title = "", limit = 3 } = {}) {
  const q = title.toLowerCase().trim();
  if (!q || q.length < 3) return [];
  try {
    const tasks = await base44.entities.Task.list("-created_date", 50);
    const candidates = tasks
      .filter((t) => !t.deleted_at && t.status !== "completed" && t.status !== "cancelled")
      .map((t) => {
        const ht = (t.title || "").toLowerCase();
        let score = 0;
        if (ht === q) score += 10;
        else if (ht.includes(q) || q.includes(ht)) score += 5;
        else {
          const kws = q.split(/\s+/).filter((w) => w.length >= 2);
          score += kws.reduce((acc, kw) => acc + (ht.includes(kw) ? 1 : 0), 0);
        }
        return { id: t.id, title: t.title, score };
      })
      .filter((t) => t.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return candidates;
  } catch (e) {
    console.warn("findDuplicateTasks failed", e);
    return [];
  }
}

/**
 * 将一条心签转化为"知识库候选"所需的载荷（不直接写入，交由 UI 决定）
 */
export function noteToKnowledgePayload(note) {
  if (!note) return null;
  return {
    title: (note.plain_text || "").slice(0, 60) || "未命名笔记",
    content: note.content || "",
    source_type: "note",
    source_id: note.id,
    tags: note.tags || [],
    summary: note.ai_analysis?.summary || "",
    key_points: note.ai_analysis?.key_points || [],
  };
}

/**
 * 当一个任务完成时，建议关联到：
 *  - 同分类下即将到期的任务（建议继续处理）
 *  - 相关心签（供回顾）
 */
export async function getPostCompletionLinks(task) {
  if (!task) return { nextTasks: [], relatedNotes: [] };
  try {
    const [allTasks, relatedNotes] = await Promise.all([
      base44.entities.Task.filter({ category: task.category }, "-reminder_time", 20),
      findRelatedNotes({ title: task.title, description: task.description, limit: 2 }),
    ]);
    const nextTasks = allTasks
      .filter((t) => t.id !== task.id && !t.deleted_at && t.status === "pending")
      .slice(0, 3)
      .map((t) => ({ id: t.id, title: t.title, reminder_time: t.reminder_time }));
    return { nextTasks, relatedNotes };
  } catch (e) {
    console.warn("getPostCompletionLinks failed", e);
    return { nextTasks: [], relatedNotes: [] };
  }
}

export default {
  findRelatedNotes,
  findDuplicateTasks,
  noteToKnowledgePayload,
  getPostCompletionLinks,
};