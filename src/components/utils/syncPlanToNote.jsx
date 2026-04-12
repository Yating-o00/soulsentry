import { base44 } from "@/api/base44Client";

/**
 * 将规划输入通过 AI 整合后同步到心签（Note）。
 * @param {string} inputText - 用户的原始输入
 * @param {string} source - 来源标识，如 "daily_plan", "week_plan", "month_plan", "welcome"
 * @param {object} [extraContext] - 额外上下文（如日期范围、主题等）
 * @returns {Promise<object|null>} 创建的 Note 对象
 */
export async function syncPlanToNote(inputText, source, extraContext = {}) {
  if (!inputText || !inputText.trim()) return null;

  const sourceLabels = {
    daily_plan: "智能日程规划",
    week_plan: "周计划",
    month_plan: "月度规划",
    welcome: "欢迎页快速录入",
  };

  const sourceLabel = sourceLabels[source] || "AI 规划";
  const dateInfo = extraContext.dateRange || extraContext.date || new Date().toISOString().slice(0, 10);

  const aiResult = await base44.integrations.Core.InvokeLLM({
    prompt: `请将以下用户输入的日程规划内容进行智能整合，生成一条精炼的心签（笔记）。

来源: ${sourceLabel}
日期范围: ${dateInfo}
${extraContext.theme ? `主题: ${extraContext.theme}` : ""}

用户原始输入:
"""
${inputText}
"""

要求：
1. summary: 一句话概括核心内容（不超过30字）
2. content: 整理后的结构化内容（使用 Markdown 格式，包含关键时间点、事项、优先级等）
3. tags: 提取2-4个关键标签
4. key_points: 提取3-5个关键要点`,
    response_json_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        key_points: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "content", "tags"],
    },
  });

  if (!aiResult || !aiResult.content) return null;

  const noteData = {
    content: `<h3>📋 ${sourceLabel} · ${dateInfo}</h3>\n${aiResult.content}`,
    plain_text: `${sourceLabel} · ${dateInfo}\n${aiResult.summary}\n\n${aiResult.content.replace(/<[^>]*>/g, "")}`,
    tags: [...(aiResult.tags || []), sourceLabel],
    color: source === "week_plan" ? "blue" : source === "month_plan" ? "purple" : source === "daily_plan" ? "teal" : "green",
    ai_analysis: {
      summary: aiResult.summary,
      key_points: aiResult.key_points || [],
    },
    is_pinned: false,
  };

  const note = await base44.entities.Note.create(noteData);
  return note;
}