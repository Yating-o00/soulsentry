import { invokeKimiText } from "../lib/kimi.js";

// 本地兜底：先尝试从约定标题/描述中提取用户自己写下的动作（按标点/连接词切分），
// 提取不到才退回围绕约定内容的通用三步——绝不输出与约定无关的空泛模板
function buildLocalSteps(task) {
  const clean = (s) => String(s || "").replace(/^[，,、。.;；:：\s]+|[，,、。.;；:：\s]+$/g, "").trim();
  const text = `${task?.title || ""}。${task?.description || ""}`;
  const parts = text
    .split(/[。；;！!？?\n]/)
    .flatMap((seg) => seg.split(/然后|接着|随后|之后|再|并且?|以及|，|,|、/))
    .map(clean)
    .filter((s) => s.length >= 4 && s.length <= 30);
  const unique = [...new Set(parts)].slice(0, 5);
  if (unique.length >= 2) {
    return unique.map((title, i) => ({ title: title.slice(0, 30), minutes: [20, 15, 20, 10, 10][i] || 10 }));
  }
  const t = String(task?.title || "这件事").trim().slice(0, 20);
  return [
    { title: `先理清「${t}」要做的第一步`, minutes: 10 },
    { title: `专注完成「${t}」最核心的部分`, minutes: 25 },
    { title: `检查「${t}」的结果并顺手收尾`, minutes: 10 }
  ];
}

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

  // Kimi 最多尝试 2 次（K2 冷启动/限流时首次容易失败），都失败才走本地兜底
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await Promise.race([
        invokeKimiText({
          prompt: `请先真正理解下面这件约定的内容和意图，再把它拆成一件又一件可以分别完成的小事。

约定标题：${task.title}
约定描述：${task.description || "无"}
分类：${task.category || "未分类"}
优先级：${task.priority || "medium"}

拆分要求：
1. 先理解这件约定到底要达成什么，再围绕"如何达成"来拆，每一步都必须是基于约定内容、具体、可直接执行的动作，禁止使用"准备/计划/梳理思路"这类与约定内容无关的空泛步骤。
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
      console.warn(`[suggestTaskSplit] Kimi 第 ${attempt} 次返回为空或格式异常`);
    } catch (err) {
      console.error(`[suggestTaskSplit] Kimi 第 ${attempt} 次调用失败:`, err?.message || err);
    }
  }

  return { steps: buildLocalSteps(task), source: "local" };
}
