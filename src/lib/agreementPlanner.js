import { base44 } from "@/api/base44Client";

// 智能约定规划：先生成预览草案 → 用户多轮对话修改 → 确认后写入主约定 + 带提醒时刻的子约定
const FITNESS_RE = /(健身|运动|跑步|训练|减肥|减脂|增肌|瑜伽|游泳|骑行|锻炼)/;

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    overview: { type: "string" },
    reply: { type: "string", description: "对用户的一句话回应，说明这版规划/修改了什么" },
    category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, detail: { type: "string" }, start_time: { type: "string" }, end_time: { type: "string" } },
        required: ["title", "start_time", "end_time"],
      },
    },
  },
  required: ["title", "steps"],
};

async function buildContext(input) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 31 * 86400000);
  const isFitness = FITNESS_RE.test(input);
  const [busyPage, prefPage, agg] = await Promise.all([
    base44.entities.Task.filter(
      { reminder_time: { $gte: now.toISOString(), $lte: horizon.toISOString() }, status: { $in: ["pending", "in_progress"] }, deleted_at: { $exists: false } },
      { sort: "reminder_time", limit: 100, fields: ["title", "reminder_time", "end_time"] }
    ),
    base44.entities.UserPreference.filter({}, { limit: 1, fields: ["daily_routine", "quiet_hours_start", "quiet_hours_end"] }),
    isFitness
      ? base44.entities.HealthLog.aggregate({ query: { date: { $gte: new Date(now.getTime() - 30 * 86400000).toISOString() } }, groupBy: "type", avg: ["value"], max: ["value"] })
      : null,
  ]);
  let fitnessCtx = "";
  if (isFitness) {
    const rows = (agg.rows || []).map((r) => `${r.type}: 平均 ${Math.round(r.avg_value * 10) / 10}，最高 ${r.max_value}（${r.count} 条记录）`).join("；");
    fitnessCtx = `用户近 30 天运动/健康数据：${rows || "暂无记录（按零基础/入门水平安排）"}
运动规划要求：参照常规运动方案（热身-主训练-拉伸），有氧与力量交替、相邻高强度日之间安排恢复，强度按用户数据循序渐进；detail 写明动作、组数×次数或时长、目标心率/强度；同一天不安排两次训练。`;
  }
  const busy = (busyPage.items || []).map((t) => `${t.reminder_time}${t.end_time ? " ~ " + t.end_time : ""} ${t.title}`).join("\n") || "无";
  const pref = prefPage.items?.[0] || {};
  return { isFitness, text: `当前时间：${now.toISOString()}（用户时区 Asia/Shanghai，输出时间请带 +08:00 偏移）
用户作息：${JSON.stringify(pref.daily_routine || {})}；免打扰：${pref.quiet_hours_start || "22:00"}-${pref.quiet_hours_end || "08:00"}
${fitnessCtx}
已有安排（请避开冲突）：
${busy}` };
}

const RULES = `要求：
1. 先整体考虑周期、总量、节奏（循序渐进、留出休息与复盘），再落到每一天的具体时刻。
2. 每个子约定必须有 start_time 与 end_time（ISO），单次时长合理（通常 20-90 分钟），不落在免打扰与已有安排时段。
3. detail 写清这一步具体做什么、做到什么程度。
4. 子约定数量与周期匹配，最后安排一次复盘。`;

function normalize(plan, isFitness) {
  const steps = (plan.steps || []).filter((s) => !isNaN(new Date(s.start_time)));
  if (!steps.length) throw new Error("没能生成可执行的规划，请描述得更具体一些");
  steps.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  return { ...plan, steps, isFitness, category: isFitness ? "health" : plan.category || "personal" };
}

// 生成首版预览（不写入）
export async function draftAgreementPlan(input) {
  const ctx = await buildContext(input);
  const plan = await base44.integrations.Core.InvokeLLM({
    prompt: `你是心栈的智能约定规划师。用户提出了一件需要持续推进的事，请做一份合理、可执行的整体规划草案。\n\n${ctx.text}\n\n用户需求：""" ${input} """\n\n${RULES}`,
    response_json_schema: PLAN_SCHEMA,
  });
  return { ...normalize(plan, ctx.isFitness), ctxText: ctx.text, input };
}

// 根据用户反馈修改预览（不写入）
export async function reviseAgreementPlan(draft, history) {
  const { title, overview, steps } = draft;
  const plan = await base44.integrations.Core.InvokeLLM({
    prompt: `你是心栈的智能约定规划师，正在和用户一起打磨规划草案。\n\n${draft.ctxText}\n\n用户最初需求：""" ${draft.input} """\n当前草案：${JSON.stringify({ title, overview, steps })}\n\n对话记录：\n${history.map((m) => `${m.role === "user" ? "用户" : "心栈"}：${m.text}`).join("\n")}\n\n请理解用户最新的意见，输出修改后的完整草案（未被提及的部分保持不变），并在 reply 中简短说明改了什么。\n\n${RULES}`,
    response_json_schema: PLAN_SCHEMA,
  });
  return { ...normalize(plan, draft.isFitness), ctxText: draft.ctxText, input: draft.input };
}

// 用户确认后正式写入约定
export async function commitAgreementPlan(plan) {
  const { steps, category } = plan;
  const iso = (v) => new Date(v).toISOString();
  const tags = plan.isFitness ? ["运动"] : [];
  const parent = await base44.entities.Task.create({
    title: plan.title,
    description: plan.overview || plan.input,
    category,
    tags,
    reminder_time: iso(steps[0].start_time),
    end_time: iso(steps[steps.length - 1].end_time || steps[steps.length - 1].start_time),
  });
  const fmt = (v) => new Date(v).toLocaleString("zh-CN", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  await base44.entities.Task.bulkCreate(
    steps.map((s) => {
      const endOk = !isNaN(new Date(s.end_time));
      const when = endOk ? `${fmt(s.start_time)} – ${new Date(s.end_time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}` : fmt(s.start_time);
      return {
        title: `${s.title}（${fmt(s.start_time)}）`,
        description: `⏰ 执行时间：${when}｜提前 10 分钟及到点提醒\n${s.detail || ""}`,
        notification_channels: ["in_app", "browser"],
        reminder_sent: false,
        advance_alert_sent: false,
        category,
        tags,
        parent_task_id: parent.id,
        reminder_time: iso(s.start_time),
        end_time: endOk ? iso(s.end_time) : undefined,
        advance_reminders: [10],
      };
    })
  );
  return { task_id: parent.id, mode: "created", message: `已写入「${plan.title}」· ${steps.length} 个子约定将按时提醒` };
}