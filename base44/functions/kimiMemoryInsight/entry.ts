import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { prompt } = await req.json();
  if (!prompt) {
    return Response.json({ error: 'Missing prompt' }, { status: 400 });
  }

  const apiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
  if (!apiKey) {
    return Response.json({ error: 'KIMI_API_KEY not set' }, { status: 500 });
  }

  const cleanKey = apiKey.trim();
  const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanKey}`,
    },
    body: JSON.stringify({
      model: "kimi-k2-turbo-preview",
      messages: [
        {
          role: "system",
          content: "你是用户的私人效率顾问。请严格按JSON格式返回结果，不要输出任何其他内容。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return Response.json({ error: `Kimi API error: ${response.status} ${errText}` }, { status: 502 });
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { insight: content.slice(0, 100) };
  }

  return Response.json(parsed);
});