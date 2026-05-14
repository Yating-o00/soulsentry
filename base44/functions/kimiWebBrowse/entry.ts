import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Kimi Web Browse — give the agent the ability to answer real-time / web-aware questions
 * by leveraging Kimi's builtin $web_search tool.
 *
 * Input:
 *   - query (string, required): the question or topic to research on the web
 *   - language (string, optional): "zh" or "en", default "zh"
 *
 * Output:
 *   - { answer: string, references: [{ title, url }] }
 *
 * Reference: https://platform.moonshot.ai/docs/guide/use-web-search
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, language = 'zh' } = await req.json();
    if (!query || typeof query !== 'string') {
      return Response.json({ error: 'Missing query' }, { status: 400 });
    }

    const apiKey = Deno.env.get('KIMI_API_KEY') || Deno.env.get('MOONSHOT_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'KIMI_API_KEY not configured' }, { status: 500 });
    }

    const systemPrompt = language === 'en'
      ? 'You are a research assistant. Use the $web_search tool to find up-to-date information and answer the user concisely. Cite the sources you used at the end as a bulleted list of URLs.'
      : '你是一名联网研究助手。请使用 $web_search 工具检索最新信息后再回答用户问题。回答简洁、有条理；末尾用"参考来源:"列出引用的网页 URL。';

    // Kimi builtin web_search tool
    const tools = [
      {
        type: 'builtin_function',
        function: { name: '$web_search' }
      }
    ];

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query }
    ];

    // Multi-turn loop to satisfy builtin tool calls (server-side execution)
    const references = [];
    let finalContent = '';
    let safety = 0;

    while (safety < 6) {
      safety++;

      const resp = await fetch('https://api.moonshot.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({
          model: 'kimi-k2-turbo-preview',
          messages,
          tools,
          temperature: 0.3
        })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return Response.json(
          { error: `Kimi API error ${resp.status}: ${errText}` },
          { status: 502 }
        );
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;
      if (!msg) break;

      const finishReason = choice.finish_reason;

      // Append assistant message to history
      messages.push(msg);

      if (finishReason === 'tool_calls' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        // Builtin tools: echo the tool call arguments back as tool result (per Kimi docs)
        for (const tc of msg.tool_calls) {
          let toolArgs = {};
          try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch {}
          // Collect references from arguments if present (Kimi returns search results inside)
          if (Array.isArray(toolArgs?.refs)) {
            for (const r of toolArgs.refs) {
              if (r?.url) references.push({ title: r.title || r.url, url: r.url });
            }
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function?.name,
            content: JSON.stringify(toolArgs)
          });
        }
        continue;
      }

      // Final answer
      finalContent = msg.content || '';
      break;
    }

    // Extract URL references from the answer text as fallback
    if (references.length === 0 && finalContent) {
      const urlMatches = finalContent.match(/https?:\/\/[^\s)）"】]+/g) || [];
      for (const u of urlMatches) {
        references.push({ title: u, url: u });
      }
    }

    return Response.json({
      answer: finalContent,
      references: references.slice(0, 10)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});