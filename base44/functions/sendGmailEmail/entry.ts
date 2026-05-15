import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// RFC 2047 encode non-ASCII strings (for Subject and filename)
function encodeRFC2047(s) {
  if (!s) return '';
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  return `=?UTF-8?B?${b64}?=`;
}

// Encode arbitrary bytes (Uint8Array) to base64
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Wrap a long base64 string to 76-char lines (MIME requirement)
function wrapBase64(b64) {
  return b64.match(/.{1,76}/g)?.join('\r\n') || b64;
}

async function fetchAttachment(att) {
  if (!att?.file_url) return null;
  try {
    const res = await fetch(att.file_url);
    if (!res.ok) {
      console.warn('attachment fetch failed', att.file_url, res.status);
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const name = att.file_name || att.file_url.split('/').pop() || 'attachment';
    const mime = att.mime_type
      || res.headers.get('content-type')?.split(';')[0]
      || 'application/octet-stream';
    return { name, mime, b64: bytesToBase64(buf) };
  } catch (e) {
    console.warn('attachment error', att.file_url, e.message);
    return null;
  }
}

// Build a MIME message. If attachments[] is non-empty, wraps the body
// (text or alternative text+html) inside a multipart/mixed envelope.
function buildMime({ to, from, subject, body, isHtml, cc, bcc, attachments = [] }) {
  const baseHeaders = [
    `From: ${from}`,
    `To: ${to}`,
  ];
  if (cc) baseHeaders.push(`Cc: ${cc}`);
  if (bcc) baseHeaders.push(`Bcc: ${bcc}`);
  baseHeaders.push(`Subject: ${encodeRFC2047(subject || '')}`);
  baseHeaders.push('MIME-Version: 1.0');

  const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const mixedBoundary = `----=_Mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  // Build the body part (either text-only or multipart/alternative)
  let bodyPart;
  if (isHtml) {
    const plainFallback = (body || '').replace(/<[^>]+>/g, '');
    bodyPart = [
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(plainFallback))),
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(body || ''))),
      `--${altBoundary}--`,
    ].join('\r\n');
  } else {
    bodyPart = [
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(body || ''))),
    ].join('\r\n');
  }

  if (!hasAttachments) {
    return [baseHeaders.join('\r\n'), '', bodyPart].join('\r\n');
  }

  // Wrap body + attachments in multipart/mixed
  const headers = [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  ];

  const attachmentParts = attachments.map(att => {
    const filename = encodeRFC2047(att.name);
    return [
      `--${mixedBoundary}`,
      `Content-Type: ${att.mime}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      wrapBase64(att.b64),
    ].join('\r\n');
  });

  return [
    headers.join('\r\n'),
    '',
    `--${mixedBoundary}`,
    bodyPart,
    ...attachmentParts,
    `--${mixedBoundary}--`,
    '',
  ].join('\r\n');
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, body, isHtml = false, cc, bcc, scheduledAt, attachments } = await req.json();

    if (!to || !subject || !body) {
      return Response.json({ error: 'Missing fields: to, subject, body required' }, { status: 400 });
    }

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

    // Fetch attachments in parallel (cap to 10)
    let fetched = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      const list = attachments.slice(0, 10);
      const results = await Promise.all(list.map(fetchAttachment));
      fetched = results.filter(Boolean);
    }

    const fromAddr = user.email;
    const mime = buildMime({ to, from: fromAddr, subject, body, isHtml, cc, bcc, attachments: fetched });
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
    return Response.json({
      ok: true,
      messageId: result.id,
      threadId: result.threadId,
      attachments_sent: fetched.length,
    });
  } catch (error) {
    console.error('sendGmailEmail error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});