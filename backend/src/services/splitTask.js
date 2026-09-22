import { invokeKimiText } from "../lib/kimi.js";

// Kimi 不可用时的本地兜底：通用三步拆分，保证功能可用
const FALLBACK_STEPS = [
  { title: "梳理完成这件约定最关键的一步", minutes: 15 },
  { title: "准备好需要的资料或物品", minutes: 10 },
  { title: "动手完成最核心的动作", minutes: 30 },
  { title: "检查结果并顺手收尾", minutes: 10 }
];

function pickTitle(s) {
  // K2 在 temperature=1 下输出不稳定，模型偶尔把 title 包成对象（如 {title:{title:"…"}}），逐层解包取字符串
  let t;
  if (s !== null && typeof s === "object") {
    t = s.title;
    let guard = 0;
    while (t !== null && typeof t === "object" && guard < 4) {
      t = t.title ?? t.text ?? t.content ?? t.name ?? t.step ?? Object.values(t)[0];
      guard += 1;
    }
  } else {
    t = s;
  }
  return String(t ?? "").trim();
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return null;
  const cleaned = steps
    .map((s) => {
      const title = pickTitle(s);
      if (!title) return null;
      const minutes = Math.max(5, Math.min(120, parseInt(s?.minutes, 10) || 15));
      return { title: title.slice(0, 30), minutes };
    })
    .filter(Boolean)
    .slice(0, 6);
  return cleaned.length > 0 ? cleaned : null;
}

// 用 AI 真正理解约定的标题与描述，拆成一件又一件可以分别完成的小事
export async function suggestTaskSplit(task) {
  const schema = {
    type: "object",
    properties: {
      steps: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        description: "按执行顺序排列的小事清单",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "小事标题，一句话，≤30字" },
            minutes: { type: "integer", description: "预计耗时（分钟），5-60 之间的整数" }
          },
          required: ["title", "minutes"]
        }
      }
    },
    required: ["steps"]
  };

  try {
    const result = await Promise.race([
      invokeKimiText({
        prompt: `请先真正理解下面这件约定的内容和意图，再把它拆成一件又一件可以分别完成的小事。

约定标题：${task.title}
约定描述：${task.description || "无"}
分类：${task.category || "未分类"}
优先级：${task.priority || "medium"}

拆分要求：
1. 先理解这件约定到底要达成什么，再围绕"如何达成"来拆，不要拆成"准备/计划/整理思路"这类空泛步骤，每一步都必须是具体、可直接执行的动作。
2. 每件小事都能独立完成、一眼就知道怎么做，小到此刻就能上手。
3. 按执行顺序排列，从阻力最小的一步开始。
4. 每件小事一句话，不超过 30 字。
5. 每件小事给一个预计耗时（分钟，5-60 之间的整数）。
6. 拆 2-5 件；如果约定本身已经很小（一句话就能做完），就只拆 1 件，即它本身。
7. 直接返回 JSON 对象，不要输出 markdown、代码块或解释。`,
        systemPrompt: "你是 SoulSentry 的约定拆解师。你擅长把一件约定真正读懂，再拆成一件件可以分别完成的小事。严格返回 JSON。",
        responseJsonSchema: schema,
        temperature: 0.4
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 15000))
    ]);

    const steps = normalizeSteps(result?.steps);
    if (steps) return { steps, source: "ai" };
    console.warn("[suggestTaskSplit] Kimi 返回为空或格式异常，使用本地兜底");
  } catch (err) {
    console.error("[suggestTaskSplit] Kimi split failed, fallback to local", err?.message || err);
  }

  return { steps: FALLBACK_STEPS, source: "fallback" };
}
