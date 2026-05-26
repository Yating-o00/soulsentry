import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 综合用户最近心签 + 已订阅外部源 + AI 联网检索，生成多元"外部视野"卡片
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. 拉取最近 20 条心签，提取关键词/标签/分类
    const recentNotes = await base44.entities.Note.filter(
      { deleted_at: null },
      '-created_date',
      20
    );

    const tagPool = [];
    const categoryPool = [];
    const snippetPool = [];
    (recentNotes || []).forEach(n => {
      (n.tags || []).forEach(t => tagPool.push(t));
      if (n.ai_analysis?.category) categoryPool.push(n.ai_analysis.category);
      const snippet = (n.ai_analysis?.summary || n.plain_text || '').slice(0, 120);
      if (snippet) snippetPool.push(snippet);
    });

    const topTags = [...new Set(tagPool)].slice(0, 10);
    const topCategories = [...new Set(categoryPool)].slice(0, 5);
    const recentSnippets = snippetPool.slice(0, 8);

    // 2. 拉取用户长期关注的外部订阅源
    const feeds = await base44.entities.ExternalFeed.filter({ is_active: true }, '-last_fetched_at', 10);
    const feedNames = (feeds || []).map(f => f.name);

    // 3. 调用 InvokeLLM 联网搜索 + 综合生成多元视野卡片
    const prompt = `你是一位多元视野策展人。基于用户最近的心签内容、订阅源与长期关注，挑选 5 条对用户当下最有价值的"外部视野"卡片，帮他跳出信息茧房。

用户最近心签关键词：${topTags.join('、') || '（无）'}
用户关注的分类：${topCategories.join('、') || '（无）'}
用户已订阅的外部源：${feedNames.join('、') || '（无）'}
用户最近心签摘要片段：
${recentSnippets.map((s, i) => `${i + 1}. ${s}`).join('\n') || '（无）'}

请综合以下 5 类来源，挑选 5 条多元卡片（每类至少 1 条，按相关性排序）：
- news（即时新闻）：与心签关键词相关的最新新闻
- subscription（订阅更新）：用户订阅源可能的最新动向
- notification（即时通知）：与用户近期关注主题相关的即时事件
- classic（经典语录/常识）：与心签主题呼应的经典名言、行业常识或长期沉淀的判断
- expansion（拓展视野）：用户可能不知道但值得关注的相关领域/反向视角

每条卡片包含：
- type: 上述五类之一
- title: 简洁标题（不超过 30 字）
- summary: 1-2 句话摘要（不超过 80 字）
- source: 来源标识（如媒体名、人物名、领域名）
- url: 如有真实链接则填写，否则留空
- relevance: 与用户当下心签的关联点（一句话，不超过 40 字）

返回 JSON。`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          cards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['news', 'subscription', 'notification', 'classic', 'expansion'] },
                title: { type: 'string' },
                summary: { type: 'string' },
                source: { type: 'string' },
                url: { type: 'string' },
                relevance: { type: 'string' }
              },
              required: ['type', 'title', 'summary']
            }
          }
        },
        required: ['cards']
      }
    });

    return Response.json({
      cards: res?.cards || [],
      generated_at: new Date().toISOString(),
      based_on: {
        tags: topTags,
        categories: topCategories,
        feeds: feedNames
      }
    });
  } catch (error) {
    console.error('getExternalVision error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});