// 搭子空间的页面模块配置：
// 内置板块由 buddy.sections 提供；用户可以在每颗搭子里增减、排序，并加入
// 适合自己场景的专业模块（清单 / 笔记 / 数值追踪）。
// 首页聊天永远第一栏，协同永远第二栏，其余模块由用户安排。

export const MAX_BUDDY_MODULES = 6;

const BUILTIN_ICONS = {
  今日: "sun",
  解题: "lightbulb",
  协同: "users",
  周报: "bar-chart",
  画像: "user-circle",
  行程: "map-pin",
  清单: "list-checks",
  灵感: "sparkles",
  在读: "book-open",
  书架: "library",
  笔记: "sticky-note",
  打卡: "check-circle",
  习惯: "calendar-check",
  课表: "calendar-days",
  记录: "clipboard-list",
  身体: "heart-pulse",
  "装备与知识": "backpack",
  资料: "folder-open",
};

const BUILTIN_RENDER = {
  study: { 解题: "solve", 周报: "weekly" },
  travel: { 清单: "checklist", 灵感: "inspiration" },
  reading: { 书架: "shelf", 笔记: "reading_notes" },
  morning: { 习惯: "habit_chain" },
  running: { 记录: "running_log", 身体: "running_body", "装备与知识": "running_gear" },
};

const MODULE_TYPES = new Set(["checklist", "notes", "tracker"]);

const PRO_TEMPLATES = {
  travel: [
    {
      id: "pro_travel_budget",
      label: "预算",
      type: "tracker",
      icon: "wallet",
      metric: "花费",
      unit: "元",
      aggregate: "sum",
      hint: "交通、住宿、门票和餐饮，随手记一笔",
    },
    {
      id: "pro_travel_docs",
      label: "证件",
      type: "checklist",
      icon: "badge-check",
      items: ["身份证 / 护照", "签证 / 签注", "机票 / 车票", "酒店确认单", "旅行保险"],
      hint: "出发前逐项核对，不再临门翻包",
    },
    {
      id: "pro_travel_booking",
      label: "预订",
      type: "checklist",
      icon: "calendar-check",
      items: ["往返交通", "住宿", "门票 / 预约", "接送机", "餐厅"],
      hint: "把待订和已订的行程收在一处",
    },
    {
      id: "pro_travel_notes",
      label: "旅行手记",
      type: "notes",
      icon: "notebook-pen",
      hint: "路上的细节、好用的小店，留到下次再看",
    },
    {
      id: "pro_travel_weather",
      label: "天气与备选",
      type: "notes",
      icon: "cloud-sun",
      hint: "把天气变化和室内备选方案放在这里",
    },
  ],
  running: [
    {
      id: "pro_running_race",
      label: "比赛计划",
      type: "notes",
      icon: "trophy",
      hint: "比赛日、目标成绩、配速和补给策略",
    },
    {
      id: "pro_running_shoes",
      label: "跑鞋里程",
      type: "tracker",
      icon: "footprints",
      metric: "跑量",
      unit: "km",
      aggregate: "sum",
      hint: "记录每双鞋的累计里程，及时换鞋",
    },
    {
      id: "pro_running_injury",
      label: "伤病记录",
      type: "notes",
      icon: "heart-pulse",
      hint: "疼痛位置、出现时间和恢复情况",
    },
    {
      id: "pro_running_fuel",
      label: "补给方案",
      type: "notes",
      icon: "fuel",
      hint: "长距离前的碳水、途中的水和能量胶",
    },
  ],
  reading: [
    {
      id: "pro_reading_list",
      label: "书单",
      type: "checklist",
      icon: "library",
      items: [],
      hint: "把想读的下一本排进来，一本一本划掉",
    },
    {
      id: "pro_reading_quotes",
      label: "金句",
      type: "notes",
      icon: "bookmark",
      hint: "存下打动你的句子，月底回看",
    },
    {
      id: "pro_reading_stats",
      label: "阅读统计",
      type: "tracker",
      icon: "bar-chart",
      metric: "阅读",
      unit: "分钟",
      aggregate: "sum",
      hint: "每天记一下读了多少分钟，看见积累",
    },
    {
      id: "pro_reading_plan",
      label: "读书计划",
      type: "notes",
      icon: "target",
      hint: "下一阶段读什么、为什么读",
    },
  ],
  study: [
    {
      id: "pro_study_mistakes",
      label: "错题本",
      type: "notes",
      icon: "notebook-pen",
      hint: "按科目记下错因和正确思路",
    },
    {
      id: "pro_study_resources",
      label: "资料库",
      type: "notes",
      icon: "folder-open",
      hint: "常用讲义、链接和复习范围",
    },
    {
      id: "pro_study_mock",
      label: "模考记录",
      type: "tracker",
      icon: "gauge",
      metric: "得分",
      unit: "分",
      aggregate: "latest",
      hint: "记录每次模考的分数和薄弱项",
    },
    {
      id: "pro_study_progress",
      label: "科目进度",
      type: "checklist",
      icon: "list-checks",
      items: [],
      hint: "把各科章节拆成可勾选的小目标",
    },
  ],
  morning: [
    {
      id: "pro_morning_sleep",
      label: "睡眠记录",
      type: "tracker",
      icon: "moon",
      metric: "睡眠",
      unit: "小时",
      aggregate: "avg",
      hint: "记下昨晚睡了几小时，找出起床困难的原因",
    },
    {
      id: "pro_morning_journal",
      label: "晨间日记",
      type: "notes",
      icon: "pen-line",
      hint: "起床后的第一个念头，或今天最重要的一件事",
    },
    {
      id: "pro_morning_challenge",
      label: "早起挑战",
      type: "checklist",
      icon: "target",
      items: ["连续 7 天按目标起床", "睡前 1 小时放下手机", "起床后完成微习惯链"],
      hint: "给自己设一轮小挑战，逐项完成",
    },
  ],
  custom: [
    {
      id: "pro_custom_checklist",
      label: "清单",
      type: "checklist",
      icon: "list-checks",
      items: [],
      hint: "适合证件、装备、待办这类逐项核对的内容",
    },
    {
      id: "pro_custom_notes",
      label: "笔记",
      type: "notes",
      icon: "sticky-note",
      hint: "适合复盘、计划、灵感和参考资料",
    },
    {
      id: "pro_custom_tracker",
      label: "追踪",
      type: "tracker",
      icon: "gauge",
      metric: "数值",
      aggregate: "latest",
      hint: "适合预算、里程、睡眠、得分这类数值记录",
    },
  ],
};

const TYPE_LABELS = {
  chat: "聊天",
  collab: "协同",
  profile: "画像",
  solve: "解题",
  weekly: "周报",
  running_log: "记录",
  running_body: "身体",
  running_gear: "装备与知识",
  inspiration: "灵感",
  shelf: "书架",
  reading_notes: "笔记",
  checklist: "清单",
  habit_chain: "习惯",
  custom_materials: "资料",
  notes: "笔记",
  tracker: "追踪",
  upcoming: "预告",
};

export function moduleTypeLabel(type) {
  return TYPE_LABELS[type] || "模块";
}

export function builtinModuleType(buddy, label, index) {
  if (index === 0) return "chat";
  if (label === "协同") return "collab";
  if (label === "画像") return "profile";
  if (label === "资料") return buddy?.custom ? "custom_materials" : "upcoming";
  return BUILTIN_RENDER[buddy?.id]?.[label] || "upcoming";
}

/** 当前搭子的默认页面（来自 buddy.sections），首页 / 协同固定在前两栏 */
export function getDefaultModules(buddy) {
  const sections = Array.isArray(buddy?.sections) && buddy.sections.length > 0
    ? buddy.sections
    : ["今天"];
  const seen = new Set();
  return sections
    .map((value, index) => {
      const label = String(value || "").trim().slice(0, 12);
      if (!label || seen.has(label)) return null;
      seen.add(label);
      return {
        id: label,
        label,
        type: builtinModuleType(buddy, label, index),
        icon: BUILTIN_ICONS[label] || "circle",
        builtin: true,
        locked: index < 2,
      };
    })
    .filter(Boolean);
}

/** 内置板块 + 该搭子的专业模块目录（不含已经添加的模块，由界面筛选） */
export function moduleCatalogFor(buddy) {
  const defaults = getDefaultModules(buddy);
  const key = buddy?.custom ? "custom" : buddy?.id;
  const templates = PRO_TEMPLATES[key] || [];
  return [
    ...defaults.map((item) => ({ ...item, hint: "" })),
    ...templates.map((item) => ({ ...item, items: Array.isArray(item.items) ? [...item.items] : undefined })),
  ];
}

function safeCustomModule(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = String(entry.id || "").trim().slice(0, 48);
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(id)) return null;
  const type = MODULE_TYPES.has(entry.type) ? entry.type : null;
  if (!type) return null;
  const label = String(entry.label || "").trim().slice(0, 12);
  if (!label) return null;
  const items = Array.isArray(entry.items)
    ? entry.items.map((item) => String(item || "").trim().slice(0, 40)).filter(Boolean).slice(0, 20)
    : undefined;
  return {
    id,
    label,
    type,
    icon: String(entry.icon || "sparkles").slice(0, 24),
    hint: String(entry.hint || "").slice(0, 80),
    unit: String(entry.unit || "").slice(0, 6),
    metric: String(entry.metric || "").slice(0, 8),
    aggregate: ["sum", "avg", "latest"].includes(entry.aggregate) ? entry.aggregate : "latest",
    preset: String(entry.preset || "").slice(0, 40),
    ...(items ? { items } : {}),
    builtin: false,
    locked: false,
  };
}

/**
 * 读取用户保存的布局；旧数据 / 未知模块自动回退。
 * 首页和协同无论用户怎么排都固定在前面，避免两个核心入口被误删。
 */
export function resolveBuddyModules(buddy, profile) {
  if (!buddy) return [];
  const defaults = getDefaultModules(buddy);
  if (defaults.length === 0) return [];
  const saved = Array.isArray(profile?.layout?.modules) ? profile.layout.modules : null;
  if (!saved || saved.length === 0) return defaults;

  const byId = new Map(defaults.map((item) => [item.id, item]));
  const picked = [];
  const seen = new Set();
  for (const entry of saved) {
    const id = typeof entry === "string" ? entry : String(entry?.id || "").trim();
    if (!id || seen.has(id)) continue;
    const builtin = byId.get(id);
    if (builtin) {
      picked.push(builtin);
      seen.add(id);
      continue;
    }
    const custom = safeCustomModule(entry);
    if (custom) {
      picked.push(custom);
      seen.add(id);
    }
  }

  const home = defaults[0];
  const collab = defaults.find((item) => item.type === "collab");
  const result = [];
  if (home) result.push(home);
  if (collab && collab.id !== home?.id) result.push(collab);
  for (const item of picked) {
    if (result.some((existing) => existing.id === item.id)) continue;
    result.push(item);
    if (result.length >= MAX_BUDDY_MODULES) break;
  }
  return result.length > 0 ? result : defaults;
}

/** 只把配置发给服务端；内置模块传 id，专业模块保留轻量定义 */
export function serializeBuddyModules(modules = []) {
  return modules.slice(0, MAX_BUDDY_MODULES).map((item) => {
    if (item?.builtin) return { id: item.id };
    const safe = safeCustomModule(item);
    if (!safe) return null;
    const config = { ...safe };
    delete config.builtin;
    delete config.locked;
    return config;
  }).filter(Boolean);
}

/** 用户新建、暂时收起的模块：保留定义，重新加回时还能接上原来的数据 */
export function archivedModulesFromProfile(profile) {
  const archived = Array.isArray(profile?.layout?.archived) ? profile.layout.archived : [];
  return archived.map(safeCustomModule).filter(Boolean).slice(0, 12);
}

export function serializeArchivedModules(modules = []) {
  return modules.slice(0, 12).map((item) => {
    const safe = safeCustomModule(item);
    if (!safe) return null;
    const config = { ...safe };
    delete config.builtin;
    delete config.locked;
    return config;
  }).filter(Boolean);
}

export function createCustomModule({ label, type, unit = "" } = {}) {
  const cleanLabel = String(label || "").trim().slice(0, 12);
  if (!cleanLabel || !MODULE_TYPES.has(type)) return null;
  return {
    id: `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    label: cleanLabel,
    type,
    icon: type === "checklist" ? "list-checks" : type === "notes" ? "notebook-pen" : "gauge",
    hint: "",
    unit: type === "tracker" ? String(unit || "").trim().slice(0, 6) : "",
    metric: type === "tracker" ? cleanLabel : "",
    aggregate: "latest",
    items: type === "checklist" ? [] : undefined,
    builtin: false,
    locked: false,
  };
}

