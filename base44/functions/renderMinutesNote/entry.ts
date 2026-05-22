import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 整理笔记 / 会议纪要专用渲染器
 *
 * 调用方：executeAutomation 的 summary_note 分支会在识别到「会议/纪要/笔记整理/参会人/Q：」等
 * 特征时通过 base44.functions.invoke('renderMinutesNote', ...) 调用本函数。
 *
 * 输入：
 *  - user_text   : string 用户原始指令
 *  - file_block  : string 已抽取的附件文本（buildAttachmentContext 拼好的）
 *
 * 输出：
 *  {
 *    title, meta:{time,location,attendees[]}, sections:[{title,items[]}], timeline[],
 *    insights:{people[],tech[],time[],actions[]}, tags[],
 *    file_url, file_name, html, plain_preview, note_id
 *  }
 *
 * 渲染特性（对齐用户提供的参考稿）：
 *  1) 智能头部表格（时间/地点/参会人）
 *  2) 章节"一、二、三"层级 + 子标题
 *  3) Q&A 自动配对成卡片
 *  4) 关键数据（数字+单位、日期、百分比）<mark> 黄色背景高亮
 *  5) 时间线节点
 *  6) "导致 / 因此 / 结论 / 瓶颈" 类的长段引用框（callout）
 *  7) AI 识别洞察面板：人员 / 术语 / 时间 / 行动项
 */

async function callKimi(base44, prompt, response_json_schema, system_prompt) {
  const res = await base44.functions.invoke('invokeKimi', {
    prompt,
    response_json_schema,
    system_prompt,
    temperature: 0.3,
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
    title: { type: "string", description: "会议/笔记标题，从原文/指令推断" },
    meta: {
      type: "object",
      properties: {
        time: { type: "string", description: "时间，原文写什么保留什么" },
        location: { type: "string", description: "地点" },
        attendees: { type: "array", items: { type: "string" }, description: "参会人，每项是一个人名，禁止把一长串塞进一项" }
      }
    },
    sections: {
      type: "array",
      description: "正文章节，按原文 '一、二、三...' 切分；items 混合 sub/qa/point/callout",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["sub", "qa", "point", "callout"], description: "sub=子小节(带 points)；qa=问答(Q+answer 段落)；point=普通要点；callout=出现 导致/因此/结论/瓶颈 等判断性长段的引用框" },
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
      description: "时间线节点（如 2023下半年/2024年/Q1 等规划节点）",
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

    const data = await callKimi(
      base44,
      `请把以下内容整理成结构化【会议纪要 / 智能笔记】。规则：
1) 严格基于原文/附件，不要编造任何未出现的信息（人名、数据、时间）；
2) meta.time/location/attendees 尽量从原文头部抽取；attendees 必须是数组，每项一个人，不要把整段塞进一项；
3) sections 按原文里的"一、二、三..."切分；子小节用 type:"sub"；遇到"Q：xxx"紧跟回答时合并成 type:"qa"；
4) 出现"导致 / 因此 / 结论 / 瓶颈"等长段判断性结论 → type:"callout"；其他普通要点 → type:"point"；
5) 时间线（如"2023下半年""2024年"等规划节点）单独抽到 timeline 数组；
6) insights 必须填齐 people/tech/time/actions 四类（即使为空数组）。

用户指令：${user_text}
${file_block ? `\n=== 待整理的原文/附件 ===\n${file_block}` : ''}`,
      MINUTES_SCHEMA,
      "你是专业会议纪要整理官。严格忠于原文、不编造、按规定 schema 输出结构化数据。"
    );

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