import { base44 } from "@/api/base44Client";
import { extractAndCreateTasks } from "@/components/utils/extractAndCreateTasks";

/**
 * 识别一段（可能是社交软件聊天记录的）文本，智能分流：
 *   - 需要再次确认完成的内容（待办/约定/提醒/计划）→ 创建【约定/任务】
 *   - 其余记录/想法/信息/参考资料 → 创建【心签/笔记】
 *
 * @param {string} text - 用户粘贴或输入的原始文本
 * @param {object} [opts]
 * @param {string} [opts.noteColor] - 笔记颜色（默认 blue）
 * @returns {Promise<{ createdCommitments: number, createdNotes: number }>}
 */
export async function processPastedContent(text, opts = {}) {
  const raw = (text || "").trim();
  const noteColor = opts.noteColor || "blue";
  if (!raw) return { createdCommitments: 0, createdNotes: 0 };

  let classification = null;
  try {
    classification = await base44.integrations.Core.InvokeLLM({
      prompt: `用户粘贴了一段内容（可能来自微信/QQ等社交软件的聊天记录）。请识别其中包含的内容条目，并对每一条判断它应归入"约定"还是"心签"。

判定规则（务必严格遵守）：
- 凡是需要用户【再次确认完成】的内容（待办事项、计划、提醒、约定、安排、需要执行或跟进的事），一律归为"约定"(commitment)。
- 其余仅作记录、想法、灵感、愿望、信息收藏、参考资料等无需确认完成的内容，归为"心签"(note)。
- 聊天记录中的寒暄、表情、无意义对话请忽略，不要生成条目。

用户输入:
"""
${raw}
"""

要求：
1. items: 数组，把输入拆成 1~N 个独立有价值的条目。
2. 每条包含 kind("commitment" 或 "note") 和 text（提炼后的清晰表述，去掉聊天前缀如"张三："，保留核心信息与时间）。
3. 不要编造原文中不存在的内容。`,
      response_json_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["commitment", "note"] },
                text: { type: "string" },
              },
              required: ["kind", "text"],
            },
          },
        },
        required: ["items"],
      },
    });
  } catch (e) {
    console.warn("内容分流识别失败，回退到默认处理", e);
  }

  const items = Array.isArray(classification?.items)
    ? classification.items.filter((it) => it?.text?.trim())
    : [];

  let createdCommitments = 0;
  let createdNotes = 0;

  if (items.length > 0) {
    for (const it of items) {
      if (it.kind === "commitment") {
        try {
          const tasks = await extractAndCreateTasks(it.text);
          createdCommitments += tasks.length;
        } catch (err) {
          console.error("约定创建失败", err);
        }
      } else {
        try {
          await base44.entities.Note.create({
            content: `<p>${it.text.replace(/\n/g, "<br/>")}</p>`,
            plain_text: it.text,
            tags: ["随手记"],
            color: noteColor,
            source_type: "manual",
            ai_status: "pending",
          });
          createdNotes += 1;
        } catch (err) {
          console.error("心签创建失败", err);
        }
      }
    }
  }

  return { createdCommitments, createdNotes };
}

/**
 * 判断一段文本是否"看起来像聊天记录"，用于决定是否提示用户使用智能识别。
 * 启发式：包含多行，且出现常见聊天格式（"昵称：内容"、时间戳、多个发言人）。
 */
export function looksLikeChatLog(text) {
  const raw = (text || "").trim();
  if (raw.length < 20) return false;
  const lines = raw.split(/\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  // "某某：xxx" 或 "某某 12:30" 这类聊天前缀
  const speakerLines = lines.filter((l) =>
    /^.{1,20}[：:]\s*\S/.test(l) || /\d{1,2}:\d{2}/.test(l)
  );
  return speakerLines.length >= 2;
}