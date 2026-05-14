import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Unified Kimi API wrapper — drop-in replacement for Core.InvokeLLM.
 *
 * Accepts:
 *   - prompt (string, required)
 *   - response_json_schema (object, optional) — if provided, forces JSON output
 *   - file_urls (array, optional) — image URLs for vision tasks
 *   - system_prompt (string, optional) — override default system prompt
 *   - model (string, optional) — default kimi-k2-turbo-preview; use 'moonshot-v1-8k-vision-preview' for images
 *   - temperature (number, optional, default 0.7)
 *
 * Returns:
 *   - Parsed JSON object (if response_json_schema provided)
 *   - Plain string wrapped as { text: "..." } otherwise
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // 允许两种调用：1) 已登录用户  2) 服务角色内部互调（无 user）
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const isServiceCall = req.headers.get('x-base44-service-role') || !user;
    if (!user && !isServiceCall) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      prompt,
      response_json_schema,
      file_urls,
      system_prompt,
      model,
      temperature = 0.7
    } = await req.json();

    if (!prompt) {
      return Response.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const apiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
      return Response.json({ error: 'KIMI_API_KEY not configured' }, { status: 500 });
    }

    // Build system prompt
    const wantsJson = !!response_json_schema;
    let systemContent = system_prompt || "你是一位专业、贴心的 AI 助手。回答需简洁、准确、有温度。";
    if (wantsJson) {
      systemContent += `\n\n请严格按以下 JSON Schema 返回结果，不要输出任何额外文字：\n${JSON.stringify(response_json_schema)}`;
    }

    // Build user message (vision-capable if file_urls present)
    const hasImages = Array.isArray(file_urls) && file_urls.length > 0;
    let userContent;
    if (hasImages) {
      userContent = [
        { type: "text", text: prompt },
        ...file_urls.map((url) => ({ type: "image_url", image_url: { url } }))
      ];
    } else {
      userContent = prompt;
    }

    // Select model: vision model if images, else default long-context turbo
    const selectedModel = model || (hasImages ? "moonshot-v1-32k-vision-preview" : "kimi-k2-turbo-preview");

    const body = {
      model: selectedModel,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent }
      ],
      temperature
    };
    if (wantsJson) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json(
        { error: `Kimi API error ${response.status}: ${errText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // If JSON was requested, parse and return the object directly
    if (wantsJson) {
      try {
        return Response.json(JSON.parse(content));
      } catch {
        // Attempt to extract JSON from markdown code block
        const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          try {
            return Response.json(JSON.parse(match[1]));
          } catch {}
        }
        return Response.json({ _raw: content, _parse_error: true });
      }
    }

    // Plain text response
    return Response.json({ text: content });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});