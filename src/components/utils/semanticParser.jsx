import { base44 } from "@/api/base44Client";
import { format, addDays, addWeeks, addMonths, startOfWeek, nextMonday } from "date-fns";

/**
 * Deep semantic parser for natural language input.
 * Handles: fuzzy time, intent classification, entity extraction, smart suggestions.
 */

const INTENT_TYPES = {
  schedule: { label: "创建日程", icon: "calendar", color: "bg-blue-50 text-blue-700" },
  task: { label: "待办任务", icon: "check", color: "bg-emerald-50 text-emerald-700" },
  wish: { label: "愿望清单", icon: "star", color: "bg-amber-50 text-amber-700" },
  note: { label: "随手记", icon: "edit", color: "bg-purple-50 text-purple-700" },
  reminder: { label: "提醒", icon: "bell", color: "bg-red-50 text-red-700" },
  meeting: { label: "会议/约见", icon: "users", color: "bg-indigo-50 text-indigo-700" },
};

/**
 * Parse user input with deep semantic understanding.
 * Returns structured analysis with time, intent, people, locations, suggestions.
 */
export async function deepSemanticParse(inputText, options = {}) {
  if (!inputText || inputText.trim().length < 2) return null;

  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const timeStr = format(now, "HH:mm");
  const dayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const todayDayName = dayNames[now.getDay()];

  // Fetch recent tasks & contacts for context-aware suggestions
  let recentContext = "";
  if (options.enableSmartComplete) {
    try {
      const recentTasks = await base44.entities.Task.list('-created_date', 20);
      const people = new Set();
      const locations = new Set();
      recentTasks.forEach(t => {
        if (t.tags) t.tags.forEach(tag => {
          if (tag.startsWith("@")) people.add(tag);
        });
        if (t.description) {
          const locMatch = t.description.match(/在(.{2,10})/);
          if (locMatch) locations.add(locMatch[1]);
        }
      });
      if (people.size > 0) recentContext += `\n用户历史联系人: ${[...people].join(", ")}`;
      if (locations.size > 0) recentContext += `\n用户常去地点: ${[...locations].join(", ")}`;
    } catch (e) {
      // ignore context fetch errors
    }
  }

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `你是一个超强的中文自然语言理解引擎。请深度解析用户输入，提取所有语义信息。

用户输入: "${inputText}"
当前时间: ${todayStr} ${timeStr} (${todayDayName})
${recentContext}

请按以下维度全面解析：

【1. 模糊时间解析】
处理所有中文时间表达，包括：
- 相对时间: "后天下午"、"下周三"、"下个月第一个周一"、"大后天"、"这周末"
- 模糊时间: "过几天"、"最近"、"有空的时候"、"月底前"
- 场景时间: "下班后"、"吃完饭"、"睡前"、"早起后"
- 重复时间: "每周三"、"每天早上"、"每月15号"
将所有时间解析为具体的 ISO 日期时间（基于当前时间推算）。
如果时间很模糊无法确定具体日期，标记 time_confidence 为 "low"。

【2. 意图分类】
严格区分以下意图类型：
- schedule: 有明确时间点的日程安排（"明天3点开会"）
- task: 需要完成的具体待办（"写完报告"、"买牛奶"）
- wish: 模糊的愿望/想法，无具体时间和行动计划（"我想学钢琴"、"有机会去西藏"）
- note: 记录性质的内容（"今天学到了xxx"、"突然想到一个点子"）
- reminder: 纯提醒类（"别忘了吃药"、"记得充话费"）
- meeting: 涉及他人的约见/会议（"和老王吃饭"、"项目评审会"）

【3. 实体提取】
- people: 提到的人名或称呼（"老王"、"林总"、"妈妈"）
- locations: 提到的地点（"望京SOHO"、"公司"、"医院"）
- objects: 涉及的物品/工具（"项目资料"、"护照"）
- conditions: 条件触发器（"如果下雨"、"如果有时间"）

【4. 智能补全建议】
基于语义分析，给出1-3条补全建议，帮助用户完善输入：
- 如果提到人但无地点 → 建议补充地点
- 如果提到地点但无时间 → 建议补充时间
- 如果是模糊想法 → 建议转化为具体行动
- 如果提到人名 → 尝试匹配历史联系人

返回结构化JSON。`,
    response_json_schema: {
      type: "object",
      properties: {
        // Time parsing
        time_entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              original_text: { type: "string", description: "原始时间表达" },
              resolved_datetime: { type: "string", description: "解析后的ISO日期时间" },
              time_confidence: { type: "string", enum: ["high", "medium", "low"] },
              is_recurring: { type: "boolean" },
              recurrence_pattern: { type: "string" }
            },
            required: ["original_text", "time_confidence"]
          }
        },
        // Intent
        primary_intent: {
          type: "string",
          enum: ["schedule", "task", "wish", "note", "reminder", "meeting"]
        },
        intent_confidence: { type: "number", description: "0-1 confidence score" },
        intent_reasoning: { type: "string", description: "一句话解释为什么是这个意图" },
        // Entities
        people: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string", description: "关系/角色，如'同事'、'家人'、'朋友'" },
              possible_matches: { type: "array", items: { type: "string" }, description: "可能匹配的历史联系人" }
            },
            required: ["name"]
          }
        },
        locations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string", enum: ["restaurant", "office", "hospital", "home", "school", "shopping", "outdoor", "other"] }
            },
            required: ["name"]
          }
        },
        objects: { type: "array", items: { type: "string" } },
        conditions: { type: "array", items: { type: "string" } },
        // Smart suggestions
        smart_suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["add_time", "add_location", "add_person", "clarify_intent", "split_task", "convert_to_action"] },
              text: { type: "string", description: "建议文案" },
              auto_fill: { type: "string", description: "如果用户采纳，自动补充的文本" }
            },
            required: ["type", "text"]
          }
        },
        // Refined output
        refined_title: { type: "string", description: "优化后的标题" },
        refined_description: { type: "string", description: "补充的描述信息" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["primary_intent", "intent_confidence", "time_entities", "smart_suggestions", "refined_title"]
    }
  });

  return {
    ...result,
    intentConfig: INTENT_TYPES[result.primary_intent] || INTENT_TYPES.task,
  };
}

export { INTENT_TYPES };