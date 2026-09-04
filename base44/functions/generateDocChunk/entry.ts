import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// 分段文档生成器：把一份长文档拆成多次短请求接力完成，
// 每次请求只做一步（① 出大纲 ② 写一节 ③ 渲染上传），单次远低于平台 120s 硬超时。
// 关键：正文草稿存放在上传的 JSON 文件里，实体记录只保存链接与进度，
// 避免把几万字正文写进 TaskExecution 导致写入卡死（这是此前"总是执行失败"的真正原因）。

async function llm(base44, prompt, schema) {
  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: schema || undefined,
    model: 'gemini_3_flash',
  });
  if (typeof res === 'string') {
    try { return JSON.parse(res); } catch { return {}; }
  }
  return res || {};
}

async function buildContext(base44, exec) {
  const lines = [`标题：${exec.task_title || ''}`];
  if (exec.original_input) lines.push(`原始指令：${exec.original_input}`);
  if (exec.automation_plan?.description) lines.push(`要交付的产物：${exec.automation_plan.description}`);
  if (exec.task_id) {
    try {
      const t = await base44.entities.Task.get(exec.task_id);
      if (t?.description) lines.push(`约定说明：${t.description}`);
      const subs = await base44.entities.Task.filter({ parent_task_id: exec.task_id }, '-created_date', 30);
      if (subs?.length) {
        lines.push(`子约定：\n${subs.map((s) => `- ${s.title}${s.status === 'completed' ? '（已完成）' : ''}${s.description ? `：${s.description}` : ''}`).join('\n')}`);
      }
    } catch (_) { /* ignore */ }
  }
  return lines.join('\n').slice(0, 6000);
}

async function uploadText(base44, fileName, text, mime) {
  const bytes = new TextEncoder().encode(text);
  const file = new File([new Blob([bytes], { type: mime })], fileName, { type: mime });
  const up = await base44.integrations.Core.UploadFile({ file });
  return up?.file_url || up?.data?.file_url;
}

async function loadDraft(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`草稿读取失败（${r.status}）`);
  return await r.json();
}

function renderHtml(title, subtitle, sections) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = (md) => esc(md)
    .replace(/^#{2,4}\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .split(/\n{2,}/).map((p) => (/^<(h3|ul)/.test(p.trim()) ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`)).join('\n');
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>body{margin:0;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;background:#f8fafc;color:#0f172a;line-height:1.75}
.page{max-width:880px;margin:0 auto;padding:40px 24px}
.hero{background:linear-gradient(135deg,#384877,#1e293b);color:#fff;border-radius:20px;padding:36px 32px;margin-bottom:20px}
.hero h1{margin:0 0 10px;font-size:28px}.hero .sub{opacity:.85;font-size:14px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px 28px;margin-bottom:16px}
.card h2{margin:0 0 12px;font-size:19px}.card h3{font-size:15px;color:#334155;margin:16px 0 6px}
.card ul{padding-left:1.3em}.card li{margin:.25em 0}
.footer{text-align:center;color:#94a3b8;font-size:12px;padding:16px}
@media print{@page{size:A4 portrait;margin:14mm 12mm}body{background:#fff}.card{border:1px solid #e2e8f0;page-break-inside:avoid}}
</style></head><body><div class="page">
<header class="hero"><h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
<div class="sub">📅 ${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })} · 心栈 SoulSentry</div></header>
${sections.map((s, i) => `<section class="card"><h2>${String(i + 1).padStart(2, '0')} · ${esc(s.heading)}</h2><div>${body(s.body || '')}</div></section>`).join('\n')}
<div class="footer">由心栈 SoulSentry 自动生成 · 浏览器打印可另存为 PDF</div></div></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { execution_id } = await req.json();
    if (!execution_id) return Response.json({ error: 'execution_id required' }, { status: 400 });

    console.log('[chunk] start', execution_id);
    const exec = await base44.entities.TaskExecution.get(execution_id);
    console.log('[chunk] loaded exec');
    if (!exec) return Response.json({ error: 'Execution not found' }, { status: 404 });

    const state = exec.automation_result?.data || {};
    const draftUrl = state.draft_url;

    // === 步骤 ①：生成大纲，草稿存文件 ===
    if (!draftUrl) {
      const context = await buildContext(base44, exec);
      console.log(`[chunk] context ${context.length} chars, asking outline`);
      const outline = await llm(base44, `你是资深办公文档专家。请为下面这份文档规划大纲（只要标题与章节，不要正文）：\n\n${context}\n\n要求：3~6 个章节，章节名具体、贴合内容，禁止空泛。`, {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subtitle: { type: 'string' },
          sections: { type: 'array', items: { type: 'object', properties: { heading: { type: 'string' }, brief: { type: 'string' } }, required: ['heading'] } },
        },
        required: ['title', 'sections'],
      });
      const secs = (outline.sections || []).slice(0, 6).map((s) => ({ heading: String(s.heading), brief: s.brief || '', body: '' }));
      if (secs.length === 0) return Response.json({ error: 'AI 未能生成有效大纲，请重试' }, { status: 500 });

      const title = outline.title || exec.task_title || '文档';
      console.log(`[chunk] outline ok: ${(outline.sections || []).length} sections`);
      const url = await uploadText(base44, `draft_${execution_id}.json`,
        JSON.stringify({ title, subtitle: outline.subtitle || '', context, sections: secs }),
        'application/json; charset=utf-8');

      await base44.entities.TaskExecution.update(execution_id, {
        execution_status: 'executing',
        automation_result: {
          type: exec.automation_type || 'office_doc',
          preview: `正在逐节生成《${title}》…`,
          data: { title, subtitle: outline.subtitle || '', draft_url: url, headings: secs.map((s) => s.heading), filled: 0, total: secs.length },
        },
      });
      return Response.json({ done: false, stage: 'outline', total: secs.length, filled: 0 });
    }

    const draft = await loadDraft(draftUrl);
    const sections = draft.sections || [];
    const idx = sections.findIndex((s) => !String(s.body || '').trim());

    // === 步骤 ②：逐节写正文（每次一节）===
    if (idx >= 0) {
      const sec = sections[idx];
      const res = await llm(base44, `你在撰写文档《${draft.title}》的第 ${idx + 1} 节。\n\n文档背景：\n${draft.context || ''}\n\n全文章节：${sections.map((s, i) => `${i + 1}.${s.heading}`).join('  ')}\n\n本节标题：${sec.heading}\n本节要点：${sec.brief || '（自行判断）'}\n\n请写出本节可直接使用的成稿正文（Markdown：小标题、要点列表、必要时表格），600~1200 字，具体可落地，不要写其它章节的内容，不要重复标题。`, {
        type: 'object',
        properties: { body: { type: 'string' } },
        required: ['body'],
      });
      sections[idx] = { ...sec, body: res.body || '（本节生成失败，可重试）' };
      const filled = sections.filter((s) => String(s.body || '').trim()).length;
      const url = await uploadText(base44, `draft_${execution_id}.json`,
        JSON.stringify({ ...draft, sections }), 'application/json; charset=utf-8');

      await base44.entities.TaskExecution.update(execution_id, {
        execution_status: 'executing',
        automation_result: {
          type: exec.automation_type || 'office_doc',
          preview: `正在逐节生成《${draft.title}》（${filled}/${sections.length}）…`,
          data: { ...state, draft_url: url, filled, total: sections.length },
        },
      });
      return Response.json({ done: false, stage: 'section', total: sections.length, filled });
    }

    // === 步骤 ③：渲染 + 上传 + 收尾（记录里只存链接与短摘要）===
    const html = renderHtml(draft.title, draft.subtitle, sections);
    const safeTitle = String(draft.title || exec.task_title || '文档').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const fileName = `${new Date().toISOString().slice(0, 10)}_${safeTitle}.html`;
    const fileUrl = await uploadText(base44, fileName, html, 'text/html; charset=utf-8');

    const outlineText = sections.map((s, i) => `${i + 1}. ${s.heading}`).join('\n');
    await base44.entities.TaskExecution.update(execution_id, {
      execution_status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: '',
      automation_result: {
        type: exec.automation_type || 'office_doc',
        preview: `📄 已生成《${fileName}》\n📥 ${fileUrl}\n\n${String(draft.subtitle || '').slice(0, 200)}\n\n章节：\n${outlineText}`.slice(0, 1500),
        data: {
          title: draft.title,
          subtitle: String(draft.subtitle || '').slice(0, 300),
          file_name: fileName,
          file_url: fileUrl,
          output_format: 'html',
          headings: sections.map((s) => s.heading),
        },
        diff: [{ action: 'create', target: fileName, detail: `结构化文档（${sections.length} 节）已生成` }],
      },
    });

    return Response.json({ done: true, file_url: fileUrl, file_name: fileName, sections: sections.length });
  } catch (error) {
    return Response.json({ error: error?.message || '生成失败' }, { status: 500 });
  }
});