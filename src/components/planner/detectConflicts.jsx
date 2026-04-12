import { base44 } from "@/api/base44Client";

/**
 * Parse a time string like "09:00", "09:00-10:30", "14:00~15:00" into { start, end } in minutes.
 * If only one time, assume 60 min duration.
 */
function parseTimeRange(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(/[-~–]/);
  const toMinutes = (s) => {
    const m = s.trim().match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1]) * 60 + parseInt(m[2]);
  };
  const startMin = toMinutes(parts[0]);
  if (startMin === null) return null;
  const endMin = parts.length > 1 ? toMinutes(parts[1]) : startMin + 60;
  return { start: startMin, end: endMin || startMin + 60 };
}

/**
 * Detect conflicts among timeline blocks.
 * @param {Array} allBlocks - Array of { time, title, description, type }
 * @returns {Array} Array of conflict pairs: [{ blockA, blockB, overlapMinutes }]
 */
export function detectTimeConflicts(allBlocks) {
  if (!allBlocks || allBlocks.length < 2) return [];

  const parsed = allBlocks
    .map((b, idx) => ({ ...b, _idx: idx, _range: parseTimeRange(b.time) }))
    .filter(b => b._range);

  parsed.sort((a, b) => a._range.start - b._range.start);

  const conflicts = [];
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i]._range;
      const b = parsed[j]._range;
      if (b.start < a.end && a.start < b.end) {
        const overlapStart = Math.max(a.start, b.start);
        const overlapEnd = Math.min(a.end, b.end);
        conflicts.push({
          blockA: parsed[i],
          blockB: parsed[j],
          overlapMinutes: overlapEnd - overlapStart,
        });
      }
    }
  }
  return conflicts;
}

/**
 * Use AI to generate resolution suggestions for detected conflicts.
 * @param {Array} conflicts - from detectTimeConflicts
 * @param {string} dateStr - the target date
 * @param {Array} allBlocks - all timeline blocks for context
 * @returns {Promise<object>} AI suggestions
 */
export async function getConflictResolutions(conflicts, dateStr, allBlocks) {
  const conflictDesc = conflicts.map((c, i) =>
    `冲突${i + 1}: 「${c.blockA.title}」(${c.blockA.time}) 与 「${c.blockB.title}」(${c.blockB.time}) 重叠 ${c.overlapMinutes} 分钟`
  ).join('\n');

  const allSchedule = allBlocks.map(b => `${b.time} ${b.title}`).join('\n');

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `你是一个智能日程调度助手。以下是 ${dateStr} 的日程安排中检测到的时间冲突，请提供调配方案。

当日全部日程：
${allSchedule}

检测到的冲突：
${conflictDesc}

请为每个冲突提供1-2个解决方案，可以是：
1. 平移（将其中一个任务移到其他空闲时段）
2. 拆分（将较长任务拆分为多个短时段）
3. 合并（如果两个任务可以合并处理）
4. 优先级建议（如果必须二选一）

对于每个方案，给出具体的新时间安排。`,
    response_json_schema: {
      type: "object",
      properties: {
        resolutions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              conflict_index: { type: "number", description: "冲突编号(从0开始)" },
              block_a_title: { type: "string" },
              block_b_title: { type: "string" },
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    strategy: { type: "string", enum: ["shift", "split", "merge", "priority"] },
                    strategy_label: { type: "string", description: "策略中文名称" },
                    description: { type: "string", description: "具体方案描述" },
                    new_time_a: { type: "string", description: "调整后A的时间" },
                    new_time_b: { type: "string", description: "调整后B的时间" },
                  },
                  required: ["strategy", "strategy_label", "description"]
                }
              }
            },
            required: ["conflict_index", "suggestions"]
          }
        },
        summary: { type: "string", description: "整体调度建议的一句话摘要" }
      },
      required: ["resolutions", "summary"]
    }
  });

  return result;
}