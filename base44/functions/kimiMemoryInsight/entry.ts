import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Thin wrapper that delegates to callAI so all AI calls share the same
 * billing pipeline (pre-charge + settlement based on real token usage).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt } = await req.json();
    if (!prompt) {
      return Response.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const res = await base44.functions.invoke('callAI', {
      prompt,
      system_prompt: '你是用户的私人效率顾问。请严格按JSON格式返回结果，不要输出任何其他内容。',
      response_json_schema: {
        type: 'object',
        properties: {
          insight: { type: 'string' },
        },
        required: ['insight'],
      },
      feature: 'smart_priority',
    });

    // base44.functions.invoke returns { data, status }
    if (res?.status && res.status >= 400) {
      return Response.json(res.data || { error: 'callAI failed' }, { status: res.status });
    }

    const payload = res?.data?.data || res?.data || {};
    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});