import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Unified AI gateway: uses Kimi (Moonshot) API exclusively.
 * 
 * Accepts: { prompt, response_json_schema?, system_prompt? }
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
    const { prompt, response_json_schema, system_prompt } = body;

    if (!prompt) {
      return Response.json({ error: 'prompt is required' }, { status: 400 });
    }

    const apiKey = Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
      return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });
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

    if (!content) {
      return Response.json({ error: 'Empty response from Kimi' }, { status: 502 });
    }

    if (response_json_schema) {
      let parsed;
      try {
        const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
        } else {
          return Response.json({ error: 'Failed to parse Kimi JSON response' }, { status: 502 });
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