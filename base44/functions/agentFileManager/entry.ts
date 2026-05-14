import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Agent File Manager — simple file upload/list/download tool for the agent.
 *
 * Operations (op):
 *   - "upload":   Upload a file from a base64 string or remote URL.
 *                 Input: { op:"upload", file_name, content_base64?, source_url?, mime_type? }
 *                 Returns: { file_url, file_name }
 *   - "list":     List all files the current user has uploaded (via Task.attachments).
 *                 Input: { op:"list", limit? }
 *                 Returns: { files: [{file_name, file_url, file_size, uploaded_at, task_id}] }
 *   - "download": Return the public URL for an already-uploaded file (just echo / verify).
 *                 Input: { op:"download", file_url }
 *                 Returns: { file_url }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const op = body?.op;

    if (op === 'upload') {
      const { file_name, content_base64, source_url, mime_type } = body;
      if (!file_name) {
        return Response.json({ error: 'Missing file_name' }, { status: 400 });
      }
      if (!content_base64 && !source_url) {
        return Response.json({ error: 'Provide content_base64 or source_url' }, { status: 400 });
      }

      // Resolve raw bytes
      let bytes;
      let resolvedMime = mime_type || 'application/octet-stream';

      if (source_url) {
        const r = await fetch(source_url);
        if (!r.ok) {
          return Response.json({ error: `Failed to fetch source_url: ${r.status}` }, { status: 502 });
        }
        bytes = new Uint8Array(await r.arrayBuffer());
        if (!mime_type) {
          const ct = r.headers.get('content-type');
          if (ct) resolvedMime = ct.split(';')[0].trim();
        }
      } else {
        // base64 → bytes
        const clean = content_base64.replace(/^data:[^;]+;base64,/, '');
        const binStr = atob(clean);
        bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      }

      // Upload via Base44 integration
      const blob = new Blob([bytes], { type: resolvedMime });
      const file = new File([blob], file_name, { type: resolvedMime });
      const uploadResp = await base44.integrations.Core.UploadFile({ file });
      const file_url = uploadResp?.file_url || uploadResp?.data?.file_url;
      if (!file_url) {
        return Response.json({ error: 'Upload failed', detail: uploadResp }, { status: 500 });
      }

      return Response.json({
        success: true,
        file_url,
        file_name,
        size: bytes.length,
        mime_type: resolvedMime
      });
    }

    if (op === 'list') {
      const limit = Math.min(Math.max(parseInt(body?.limit) || 30, 1), 100);
      // Pull recent tasks for the user and flatten attachments
      const tasks = await base44.entities.Task.list('-updated_date', 100);
      const files = [];
      for (const t of tasks) {
        if (Array.isArray(t.attachments)) {
          for (const a of t.attachments) {
            if (a?.file_url) {
              files.push({
                file_name: a.file_name || a.file_url.split('/').pop(),
                file_url: a.file_url,
                file_size: a.file_size,
                file_type: a.file_type,
                uploaded_at: a.uploaded_at,
                task_id: t.id,
                task_title: t.title
              });
            }
          }
        }
        if (files.length >= limit) break;
      }
      return Response.json({ files: files.slice(0, limit), total: files.length });
    }

    if (op === 'download') {
      const { file_url } = body;
      if (!file_url) {
        return Response.json({ error: 'Missing file_url' }, { status: 400 });
      }
      // Files uploaded via Core.UploadFile are public URLs — return as-is for the agent to share.
      return Response.json({ file_url, note: 'Direct download URL. Share this link with the user.' });
    }

    return Response.json({ error: `Unknown op: ${op}. Use upload|list|download.` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});