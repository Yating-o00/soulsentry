import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Unified AI gateway: tries Base44 InvokeLLM first, falls back to Kimi (Moonshot) API.
 * 
 * Accepts: { prompt, response_json_schema?, file_urls?, add_context_from_internet?, model? }
 * Returns the AI response (parsed JSON if schema provided, string otherwise)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, response_json_schema, file_urls, add_context_from_internet, model } = body;

    if (!prompt) {
      return Response.json({ error: 'prompt is required' }, { status: 400 });
    }

    // 1) Try Base44 InvokeLLM first
    try {
      const params = { prompt };
      if (response_json_schema) params.response_json_schema = response_json_schema;
      if (file_urls) params.file_urls = file_urls;
      if (add_context_from_internet) params.add_context_from_internet = add_context_from_internet;
      if (model) params.model = model;

      const result = await base44.integrations.Core.InvokeLLM(params);
      return Response.json({ source: 'base44', data: result });
    } catch (e) {
      console.log('[callAI] InvokeLLM failed, falling back to Kimi:', e?.message || e);
    }

    // 2) Fallback to Kimi (Moonshot) API
    const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
    if (!moonshotKey) {
      return Response.json({ error: 'AI service unavailable (no credits and no fallback API key)' }, { status: 503 });
    }

    const messages = [
      { role: "user", content: prompt }
    ];

    // If JSON schema is provided, instruct Kimi to return JSON
    if (response_json_schema) {
      messages.unshift({
        role: "system",
        content: `You are a helpful assistant. You MUST respond with ONLY a valid JSON object that strictly matches the following JSON Schema. Do NOT include any markdown formatting, code blocks, or extra text.\n\nJSON Schema:\n${JSON.stringify(response_json_schema)}`
      });
    }

    const kimiBody = {
      model: "moonshot-v1-8k",
      messages,
      temperature: 0.7
    };

    const kimiResponse = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${moonshotKey.trim()}`
      },
      body: JSON.stringify(kimiBody)
    });

    if (!kimiResponse.ok) {
      const errText = await kimiResponse.text();
      console.error('[callAI] Kimi API error:', kimiResponse.status, errText);
      return Response.json({ error: `Kimi API error: ${kimiResponse.status}` }, { status: 502 });
    }

    const kimiData = await kimiResponse.json();
    const content = kimiData.choices?.[0]?.message?.content;

    if (!content) {
      return Response.json({ error: 'Kimi returned empty response' }, { status: 502 });
    }

    // If JSON schema was provided, parse the response
    if (response_json_schema) {
      let parsed;
      try {
        // Clean up potential markdown code blocks
        const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        // Try to find JSON in the response
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
        } else {
          console.error('[callAI] Failed to parse Kimi JSON:', content.substring(0, 200));
          return Response.json({ error: 'Failed to parse AI response as JSON' }, { status: 502 });
        }
      }
      return Response.json({ source: 'kimi', data: parsed });
    }

    return Response.json({ source: 'kimi', data: content });
  } catch (error) {
    console.error('[callAI] Critical error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});