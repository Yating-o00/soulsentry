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
  const response = await base44.functions.invoke('callAI', {
    prompt: params.prompt,
    response_json_schema: params.response_json_schema,
    system_prompt: params.system_prompt,
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

  if (response?.data?.data !== undefined) {
    return response.data.data;
  }

  if (response?.data?.error) {
    throw new Error(response.data.error);
  }

  throw new Error('AI service unavailable');
}