import { base44 } from "@/api/base44Client";

export const AGENT_EXAMPLES = [
  "帮我订明天从上海飞纽约的机票",
  "帮我给王总回个邮件，说项目方案周五前发他",
  "明天晚上帮我给闺蜜订个蛋糕",
];

// 「帮我/替我/请你 + 动作」视为交办给小助手执行
export const isAgentCommand = (text) =>
  /^(请)?(帮我|替我|帮忙|麻烦你|你去)/.test(text.trim()) ||
  /^(订|预订|预约|回复?|发(一)?封|买|查一下)/.test(text.trim());

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    kind: { type: "string", enum: ["booking", "email", "purchase", "other"] },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          actor: { type: "string", enum: ["agent", "human"] },
          detail: { type: "string" },
        },
      },
    },
    findings: { type: "string", description: "小助手已完成部分的产出（markdown），如航班候选对比、邮件思路" },
    handoff_reason: { type: "string", description: "为什么需要人接手（登录/支付/确认身份/确认内容）" },
    handoff_url: { type: "string", description: "人接手时要打开的真实网址，如携程/航司官网搜索页；邮件类留空" },
    handoff_action: { type: "string", description: "按钮文字，如「去携程完成支付」" },
    email: {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
    },
  },
  required: ["title", "kind", "steps", "findings", "handoff_reason"],
};

export async function planAgentRun(command) {
  const today = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  return base44.integrations.Core.InvokeLLM({
    model: "gemini_3_flash",
    add_context_from_internet: true,
    response_json_schema: PLAN_SCHEMA,
    prompt: `你是心栈的执行小助手。现在是 ${today}。用户交办：「${command}」。
请尽你所能先把能做的部分真正做完（联网查询真实的航班/商品/商家信息，给出 2-4 个具体候选及价格时间；邮件就直接写好完整草稿），
然后把必须由用户本人完成的卡点（登录账号、付款、实名信息、最终确认发送）标为 actor=human 的步骤，并说明 handoff_reason。
steps 按执行顺序列出 3-6 步，agent 步骤写清你已经做了什么。
booking/purchase 类给出可直接打开的真实网址 handoff_url（如 https://flights.ctrip.com 或航司官网）。
email 类填写 email 字段（收件人未知时 to 留空），handoff_url 留空。全部用中文。`,
  });
}

export async function finishAgentRun(command, plan, userNote) {
  return base44.integrations.Core.InvokeLLM({
    prompt: `用户交办「${command}」。小助手已完成：${plan.findings}\n卡点：${plan.handoff_reason}\n用户接手后反馈：「${userNote || "已处理完成"}」。
请用 2-3 句温和的中文做收尾：确认事情的结果，并提醒后续需要注意的一件事（如值机时间、等待回复）。`,
  });
}