import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 整理笔记 / 会议纪要专用渲染器
 *
 * 输入：
 *  - user_text   : string 用户原始指令
 *  - file_block  : string 已抽取的附件纯文本（executeAutomation.buildAttachmentContext 拼好的）
 *
 * 关键设计：
 *  - 不再接收 file_urls。file_block 已经是经过 InvokeLLM 抽取的真实文本，
 *    Kimi 是文本模型，硬塞 file_urls 反而会被当 image_url 处理，文档（Word/PDF）读不出来。
 *  - Prompt 把原文置于最顶部，并以"唯一事实来源"约束，禁止套用任何示例。
 */

async function callKimi(base44, prompt, response_json_schema, system_prompt) {
  const res = await base44.functions.invoke('invokeKimi', {
    prompt,
    response_json_schema,
    system_prompt,
    temperature: 0.2,
  });
  return res.data;
}

function highlightKeyData(text = '') {
  return String(text)
    .replace(/(\d+(?:[,.]\d+)?\s*(?:nm|mm|cm|m|kg|g|ml|nit|PPI|cc|度|℃|%|亿|万|千|台|个|次|月|年|人|元|美元|RMB|USD))/g, '<mark class="kd">$1</mark>')
    .replace(/(\d{4}年\d{1,2}月\d{1,2}日|20\d{2}[上下]半年|20\d{2}年|\d{1,2}:\d{2})/g, '<mark class="kd">$1</mark>');
}

function renderMinutesHtml(d, accent = '#2563eb') {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hl = (s) => highlightKeyData(esc(s));
  const meta = d.meta || {};
  const sections = Array.isArray(d.sections) ? d.sections : [];
  const timeline = Array.isArray(d.timeline) ? d.timeline : [];
  const insights = d.insights || {};
  const cnNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

  const chip = (arr, cls) => (arr && arr.length)
    ? arr.map(x => `<span class="chip ${cls}">${esc(x)}</span>`).join('')
    : '<span class="muted">未识别</span>';

  const renderSection = (sec, idx) => {
    const num = cnNums[idx] || (idx + 1);
    const itemsHtml = (sec.items || []).map((it, j) => {
      if (it.type === 'sub') {
        const pts = (it.points || []).map(p => `<li>${hl(p)}</li>`).join('');
        return `<div class="sub-title">${idx + 1}.${j + 1} ${esc(it.title || '')}</div>${pts ? `<ul>${pts}</ul>` : ''}`;
      }
      if (it.type === 'qa') {
        const ans = (Array.isArray(it.answer) ? it.answer : [it.answer]).filter(Boolean)
          .map(a => `<p>${hl(a)}</p>`).join('');
        return `<div class="qa"><div class="q">Q：${esc(it.question || '')}</div><div class="a">${ans}</div></div>`;
      }
      if (it.type === 'callout') {
        return `<blockquote class="callout">${hl(it.text || '')}</blockquote>`;
      }
      return `<ul><li>${hl(it.text || '')}</li></ul>`;
    }).join('');
    return `<section class="sec"><h2>${num}、${esc(sec.title || '')}</h2>${itemsHtml}</section>`;
  };

  const tlHtml = timeline.length
    ? `<section class="sec"><h2>${cnNums[sections.length] || (sections.length + 1)}、时间线与里程碑</h2><div class="tl">${timeline.map(t => `<div class="tl-item"><span class="tl-date">${esc(t.date || '')}</span><span class="tl-body">${hl(t.content || '')}</span></div>`).join('')}</div></section>`
    : '';

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"/><title>${esc(d.title || '会议纪要')}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:#f8fafc;color:#1e293b;line-height:1.75;-webkit-font-smoothing:antialiased}
.wrap{max-width:880px;margin:0 auto;padding:40px 48px;background:#fff;min-height:100vh;box-shadow:0 0 40px -10px rgba(15,23,42,.06)}
h1.doc{text-align:center;font-size:26px;font-weight:800;padding-bottom:14px;margin-bottom:20px;border-bottom:2px solid #1e293b;letter-spacing:-.01em}
.meta-table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px}
.meta-table td{border:1px solid #cbd5e1;padding:8px 12px;vertical-align:top}
.meta-table td:first-child{width:96px;background:#f1f5f9;font-weight:700;color:#475569;text-align:center}
.sec{margin:24px 0}
.sec>h2{font-size:18px;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;color:#0f172a}
.sub-title{font-weight:700;margin:14px 0 6px;color:#334155;font-size:15px}
.sec ul{margin:6px 0 10px 26px}
.sec li{margin:4px 0;color:#334155}
.qa{margin:14px 0;padding:12px 16px;background:#f8fafc;border-radius:8px;border-left:3px solid ${accent}}
.qa .q{font-weight:700;color:${accent};margin-bottom:6px}
.qa .a{padding-left:8px;color:#475569}
.qa .a p{margin:4px 0}
.callout{margin:12px 0;padding:12px 16px;background:#fef9c3;border-left:4px solid #eab308;color:#78350f;font-style:italic;border-radius:0 8px 8px 0}
.tl{margin:8px 0 0 8px;border-left:2px solid #cbd5e1;padding-left:16px}
.tl-item{margin:10px 0;position:relative}
.tl-item::before{content:'';position:absolute;left:-22px;top:10px;width:10px;height:10px;border-radius:50%;background:${accent}}
.tl-date{display:inline-block;font-weight:700;color:${accent};margin-right:8px}
mark.kd{background:linear-gradient(180deg,transparent 60%,#fef08a 60%);padding:0 2px;font-weight:600;color:#0f172a}
.insights{margin-top:28px;padding:16px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;font-size:13px}
.insights h3{font-size:13px;font-weight:700;color:#475569;margin-bottom:10px}
.insights .row{margin:8px 0;display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
.insights .row .label{width:70px;color:#94a3b8;flex-shrink:0;padding-top:4px}
.insights .row .vals{flex:1;display:flex;gap:6px;flex-wrap:wrap}
.chip{display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe}
.chip.people{background:#fef3c7;color:#92400e;border-color:#fde68a}
.chip.tech{background:#dcfce7;color:#166534;border-color:#bbf7d0}
.chip.time{background:#fce7f3;color:#9d174d;border-color:#fbcfe8}
.chip.action{background:#ffedd5;color:#9a3412;border-color:#fed7aa}
.muted{color:#94a3b8;font-size:12px}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:12px;letter-spacing:.05em}
@media print{@page{size:A4 portrait;margin:14mm 12mm}body{background:#fff}.wrap{box-shadow:none;padding:0;max-width:none}.sec,.qa,.callout,.tl-item{page-break-inside:avoid;break-inside:avoid}}
</style></head><body><div class="wrap">
<h1 class="doc">${esc(d.title || '会议纪要')}</h1>
<table class="meta-table">
<tr><td>时间</td><td>${esc(meta.time || '未识别')}</td></tr>
<tr><td>地点</td><td>${esc(meta.location || '未识别')}</td></tr>
<tr><td>参会人</td><td>${(meta.attendees && meta.attendees.length) ? meta.attendees.map(esc).join('、') : '未识别'}</td></tr>
</table>
${sections.map(renderSection).join('')}
${tlHtml}
<div class="insights"><h3>🔍 AI 识别洞察</h3>
<div class="row"><div class="label">参会人员</div><div class="vals">${chip(insights.people, 'people')}</div></div>
<div class="row"><div class="label">关键术语</div><div class="vals">${chip(insights.tech, 'tech')}</div></div>
<div class="row"><div class="label">时间节点</div><div class="vals">${chip(insights.time, 'time')}</div></div>
<div class="row"><div class="label">行动项</div><div class="vals">${chip(insights.actions, 'action')}</div></div>
</div>
<div class="footer">由心栈 SoulSentry · AI 笔记整理器 自动生成 · ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</div>
</div></body></html>`;
}

async function uploadHtml(base44, baseName, html) {
  const bytes = new TextEncoder().encode(html);
  const fileName = `${baseName}.html`;
  const file = new File([new Blob([bytes], { type: 'text/html; charset=utf-8' })], fileName, { type: 'text/html; charset=utf-8' });
  const resp = await base44.integrations.Core.UploadFile({ file });
  return { file_url: resp?.file_url || resp?.data?.file_url, file_name: fileName };
}

const MINUTES_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "会议/笔记标题，必须取自原文标题或忠实概括原文议题" },
    meta: {
      type: "object",
      properties: {
        time: { type: "string", description: "时间，原文写什么保留什么；原文没有就留空字符串" },
        location: { type: "string", description: "地点；原文没有就留空字符串" },
        attendees: { type: "array", items: { type: "string" }, description: "参会人，每项是一个人名；原文没有就给空数组" }
      }
    },
    sections: {
      type: "array",
      description: "正文章节，按原文实际出现的小节切分；items 混合 sub/qa/point/callout",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["sub", "qa", "point", "callout"] },
                title: { type: "string" },
                points: { type: "array", items: { type: "string" } },
                question: { type: "string" },
                answer: { type: "array", items: { type: "string" } },
                text: { type: "string" }
              },
              required: ["type"]
            }
          }
        },
        required: ["title", "items"]
      }
    },
    timeline: {
      type: "array",
      description: "时间线节点；只填原文中真实出现的，内容必须取自原文",
      items: { type: "object", properties: { date: { type: "string" }, content: { type: "string" } }, required: ["date", "content"] }
    },
    insights: {
      type: "object",
      properties: {
        people: { type: "array", items: { type: "string" } },
        tech: { type: "array", items: { type: "string" } },
        time: { type: "array", items: { type: "string" } },
        actions: { type: "array", items: { type: "string" } }
      }
    },
    tags: { type: "array", items: { type: "string" } }
  },
  required: ["title", "sections"]
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { user_text = '', file_block = '' } = await req.json();

    // 必须有真实素材
    const sourceText = String(file_block || '').trim();
    const inlineText = String(user_text || '').trim();
    const hasFileBlock = sourceText.length > 50;
    const hasInlineContent = inlineText.length > 10;
    if (!hasFileBlock && !hasInlineContent) {
      return Response.json({
        error: 'NO_SOURCE_CONTENT',
        message: '没有读到任何附件或原文内容，无法整理会议纪要。请上传会议记录文件，或在指令中粘贴完整原文后重试。',
      }, { status: 400 });
    }

    // 防止把"完全读取失败"骨架当真原文（注意：图片视觉描述也是合法素材，不能误杀）
    if (hasFileBlock && /\(读取失败|视觉识别失败|附件「.*」无法解析/.test(sourceText) && sourceText.length < 200 && !hasInlineContent) {
      return Response.json({
        error: 'ATTACHMENT_UNREADABLE',
        message: '附件无法被读取（可能是加密 PDF 或不支持的格式）。请尝试导出为 .docx 或 .txt 后重试。',
      }, { status: 400 });
    }

    // 截断保护（kimi-k2-turbo-preview 长上下文足够）
    const MAX = 20000;
    const truncated = sourceText.length > MAX ? sourceText.slice(0, MAX) + '\n\n…（原文过长，已截断）' : sourceText;

    // 检测是否包含图片 OCR 段——若有，提示 Kimi 把 OCR 文字当作原文整理
    const hasImageOcr = /【图片附件:|【第一部分：文字 OCR】|内容描述:/.test(sourceText);
    const ocrHint = hasImageOcr
      ? `\n\n⚠️ 注意：上方原文中包含【图片附件】段——里面的「第一部分：文字 OCR」是从图片中识别出来的对话/文字内容，是真实的原文素材，请把它当作访谈/会议的实际记录来整理（说话人、对话、问答都在里面）。第二部分"外观描述"仅作辅助参考，不要单独作为纪要正文。`
      : '';

    const data = await callKimi(
      base44,
      `=== 待整理的会议/访谈原文（这是你唯一的事实来源）===
${truncated || '（用户未提供附件，仅给出指令）'}
=== 原文结束 ===${ocrHint}

用户的整理指令：${inlineText || '（无）'}

【绝对铁律】
0) 严禁编造：人名、公司名、时间、地点、数据、技术术语、时间线节点，原文里没有就绝对不能写。
1) 禁止套用任何示例模版（例如"2023年H2产品规划评审""张晨/李思/王骁""GMV 42.3亿""履约时效29.6小时"等都属示例，除非原文里真出现这些字，否则一律不许写）。
2) meta.time/location/attendees 仅在原文里能找到时才填；否则留空字符串/空数组。attendees 必须是数组，每项一个人。**如果原文是访谈/对话记录，attendees 填出现的说话人/角色名**。
3) sections 按原文里实际出现的主题、话题、问答切分。【必须】至少产出 1 个 section，绝对不允许返回空数组；如果原文是访谈对话，按话题/问答自然切分成 2~6 节，每节包含若干 type:"qa" 或 type:"point" items；不要因为原文是"截图 OCR"就放弃整理。
4) 子小节用 type:"sub"；"Q：xxx"紧跟回答时合并成 type:"qa"；长段判断性结论（含"导致/因此/结论/瓶颈"）→ type:"callout"；其他普通要点 → type:"point"。
5) timeline 只填原文真实出现的时间节点，content 必须取自原文；没有就给空数组。
6) insights 四类（people/tech/time/actions）每项必须能在原文找到对应出处，无内容给空数组。
7) title 直接用原文里的标题或忠实概括原文议题（不要写"未识别"或"会议纪要"这种泛标题，要具体概括内容主题）。`,
      MINUTES_SCHEMA,
      "你是专业会议纪要/访谈记录整理官。严格忠于上方提供的【会议原文】，绝不编造、绝不套用任何示例模版。原文里没有的内容，对应字段就留空。但只要原文里有任何对话、要点、话题，必须组织成至少 1 个 section 输出，不允许返回空 sections。"
    );

    if (data?._parse_error) {
      return Response.json({ error: 'AI_PARSE_FAILED', message: 'AI 输出无法解析为结构化纪要，请重试或精简附件后重试。', raw: data?._raw }, { status: 500 });
    }

    const html = renderMinutesHtml(data);
    const safeTitle = String(data.title || user_text || '会议纪要').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const baseName = `${new Date().toISOString().slice(0, 10)}_${safeTitle}_纪要`;
    const { file_url, file_name } = await uploadHtml(base44, baseName, html);

    // 心签索引
    const plainPreview = (data.sections || []).map((s, i) => `${i + 1}. ${s.title}`).join('\n');
    const note = await base44.entities.Note.create({
      content: `<h2>${data.title}</h2><div><a href="${file_url}" target="_blank">📄 打开完整纪要：${file_name}</a></div><div>${plainPreview.replace(/\n/g, '<br/>')}</div>`,
      plain_text: `${data.title}\n\n${plainPreview}`,
      tags: ['会议纪要', ...(data.tags || [])],
      color: "blue"
    });

    return Response.json({
      title: data.title,
      meta: data.meta || {},
      sections: data.sections || [],
      timeline: data.timeline || [],
      insights: data.insights || {},
      tags: data.tags || [],
      file_url,
      file_name,
      plain_preview: plainPreview,
      note_id: note.id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});