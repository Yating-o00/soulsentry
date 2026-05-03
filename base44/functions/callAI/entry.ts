import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Unified AI gateway: uses Kimi (Moonshot) API exclusively.
 *
 * Accepts: { prompt, response_json_schema?, system_prompt?, feature? }
 * Returns the AI response (parsed JSON if schema provided, string otherwise) along with usage info
 *
 * Dynamic billing model (v2):
 *  - 1 credit ≈ 200 tokens (combined input + output)
 *  - Pre-charge a hold amount BEFORE calling Kimi to prevent concurrent over-spending
 *  - After the call, settle the difference based on real token usage (refund or charge extra)
 *  - On failure, fully refund the hold
 *  - Different `feature` keys can apply a multiplier (see FEATURE_MULTIPLIERS)
 */

// 计费倍率：保持透明可预期，最高 1.5x，避免感知突兀
const FEATURE_MULTIPLIERS = {
  general_ai: 1.0,
  emotional_reminder: 1.0,
  smart_priority: 1.1,
  note_summary: 1.2,
  daily_briefing: 1.3,
  task_breakdown: 1.4,
  schedule_optimize: 1.4,
  weekly_plan: 1.5,
  monthly_plan: 1.5,
  default: 1.0,
};

// 1 credit ≈ 200 tokens (input + output) —— 比之前便宜一半，更贴近用户直觉
const TOKENS_PER_CREDIT = 200;
const MIN_CHARGE = 1;
// 预扣额度：调用前先扣这么多点,防止并发超额。结算时多退少补
const HOLD_AMOUNT = 5;

function calcCharge(usage, feature) {
  const total = (usage?.total_tokens) ||
    ((usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0)) || 0;
  if (total <= 0) return MIN_CHARGE;
  const multiplier = FEATURE_MULTIPLIERS[feature] || FEATURE_MULTIPLIERS.default;
  const credits = Math.ceil((total / TOKENS_PER_CREDIT) * multiplier);
  return Math.max(MIN_CHARGE, credits);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let userId = null;
  let holdApplied = 0;
  let holdBalance = 0;

  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    const body = await req.json();
    const { prompt, response_json_schema, system_prompt, feature } = body;

    if (!prompt) {
      return Response.json({ error: 'prompt is required' }, { status: 400 });
    }

    const apiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
      return Response.json({ error: 'KIMI_API_KEY not set' }, { status: 500 });
    }

    // === 预扣阶段：调用 Kimi 之前先锁定额度，防并发超额 ===
    const currentCredits = user.ai_credits ?? 0;
    if (currentCredits < MIN_CHARGE) {
      return Response.json({
        error: 'INSUFFICIENT_CREDITS',
        message: `AI 点数不足，至少需要 ${MIN_CHARGE} 点`,
        balance: currentCredits,
      }, { status: 402 });
    }
    holdApplied = Math.min(HOLD_AMOUNT, currentCredits);
    holdBalance = currentCredits - holdApplied;
    try {
      await base44.asServiceRole.entities.User.update(user.id, { ai_credits: holdBalance });
    } catch (e) {
      console.warn('[callAI] hold failed:', e?.message || e);
      holdApplied = 0;
      holdBalance = currentCredits;
    }

    const messages = [];

    if (response_json_schema) {
      messages.push({
        role: "system",
        content: system_prompt
          ? `${system_prompt}\n\n你必须严格按JSON格式返回结果，符合以下Schema，不要输出任何其他内容。\nJSON Schema:\n${JSON.stringify(response_json_schema)}`
          : `你是一个智能助手。请严格按JSON格式返回结果，符合以下Schema，不要输出任何其他内容。\nJSON Schema:\n${JSON.stringify(response_json_schema)}`
      });
    } else if (system_prompt) {
      messages.push({ role: "system", content: system_prompt });
    }

    messages.push({ role: "user", content: prompt });

    const kimiBody = {
      model: "kimi-k2-turbo-preview",
      messages,
      temperature: 0.7,
    };

    if (response_json_schema) {
      kimiBody.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(kimiBody)
    });

    if (!response.ok) {
      // === 失败：全额退还预扣 ===
      if (holdApplied > 0) {
        try {
          await base44.asServiceRole.entities.User.update(userId, { ai_credits: holdBalance + holdApplied });
        } catch (_) {}
      }
      const errText = await response.text();
      return Response.json({ error: `Kimi API error: ${response.status} ${errText}` }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const usage = data.usage || null;

    if (!content) {
      // === 空响应：全额退还预扣 ===
      if (holdApplied > 0) {
        try {
          await base44.asServiceRole.entities.User.update(userId, { ai_credits: holdBalance + holdApplied });
        } catch (_) {}
      }
      return Response.json({ error: 'Empty response from Kimi' }, { status: 502 });
    }

    // === 结算阶段：按真实 token 用量计算实际扣费,并对预扣做差额结算 ===
    const charge = calcCharge(usage, feature);
    const refund = holdApplied - charge; // 正数=退还，负数=补扣
    let newBalance = holdBalance + holdApplied - charge;
    if (newBalance < 0) newBalance = 0;

    try {
      await base44.asServiceRole.entities.User.update(userId, { ai_credits: newBalance });
      await base44.asServiceRole.entities.AICreditTransaction.create({
        type: "consume",
        amount: -charge,
        balance_after: newBalance,
        feature: feature || "general_ai",
        description: `AI 调用消耗 ${charge} 点（${usage?.total_tokens || 0} tokens, 倍率 ${FEATURE_MULTIPLIERS[feature] || 1.0}x）`,
      });
    } catch (e) {
      console.warn('[callAI] settlement failed:', e?.message || e);
    }

    let parsedData;
    if (response_json_schema) {
      try {
        const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        parsedData = JSON.parse(cleaned);
      } catch (parseErr) {
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          parsedData = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
        } else {
          return Response.json({ error: 'Failed to parse Kimi JSON response' }, { status: 502 });
        }
      }
    } else {
      parsedData = content;
    }

    return Response.json({
      source: 'kimi',
      data: parsedData,
      usage,
      charged: charge,
      refunded: refund > 0 ? refund : 0,
      balance: newBalance,
    });
  } catch (error) {
    // === 兜底：任何异常都尝试退还预扣 ===
    if (userId && holdApplied > 0) {
      try {
        await base44.asServiceRole.entities.User.update(userId, { ai_credits: holdBalance + holdApplied });
      } catch (_) {}
    }
    console.error('[callAI] Critical error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});