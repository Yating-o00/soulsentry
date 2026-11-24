// Synthetic scenarios. The expected values are used by the grader only.
export const firstDay = "2026-11-16";
const paperCards = /纸质|纸卡|词卡|单词卡/;
const sessionLimit = (topic, text, options) => ({ topic, text, ...options });

export const fixtures = [
  {
    id: "reading_busy",
    text: "帮我安排一周阅读练习，每周三次，每次正好25分钟，工作日晚上没空，请避开已有安排。",
    schedule: { minutes: 25, noWeekdayEvenings: true },
    busy: [["2026-11-16T08:30:00", "2026-11-16T18:00:00"]],
  },
  {
    id: "vocabulary_limit",
    text: "想做一个为期7天的英语词汇复习计划，每周三次，单次按我平常的上限，每次请用纸质词卡。",
    schedule: { minutes: 25, max: true, content: paperCards },
    memories: [sessionLimit("english_vocabulary", "英语词汇复习每次最多25分钟")],
  },
  {
    id: "dumbbell_training",
    text: "想做一周居家练背计划，每周三次，每次正好35分钟。我是新手，在家只有一副哑铃。",
    schedule: {
      minutes: 35,
      content: /\d+\s*组.*\d+\s*(次|秒)|[一二三四五六七八九十]+组.*\d+\s*(次|秒)/,
      forbidden: /高位下拉机|史密斯机|跑步机|引体向上杆|杠铃|坐姿划船机|弹力带|壶铃/,
    },
  },
  {
    id: "clarification_then_plan",
    text: "帮我订一个为期7天的西班牙语口语跟读计划，每周三次。只问我缺少的时间条件。",
    followUp: "每次正好20分钟，工作日晚上没空。",
    mode: "clarify_then_plan",
    schedule: { minutes: 20, noWeekdayEvenings: true },
  },
  {
    id: "explicit_cap_beats_memory",
    text: "帮我安排一周英语词汇复习，每周三次。这周每次最多18分钟，周一到周五晚间不方便。每次用纸质词卡。",
    schedule: { minutes: 18, max: true, noWeekdayEvenings: true, content: paperCards },
    memories: [
      sessionLimit("english_vocabulary", "我平常英语词汇复习每次最多40分钟"),
      sessionLimit("reading", "我读书每次最多55分钟"),
      sessionLimit("english_vocabulary", "妹妹英语词汇复习每次最多50分钟", { subject: "sister" }),
      sessionLimit("english_vocabulary", "英语词汇复习每次最多10分钟的临时例外", { expires: "2026-11-15T00:00:00Z" }),
      sessionLimit("english_vocabulary", "英语词汇复习每次最多65分钟，外部账号识别词松果七九", { foreign: true }),
    ],
    privateText: "松果七九",
    busy: [
      ["2026-11-17T09:00:00", "2026-11-17T15:00:00"],
      ["2026-11-20T14:00:00", "2026-11-20T18:00:00"],
    ],
  },
  {
    id: "ambiguous_memory_clarifies",
    text: "帮我安排一周英语词汇复习，每周三次，单次按我平常的上限。上限不明确的话先问我。",
    mode: "clarify",
    memories: [
      sessionLimit("english_vocabulary", "英语词汇复习每次最多20分钟"),
      sessionLimit("english_vocabulary", "英语词汇复习每次最多45分钟"),
      sessionLimit("reading", "阅读每次最多15分钟"),
    ],
  },
  {
    id: "two_weeks_busy",
    text: "请制定一个14天的阅读练习计划，每周两次，每次正好25分钟，工作日晚上没空，避开两个星期里已有的约定。",
    schedule: { days: 14, perWeek: 2, minutes: 25, noWeekdayEvenings: true },
    busy: [
      ["2026-11-16T08:30:00", "2026-11-16T18:00:00"],
      ["2026-11-19T13:00:00", "2026-11-19T17:30:00"],
      ["2026-11-24T08:30:00", "2026-11-24T18:00:00"],
      ["2026-11-28T09:00:00", "2026-11-28T19:00:00"],
    ],
  },
  {
    id: "local_saturday_adjustment",
    text: "帮我制定一周的阅读练习计划，每周三次，安排在周一、周三、周六。每次正好20分钟，三天都从上午10点开始。",
    followUp: "周六改到上午11点，周一和周三照旧。",
    mode: "adjust",
    schedule: { minutes: 20, weekdays: [1, 3, 6], start: "10:00" },
    adjustment: { date: "2026-11-21", start: "11:00" },
  },
  {
    id: "new_busy_before_confirmation",
    text: "帮我规划一周的素描基础练习，每周三次，每次正好25分钟，工作日晚上没空。",
    schedule: { minutes: 25, noWeekdayEvenings: true },
    mode: "late_conflict",
  },
  {
    id: "scoped_parallel_confirmation",
    text: "帮我安排一周无器械的发声练习，每周三次，每次正好20分钟，工作日晚上没空。",
    schedule: { minutes: 20, noWeekdayEvenings: true },
    mode: "confirm_parallel",
  },
];

export function stamp(child, field) {
  return child.date + "T" + child[field] + ":00+08:00";
}

export function asksForDuration(reply) {
  const question = String(reply ?? "").split(/\n\s*参考记忆[：:]/, 1)[0];
  const interrogatives = question.match(/[^。！？?!\n]+[？?]/g) ?? [];
  if (interrogatives.some((part) => /分钟|小时|时长|时间|多久|上限/.test(part)
    && /多少|多长|多久|几分钟|几小时|多大|上限.{0,10}[？?]/.test(part))) return true;
  // A valid clarification can ask the user to select between remembered limits.
  const alternatives = /\d+\s*(?:分钟|小时)?\s*(?:和|或是?|还是|、|与|\/|／)\s*\d+\s*(?:分钟|小时)/;
  return alternatives.test(question) && /(?:按|用|选|确认)\s*哪(?:个|一个|档|项|种)(?:来|为准)?\s*[？?]/.test(question);
}

function dayOffset(date) {
  return (Date.parse(date) - Date.parse(firstDay)) / 86400000;
}

function windowOf(child) {
  return [Date.parse(stamp(child, "start_time")), Date.parse(stamp(child, "end_time"))];
}

function overlaps([aStart, aEnd], [bStart, bEnd]) {
  return aStart < bEnd && bStart < aEnd;
}

export function gradePlan(plan, fixture, { adjusted = false } = {}) {
  const { days = 7, perWeek = 3, minutes, max, noWeekdayEvenings, weekdays, start, content, forbidden } = fixture.schedule;
  const children = plan.children || [];
  const sessions = children.filter((entry) => entry.session_type === "session");
  const problems = [];
  if (children.some(({ date }) => !Number.isInteger(dayOffset(date)) || dayOffset(date) < 0 || dayOffset(date) >= days)) {
    problems.push("out_of_horizon");
  }
  for (let offset = 0; offset < days; offset += 7) {
    const week = sessions.filter(({ date }) => dayOffset(date) >= offset && dayOffset(date) < offset + 7);
    if (week.length !== perWeek || new Set(week.map(({ date }) => date)).size !== perWeek) {
      problems.push("wrong_frequency_week_" + (offset / 7 + 1));
    }
  }
  if (sessions.some((child) => {
    const [from, to] = windowOf(child);
    const measured = (to - from) / 60000;
    return !(measured > 0 && (max ? measured <= minutes : measured === minutes));
  })) problems.push("wrong_duration");
  if (noWeekdayEvenings && sessions.some(({ date, end_time }) => {
    const day = new Date(date).getUTCDay();
    return day >= 1 && day <= 5 && end_time > "18:00";
  })) problems.push("weekday_evening");
  if (weekdays && sessions.some(({ date }) => !weekdays.includes(new Date(date).getUTCDay()))) problems.push("wrong_weekday");
  if (start && sessions.some(({ date, start_time }) => {
    const expected = adjusted && date === fixture.adjustment.date ? fixture.adjustment.start : start;
    return start_time !== expected;
  })) problems.push("wrong_start_time");
  const windows = children.map(windowOf).sort(([a], [b]) => a - b);
  if (windows.some(([from, to]) => !(to > from))) problems.push("invalid_interval");
  if (windows.some((window, i) => i > 0 && overlaps(window, windows[i - 1]))) problems.push("plan_time_overlap");
  const busy = (fixture.busy || []).map((block) => block.map((time) => Date.parse(time + "+08:00")));
  if (windows.some((window) => busy.some((block) => overlaps(window, block)))) problems.push("busy_conflict");
  if (content && sessions.some(({ title, description }) => !content.test(title + " " + description))) problems.push("missing_activity_detail");
  if (forbidden && sessions.some(({ title, description }) => forbidden.test(title + " " + description))) problems.push("unavailable_equipment");
  return { sessions, problems };
}
