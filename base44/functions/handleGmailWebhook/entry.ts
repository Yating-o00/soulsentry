import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Helper: base64url decode
function base64UrlDecode(str) {
  if (!str) return '';
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bytes = Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

// Extract plain text body from Gmail payload (recursive)
function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }
  if (payload.parts && payload.parts.length) {
    for (const p of payload.parts) {
      const text = extractBody(p);
      if (text) return text;
    }
  }
  if (payload.body?.data) return base64UrlDecode(payload.body.data);
  return '';
}

function getHeader(headers, name) {
  if (!headers) return '';
  const h = headers.find(x => x.name?.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

// Call Kimi AI to analyze email content
async function analyzeEmailWithAI(subject, from, body) {
  const apiKey = Deno.env.get('KIMI_API_KEY') || Deno.env.get('MOONSHOT_API_KEY');
  if (!apiKey) return null;

  const prompt = `你是一个智能邮件助手。请分析以下邮件，判断是否包含会议邀约、待办任务或需要用户跟进的事项。

邮件主题: ${subject}
发件人: ${from}
邮件正文(截取前3000字):
${(body || '').slice(0, 3000)}

请严格按以下JSON格式返回(不要markdown):
{
  "is_actionable": boolean,  // 是否包含待办/会议/需跟进事项
  "type": "meeting" | "task" | "followup" | "info" | "none",
  "title": "简短标题(15字内)",
  "summary": "一句话摘要(50字内)",
  "suggested_datetime": "ISO 8601 时间或 null",
  "key_points": ["要点1", "要点2"],
  "suggested_task": {
    "title": "约定标题",
    "description": "约定描述",
    "category": "work|personal|health|study|family|shopping|finance|other",
    "priority": "low|medium|high|urgent"
  }
}

若邮件为广告、订阅推送、无需行动的通知，is_actionable 设为 false。`;

  try {
    const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'system', content: '你只返回严格JSON，不要解释。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) {
      console.error('Kimi API error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('AI analyze failed:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    const messageIds = body?.data?.new_message_ids ?? [];
    if (!messageIds.length) {
      return Response.json({ ok: true, message: 'No new messages' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const results = [];

    for (const messageId of messageIds) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
          { headers: authHeader }
        );
        if (!msgRes.ok) {
          console.warn(`Fetch message ${messageId} failed:`, msgRes.status);
          continue;
        }
        const message = await msgRes.json();

        const headers = message.payload?.headers || [];
        const subject = getHeader(headers, 'Subject') || '(无主题)';
        const from = getHeader(headers, 'From') || '(未知发件人)';
        const bodyText = extractBody(message.payload);

        // Skip if clearly promotional
        const labels = message.labelIds || [];
        if (labels.includes('CATEGORY_PROMOTIONS') || labels.includes('SPAM')) {
          continue;
        }

        const analysis = await analyzeEmailWithAI(subject, from, bodyText);
        if (!analysis || !analysis.is_actionable) continue;

        // Create a Note with the summary + suggested task as structured JSON
        const noteContent = `📧 **${analysis.title || subject}**

📮 来自: ${from}
🗓️ 类型: ${analysis.type || 'task'}
${analysis.suggested_datetime ? `⏰ 建议时间: ${analysis.suggested_datetime}\n` : ''}
💡 ${analysis.summary || ''}

**关键要点:**
${(analysis.key_points || []).map(p => `- ${p}`).join('\n')}

---
📬 邮件ID: ${messageId}`;

        const note = await base44.asServiceRole.entities.Note.create({
          content: noteContent,
          plain_text: `${subject} | ${analysis.summary || ''}`,
          tags: ['邮件提醒', analysis.type || 'task'],
          color: analysis.type === 'meeting' ? 'blue' : 'yellow',
          is_pinned: analysis.type === 'meeting',
          ai_analysis: {
            summary: analysis.summary,
            key_points: analysis.key_points || [],
            entities: [
              { text: from, type: 'sender' },
              { text: subject, type: 'subject' }
            ]
          }
        });

        // Create a Notification asking the user to confirm task sync
        if (analysis.suggested_task) {
          await base44.asServiceRole.entities.Notification.create({
            recipient_id: body?.data?.recipient_id || 'me',
            type: 'reminder',
            title: `📧 邮件待办: ${analysis.suggested_task.title}`,
            content: `来自 ${from} 的邮件包含待办事项。是否同步到约定列表？`,
            link: `/Notes?note_id=${note.id}`,
            related_entity_id: note.id,
          });
        }

        results.push({ messageId, noteId: note.id, type: analysis.type });
      } catch (err) {
        console.error(`Process message ${messageId} failed:`, err);
      }
    }

    return Response.json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});