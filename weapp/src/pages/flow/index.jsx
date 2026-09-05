import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Taro, { useDidShow, useDidHide } from "@tarojs/taro";
import { View, Text, ScrollView, Input, Image, Canvas } from "@tarojs/components";
import { get, post, patch } from "@/utils/api";
import { getToken } from "@/utils/auth";
import VoiceInput from "@/components/VoiceInput";

const THEME = {
  primary: "#384877",
  primaryLight: "#4a5d8f",
  primaryFaint: "#d8dde9",
  primaryMist: "#eef0f5",
  water: "#5b82a0",
  waterLight: "#7a9eb8",
  waterFaint: "#d4e4f0",
  waterMist: "#e8f0f5",
  ink: "#1c1c1e",
  inkSecondary: "#3a3a3c",
  inkTertiary: "#63666e",
  inkQuaternary: "#9ca0a8",
  paper: "#fafbfb",
  card: "#ffffff",
  border: "#e8ecef",
  done: "#a8d5a2",
  doneBg: "#e8f5e6",
  heart: "#e8a5a5",
  heartDeep: "#c97b8a",
  heartBg: "#fce8ec",
  gold: "#d8b98a",
  goldBg: "#f8f1e4"
};

const CATEGORY_LABEL = {
  work: "工作",
  personal: "个人",
  health: "健康",
  study: "学习",
  family: "家庭",
  shopping: "购物",
  finance: "财务",
  other: "其他"
};

const LOCATION_TYPE_LABEL = {
  office: "工作",
  home: "生活",
  gym: "健康",
  school: "学习",
  shopping: "购物",
  hospital: "健康",
  restaurant: "生活",
  other: "相关"
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function toChinaYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  const str = d.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
  return str.replace(/\//g, "-");
}

function isToday(iso) {
  return iso ? toChinaYmd(iso) === toChinaYmd(new Date()) : false;
}

function isDone(t) {
  return ["completed", "done", "archived"].includes(t?.status);
}

function taskTime(t) {
  return t?.due_at || t?.end_time || t?.reminder_time;
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getHour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.getHours();
}

function isOverdue(t) {
  const tt = taskTime(t);
  return tt && !isDone(t) && new Date(tt) < new Date();
}

function chinaIso(ymd, time) {
  // 后端 zod datetime() 默认不接受 +08:00 时区偏移，统一转 UTC ISO
  const d = new Date(`${ymd}T${time}:00`);
  if (isNaN(d.getTime())) return `${ymd}T${time}:00Z`;
  return d.toISOString();
}

function tomorrowAt(time) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return chinaIso(toChinaYmd(d), time);
}

function daysAgoYmd(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toChinaYmd(d);
}

function isWithinYmdRange(iso, startYmd, endYmd) {
  const ymd = toChinaYmd(iso);
  return ymd >= startYmd && ymd <= endYmd;
}

function chinaHour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.getHours();
}

function completionTime(t) {
  return t?.completed_at || t?.updated_date || null;
}

function greetByHour() {
  const h = new Date().getHours();
  if (h < 9) return "早安";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function extractUrl(text) {
  const m = String(text || "").match(/https?:\/\/\S+/i);
  return m ? m[0] : null;
}

function isHeartNote(n) {
  const tags = Array.isArray(n.tags) ? n.tags : [];
  const text = String(n.plain_text || n.content || "");
  return tags.includes("情绪") || tags.includes("心签") || (text.length < 120 && !extractUrl(text));
}

function getLocationSafe() {
  return new Promise((resolve) => {
    Taro.getLocation({
      type: "gcj02",
      success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }),
      fail: () => resolve(null)
    });
  });
}

const ACTIVITY_RULES = [
  { keys: ["会", "议", "call", "zoom", "讨论", "对齐", "评审"], label: "会议" },
  { keys: ["写", "稿", "文", "博客", "文档", "方案", "邮件"], label: "写作" },
  { keys: ["学", "课", "书", "阅读", "练", "背单词"], label: "学习" },
  { keys: ["运", "跑", "走", "瑜伽", "健身", "冥想"], label: "休息" },
  { keys: ["购", "买", "菜", "快递"], label: "生活" }
];

const DEEP_KEYWORDS = ["写", "稿", "方案", "文档", "设计", "代码", "编程", "开发", "学习", "阅读", "深度", "专注", "备考", "论文", "报告", "策划"];
const EVENT_KEYWORDS = ["会", "议", "call", "zoom", "讨论", "对齐", "评审", "约", "面", "试", "考", "飞", "机", "医", "院", "牙", "活", "动", "聚", "餐", "见", "客", "户"];
const RELAX_KEYWORDS = ["休息", "放松", "娱乐", "短视频", "刷剧", "游戏", "睡觉", "午睡", "摸鱼", "躺", "听歌", "看电影", "追剧"];
const HABIT_KEYWORDS = ["药", "维生素", "锻炼", "跑步", "瑜伽", "健身", "冥想", "阅读", "读书", "英语", "背单词", "早餐", "午餐", "晚餐", "喝水", "日记", "复盘", "早睡"];
const FIXED_TIME_KEYWORDS = ["药", "维生素", "就医", "医院", "牙", "面试", "考试", "航班", "飞机", "约会", "聚餐", "课", "培训", "见面"];

function titleHasAny(title, keywords) {
  return keywords.some((k) => title.includes(k));
}

function isFixedTimeTask(t) {
  return titleHasAny(String(t?.title || ""), FIXED_TIME_KEYWORDS);
}

function isWorkTask(t) {
  const title = String(t?.title || "");
  const category = String(t?.category || "");
  return category === "work" || titleHasAny(title, ["工作", "项目", "客户", "方案", "报告", "邮件", "代码", "开发", "设计", "产品", "需求", "对齐", "评审"]);
}

function generateLocalHeartReply(text) {
  const t = String(text || "");
  if (/累|疲惫|困|倦|耗|乏|没精神|提不起劲/.test(t)) return "累了就歇一会儿，不用一直撑着。我会替你守着那些事，等你有力气了再动。";
  if (/焦虑|烦|担心|紧张|压力|慌|不安|迷茫/.test(t)) return "焦虑写下来就变小了。不管发生什么，我先在这里陪你。";
  if (/慢|放松|歇|空|静|停|躺平|摆烂|无所事事/.test(t)) return "慢下来是对的，河流不需要一直湍急。这一刻的空白也是节奏的一部分。";
  if (/感谢|感恩|谢谢|温暖|幸福|满足|被爱/.test(t)) return "这份光亮我替你收好了。懂得感恩的心，本身就值得被温柔对待。";
  if (/放弃|不想|没意思|做不到|太难了|无助|绝望/.test(t)) return "不想做也没关系，我们可以把它拆小一点，小到你能轻轻拿起的那一步。";
  if (/开心|高兴|快乐|期待|兴奋|惊喜|幸运|小确幸/.test(t)) return "真好，替你记下这份开心。愿这样的时刻，像波纹一样多起来。";
  if (/难过|伤心|哭|痛|委屈|孤独|失落|沮丧/.test(t)) return "难过的时候，允许自己待一会儿。不用急着好起来，我陪你。";
  if (/生气|愤怒|不爽|讨厌|烦|火大|失望|不满/.test(t)) return "有情绪是正常的，它是在保护你。先深呼吸，这件事可以晚一点再处理。";
  if (/爱|喜欢|想|念|陪伴|牵挂|珍惜|温柔/.test(t)) return "这份心意很珍贵。愿意表达柔软，本身就是一种勇敢。";
  if (/工作|加班|项目| deadline| 截止日期|忙|赶/.test(t)) return "工作再急，也别忘了你也很重要。先喝口水，我们再一件一件来。";
  if (/失眠|睡不着|熬夜|醒|梦/.test(t)) return " night's edges are soft. 如果睡不着，就别逼自己，闭眼躺着也是休息。";
  if (/晨|早|起床|新的一天|开始/.test(t)) return "新的一天开始了，不用急着做得完美，先照顾好自己。";
  if (/晚|夜|结束|下班|回家/.test(t)) return "今天到这里已经够了。剩下的，交给夜晚和你自己。";
  if (/想清楚了|决定|选择|纠结/.test(t)) return "无论你怎么选，都是当下能做的最好决定。我支持你。";
  return "听见了。它被好好收在这里，等你准备好再回来看。";
}

function extractHabitKey(title) {
  const t = String(title || "");
  for (const k of HABIT_KEYWORDS) {
    if (t.includes(k)) return k;
  }
  return null;
}

function detectHabitHours(tasks) {
  const done = tasks.filter((t) => isDone(t) && completionTime(t));
  const counts = {};
  done.forEach((t) => {
    const h = chinaHour(completionTime(t));
    if (h == null || h < 8 || h > 23) return;
    const key = extractHabitKey(t.title) || t.category || "other";
    counts[h] = counts[h] || {};
    counts[h][key] = (counts[h][key] || 0) + 1;
  });
  const result = {};
  Object.entries(counts).forEach(([h, map]) => {
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    if (top && top[1] >= 2) {
      result[parseInt(h, 10)] = top[0];
    }
  });
  return result;
}

function classifyHour(h, tasks, notes, habitMap) {
  const hourTasks = tasks.filter((t) => {
    const time = isDone(t) ? completionTime(t) : taskTime(t);
    return getHour(time) === h;
  });
  const hourNotes = notes.filter((n) => getHour(n.created_date) === h);

  let deepScore = 0;
  let agreementScore = 0;
  let relaxScore = 0;
  let habitScore = 0;
  let heartScore = 0;
  let habitLabel = null;

  hourTasks.forEach((t) => {
    const title = String(t.title || "");
    const pri = t.priority === "urgent" ? 3 : t.priority === "high" ? 2 : 1;

    if (titleHasAny(title, EVENT_KEYWORDS)) {
      agreementScore += 3 + pri * 0.3;
    }
    if (titleHasAny(title, RELAX_KEYWORDS)) {
      relaxScore += 2;
    }
    if (titleHasAny(title, DEEP_KEYWORDS) || ["work", "study"].includes(t.category)) {
      deepScore += pri;
    }
    if (!titleHasAny(title, EVENT_KEYWORDS) && !titleHasAny(title, RELAX_KEYWORDS)) {
      deepScore += pri * 0.3;
    }
  });

  hourNotes.forEach((n) => {
    const text = String(n.plain_text || n.content || "");
    const tags = Array.isArray(n.tags) ? n.tags : [];
    if (isHeartNote(n)) {
      heartScore += 2.2;
    } else if (tags.some((tag) => ["休息", "娱乐", "放松"].includes(tag)) || titleHasAny(text, RELAX_KEYWORDS)) {
      relaxScore += 1.5;
    }
  });

  if (habitMap[h]) {
    habitScore += 2.5;
    habitLabel = habitMap[h];
  }

  const scores = [
    { type: "deep", score: deepScore, label: "深流" },
    { type: "agreement", score: agreementScore, label: "约定" },
    { type: "heart", score: heartScore, label: "心签" },
    { type: "habit", score: habitScore, label: habitLabel || "习惯" },
    { type: "relax", score: relaxScore, label: "放松" }
  ].sort((a, b) => b.score - a.score);

  const winner = scores[0];
  if (winner.score >= 1.2) {
    return { type: winner.type, label: winner.label, scores };
  }
  return { type: "neutral", label: null, scores };
}

function buildHourSegments(tasks, notes) {
  const hours = Array.from({ length: 16 }, (_, i) => i + 8);
  const habitMap = detectHabitHours(tasks);
  return hours.map((h) => {
    const segment = classifyHour(h, tasks, notes, habitMap);
    const hourTasks = tasks.filter((t) => {
      const time = isDone(t) ? completionTime(t) : taskTime(t);
      return getHour(time) === h;
    });
    const hourNotes = notes.filter((n) => getHour(n.created_date) === h);
    const intensity = Math.min(1, (hourTasks.length + hourNotes.length * 0.5) / 3 + (segment.type === "deep" ? 0.2 : 0));
    return { hour: h, ...segment, intensity, taskCount: hourTasks.length };
  });
}

function inferHourActivity(hour, tasks, notes) {
  const hourTasks = tasks.filter((t) => {
    const time = isDone(t) ? t.completed_at || t.updated_date : taskTime(t);
    return getHour(time) === hour;
  });
  const hourNotes = notes.filter((n) => getHour(n.created_date) === hour);
  const scores = {};
  hourTasks.forEach((t) => {
    const title = String(t.title || "");
    ACTIVITY_RULES.forEach((r) => {
      if (r.keys.some((k) => title.includes(k))) {
        scores[r.label] = (scores[r.label] || 0) + 2;
      }
    });
    if (t.category) {
      const label = CATEGORY_LABEL[t.category] || t.category;
      scores[label] = (scores[label] || 0) + 1;
    }
  });
  hourNotes.forEach((n) => {
    if (isHeartNote(n)) scores["心签"] = (scores["心签"] || 0) + 1;
  });
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries[0][0] : null;
}

// ===== 河流曲线 =====
function buildFlowLine(tasks, notes) {
  const segments = buildHourSegments(tasks, notes);

  // 基础强度：结合约定数量与分段类型
  const values = segments.map((s) => {
    let base = s.taskCount * 0.35 + s.intensity * 0.4;
    if (s.type === "deep") base += 0.35;
    if (s.type === "agreement") base += 0.25;
    if (s.type === "habit") base += 0.2;
    if (s.type === "heart") base += 0.15;
    if (s.type === "relax") base += 0.05;
    return Math.min(1, base);
  });
  const maxValue = Math.max(...values, 0.3);

  const points = segments.map((s, i) => ({
    hour: s.hour,
    value: values[i] / maxValue,
    type: s.type,
    label: s.label,
    rawValue: values[i],
    taskCount: s.taskCount
  }));

  // 深流区：连续 deep 或高强度工作段
  let bestStart = null;
  let bestLen = 0;
  let curStart = null;
  let curLen = 0;
  points.forEach((p, i) => {
    const isDeep = p.type === "deep" || (p.type === "neutral" && p.rawValue >= 0.7);
    if (isDeep) {
      if (curStart == null) {
        curStart = i;
        curLen = 1;
      } else {
        curLen += 1;
      }
    } else {
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
      curStart = null;
      curLen = 0;
    }
  });
  if (curLen > bestLen) {
    bestLen = curLen;
    bestStart = curStart;
  }
  const deep = bestLen >= 2 && bestStart != null ? { start: points[bestStart].hour, end: points[bestStart + bestLen - 1].hour } : null;

  const markers = points
    .filter((p) => p.type !== "neutral" && p.label)
    .map((p) => ({ type: p.type, label: p.label, hour: p.hour }));

  return {
    points,
    markers,
    deep,
    segments,
    doneToday: tasks.filter((t) => isDone(t) && isToday(completionTime(t))).length
  };
}

function findHistoricalDeepSlot(tasks) {
  const completed = tasks.filter((t) => isDone(t) && completionTime(t));
  const today = toChinaYmd(new Date());
  const hourCounts = {};
  completed
    .filter((t) => isWithinYmdRange(completionTime(t), daysAgoYmd(13), today))
    .forEach((t) => {
      const h = chinaHour(completionTime(t));
      if (h != null && h >= 8 && h <= 22) hourCounts[h] = (hourCounts[h] || 0) + 1;
    });

  const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] < 2) return null;

  const center = parseInt(sorted[0][0], 10);
  // 找中心小时前后连续的高产时段
  let start = center;
  let end = center;
  while (start > 8 && (hourCounts[start - 1] || 0) >= 1) start -= 1;
  while (end < 22 && (hourCounts[end + 1] || 0) >= 1) end += 1;
  return { start, end, count: sorted[0][1] };
}

function hasEventAtHour(tasks, hour, ymd) {
  return tasks.some((t) => {
    if (isDone(t)) return false;
    const tt = taskTime(t);
    if (!tt) return false;
    return toChinaYmd(tt) === ymd && getHour(tt) === hour && titleHasAny(String(t.title || ""), EVENT_KEYWORDS);
  });
}

function buildRiverInsight(river, tasks, notes) {
  const nowHour = new Date().getHours();
  const now = new Date();
  const segments = river?.segments || [];
  const currentSegment = segments.find((s) => s.hour === nowHour);
  const upcoming = segments.filter((s) => s.hour > nowHour);
  const nextSegment = upcoming[0] || null;

  // 下一个真实约定（按时间排序）
  const nextScheduledTask = tasks
    .filter((t) => !isDone(t) && isToday(taskTime(t)) && getHour(taskTime(t)) > nowHour)
    .sort((a, b) => getHour(taskTime(a)) - getHour(taskTime(b)))[0];
  const nextEventHour = nextScheduledTask ? getHour(taskTime(nextScheduledTask)) : null;

  const topPending = tasks.filter((t) => !isDone(t)).sort((a, b) => dueWeight(b) - dueWeight(a))[0];
  const histSlot = findHistoricalDeepSlot(tasks);
  const officeHours = detectOfficeHours(tasks);

  // 1. 即将到来的固定时间约定：只能准备，不能移动
  if (nextEventHour != null && nextEventHour - nowHour <= 1 && isFixedTimeTask(nextScheduledTask)) {
    const title = nextScheduledTask.title;
    const mins = Math.max(5, (nextEventHour - nowHour) * 60);
    const prep = titleHasAny(title, ["药", "维生素"])
      ? "记得按时服用，这件事不能推迟。"
      : titleHasAny(title, ["就医", "医院", "牙"])
        ? "提前准备好资料，路上留足时间。"
        : titleHasAny(title, ["面试", "考试"])
          ? "现在适合做最后的浏览和准备。"
          : "把这件事的材料再过一遍，时间到了我提醒你。";
    return {
      text: `${mins <= 30 ? "再过" : "约"}${mins}分钟有「${title}」。${prep}`,
      actionText: "查看约定",
      action: "go-task",
      payload: { id: nextScheduledTask.id },
      smartReason: "fixed_time"
    };
  }

  // 2. 即将到来的可调整约定：建议在此前推进一件事
  if (nextEventHour != null && nextEventHour - nowHour <= 1) {
    const title = nextScheduledTask.title;
    const mins = (nextEventHour - nowHour) * 60;
    return {
      text: `${mins <= 30 ? "再过" : "约"}${mins}分钟有「${title}」。现在不适合开新任务，把这件事的材料再过一遍就好。`,
      actionText: "查看约定",
      action: "go-task",
      payload: { id: nextScheduledTask.id },
      smartReason: "upcoming_agreement"
    };
  }

  // 3. 当前习惯时间（且多为固定时间）：提醒去做，不打扰
  if (currentSegment?.type === "habit") {
    const habitTask = tasks.find((t) => !isDone(t) && isToday(taskTime(t)) && getHour(taskTime(t)) === nowHour && isFixedTimeTask(t));
    if (habitTask) {
      return {
        text: `现在是${nowHour}:00，该做「${habitTask.title}」了。这是你的身体会记住的时间，我帮你守着。`,
        actionText: "去完成",
        action: "go-task",
        payload: { id: habitTask.id },
        smartReason: "habit_now"
      };
    }
  }

  // 4. 当前深流时段：推荐高优先级/专注型任务
  if (river.deep && nowHour >= river.deep.start && nowHour <= river.deep.end) {
    const candidates = tasks.filter((t) => !isDone(t));
    const top = pickSmartTask(candidates, { nowHour, currentSegment, officeHours, mode: "deep" });
    return {
      text: `现在是你今天的深流时段。${top ? `「${top.title}」` : "那件最重要的事"}放在此刻做，阻力会小很多。`,
      actionText: top ? "开始这件事" : "选一件开始",
      action: top ? "go-task" : "pick",
      payload: top ? { id: top.id } : null,
      smartReason: "deep_now"
    };
  }

  // 5. 当前办公习惯时段：推荐工作相关高优先级约定
  if (officeHours && nowHour >= officeHours.start && nowHour <= officeHours.end) {
    const candidates = tasks.filter((t) => !isDone(t));
    const top = pickSmartTask(candidates, { nowHour, currentSegment, officeHours, mode: "work" });
    if (top && isWorkTask(top)) {
      return {
        text: `这个时段你通常在工作。把「${top.title}」放在此刻推进，会顺着你的节奏走。`,
        actionText: "开始这件事",
        action: "go-task",
        payload: { id: top.id },
        smartReason: "office_hours"
      };
    }
  }

  // 6. 即将到来的习惯
  const upcomingHabit = upcoming.find((s) => s.type === "habit" && s.hour - nowHour <= 1);
  if (upcomingHabit) {
    return {
      text: `再过一会儿就是${upcomingHabit.hour}:00的「${upcomingHabit.label}」时间。我会提前帮你空出这个时段。`,
      actionText: "知道了",
      action: "note",
      smartReason: "upcoming_habit"
    };
  }

  // 7. 当前有放松/心签记录
  if (currentSegment?.type === "relax" || currentSegment?.type === "heart") {
    const top = tasks.filter((t) => !isDone(t)).sort((a, b) => dueWeight(b) - dueWeight(a))[0];
    return {
      text: "此刻的河流很平缓，适合休息。等你想动的时候，我可以先帮你挑一件最小的事。",
      actionText: top ? "挑一件最小的事" : "记一条",
      action: top ? "go-task" : "note",
      payload: top ? { id: top.id } : null,
      smartReason: "relax_now"
    };
  }

  // 8. 下一个时段是约定，建议在此之前完成一件事
  if (nextSegment?.type === "agreement" && nextEventHour != null) {
    const slotHours = nextEventHour - nowHour - 1;
    const candidates = tasks.filter((t) => !isDone(t));
    const top = pickSmartTask(candidates, { nowHour, currentSegment, officeHours, mode: "before_event" });
    if (slotHours >= 1 && top) {
      return {
        text: `在${nextEventHour}:00的「${nextSegment.label || "约定"}」之前，你有约${slotHours}小时空档。先把「${top.title}」推进一点。`,
        actionText: "现在推进",
        action: "go-task",
        payload: { id: top.id },
        smartReason: "before_agreement"
      };
    }
  }

  // 9. 上午黄金时段
  if (nowHour < 10) {
    const candidates = tasks.filter((t) => !isDone(t));
    const top = pickSmartTask(candidates, { nowHour, currentSegment, officeHours, mode: "morning" });
    return {
      text: "上午是大多数人最容易进入深流的时间。先选一件重要的事开始，我会替你守着。",
      actionText: top ? "开始这件事" : "选一件开始",
      action: top ? "go-task" : "pick",
      payload: top ? { id: top.id } : null,
      smartReason: "morning"
    };
  }

  // 10. 历史深流规律 + 把重要任务移过去
  if (histSlot && topPending) {
    const tomorrowYmd = daysAgoYmd(-1);
    const hasConflict = hasEventAtHour(tasks, histSlot.start, tomorrowYmd);
    if (!hasConflict) {
      const startLabel = `${histSlot.start}:00`;
      const endLabel = `${histSlot.end + 1}:00`;
      return {
        text: `你最近 ${histSlot.count} 次深流都发生在 ${startLabel}–${endLabel}。明天上午目前没有冲突——把「${topPending.title}」放进这个时段，会更容易顺水推舟。`,
        actionText: `把「${topPending.title.slice(0, 10)}」移过去`,
        action: "move-to-slot",
        payload: { hour: histSlot.start, taskId: topPending.id },
        smartReason: "historical_deep"
      };
    }
  }

  // 11. 有已完成，继续顺水推
  if (river.doneToday > 0) {
    const top = tasks.filter((t) => !isDone(t)).sort((a, b) => dueWeight(b) - dueWeight(a))[0];
    return {
      text: `今天已经完成 ${river.doneToday} 件事，河流正在流动。${top ? `再顺水推一件「${top.title}」就好。` : "不用急，等你想动的时候再开始。"}`,
      actionText: top ? "现在推进" : "记一条",
      action: top ? "go-task" : "note",
      payload: top ? { id: top.id } : null,
      smartReason: "keep_flow"
    };
  }

  return {
    text: "今天的河流还在等待第一条波纹。记录或完成一件小事，它会自己展开。",
    actionText: "记一条",
    action: "note",
    smartReason: "empty"
  };
}

// 检测用户办公习惯时段（近 14 天完成记录最多的连续时段）
function detectOfficeHours(tasks) {
  const completed = tasks.filter((t) => isDone(t) && completionTime(t) && isWorkTask(t));
  if (completed.length < 3) return null;

  const today = toChinaYmd(new Date());
  const hourCounts = {};
  completed
    .filter((t) => isWithinYmdRange(completionTime(t), daysAgoYmd(13), today))
    .forEach((t) => {
      const h = chinaHour(completionTime(t));
      if (h != null && h >= 8 && h <= 22) hourCounts[h] = (hourCounts[h] || 0) + 1;
    });

  const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] < 2) return null;

  const center = parseInt(sorted[0][0], 10);
  let start = center;
  let end = center;
  while (start > 8 && (hourCounts[start - 1] || 0) >= 1) start -= 1;
  while (end < 22 && (hourCounts[end + 1] || 0) >= 1) end += 1;

  // 至少覆盖 3 小时才认为是办公时段
  if (end - start + 1 < 3) return null;
  return { start, end, count: sorted[0][1] };
}

// 智能挑选当下最适合的约定
function pickSmartTask(candidates, context) {
  const { nowHour, currentSegment, officeHours, mode, lastDoneCategory } = context || {};
  if (!candidates || candidates.length === 0) return null;

  let scored = candidates.map((t) => {
    let score = dueWeight(t);
    const title = String(t.title || "");
    const category = String(t.category || "");

    // 固定时间约定在未到时间前不推荐
    if (isFixedTimeTask(t)) score -= 50;

    // 深流模式：优先高优先级、专注型、工作/学习
    if (mode === "deep") {
      if (["urgent", "high"].includes(t.priority)) score += 20;
      if (titleHasAny(title, DEEP_KEYWORDS)) score += 15;
      if (["work", "study"].includes(category)) score += 10;
      if (titleHasAny(title, RELAX_KEYWORDS)) score -= 30;
    }

    // 工作模式：优先工作相关
    if (mode === "work" || (officeHours && nowHour >= officeHours.start && nowHour <= officeHours.end)) {
      if (isWorkTask(t)) score += 25;
      if (["urgent", "high"].includes(t.priority)) score += 10;
      if (titleHasAny(title, RELAX_KEYWORDS)) score -= 20;
    }

    // 事件前模式：优先能在短时间内推进、不太费脑的事
    if (mode === "before_event") {
      if (["urgent", "high"].includes(t.priority)) score += 10;
      if (titleHasAny(title, RELAX_KEYWORDS)) score -= 20;
      if (titleHasAny(title, DEEP_KEYWORDS)) score -= 10;
    }

    // 早晨模式：优先重要不紧急、需要专注的事
    if (mode === "morning") {
      if (["urgent", "high"].includes(t.priority)) score += 15;
      if (titleHasAny(title, DEEP_KEYWORDS)) score += 10;
    }

    // 习惯性接续：上一个完成同类，状态还在
    if (lastDoneCategory && category === lastDoneCategory) score += 8;

    return { task: t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.task || null;
}

function buildRhythm(tasks) {
  const today = toChinaYmd(new Date());
  const last7Start = daysAgoYmd(6);
  const prev7Start = daysAgoYmd(13);
  const prev7End = daysAgoYmd(7);

  const completed = tasks.filter((t) => isDone(t) && completionTime(t));
  const last7 = completed.filter((t) => isWithinYmdRange(completionTime(t), last7Start, today));
  const prev7 = completed.filter((t) => isWithinYmdRange(completionTime(t), prev7Start, prev7End));

  const last7ByDay = {};
  for (let i = 0; i < 7; i++) {
    last7ByDay[daysAgoYmd(i)] = 0;
  }
  last7.forEach((t) => {
    const ymd = toChinaYmd(completionTime(t));
    if (last7ByDay[ymd] != null) last7ByDay[ymd] += 1;
  });
  const weekDays = Object.entries(last7ByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ymd, count]) => {
      const label = `${parseInt(ymd.split("-")[1], 10)}/${parseInt(ymd.split("-")[2], 10)}`;
      return { ymd, label, count };
    });
  const completed7 = last7.length;
  const completedPrev7 = prev7.length;
  const diff = completed7 - completedPrev7;
  const restDays = weekDays.filter((d) => d.count === 0).length;

  let streakDays = 0;
  for (let i = 0; i < 14; i++) {
    const ymd = daysAgoYmd(i);
    if (last7ByDay[ymd] != null ? last7ByDay[ymd] > 0 : completed.some((t) => toChinaYmd(completionTime(t)) === ymd)) {
      streakDays += 1;
    } else {
      break;
    }
  }

  const hourCounts = {};
  completed
    .filter((t) => isWithinYmdRange(completionTime(t), daysAgoYmd(13), today))
    .forEach((t) => {
      const h = chinaHour(completionTime(t));
      if (h != null) hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
  const sortedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  const deepHour = sortedHours.length > 0 && sortedHours[0][1] >= 2 ? parseInt(sortedHours[0][0], 10) : null;

  const lastWeekHour = {};
  const prevWeekHour = {};
  completed.forEach((t) => {
    const ymd = toChinaYmd(completionTime(t));
    const h = chinaHour(completionTime(t));
    if (h == null) return;
    if (isWithinYmdRange(completionTime(t), last7Start, today)) lastWeekHour[h] = (lastWeekHour[h] || 0) + 1;
    else if (isWithinYmdRange(completionTime(t), prev7Start, prev7End)) prevWeekHour[h] = (prevWeekHour[h] || 0) + 1;
  });
  const deepPersisted = deepHour != null && (lastWeekHour[deepHour] || 0) >= 2 && (prevWeekHour[deepHour] || 0) >= 2;

  let text = "";
  let actionText = "";
  let action = "";
  let payload = null;

  if (deepPersisted) {
    text = `连续两周，${deepHour}:00–${deepHour + 1}:00 都是你最有节奏的时段。这不是偶然，是你的身体会记住的时间。`;
    actionText = "把一件事放进这个时段";
    action = "move-to-slot";
    payload = { hour: deepHour };
  } else if (deepHour != null && streakDays >= 2) {
    text = `你这周 ${deepHour}:00–${deepHour + 1}:00 的能量最稳，${streakDays} 天都在这个时段有行动。把重要的事放进去，会更容易顺水推舟。`;
    actionText = "保留这个时段";
    action = "move-to-slot";
    payload = { hour: deepHour };
  } else if (completed7 === 0) {
    text = "这周还没有新的波纹。没关系，河流也需要喘息。等你想动的时候，我会先帮你挑一件最小的事。";
    actionText = "从最小一步开始";
    action = "create-small";
  } else if (restDays >= 3) {
    text = `这周你有 ${restDays} 天没有行动。空白不是退步，是节奏的一部分。我们可以一起把下一件事拆得小一点。`;
    actionText = "拆小一件事";
    action = "split-next";
  } else {
    const diffText = diff > 0 ? `多 ${diff}` : diff < 0 ? `少 ${Math.abs(diff)}` : "持平";
    text = `这周已完成 ${completed7} 件事，比上周${diffText}。节奏比连续更重要。`;
    actionText = "看看本周河流";
    action = "view-tasks";
  }

  return { text, actionText, action, payload, weekDays, completed7, completedPrev7, streakDays, deepHour, deepPersisted };
}

function dueWeight(t) {
  let w = 0;
  if (isOverdue(t)) w += 100;
  if (t.priority === "urgent") w += 50;
  else if (t.priority === "high") w += 30;
  const tt = taskTime(t);
  if (tt) {
    const nowHour = new Date().getHours();
    w += Math.max(0, 20 - Math.abs(new Date(tt).getHours() - nowHour));
  }
  return w;
}

function isTaskVisible(t) {
  return t && !isDone(t) && t.status !== "cancelled" && !t.completed_at;
}

function buildContextCards(sentinel, assoc, tasks) {
  const cards = [];

  // 1. 地理情境感知
  if (sentinel?.geo_context) {
    const g = sentinel.geo_context;
    const visible = (g.tasks || []).filter(isTaskVisible);
    if (visible.length > 0) {
      cards.push({ type: "geo", data: g, tasks: visible });
    }
  }

  // 2. 遗忘拯救
  if (sentinel?.forgetting_rescue?.primary) {
    cards.push({ type: "forget", data: sentinel.forgetting_rescue });
  }

  // 3. 序贯推荐
  if (assoc?.sequential_recommendation) {
    const s = assoc.sequential_recommendation;
    const suggestions = (s.suggestions || []).filter((su) => (su.tasks || []).some(isTaskVisible));
    if (suggestions.length > 0) {
      cards.push({ type: "sequential", data: s, suggestions });
    }
  }

  // 4. 地点情境推荐
  if (assoc?.location_pattern) {
    const l = assoc.location_pattern;
    const suggested = (l.suggested_tasks || []).filter(isTaskVisible);
    if (suggested.length > 0 || (l.top_categories || []).length > 0) {
      cards.push({ type: "location", data: l, suggested });
    }
  }

  return cards;
}

// ===== 折线组件 =====
const COL_W = 44;
const CHART_H = 160;

const SEGMENT_COLORS = {
  deep: "#ffffff",
  agreement: "#ffd6a5",
  heart: "#e8a5a5",
  habit: THEME.gold,
  relax: "#c7a8c8",
  neutral: "rgba(255,255,255,0.45)"
};

function LineSegment({ p1, p2 }) {
  const x1 = (p1.hour - 8) * COL_W + COL_W / 2;
  const y1 = (1 - p1.value) * CHART_H;
  const x2 = (p2.hour - 8) * COL_W + COL_W / 2;
  const y2 = (1 - p2.value) * CHART_H;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const color = SEGMENT_COLORS[p1.type] || SEGMENT_COLORS.neutral;
  return (
    <View
      style={{
        position: "absolute",
        left: `${x1}rpx`,
        top: `${y1}rpx`,
        width: `${len}rpx`,
        height: "3rpx",
        background: color,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 50%",
        zIndex: 1,
        opacity: 0.9
      }}
    />
  );
}

function FlowLineChart({ points, markers, deep }) {
  const totalW = points.length * COL_W;
  return (
    <View style={{ width: `${totalW}rpx`, height: `${CHART_H}rpx`, position: "relative" }}>
      {deep && (
        <View
          style={{
            position: "absolute",
            top: "4rpx",
            bottom: "4rpx",
            left: `${(deep.start - 8) * COL_W}rpx`,
            width: `${(deep.end - deep.start + 1) * COL_W}rpx`,
            background: "rgba(255,255,255,0.12)",
            borderRadius: "12rpx",
            zIndex: 0
          }}
        />
      )}
      {points.map((p, i) => (i < points.length - 1 ? <LineSegment key={`seg-${i}`} p1={p} p2={points[i + 1]} /> : null))}
      {points.map((p) => {
        const marker = markers.find((m) => m.hour === p.hour);
        const left = (p.hour - 8) * COL_W + COL_W / 2 - 6;
        const top = (1 - p.value) * CHART_H - 6;
        const color = marker ? SEGMENT_COLORS[marker.type] || SEGMENT_COLORS.neutral : SEGMENT_COLORS[p.type] || SEGMENT_COLORS.neutral;
        return (
          <View key={p.hour} style={{ position: "absolute", left: `${left}rpx`, top: `${top}rpx`, zIndex: 2 }}>
            <View
              style={{
                width: "14rpx",
                height: "14rpx",
                borderRadius: "50%",
                background: color,
                border: `2rpx solid ${p.type === "deep" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.35)"}`
              }}
            />
            {marker?.label && marker.type !== "deep" && (
              <Text
                style={{
                  position: "absolute",
                  top: p.value > 0.7 ? "28rpx" : "-32rpx",
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: "17rpx",
                  color: "rgba(255,255,255,0.85)",
                  whiteSpace: "nowrap",
                  background: "rgba(0,0,0,0.25)",
                  padding: "2rpx 8rpx",
                  borderRadius: "8rpx"
                }}
              >
                {marker.label}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function RiverCanvas({ points, deep, heartNotes }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const draw = async () => {
      const query = Taro.createSelectorQuery();
      query
        .select("#riverCanvas")
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res[0]?.node;
          if (!canvas) return;
          const { width, height } = res[0];
          const dpr = Taro.getSystemInfoSync().pixelRatio;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          const ctx = canvas.getContext("2d");
          ctx.scale(dpr, dpr);

          const padLeft = 28;
          const padRight = 28;
          const padTop = 22;
          const padBottom = 28;
          const chartW = width - padLeft - padRight;
          const chartH = height - padTop - padBottom;

          const getX = (hour) => padLeft + ((hour - 8) / 15) * chartW;
          const getY = (value) => padTop + (1 - value) * chartH;

          ctx.clearRect(0, 0, width, height);

          // 深流区高亮
          if (deep) {
            const x1 = getX(deep.start);
            const x2 = getX(deep.end + 1);
            const y = padTop - 6;
            const w = x2 - x1;
            const h = chartH + 12;
            const r = 8;
            ctx.fillStyle = "rgba(168,197,217,0.16)";
            ctx.beginPath();
            ctx.moveTo(x1 + r, y);
            ctx.lineTo(x1 + w - r, y);
            ctx.quadraticCurveTo(x1 + w, y, x1 + w, y + r);
            ctx.lineTo(x1 + w, y + h - r);
            ctx.quadraticCurveTo(x1 + w, y + h, x1 + w - r, y + h);
            ctx.lineTo(x1 + r, y + h);
            ctx.quadraticCurveTo(x1, y + h, x1, y + h - r);
            ctx.lineTo(x1, y + r);
            ctx.quadraticCurveTo(x1, y, x1 + r, y);
            ctx.closePath();
            ctx.fill();
          }

          // 网格时间标签
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          [8, 12, 16, 20, 23].forEach((h) => {
            ctx.fillText(`${h}:00`, getX(h), height - 8);
          });

          if (points.length < 2) return;

          const pts = points.map((p) => ({ x: getX(p.hour), y: getY(p.value) }));

          // 状态曲线（平滑）
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2] || p2;
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
          }
          ctx.strokeStyle = "#a8c5d9";
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.stroke();

          // 心签锚点
          heartNotes.forEach((n) => {
            const h = getHour(n.created_date);
            if (h == null || h < 8 || h > 23) return;
            const p = points.find((pt) => pt.hour === h);
            if (!p) return;
            const x = getX(h);
            const y = getY(p.value);
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#e8a5a5";
            ctx.fill();
          });

          // 低谷标记
          points.forEach((p) => {
            if (p.value < 0.3 && (!deep || p.hour < deep.start || p.hour > deep.end)) {
              ctx.beginPath();
              ctx.arc(getX(p.hour), getY(p.value), 3, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(255,255,255,0.4)";
              ctx.fill();
            }
          });

          // 分段锚点：深流/心签/习惯/放松/约定
          const typeColors = {
            deep: "#ffffff",
            agreement: "#ffd6a5",
            heart: "#e8a5a5",
            habit: "#d8b98a",
            relax: "#c7a8c8",
            neutral: "rgba(255,255,255,0.35)"
          };
          const typeLabels = {
            agreement: "约定",
            heart: "心签",
            habit: "习惯",
            relax: "放松"
          };
          points.forEach((p) => {
            const x = getX(p.hour);
            const y = getY(p.value);
            const r = p.type === "deep" ? 5 : 4;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = typeColors[p.type] || typeColors.neutral;
            ctx.fill();
            if (p.type !== "neutral" && p.type !== "deep") {
              ctx.strokeStyle = "rgba(255,255,255,0.5)";
              ctx.lineWidth = 1;
              ctx.stroke();
            }
            if (typeLabels[p.type]) {
              ctx.fillStyle = "rgba(255,255,255,0.85)";
              ctx.font = "9px sans-serif";
              ctx.textAlign = "center";
              const labelY = p.value > 0.75 ? y + 16 : y - 10;
              ctx.fillText(typeLabels[p.type], x, labelY);
            }
          });

          // 当前时刻游标
          const now = new Date();
          const nowH = now.getHours() + now.getMinutes() / 60;
          if (nowH >= 8 && nowH <= 23) {
            const x = getX(nowH);
            const p = points.find((pt) => pt.hour === Math.round(nowH));
            const y = p ? getY(p.value) : getY(0.5);
            ctx.beginPath();
            ctx.setLineDash([3, 3]);
            ctx.moveTo(x, padTop - 4);
            ctx.lineTo(x, height - padBottom + 4);
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = "#fff";
            ctx.fill();

            ctx.fillStyle = "#fff";
            ctx.font = "9px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(`现在 ${pad(now.getHours())}:${pad(now.getMinutes())}`, x + 6, y - 6);
          }
        });
    };
    draw();
  }, [points, deep, heartNotes]);

  return (
    <View ref={wrapRef} style={{ width: "100%", height: "200rpx" }}>
      <Canvas
        type="2d"
        id="riverCanvas"
        ref={canvasRef}
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}

export default function Flow() {
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [sentinel, setSentinel] = useState(null);
  const [assoc, setAssoc] = useState(null);
  const [heartLoadingIds, setHeartLoadingIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [inputText, setInputText] = useState("");
  const [inputPlaceholder, setInputPlaceholder] = useState("此刻想记下什么？");
  const [inputFocus, setInputFocus] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showAllDue, setShowAllDue] = useState(false);
  const [showCompletedDue, setShowCompletedDue] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState(toChinaYmd(new Date()));
  const [briefing, setBriefing] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [focusTask, setFocusTask] = useState(null);
  const [focusSeconds, setFocusSeconds] = useState(0);
  const focusTimerRef = useRef(null);
  const analyzingHeartIdsRef = useRef(new Set());
  const analyzedHeartIdsRef = useRef(new Set());

  useDidShow(() => {
    setIsGuest(!getToken());
    loadAll();
  });

  useDidHide(() => {
    if (focusTimerRef.current) {
      clearInterval(focusTimerRef.current);
      focusTimerRef.current = null;
    }
  });

  useDidHide(() => {
    // 页面隐藏时不做特殊处理
  });

  // 带超时的 analyzeHeartSign 调用，10s 未返回即降级本地兜底
  const runHeartAnalysis = useCallback((noteId, noteData, options = {}) => {
    const text = String(noteData?.plain_text || noteData?.content || "").slice(0, 400);
    if (analyzingHeartIdsRef.current.has(noteId) || analyzedHeartIdsRef.current.has(noteId)) {
      console.log("[runHeartAnalysis] skip duplicated", noteId);
      return Promise.resolve();
    }

    analyzingHeartIdsRef.current.add(noteId);
    setHeartLoadingIds((prev) => {
      const next = new Set(prev);
      next.add(noteId);
      return next;
    });

    const requestPromise = post(
      "/functions/analyzeHeartSign",
      {
        note_id: noteId,
        note_data: {
          plain_text: text,
          content: noteData.content,
          tags: noteData.tags
        }
      },
      { silent: true }
    );

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("AI 回应超时，已切换本地兜底")), 10000);
    });

    return Promise.race([requestPromise, timeoutPromise])
      .then((data) => {
        console.log("[runHeartAnalysis] success", noteId, data?.title);
        // 只要后端返回了 ai_analysis，就统一写进 notes 状态，避免 heartInsights 与 metadata 双数据源导致跳动/重复
        if (data?.ai_analysis) {
          setNotes((prev) =>
            prev.map((n2) =>
              n2.id === noteId
                ? {
                    ...n2,
                    title: data.title || n2.title,
                    tags: data.tags || n2.tags,
                    source_type: data.source_type || n2.source_type,
                    metadata: { ...n2.metadata, ai_analysis: data.ai_analysis }
                  }
                : n2
            )
          );
        }
        if (!options.skipReload) {
          loadAll();
        }
      })
      .catch((err) => {
        console.error("[runHeartAnalysis] failed", noteId, err);
        // AI 失败时给一条本地兜底回应，只写进 metadata，不再维护 heartInsights 双缓存
        const fallbackReply = generateLocalHeartReply(text);
        setNotes((prev) =>
          prev.map((n2) =>
            n2.id === noteId
              ? {
                  ...n2,
                  metadata: {
                    ...n2.metadata,
                    ai_analysis: {
                      ...(n2.metadata?.ai_analysis || {}),
                      emotional_response: fallbackReply,
                      source: "local_fallback",
                      analyzed_at: new Date().toISOString()
                    }
                  }
                }
              : n2
          )
        );
        if (err?.message?.includes("KIMI_API_KEY") || err?.message?.includes("AI 服务尚未配置")) {
          Taro.showToast({ title: "AI 服务未配置，心签回应为本地兜底", icon: "none" });
        }
      })
      .finally(() => {
        analyzingHeartIdsRef.current.delete(noteId);
        analyzedHeartIdsRef.current.add(noteId);
        setHeartLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(noteId);
          return next;
        });
      });
  }, []);

  useEffect(() => {
    // 为每条尚未生成 AI 回应的心签请求 analyzeHeartSign，每次最多 5 条，避免并发过多
    const hearts = notes
      .filter(isHeartNote)
      .filter((n) => {
        const ai = n.metadata?.ai_analysis;
        return !ai?.emotional_response && n.ai_status !== "processing" && !analyzingHeartIdsRef.current.has(n.id) && !analyzedHeartIdsRef.current.has(n.id);
      })
      .slice(0, 5);
    hearts.forEach((n) => {
      runHeartAnalysis(n.id, { plain_text: n.plain_text, content: n.content, tags: n.tags });
    });
  }, [notes]);

  const river = useMemo(() => buildFlowLine(tasks, notes), [tasks, notes]);
  const riverInsight = useMemo(() => buildRiverInsight(river, tasks, notes), [river, tasks, notes]);
  const rhythm = useMemo(() => buildRhythm(tasks), [tasks]);
  const contextCards = useMemo(() => buildContextCards(sentinel, assoc, tasks), [sentinel, assoc, tasks]);
  const guardianRecords = useMemo(() => {
    return (executions || [])
      .filter((e) => e.automation_type && e.automation_type !== "none")
      .slice(0, 3);
  }, [executions]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [tasksRes, notesRes, execRes, sentinelRes, assocRes, briefingRes] = await Promise.allSettled([
        get("/tasks", { parent_task_id: "", limit: 200 }, { silent: true }),
        get("/notes", { limit: 100 }, { silent: true }),
        get("/task-executions", { limit: 20 }, { silent: true }),
        loadSentinel(),
        loadAssoc(),
        post("/functions/generateDailyBriefing", {}, { silent: true })
      ]);
      const taskList = tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value) ? tasksRes.value : [];
      const noteList = notesRes.status === "fulfilled" && Array.isArray(notesRes.value) ? notesRes.value : [];
      const execList = execRes.status === "fulfilled" && Array.isArray(execRes.value) ? execRes.value : [];
      const sentinelData = sentinelRes.status === "fulfilled" ? sentinelRes.value : null;
      const assocData = assocRes.status === "fulfilled" ? assocRes.value : null;
      const briefingData = briefingRes.status === "fulfilled" && briefingRes.value ? briefingRes.value : null;
      setTasks(taskList);
      setNotes(noteList);
      setExecutions(execList);
      setSentinel(sentinelData);
      setAssoc(assocData);
      setBriefing(briefingData);
    } catch (_err) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const loadSentinel = async () => {
    try {
      const coords = await getLocationSafe();
      return await post("/functions/getSentinelGuard", coords || {}, { silent: true });
    } catch (_err) {
      return null;
    }
  };

  const loadAssoc = async () => {
    try {
      const coords = await getLocationSafe();
      return await post("/functions/getAssociationRecommendations", coords || {}, { silent: true });
    } catch (_err) {
      return null;
    }
  };

  const toggleTaskDone = async (task) => {
    try {
      await patch(`/tasks/${task.id}`, { status: isDone(task) ? "pending" : "completed" });
      loadAll();
    } catch (_err) {}
  };

  const rescheduleTask = async (task, time = "09:00") => {
    try {
      const next = tomorrowAt(time);
      await patch(`/tasks/${task.id}`, { end_time: next, reminder_time: next });
      Taro.showToast({ title: "已重新安排", icon: "success" });
      loadAll();
    } catch (_err) {
      Taro.showToast({ title: "安排失败", icon: "none" });
    }
  };

  const letGoTask = async (task) => {
    try {
      await patch(`/tasks/${task.id}`, { status: "completed" });
      Taro.showToast({ title: "已轻轻放下", icon: "success" });
      loadAll();
    } catch (_err) {
      Taro.showToast({ title: "操作失败", icon: "none" });
    }
  };

  const moveToDeep = async (hour = null, targetId = null) => {
    const target = targetId
      ? tasks.find((t) => t.id === targetId)
      : tasks.find((t) => !isDone(t) && ["urgent", "high"].includes(t.priority)) ||
        tasks.find((t) => !isDone(t) && isToday(taskTime(t))) ||
        tasks.find((t) => !isDone(t));
    if (!target?.id) {
      Taro.showToast({ title: "暂无可移动的约定", icon: "none" });
      return;
    }
    const h = hour != null ? hour : river?.deep?.start || 9;
    const time = `${pad(h)}:30`;
    try {
      await patch(`/tasks/${target.id}`, { end_time: tomorrowAt(time), reminder_time: tomorrowAt(time) });
      Taro.showToast({ title: "已移入明天深流时段", icon: "success" });
      loadAll();
    } catch (_err) {
      Taro.showToast({ title: "移动失败，请检查网络", icon: "none" });
    }
  };

  const handleRhythmAction = () => {
    if (!rhythm?.action) return;
    if (rhythm.action === "move-to-slot") {
      moveToDeep(rhythm.payload?.hour);
    } else if (rhythm.action === "create-small") {
      Taro.navigateTo({ url: "/pages/task-create/index?title=最小的一步" });
    } else if (rhythm.action === "split-next") {
      const next = tasks
        .filter((t) => !isDone(t))
        .sort((a, b) => dueWeight(b) - dueWeight(a))[0];
      if (next?.id) {
        Taro.navigateTo({
          url: `/pages/task-create/index?parent_task_id=${next.id}&title=${encodeURIComponent(next.title)}`
        });
      } else {
        Taro.navigateTo({ url: "/pages/tasks/index" });
      }
    } else if (rhythm.action === "view-tasks") {
      Taro.navigateTo({ url: "/pages/tasks/index" });
    }
  };

  const goTask = (id) => {
    Taro.navigateTo({ url: `/pages/task-detail/index?id=${id}` });
  };

  const startFocus = (task, minutes = 30) => {
    if (focusTimerRef.current) clearInterval(focusTimerRef.current);
    setFocusTask(task);
    setFocusSeconds(minutes * 60);
    focusTimerRef.current = setInterval(() => {
      setFocusSeconds((s) => {
        if (s <= 1) {
          clearInterval(focusTimerRef.current);
          focusTimerRef.current = null;
          Taro.showToast({ title: "专注完成，已记入河流", icon: "success" });
          setFocusTask(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const stopFocus = () => {
    if (focusTimerRef.current) {
      clearInterval(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    setFocusTask(null);
    setFocusSeconds(0);
  };

  const openWebview = async (url) => {
    if (!url || !url.startsWith("http")) {
      Taro.showToast({ title: "链接无效", icon: "none" });
      return;
    }
    try {
      await Taro.navigateTo({ url: `/pages/webview/index?url=${encodeURIComponent(url)}` });
    } catch (_err) {
      Taro.setClipboardData({ data: url });
      Taro.showToast({ title: "链接已复制", icon: "success" });
    }
  };

  const saveHeart = async (text) => {
    // 先快速保存默认心签，避免用户等待
    const note = await post("/notes", {
      title: "心签",
      content: text,
      plain_text: text,
      tags: ["情绪", "心签"]
    });
    Taro.showToast({ title: "心签已保存", icon: "success" });

    // 后台调用 analyzeHeartSign 生成标题、标签和温暖回应
    if (note?.id) {
      runHeartAnalysis(note.id, { plain_text: text, content: text, tags: ["情绪", "心签"] });
    }
  };

  const saveLink = async (text) => {
    const url = extractUrl(text);
    await post("/notes", {
      title: text.slice(0, 60).replace(url, "").trim() || "外部链接",
      content: text,
      tags: ["外部信息", "链接"]
    });
    Taro.showToast({ title: "链接已保存", icon: "success" });
    loadAll();
  };

  function parseQuickTime(text) {
    const now = new Date();
    const t = String(text || "");

    const minMatch = t.match(/(\d+)\s*分钟后/);
    if (minMatch) {
      const d = new Date(now.getTime() + parseInt(minMatch[1], 10) * 60 * 1000);
      return { date: toChinaYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
    }

    if (/半小时后/.test(t)) {
      const d = new Date(now.getTime() + 30 * 60 * 1000);
      return { date: toChinaYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
    }

    const hourMatch = t.match(/(\d+)\s*小时后/);
    if (hourMatch) {
      const d = new Date(now.getTime() + parseInt(hourMatch[1], 10) * 60 * 60 * 1000);
      return { date: toChinaYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
    }

    const pmMatch = t.match(/(?:今天下午|今晚)\s*(\d+)(?:点|：|:)?(?:30|半)?/);
    if (pmMatch) {
      const hour = parseInt(pmMatch[1], 10);
      const minute = /半/.test(t) ? 30 : 0;
      const d = new Date();
      d.setHours(hour, minute, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return { date: toChinaYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
    }

    const tomorrowMatch = t.match(/明天(?:上午|下午|晚上)?\s*(\d+)(?:点|：|:)?(?:30|半)?/);
    if (tomorrowMatch) {
      const hour = parseInt(tomorrowMatch[1], 10);
      const minute = /半/.test(t) ? 30 : 0;
      let finalHour = hour;
      if (t.includes("下午") && hour < 12) finalHour = hour + 12;
      if (t.includes("晚上") && hour < 12) finalHour = hour + 12;
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(finalHour, minute, 0, 0);
      return { date: toChinaYmd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
    }

    return null;
  }

  function extractIntentTitle(text) {
    const t = String(text || "");
    const reminderMatch = t.match(/提醒[我你]?(.*?)(?:，|。|\d|半小时|小时|分钟|$)/);
    if (reminderMatch && reminderMatch[1].trim()) return reminderMatch[1].trim();
    const doMatch = t.match(/(?:帮我|给我|记得|要)(.*?)(?:，|。|\d|半小时|小时|分钟|$)/);
    if (doMatch && doMatch[1].trim()) return doMatch[1].trim();
    return t.slice(0, 60);
  }

  async function createTaskFromIntent(text, timeInfo, intent) {
    const title = intent || extractIntentTitle(text) || text.slice(0, 60);
    await post("/tasks", {
      title,
      description: text,
      priority: "medium",
      category: "other",
      end_time: timeInfo.date && timeInfo.time ? chinaIso(timeInfo.date, timeInfo.time) : undefined
    });
  }

  const analyzeRoute = async (text) => {
    setAnalyzing(true);
    const quickTime = parseQuickTime(text);
    try {
      const data = await post("/functions/analyzeIntent", { input: text, date: toChinaYmd(new Date()) }, { silent: true });
      const timeline = Array.isArray(data?.timeline) ? data.timeline : [];
      if (timeline.length > 0) {
        const first = timeline.find((t) => t.date && t.time) || timeline[0];
        await createTaskFromIntent(text, first, data?.parsed?.intents?.[0]);
        Taro.showToast({ title: "约定已创建", icon: "success" });
      } else if (quickTime) {
        await createTaskFromIntent(text, quickTime);
        Taro.showToast({ title: "约定已创建", icon: "success" });
      } else {
        await post("/notes", { title: "记录", content: text });
        Taro.showToast({ title: "已记录", icon: "success" });
      }
      loadAll();
    } catch (_err) {
      if (quickTime) {
        await createTaskFromIntent(text, quickTime);
        Taro.showToast({ title: "约定已创建", icon: "success" });
      } else {
        await post("/notes", { title: "记录", content: text });
        Taro.showToast({ title: "已记录", icon: "success" });
      }
      loadAll();
    } finally {
      setAnalyzing(false);
    }
  };


  const handleSend = async (explicitText) => {
    if (isGuest) {
      Taro.navigateTo({ url: "/pages/login/index" });
      return;
    }
    const text = String(explicitText || inputText).trim();
    if (!text || analyzing) return;
    if (!explicitText) {
      setInputText("");
    }
    setInputPlaceholder("已收下，晚些时候一起看看");
    setTimeout(() => setInputPlaceholder("此刻想记下什么？"), 2500);
    if (extractUrl(text)) {
      await saveLink(text);
    } else if (
      text.length <= 120 &&
      /[情绪心累烦焦虑难过开心感谢慢放弃迷茫无助沮丧失望生气愤怒温暖幸福满足被爱孤独压力希望害怕担心纠结]/.test(text)
    ) {
      await saveHeart(text);
    } else {
      await analyzeRoute(text);
    }
  };

  const handleVoiceResult = (text) => {
    setShowVoiceModal(false);
    if (!text.trim()) return;
    handleSend(text);
  };

  const quickAction = (type) => {
    if (isGuest) {
      Taro.navigateTo({ url: "/pages/login/index" });
      return;
    }
    if (type === "heart") {
      Taro.navigateTo({ url: "/pages/note-create/index?tag=heart" });
    } else if (type === "task") {
      Taro.navigateTo({ url: "/pages/task-create/index" });
    } else if (type === "voice") {
      setShowVoiceModal(true);
    } else if (type === "photo") {
      Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success: async (res) => {
          const file = res.tempFiles?.[0];
          if (!file?.tempFilePath) return;
          Taro.showLoading({ title: "上传中" });
          try {
            const token = getToken();
            const rawApi = process.env.TARO_APP_API || "https://www.xinzhan-soulsentry.cn/api";
            const apiBase = rawApi.replace(/\/$/, "");
            const uploadUrl = apiBase.endsWith("/api") ? `${apiBase}/uploads` : `${apiBase}/api/uploads`;
            const uploadRes = await Taro.uploadFile({
              url: uploadUrl,
              filePath: file.tempFilePath,
              name: "file",
              header: token ? { Authorization: `Bearer ${token}` } : {},
              timeout: 60000
            });
            const data = JSON.parse(uploadRes.data || "{}");
            if (uploadRes.statusCode >= 200 && uploadRes.statusCode < 300 && data.file_url) {
              await post("/notes", { title: "图片记录", content: data.file_url, tags: ["外部信息", "图片"] });
              Taro.showToast({ title: "图片已保存", icon: "success" });
              loadAll();
            } else {
              throw new Error(data?.message || "上传失败");
            }
          } catch (err) {
            Taro.showToast({ title: err?.message || "上传失败", icon: "none" });
          } finally {
            Taro.hideLoading();
          }
        },
        fail: () => Taro.showToast({ title: "选择图片失败", icon: "none" })
      });
    }
  };

  const renderGuestBanner = () => {
    if (!isGuest) return null;
    return (
      <View
        onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}
        style={{
          margin: "0 24rpx 16rpx",
          padding: "18rpx 24rpx",
          borderRadius: "12rpx",
          background: "#fff8e6",
          border: "1rpx solid #f5d78e",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Text style={{ fontSize: "26rpx", color: "#8a6d3b" }}>游客模式 · 登录后查看你的专属数据</Text>
        <Text style={{ fontSize: "24rpx", color: "#384877", fontWeight: 500 }}>去登录 →</Text>
      </View>
    );
  };

  const renderHeader = () => (
    <View
      style={{
        padding: "24rpx 32rpx 16rpx",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}
    >
      <View style={{ display: "flex", alignItems: "center" }}>
        <View
          style={{
            width: "52rpx",
            height: "52rpx",
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${THEME.primaryLight}, ${THEME.primary})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: "18rpx"
          }}
        >
          <Text style={{ fontSize: "26rpx", color: "#fff" }}>♡</Text>
        </View>
        <View>
          <Text style={{ fontSize: "32rpx", fontWeight: 500, color: THEME.ink }}>心栈 · 流</Text>
          <Text style={{ fontSize: "20rpx", color: THEME.inkQuaternary, marginTop: "-4rpx" }}>
            {greetByHour()}，今天也要善待自己
          </Text>
        </View>
      </View>
    </View>
  );

  const renderRiver = () => {
    const points = river?.points || [];
    const deep = river?.deep;
    const nowHour = new Date().getHours();
    const currentSegment = river?.segments?.find((s) => s.hour === nowHour);
    const heartNotes = notes.filter((n) => isHeartNote(n) && isToday(n.created_date));

    const headline = (() => {
      if (deep && nowHour >= deep.start && nowHour <= deep.end) {
        return `此刻你正站在 ${deep.start}:00–${deep.end + 1}:00 的深流里`;
      }
      if (currentSegment?.type === "agreement") {
        return `${nowHour}:00 这里标记了一个「${currentSegment.label || "约定"}」`;
      }
      if (currentSegment?.type === "habit") {
        return `${nowHour}:00 是你「${currentSegment.label || "习惯"}」的时间`;
      }
      if (currentSegment?.type === "relax") {
        return `${nowHour}:00 的河流很平缓，适合喘口气`;
      }
      if (deep) {
        return `${deep.start}:00 前后有一段 ${(deep.end - deep.start + 1) * 60} 分钟的深流`;
      }
      if (river?.doneToday) {
        return `今天已完成 ${river.doneToday} 件，河流正在流动`;
      }
      return "今天的河流还在等待第一条波纹";
    })();

    const sub = deep
      ? "深流、心签、习惯、放松、约定，河流会根据你的一天自动调整形状。"
      : river?.doneToday
        ? "继续往前划，河流会自己延续。"
        : "记录或完成一件小事，心流就会开始。";

    return (
      <View style={{ padding: "8rpx 32rpx 18rpx" }}>
        <View
          style={{
            borderRadius: "36rpx",
            padding: "36rpx 28rpx 32rpx",
            background: `linear-gradient(160deg, #2b3a4a 0%, ${THEME.primary} 60%, ${THEME.primaryLight} 100%)`,
            boxShadow: "0 16rpx 48rpx rgba(56,72,119,0.18)",
            position: "relative",
            overflow: "hidden"
          }}
        >
          <Text style={{ fontSize: "20rpx", color: "rgba(255,255,255,0.45)", letterSpacing: "2rpx" }}>今天的河流</Text>
          <Text
            style={{
              fontSize: "34rpx",
              fontWeight: 300,
              color: "#fff",
              marginTop: "12rpx",
              lineHeight: "52rpx",
              wordBreak: "break-all"
            }}
          >
            {headline}
          </Text>
          <Text
            style={{
              fontSize: "24rpx",
              color: "rgba(255,255,255,0.55)",
              marginTop: "6rpx",
              lineHeight: "40rpx",
              wordBreak: "break-all"
            }}
          >
            {sub}
          </Text>

          <View style={{ marginTop: "24rpx", height: "200rpx" }}>
            <RiverCanvas points={points} deep={deep} heartNotes={heartNotes} />
          </View>

          <View style={{ display: "flex", marginTop: "12rpx", paddingHorizontal: "4rpx", flexWrap: "wrap" }}>
            <View style={{ display: "flex", alignItems: "center", marginRight: "16rpx", marginBottom: "8rpx" }}>
              <View style={{ width: "10rpx", height: "10rpx", borderRadius: "50%", background: "#fff", marginRight: "6rpx" }} />
              <Text style={{ fontSize: "20rpx", color: "rgba(255,255,255,0.45)" }}>深流</Text>
            </View>
            <View style={{ display: "flex", alignItems: "center", marginRight: "16rpx", marginBottom: "8rpx" }}>
              <View style={{ width: "10rpx", height: "10rpx", borderRadius: "50%", background: "#e8a5a5", marginRight: "6rpx" }} />
              <Text style={{ fontSize: "20rpx", color: "rgba(255,255,255,0.45)" }}>心签</Text>
            </View>
            <View style={{ display: "flex", alignItems: "center", marginRight: "16rpx", marginBottom: "8rpx" }}>
              <View style={{ width: "10rpx", height: "10rpx", borderRadius: "50%", background: "#d8b98a", marginRight: "6rpx" }} />
              <Text style={{ fontSize: "20rpx", color: "rgba(255,255,255,0.45)" }}>习惯</Text>
            </View>
            <View style={{ display: "flex", alignItems: "center", marginRight: "16rpx", marginBottom: "8rpx" }}>
              <View style={{ width: "10rpx", height: "10rpx", borderRadius: "50%", background: "#c7a8c8", marginRight: "6rpx" }} />
              <Text style={{ fontSize: "20rpx", color: "rgba(255,255,255,0.45)" }}>放松</Text>
            </View>
            <View style={{ display: "flex", alignItems: "center", marginRight: "16rpx", marginBottom: "8rpx" }}>
              <View style={{ width: "10rpx", height: "10rpx", borderRadius: "50%", background: "#ffd6a5", marginRight: "6rpx" }} />
              <Text style={{ fontSize: "20rpx", color: "rgba(255,255,255,0.45)" }}>约定</Text>
            </View>
            <View style={{ display: "flex", alignItems: "center", marginBottom: "8rpx" }}>
              <View style={{ width: "16rpx", height: "8rpx", borderRadius: "4rpx", background: "rgba(168,197,217,0.3)", marginRight: "6rpx" }} />
              <Text style={{ fontSize: "20rpx", color: "rgba(255,255,255,0.45)" }}>深流区</Text>
            </View>
          </View>

          <View
            style={{
              marginTop: "22rpx",
              padding: "20rpx 22rpx",
              borderRadius: "16rpx",
              background: "rgba(255,255,255,0.08)",
              border: "1rpx solid rgba(255,255,255,0.1)"
            }}
          >
            <Text style={{ fontSize: "24rpx", color: "rgba(255,255,255,0.8)", lineHeight: "42rpx", wordBreak: "break-all" }}>{riverInsight.text}</Text>
            <View
              onClick={() => {
                if (riverInsight.action === "move-to-deep") {
                  moveToDeep();
                } else if (riverInsight.action === "move-to-slot") {
                  moveToDeep(riverInsight.payload?.hour, riverInsight.payload?.taskId);
                } else if (riverInsight.action === "pick") {
                  Taro.navigateTo({ url: "/pages/tasks/index" });
                } else if (riverInsight.action === "go-task" && riverInsight.payload?.id) {
                  goTask(riverInsight.payload.id);
                } else {
                  setInputFocus(true);
                }
              }}
              style={{
                marginTop: "14rpx",
                alignSelf: "flex-start",
                padding: "12rpx 22rpx",
                borderRadius: "12rpx",
                background: "rgba(255,255,255,0.92)"
              }}
            >
              <Text style={{ fontSize: "24rpx", fontWeight: 500, color: THEME.primary }}>{riverInsight.actionText}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderNow = () => {
    const todayYmd = toChinaYmd(new Date());
    const isTodaySelected = selectedDueDate === todayYmd;
    const dueList = tasks
      .filter((t) => {
        const tt = taskTime(t);
        return tt && toChinaYmd(tt) === selectedDueDate;
      })
      .sort((a, b) => dueWeight(b) - dueWeight(a));

    const shiftDueDate = (days) => {
      const [y, m, d] = selectedDueDate.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      date.setDate(date.getDate() + days);
      setSelectedDueDate(toChinaYmd(date));
    };

    const dateLabel = (() => {
      if (isTodaySelected) return "今天";
      const [y, m, d] = selectedDueDate.split("-").map(Number);
      const today = new Date();
      const selected = new Date(y, m - 1, d);
      const diff = Math.round((selected - today) / (1000 * 60 * 60 * 24));
      if (diff === -1) return "昨天";
      if (diff === 1) return "明天";
      return `${m}月${d}日`;
    })();

    const cardStyle = {
      background: THEME.card,
      borderRadius: "28rpx",
      border: `1rpx solid ${THEME.waterFaint}`,
      padding: "28rpx",
      boxShadow: "0 4rpx 16rpx rgba(56,72,119,0.06)"
    };

    if (dueList.length === 0) {
      return (
        <View style={{ padding: "18rpx 32rpx 6rpx" }}>
          <View style={cardStyle}>
            <View
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "20rpx"
              }}
            >
              <View style={{ display: "flex", alignItems: "center" }}>
                <View
                  style={{
                    width: "6rpx",
                    height: "28rpx",
                    borderRadius: "4rpx",
                    background: THEME.primaryLight,
                    marginRight: "16rpx"
                  }}
                />
                <Text style={{ fontSize: "26rpx", fontWeight: 500, color: THEME.inkTertiary }}>
                  {isTodaySelected ? "今日到期" : "当日约定"}
                </Text>
              </View>
              <View style={{ display: "flex", alignItems: "center" }}>
                <Text
                  style={{ fontSize: "24rpx", color: THEME.primary, padding: "8rpx" }}
                  onClick={() => shiftDueDate(-1)}
                >
                  ‹
                </Text>
                <Text style={{ fontSize: "24rpx", color: THEME.inkSecondary, marginHorizontal: "12rpx", minWidth: "80rpx", textAlign: "center" }}>
                  {dateLabel}
                </Text>
                <Text
                  style={{ fontSize: "24rpx", color: THEME.primary, padding: "8rpx" }}
                  onClick={() => shiftDueDate(1)}
                >
                  ›
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: "26rpx", color: THEME.inkQuaternary, lineHeight: "44rpx" }}>
              {isTodaySelected ? "今天还没有到期的约定，河流可以慢一点。" : "这一天没有约定。"}
            </Text>
          </View>
        </View>
      );
    }

    const top = dueList[0];
    const rest = dueList.slice(1);

    return (
      <View style={{ padding: "18rpx 32rpx 6rpx" }}>
        <View style={cardStyle}>
          <View
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "20rpx"
            }}
          >
            <View style={{ display: "flex", alignItems: "center" }}>
              <View
                style={{
                  width: "6rpx",
                  height: "28rpx",
                  borderRadius: "4rpx",
                  background: THEME.primaryLight,
                  marginRight: "16rpx"
                }}
              />
              <Text style={{ fontSize: "26rpx", fontWeight: 500, color: THEME.inkTertiary }}>
                {isTodaySelected ? "今日到期" : "当日约定"}
              </Text>
            </View>
            <View style={{ display: "flex", alignItems: "center" }}>
              <Text
                style={{ fontSize: "24rpx", color: THEME.primary, padding: "8rpx" }}
                onClick={() => shiftDueDate(-1)}
              >
                ‹
              </Text>
              <Text style={{ fontSize: "24rpx", color: THEME.inkSecondary, marginHorizontal: "12rpx", minWidth: "80rpx", textAlign: "center" }}>
                {dateLabel}
              </Text>
              <Text
                style={{ fontSize: "24rpx", color: THEME.primary, padding: "8rpx" }}
                onClick={() => shiftDueDate(1)}
              >
                ›
              </Text>
            </View>
          </View>

          <View
            onClick={() => goTask(top.id)}
            style={{
              background: THEME.paper,
              borderRadius: "20rpx",
              padding: "22rpx",
              borderLeft: `6rpx solid ${isOverdue(top) ? THEME.heart : THEME.primary}`,
              marginBottom: "16rpx"
            }}
          >
            <View style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8rpx" }}>
              <Text
                style={{
                  fontSize: "30rpx",
                  fontWeight: 500,
                  color: THEME.ink,
                  flex: 1,
                  lineHeight: "46rpx",
                  marginRight: "16rpx",
                  wordBreak: "break-all"
                }}
              >
                {top.title}
              </Text>
              {isDone(top) && (
                <Text style={{ fontSize: "22rpx", color: THEME.done, flexShrink: 0 }}>已完成</Text>
              )}
            </View>
            <View style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              <View
                style={{
                  padding: "4rpx 12rpx",
                  borderRadius: "8rpx",
                  background: isOverdue(top) ? THEME.heartBg : THEME.primaryMist,
                  marginRight: "12rpx",
                  marginBottom: "6rpx"
                }}
              >
                <Text style={{ fontSize: "20rpx", color: isOverdue(top) ? THEME.heartDeep : THEME.primary }}>
                  {isOverdue(top) ? "已逾期" : formatTime(taskTime(top))}
                </Text>
              </View>
              <Text style={{ fontSize: "22rpx", color: THEME.inkQuaternary, marginBottom: "6rpx" }}>
                {CATEGORY_LABEL[top.category] || top.category || "其他"}
              </Text>
              {top.reminder_time && (
                <View
                  style={{
                    padding: "2rpx 10rpx",
                    borderRadius: "8rpx",
                    background: THEME.primaryMist,
                    marginLeft: "10rpx",
                    marginBottom: "6rpx"
                  }}
                >
                  <Text style={{ fontSize: "18rpx", color: THEME.primary }}>已设提醒</Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ display: "flex", flexWrap: "wrap" }}>
            <View
              onClick={() => toggleTaskDone(top)}
              style={{
                padding: "10rpx 18rpx",
                borderRadius: "10rpx",
                background: THEME.doneBg,
                marginRight: "12rpx",
                marginBottom: "10rpx"
              }}
            >
              <Text style={{ fontSize: "22rpx", color: "#4a8a5e" }}>{isDone(top) ? "恢复" : "✓ 已完成"}</Text>
            </View>
            {!isFixedTimeTask(top) && (
              <View
                onClick={() => rescheduleTask(top, "21:00")}
                style={{
                  padding: "10rpx 18rpx",
                  borderRadius: "10rpx",
                  background: THEME.paper,
                  border: `1rpx solid ${THEME.border}`,
                  marginRight: "12rpx",
                  marginBottom: "10rpx"
                }}
              >
                <Text style={{ fontSize: "22rpx", color: THEME.inkTertiary }}>稍后</Text>
              </View>
            )}
            <View
              onClick={() => goTask(top.id)}
              style={{
                padding: "10rpx 18rpx",
                borderRadius: "10rpx",
                background: THEME.paper,
                border: `1rpx solid ${THEME.border}`,
                marginBottom: "10rpx"
              }}
            >
              <Text style={{ fontSize: "22rpx", color: THEME.inkTertiary }}>查看</Text>
            </View>
          </View>

          {rest.length > 0 && (
            <View
              onClick={() => setShowAllDue((v) => !v)}
              style={{
                marginTop: "12rpx",
                paddingTop: "16rpx",
                borderTop: `1rpx dashed ${THEME.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <Text style={{ fontSize: "24rpx", color: THEME.inkQuaternary }}>
                {showAllDue ? "收起其他约定" : `还有 ${rest.length} 件约定`}
              </Text>
              <Text style={{ fontSize: "24rpx", color: THEME.inkQuaternary }}>{showAllDue ? "▲" : "▼"}</Text>
            </View>
          )}

          {showAllDue &&
            rest.map((t) => (
              <View
                key={t.id}
                onClick={() => goTask(t.id)}
                style={{
                  marginTop: "14rpx",
                  padding: "18rpx",
                  borderRadius: "16rpx",
                  background: THEME.paper,
                  borderLeft: `6rpx solid ${isOverdue(t) ? THEME.heart : THEME.border}`
                }}
              >
                <View style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6rpx" }}>
                  <Text
                    style={{
                      fontSize: "28rpx",
                      color: isDone(t) ? THEME.inkQuaternary : THEME.ink,
                      flex: 1,
                      lineHeight: "44rpx",
                      marginRight: "12rpx",
                      wordBreak: "break-all",
                      textDecoration: isDone(t) ? "line-through" : "none"
                    }}
                  >
                    {t.title}
                  </Text>
                  {isDone(t) && <Text style={{ fontSize: "20rpx", color: THEME.done, flexShrink: 0 }}>已完成</Text>}
                </View>
                <View style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                  <View
                    style={{
                      padding: "2rpx 10rpx",
                      borderRadius: "8rpx",
                      background: isOverdue(t) ? THEME.heartBg : THEME.primaryMist,
                      marginRight: "10rpx",
                      marginBottom: "4rpx"
                    }}
                  >
                    <Text style={{ fontSize: "18rpx", color: isOverdue(t) ? THEME.heartDeep : THEME.primary }}>
                      {isOverdue(t) ? "已逾期" : formatTime(taskTime(t))}
                    </Text>
                  </View>
                  <Text style={{ fontSize: "20rpx", color: THEME.inkQuaternary, marginBottom: "4rpx" }}>
                    {CATEGORY_LABEL[t.category] || t.category || "其他"}
                  </Text>
                </View>
              </View>
            ))}
        </View>
      </View>
    );
  };

  const renderVision = () => {
    if (!briefing?.long_term_narrative) return null;
    const stats = briefing.task_stats || {};
    return (
      <View style={{ padding: "18rpx 32rpx 6rpx" }}>
        <View
          style={{
            borderRadius: "28rpx",
            padding: "28rpx",
            background: THEME.card,
            border: `1rpx solid ${THEME.primaryFaint}`,
            boxShadow: "0 4rpx 16rpx rgba(56,72,119,0.06)"
          }}
        >
          <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16rpx" }}>
            <View style={{ display: "flex", alignItems: "center" }}>
              <View
                style={{
                  width: "44rpx",
                  height: "44rpx",
                  borderRadius: "12rpx",
                  background: `linear-gradient(135deg, ${THEME.primaryLight}, ${THEME.primary})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: "14rpx"
                }}
              >
                <Text style={{ fontSize: "22rpx", color: "#fff" }}>◐</Text>
              </View>
              <View>
                <Text style={{ fontSize: "28rpx", fontWeight: 500, color: THEME.ink }}>远见与思考</Text>
                <Text style={{ fontSize: "20rpx", color: THEME.inkQuaternary, marginTop: "-2rpx" }}>Long-Term</Text>
              </View>
            </View>
            <View
              onClick={loadAll}
              style={{
                padding: "8rpx 16rpx",
                borderRadius: "20rpx",
                background: THEME.primaryMist
              }}
            >
              <Text style={{ fontSize: "20rpx", color: THEME.primary }}>⟳ 刷新</Text>
            </View>
          </View>

          <Text
            style={{
              fontSize: "26rpx",
              color: THEME.inkSecondary,
              lineHeight: "46rpx",
              marginBottom: "16rpx",
              wordBreak: "break-all"
            }}
          >
            {briefing.long_term_narrative}
          </Text>

          {briefing.mindful_tip && (
            <View
              style={{
                padding: "14rpx 18rpx",
                borderRadius: "14rpx",
                background: THEME.paper,
                border: `1rpx dashed ${THEME.border}`,
                marginBottom: "16rpx"
              }}
            >
              <Text
                style={{
                  fontSize: "24rpx",
                  color: THEME.inkTertiary,
                  fontStyle: "italic",
                  lineHeight: "40rpx",
                  wordBreak: "break-all"
                }}
              >
                “{briefing.mindful_tip}”
              </Text>
            </View>
          )}

          <View style={{ display: "flex", flexWrap: "wrap" }}>
            {stats.active != null && (
              <View style={{ padding: "4rpx 12rpx", borderRadius: "8rpx", background: THEME.primaryMist, marginRight: "10rpx", marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "20rpx", color: THEME.primary }}>活跃 {stats.active}</Text>
              </View>
            )}
            {stats.urgent > 0 && (
              <View style={{ padding: "4rpx 12rpx", borderRadius: "8rpx", background: THEME.heartBg, marginRight: "10rpx", marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "20rpx", color: THEME.heartDeep }}>紧急 {stats.urgent}</Text>
              </View>
            )}
            {stats.overdue > 0 && (
              <View style={{ padding: "4rpx 12rpx", borderRadius: "8rpx", background: THEME.goldBg, marginRight: "10rpx", marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "20rpx", color: "#a8875a" }}>逾期 {stats.overdue}</Text>
              </View>
            )}
            {stats.today_due > 0 && (
              <View style={{ padding: "4rpx 12rpx", borderRadius: "8rpx", background: "#e8f1f8", marginRight: "10rpx", marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "20rpx", color: "#6b9dc7" }}>今日到期 {stats.today_due}</Text>
              </View>
            )}
            {stats.recent_completed != null && (
              <View style={{ padding: "4rpx 12rpx", borderRadius: "8rpx", background: THEME.doneBg, marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "20rpx", color: "#4a8a5e" }}>已完成 {stats.recent_completed}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderRhythm = () => {
    if (!rhythm?.text) return null;
    const maxCount = Math.max(...rhythm.weekDays.map((d) => d.count), 1);
    return (
      <View style={{ padding: "18rpx 32rpx 6rpx" }}>
        <View
          style={{
            borderRadius: "28rpx",
            padding: "28rpx",
            background: `linear-gradient(135deg, ${THEME.primary} 0%, ${THEME.primaryLight} 100%)`,
            boxShadow: "0 12rpx 36rpx rgba(56,72,119,0.14)"
          }}
        >
          <View style={{ display: "flex", alignItems: "center", marginBottom: "16rpx" }}>
            <Text style={{ fontSize: "30rpx", marginRight: "12rpx" }}>🌊</Text>
            <Text style={{ fontSize: "28rpx", fontWeight: 500, color: "#fff" }}>本周节奏</Text>
          </View>
          <Text
            style={{
              fontSize: "26rpx",
              color: "rgba(255,255,255,0.85)",
              lineHeight: "44rpx",
              marginBottom: "18rpx",
              wordBreak: "break-all"
            }}
          >
            {rhythm.text}
          </Text>

          <View style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "18rpx" }}>
            {rhythm.weekDays.map((d) => (
              <View key={d.ymd} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <View
                  style={{
                    width: "20rpx",
                    borderRadius: "6rpx",
                    height: `${Math.max(8, (d.count / maxCount) * 64)}rpx`,
                    background: d.count > 0 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.18)",
                    marginBottom: "8rpx"
                  }}
                />
                <Text style={{ fontSize: "18rpx", color: "rgba(255,255,255,0.55)" }}>{d.label}</Text>
              </View>
            ))}
          </View>

          <View
            onClick={handleRhythmAction}
            style={{
              alignSelf: "flex-start",
              padding: "12rpx 24rpx",
              borderRadius: "12rpx",
              background: "rgba(255,255,255,0.92)"
            }}
          >
            <Text style={{ fontSize: "24rpx", fontWeight: 500, color: THEME.primary }}>{rhythm.actionText}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderDueTasks = () => {
    const dueToday = tasks
      .filter((t) => !isDone(t) && isToday(taskTime(t)))
      .sort((a, b) => dueWeight(b) - dueWeight(a));
    const completedToday = tasks.filter((t) => isDone(t) && isToday(taskTime(t)));
    if (dueToday.length === 0 && completedToday.length === 0) return null;

    const activeDisplay = showAllDue ? dueToday : dueToday.slice(0, 3);

    return (
      <View style={{ padding: "18rpx 32rpx" }}>
        <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20rpx" }}>
          <View style={{ display: "flex", alignItems: "center" }}>
            <View style={{ width: "6rpx", height: "28rpx", borderRadius: "4rpx", background: THEME.primaryLight, marginRight: "16rpx" }} />
            <Text style={{ fontSize: "26rpx", fontWeight: 500, color: THEME.inkTertiary }}>今日到期</Text>
          </View>
          {dueToday.length > 3 && (
            <Text style={{ fontSize: "22rpx", color: THEME.primary }} onClick={() => setShowAllDue((v) => !v)}>
              {showAllDue ? "收起" : "查看更多"}
            </Text>
          )}
        </View>

        {activeDisplay.map((t) => (
          <View
            key={t.id}
            style={{
              background: THEME.card,
              borderRadius: "24rpx",
              border: `1rpx solid ${THEME.border}`,
              borderLeft: `6rpx solid ${isOverdue(t) ? THEME.heart : THEME.primary}`,
              padding: "24rpx",
              marginBottom: "16rpx",
              boxShadow: "0 2rpx 10rpx rgba(0,0,0,0.03)"
            }}
          >
            <View style={{ display: "flex", alignItems: "center", marginBottom: "6rpx" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: "30rpx", color: THEME.ink }}>{t.title}</Text>
              </View>
              <Text style={{ fontSize: "26rpx", color: THEME.inkQuaternary, marginLeft: "12rpx" }} onClick={() => goTask(t.id)}>
                ›
              </Text>
            </View>
            <View style={{ display: "flex", alignItems: "center", marginBottom: "18rpx" }}>
              <View
                style={{
                  padding: "4rpx 12rpx",
                  borderRadius: "8rpx",
                  background: isOverdue(t) ? THEME.heartBg : THEME.primaryMist,
                  marginRight: "12rpx"
                }}
              >
                <Text style={{ fontSize: "20rpx", color: isOverdue(t) ? THEME.heartDeep : THEME.primary }}>
                  {isOverdue(t) ? "已逾期" : formatTime(taskTime(t))}
                </Text>
              </View>
              <Text style={{ fontSize: "22rpx", color: THEME.inkQuaternary }}>{CATEGORY_LABEL[t.category] || t.category || "其他"}</Text>
              {t.reminder_time && (
                <View
                  style={{
                    padding: "2rpx 10rpx",
                    borderRadius: "8rpx",
                    background: THEME.primaryMist,
                    marginLeft: "10rpx"
                  }}
                >
                  <Text style={{ fontSize: "18rpx", color: THEME.primary }}>已设提醒</Text>
                </View>
              )}
            </View>
            <View style={{ display: "flex", flexWrap: "wrap" }}>
              <View
                onClick={() => toggleTaskDone(t)}
                style={{
                  padding: "10rpx 18rpx",
                  borderRadius: "10rpx",
                  background: THEME.doneBg,
                  marginRight: "12rpx",
                  marginBottom: "10rpx"
                }}
              >
                <Text style={{ fontSize: "22rpx", color: "#4a8a5e" }}>✓ 已完成</Text>
              </View>
              <View
                onClick={() => rescheduleTask(t, "21:00")}
                style={{
                  padding: "10rpx 18rpx",
                  borderRadius: "10rpx",
                  background: THEME.paper,
                  border: `1rpx solid ${THEME.border}`,
                  marginRight: "12rpx",
                  marginBottom: "10rpx"
                }}
              >
                <Text style={{ fontSize: "22rpx", color: THEME.inkTertiary }}>稍后</Text>
              </View>
              <View
                onClick={() =>
                  Taro.navigateTo({ url: `/pages/task-create/index?parent_task_id=${t.id}&title=${encodeURIComponent(t.title)}` })
                }
                style={{
                  padding: "10rpx 18rpx",
                  borderRadius: "10rpx",
                  background: THEME.paper,
                  border: `1rpx solid ${THEME.border}`,
                  marginRight: "12rpx",
                  marginBottom: "10rpx"
                }}
              >
                <Text style={{ fontSize: "22rpx", color: THEME.inkTertiary }}>拆小</Text>
              </View>
              <View
                onClick={() => letGoTask(t)}
                style={{
                  padding: "10rpx 18rpx",
                  borderRadius: "10rpx",
                  background: THEME.paper,
                  border: `1rpx solid ${THEME.border}`,
                  marginBottom: "10rpx"
                }}
              >
                <Text style={{ fontSize: "22rpx", color: THEME.inkTertiary }}>轻轻放下</Text>
              </View>
            </View>
          </View>
        ))}

        {completedToday.length > 0 && (
          <View style={{ marginTop: "8rpx" }}>
            <View
              onClick={() => setShowCompletedDue((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18rpx 24rpx",
                background: THEME.paper,
                borderRadius: "16rpx",
                border: `1rpx solid ${THEME.border}`
              }}
            >
              <Text style={{ fontSize: "24rpx", color: THEME.inkQuaternary }}>已完成约定（{completedToday.length}）</Text>
              <Text style={{ fontSize: "24rpx", color: THEME.inkQuaternary }}>{showCompletedDue ? "▲" : "▼"}</Text>
            </View>
            {showCompletedDue && (
              <View style={{ marginTop: "12rpx" }}>
                {completedToday.map((t) => (
                  <View
                    key={t.id}
                    style={{
                      background: THEME.card,
                      borderRadius: "20rpx",
                      border: `1rpx solid ${THEME.border}`,
                      padding: "20rpx",
                      marginBottom: "12rpx",
                      opacity: 0.7
                    }}
                  >
                    <Text style={{ fontSize: "28rpx", color: THEME.inkTertiary, textDecoration: "line-through" }}>{t.title}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderContext = () => {
    const PRIORITY_TEXT = { urgent: "紧急", high: "高", medium: "中", low: "低", default: "中" };
    const PRIORITY_COLOR = { urgent: "#e15d5d", high: "#e07b39", medium: "#384877", low: "#8e8e93", default: "#384877" };
    const PRIORITY_BG = { urgent: "#fde8e8", high: "#fff4e6", medium: "#eef0f5", low: "#f2f2f2", default: "#eef0f5" };
    const fmtTime = (iso) => {
      if (!iso) return "";
      const s = String(iso);
      return s.includes("T") ? s.slice(11, 16) : s.slice(0, 5);
    };

    const renderEmpty = () => (
      <View style={{ padding: "18rpx 32rpx" }}>
        <View style={{ display: "flex", alignItems: "center", marginBottom: "20rpx" }}>
          <View style={{ width: "6rpx", height: "28rpx", borderRadius: "4rpx", background: THEME.primaryLight, marginRight: "16rpx" }} />
          <Text style={{ fontSize: "26rpx", fontWeight: 500, color: THEME.inkTertiary }}>时空感知守护</Text>
        </View>
        <View style={{ background: "#f8f9fb", borderRadius: "24rpx", border: `1rpx dashed ${THEME.border}`, padding: "40rpx 24rpx", alignItems: "center" }}>
          <Text style={{ fontSize: "40rpx", marginBottom: "12rpx" }}>✦</Text>
          <Text style={{ fontSize: "28rpx", fontWeight: 500, color: THEME.ink, marginBottom: "8rpx" }}>一切安好</Text>
          <Text style={{ fontSize: "24rpx", color: THEME.inkTertiary, marginBottom: "20rpx" }}>没有检测到需要守护的情境事件</Text>
          <View onClick={loadAll} style={{ padding: "10rpx 24rpx", borderRadius: "10rpx", background: THEME.card, border: `1rpx solid ${THEME.border}` }}>
            <Text style={{ fontSize: "24rpx", color: THEME.inkTertiary }}>重新分析</Text>
          </View>
        </View>
      </View>
    );

    if (contextCards.length === 0) return renderEmpty();

    const CardShell = ({ children, borderColor, headerBg, icon, title, subtitle, tag, tagColor, tagBg }) => (
      <View style={{ background: THEME.card, borderRadius: "24rpx", border: `2rpx solid ${borderColor}`, overflow: "hidden", marginBottom: "16rpx", boxShadow: "0 2rpx 10rpx rgba(0,0,0,0.03)" }}>
        <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22rpx 24rpx 18rpx", background: headerBg }}>
          <View style={{ display: "flex", alignItems: "center", flex: 1, marginRight: "12rpx" }}>
            <Text style={{ fontSize: "32rpx", marginRight: "14rpx" }}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: "28rpx", fontWeight: 600, color: THEME.ink }}>{title}</Text>
              {subtitle && <Text style={{ fontSize: "20rpx", color: THEME.inkTertiary, marginTop: "4rpx" }}>{subtitle}</Text>}
            </View>
          </View>
          {tag && (
            <View style={{ padding: "4rpx 12rpx", borderRadius: "100rpx", background: tagBg, flexShrink: 0 }}>
              <Text style={{ fontSize: "18rpx", color: tagColor, fontWeight: 500 }}>{tag}</Text>
            </View>
          )}
        </View>
        <View style={{ padding: "22rpx 24rpx" }}>{children}</View>
      </View>
    );

    const ActionBtn = ({ label, primary, onClick, color, bg, border }) => (
      <View
        onClick={onClick}
        style={{
          padding: "10rpx 18rpx",
          borderRadius: "10rpx",
          background: primary ? (bg || THEME.primaryMist) : THEME.card,
          border: `1rpx solid ${primary ? (bg || THEME.primaryMist) : (border || THEME.border)}`,
          marginRight: "12rpx",
          marginBottom: "10rpx"
        }}
      >
        <Text style={{ fontSize: "22rpx", color: primary ? (color || THEME.primary) : THEME.inkTertiary, fontWeight: primary ? 500 : 400 }}>{label}</Text>
      </View>
    );

    return (
      <View style={{ padding: "18rpx 32rpx" }}>
        <View style={{ display: "flex", alignItems: "center", marginBottom: "20rpx" }}>
          <View style={{ width: "6rpx", height: "28rpx", borderRadius: "4rpx", background: THEME.primaryLight, marginRight: "16rpx" }} />
          <Text style={{ fontSize: "26rpx", fontWeight: 500, color: THEME.inkTertiary }}>时空感知守护</Text>
        </View>
        {contextCards.map((c, i) => {
          if (c.type === "geo") {
            const g = c.data;
            const eventLabel = g.event === "enter" ? `进入${g.location_name}附近` : `离开${g.location_name}附近`;
            const first = c.tasks[0];
            return (
              <CardShell
                key={i}
                icon="📍"
                title="地理情境感知"
                subtitle={`${eventLabel} · 刚刚`}
                tag="高优先级"
                borderColor="#bfdbfe"
                headerBg="#eff6ff"
                tagColor="#2563eb"
                tagBg="#dbeafe"
              >
                <View style={{ background: "#eff6ff", borderRadius: "16rpx", padding: "18rpx" }}>
                  <Text style={{ fontSize: "26rpx", fontWeight: 500, color: THEME.ink, lineHeight: "44rpx" }}>
                    您已到达{g.location_name}附近（{g.distance}米）
                  </Text>
                  <Text style={{ fontSize: "22rpx", color: THEME.inkTertiary, marginTop: "8rpx" }}>今日待办：</Text>
                  {c.tasks.map((t) => (
                    <View key={t.id} style={{ display: "flex", alignItems: "flex-start", marginTop: "12rpx" }}>
                      <View
                        style={{
                          width: "12rpx",
                          height: "12rpx",
                          borderRadius: "50%",
                          background: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.default,
                          marginTop: "10rpx",
                          marginRight: "12rpx",
                          flexShrink: 0
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: "24rpx", color: THEME.inkSecondary, lineHeight: "40rpx" }}>
                          {fmtTime(t.time) ? `${fmtTime(t.time)} ` : ""}{t.title}
                        </Text>
                        {t.overdue && <Text style={{ fontSize: "20rpx", color: "#e15d5d" }}>（已超时）</Text>}
                      </View>
                    </View>
                  ))}
                </View>
                <View style={{ display: "flex", flexWrap: "wrap", marginTop: "16rpx" }}>
                  <ActionBtn primary label="查看详情" onClick={() => goTask(first.id)} bg="#dbeafe" color="#2563eb" />
                  <ActionBtn label="稍后" onClick={() => Taro.showToast({ title: "已稍后提醒", icon: "none" })} />
                </View>
              </CardShell>
            );
          }

          if (c.type === "forget") {
            const f = c.data.primary;
            const others = c.data.others || [];
            const silent = c.data.silent_notes || [];
            return (
              <CardShell
                key={i}
                icon="💭"
                title="遗忘拯救"
                subtitle="基于遗忘曲线预警"
                tag="智能干预"
                borderColor="#d8b4fe"
                headerBg="#faf5ff"
                tagColor="#9333ea"
                tagBg="#f3e8ff"
              >
                <View style={{ background: "#faf5ff", borderRadius: "16rpx", padding: "18rpx" }}>
                  <View style={{ display: "flex", alignItems: "flex-start" }}>
                    <View
                      style={{
                        width: "34rpx",
                        height: "34rpx",
                        borderRadius: "50%",
                        background: "#a855f7",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: "12rpx",
                        flexShrink: 0
                      }}
                    >
                      <Text style={{ fontSize: "22rpx", fontWeight: 700, color: "#fff" }}>!</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: "26rpx", fontWeight: 500, color: THEME.ink, lineHeight: "44rpx" }}>
                        您{f.days}天前提到的"{f.title}"还未完成
                      </Text>
                      <Text style={{ fontSize: "22rpx", color: THEME.inkTertiary, marginTop: "6rpx" }}>
                        超过{f.days}天未完成遗忘率高达{f.forget_rate}%
                      </Text>
                    </View>
                  </View>
                  {f.context && (
                    <View style={{ marginTop: "16rpx", padding: "14rpx", background: THEME.card, borderRadius: "12rpx", border: "1rpx solid #f3e8ff" }}>
                      <Text style={{ fontSize: "20rpx", color: THEME.inkQuaternary, marginBottom: "4rpx" }}>上下文：</Text>
                      <Text style={{ fontSize: "22rpx", color: THEME.inkSecondary, lineHeight: "40rpx" }}>
                        {f.context}
                        {f.overdue_days > 0 && <Text style={{ color: "#e15d5d" }}>，已逾期{f.overdue_days}天。</Text>}
                      </Text>
                    </View>
                  )}
                  {(others.length > 0 || silent.length > 0) && (
                    <View style={{ marginTop: "16rpx", paddingTop: "14rpx", borderTop: "1rpx solid #f3e8ff" }}>
                      {others.map((t) => (
                        <View key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: "8rpx" }}>
                          <View style={{ width: "8rpx", height: "8rpx", borderRadius: "50%", background: "#c084fc", marginRight: "10rpx" }} />
                          <Text style={{ flex: 1, fontSize: "22rpx", color: THEME.inkTertiary }} numberOfLines={1}>
                            {t.title}
                          </Text>
                          <Text style={{ fontSize: "20rpx", color: "#a855f7" }}>{t.days}天</Text>
                        </View>
                      ))}
                      {silent.map((n) => (
                        <View key={n.id} style={{ display: "flex", alignItems: "center", marginBottom: "8rpx" }}>
                          <View style={{ width: "8rpx", height: "8rpx", borderRadius: "50%", background: "#818cf8", marginRight: "10rpx" }} />
                          <Text style={{ flex: 1, fontSize: "22rpx", color: THEME.inkTertiary }} numberOfLines={1}>
                            心签 · {n.title}
                          </Text>
                          <Text style={{ fontSize: "20rpx", color: "#6366f1" }}>{n.days}天</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={{ display: "flex", flexWrap: "wrap", marginTop: "16rpx" }}>
                  <ActionBtn primary label="立即处理" onClick={() => goTask(f.id)} bg="#f3e8ff" color="#9333ea" />
                  <ActionBtn label="延后" onClick={() => rescheduleTask({ id: f.id, title: f.title }, "09:00")} />
                  <ActionBtn label="轻轻放下" onClick={() => letGoTask({ id: f.id, title: f.title })} />
                </View>
              </CardShell>
            );
          }

          if (c.type === "sequential") {
            const s = c.data;
            return (
              <CardShell
                key={i}
                icon="🔗"
                title="关联规则推荐"
                subtitle="从你的历史中学到的隐藏逻辑"
                tag="决策前置"
                borderColor="#c7d2fe"
                headerBg="#eef2ff"
                tagColor="#4f46e5"
                tagBg="#e0e7ff"
              >
                <Text style={{ fontSize: "22rpx", color: THEME.inkTertiary, marginBottom: "16rpx" }}>
                  完成「{s.trigger_task?.title || "上一件事"}」后，你通常会接着处理…
                </Text>
                {c.suggestions.map((su, idx) => (
                  <View key={idx} style={{ background: "#f5f7ff", borderRadius: "16rpx", padding: "18rpx", marginBottom: "14rpx", border: "1rpx solid #e0e7ff" }}>
                    <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12rpx" }}>
                      <View style={{ display: "flex", alignItems: "center" }}>
                        <Text style={{ fontSize: "22rpx", color: THEME.inkSecondary, fontWeight: 500 }}>{su.from_label}</Text>
                        <Text style={{ fontSize: "22rpx", color: THEME.inkQuaternary, marginHorizontal: "8rpx" }}>→</Text>
                        <Text style={{ fontSize: "22rpx", color: "#4f46e5", fontWeight: 500 }}>{su.to_label}</Text>
                      </View>
                      <Text style={{ fontSize: "18rpx", color: THEME.inkQuaternary }}>
                        置信度 <Text style={{ color: "#4f46e5", fontWeight: 500 }}>{su.confidence}%</Text> · {su.support}次共现
                      </Text>
                    </View>
                    {su.tasks.filter(isTaskVisible).map((t) => (
                      <View
                        key={t.id}
                        onClick={() => goTask(t.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: THEME.card,
                          borderRadius: "10rpx",
                          padding: "14rpx",
                          marginBottom: "10rpx",
                          border: "1rpx solid #e0e7ff"
                        }}
                      >
                        <Text style={{ flex: 1, fontSize: "24rpx", color: THEME.inkSecondary }} numberOfLines={1}>
                          {t.title}
                        </Text>
                        <View
                          style={{
                            padding: "2rpx 10rpx",
                            borderRadius: "8rpx",
                            background: PRIORITY_BG[t.priority] || PRIORITY_BG.default,
                            border: `1rpx solid ${PRIORITY_BG[t.priority] || PRIORITY_BG.default}`
                          }}
                        >
                          <Text style={{ fontSize: "18rpx", color: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.default }}>
                            {PRIORITY_TEXT[t.priority] || PRIORITY_TEXT.default}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </CardShell>
            );
          }

          if (c.type === "location") {
            const l = c.data;
            return (
              <CardShell
                key={i}
                icon="🌿"
                title="地点情境推荐"
                subtitle={`你在 ${l.icon || ""} ${l.location_name}（约${l.distance}m）附近`}
                tag="决策前置"
                borderColor="#a7f3d0"
                headerBg="#f0fdf4"
                tagColor="#059669"
                tagBg="#d1fae5"
              >
                <Text style={{ fontSize: "22rpx", color: THEME.inkTertiary, marginBottom: "12rpx" }}>你在这里经常会做：</Text>
                <View style={{ display: "flex", flexWrap: "wrap", marginBottom: "16rpx" }}>
                  {(l.top_categories || []).map((cat) => (
                    <View
                      key={cat.category}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "6rpx 14rpx",
                        borderRadius: "100rpx",
                        background: "#d1fae5",
                        border: "1rpx solid #a7f3d0",
                        marginRight: "10rpx",
                        marginBottom: "10rpx"
                      }}
                    >
                      <Text style={{ fontSize: "18rpx", color: "#059669", marginRight: "4rpx" }}>✦</Text>
                      <Text style={{ fontSize: "20rpx", color: "#047857" }}>
                        {cat.label} ×{cat.count}
                      </Text>
                    </View>
                  ))}
                  {(l.top_titles || []).slice(0, 2).map((t, idx) => (
                    <View
                      key={idx}
                      style={{
                        padding: "6rpx 14rpx",
                        borderRadius: "100rpx",
                        background: "#f8fafc",
                        border: "1rpx solid #e2e8f0",
                        marginRight: "10rpx",
                        marginBottom: "10rpx"
                      }}
                    >
                      <Text style={{ fontSize: "20rpx", color: THEME.inkTertiary }} numberOfLines={1}>
                        常做「{t.title.length > 12 ? t.title.slice(0, 12) + "…" : t.title}」
                      </Text>
                    </View>
                  ))}
                </View>
                {c.suggested.length > 0 ? (
                  <>
                    <Text style={{ fontSize: "22rpx", color: THEME.inkQuaternary, marginBottom: "10rpx" }}>现在就能处理：</Text>
                    {c.suggested.map((t) => (
                      <View
                        key={t.id}
                        onClick={() => goTask(t.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: THEME.card,
                          borderRadius: "10rpx",
                          padding: "14rpx",
                          marginBottom: "10rpx",
                          border: "1rpx solid #a7f3d0"
                        }}
                      >
                        <View style={{ display: "flex", alignItems: "center", flex: 1 }}>
                          <View style={{ padding: "2rpx 8rpx", borderRadius: "6rpx", background: "#d1fae5", marginRight: "10rpx" }}>
                            <Text style={{ fontSize: "18rpx", color: "#059669" }}>{t.category_label || CATEGORY_LABEL[t.category] || "其他"}</Text>
                          </View>
                          <Text style={{ flex: 1, fontSize: "24rpx", color: THEME.inkSecondary }} numberOfLines={1}>
                            {t.title}
                          </Text>
                        </View>
                        <View
                          style={{
                            padding: "2rpx 10rpx",
                            borderRadius: "8rpx",
                            background: PRIORITY_BG[t.priority] || PRIORITY_BG.default,
                            border: `1rpx solid ${PRIORITY_BG[t.priority] || PRIORITY_BG.default}`
                          }}
                        >
                          <Text style={{ fontSize: "18rpx", color: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.default }}>
                            {PRIORITY_TEXT[t.priority] || PRIORITY_TEXT.default}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={{ fontSize: "22rpx", color: THEME.inkQuaternary }}>基于 {l.history_sample_size || 0} 条历史记录推断，目前暂无匹配的待办。</Text>
                )}
              </CardShell>
            );
          }

          return null;
        })}
      </View>
    );
  };

  const renderRecords = () => {
    const list = notes
      .filter((n) => isToday(n.created_date))
      .map((n) => {
        const text = String(n.plain_text || n.content || "");
        const url = extractUrl(text);
        let type = "heart";
        if (url) type = "link";
        else if ((n.tags || []).includes("图片") || /\.(png|jpg|jpeg|gif|webp)\b/i.test(text)) type = "image";
        return { ...n, text, url, type };
      })
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    if (list.length === 0) return null;

    return (
      <View style={{ padding: "18rpx 32rpx" }}>
        <View style={{ display: "flex", alignItems: "center", marginBottom: "20rpx" }}>
          <View style={{ width: "6rpx", height: "28rpx", borderRadius: "4rpx", background: THEME.primaryLight, marginRight: "16rpx" }} />
          <Text style={{ fontSize: "26rpx", fontWeight: 500, color: THEME.inkTertiary }}>今日记录</Text>
        </View>
        {list.map((item) => (
          <View
            key={item.id}
            style={{
              background: THEME.card,
              borderRadius: "24rpx",
              border: `1rpx solid ${THEME.border}`,
              padding: "24rpx",
              marginBottom: "16rpx",
              boxShadow: "0 2rpx 10rpx rgba(0,0,0,0.03)"
            }}
          >
            <View style={{ display: "flex", alignItems: "center", marginBottom: "12rpx" }}>
              <Text
                style={{
                  fontSize: "22rpx",
                  fontWeight: 500,
                  color:
                    item.type === "heart" ? THEME.heartDeep : item.type === "image" ? THEME.primary : THEME.primaryLight,
                  marginRight: "12rpx"
                }}
              >
                {item.type === "heart" ? `♡ ${item.title || "心签"}` : item.type === "image" ? "🖼 图片" : "🔗 链接"}
              </Text>
              <Text style={{ fontSize: "22rpx", color: THEME.inkQuaternary }}>{formatTime(item.created_date)}</Text>
            </View>

            {item.type === "heart" ? (
              <Text
                style={{
                  fontSize: "28rpx",
                  fontStyle: "italic",
                  fontWeight: 300,
                  color: THEME.inkSecondary,
                  lineHeight: "48rpx",
                  wordBreak: "break-all"
                }}
              >
                {item.text.slice(0, 200)}
              </Text>
            ) : item.type === "image" ? (
              <Image
                src={item.url || item.text}
                mode="aspectFill"
                style={{ width: "100%", height: "320rpx", borderRadius: "16rpx", background: THEME.primaryFaint }}
                onClick={() => Taro.previewImage({ urls: [item.url || item.text] })}
              />
            ) : (
              <Text style={{ fontSize: "28rpx", color: THEME.inkSecondary, lineHeight: "48rpx", wordBreak: "break-all" }}>{item.title || item.text.slice(0, 80)}</Text>
            )}

            {item.type === "heart" && (
              <View
                style={{
                  marginTop: "16rpx",
                  padding: "16rpx 18rpx",
                  borderRadius: "14rpx",
                  background: THEME.heartBg,
                  display: "flex"
                }}
              >
                <View
                  style={{
                    width: "32rpx",
                    height: "32rpx",
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${THEME.primaryLight}, ${THEME.primary})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: "14rpx",
                    flexShrink: 0,
                    marginTop: "4rpx"
                  }}
                >
                  <Text style={{ fontSize: "18rpx", color: "#fff" }}>♡</Text>
                </View>
                <Text
                  style={{
                    fontSize: "24rpx",
                    color: heartLoadingIds.has(item.id) ? "#c97b8a" : "#9a5f6e",
                    lineHeight: "40rpx",
                    flex: 1,
                    wordBreak: "break-all"
                  }}
                >
                  {heartLoadingIds.has(item.id)
                    ? "AI 正在回应…"
                    : item.metadata?.ai_analysis?.emotional_response || generateLocalHeartReply(item.text)}
                </Text>
              </View>
            )}

            {item.type === "link" && item.url && (
              <View
                onClick={() => openWebview(item.url)}
                style={{
                  marginTop: "16rpx",
                  padding: "14rpx 18rpx",
                  borderRadius: "12rpx",
                  background: THEME.primaryMist
                }}
              >
                <Text style={{ fontSize: "24rpx", color: THEME.primary }}>一键跳转链接 ›</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderGuardian = () => {
    if (guardianRecords.length === 0) return null;
    return (
      <View style={{ padding: "18rpx 32rpx" }}>
        <View style={{ display: "flex", alignItems: "center", marginBottom: "20rpx" }}>
          <View style={{ width: "6rpx", height: "28rpx", borderRadius: "4rpx", background: THEME.primaryLight, marginRight: "16rpx" }} />
          <Text style={{ fontSize: "26rpx", fontWeight: 500, color: THEME.inkTertiary }}>守护记录</Text>
        </View>
        {guardianRecords.map((e) => (
          <View
            key={e.id}
            style={{
              background: THEME.card,
              borderRadius: "24rpx",
              border: `1rpx solid ${THEME.border}`,
              padding: "24rpx",
              marginBottom: "16rpx"
            }}
          >
            <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8rpx" }}>
              <Text style={{ fontSize: "28rpx", fontWeight: 500, color: THEME.ink, flex: 1, lineHeight: "44rpx", wordBreak: "break-all", marginRight: "12rpx" }}>{e.task_title}</Text>
              <View
                style={{
                  padding: "4rpx 12rpx",
                  borderRadius: "8rpx",
                  background: e.requires_approval ? THEME.heartBg : THEME.doneBg
                }}
              >
                <Text style={{ fontSize: "20rpx", color: e.requires_approval ? THEME.heartDeep : "#4a8a5e" }}>
                  {e.requires_approval ? "待确认" : "已执行"}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: "24rpx", color: THEME.inkTertiary, lineHeight: "40rpx", wordBreak: "break-all" }}>
              {e.requires_approval ? "这件事需要你的确认，我才能继续下一步。" : "已经自动完成，无需你操心。"}
            </Text>
            {e.requires_approval && (
              <View
                onClick={() => Taro.showToast({ title: "请到约定详情处理", icon: "none" })}
                style={{
                  marginTop: "14rpx",
                  alignSelf: "flex-start",
                  padding: "10rpx 22rpx",
                  borderRadius: "10rpx",
                  background: THEME.primary
                }}
              >
                <Text style={{ fontSize: "24rpx", color: "#fff" }}>去确认</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderBottomBar = () => (
    <View
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "100rpx",
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "rgba(250,251,251,0.92)",
        borderTop: "1rpx solid rgba(232,236,239,0.6)",
        zIndex: 50
      }}
    >
      <View style={{ padding: "16rpx 28rpx 12rpx" }}>
        <View
          style={{
            display: "flex",
            alignItems: "center",
            background: THEME.card,
            borderRadius: "40rpx",
            border: `1rpx solid ${THEME.border}`,
            padding: "8rpx 8rpx 8rpx 24rpx",
            boxShadow: "0 2rpx 8rpx rgba(0,0,0,0.04)"
          }}
        >
          <Input
            style={{ flex: 1, fontSize: "30rpx", color: THEME.ink, height: "64rpx" }}
            placeholder={inputPlaceholder}
            value={inputText}
            focus={inputFocus}
            onInput={(e) => setInputText(e.detail.value)}
            onConfirm={handleSend}
            onBlur={() => setInputFocus(false)}
          />
          <View
            onClick={() => handleSend()}
            style={{
              width: "64rpx",
              height: "64rpx",
              borderRadius: "50%",
              background: inputText.trim() ? THEME.primary : THEME.border,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginLeft: "12rpx"
            }}
          >
            <Text style={{ fontSize: "32rpx", color: "#fff" }}>➤</Text>
          </View>
        </View>
        <View style={{ display: "flex", justifyContent: "space-around", marginTop: "12rpx" }}>
          {[
            { key: "heart", icon: "♡", label: "心签", color: THEME.heartDeep },
            { key: "voice", icon: "🎤", label: "语音", color: THEME.inkQuaternary },
            { key: "photo", icon: "📷", label: "拍照", color: THEME.inkQuaternary },
            { key: "task", icon: "📋", label: "约定", color: THEME.inkQuaternary }
          ].map((q) => (
            <View key={q.key} onClick={() => quickAction(q.key)} style={{ display: "flex", alignItems: "center", padding: "8rpx 12rpx" }}>
              <Text style={{ fontSize: "28rpx", color: q.color, marginRight: "8rpx" }}>{q.icon}</Text>
              <Text style={{ fontSize: "24rpx", color: q.color }}>{q.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {showVoiceModal && (
        <View
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={() => setShowVoiceModal(false)}
        >
          <View
            style={{
              width: "620rpx",
              background: THEME.card,
              borderRadius: "32rpx",
              padding: "48rpx",
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Text style={{ fontSize: "32rpx", fontWeight: 600, color: THEME.ink, marginBottom: "12rpx" }}>语音输入</Text>
            <Text style={{ fontSize: "26rpx", color: THEME.inkTertiary, marginBottom: "36rpx", textAlign: "center" }}>
              按住下方按钮说话，说完后松开即可
            </Text>
            <VoiceInput
              onResult={handleVoiceResult}
              onError={(err) => Taro.showToast({ title: err, icon: "none" })}
              size={120}
            />
            <View
              onClick={() => setShowVoiceModal(false)}
              style={{ marginTop: "40rpx", padding: "16rpx 48rpx", borderRadius: "12rpx", background: THEME.paper }}
            >
              <Text style={{ fontSize: "28rpx", color: THEME.inkTertiary }}>取消</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ minHeight: "100vh", background: THEME.paper, display: "flex", flexDirection: "column" }}>
      {renderHeader()}
      {renderGuestBanner()}
      <ScrollView
        scrollY
        style={{ flex: 1 }}
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={onRefresh}
      >
        <View style={{ paddingBottom: "320rpx" }}>
          {loading && tasks.length === 0 ? (
            <View style={{ padding: "60rpx", textAlign: "center" }}>
              <Text style={{ fontSize: "28rpx", color: THEME.inkTertiary }}>河流正在汇聚…</Text>
            </View>
          ) : (
            <>
              {renderRiver()}
              {renderNow()}
              {renderContext()}
              {renderRecords()}
              {renderGuardian()}
              {renderVision()}
              {renderRhythm()}
            </>
          )}
        </View>
      </ScrollView>
      {renderBottomBar()}
    </View>
  );
}
