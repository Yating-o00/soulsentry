// 心签智能分析后端函数
// 输入: { note_id } 或 entity automation payload
// 输出: 更新 Note.ai_analysis (summary / key_points / tags / category / related_topics)
//      并写入 UserDataPoint 沉淀画像
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MAX_TEXT = 8000;

async function extractFromFile(base44, attachment) {
  try {
    if (!attachment?.file_url) return '';
    const schema = {
      type: 'object',
      properties: { content: { type: 'string' } }
    };
    const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url: attachment.file_url,
      json_schema: schema
    });
    if (res?.status === 'success' && res.output) {
      const out = Array.isArray(res.output) ? res.output[0] : res.output;
      return (out?.content || JSON.stringify(out)).slice(0, MAX_TEXT);
    }
  } catch (e) {
    console.error('extractFromFile error', e?.message);
  }
  return '';
}

async function fetchWebContent(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 SoulSentry/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!resp.ok) return '';
    const html = await resp.text();
    // 简单去标签提取文本
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, MAX_TEXT);
  } catch (e) {
    console.error('fetchWebContent error', e?.message);
    return '';
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // 兼容两种触发方式: 直接调用 { note_id } / entity automation { event, data }
    const noteId = body.note_id || body.event?.entity_id || body.data?.id;
    if (!noteId) return Response.json({ error: 'note_id required' }, { status: 400 });

    let note = null;
    try {
      const list = await base44.asServiceRole.entities.Note.filter({ id: noteId });
      note = Array.isArray(list) ? list[0] : null;
    } catch (e) {
      console.error('Note.filter failed', e?.message);
    }
    if (!note) {
      try { note = await base44.asServiceRole.entities.Note.get(noteId); } catch (_) {}
    }
    if (!note) return Response.json({ error: 'Note not found', noteId }, { status: 404 });

    // 跳过已分析过的，避免循环
    if (note.ai_status === 'completed' && note.ai_analysis?.analyzed_at) {
      return Response.json({ ok: true, skipped: true });
    }

    await base44.asServiceRole.entities.Note.update(noteId, { ai_status: 'processing' });

    // 收集所有可分析的文本
    let materialText = (note.plain_text || note.content || '').replace(/<[^>]+>/g, ' ').slice(0, MAX_TEXT);

    // 外部链接（external_feed 已携带完整描述，跳过二次抓取以避免超时失败）
    if (note.source_url && note.source_type !== 'external_feed') {
      try {
        const web = await fetchWebContent(note.source_url);
        if (web) materialText += `\n\n[外部链接内容 ${note.source_url}]\n${web}`;
      } catch (_) { /* 抓取失败不影响主流程 */ }
    }

    // 附件（PDF / 文档 / 图片）
    if (Array.isArray(note.attachments) && note.attachments.length) {
      for (const att of note.attachments.slice(0, 3)) {
        const fileText = await extractFromFile(base44, att);
        if (fileText) materialText += `\n\n[附件 ${att.file_name || att.file_url}]\n${fileText}`;
      }
    }

    materialText = materialText.slice(0, MAX_TEXT * 2);

    // 调用 Kimi 做统一智能处理
    const apiKey = Deno.env.get('KIMI_API_KEY') || Deno.env.get('MOONSHOT_API_KEY');
    if (!apiKey) {
      await base44.asServiceRole.entities.Note.update(noteId, { ai_status: 'failed' });
      return Response.json({ error: 'KIMI_API_KEY missing' }, { status: 500 });
    }

    const schema = {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '1-2 句话精炼摘要' },
        key_points: { type: 'array', items: { type: 'string' }, description: '3-5 个核心要点' },
        tags: { type: 'array', items: { type: 'string' }, description: '3-6 个智能标签，不含 #' },
        category: { type: 'string', description: '一级分类：产品/技术/读书/灵感/工作/生活/财务/健康/其他' },
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: { text: { type: 'string' }, type: { type: 'string' } }
          },
          description: '关键实体：人名/组织/项目/产品/技术等'
        },
        related_topics: { type: 'array', items: { type: 'string' }, description: '可拓展的相关主题（用于外部知识补充）' },
        actionable: { type: 'boolean', description: '是否包含可执行待办/任务' },
        is_emotional: { type: 'boolean', description: '内容是否为生活记录、情绪倾诉、心灵感悟、人生灵感等偏感性、需要被关怀回应的内容（而非纯信息/任务/资料）' },
        response_persona: { type: 'string', description: '若 is_emotional 为真，选择最合适的回应身份：comforter(温柔的安慰者，适合情绪低落/疲惫/委屈)、mentor(睿智的师长，适合迷茫/成长/抉择时给予指引)、friend(亲密的朋友，适合分享喜悦/日常/小确幸)；否则留空' },
        response_title: { type: 'string', description: '若 is_emotional 为真，给这段回应起一个温暖的标题，如「一封来自安慰者的信」「师长的几句话」「想对你说」；否则留空' },
        emotional_response: { type: 'string', description: '若 is_emotional 为真，以所选身份的口吻，写一段 80-200 字、真诚、温暖、有人文关怀的回应——可以是安慰、共情、鼓励、或长者般的见解与指引，像一封写给朋友的短信，避免空洞说教与套话；否则留空' }
      },
      required: ['summary', 'tags', 'category']
    };

    const models = ['kimi-k2-0905-preview', 'kimi-latest', 'moonshot-v1-auto'];
    let resp = null;
    let lastErr = '';
    for (const model of models) {
      resp = await fetch('https://api.moonshot.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `你是用户的私人知识库助理，同时也是一位懂得共情的伙伴。用户发来的每一条"心签"都需要你完成：自动摘要、关键词提取、内容分类、提炼可拓展的相关主题。\n此外，请判断这条心签是否属于生活记录、情绪倾诉、心灵感悟或人生灵感等偏感性、值得被温柔回应的内容：若是，请把 is_emotional 设为 true，选择最贴切的回应身份(response_persona)，并以那个身份的口吻写一段真诚、温暖、有人文温度的回应(emotional_response)，让用户感到被理解、被陪伴、被指引；若只是资料/任务/信息类内容，则 is_emotional 为 false，相关字段留空。\n严格按 JSON schema 返回：\n${JSON.stringify(schema)}`
            },
            { role: 'user', content: `请分析以下心签内容：\n\n${materialText}` }
          ]
        })
      });
      if (resp.ok) break;
      lastErr = `${resp.status}: ${(await resp.text()).slice(0, 200)}`;
      if (resp.status !== 404 && resp.status !== 403) break;
    }

    if (!resp || !resp.ok) {
      await base44.asServiceRole.entities.Note.update(noteId, { ai_status: 'failed' });
      return Response.json({ error: `Kimi ${lastErr}` }, { status: 502 });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    let parsed = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const ai_analysis = {
      summary: parsed.summary || '',
      key_points: parsed.key_points || [],
      entities: parsed.entities || [],
      category: parsed.category || '其他',
      related_topics: parsed.related_topics || [],
      actionable: !!parsed.actionable,
      is_emotional: !!parsed.is_emotional,
      response_persona: parsed.is_emotional ? (parsed.response_persona || 'friend') : '',
      response_title: parsed.is_emotional ? (parsed.response_title || '') : '',
      emotional_response: parsed.is_emotional ? (parsed.emotional_response || '') : '',
      analyzed_at: new Date().toISOString()
    };

    // 合并 AI 标签到 note.tags（去重）
    const mergedTags = Array.from(new Set([...(note.tags || []), ...(parsed.tags || [])])).slice(0, 12);

    await base44.asServiceRole.entities.Note.update(noteId, {
      ai_analysis,
      tags: mergedTags,
      ai_status: 'completed'
    });

    // 沉淀到个人数据库
    try {
      await base44.asServiceRole.entities.UserDataPoint.create({
        data_type: 'outcome',
        subtype: 'heartsign_capture',
        summary: ai_analysis.summary || (note.plain_text || '').slice(0, 80),
        category: ai_analysis.category,
        weight: ai_analysis.actionable ? 6 : 3,
        tags: mergedTags,
        occurred_at: new Date().toISOString(),
        related_note_id: noteId,
        metadata: {
          source_type: note.source_type || 'manual',
          source_url: note.source_url || null,
          has_attachments: (note.attachments || []).length > 0
        }
      });
    } catch (e) {
      console.error('UserDataPoint create failed', e?.message);
    }

    return Response.json({ ok: true, ai_analysis, tags: mergedTags });
  } catch (e) {
    console.error('analyzeHeartSign error', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
});