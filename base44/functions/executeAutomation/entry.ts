import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 自动执行编排器 - 心栈 SoulSentry
 *
 * 工作流：
 *   1. 接收 execution_id，加载 TaskExecution 记录
 *   2. 根据 phase 执行不同动作:
 *      - "plan"    : 调用 Kimi 生成执行方案（automation_plan），状态 → waiting_confirm
 *      - "execute" : 用户已确认，调用对应工具执行，状态 → executing → completed/failed
 *
 * 支持 automation_type:
 *   - email_draft    : 生成邮件草稿（不发送，仅写入 automation_result.data，用户在UI确认后再发送）
 *   - web_research   : 调 Kimi 联网搜索摘要（实际靠 Kimi 知识 + 用户上传内容）
 *   - summary_note   : 生成总结心签
 *   - office_doc     : 生成 Word/Excel/PPT 结构化大纲（实际生成由外部微服务接入）
 *   - file_organize  : 生成文件整理计划（实际移动由桌面伴侣 App 接入）
 *   - calendar_event : 生成日历事件（写入 Task + 触发同步）
 */

async function callKimi(base44, prompt, response_json_schema, system_prompt) {
  const res = await base44.functions.invoke('invokeKimi', {
    prompt,
    response_json_schema,
    system_prompt,
    temperature: 0.4,
  });
  return res.data;
}

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    automation_type: {
      type: "string",
      enum: ["email_draft", "file_organize", "web_research", "office_doc", "ppt_doc", "calendar_event", "summary_note", "none"]
    },
    plan: {
      type: "object",
      properties: {
        title: { type: "string", description: "简短的方案标题" },
        description: { type: "string", description: "一句话方案概述" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              detail: { type: "string" }
            }
          }
        },
        risk_warning: { type: "string", description: "可能的风险或需要注意的事项，没有则留空" },
        estimated_duration: { type: "string", description: "预计耗时，如 30秒 / 2分钟" }
      },
      required: ["title", "description", "steps"]
    },
    requires_approval: { type: "boolean", description: "高风险操作（发邮件/删文件）应为 true" }
  },
  required: ["automation_type", "plan", "requires_approval"]
};

async function generatePlan(base44, exec) {
  const userInput = exec.original_input || exec.task_title;
  const planRes = await callKimi(
    base44,
    `用户希望心栈自动帮他完成的事项：${userInput}\n\n请分析这是哪种自动执行类型，并给出清晰的执行方案。\n注意：发送邮件/删除文件等不可逆操作 requires_approval 必须为 true。`,
    PLAN_SCHEMA,
    "你是心栈 SoulSentry 的自动执行规划官，负责把用户的自然语言指令转换成结构化执行方案。要简洁、具体、可执行。"
  );

  if (planRes._parse_error || !planRes.automation_type) {
    throw new Error("AI 方案生成失败");
  }

  return planRes;
}

async function executeEmailDraft(base44, exec) {
  const schema = {
    type: "object",
    properties: {
      to: { type: "string", description: "收件人邮箱，若用户未指定则留空" },
      to_name: { type: "string", description: "收件人称呼" },
      cc: { type: "string", description: "抄送邮箱（可选）" },
      subject: { type: "string", description: "邮件主题，精炼专业" },
      body: { type: "string", description: "邮件正文，中文，含问候、正文、署名三部分" },
      tone: { type: "string", enum: ["formal", "friendly", "concise"], description: "语气：正式/友好/简洁" }
    },
    required: ["subject", "body"]
  };

  const data = await callKimi(
    base44,
    `请根据用户指令生成一封专业邮件草稿（注意：仅生成草稿，等待用户确认后才会发送）：\n${exec.original_input || exec.task_title}`,
    schema,
    "你是专业商务邮件助手。要求：1) 主题精炼，10字内最好；2) 正文结构清晰，含问候、正文、署名；3) 根据指令推断语气（正式/友好/简洁）；4) 收件人未指明则留空，由用户在确认时填写。"
  );

  const previewLines = [
    `📧 主题：${data.subject}`,
    `收件人：${data.to || '（待用户填写）'}`,
  ];
  if (data.cc) previewLines.push(`抄送：${data.cc}`);
  if (data.tone) previewLines.push(`语气：${data.tone}`);
  previewLines.push('', data.body, '', '⚠️ 此为草稿，需在弹窗中确认后才会真正发送。');

  return {
    type: "email_draft",
    preview: previewLines.join('\n'),
    data
  };
}

async function executeWebResearch(base44, exec) {
  const userText = exec.original_input || exec.task_title;

  // 1. 真实联网爬取（Kimi $web_search）
  let answer = '';
  let references = [];
  try {
    const res = await base44.functions.invoke('kimiWebBrowse', { query: userText, language: 'zh' });
    answer = res?.data?.answer || '';
    references = Array.isArray(res?.data?.references) ? res.data.references : [];
  } catch (e) {
    // 联网失败时回退到纯知识库
    answer = '';
  }

  // 2. 让 AI 基于爬取结果生成结构化深度报告
  const schema = {
    type: "object",
    properties: {
      topic: { type: "string" },
      executive_summary: { type: "string", description: "150~300字的核心结论摘要" },
      sections: {
        type: "array",
        description: "3~6 个章节，每节包含 heading 和 markdown body",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string", description: "该章节 Markdown 内容，可含子标题、列表、要点" }
          },
          required: ["heading", "body"]
        }
      },
      key_findings: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } }
    },
    required: ["topic", "executive_summary", "sections", "key_findings"]
  };

  const sourcesText = references.length > 0
    ? references.slice(0, 10).map((r, i) => `[${i + 1}] ${r.title} — ${r.url}`).join('\n')
    : '（无外部来源，请基于通用知识作答）';

  const research = await callKimi(
    base44,
    `调研主题：${userText}\n\n以下是联网搜索得到的原始资料：\n\n${answer || '（搜索未返回内容）'}\n\n参考来源：\n${sourcesText}\n\n请基于以上资料生成一份结构清晰、内容深入的调研报告。每节正文请用 Markdown 编写，必要时引用上面的来源编号。`,
    schema,
    "你是资深行业研究分析师，擅长把零散资料整合为深度调研报告。要求：客观、有数据、结构清晰。"
  );

  // 3. 组装完整 Markdown 报告
  const lines = [];
  lines.push(`# 调研报告：${research.topic || userText}`);
  lines.push('');
  lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  lines.push('');
  lines.push('## 核心摘要');
  lines.push('');
  lines.push(research.executive_summary || '');
  lines.push('');
  if (Array.isArray(research.key_findings) && research.key_findings.length > 0) {
    lines.push('## 关键发现');
    lines.push('');
    research.key_findings.forEach((k, i) => lines.push(`${i + 1}. ${k}`));
    lines.push('');
  }
  (research.sections || []).forEach(sec => {
    lines.push(`## ${sec.heading}`);
    lines.push('');
    lines.push(sec.body || '');
    lines.push('');
  });
  if (Array.isArray(research.recommendations) && research.recommendations.length > 0) {
    lines.push('## 行动建议');
    lines.push('');
    research.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push('');
  }
  if (references.length > 0) {
    lines.push('## 参考来源');
    lines.push('');
    references.slice(0, 10).forEach((r, i) => {
      lines.push(`${i + 1}. [${r.title || r.url}](${r.url})`);
    });
    lines.push('');
  }
  lines.push('---');
  lines.push('*由心栈 SoulSentry 自动生成*');

  const markdown = lines.join('\n');
  const safeTopic = (research.topic || userText).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const fileName = `${new Date().toISOString().slice(0, 10)}_${safeTopic}_调研报告.md`;
  const fileUrl = await uploadMarkdownReport(base44, fileName, markdown);

  return {
    type: "web_research",
    preview: `📄 已生成《${fileName}》\n\n📥 下载链接：${fileUrl}\n\n${research.executive_summary || ''}\n\n${markdown.slice(0, 600)}${markdown.length > 600 ? '\n…（更多内容见文件）' : ''}`,
    data: {
      topic: research.topic,
      file_name: fileName,
      file_url: fileUrl,
      executive_summary: research.executive_summary,
      key_findings: research.key_findings,
      recommendations: research.recommendations,
      sections: research.sections,
      references,
      markdown
    },
    diff: [{ action: "create", target: fileName, detail: `深度调研报告（${(research.sections || []).length}节，${references.length}条来源）已上传` }]
  };
}

// 识别"复盘/日报/周报/总结当日"等需要拉取真实数据的指令
function isRecapTask(text) {
  if (!text) return false;
  return /复盘|日报|周报|月报|总结当日|总结今天|今日总结|日终|日结|review|recap/i.test(text);
}

async function fetchTodayCompletedTasks(base44) {
  // 拉取今日已完成任务（用户范围，按 RLS 自动限定）
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  try {
    // 尝试用 filter（用户身份调用时返回当前用户的任务）
    const completed = await base44.entities.Task.filter({ status: 'completed' }, '-completed_at', 200);
    return completed.filter(t => {
      const ts = t.completed_at || t.updated_date;
      return ts && ts >= start && ts < end;
    });
  } catch (e) {
    // 回退：拉取最近任务再前端过滤
    const recent = await base44.entities.Task.list('-updated_date', 200);
    return recent.filter(t => {
      if (t.status !== 'completed') return false;
      const ts = t.completed_at || t.updated_date;
      return ts && ts >= start && ts < end;
    });
  }
}

function buildRecapMarkdown(date, tasks, aiSummary) {
  const dateStr = date.toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# ${dateStr} 日终复盘报告`);
  lines.push('');
  lines.push(`> 生成时间：${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  lines.push('');
  lines.push(`## 📊 完成项统计`);
  lines.push('');
  lines.push(`- 当日已完成任务：**${tasks.length}** 项`);

  const byCategory = {};
  const byPriority = {};
  tasks.forEach(t => {
    byCategory[t.category || 'other'] = (byCategory[t.category || 'other'] || 0) + 1;
    byPriority[t.priority || 'medium'] = (byPriority[t.priority || 'medium'] || 0) + 1;
  });
  if (Object.keys(byCategory).length) {
    lines.push(`- 按分类：${Object.entries(byCategory).map(([k, v]) => `${k}(${v})`).join(' · ')}`);
  }
  if (Object.keys(byPriority).length) {
    lines.push(`- 按优先级：${Object.entries(byPriority).map(([k, v]) => `${k}(${v})`).join(' · ')}`);
  }
  lines.push('');

  lines.push(`## ✅ 完成事项明细`);
  lines.push('');
  if (tasks.length === 0) {
    lines.push('_今日暂无已完成任务。_');
  } else {
    tasks.forEach((t, i) => {
      const time = t.completed_at ? new Date(t.completed_at).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }) : '-';
      lines.push(`${i + 1}. **${t.title}** _(${time} · ${t.category || 'personal'} · ${t.priority || 'medium'})_`);
      if (t.description) lines.push(`   - ${t.description.replace(/\n/g, ' ')}`);
    });
  }
  lines.push('');

  if (aiSummary) {
    lines.push(`## 💡 AI 复盘洞察`);
    lines.push('');
    lines.push(aiSummary);
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`*由心栈 SoulSentry 自动生成*`);
  return lines.join('\n');
}

async function uploadMarkdownReport(base44, fileName, markdown) {
  // 加 UTF-8 BOM，确保浏览器/编辑器以 UTF-8 打开 .md，避免中文乱码
  const BOM = '\uFEFF';
  const bytes = new TextEncoder().encode(BOM + markdown);
  const blob = new Blob([bytes], { type: 'text/markdown; charset=utf-8' });
  const file = new File([blob], fileName, { type: 'text/markdown; charset=utf-8' });
  const resp = await base44.integrations.Core.UploadFile({ file });
  return resp?.file_url || resp?.data?.file_url;
}

async function executeSummaryNote(base44, exec) {
  const userText = exec.original_input || exec.task_title;

  // === 分支 A：日终复盘 / 日报类——拉真实数据 + 生成 Markdown + 上传 ===
  if (isRecapTask(userText)) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    // 1. 拉取真实数据
    const tasks = await fetchTodayCompletedTasks(base44);

    // 2. 让 AI 基于真实数据写一段洞察
    const insightSchema = {
      type: "object",
      properties: {
        insight: { type: "string", description: "基于当日完成数据的 2-3 段 Markdown 洞察，包含亮点、改进建议" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["insight"]
    };
    const taskBrief = tasks.slice(0, 30).map(t => `- ${t.title} (${t.category}/${t.priority})`).join('\n') || '(今日无已完成任务)';
    const aiData = await callKimi(
      base44,
      `用户指令：${userText}\n\n今日已完成的任务清单：\n${taskBrief}\n\n请生成简洁的复盘洞察。`,
      insightSchema,
      "你是用户的私人复盘教练。基于真实数据，给出鼓励 + 改进建议。"
    );

    // 3. 渲染 Markdown
    const markdown = buildRecapMarkdown(now, tasks, aiData.insight || '');
    const fileName = `${dateStr}_复盘.md`;

    // 4. 上传文件
    const fileUrl = await uploadMarkdownReport(base44, fileName, markdown);

    // 5. 同时保存为心签，方便检索
    const note = await base44.entities.Note.create({
      content: `<h2>${dateStr} 日终复盘</h2><div>${markdown.replace(/\n/g, '<br/>')}</div>`,
      plain_text: markdown,
      tags: ['复盘', '日报', ...(aiData.tags || [])],
      color: "yellow"
    });

    return {
      type: "summary_note",
      preview: `📄 已生成《${fileName}》\n\n📊 当日完成 ${tasks.length} 项任务\n\n📥 下载链接：${fileUrl}\n\n${markdown.slice(0, 600)}${markdown.length > 600 ? '\n…(更多内容见文件)' : ''}`,
      data: {
        title: `${dateStr} 日终复盘`,
        file_name: fileName,
        file_url: fileUrl,
        completed_count: tasks.length,
        note_id: note.id,
        markdown
      },
      diff: [
        { action: "create", target: fileName, detail: `Markdown 复盘报告（${tasks.length}项已完成）已上传` },
        { action: "create", target: `心签：${dateStr} 日终复盘`, detail: "已归档到心签库" }
      ]
    };
  }

  // === 分支 B：普通总结心签（保持原有行为）===
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      content: { type: "string", description: "Markdown 格式心签内容" },
      tags: { type: "array", items: { type: "string" } }
    },
    required: ["title", "content"]
  };

  const data = await callKimi(
    base44,
    `请把以下内容整理成一篇心签（笔记）：\n${userText}`,
    schema,
    "你是用户的思维整理助手，把零散输入提炼成结构清晰、富有启发的心签。"
  );

  const note = await base44.entities.Note.create({
    content: `<h2>${data.title}</h2><div>${data.content.replace(/\n/g, '<br/>')}</div>`,
    plain_text: `${data.title}\n\n${data.content}`,
    tags: data.tags || [],
    color: "yellow"
  });

  return {
    type: "summary_note",
    preview: `${data.title}\n\n${data.content}`,
    data: { ...data, note_id: note.id },
    diff: [{ action: "create", target: `心签：${data.title}`, detail: "已创建到心签库" }]
  };
}

async function executeOfficeDoc(base44, exec) {
  const userText = exec.original_input || exec.task_title;
  const schema = {
    type: "object",
    properties: {
      doc_type: { type: "string", enum: ["word", "excel"] },
      title: { type: "string" },
      sections: {
        type: "array",
        description: "文档章节，每节含完整 Markdown 正文",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string", description: "完整 Markdown 正文，包含子标题、段落、列表、表格" }
          },
          required: ["heading", "body"]
        }
      },
      note: { type: "string", description: "对用户的额外说明" }
    },
    required: ["doc_type", "title", "sections"]
  };

  const data = await callKimi(
    base44,
    `请为以下需求生成一份完整的办公文档内容（不是大纲，而是可直接使用的成稿）：\n${userText}`,
    schema,
    "你是办公文档专家。请直接生成完整、可落地的成稿内容（每节包含具体段落、要点、必要时含表格）。"
  );

  // 组装 Markdown 成稿
  const lines = [`# ${data.title}`, '', `> 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`, ''];
  (data.sections || []).forEach(s => {
    lines.push(`## ${s.heading}`);
    lines.push('');
    lines.push(s.body || '');
    lines.push('');
  });
  if (data.note) {
    lines.push('---');
    lines.push(`📝 ${data.note}`);
  }
  const markdown = lines.join('\n');
  const safeTitle = (data.title || userText).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const fileName = `${new Date().toISOString().slice(0, 10)}_${safeTitle}.md`;
  const fileUrl = await uploadMarkdownReport(base44, fileName, markdown);

  return {
    type: "office_doc",
    preview: `📄 已生成《${fileName}》\n\n📥 下载链接：${fileUrl}\n\n${markdown.slice(0, 800)}${markdown.length > 800 ? '\n…（更多内容见文件）' : ''}`,
    data: { ...data, file_name: fileName, file_url: fileUrl, markdown },
    diff: [{ action: "create", target: fileName, detail: `${data.doc_type.toUpperCase()} 文档（${(data.sections || []).length} 节）已上传` }]
  };
}

// HTML 转义辅助
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 把 PPT 数据渲染为自包含 HTML 演示稿（用户用浏览器直接打开即可全屏播放）
function renderPptHtml(data) {
  const title = escapeHtml(data.title || '演示稿');
  const subtitle = escapeHtml(data.subtitle || '');
  const slides = Array.isArray(data.slides) ? data.slides : [];
  const theme = data.theme || 'business'; // business | minimal | tech

  const themeColors = {
    business: { bg: '#0f172a', fg: '#f8fafc', accent: '#3b82f6', muted: '#94a3b8' },
    minimal:  { bg: '#ffffff', fg: '#0f172a', accent: '#384877', muted: '#64748b' },
    tech:     { bg: '#020617', fg: '#e2e8f0', accent: '#22d3ee', muted: '#64748b' },
  }[theme] || { bg: '#ffffff', fg: '#0f172a', accent: '#384877', muted: '#64748b' };

  const slideHtml = slides.map((s, i) => {
    const heading = escapeHtml(s.heading || '');
    const bullets = Array.isArray(s.bullets) ? s.bullets : [];
    const body = escapeHtml(s.body || '');
    const isCover = i === 0 && (!bullets.length && !body);

    if (isCover) {
      return `<section class="slide cover"><h1>${heading || title}</h1>${subtitle ? `<p class="sub">${subtitle}</p>` : ''}<div class="badge">${slides.length} 页 · 心栈 SoulSentry</div></section>`;
    }
    const bulletList = bullets.length
      ? `<ul>${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
      : '';
    const bodyHtml = body ? `<p class="body">${body}</p>` : '';
    return `<section class="slide"><div class="num">${i + 1} / ${slides.length}</div><h2>${heading}</h2>${bulletList}${bodyHtml}</section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:${themeColors.bg};color:${themeColors.fg};font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased}
  .deck{height:100vh;overflow:hidden;position:relative}
  .slide{position:absolute;inset:0;padding:8vw 10vw;display:flex;flex-direction:column;justify-content:center;opacity:0;transition:opacity .4s ease;pointer-events:none}
  .slide.active{opacity:1;pointer-events:auto}
  .slide h1{font-size:clamp(36px,5.5vw,72px);font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-bottom:.4em}
  .slide h2{font-size:clamp(28px,3.6vw,48px);font-weight:700;color:${themeColors.accent};margin-bottom:.6em;line-height:1.2}
  .slide.cover{align-items:center;text-align:center}
  .slide.cover h1{background:linear-gradient(135deg,${themeColors.accent},${themeColors.fg});-webkit-background-clip:text;background-clip:text;color:transparent}
  .slide .sub{font-size:clamp(16px,1.8vw,24px);color:${themeColors.muted};margin-top:1em;max-width:60ch}
  .slide ul{list-style:none;font-size:clamp(18px,2vw,28px);line-height:1.7}
  .slide ul li{padding:.4em 0;padding-left:1.6em;position:relative}
  .slide ul li::before{content:'';position:absolute;left:0;top:.95em;width:.6em;height:.6em;background:${themeColors.accent};border-radius:50%}
  .slide .body{font-size:clamp(16px,1.6vw,22px);color:${themeColors.muted};line-height:1.7;margin-top:1em;max-width:70ch;white-space:pre-wrap}
  .num{position:absolute;top:3vh;right:3vw;font-size:14px;color:${themeColors.muted};letter-spacing:.1em}
  .badge{margin-top:2em;display:inline-block;padding:.5em 1.2em;border:1px solid ${themeColors.muted}40;border-radius:999px;font-size:13px;color:${themeColors.muted};letter-spacing:.1em}
  .nav{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:8px;background:${themeColors.fg}10;padding:8px 14px;border-radius:999px;backdrop-filter:blur(8px);z-index:10}
  .nav button{background:none;border:none;color:${themeColors.fg};cursor:pointer;font-size:16px;padding:4px 10px;border-radius:6px}
  .nav button:hover{background:${themeColors.fg}20}
  .nav .pos{font-size:13px;color:${themeColors.muted};align-self:center;min-width:56px;text-align:center}
</style>
</head>
<body>
<div class="deck" id="deck">${slideHtml}</div>
<div class="nav">
  <button onclick="go(-1)">←</button>
  <span class="pos" id="pos">1 / ${slides.length}</span>
  <button onclick="go(1)">→</button>
  <button onclick="document.documentElement.requestFullscreen()">⛶</button>
</div>
<script>
  let cur=0;const slides=document.querySelectorAll('.slide');const pos=document.getElementById('pos');
  function show(){slides.forEach((s,i)=>s.classList.toggle('active',i===cur));pos.textContent=(cur+1)+' / '+slides.length;}
  function go(d){cur=Math.max(0,Math.min(slides.length-1,cur+d));show();}
  document.addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key))go(1);if(['ArrowLeft','PageUp'].includes(e.key))go(-1);});
  show();
</script>
</body>
</html>`;
}

async function uploadHtmlFile(base44, fileName, html) {
  // HTML 已在 <meta charset="utf-8"> 里声明，但 blob/file 也带上 charset 防 server 默认 latin-1
  const bytes = new TextEncoder().encode(html);
  const blob = new Blob([bytes], { type: 'text/html; charset=utf-8' });
  const file = new File([blob], fileName, { type: 'text/html; charset=utf-8' });
  const resp = await base44.integrations.Core.UploadFile({ file });
  return resp?.file_url || resp?.data?.file_url;
}

async function executePptDoc(base44, exec) {
  const userText = exec.original_input || exec.task_title;
  const schema = {
    type: "object",
    properties: {
      title: { type: "string", description: "演示稿主标题" },
      subtitle: { type: "string", description: "副标题或一句话简介" },
      theme: { type: "string", enum: ["business", "minimal", "tech"], description: "根据题材自动选择：商业用 business，简约用 minimal，科技用 tech" },
      slides: {
        type: "array",
        description: "10~15 页幻灯片。第 1 页通常为封面（heading=标题，无 bullets）。",
        items: {
          type: "object",
          properties: {
            heading: { type: "string", description: "页标题" },
            bullets: { type: "array", items: { type: "string" }, description: "要点列表，3~6 条" },
            body: { type: "string", description: "可选的补充段落，用于结论/数据/案例页" }
          },
          required: ["heading"]
        }
      },
      note: { type: "string", description: "对用户的额外说明" }
    },
    required: ["title", "theme", "slides"]
  };

  const data = await callKimi(
    base44,
    `请为以下需求生成一份完整的演示稿（PPT）：\n${userText}\n\n要求：1) 根据题材自动选择合适的主题风格(theme)；2) 至少 8 页，包含封面、目录/概览、3~5 个核心论点页、案例/数据页、结论页；3) 每页 bullets 控制在 3~6 条，简洁有力；4) 一定要直接产出可演示的成稿内容，而不是大纲提示。`,
    schema,
    "你是顶级演示稿设计师。基于用户输入直接产出完整、有逻辑、可直接演示的幻灯片内容。"
  );

  // 渲染自包含 HTML 演示稿
  const html = renderPptHtml(data);
  const safeTitle = (data.title || userText).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const fileName = `${new Date().toISOString().slice(0, 10)}_${safeTitle}.html`;
  const fileUrl = await uploadHtmlFile(base44, fileName, html);

  // 同步生成可读 preview（前端卡片显示用）
  const previewLines = [`🎯 《${data.title}》 · 主题：${data.theme}`, ''];
  if (data.subtitle) previewLines.push(data.subtitle, '');
  previewLines.push(`📥 下载链接：${fileUrl}`, '', '📑 幻灯片大纲：');
  (data.slides || []).forEach((s, i) => {
    previewLines.push(`${i + 1}. ${s.heading}`);
    (s.bullets || []).slice(0, 3).forEach(b => previewLines.push(`   • ${b}`));
  });
  if (data.note) previewLines.push('', `📝 ${data.note}`);

  return {
    type: "ppt_doc",
    preview: previewLines.join('\n'),
    data: { ...data, file_name: fileName, file_url: fileUrl },
    diff: [{ action: "create", target: fileName, detail: `${(data.slides || []).length} 页演示稿（${data.theme} 主题）已生成，可在浏览器直接全屏播放` }]
  };
}

// 列出用户所有 Task.attachments 中的文件
async function listUserFiles(base44) {
  const tasks = await base44.entities.Task.list('-updated_date', 200);
  const files = [];
  for (const t of tasks) {
    if (Array.isArray(t.attachments)) {
      t.attachments.forEach((a, idx) => {
        if (a?.file_url) {
          files.push({
            task_id: t.id,
            task_title: t.title,
            attachment_index: idx,
            file_name: a.file_name || a.file_url.split('/').pop(),
            file_url: a.file_url,
            file_size: a.file_size,
            file_type: a.file_type,
            uploaded_at: a.uploaded_at,
          });
        }
      });
    }
  }
  return { tasks, files };
}

// 真正执行文件整理：扫描用户附件、AI 匹配 → 重命名/归档元数据落库
async function executeFileOrganize(base44, exec) {
  const userText = exec.original_input || exec.task_title;

  // 1. 拉取用户真实文件列表
  const { tasks, files } = await listUserFiles(base44);

  if (files.length === 0) {
    return {
      type: "file_organize",
      preview: `⚠️ 未在你的任务附件中找到任何文件。\n\n请先把需要整理的文件上传到任意一个任务的附件，再让我执行此操作。\n\n你的指令：${userText}`,
      data: { strategy: "无文件可整理", operations: [], executed: [], failed: [] },
      diff: []
    };
  }

  // 2. 让 AI 基于真实文件清单输出具体的「重命名 + 归档」操作
  const fileBrief = files.slice(0, 50).map((f, i) =>
    `${i}. ${f.file_name} (${f.file_type || '?'}, ${f.file_size || '?'}B, 来自任务「${f.task_title}」)`
  ).join('\n');

  const schema = {
    type: "object",
    properties: {
      strategy: { type: "string", description: "整理策略说明" },
      operations: {
        type: "array",
        description: "针对每个匹配文件的具体操作",
        items: {
          type: "object",
          properties: {
            file_index: { type: "number", description: "对应文件清单中的序号" },
            new_name: { type: "string", description: "重命名后的文件名（含扩展名）" },
            folder: { type: "string", description: "归档目标文件夹路径，如 客户沟通/2026" },
            reason: { type: "string", description: "选择此文件并这样命名/归档的原因" }
          },
          required: ["file_index", "new_name", "folder"]
        }
      },
      skipped_reason: { type: "string", description: "若没有匹配到文件，说明原因" }
    },
    required: ["strategy", "operations"]
  };

  const data = await callKimi(
    base44,
    `用户的文件整理指令：\n${userText}\n\n用户当前已上传的文件清单：\n${fileBrief}\n\n请筛选出与指令匹配的文件，并为每个文件给出新名称和归档目标文件夹。\n注意：必须保留原扩展名。如果指令中明确给出了新名称，必须严格使用。如果清单里没有任何文件匹配指令，operations 返回空数组，并在 skipped_reason 中说明。`,
    schema,
    "你是文件整理执行官。基于真实的文件清单，输出可直接执行的重命名与归档操作。"
  );

  // 3. 真实落地：更新每个 attachment 的 file_name 和 folder 元数据
  const operations = Array.isArray(data.operations) ? data.operations : [];
  const executed = [];
  const failed = [];

  const updatesByTask = {};
  for (const op of operations) {
    const f = files[op.file_index];
    if (!f) {
      failed.push({ op, reason: `文件索引 ${op.file_index} 越界` });
      continue;
    }
    if (!updatesByTask[f.task_id]) updatesByTask[f.task_id] = [];
    updatesByTask[f.task_id].push({ file: f, op });
  }

  for (const [taskId, items] of Object.entries(updatesByTask)) {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) continue;
      const newAttachments = (task.attachments || []).map((a, idx) => {
        const hit = items.find(it => it.file.attachment_index === idx);
        if (!hit) return a;
        return {
          ...a,
          file_name: hit.op.new_name,
          folder: hit.op.folder,
          organized_at: new Date().toISOString(),
          organize_note: hit.op.reason || ''
        };
      });
      const folderTags = items.map(it => `📁${it.op.folder}`);
      const existingTags = Array.isArray(task.tags) ? task.tags : [];
      const mergedTags = Array.from(new Set([...existingTags, ...folderTags]));

      await base44.entities.Task.update(taskId, {
        attachments: newAttachments,
        tags: mergedTags
      });

      items.forEach(it => executed.push({
        original_name: it.file.file_name,
        new_name: it.op.new_name,
        folder: it.op.folder,
        file_url: it.file.file_url,
        task_title: it.file.task_title,
        reason: it.op.reason || ''
      }));
    } catch (e) {
      items.forEach(it => failed.push({ op: it.op, reason: e.message }));
    }
  }

  // 4. 生成可读 preview + diff
  const previewLines2 = [`📋 整理策略：${data.strategy}`, ''];
  if (executed.length > 0) {
    previewLines2.push(`✅ 已执行 ${executed.length} 项：`);
    executed.forEach((e, i) => {
      previewLines2.push(`  ${i + 1}. 「${e.original_name}」→ 「${e.new_name}」（归档至 📁${e.folder}）`);
    });
  }
  if (failed.length > 0) {
    previewLines2.push('', `⚠️ 跳过 ${failed.length} 项：`);
    failed.forEach(f => previewLines2.push(`  • ${f.reason}`));
  }
  if (executed.length === 0 && failed.length === 0) {
    previewLines2.push('（AI 未匹配到任何需要整理的文件）');
    if (data.skipped_reason) previewLines2.push(`原因：${data.skipped_reason}`);
    previewLines2.push('', `已扫描 ${files.length} 个文件。若希望我整理其他文件，请先把目标文件添加到任意任务的附件，再重试。`);
  }
  if (executed.length > 0) {
    previewLines2.push('', '📥 文件下载链接（重命名只改元数据，URL 保持不变）：');
    executed.forEach(e => previewLines2.push(`  • ${e.new_name}: ${e.file_url}`));
  }

  return {
    type: "file_organize",
    preview: previewLines2.join('\n'),
    data: {
      strategy: data.strategy,
      executed,
      failed,
      total_files_scanned: files.length
    },
    diff: executed.map(e => ({
      action: "update",
      target: `${e.folder}/${e.new_name}`,
      detail: `原文件「${e.original_name}」已重命名并归档`
    }))
  };
}

async function executeCalendarEvent(base44, exec) {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      reminder_time: { type: "string", description: "ISO 时间字符串" },
      end_time: { type: "string", description: "ISO 时间字符串，可选" },
      description: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high", "urgent"] }
    },
    required: ["title", "reminder_time"]
  };

  const data = await callKimi(
    base44,
    `请把以下指令解析为日历事件（当前时间：${new Date().toISOString()}）：\n${exec.original_input || exec.task_title}`,
    schema,
    "你是日程助手，准确解析时间表达。"
  );

  const task = await base44.entities.Task.create({
    title: data.title,
    description: data.description || "",
    reminder_time: data.reminder_time,
    end_time: data.end_time,
    priority: data.priority || "medium",
    category: "personal",
    status: "pending"
  });

  return {
    type: "calendar_event",
    preview: `📅 ${data.title}\n时间：${data.reminder_time}\n${data.description || ''}`,
    data: { ...data, task_id: task.id },
    diff: [{ action: "create", target: `约定：${data.title}`, detail: `已添加到日历` }]
  };
}

const EXECUTORS = {
  email_draft: executeEmailDraft,
  web_research: executeWebResearch,
  summary_note: executeSummaryNote,
  office_doc: executeOfficeDoc,
  ppt_doc: executePptDoc,
  file_organize: executeFileOrganize,
  calendar_event: executeCalendarEvent,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { execution_id, phase = "plan" } = await req.json();
    if (!execution_id) return Response.json({ error: 'execution_id required' }, { status: 400 });

    const exec = await base44.entities.TaskExecution.get(execution_id);
    if (!exec) return Response.json({ error: 'Execution not found' }, { status: 404 });

    // === Phase 1: PLAN ===
    if (phase === "plan") {
      const planRes = await generatePlan(base44, exec);
      const steps = (planRes.plan.steps || []).map(s => ({
        step_name: s.name,
        status: "pending",
        detail: s.detail,
      }));

      const nextStatus = planRes.requires_approval ? "waiting_confirm" : "pending";
      const updated = await base44.entities.TaskExecution.update(execution_id, {
        automation_type: planRes.automation_type,
        automation_plan: planRes.plan,
        requires_approval: planRes.requires_approval,
        execution_steps: steps,
        execution_status: nextStatus,
      });

      return Response.json({ success: true, phase: "plan", execution: updated });
    }

    // === Phase 2: EXECUTE ===
    if (phase === "execute") {
      const autoType = exec.automation_type;
      const executor = EXECUTORS[autoType];

      if (!executor) {
        await base44.entities.TaskExecution.update(execution_id, {
          execution_status: "failed",
          error_message: `不支持的自动执行类型：${autoType}`,
        });
        return Response.json({ error: `Unsupported automation_type: ${autoType}` }, { status: 400 });
      }

      // 标记 executing
      const runningSteps = (exec.execution_steps || []).map((s, i) => ({
        ...s,
        status: i === 0 ? "running" : "pending",
        timestamp: i === 0 ? new Date().toISOString() : s.timestamp,
      }));
      await base44.entities.TaskExecution.update(execution_id, {
        execution_status: "executing",
        execution_steps: runningSteps,
      });

      try {
        const result = await executor(base44, exec);
        const completedSteps = (exec.execution_steps || []).map(s => ({
          ...s,
          status: "completed",
          timestamp: new Date().toISOString(),
        }));

        const updated = await base44.entities.TaskExecution.update(execution_id, {
          execution_status: "completed",
          completed_at: new Date().toISOString(),
          automation_result: result,
          execution_steps: completedSteps,
        });

        return Response.json({ success: true, phase: "execute", execution: updated, result });
      } catch (e) {
        await base44.entities.TaskExecution.update(execution_id, {
          execution_status: "failed",
          error_message: e.message,
        });
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    return Response.json({ error: 'Invalid phase' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});