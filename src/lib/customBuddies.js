import { BUDDIES, BUDDY_TINTS, DEFAULT_PERSONA, getBuddy } from "./buddies";

// 用户自设计搭子：后端存的是纯 JSON，这里把它适配成和内置搭子一样的运行结构
// （planTitle/planLines 由模板 + 认领答案生成，其余字段直接复用）。

function fillPlan(template, answers = {}) {
  return String(template || "").replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
    const value = String(answers[key] || "").trim().slice(0, 40);
    return value || "待定";
  });
}

export function normalizeCustomBuddy(raw) {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  const name = String(raw.name || "我的搭子").slice(0, 20);
  const tint = Array.isArray(raw.tint) && raw.tint.length === 3 ? raw.tint : BUDDY_TINTS.study;
  const greeting = raw.greeting && typeof raw.greeting === "object" ? raw.greeting : {};
  // 兼容早先保存的自定义搭子：即使配置里还没写「资料」，也补上这个板块
  const sections = Array.isArray(raw.sections) && raw.sections.length > 0
    ? [...raw.sections]
    : ["今天", "协同", "资料", "画像"];
  if (!sections.includes("资料")) {
    const profileIndex = sections.indexOf("画像");
    if (profileIndex >= 0) sections.splice(profileIndex, 0, "资料");
    else sections.push("资料");
  }
  return {
    ...raw,
    name,
    custom: true,
    tint,
    sections,
    defaultPersona: raw.defaultPersona || DEFAULT_PERSONA,
    greeting: {
      gentle: greeting.gentle || "不着急，我们先从最小的一步开始。",
      strict: greeting.strict || "先做最要紧的那一步，做完再调整。",
      buddy: greeting.buddy || "来，今天一起把这件事往前拱一点。",
    },
    actions: Array.isArray(raw.actions) ? raw.actions : [],
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    quickAsks: Array.isArray(raw.quickAsks) ? raw.quickAsks : [],
    planTitle: (answers) => fillPlan(raw.plan?.title, answers) || `${name} · 陪伴计划`,
    planLines: (answers) => {
      const lines = Array.isArray(raw.plan?.lines) ? raw.plan.lines : [];
      return lines.length > 0
        ? lines.map((line) => fillPlan(line, answers))
        : ["先按自己的节奏来，不把计划排满", "每次只推进一个最小动作", "状态不好就降级，不催你"];
    },
  };
}

export function getCustomBuddies(mine) {
  const map = mine?.custom_buddies && typeof mine.custom_buddies === "object" ? mine.custom_buddies : {};
  return Object.values(map).map(normalizeCustomBuddy).filter(Boolean);
}

/** 内置搭子 + 当前用户自己设计的搭子 */
export function getAllBuddies(mine) {
  const builtInIds = new Set(BUDDIES.map((b) => b.id));
  return [...BUDDIES, ...getCustomBuddies(mine).filter((b) => !builtInIds.has(b.id))];
}

export function getBuddyFromMine(buddyId, mine) {
  return getBuddy(buddyId) || getCustomBuddies(mine).find((b) => b.id === buddyId) || null;
}
