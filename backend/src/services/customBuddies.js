// 用户自设计搭子：自然语言描述 → AI 生成六要素配置 → 预览调整 → 上架到自己的搭子 Store。
// 配置存在 UserPreference.metadata._extraFields.custom_buddies[id]，不上模板市场，
// 但认领后仍复用同一套搭子空间、项目约定、人格与协同能力。

const CUSTOM_TINTS = [
  ["#e7eff8", "#4f7396", "#355a7b"], // 雾蓝
  ["#e8f0ec", "#507a66", "#35604d"], // 松绿
  ["#efeaf4", "#75628e", "#56456f"], // 灰紫
  ["#e8eef2", "#52717f", "#365562"], // 青灰
  ["#eaf0ea", "#5d7a5a", "#42603f"], // 苔绿
];

const PERSONA_KEYS = ["gentle", "strict", "buddy"];

function tintFor(text) {
  const s = String(text || "搭子");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return CUSTOM_TINTS[hash % CUSTOM_TINTS.length];
}

function text(value, max = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value, maxItems = 5, maxLen = 80) {
  return (Array.isArray(value) ? value : [])
    .map((v) => text(v, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeQuestionKey(key, index) {
  const raw = String(key || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  const safe = raw && /^[a-z]/.test(raw) ? raw.slice(0, 24) : `question_${index + 1}`;
  return safe;
}

export function sanitizeCustomBuddy(raw = {}, { description = "" } = {}) {
  const nameRaw = text(raw.name || raw.title, 20);
  const name = nameRaw
    ? (/搭子$/.test(nameRaw) ? nameRaw : `${nameRaw}搭子`).slice(0, 12)
    : `${text(description, 8) || "我的"}搭子`;
  const defaultPersona = PERSONA_KEYS.includes(raw.defaultPersona) ? raw.defaultPersona : "gentle";
  const greeting = raw.greeting && typeof raw.greeting === "object" ? raw.greeting : {};
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((q, i) => {
      if (!q || typeof q !== "object") return null;
      const ask = text(q.ask || q.question, 60);
      if (!ask) return null;
      return {
        key: normalizeQuestionKey(q.key, i),
        ask,
        chips: list(q.chips, 5, 20),
        allowInput: q.allowInput !== false,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
  while (questions.length < 3) {
    const index = questions.length;
    questions.push({
      key: `focus_${index + 1}`,
      ask: ["你最想先解决什么？", "你希望它怎么陪你？", "一周大概能投入多少时间？"][index],
      chips: ["先试试", "慢慢来", "认真推进"],
      allowInput: true,
    });
  }
  const plan = raw.plan && typeof raw.plan === "object" ? raw.plan : {};
  const planTitle = text(plan.title || raw.planTitle, 80) || "「{goal}」陪伴计划";
  let planLines = list(plan.lines || raw.planLines, 5, 120);
  if (planLines.length === 0) {
    planLines = ["先按「{time}」的节奏来，不把计划排满", "每次只推进一个最小动作，做完就算数", "状态不好就降级，不催你"];
  }
  const actions = list(raw.actions, 4, 90);
  return {
    name,
    slogan: text(raw.slogan, 40) || "陪你把这件想做的事，慢慢做成",
    forWhom: text(raw.forWhom, 100) || text(description, 100) || "想把一件事长期推进的人",
    actions: actions.length >= 2 ? actions : [
      "先听你说清目标，再一起拆成小步骤",
      "根据你的状态调整节奏，不硬撑",
      "每次做完都帮你记下进展和下一步",
    ],
    memory: text(raw.memory, 100) || "记住你的目标、偏好、卡点和每次进展",
    duration: text(raw.duration, 40) || "一个项目周期，走完再决定要不要继续",
    story: text(raw.story, 100) || "「它说：今天只做一点点也算数，我们把下一步放小。」",
    greeting: {
      gentle: text(greeting.gentle, 100) || "不着急，我们先从最小的一步开始。",
      strict: text(greeting.strict, 100) || "今天的目标已经清楚了，先做最要紧的那一步。",
      buddy: text(greeting.buddy, 100) || "来，今天我们一起把这件事往前拱一点。",
    },
    defaultPersona,
    questions,
    plan: {
      title: planTitle,
      lines: planLines,
    },
    quickAsks: list(raw.quickAsks, 4, 40),
    expertise: text(raw.expertise, 300) || `你是用户的「${name}」：围绕「${text(description, 60) || "用户的目标"}」提供具体、可执行、不过度承诺的陪伴。`,
    sections: ["今天", "协同", "资料", "画像"],
    tint: tintFor(name + description),
    template: "generic",
    custom: true,
    description: text(description, 500),
  };
}

export function buildCustomBuddyPrompt({ description, feedback = "", current = null }) {
  const currentBlock = current
    ? `\n当前已生成的搭子配置（只改用户这次要求的部分，其余保持不变）：\n${JSON.stringify(current).slice(0, 5000)}\n`
    : "";
  const feedbackBlock = feedback ? `\n用户这次的调整要求：${text(feedback, 600)}\n` : "";
  return {
    systemPrompt: `你是心栈 SoulSentry 的搭子设计师。你要把用户的一句自然语言愿望，设计成一颗可长期陪伴的「搭子」，并输出严格 JSON。
设计原则：
- 搭子不是万能助手：明确一个专业方向、一个陪伴方式和清晰的边界，不承诺医疗/法律/投资等专业结论。
- 说话像真实的人，温柔、克制、不催促；先接住用户，再给一个最小可执行动作。
- 六个要素必须具体：名称、主张、适合谁、陪伴动作、记忆范围、关系时长；不要空泛口号。
- 设计 3-5 个认领问题，问题要能真正影响后续陪伴；key 用小写英文（goal/time/level/style 等），后续计划模板用 {key} 引用答案。
- 只输出 JSON，不要 markdown、代码块或额外解释。`,
    prompt: `用户想要的搭子：\n「${text(description, 1200)}」\n${currentBlock}${feedbackBlock}
请输出以下 JSON 结构（所有字段都填中文内容，unless specified）：
{
  "name": "2-10 个字的搭子名称，以「搭子」结尾",
  "slogan": "一句主张，≤20 字",
  "forWhom": "适合谁，≤50 字",
  "actions": ["3 条具体陪伴动作，每条≤40 字"],
  "memory": "它会记住什么，≤50 字",
  "duration": "关系时长，如「陪你走完 21 天」",
  "story": "一句带画面的样例对话，≤60 字",
  "greeting": {
    "gentle": "温柔人格的开场白，≤40 字",
    "strict": "严格人格的开场白，≤40 字",
    "buddy": "战友人格的开场白，≤40 字"
  },
  "defaultPersona": "gentle|strict|buddy 三选一",
  "questions": [
    { "key": "英文小写 key", "ask": "一句自然的问题，≤30 字", "chips": ["2-5 个快捷选项"], "allowInput": true }
  ],
  "plan": {
    "title": "计划标题，可包含 {key} 占位符，如「{goal} · 21 天陪伴」",
    "lines": ["3-4 条计划说明，可包含 {key} 占位符"]
  },
  "quickAsks": ["3 个用户可以直接问它的问题"],
  "expertise": "它的专业身份、擅长什么、明确不做什么，≤150 字"
}
要求：questions 3-5 个；greeting 三种人格都要有；如果用户只说了很模糊的想法，也要给出一个最小可用的方向，并在 problems 中只通过问题收集必要信息，不要拒绝。`,
  };
}

// AI 不可用时的兜底：仍然生成一颗可用的搭子，用户可以继续调整
export function buildFallbackCustomBuddy(description = "") {
  const cleaned = text(description, 80);
  // 从描述里挑一个领域词做名字，避免把「我想要一个…」整句塞进名称
  const KEYWORDS = ["摄影", "写作", "健身", "理财", "记账", "画画", "音乐", "英语", "求职", "冥想", "早起", "跑步", "读书", "旅行", "烹饪", "园艺", "手工", "宠物", "穿搭", "沟通", "存钱", "演讲", "学习", "减脂", "喝水", "健康", "睡眠", "作息", "情绪", "副业", "面试", "编程", "瑜伽", "游泳", "骑行"];
  const keyword = KEYWORDS.find((k) => cleaned.includes(k));
  // 描述里直接写了「XX搭子」时截取领域词；「我喝水的健康搭子」这类从句只取最后一个「的」后的核心词
  const namedMatch = cleaned.match(/([\u4e00-\u9fa5]{2,10})搭子/);
  let named = namedMatch?.[1] || "";
  if (named.includes("的")) named = named.split("的").pop();
  named = named.replace(/^(?:我想要?|我要|帮我|陪我|每天|一个|一颗|一款|做个|做一颗)+/, "").trim();
  const base = (keyword || named || cleaned.replace(/^我想要?一个?/, "").replace(/[，。,.!?！？；;：:\s].*$/, "").slice(0, 6) || "我的")
    .replace(/搭子$/, "")
    .slice(0, 6);
  const name = `${base || "我的"}搭子`;
  return sanitizeCustomBuddy(
    {
      name,
      slogan: "陪你把这件想做的事，慢慢做成",
      forWhom: cleaned || "想把一件事长期推进的人",
      actions: [
        "先听你说清目标，再一起拆成小步骤",
        "根据你的状态调整节奏，不硬撑",
        "每次做完都帮你记下进展和下一步",
      ],
      memory: "记住你的目标、偏好、卡点和每次进展",
      duration: "一个项目周期，走完再决定要不要继续",
      story: "「它说：今天只做一点点也算数，我们把下一步放小。」",
      greeting: {
        gentle: "不着急，我们先从最小的一步开始。",
        strict: "先做最要紧的那一步，做完再调整。",
        buddy: "来，今天一起把这件事往前拱一点。",
      },
      defaultPersona: "gentle",
      questions: [
        { key: "goal", ask: "你最想先实现什么？", chips: ["先试试", "养成习惯", "做出成果"], allowInput: true },
        { key: "time", ask: "一周大概能投入多少时间？", chips: ["每天 10 分钟", "每周 2-3 次", "周末集中"], allowInput: true },
        { key: "style", ask: "你希望它怎么陪你？", chips: ["温柔提醒", "严格推进", "并肩一起做"], allowInput: true },
      ],
      plan: {
        title: "「{goal}」陪伴计划",
        lines: [
          "按「{time}」的节奏来，不把计划排满",
          "每次只推进一个最小动作，做完就算数",
          "状态不好就降级，不催你",
        ],
      },
      quickAsks: ["我该从哪一步开始？", "今天状态不好怎么办？", "帮我看看这周的进展"],
      expertise: `你是用户的「${name}」：围绕「${cleaned || "用户的目标"}」提供具体、可执行、不过度承诺的陪伴；不替代医疗/法律/投资等专业意见。`,
    },
    { description }
  );
}

export function getCustomBuddies(extra = {}) {
  const map = extra && typeof extra.custom_buddies === "object" ? extra.custom_buddies : {};
  return Object.values(map).filter((item) => item && typeof item === "object" && item.id);
}

export function getCustomBuddy(extra = {}, buddyId) {
  const map = extra && typeof extra.custom_buddies === "object" ? extra.custom_buddies : {};
  return map[buddyId] || null;
}

export function isKnownBuddyId(staticIds, extra, buddyId) {
  return staticIds.has(buddyId) || Boolean(getCustomBuddy(extra, buddyId));
}
