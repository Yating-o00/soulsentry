import { base44 } from "@/api/base44Client";

/**
 * 检测用户输入中是否包含「发送邮件」意图，并返回邮件建议草稿。
 * @param {string} userInput
 * @returns {Promise<null | { to?, subject?, body?, scheduledAt?, reason? }>}
 */
export async function detectEmailIntent(userInput) {
  if (!userInput || !userInput.trim()) return null;

  // 快速关键词预筛，减少不必要的 AI 调用
  const quickRegex = /(发邮件|发送邮件|邮件|email|e-mail|抄送|cc\b|回复邮件|会议纪要|纪要|总结发给)/i;
  if (!quickRegex.test(userInput)) return null;

  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `分析用户输入，判断是否包含「发送邮件」的自动执行意图。

用户输入: """${userInput}"""
当前时间: ${new Date().toISOString()}

如果是，提取以下字段并返回 JSON；如果不是，则 needs_email=false。

规则：
- 只有当用户明确提到「发送邮件、发邮件、把纪要发给某人、把结果邮件给」等，才视为需要发送邮件
- 若提到「会议结束后发送会议纪要」之类，scheduledAt 设为会议结束的 ISO 时间
- 收件人如果没明确邮箱，只填姓名也可以（留待用户补全）
- body 可以是简短的草稿，带明显占位符
`,
      response_json_schema: {
        type: "object",
        properties: {
          needs_email: { type: "boolean" },
          to: { type: "string", description: "收件人邮箱或姓名" },
          subject: { type: "string" },
          body: { type: "string" },
          scheduledAt: { type: "string", description: "ISO 8601 时间，留空表示立即发送" },
          reason: { type: "string", description: "为什么需要发邮件的简短说明" }
        },
        required: ["needs_email"]
      }
    });

    if (!result || !result.needs_email) return null;

    return {
      to: result.to || "",
      subject: result.subject || "",
      body: result.body || "",
      scheduledAt: result.scheduledAt || "",
      reason: result.reason || ""
    };
  } catch (e) {
    console.warn("Email intent detection failed:", e);
    return null;
  }
}