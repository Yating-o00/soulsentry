import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 心签智能分析后端函数
 *
 * 职责：
 *   1. 接收 note_id，加载心签内容（包括链接抓取/文件提取）
 *   2. 调用 Kimi 进行：自动摘要 / 关键词标签 / 内容分类 / 相关外部信息补充
 *   3. 回写到 Note.ai_analysis，并触发 personalDataEngine 沉淀
 *
 * 入参：{ note_id: string, force?: boolean }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { note_id, force = false } = await req.json().catch(() => ({}));
    if (!note_id) return Response.json({ error: 'note_id required' }, { status: 400 });

    // 1. 加载心签
    const notes = await base44.entities.Note.filter({ id: note_id });
    const note = notes?.[0];
    if (!note) return Response.json({ error: 'Note not found' }, { status: 404 });

    // 已分析过且非强制 → 跳过
    if (!force && note.ai_status === 'done' && note.ai_analysis?.summary) {
      return Response.json({ skipped: true, ai_analysis: note.ai_analysis });
    }

    // 标记为处理中
    await base44.entities.Note.update(note_id, { ai_status: 'processing' });

    // 2. 拼装原始素材
    let rawText = (note.plain_text || note.content || '').replace(/<[^>]+>/g, ' ').trim();
    const sourceType = note.source_type || 'manual';
    const sourceUrl = note.source_url || '';
    const attachments = note.attachments || [];

    // 2.a 网页链接：抓取正文
    if (sourceUrl && (sourceType === 'web_link' || sourceType === 'wechat_share' || sourceType === 'external_feed')) {
      try {
        const webRes = await base44.functions.invoke('kimiWebBrowse', { url: sourceUrl });
        const webContent = webRes?.data?.content || webRes?.data?.text || '';
        if (webContent) rawText = `${rawText}\n\n[网页正文]\n${webContent.slice(0, 8000)}`;
      } catch (e) {
        console.warn('kimiWebBrowse failed:', e.message);
      }
    }

    // 2.b 文件附件：用 Core.ExtractDataFromUploadedFile 提取
    if (attachments.length > 0) {
      for (const att of attachments.slice(0, 3)) {
        if (!att.file_url) continue;
        try {
          const ext = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url: att.file_url,
            json_schema: {
              type: 'object',
              properties: {
                text_content: { type: 'string', description: '文件中的全部文本内容' },
                key_points: { type: 'array', items: { type: 'string' } },
              },
            },
          });
          const extracted = ext?.output?.text_content || '';
          if (extracted) {
            rawText = `${rawText}\n\n[附件:${att.file_name || '文件'}]\n${extracted.slice(0, 6000)}`;
          }
        } catch (e) {
          console.warn('Extract file failed:', e.message);
        }
      }
    }

    if (!rawText || rawText.length < 5) {
      await base44.entities.Note.update(note_id, { ai_status: 'failed' });
      return Response.json({ error: 'No content to analyze' }, { status: 400 });
    }

    // 3. 调用 Kimi 做智能分析
    const apiKey = Deno.env.get('KIMI_API_KEY') || Deno.env.get('MOONSHOT_API_KEY');
    if (!apiKey) {
      await base44.entities.Note.update(note_id, { ai_status: 'failed' });
      return Response.json({ error: 'KIMI_API_KEY missing' }, { status: 500 });
    }

    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '一句话核心摘要,30字以内' },
        key_points: { type: 'array', items: { type: 'string' }, description: '3-5 条关键要点' },
        tags: { type: 'array', items: { type: 'string' }, description: '3-6 个智能标签,不带#' },
        category: {
          type: 'string',
          enum: ['work', 'study', 'idea', 'life', 'finance', 'health', 'reading', 'other'],
        },
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              type: { type: 'string', description: '人物/地点/产品/概念/时间 等' },
            },
          },
        },
        external_context: { type: 'string', description: '基于知识为这条心签补充的相关背景或延伸思考,80字以内' },
      },
      required: ['summary', 'key_points', 'tags', 'category'],
    };

    const sysPrompt = `你是用户的"第二大脑"AI 助手。用户随时给自己发心签(类似微信文件传输助手),内容包括想法/链接/文件/报告等。
你的任务:
1. 提炼一句话摘要(简短有力)
2. 抽取 3-5 个关键要点
3. 生成 3-6 个智能标签
4. 自动分类
5. 抽取关键实体
6. 基于该内容的主题,补充 1 段相关的延伸背景或思考(让用户视野更开阔)

严格按以下 JSON Schema 返回:
${JSON.stringify(schema)}`;

    const resp = await fetch('https://api.moonshot.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: 'kimi-k2-turbo-preview',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: `心签来源:${sourceType}${sourceUrl ? ' / ' + sourceUrl : ''}\n\n内容:\n${rawText.slice(0, 10000)}` },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      await base44.entities.Note.update(note_id, { ai_status: 'failed' });
      return Response.json({ error: `Kimi ${resp.status}: ${t.slice(0, 200)}` }, { status: 502 });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    let parsed = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const ai_analysis = {
      summary: parsed.summary || '',
      key_points: parsed.key_points || [],
      entities: parsed.entities || [],
      category: parsed.category || 'other',
      external_context: parsed.external_context || '',
      related_links: [],
      analyzed_at: new Date().toISOString(),
    };

    // 4. 合并标签 (AI 标签 + 已有标签去重)
    const aiTags = parsed.tags || [];
    const mergedTags = Array.from(new Set([...(note.tags || []), ...aiTags])).slice(0, 12);

    // 5. 回写
    await base44.entities.Note.update(note_id, {
      ai_analysis,
      tags: mergedTags,
      ai_status: 'done',
    });

    // 6. 沉淀到个人数据库
    try {
      await base44.asServiceRole.entities.UserDataPoint.create({
        data_type: 'habit',
        subtype: 'heart_sign_capture',
        summary: ai_analysis.summary || rawText.slice(0, 80),
        category: ai_analysis.category,
        weight: sourceType === 'report' ? 4 : 2,
        tags: aiTags,
        occurred_at: new Date().toISOString(),
        hour_of_day: new Date().getHours(),
        day_of_week: new Date().getDay(),
        related_note_id: note_id,
        metadata: { source_type: sourceType, source_url: sourceUrl || null },
      });
    } catch (e) {
      console.warn('UserDataPoint create failed:', e.message);
    }

    return Response.json({ success: true, ai_analysis, tags: mergedTags });
  } catch (error) {
    console.error('analyzeHeartSign error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});