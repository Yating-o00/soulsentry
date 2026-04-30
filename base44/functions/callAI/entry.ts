import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Unified AI gateway: uses Kimi (Moonshot) API exclusively.
 * 
 * Accepts: { prompt, response_json_schema?, system_prompt?, feature? }
 * Returns the AI response (parsed JSON if schema provided, string otherwise) along with usage info
 *
 * Dynamic billing model:
 *  - 1 credit ≈ 100 tokens (combined input + output) by default
 *  - Each call has a minimum charge of 1 credit if it succeeded
 *  - Different `feature` keys can apply a multiplier (see FEATURE_MULTIPLIERS)
 */

// 不同 AI 功能的计费倍率（基于 token 实际消耗动态计费）
// 倍率 = 复杂度系数：简单对话 1x，结构化分析 1.5x，规划/分解 2x，深度分析 2.5x
const FEATURE_MULTIPLIERS = {
  general_ai: 1.0,
  smart_priority: 1.2,
  emotional_reminder: 1.0,
  note_summary: 1.5,
  daily_briefing: 1.8,
  task_breakdown: 2.0,
  schedule_optimize: 2.0,
  weekly_plan: 2.5,
  monthly_plan: 2.8,
  default: 1.0,
};

// 1 credit ≈ 100 tokens (input + output)
const TOKENS_PER_CREDIT = 100;
const MIN_CHARGE = 1;

function calcCharge(usage, feature) {
  const total = (usage?.total_tokens) ||
    ((usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0)) || 0;
  if (total <= 0) return MIN_CHARGE;
  const multiplier = FEATURE_MULTIPLIERS[feature] || FEATURE_MULTIPLIERS.default;
  const credits = Math.ceil((total / TOKENS_PER_CREDIT) * multiplier);
  return Math.max(MIN_CHARGE, credits);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, response_json_schema, system_prompt, feature } = body;

    if (!prompt) {
      return Response.json({ error: 'prompt is required' }, { status: 400 });
    }

    // 余额预检：至少需要 1 点
    const currentCredits = user.ai_credits ?? 0;
    if (currentCredits < MIN_CHARGE) {
      return Response.json({
        error: 'INSUFFICIENT_CREDITS',
        message: `AI 点数不足，至少需要 ${MIN_CHARGE} 点`,
        balance: currentCredits,
      }, { status: 402 });
    }

    const apiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
      return Response.json({ error: 'KIMI_API_KEY not set' }, { status: 500 });
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
      const errText = await response.text();
      return Response.json({ error: `Kimi API error: ${response.status} ${errText}` }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const usage = data.usage || null;

    if (!content) {
      return Response.json({ error: 'Empty response from Kimi' }, { status: 502 });
    }

    // 按 token 用量动态扣费（非阻塞日志）
    const charge = calcCharge(usage, feature);
    let newBalance = currentCredits;
    if (charge > 0) {
      newBalance = Math.max(0, currentCredits - charge);
      try {
        await base44.asServiceRole.entities.User.update(user.id, { ai_credits: newBalance });
        await base44.asServiceRole.entities.AICreditTransaction.create({
          type: "consume",
          amount: -charge,
          balance_after: newBalance,
          feature: feature || "general_ai",
          description: `AI 调用消耗 ${charge} 点（${usage?.total_tokens || 0} tokens）`,
        });
      } catch (e) {
        console.warn('[callAI] credit deduction failed:', e?.message || e);
      }
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
      balance: newBalance,
    });
  } catch (error) {
    console.error('[callAI] Critical error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});