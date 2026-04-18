import { base44 } from "@/api/base44Client";
import { AI_FEATURES } from "@/components/credits/creditConfig";

/**
 * Unified AI call helper with credit check.
 * Uses Kimi API exclusively via the callAI backend function.
 * 
 * @param {object} params - { prompt, response_json_schema?, system_prompt? }
 * @param {string} [featureKey] - AI功能键名，用于扣除点数。如果不传则不扣点数。
 * @returns {Promise<any>} - AI response (parsed JSON if schema provided, string otherwise)
 */
export async function invokeAI(params, featureKey) {
  // 1) 如果指定了功能键，先检查并扣除点数
  if (featureKey && AI_FEATURES[featureKey]) {
    const user = await base44.auth.me();
    const currentCredits = user.ai_credits ?? 0;
    const cost = AI_FEATURES[featureKey].cost;

    if (currentCredits < cost) {
      const err = new Error(`AI点数不足：需要 ${cost} 点，当前余额 ${currentCredits} 点`);
      err.code = "INSUFFICIENT_CREDITS";
      err.cost = cost;
      err.balance = currentCredits;
      err.featureName = AI_FEATURES[featureKey].name;
      throw err;
    }

    // 预扣点数
    const newBalance = currentCredits - cost;
    await base44.auth.updateMe({ ai_credits: newBalance });

    // 记录交易
    await base44.entities.AICreditTransaction.create({
      type: "consume",
      amount: -cost,
      balance_after: newBalance,
      feature: featureKey,
      description: `使用「${AI_FEATURES[featureKey].name}」消耗 ${cost} 点`
    });
  }

  // 2) 调用 Kimi API（通过 callAI 后端函数）
  const response = await base44.functions.invoke('callAI', {
    prompt: params.prompt,
    response_json_schema: params.response_json_schema,
    system_prompt: params.system_prompt,
  });

  if (response?.data?.data !== undefined) {
    return response.data.data;
  }

  if (response?.data?.error) {
    throw new Error(response.data.error);
  }

  throw new Error('AI service unavailable');
}