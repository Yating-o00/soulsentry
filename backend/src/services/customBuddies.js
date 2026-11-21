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

// 兜底设计也尽量贴着领域本身，而不是套通用自律模板
const KITCHEN_PACK = {
  match: ["厨房", "做菜", "菜谱", "烹饪", "下厨", "饮食", "营养"],
  nameBase: "厨房",
  slogan: "把每一顿饭，做得健康又好吃",
  forWhom: "想吃得健康、又不知道从哪道菜开始的人",
  abilities: [
    "按你的口味、忌口和健康目标，规划一周菜单",
    "根据冰箱现有食材，给出能做的菜和替换方案",
    "分步骤教你做菜：备料、火候、调味和失败补救",
    "帮你看懂菜谱里的关键点，告诉你为什么这么做",
  ],
  actions: [
    "先问清你的厨房条件、口味和健康目标，再给方案",
    "每次只教一道菜，把步骤、用量和时间说清楚",
    "做完帮你复盘哪里可以更好，下次直接调整",
  ],
  questions: [
    { key: "goal", ask: "你最想先改善什么？", chips: ["吃得更健康", "学会做家常菜", "控制油盐", "给家人做饭"], allowInput: true },
    { key: "equipment", ask: "你平时下厨的条件是？", chips: ["只有一口锅", "有燃气灶", "有烤箱/空气炸锅", "时间很紧"], allowInput: true },
    { key: "taste", ask: "口味和忌口是怎样的？", chips: ["清淡少油", "无辣不欢", "不吃某些食材", "没有特别忌口"], allowInput: true },
  ],
  planTitle: "「{goal}」的厨房计划",
  planLines: [
    "先按「{equipment}」的条件，选 3 道能反复做的家常菜",
    "每道菜拆成备料、火候、调味三步，做完再复盘",
    "根据「{taste}」调整口味和食材替换，不硬扛",
  ],
  quickAsks: [
    "冰箱里有鸡蛋和西兰花，能做什么？",
    "今晚想做一道少油的家常菜，教教我",
    "帮我看看这周的饮食搭配是否均衡",
  ],
  memory: "记住你的口味、忌口、厨房条件、常做的菜和每次调整",
  story: "「它说：先把鸡蛋炒到刚凝固盛出来，西兰花最后回锅，口感就不会老。」",
  expertise: "你是用户的「厨房搭子」：擅长家常菜、食材替换、备菜顺序、火候与调味，也能按一般营养原则搭配三餐。指导时先确认厨房条件和口味，再给具体菜谱、用量、步骤和失败补救；不替代医生或注册营养师。",
};

const DOMAIN_ABILITIES = {
  摄影: ["按主题给你拍摄练习和参考样片", "针对你的照片讲构图、光线和后期", "陪你把一次拍摄从构思到选片走完"],
  写作: ["卡住时给你开头和可继续的段落", "帮你调结构、删冗余、保留你的语气", "按你的目标给写作练习和示范"],
  健身: ["按你的水平和器械条件排训练", "讲清动作要领、组数次数和替代动作", "根据恢复情况调整强度，不让你硬撑"],
  理财: ["帮你看清收支结构和可优化的项", "给你记账、预算和存钱的具体方法", "只做一般理财科普，不给投资建议"],
};

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
  const finalActions = actions.length >= 2 ? actions : [
    "先听你说清目标，再一起拆成小步骤",
    "根据你的状态调整节奏，不硬撑",
    "每次做完都帮你记下进展和下一步",
  ];
  // 专业能力是这个搭子区别于通用助手的关键：它到底能替用户交付什么
  const abilities = list(raw.abilities || raw.skills, 5, 90);
  const finalAbilities = abilities.length >= 2 ? abilities : finalActions.slice(0, 3);
  return {
    name,
    slogan: text(raw.slogan, 40) || "陪你把这件想做的事，慢慢做成",
    forWhom: text(raw.forWhom, 100) || text(description, 100) || "想把一件事长期推进的人",
    actions: finalActions,
    abilities: finalAbilities,
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

export function buildCustomBuddyPrompt({ description, feedback = "", current = null, materialContext = "" }) {
  const currentBlock = current
    ? `\n当前已生成的搭子配置（只改用户这次要求的部分，其余保持不变）：\n${JSON.stringify(current).slice(0, 5000)}\n`
    : "";
  const feedbackBlock = feedback ? `\n用户这次的调整要求：${text(feedback, 600)}\n` : "";
  const materialBlock = materialContext
    ? `\n用户给这个搭子准备了以下参考资料（只用来理解这个领域，不要向用户复述原文，也不要编造资料外的事实）：\n${String(materialContext).slice(0, 6000)}\n`
    : "";
  return {
    systemPrompt: `你是心栈 SoulSentry 的搭子设计师。你要把用户的一句自然语言愿望，设计成一颗可长期陪伴的「搭子」，并输出严格 JSON。
设计原则：
- 先判断这个搭子要帮用户完成什么真实任务，再围绕这个领域的真实工作流设计能力。不要套用「每天一点点、状态不好就降级」这类通用自律模板；只有该领域确实需要时，才使用打卡/习惯语言。
- 专业能力（abilities）必须具体到用户能拿到的交付物，而不是陪伴口号。比如厨房搭子要能规划健康菜单、根据现有食材给菜谱、分步骤教做菜（备料、火候、调味、替代食材、失败补救）；摄影搭子要能按主题给练习、讲构图用光、点评作品；写作搭子要能给开头、调结构、陪改稿。至少有一条能力要体现「提供素材/方法/示范」。
- 计划、认领问题、快捷提问都必须由这个领域决定，不能换个名字就复用到别的搭子。
- 如果用户提供了参考资料，提炼资料里的术语、流程、标准和偏好，融进 abilities/expertise/plan/quickAsks；名称仍然用领域名，不要复述文件名。
- 搭子不是万能助手：明确专业方向、陪伴方式和边界，不承诺医疗/法律/投资等专业结论。厨房方向只给一般营养与食品安全建议，不替代医生或营养师。
- 说话像真实的人，温柔、克制、不催促；但涉及专业问题时必须给得出具体步骤、参数或示范。
- 只输出 JSON，不要 markdown、代码块或额外解释。`,
    prompt: `用户想要的搭子：\n「${text(description, 1200)}」\n${currentBlock}${feedbackBlock}${materialBlock}
请输出以下 JSON 结构（所有字段都填中文内容，unless specified）：
{
  "name": "2-8 个字的领域名+搭子，如「厨房搭子」「摄影搭子」，不要用数字或用户原话命名",
  "slogan": "一句主张，≤20 字",
  "forWhom": "适合谁，≤50 字，要具体到场景和困难",
  "abilities": ["3-5 条它真正能交付的专业能力，每条≤45 字；要具体到用户拿到什么（菜单/菜谱/步骤/点评/练习/模板）"],
  "actions": ["3 条具体陪伴动作，每条≤40 字；体现提供素材、示范、陪练或复盘"],
  "memory": "它会记住什么，≤50 字",
  "duration": "关系时长，如「陪你走完 21 天」",
  "story": "一句带画面的样例对话，≤60 字，要展示专业能力而不是空泛鼓励",
  "greeting": {
    "gentle": "温柔人格的开场白，≤40 字",
    "strict": "严格人格的开场白，≤40 字",
    "buddy": "战友人格的开场白，≤40 字"
  },
  "defaultPersona": "gentle|strict|buddy 三选一",
  "questions": [
    { "key": "英文小写 key", "ask": "一句自然的问题，≤30 字，必须影响它给你的具体指导", "chips": ["2-5 个快捷选项"], "allowInput": true }
  ],
  "plan": {
    "title": "计划标题，可包含 {key} 占位符，如「{goal} · 厨房入门」",
    "lines": ["3-4 条该领域真实工作流，可包含 {key} 占位符，不要通用打卡话术"]
  },
  "quickAsks": ["3 个用户会真实问它的问题，要体现专业场景，如「冰箱里有鸡蛋和西兰花，能做什么？」"],
  "expertise": "它的专业身份、擅长的具体知识/方法、会怎么指导用户、明确不做什么，≤220 字"
}
要求：questions 3-5 个；greeting 三种人格都要有；abilities 3-5 条；如果用户只说了很模糊的想法，也要先给出一个最小可用但有专业方向的设计，再通过问题收集必要信息，不要拒绝。`,
  };
}

// AI 不可用时的兜底：仍然生成一颗可用的搭子，用户可以继续调整
export function buildFallbackCustomBuddy(description = "") {
  const cleaned = text(description, 80);
  // 从描述里挑一个领域词做名字，避免把「我想要一个…」整句塞进名称
  const KEYWORDS = ["厨房", "做菜", "菜谱", "烹饪", "摄影", "写作", "健身", "理财", "记账", "画画", "音乐", "英语", "求职", "冥想", "早起", "跑步", "读书", "旅行", "园艺", "手工", "宠物", "穿搭", "沟通", "存钱", "演讲", "学习", "减脂", "喝水", "健康", "睡眠", "作息", "情绪", "副业", "面试", "编程", "瑜伽", "游泳", "骑行"];
  const keyword = KEYWORDS.find((k) => cleaned.includes(k));
  const kitchen = KITCHEN_PACK.match.some((k) => cleaned.includes(k)) ? KITCHEN_PACK : null;
  const domainAbilities = kitchen
    ? kitchen.abilities
    : DOMAIN_ABILITIES[keyword] || null;
  // 描述里直接写了「XX搭子」时截取领域词；「我喝水的健康搭子」这类从句只取最后一个「的」后的核心词
  const namedMatch = cleaned.match(/([\u4e00-\u9fa5]{2,10})搭子/);
  let named = namedMatch?.[1] || "";
  if (named.includes("的")) named = named.split("的").pop();
  named = named.replace(/^(?:我想要?|我要|帮我|陪我|每天|一个|一颗|一款|做个|做一颗)+/, "").trim();
  const base = (kitchen?.nameBase || keyword || named || cleaned.replace(/^我想要?一个?/, "").replace(/[，。,.!?！？；;：:\s].*$/, "").slice(0, 6) || "我的")
    .replace(/搭子$/, "")
    .slice(0, 6);
  const name = `${base || "我的"}搭子`;
  return sanitizeCustomBuddy(
    kitchen
      ? {
          name,
          slogan: kitchen.slogan,
          forWhom: kitchen.forWhom,
          abilities: kitchen.abilities,
          actions: kitchen.actions,
          memory: kitchen.memory,
          duration: "先陪你走完一个厨房周期，再决定要不要继续",
          story: kitchen.story,
          greeting: {
            gentle: "今天想吃什么？先看看冰箱里有什么，我们慢慢来。",
            strict: "先说清今晚的目标和现有食材，我给你一道能落地的菜。",
            buddy: "来，今天一起做一道简单又好吃的，我负责步骤，你负责动手。",
          },
          defaultPersona: "gentle",
          questions: kitchen.questions,
          plan: { title: kitchen.planTitle, lines: kitchen.planLines },
          quickAsks: kitchen.quickAsks,
          expertise: kitchen.expertise,
        }
      : {
          name,
          slogan: "陪你把这件想做的事，慢慢做成",
          forWhom: cleaned || "想把一件事长期推进的人",
          abilities: domainAbilities || undefined,
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
          expertise: domainAbilities
            ? `你是用户的「${name}」：擅长${domainAbilities.join("；")}。指导时先问清条件，再给具体步骤、示范和替代方案；不替代医疗/法律/投资等专业意见。`
            : `你是用户的「${name}」：围绕「${cleaned || "用户的目标"}」提供具体、可执行、不过度承诺的陪伴；不替代医疗/法律/投资等专业意见。`,
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
