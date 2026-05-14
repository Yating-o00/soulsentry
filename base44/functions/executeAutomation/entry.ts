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
      enum: ["email_draft", "file_organize", "web_research", "office_doc", "calendar_event", "summary_note", "none"]
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
      subject: { type: "string" },
      body: { type: "string", description: "邮件正文，中文，礼貌、专业" }
    },
    required: ["subject", "body"]
  };

  const data = await callKimi(
    base44,
    `请根据用户指令生成一封邮件草稿：\n${exec.original_input || exec.task_title}`,
    schema,
    "你是专业商务邮件助手，生成的邮件需简洁得体、语气恰当。"
  );

  return {
    type: "email_draft",
    preview: `收件人: ${data.to || '(待填)'}\n主题: ${data.subject}\n\n${data.body}`,
    data
  };
}

async function executeWebResearch(base44, exec) {
  const schema = {
    type: "object",
    properties: {
      topic: { type: "string" },
      summary: { type: "string", description: "Markdown 格式的研究摘要" },
      key_points: { type: "array", items: { type: "string" } },
      sources_hint: { type: "string", description: "建议用户后续查阅的方向" }
    },
    required: ["summary", "key_points"]
  };

  const data = await callKimi(
    base44,
    `请围绕以下主题做一次知识梳理与建议：\n${exec.original_input || exec.task_title}`,
    schema,
    "你是研究分析师，基于已有知识给出条理清晰、可直接使用的摘要。"
  );

  return {
    type: "web_research",
    preview: data.summary,
    data
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
  const bytes = new TextEncoder().encode(markdown);
  const blob = new Blob([bytes], { type: 'text/markdown' });
  const file = new File([blob], fileName, { type: 'text/markdown' });
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
  const schema = {
    type: "object",
    properties: {
      doc_type: { type: "string", enum: ["ppt", "word", "excel"] },
      title: { type: "string" },
      outline: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section: { type: "string" },
            content: { type: "string" }
          }
        }
      },
      note: { type: "string", description: "对用户的额外说明，例如建议补充什么数据" }
    },
    required: ["doc_type", "title", "outline"]
  };

  const data = await callKimi(
    base44,
    `请为以下需求生成办公文档大纲：\n${exec.original_input || exec.task_title}`,
    schema,
    "你是办公文档专家。请生成结构化、可直接落地的大纲。"
  );

  const previewLines = [`【${data.doc_type.toUpperCase()}】${data.title}`, ""];
  data.outline.forEach((s, i) => {
    previewLines.push(`${i + 1}. ${s.section}`);
    if (s.content) previewLines.push(`   ${s.content}`);
  });
  if (data.note) previewLines.push("", `📝 ${data.note}`);

  return {
    type: "office_doc",
    preview: previewLines.join("\n"),
    data
  };
}

// === 文件整理：扫描真实附件 → AI 制定重命名+归档映射 → 实际复制为新名重新入库 ===
async function listUserFiles(base44) {
  const tasks = await base44.entities.Task.list('-updated_date', 100);
  const files = [];
  for (const t of tasks) {
    if (Array.isArray(t.attachments)) {
      for (const a of t.attachments) {
        if (a?.file_url) {
          files.push({
            file_name: a.file_name || a.file_url.split('/').pop(),
            file_url: a.file_url,
            file_type: a.file_type || '',
            file_size: a.file_size || 0,
            uploaded_at: a.uploaded_at,
            task_id: t.id,
            task_title: t.title,
          });
        }
      }
    }
  }
  return files;
}

async function copyFileWithNewName(base44, sourceUrl, newName) {
  const r = await fetch(sourceUrl);
  if (!r.ok) throw new Error(`下载源文件失败：${r.status}`);
  const ct = r.headers.get('content-type') || 'application/octet-stream';
  const bytes = new Uint8Array(await r.arrayBuffer());
  const blob = new Blob([bytes], { type: ct });
  const file = new File([blob], newName, { type: ct });
  const up = await base44.integrations.Core.UploadFile({ file });
  return up?.file_url || up?.data?.file_url;
}

async function executeFileOrganize(base44, exec) {
  const userInput = exec.original_input || exec.task_title;

  // 1. 拉取用户真实附件清单
  const files = await listUserFiles(base44);

  // 2. 让 AI 基于真实文件清单给出每个文件的新名 + 目标文件夹
  const schema = {
    type: "object",
    properties: {
      strategy: { type: "string", description: "整理策略说明（中文）" },
      mappings: {
        type: "array",
        description: "针对每个待处理文件的处理方案。只挑选与用户指令相关的文件；若清单为空则给出空数组。",
        items: {
          type: "object",
          properties: {
            source_file_url: { type: "string", description: "源文件的 file_url，必须取自下方清单" },
            source_file_name: { type: "string", description: "源文件原始文件名" },
            new_file_name: { type: "string", description: "重命名后的文件名（含扩展名）" },
            target_folder: { type: "string", description: "目标虚拟文件夹路径，如 客户沟通/2026" },
            reason: { type: "string", description: "为什么这样处理（一句话）" }
          },
          required: ["source_file_url", "new_file_name", "target_folder"]
        }
      },
      cautions: { type: "string", description: "提醒事项" }
    },
    required: ["strategy", "mappings"]
  };

  const fileListText = files.length === 0
    ? '(用户暂无任何已上传附件)'
    : files.map((f, i) => `${i + 1}. ${f.file_name} (${f.file_type || '?'}, 任务: ${f.task_title})\n   URL: ${f.file_url}`).join('\n');

  const aiResult = await callKimi(
    base44,
    `用户指令：${userInput}\n\n当前用户已上传的附件清单：\n${fileListText}\n\n请基于真实清单，挑出符合条件的文件并给出 mappings。注意：source_file_url 必须严格来自上方清单。若清单为空，mappings 返回空数组。`,
    schema,
    "你是文件整理执行器。只能基于真实清单决策。不要编造文件。"
  );

  // 3. 实际执行：每个 mapping 复制源文件为新名重新入库
  const diff = [];
  const results = [];
  const mappings = Array.isArray(aiResult.mappings) ? aiResult.mappings : [];

  for (const m of mappings) {
    try {
      const newUrl = await copyFileWithNewName(base44, m.source_file_url, m.new_file_name);
      results.push({
        source_file_name: m.source_file_name || m.source_file_url.split('/').pop(),
        new_file_name: m.new_file_name,
        target_folder: m.target_folder,
        new_file_url: newUrl,
        status: 'success',
        reason: m.reason || ''
      });
      diff.push({
        action: 'create',
        target: `${m.target_folder}/${m.new_file_name}`,
        detail: `已从《${m.source_file_name || '原文件'}》重命名归档`
      });
    } catch (e) {
      results.push({
        source_file_name: m.source_file_name,
        new_file_name: m.new_file_name,
        target_folder: m.target_folder,
        status: 'failed',
        error: e.message
      });
    }
  }

  // 4. 生成 manifest.md 让用户可下载查看
  const manifestLines = [
    `# 文件整理执行结果`,
    ``,
    `> 指令：${userInput}`,
    `> 时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    ``,
    `## 策略`,
    aiResult.strategy || '(无)',
    ``,
    `## 处理明细（共 ${results.length} 个文件）`,
    ``
  ];
  if (results.length === 0) {
    manifestLines.push(`_未找到匹配的文件。请先在任务中上传附件（如会议纪要 PDF），再让心栈整理。_`);
  } else {
    results.forEach((r, i) => {
      manifestLines.push(`### ${i + 1}. ${r.new_file_name}`);
      manifestLines.push(`- 源文件：${r.source_file_name}`);
      manifestLines.push(`- 目标位置：📁 ${r.target_folder}`);
      manifestLines.push(`- 状态：${r.status === 'success' ? '✅ 成功' : '❌ 失败 — ' + (r.error || '')}`);
      if (r.new_file_url) manifestLines.push(`- 新文件链接：${r.new_file_url}`);
      if (r.reason) manifestLines.push(`- 说明：${r.reason}`);
      manifestLines.push('');
    });
  }
  const manifest = manifestLines.join('\n');
  const manifestBlob = new Blob([new TextEncoder().encode(manifest)], { type: 'text/markdown' });
  const manifestFile = new File([manifestBlob], `文件整理_${new Date().toISOString().slice(0, 10)}.md`, { type: 'text/markdown' });
  const manifestResp = await base44.integrations.Core.UploadFile({ file: manifestFile });
  const manifestUrl = manifestResp?.file_url || manifestResp?.data?.file_url;

  const successCount = results.filter(r => r.status === 'success').length;
  const preview = [
    `📂 文件整理已执行（${successCount}/${results.length} 成功）`,
    ``,
    `策略：${aiResult.strategy || '-'}`,
    ``,
    results.length === 0
      ? `⚠️ 未找到可处理的附件。请先把会议纪要等 PDF 作为附件上传到任务中。`
      : results.map(r => `${r.status === 'success' ? '✅' : '❌'} ${r.source_file_name} → ${r.target_folder}/${r.new_file_name}`).join('\n'),
    ``,
    manifestUrl ? `📥 详细清单：${manifestUrl}` : ''
  ].join('\n');

  return {
    type: "file_organize",
    preview,
    data: {
      strategy: aiResult.strategy,
      total_files_scanned: files.length,
      mappings_count: results.length,
      success_count: successCount,
      results,
      manifest_url: manifestUrl,
      file_url: manifestUrl, // 让 ExecutionResultDialog 自动渲染下载按钮
      file_name: manifestFile.name,
      cautions: aiResult.cautions || ''
    },
    diff
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