// 跑步搭子领域引擎：目标 → 周期化周课表 → 动态调整 → 记录统计 / 能力画像。
// 规则先行：周跑量增幅 ≤10%、每第 4 周减量、缺跑不补课、疼痛先停跑；
// LLM 只负责对话、截图识别与复盘文案，不直接生成可能冒进的跑量。

const DAY_MS = 86400000;
const BJ_OFFSET = 8 * 3600000;
const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export const RUNNING_KNOWLEDGE = [
  {
    id: "form",
    tag: "跑姿",
    title: "步频优先，别跨大步",
    summary: "步频提到 170-180，脚落在身体重心下方，膝盖压力会小很多。",
    body: "刻意跨大步会让脚跟着地、膝盖承受更大冲击。先试着把步频提高 5-10 步/分钟，步子自然变小；身体微微前倾，脚掌在重心正下方落地。别追求「跑得好看」，先追求跑完不疼。",
  },
  {
    id: "warmup",
    tag: "热身",
    title: "跑前动态热身 5 分钟",
    summary: "高抬腿、后踢腿、弓步走，把关节活动开再起跑。",
    body: "静态拉伸放在跑后。跑前做 5 分钟动态热身：高抬腿 30 秒、后踢腿 30 秒、弓步走 10 步、踝关节绕环各 10 次。天冷时多热身 2 分钟，前 1 公里放慢当热身。",
  },
  {
    id: "stretch",
    tag: "恢复",
    title: "跑后拉伸与放松",
    summary: "小腿、股四头肌、臀肌各 30 秒，呼吸慢下来。",
    body: "跑完别立刻坐下。慢走 3-5 分钟让心率降下来，再做小腿、股四头肌、臀肌和髋屈肌的静态拉伸，每侧 30 秒。当晚睡够 7 小时，比任何补剂都管用。",
  },
  {
    id: "fuel",
    tag: "补给",
    title: "10 公里以内，水就够了",
    summary: "跑前 1-2 小时吃点易消化碳水，短距离不需要能量胶。",
    body: "晨跑前可以吃半根香蕉或一片面包；空腹跑容易低血糖。10 公里以内正常补水即可。半马/全马的长距离训练才需要规划能量胶和电解质，提前在训练中试，别在比赛日尝新。",
  },
  {
    id: "pain",
    tag: "伤痛",
    title: "疼了先停，不要硬扛",
    summary: "膝盖、胫骨、足底出现持续疼痛，先停跑 48-72 小时。",
    body: "跑步的疼痛分「酸」和「痛」：肌肉酸胀可以降强度，关节刺痛、按压痛、走路也痛就必须停跑。停跑期间做游泳、骑行、椭圆机等零冲击交叉训练，并记录疼痛位置和变化。持续一周不缓解，去看运动医学科。",
  },
  {
    id: "shoe",
    tag: "装备",
    title: "跑鞋 600-800 公里就该换",
    summary: "中底缓震会衰减，鞋面看着新也可能已经「退休」。",
    body: "给每双跑鞋记里程，累计 600 公里开始留意，800 公里建议更换。两双鞋轮换穿能延长寿命，也让脚部肌肉适应不同支撑。比赛不要穿全新未磨合的鞋。",
  },
];

export const RUNNING_GOALS = {
  fat_loss: {
    key: "fat_loss",
    label: "健康减脂",
    weeks: 8,
    baseKm: 8,
    peakKm: 18,
    longShare: 0.46,
    maxLongKm: 10,
    easyPace: 450,
    targetPace: null,
    note: "以轻松跑和跑走结合为主，先把「每周动起来」变成习惯。",
  },
  first_5k: {
    key: "first_5k",
    label: "首个 5K",
    weeks: 8,
    baseKm: 9,
    peakKm: 18,
    longShare: 0.45,
    maxLongKm: 8,
    easyPace: 440,
    targetPace: null,
    note: "8 周从跑走结合过渡到连续跑完 5 公里。",
  },
  ten_k: {
    key: "ten_k",
    label: "10K 进 50 分钟",
    weeks: 10,
    baseKm: 16,
    peakKm: 32,
    longShare: 0.45,
    maxLongKm: 14,
    easyPace: 390,
    targetPace: 300,
    note: "在耐力基础上加入节奏跑，目标配速 5'00\"。",
  },
  half: {
    key: "half",
    label: "半马完赛",
    weeks: 12,
    baseKm: 24,
    peakKm: 44,
    longShare: 0.48,
    maxLongKm: 18,
    easyPace: 380,
    targetPace: 335,
    note: "12 周长距离渐进到 14-16 公里，比赛周减量；先跑的稳，再谈配速。",
  },
  full: {
    key: "full",
    label: "全马破四",
    weeks: 16,
    baseKm: 32,
    peakKm: 64,
    longShare: 0.52,
    maxLongKm: 28,
    easyPace: 370,
    targetPace: 340,
    note: "16 周周期化训练，长距离峰值 22-24 公里；零基础请先跑半马周期。",
  },
};

const LEVELS = {
  never: { key: "never", label: "几乎不跑", paceAdj: 50, kmFactor: 0.6 },
  short: { key: "short", label: "能连续跑 15 分钟", paceAdj: 25, kmFactor: 0.8 },
  medium: { key: "medium", label: "能连续跑 30 分钟", paceAdj: 0, kmFactor: 1 },
  long: { key: "long", label: "10 公里没问题", paceAdj: -15, kmFactor: 1.2 },
};

const FREQUENCY_DAYS = {
  2: [1, 5],
  3: [0, 2, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
};

const SESSION_META = {
  easy: { title: "轻松跑", intensity: "轻松", detail: "能说完整句子，心率保持在轻松区；跑完不喘。" },
  walk_run: { title: "跑走结合", intensity: "轻松", detail: "跑 3 分钟 + 走 2 分钟，循环 4-5 组，先把时间跑满。" },
  interval: { title: "间歇跑", intensity: "吃力", detail: "热身后 6×400 米快跑，组间慢走 90 秒；最后慢跑放松。" },
  tempo: { title: "节奏跑", intensity: "适中", detail: "先轻松跑 10 分钟，再以略吃力但能撑住的配速跑 10-15 分钟。" },
  long: { title: "长距离", intensity: "适中", detail: "全程比轻松跑再慢 10-20 秒；跑完还有余力，才算跑对。" },
  strength: { title: "力量与核心", intensity: "适中", detail: "深蹲 / 臀桥 / 平板支撑各 2 组，重点练臀腿和核心。" },
  rest: { title: "休息", intensity: "恢复", detail: "散步 15 分钟 + 拉伸；睡够比多跑更重要。" },
};

/* ---------- 日期工具（北京时间） ---------- */

export function todayKeyBJ(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * DAY_MS + BJ_OFFSET);
  return d.toISOString().slice(0, 10);
}

export function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayIndex(key) {
  const d = new Date(`${key}T00:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

export function startOfWeek(key) {
  return addDays(key, -weekdayIndex(key));
}

export function diffDays(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

export function weekdayLabel(key) {
  return WEEK_LABELS[weekdayIndex(key)] || "";
}

function isoToBeijingDateKey(iso) {
  if (!iso) return todayKeyBJ();
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return todayKeyBJ();
  return new Date(t.getTime() + BJ_OFFSET).toISOString().slice(0, 10);
}

/* ---------- 建档解析 ---------- */

export function parseGoalKey(goal) {
  const g = String(goal || "");
  if (g.includes("减脂")) return "fat_loss";
  if (g.includes("全马")) return "full";
  if (g.includes("半马")) return "half";
  if (g.includes("10K") || g.includes("10k") || g.includes("10 公里")) return "ten_k";
  if (g.includes("5K") || g.includes("5k") || g.includes("5 公里")) return "first_5k";
  return "first_5k";
}

export function parseLevelKey(level) {
  const v = String(level || "");
  if (v.includes("几乎不跑") || v.includes("不跑")) return "never";
  if (v.includes("15")) return "short";
  if (v.includes("10 公里") || v.includes("1 小时") || v.includes("一小时")) return "long";
  return "medium";
}

export function parseDays(days) {
  const match = String(days || "").match(/(\d)\s*天/);
  const n = match ? Number(match[1]) : 3;
  return Math.min(5, Math.max(2, n));
}

export function parseBodyAnswer(body) {
  const nums = (String(body || "").match(/\d+(?:\.\d+)?/g) || []).map(Number);
  return {
    age: nums[0] && nums[0] < 100 ? nums[0] : null,
    weight: nums[1] && nums[1] >= 30 && nums[1] < 250 ? nums[1] : null,
    restingHr: nums[2] && nums[2] >= 30 && nums[2] < 150 ? nums[2] : null,
  };
}

export function buildRunnerProfile(answers = {}) {
  const goal = RUNNING_GOALS[parseGoalKey(answers.goal)];
  const level = LEVELS[parseLevelKey(answers.level)];
  const daysPerWeek = parseDays(answers.days);
  const injuryText = String(answers.injury || "").trim();
  const hasInjury = !!injuryText && !/没有|无伤|暂无|无/.test(injuryText);
  const easyPace = Math.max(330, Math.round(goal.easyPace + level.paceAdj));
  const body = parseBodyAnswer(answers.body);
  let goalNote = goal.note;
  if (goal.key === "full" && ["never", "short"].includes(level.key)) {
    goalNote = "全马对当前基础偏激进：前 4 周先建立连续跑和长距离，恢复吃力就先改半马。";
  } else if (goal.key === "half" && level.key === "never") {
    goalNote = "半马前先建立连续跑习惯：前 4 周以跑走结合为主，长距离慢慢来。";
  }
  return {
    goalKey: goal.key,
    goalLabel: goal.label,
    goalNote,
    weeks: goal.weeks,
    targetPace: goal.targetPace,
    baseKm: Math.max(5, Math.round(goal.baseKm * level.kmFactor * 10) / 10),
    peakKm: Math.max(10, Math.round(goal.peakKm * level.kmFactor)),
    easyPace,
    longShare: goal.longShare,
    maxLongKm: goal.maxLongKm,
    levelKey: level.key,
    levelLabel: level.label,
    daysPerWeek,
    preferredTime: String(answers.time || "晨跑"),
    preferredClock: { 晨跑: "07:00", 夜跑: "19:30", 午休: "12:30", 不固定: null }[answers.time] || "07:00",
    injuryText: hasInjury ? injuryText.slice(0, 24) : "",
    body,
    devices: String(answers.device || "手机 App"),
    terrain: String(answers.terrain || "操场/公园"),
  };
}

/* ---------- 课表生成 ---------- */

export function formatPace(secondsPerKm) {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm)) return "—";
  const total = Math.round(secondsPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, "0")}"`;
}

export function formatDuration(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (m < 60) return `${m} 分钟`;
  return `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分` : ""}`;
}

function weeklyVolume(profile, weekIndex) {
  let km = profile.baseKm;
  for (let i = 1; i <= weekIndex; i++) {
    km = Math.min(profile.peakKm, km * 1.08);
    if (i % 4 === 3) km *= 0.78;
  }
  return Math.max(4, km);
}

function sessionTypes(profile) {
  const beginner = profile.levelKey === "never" || profile.levelKey === "short";
  const ease = profile.goalKey === "fat_loss" || profile.goalKey === "first_5k";
  const easyOrWalk = beginner ? "walk_run" : "easy";
  switch (profile.daysPerWeek) {
    case 2:
      return ["easy", "long"];
    case 3:
      return ["easy", beginner || ease ? "strength" : "interval", "long"];
    case 4:
      return beginner || ease ? ["easy", easyOrWalk, "long", "strength"] : ["easy", "interval", "tempo", "long"];
    default:
      return beginner || ease
        ? ["easy", easyOrWalk, "strength", "long", "easy"]
        : ["easy", "interval", "tempo", "long", "easy"];
  }
}

function allocateKm(profile, types, totalKm) {
  const runTypes = types.filter((t) => t !== "strength");
  const longKm = Math.min(
    profile.maxLongKm,
    Math.max(3, Math.round(totalKm * profile.longShare * 2) / 2)
  );
  const others = runTypes.filter((t) => t !== "long");
  const weights = { easy: 1, walk_run: 0.8, interval: 0.75, tempo: 0.9 };
  const weightSum = others.reduce((sum, t) => sum + (weights[t] || 1), 0) || 1;
  const remaining = Math.max(2 * others.length, totalKm - longKm);
  const out = {};
  for (const t of others) {
    out[t] = Math.max(2, Math.round(((remaining * (weights[t] || 1)) / weightSum) * 2) / 2);
  }
  out.long = longKm;
  return out;
}

export function buildWeekSchedule(profile, weekStart, weekIndex, { gentle = false } = {}) {
  const types = sessionTypes(profile);
  const indexes = FREQUENCY_DAYS[profile.daysPerWeek] || FREQUENCY_DAYS[3];
  const totalKm = weeklyVolume(profile, weekIndex) * (gentle ? 0.8 : 1);
  const kmByType = allocateKm(profile, types, totalKm);
  const schedule = {};
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    schedule[date] = {
      date,
      weekday: WEEK_LABELS[i],
      type: "rest",
      title: SESSION_META.rest.title,
      detail: SESSION_META.rest.detail,
      km: 0,
      duration_min: 0,
      pace: null,
      intensity: "恢复",
      clock: null,
      planned: false,
    };
  }
  types.forEach((type, i) => {
    const dayIdx = indexes[i];
    if (dayIdx == null) return;
    const date = addDays(weekStart, dayIdx);
    const meta = SESSION_META[type] || SESSION_META.easy;
    const km = type === "strength" ? 0 : kmByType[type] || 0;
    const paceMultiplier = type === "long" ? 1.04 : type === "interval" || type === "tempo" ? 0.92 : 1;
    const pace = km > 0 ? Math.round(profile.easyPace * paceMultiplier) : null;
    schedule[date] = {
      date,
      weekday: WEEK_LABELS[dayIdx],
      type,
      title: meta.title,
      detail: meta.detail,
      km,
      duration_min: type === "strength" ? 20 : pace ? Math.round((km * pace) / 60) : 0,
      pace,
      intensity: meta.intensity,
      clock: profile.preferredClock,
      planned: true,
    };
  });
  return schedule;
}

export function restSession(date, detail = SESSION_META.rest.detail) {
  return {
    date,
    weekday: weekdayLabel(date),
    type: "rest",
    title: SESSION_META.rest.title,
    detail,
    km: 0,
    duration_min: 0,
    pace: null,
    intensity: "恢复",
    clock: null,
    planned: false,
    override: true,
  };
}

export function applyOverrides(schedule, overrides) {
  if (!overrides || typeof overrides !== "object") return schedule;
  const out = { ...schedule };
  for (const [date, ov] of Object.entries(overrides)) {
    if (!out[date] || !ov || typeof ov !== "object") continue;
    if (ov.type === "rest") {
      // 休息覆盖只认 detail：不继承同一日期上一次覆盖的标题/跑量，避免多个调整叠加
      out[date] = { ...restSession(date, ov.detail), override: true };
      continue;
    }
    out[date] = { ...out[date], ...ov, date, weekday: out[date].weekday, override: true };
  }
  return out;
}

export function getRunningStatus(answers, profile, state = {}) {
  const today = todayKeyBJ();
  const claimKey = profile?.claimed_at ? isoToBeijingDateKey(profile.claimed_at) : today;
  const planStart = state.plan_start || startOfWeek(claimKey);
  const runner = buildRunnerProfile(answers);
  const weekStart = startOfWeek(today);
  const rawWeekIndex = Math.floor(diffDays(planStart, weekStart) / 7);
  const weekIndex = Math.max(0, Math.min(runner.weeks - 1, rawWeekIndex));
  const gentle = state.week_adjust?.week_stamp === weekStart;
  const baseSchedule = buildWeekSchedule(runner, weekStart, weekIndex, { gentle });
  const withOverrides = applyOverrides(baseSchedule, state.plan_overrides);
  // 伤病跟踪期间先不排跑步课：恢复后点「标记已恢复」，课表自动回来
  const injuryHold = (Array.isArray(state.injuries) ? state.injuries : []).some((i) => i?.status !== "recovered");
  // 认领当天之前的日子不算缺勤：计划从认领日开始，避免「刚开启就显示两次没跑」
  const schedule = {};
  for (const [date, s] of Object.entries(withOverrides)) {
    if (date < claimKey) {
      schedule[date] = {
        ...restSession(date, "计划从认领当天开始，之前的日子不算缺勤。"),
        title: "开始前",
        beforeStart: true,
      };
    } else if (injuryHold && s.planned) {
      schedule[date] = {
        ...restSession(date, "伤病跟踪中，先不跑步：游泳 / 骑行 / 椭圆机 30 分钟，疼痛加重立即停。恢复后在「身体」里标记已恢复，课表会自动回来。"),
        title: "伤病恢复",
        injuryHold: true,
      };
    } else {
      schedule[date] = s;
    }
  }
  const runDays = Object.values(schedule).filter((s) => s.planned);
  const logs = Array.isArray(state.logs) ? state.logs : [];
  const doneDays = runDays.filter((s) => logs.some((l) => l?.date === s.date));
  const plannedKm = runDays.reduce((sum, s) => sum + (Number(s.km) || 0), 0);
  const doneKm = logs
    .filter((l) => runDays.some((s) => s.date === l?.date))
    .reduce((sum, l) => sum + (Number(l.distance_km) || 0), 0);
  const todaySession = schedule[today] || restSession(today);
  const logsToday = (state.logs || []).filter((l) => l?.date === today);
  const missed = runDays.filter(
    (s) => s.date < today && !(state.logs || []).some((l) => l?.date === s.date)
  );
  return {
    today,
    weekStart,
    weekIndex,
    rawWeekIndex,
    totalWeeks: runner.weeks,
    planStart,
    firstDay: claimKey,
    injuryHold,
    finished: rawWeekIndex >= runner.weeks,
    runner,
    schedule,
    todaySession,
    runDays,
    doneDays,
    plannedKm,
    doneKm,
    logsToday,
    missed,
    gentle,
  };
}

/* ---------- 记录与统计 ---------- */

export function logWeekStart(log) {
  return startOfWeek(log?.date || todayKeyBJ());
}

export function computeRunningStats(state = {}) {
  const logs = Array.isArray(state.logs) ? [...state.logs].sort((a, b) => String(b.date).localeCompare(String(a.date))) : [];
  const totalKm = logs.reduce((sum, l) => sum + (Number(l.distance_km) || 0), 0);
  const longest = logs.reduce((max, l) => Math.max(max, Number(l.distance_km) || 0), 0);
  const paced = logs.filter((l) => Number(l.distance_km) >= 3 && Number(l.duration_min) > 0);
  const bestPace = paced.length
    ? Math.min(...paced.map((l) => (Number(l.duration_min) * 60) / Number(l.distance_km)))
    : null;
  const thisWeek = startOfWeek(todayKeyBJ());
  const thisWeekKm = logs
    .filter((l) => logWeekStart(l) === thisWeek)
    .reduce((sum, l) => sum + (Number(l.distance_km) || 0), 0);
  const thisMonth = todayKeyBJ().slice(0, 7);
  const thisMonthKm = logs
    .filter((l) => String(l.date || "").slice(0, 7) === thisMonth)
    .reduce((sum, l) => sum + (Number(l.distance_km) || 0), 0);
  const weeksWithRun = new Set(logs.map(logWeekStart));
  let streakWeeks = 0;
  let cursor = thisWeek;
  if (!weeksWithRun.has(cursor)) cursor = addDays(cursor, -7);
  while (weeksWithRun.has(cursor)) {
    streakWeeks++;
    cursor = addDays(cursor, -7);
  }
  const recent = logs.slice(0, 7);
  const avgRpe = recent.length
    ? recent.reduce((sum, l) => sum + (Number(l.rpe) || 3), 0) / recent.length
    : null;
  return {
    logs,
    totalKm,
    totalRuns: logs.length,
    longest,
    bestPace,
    thisWeekKm,
    thisMonthKm,
    streakWeeks,
    avgRpe,
    lastLog: logs[0] || null,
  };
}

export function weeklyKmSeries(state, weeks = 8) {
  const thisWeek = startOfWeek(todayKeyBJ());
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDays(thisWeek, -7 * i);
    const km = (state.logs || [])
      .filter((l) => logWeekStart(l) === weekStart)
      .reduce((sum, l) => sum + (Number(l.distance_km) || 0), 0);
    buckets.push({ weekStart, km: Math.round(km * 10) / 10, label: weekStart.slice(5).replace("-", "/") });
  }
  return buckets;
}

// 实际完成率：从开跑到今天，所有「已到期」的跑步课里完成了多少
export function computeConsistency(state, runner, status) {
  let planned = 0;
  let done = 0;
  const today = todayKeyBJ();
  for (let w = 0; w <= status.weekIndex; w++) {
    const weekStart = addDays(status.planStart, w * 7);
    const schedule = buildWeekSchedule(runner, weekStart, w);
    for (const s of Object.values(schedule)) {
      if (!s.planned || s.date > today || s.date < status.firstDay) continue;
      planned++;
      if ((state.logs || []).some((l) => l?.date === s.date)) done++;
    }
  }
  return { planned, done, pct: planned ? Math.round((done / planned) * 100) : 0 };
}

export function lastWeekSummary(state, runner, status) {
  const lastWeekStart = addDays(status.weekStart, -7);
  if (diffDays(status.planStart, lastWeekStart) < 0) return null;
  const weekIndex = Math.floor(diffDays(status.planStart, lastWeekStart) / 7);
  const schedule = buildWeekSchedule(runner, lastWeekStart, weekIndex);
  const planned = Object.values(schedule).filter((s) => s.planned && s.date >= status.firstDay);
  const done = planned.filter((s) => (state.logs || []).some((l) => l?.date === s.date));
  return { planned: planned.length, done: done.length, allDone: planned.length > 0 && planned.length === done.length };
}

export function activeInjuries(state = {}) {
  return (state.injuries || []).filter((i) => i?.status !== "recovered");
}

export function latestBody(state = {}) {
  const list = Array.isArray(state.body) ? [...state.body].sort((a, b) => String(b.date).localeCompare(String(a.date))) : [];
  return list[0] || null;
}

export function getAbilityProfile(state, runner, status, consistency) {
  const stats = computeRunningStats(state);
  const injuries = activeInjuries(state);
  const body = latestBody(state);
  const endurance = Math.min(100, Math.round(12 + stats.totalKm * 1.1 + stats.longest * 2));
  const speed = stats.bestPace
    ? Math.min(100, Math.max(10, Math.round(100 - (stats.bestPace - 300) / 2.2)))
    : 18;
  const consistencyScore = consistency.planned ? consistency.pct : 0;
  const risk = Math.min(
    95,
    Math.max(5, injuries.length * 30 + (body?.fatigue >= 4 ? 25 : 0) + (body?.sleep_h > 0 && body.sleep_h < 6 ? 15 : 0))
  );
  return [
    { key: "endurance", label: "耐力", value: endurance, note: `累计 ${Math.round(stats.totalKm)} km，最长 ${stats.longest || 0} km` },
    { key: "speed", label: "速度", value: speed, note: stats.bestPace ? `最佳配速 ${formatPace(stats.bestPace)}` : "记录一次跑步后解锁" },
    { key: "consistency", label: "自律度", value: consistencyScore, note: `已到期课程完成 ${consistency.done}/${consistency.planned}` },
    { key: "risk", label: "伤病风险", value: risk, note: injuries.length ? `关注：${injuries.map((i) => i.area).join("、")}` : "暂无伤病记录", inverse: true },
  ];
}

export function computeAchievements(state) {
  const stats = computeRunningStats(state);
  const items = [
    { id: "first_run", title: "第一步", desc: "完成第一次跑步", earned: stats.totalRuns >= 1 },
    { id: "ten_runs", title: "十次出发", desc: "累计跑步 10 次", earned: stats.totalRuns >= 10 },
    { id: "first_5k", title: "五公里俱乐部", desc: "单次跑满 5 公里", earned: stats.longest >= 5 },
    { id: "fifty", title: "五十公里", desc: "累计跑量 50 公里", earned: stats.totalKm >= 50 },
    { id: "hundred", title: "百公里", desc: "累计跑量 100 公里", earned: stats.totalKm >= 100 },
    { id: "streak4", title: "四周不断", desc: "连续 4 周都有跑步", earned: stats.streakWeeks >= 4 },
    { id: "half", title: "半马距离", desc: "单次跑满 21.1 公里", earned: stats.longest >= 21.1 },
    { id: "pb", title: "PB 时刻", desc: "记录下自己的最佳配速", earned: !!stats.bestPace },
  ];
  return items;
}

export function nextGoalFor(goalKey) {
  return {
    fat_loss: { label: "首个 5K", advice: "习惯已经建立，下一步试着连续跑完 5 公里。" },
    first_5k: { label: "10K 进 50 分钟", advice: "5 公里跑顺了，可以开始加入节奏跑。" },
    ten_k: { label: "半马完赛", advice: "10 公里基础够了，长距离慢慢拉到 18 公里。" },
    half: { label: "全马破四", advice: "半马完赛后先恢复两周，再进入 16 周全马周期。" },
    full: { label: "保持与越野", advice: "全马之后先恢复，再考虑越野或继续刷新 PB。" },
  }[goalKey] || null;
}

export function bodyTrend(state, field, limit = 7) {
  const list = (state.body || [])
    .filter((b) => Number(b?.[field]) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-limit);
  return list.map((b) => ({ date: b.date, value: Number(b[field]) }));
}
