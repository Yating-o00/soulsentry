import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// RFC 2047 encode non-ASCII subject
function encodeSubject(subject) {
  // If pure ASCII, return as-is
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(subject)));
  return `=?UTF-8?B?${b64}?=`;
}

// Build a simple MIME message (supports plain text + optional HTML)
function buildMime({ to, from, subject, body, isHtml, cc, bcc }) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
  ];
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  headers.push(`Subject: ${encodeSubject(subject || '')}`);
  headers.push('MIME-Version: 1.0');

  if (isHtml) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const plainFallback = body.replace(/<[^>]+>/g, '');
    const mime = [
      headers.join('\r\n'),
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(plainFallback))),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(body))),
      `--${boundary}--`,
      ''
    ].join('\r\n');
    return mime;
  }

  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: base64');
  const mime = [
    headers.join('\r\n'),
    '',
    btoa(unescape(encodeURIComponent(body || '')))
  ].join('\r\n');
  return mime;
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, body, isHtml = false, cc, bcc, scheduledAt } = await req.json();

    if (!to || !subject || !body) {
      return Response.json({ error: 'Missing fields: to, subject, body required' }, { status: 400 });
    }

    // If scheduledAt is in the future, return without sending (a scheduled
    // automation or task scheduler should call this function again at that time).
    if (scheduledAt) {
      const scheduled = new Date(scheduledAt);
      if (!isNaN(scheduled.getTime()) && scheduled.getTime() > Date.now() + 60 * 1000) {
        return Response.json({
          ok: true,
          scheduled: true,
          sendAt: scheduled.toISOString(),
          message: '已加入定时发送队列'
        });
      }
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');

    const fromAddr = user.email;
    const mime = buildMime({ to, from: fromAddr, subject, body, isHtml, cc, bcc });
    const raw = toBase64Url(mime);

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gmail send failed:', res.status, errText);
      return Response.json({ error: 'Gmail send failed', detail: errText }, { status: 500 });
    }

    const result = await res.json();
    return Response.json({ ok: true, messageId: result.id, threadId: result.threadId });
  } catch (error) {
    console.error('sendGmailEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});