import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const CONNECTOR_ID = '6aca1ec554d6e4702c734ca7';
const G = 'https://gmail.googleapis.com/gmail/v1/users/me';

function encodeRFC2047(s) {
  if (!s) return '';
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  return `=?UTF-8?B?${b64}?=`;
}
function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeB64url(data) {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function findText(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeB64url(part.body.data);
  for (const p of part.parts || []) { const t = findText(p); if (t) return t; }
  if (part.body?.data && !part.parts) return decodeB64url(part.body.data).replace(/<[^>]+>/g, ' ');
  return '';
}
const header = (m, name) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === name)?.value || '';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { action = 'list', messageId, to, subject, body, intent } = await req.json().catch(() => ({}));

    let accessToken;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID));
    } catch (_e) {
      return Response.json({ connected: false });
    }
    const auth = { Authorization: `Bearer ${accessToken}` };
    const gget = async (path) => {
      const r = await fetch(`${G}${path}`, { headers: auth, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`Gmail ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return r.json();
    };
    const getMsg = async (id) => {
      const m = await gget(`/messages/${id}?format=full`);
      return { id, from: header(m, 'from'), subject: header(m, 'subject'), date: header(m, 'date'), snippet: m.snippet, text: findText(m.payload).slice(0, 4000) };
    };

    if (action === 'list') {
      const [profile, list] = await Promise.all([gget('/profile'), gget('/messages?maxResults=15&labelIds=INBOX')]);
      const metas = await Promise.allSettled((list.messages || []).map((m) => gget(`/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
      const messages = metas.filter((r) => r.status === 'fulfilled').map(({ value: m }) => ({
        id: m.id, from: header(m, 'from'), subject: header(m, 'subject'), date: header(m, 'date'), snippet: m.snippet, unread: (m.labelIds || []).includes('UNREAD'),
      }));
      return Response.json({ connected: true, email: profile.emailAddress, messages });
    }

    if (action === 'profile') {
      const list = await gget('/messages?maxResults=20&labelIds=SENT');
      const sent = await Promise.allSettled((list.messages || []).slice(0, 12).map((m) => getMsg(m.id)));
      const samples = sent.filter((r) => r.status === 'fulfilled').map((r) => `主题:${r.value.subject}\n${r.value.text.slice(0, 600)}`).join('\n---\n');
      const profile = await base44.integrations.Core.InvokeLLM({
        prompt: `以下是用户最近发出的邮件。请总结用户的邮件画像：写作风格、常用语气、常用称呼与落款、主要联系领域、工作重点。用中文。\n\n${samples || '（暂无已发送邮件）'}`,
        response_json_schema: { type: 'object', properties: { style: { type: 'string' }, tone: { type: 'string' }, greeting: { type: 'string' }, signoff: { type: 'string' }, focus_areas: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } } },
      });
      await base44.auth.updateMe({ mail_profile: { ...profile, generated_at: new Date().toISOString() } });
      return Response.json({ connected: true, profile });
    }

    if (action === 'suggest') {
      const msg = await getMsg(messageId);
      const p = user.mail_profile ? JSON.stringify(user.mail_profile) : '暂无';
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `你是用户的邮件助理。结合用户邮件画像与必要的外部公开信息（如发件方公司、提到的事件），分析这封邮件并给出建议。\n用户画像:${p}\n\n发件人:${msg.from}\n主题:${msg.subject}\n正文:${msg.text}`,
        add_context_from_internet: true,
        response_json_schema: { type: 'object', properties: { summary: { type: 'string' }, importance: { type: 'string', enum: ['low', 'medium', 'high'] }, suggestions: { type: 'array', items: { type: 'string' } }, external_context: { type: 'string' }, reply_needed: { type: 'boolean' } } },
      });
      return Response.json({ connected: true, message: msg, analysis: result });
    }

    if (action === 'draft') {
      const original = messageId ? await getMsg(messageId) : null;
      const p = user.mail_profile ? JSON.stringify(user.mail_profile) : '暂无，使用礼貌专业的语气';
      const draft = await base44.integrations.Core.InvokeLLM({
        prompt: `请按用户的写作习惯起草一封邮件。用户画像:${p}\n用户意图:${intent || '回复这封邮件'}\n${original ? `原邮件 发件人:${original.from} 主题:${original.subject}\n正文:${original.text}` : ''}\n收件人:${to || ''}`,
        response_json_schema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } } },
      });
      if (original) {
        const m = original.from.match(/<([^>]+)>/);
        draft.to = draft.to || (m ? m[1] : original.from);
        if (!draft.subject) draft.subject = `Re: ${original.subject}`;
      }
      return Response.json({ connected: true, draft });
    }

    if (action === 'send') {
      if (!to || !subject || !body) return Response.json({ error: '缺少收件人、主题或正文' }, { status: 400 });
      const raw = [`To: ${to}`, `Subject: ${encodeRFC2047(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', body].join('\r\n');
      const r = await fetch(`${G}/messages/send`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(raw) }), signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`发送失败 ${r.status}`);
      return Response.json({ connected: true, sent: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});