import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Unified Kimi API wrapper — drop-in replacement for Core.InvokeLLM.
 *
 * Accepts:
 *   - prompt (string, required)
 *   - response_json_schema (object, optional) — if provided, forces JSON output
 *   - file_urls (array, optional) — image URLs for vision tasks
 *   - system_prompt (string, optional) — override default system prompt
 *   - model (string, optional) — default kimi-k2-turbo-preview; use 'moonshot-v1-8k-vision-preview' for images
 *   - temperature (number, optional, default 0.7)
 *
 * Returns:
 *   - Parsed JSON object (if response_json_schema provided)
 *   - Plain string wrapped as { text: "..." } otherwise
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // 允许两种调用：1) 已登录用户  2) 服务角色内部互调（无 user）
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const isServiceCall = req.headers.get('x-base44-service-role') || !user;
    if (!user && !isServiceCall) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      prompt,
      response_json_schema,
      file_urls,
      system_prompt,
      model,
      temperature = 0.7
    } = await req.json();

    if (!prompt) {
      return Response.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const apiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
      return Response.json({ error: 'KIMI_API_KEY not configured' }, { status: 500 });
    }

    // Build system prompt
    const wantsJson = !!response_json_schema;
    let systemContent = system_prompt || "你是一位专业、贴心的 AI 助手。回答需简洁、准确、有温度。";
    if (wantsJson) {
      systemContent += `\n\n请严格按以下 JSON Schema 返回结果，不要输出任何额外文字：\n${JSON.stringify(response_json_schema)}`;
    }

    // 分类 file_urls：图片走视觉模型；文档（pdf/word/excel/txt/md/csv）走 Kimi 文件抽取
    const isImage = (u = '') => /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(u);
    const rawImageUrls = Array.isArray(file_urls) ? file_urls.filter(isImage) : [];
    const docUrls = Array.isArray(file_urls) ? file_urls.filter(u => !isImage(u)) : [];

    // Kimi vision 对部分 CDN 直链支持不稳定（会报 "unsupported image url"），
    // 因此先把每张图片下载下来转成 base64 data URL，再喂给模型，确保稳定。
    const imageUrls = [];
    if (rawImageUrls.length > 0) {
      await Promise.all(rawImageUrls.map(async (u) => {
        try {
          const r = await fetch(u);
          if (!r.ok) return;
          const buf = new Uint8Array(await r.arrayBuffer());
          // base64 编码
          let bin = '';
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          const b64 = btoa(bin);
          const ct = r.headers.get('content-type') || (
            /\.png(\?|#|$)/i.test(u) ? 'image/png' :
            /\.gif(\?|#|$)/i.test(u) ? 'image/gif' :
            /\.webp(\?|#|$)/i.test(u) ? 'image/webp' : 'image/jpeg'
          );
          imageUrls.push(`data:${ct};base64,${b64}`);
        } catch (_) { /* skip this image */ }
      }));
    }
    const hasImages = imageUrls.length > 0;
    const hasDocs = docUrls.length > 0;

    // 对文档：用 Kimi 官方 /v1/files 接口上传 → 拿到已抽取的文本，再注入到 system prompt
    let extractedDocText = '';
    let docExtractStats = { total: docUrls.length, success: 0, failed: 0, details: [] };
    if (hasDocs) {
      const extractedChunks = await Promise.all(docUrls.map(async (url, idx) => {
        const tag = `doc${idx + 1}`;
        try {
          const fileResp = await fetch(url);
          if (!fileResp.ok) { docExtractStats.failed++; docExtractStats.details.push(`${tag}: download_${fileResp.status}`); return { ok: false, text: `(下载失败 HTTP ${fileResp.status}: ${url})` }; }
          const blob = await fileResp.blob();
          if (!blob || blob.size < 10) { docExtractStats.failed++; docExtractStats.details.push(`${tag}: empty_blob`); return { ok: false, text: `(下载到空文件: ${url})` }; }
          const filename = decodeURIComponent((url.split('?')[0].split('/').pop() || 'file')).slice(0, 80);
          const form = new FormData();
          form.append('file', blob, filename);
          form.append('purpose', 'file-extract');
          const upResp = await fetch('https://api.moonshot.ai/v1/files', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey.trim()}` },
            body: form,
          });
          if (!upResp.ok) { docExtractStats.failed++; const errBody = await upResp.text(); docExtractStats.details.push(`${tag}: kimi_upload_${upResp.status}`); return { ok: false, text: `(Kimi 上传失败 ${upResp.status}: ${errBody.slice(0, 200)})` }; }
          const upJson = await upResp.json();
          const fileId = upJson?.id;
          if (!fileId) { docExtractStats.failed++; docExtractStats.details.push(`${tag}: no_file_id`); return { ok: false, text: `(无 file_id)` }; }
          const contentResp = await fetch(`https://api.moonshot.ai/v1/files/${fileId}/content`, {
            headers: { Authorization: `Bearer ${apiKey.trim()}` },
          });
          if (!contentResp.ok) { docExtractStats.failed++; docExtractStats.details.push(`${tag}: extract_${contentResp.status}`); return { ok: false, text: `(抽取失败 ${contentResp.status})` }; }
          const ctype = contentResp.headers.get('content-type') || '';
          let extracted = '';
          if (ctype.includes('application/json')) {
            const j = await contentResp.json();
            extracted = String(j?.content || j?.text || JSON.stringify(j));
          } else {
            extracted = await contentResp.text();
          }
          extracted = extracted.slice(0, 20000);
          if (extracted.trim().length < 10) { docExtractStats.failed++; docExtractStats.details.push(`${tag}: extracted_empty`); return { ok: false, text: `(抽取出空内容，可能是加密或图片型 PDF: ${filename})` }; }
          docExtractStats.success++;
          docExtractStats.details.push(`${tag}: ok_${extracted.length}chars`);
          return { ok: true, text: extracted };
        } catch (e) {
          docExtractStats.failed++;
          docExtractStats.details.push(`${tag}: exception_${e?.message?.slice(0, 50) || 'unknown'}`);
          return { ok: false, text: `(异常:${e?.message || e})` };
        }
      }));
      console.log('[invokeKimi] doc extract stats:', JSON.stringify(docExtractStats));
      // 关键守门：如果【所有】文档都抽取失败，直接报错，不让 LLM 用"我无法访问"的客套话伪装成功
      const allFailed = extractedChunks.every(c => !c.ok);
      if (allFailed && docUrls.length > 0) {
        return Response.json({
          error: 'DOC_EXTRACT_FAILED',
          message: '附件无法被读取',
          details: docExtractStats.details,
          _doc_extract_failed: true,
        }, { status: 422 });
      }
      extractedDocText = extractedChunks.map((c, i) => `=== 附件 ${i + 1} ${c.ok ? '' : '(抽取失败)'} ===\n${c.text}`).join('\n\n');
      systemContent += `\n\n以下是用户上传的附件原文，请基于这些内容回答用户的问题：\n${extractedDocText}`;
    }

    // Build user message
    let userContent;
    if (hasImages) {
      userContent = [
        { type: "text", text: prompt },
        ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } }))
      ];
    } else {
      userContent = prompt;
    }

    // 选择模型：
    // - 有图片 → 视觉模型 (moonshot-v1-32k-vision-preview)
    // - 无图片 → 默认长上下文 turbo
    // 注意：moonshot vision 模型不支持 response_format=json_object（会 400）。
    // 因此当同时需要 JSON 输出 + 图片时，仍使用 vision 模型但去掉 response_format，
    // 通过 system prompt 中的 schema 约束让模型输出 JSON，再在外层 parse 兜底。
    // 视觉用 vision 模型；纯文本用文本模型，并对 404/403 自动 fallback
    const textModels = model ? [model] : ["kimi-latest", "moonshot-v1-auto", "moonshot-v1-8k"];
    const candidateModels = hasImages
      ? [model || "moonshot-v1-32k-vision-preview"]
      : textModels;

    let response = null;
    let lastErrText = '';
    let lastStatus = 0;
    for (const m of candidateModels) {
      const body = {
        model: m,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent }
        ],
        temperature
      };
      if (wantsJson && !hasImages) {
        body.response_format = { type: "json_object" };
      }
      response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify(body)
      });
      if (response.ok) break;
      lastErrText = await response.text();
      lastStatus = response.status;
      // 模型不可用/无权限/过载/临时故障都继续 fallback
      if (![404, 403, 401, 429, 500, 502, 503].includes(response.status)) break;
    }

    if (!response || !response.ok) {
      return Response.json(
        { error: `Kimi API error ${lastStatus}: ${lastErrText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // If JSON was requested, parse and return the object directly
    if (wantsJson) {
      try {
        return Response.json(JSON.parse(content));
      } catch {
        // Attempt to extract JSON from markdown code block
        const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          try {
            return Response.json(JSON.parse(match[1]));
          } catch {}
        }
        return Response.json({ _raw: content, _parse_error: true });
      }
    }

    // Plain text response
    return Response.json({ text: content });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});