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

async function executeSummaryNote(base44, exec) {
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
    `请把以下内容整理成一篇心签（笔记）：\n${exec.original_input || exec.task_title}`,
    schema,
    "你是用户的思维整理助手，把零散输入提炼成结构清晰、富有启发的心签。"
  );

  // 真正写入 Note 实体
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

async function executeFileOrganize(base44, exec) {
  const schema = {
    type: "object",
    properties: {
      strategy: { type: "string", description: "整理策略说明" },
      categories: {
        type: "array",
        items: {
          type: "object",
          properties: {
            folder: { type: "string" },
            rule: { type: "string" }
          }
        }
      },
      cautions: { type: "string", description: "需用户在桌面伴侣 App 中确认的事项" }
    },
    required: ["strategy", "categories"]
  };

  const data = await callKimi(
    base44,
    `请为以下文件整理需求生成执行计划（仅生成计划，实际操作由桌面伴侣 App 完成）：\n${exec.original_input || exec.task_title}`,
    schema,
    "你是文件整理顾问，输出结构化的整理规则。"
  );

  const previewLines = [`整理策略：${data.strategy}`, "", "分类规则："];
  data.categories.forEach((c) => previewLines.push(`📁 ${c.folder} ← ${c.rule}`));
  if (data.cautions) previewLines.push("", `⚠️ ${data.cautions}`);

  return {
    type: "file_organize",
    preview: previewLines.join("\n"),
    data,
    diff: data.categories.map(c => ({ action: "create", target: c.folder, detail: c.rule }))
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