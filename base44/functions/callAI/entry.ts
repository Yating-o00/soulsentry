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

    // 1) Try Kimi (Moonshot) API first
    const moonshotKey = Deno.env.get("MOONSHOT_API_KEY");
    if (moonshotKey) {
      try {
        const messages = [
          { role: "user", content: prompt }
        ];

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

        if (kimiResponse.ok) {
          const kimiData = await kimiResponse.json();
          const content = kimiData.choices?.[0]?.message?.content;

          if (content) {
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
                  throw new Error('Failed to parse Kimi JSON');
                }
              }
              return Response.json({ source: 'kimi', data: parsed });
            }
            return Response.json({ source: 'kimi', data: content });
          }
        } else {
          const errText = await kimiResponse.text();
          console.log('[callAI] Kimi API failed, falling back to Base44:', kimiResponse.status, errText);
        }
      } catch (e) {
        console.log('[callAI] Kimi error, falling back to Base44:', e?.message || e);
      }
    }

    // 2) Fallback to Base44 InvokeLLM
    try {
      const params = { prompt };
      if (response_json_schema) params.response_json_schema = response_json_schema;
      if (file_urls) params.file_urls = file_urls;
      if (add_context_from_internet) params.add_context_from_internet = add_context_from_internet;
      if (model) params.model = model;

      const result = await base44.integrations.Core.InvokeLLM(params);
      return Response.json({ source: 'base44', data: result });
    } catch (e) {
      console.error('[callAI] Base44 InvokeLLM also failed:', e?.message || e);
      return Response.json({ error: 'All AI services unavailable' }, { status: 503 });
    }
  } catch (error) {
    console.error('[callAI] Critical error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});