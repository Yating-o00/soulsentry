import { base44 } from "@/api/base44Client";

// 智能约定规划：把「一类要做的事」规划成主约定 + 带具体执行/提醒时刻的子约定
export async function planAgreement(input) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 31 * 86400000);

  const [busyPage, prefPage] = await Promise.all([
    base44.entities.Task.filter(
      { reminder_time: { $gte: now.toISOString(), $lte: horizon.toISOString() }, status: { $in: ["pending", "in_progress"] }, deleted_at: { $exists: false } },
      { sort: "reminder_time", limit: 100, fields: ["title", "reminder_time", "end_time"] }
    ),
    base44.entities.UserPreference.filter({}, { limit: 1, fields: ["daily_routine", "quiet_hours_start", "quiet_hours_end"] }),
  ]);
  const busy = (busyPage.items || []).map((t) => `${t.reminder_time}${t.end_time ? " ~ " + t.end_time : ""} ${t.title}`).join("\n") || "无";
  const pref = prefPage.items?.[0] || {};

  const plan = await base44.integrations.Core.InvokeLLM({
    prompt: `你是心栈的智能约定规划师。用户提出了一件需要持续推进的事，请做一份合理、可执行的整体规划。

当前时间：${now.toISOString()}（用户时区 Asia/Shanghai，输出时间请带 +08:00 偏移）
用户作息：${JSON.stringify(pref.daily_routine || {})}；免打扰：${pref.quiet_hours_start || "22:00"}-${pref.quiet_hours_end || "08:00"}
已有安排（请避开冲突）：
${busy}

用户需求：""" ${input} """

要求：
1. 先整体考虑周期、总量、节奏（循序渐进、留出休息与复盘），再落到每一天的具体时刻。
2. 每个子约定是一个具体执行步骤，必须有 start_time 与 end_time（ISO），单次时长合理（通常 20-90 分钟），不落在免打扰与已有安排时段。
3. detail 写清这一步具体做什么、做到什么程度。
4. 子约定数量与周期匹配（一周计划约 7-14 个），最后安排一次复盘。`,
    response_json_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        overview: { type: "string" },
        category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              start_time: { type: "string" },
              end_time: { type: "string" },
            },
            required: ["title", "start_time", "end_time"],
          },
        },
      },
      required: ["title", "steps"],
    },
  });

  const steps = (plan.steps || []).filter((s) => !isNaN(new Date(s.start_time)));
  if (!steps.length) throw new Error("没能生成可执行的规划，请描述得更具体一些");
  steps.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const iso = (v) => new Date(v).toISOString();
  const category = plan.category || "personal";

  const parent = await base44.entities.Task.create({
    title: plan.title,
    description: plan.overview || input,
    category,
    reminder_time: iso(steps[0].start_time),
    end_time: iso(steps[steps.length - 1].end_time || steps[steps.length - 1].start_time),
  });

  await base44.entities.Task.bulkCreate(
    steps.map((s) => ({
      title: s.title,
      description: s.detail || "",
      category,
      parent_task_id: parent.id,
      reminder_time: iso(s.start_time),
      end_time: isNaN(new Date(s.end_time)) ? undefined : iso(s.end_time),
      advance_reminders: [10],
    }))
  );

  return { task_id: parent.id, mode: "created", message: `已规划「${plan.title}」· ${steps.length} 个子约定已落到具体时刻` };
}