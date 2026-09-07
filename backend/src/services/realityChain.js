import { invokeKimiText } from "../lib/kimi.js";
import { getUserHabitProfile } from "./habitProfile.js";

const MIN_CONTENT_CHARS = 6;

function pad(n) {
  return String(n).padStart(2, "0");
}

function isDoneStatus(status) {
  return ["completed", "done", "archived", "deleted"].includes(String(status || "").toLowerCase());
}

// 事项链路：创建约定后推导"用户在现实世界里完成这件事"的步骤，作为子约定挂载。
// prompt 移植自海外版 generateRealityChain（严禁产品内动作，输出现实行动）。
export async function maybeGenerateRealityChain(task, userId, prisma) {
  try {
    if (!task?.id || !userId || !prisma) return;
    if (isDoneStatus(task.status)) return;
    if (task.parentTaskId) return; // 只给顶层约定生成

    const content = `${task.title || ""}\n${task.description || ""}`.trim();
    if (content.length < MIN_CONTENT_CHARS) return;

    // 已有子约定则不重复生成
    const childCount = await prisma.task.count({ where: { parentTaskId: task.id } });
    if (childCount > 0) return;

    console.log(`[realityChain] task=${task.id} 开始生成事项链路（${content.length} 字）`);

    const habitProfileText = await getUserHabitProfile(userId, prisma);
    const habitBlock = habitProfileText
      ? `用户习惯参考（可据此安排步骤的先后/时段，不要写进步骤内容）：${habitProfileText}\n`
      : "";

    const now = new Date();
    const ctx = `当前时间: ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const schema = {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              step_name: { type: "string", description: "6-10 个字的动词短语" },
              detail: { type: "string", description: "这一步要做什么" },
              when_hint: { type: "string", description: "何时做，可选" }
            },
            required: ["step_name", "detail"]
          }
        }
      },
      required: ["steps"]
    };

    const result = await Promise.race([
      invokeKimiText({
        prompt: `你是一位生活规划顾问。基于用户的一条约定，推导出用户在现实世界中完成这件事所需的【具体事项链路】。

${ctx}
${habitBlock}约定标题: "${String(task.title || "").slice(0, 80)}"
原始输入: "${content.slice(0, 300)}"

【核心要求】：
- 输出的是【用户需要付诸行动的现实事项】，不是系统/产品内部动作
- ❌ 严禁输出："创建任务"、"同步日历"、"设置提醒"、"发送邮件通知"、"加入清单"等产品内动作
- ✅ 应该输出：联系谁、做什么准备、去哪里、确认什么……等真实世界的行动

【示例】
用户："下周和老王吃饭"
→ steps: [
  {"step_name": "联系老王定时间", "detail": "微信确认下周具体哪天方便", "when_hint": "本周内"},
  {"step_name": "选餐厅并订位", "detail": "考虑老王口味选合适餐厅并提前订位", "when_hint": "确认时间后"},
  {"step_name": "出发前确认", "detail": "当天再次确认并规划路线", "when_hint": "赴约当天"},
  {"step_name": "赴约", "detail": "准时到达，享受聚餐", "when_hint": "约定时间"}
]

【生成规则】：
- 步骤数 3-6 个，视复杂度而定；按逻辑/时间先后排序
- 每步 step_name 用 6-10 个字的动词短语；detail 简要解释；when_hint 可选
- 如果输入过于模糊或只是单步小事（如"今天好累"、"买瓶水"），返回空数组`,
        systemPrompt: "你是 SoulSentry 的事项链路规划师。只输出 JSON 对象 {\"steps\": [...]}。",
        responseJsonSchema: schema,
        temperature: 0.4
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 10000))
    ]);

    const steps = Array.isArray(result?.steps) ? result.steps : [];
    if (steps.length === 0) return;

    for (const s of steps.slice(0, 6)) {
      const stepName = String(s?.step_name || "").trim();
      if (!stepName) continue;
      const parts = [];
      if (s?.detail) parts.push(String(s.detail));
      if (s?.when_hint) parts.push(`⏱ 情境时间：${s.when_hint}`);
      await prisma.task.create({
        data: {
          userId,
          parentTaskId: task.id,
          title: stepName.slice(0, 120),
          description: parts.join("\n"),
          status: "TODO",
          category: task.category || "other",
          tags: ["AI事项链路"],
        }
      });
    }

    console.log(`[realityChain] task=${task.id} 生成 ${Math.min(steps.length, 6)} 条子约定`);
  } catch (err) {
    // AI 失败/超时静默跳过，不影响创建主流程
    console.error(`[realityChain] task=${task?.id} 生成失败:`, err?.message || err);
  }
}
