import { base44 } from "@/api/base44Client";
import { updateCachedUser } from "@/lib/userCache";

/**
 * Unified AI call helper.
 * Billing happens **server-side** in functions/callAI based on real token usage.
 *
 * @param {object} params - { prompt, response_json_schema?, system_prompt? }
 * @param {string} [featureKey] - 功能键，传给后端用于应用计费倍率（仅元信息，无前置扣费）
 * @returns {Promise<any>} - AI response (parsed JSON if schema provided, string otherwise)
 */
export async function invokeAI(params, featureKey) {
  // 若要求 JSON schema 输出但未提供 system_prompt，自动追加约束，
  // 避免模型输出 markdown 代码块或解释文字导致前端解析失败。
  const needsJsonSystemPrompt = params.response_json_schema && !params.system_prompt;
  const systemPrompt = needsJsonSystemPrompt
    ? "你必须直接返回 JSON 对象，不要输出 markdown 代码块、解释文字或额外内容。"
    : params.system_prompt;

  const response = await base44.functions.invoke('callAI', {
    prompt: params.prompt,
    response_json_schema: params.response_json_schema,
    system_prompt: systemPrompt,
    feature: featureKey,
  });

  // 后端返回时已扣费 + 写入交易记录；此处刷新本地缓存的余额
  if (response?.data?.balance != null) {
    updateCachedUser({ ai_credits: response.data.balance });
    window.dispatchEvent(new CustomEvent("credits-updated", { detail: { credits: response.data.balance } }));
  }

  if (response?.data?.error === 'INSUFFICIENT_CREDITS' || response?.status === 402) {
    const err = new Error(response.data.message || 'AI 点数不足');
    err.code = "INSUFFICIENT_CREDITS";
    err.balance = response.data.balance ?? 0;
    throw err;
  }

  if (response?.data?.error === 'AI_SERVICE_NOT_CONFIGURED') {
    const err = new Error(response.data.message || 'AI 服务未配置');
    err.code = "AI_SERVICE_NOT_CONFIGURED";
    throw err;
  }

  if (response?.data?.data !== undefined) {
    return response.data.data;
  }

  if (response?.data?.error) {
    throw new Error(response.data.message || response.data.error);
  }

  throw new Error('AI service unavailable');
}