import fs from "node:fs";
import path from "node:path";
import { invokeKimiText, invokeKimiWebSearch } from "../lib/kimi.js";
import { env } from "../config/env.js";

const AUTOMATION_EXECUTE_COSTS = {
  plan: 5,
  email_draft: 15,
  summary_note: 20,
  calendar_event: 20,
  file_organize: 20,
  ledger_organize: 20,
  office_doc: 50,
  web_research: 60,
  ppt_doc: 80,
  default: 20,
};

const SUPPORTED_TYPES = [
  "summary_note",
  "email_draft",
  "web_research",
  "office_doc",
  "calendar_event",
  "ledger_organize",
  "file_organize",
  "ppt_doc",
];

function buildAttachmentContext(execution) {
  const attached = execution.aiParsedResult?.attached_files;
  if (!Array.isArray(attached) || attached.length === 0) return "";
  const names = attached.map((f) => f?.file_name || "未知文件").filter(Boolean);
  return `\n用户还附带了以下参考文件（本次暂不解析内容，仅作为背景）：${names.join("、")}`;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToBasicHtml(markdown) {
  const lines = String(markdown || "").split("\n");
  const out = [];
  let inList = false;
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      out.push(`<p>${paragraph.join(" ")}</p>`);
      paragraph = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${escapeHtml(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }

    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    paragraph.push(escapeHtml(line));
  }

  flushParagraph();
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function wrapHtmlDocument(title, markdown) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; max-width: 840px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #334155; }
h1, h2, h3 { color: #1e293b; }
h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
a { color: #2563eb; }
ul { padding-left: 1.5rem; }
</style>
</head>
<body>
${markdownToBasicHtml(markdown)}
</body>
</html>`;
}

function saveMarkdownAsHtml({ title, markdown, execution, type }) {
  const uploadRoot = path.join(process.cwd(), env.UPLOAD_DIR);
  fs.mkdirSync(uploadRoot, { recursive: true });
  const safeTitle = String(title || type)
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  const filename = `${Date.now()}_${type}_${safeTitle}_${execution.id.slice(-6)}.html`;
  const filePath = path.join(uploadRoot, filename);
  fs.writeFileSync(filePath, wrapHtmlDocument(title, markdown), "utf8");
  return { fileName: filename, fileUrl: `/uploads/${filename}` };
}

function normalizeIsoTime(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    let text = value.trim();
    // 补全年份（如 "05-20 14:00"）
    if (/^\d{1,2}-\d{1,2}/.test(text) && !/^\d{4}/.test(text)) {
      const year = new Date().getFullYear();
      text = `${year}-${text}`;
    }
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

// 将 AI 可能返回的过去年份修正为当前或未来日期（处理 "本周五" 等描述）
function coerceFutureTime(isoString) {
  const parsed = normalizeIsoTime(isoString);
  if (!parsed) return null;
  const date = new Date(parsed);
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (date > oneDayAgo) return parsed;

  // 保留月日时间，替换为当前年份；若仍早于昨天，则再加一年
  let year = now.getFullYear();
  const fixed = new Date(date);
  fixed.setFullYear(year);
  if (fixed < oneDayAgo) fixed.setFullYear(year + 1);
  return fixed.toISOString();
}

// 从用户输入推断提前提醒偏移量（毫秒），支持 "提前15分钟/1小时/30分钟" 等
function inferReminderOffsetMs(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const t = text.trim();
  const m = t.match(/提前\s*(\d+(?:\.\d+)?)\s*(分钟|小时|钟头|hrs?|minutes?|min)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2];
  if (Number.isNaN(n) || n <= 0) return null;
  if (unit.includes("小时") || unit.startsWith("hr")) return Math.round(n * 60 * 60 * 1000);
  return Math.round(n * 60 * 1000);
}

async function generateAutomationPlan(execution) {
  const planSchema = {
    type: "object",
    properties: {
      automation_type: { type: "string", enum: SUPPORTED_TYPES },
      plan: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, detail: { type: "string" } },
              required: ["name", "detail"],
            },
          },
          risk_warning: { type: "string" },
          estimated_duration: { type: "string" },
        },
        required: ["title", "description", "steps", "risk_warning", "estimated_duration"],
      },
      requires_approval: { type: "boolean" },
    },
    required: ["automation_type", "plan", "requires_approval"],
  };

  const data = await invokeKimiText({
    systemPrompt: [
      "你是一名中文任务自动执行分类与规划助手。",
      "请根据用户的自然语言输入，判断最适合的自动化类型，并给出可执行方案。",
      "支持的类型：summary_note（总结/笔记）、email_draft（邮件草稿）、web_research（联网调研）、office_doc（办公文档）、calendar_event（日历事件）、ledger_organize（整理账本）、file_organize（文件整理）、ppt_doc（演示稿）。",
      "输出必须是 JSON，不要输出解释。",
    ].join("\n"),
    prompt: [
      `用户输入：${execution.originalInput || ""}`,
      `用户已指定的执行类型（如无把握可优先采用）：${execution.automationType || "未指定"}`,
      buildAttachmentContext(execution),
      "请返回 automation_type、plan（title/description/steps/risk_warning/estimated_duration）以及 requires_approval。",
    ].join("\n"),
    responseJsonSchema: planSchema,
    temperature: 0.3,
  });

  const automationType = SUPPORTED_TYPES.includes(data.automation_type)
    ? data.automation_type
    : "summary_note";

  // 中国大陆部署：除邮件草稿外默认不需要二次确认
  const requiresApproval = automationType === "email_draft" ? true : Boolean(data.requires_approval);

  return {
    automation_type: automationType,
    plan: data.plan || { title: "", description: "", steps: [], risk_warning: "", estimated_duration: "" },
    requires_approval: requiresApproval,
  };
}

async function handleSummaryNote(execution) {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string", description: "笔记标题，5-30字" },
      content: { type: "string", description: "Markdown 格式正文，至少包含一段实质性内容，不要为空" },
      key_points: { type: "array", items: { type: "string" }, description: "3-7 条要点" },
      tags: { type: "array", items: { type: "string" }, description: "1-5 个标签" },
    },
    required: ["title", "content", "key_points"],
  };

  const userInput = execution.originalInput || execution.taskTitle || "";
  const data = await invokeKimiText({
    systemPrompt: [
      "你是一名中文笔记整理助手。请根据用户输入生成结构化的 Markdown 笔记。",
      "要求：",
      "1. title 必须是非空标题；",
      "2. content 必须是非空 Markdown 正文，包含对用户输入的总结、梳理或扩展；",
      "3. key_points 至少包含 2 条核心要点；",
      "4. 输出必须是 JSON，不要输出解释。"
    ].join("\n"),
    prompt: `用户输入：${userInput}${buildAttachmentContext(execution)}`,
    responseJsonSchema: schema,
    temperature: 0.3,
  });

  const title = String(data.title || "").trim();
  const content = String(data.content || "").trim();

  if (!title || !content) {
    throw new Error("AI 返回的笔记内容为空，请重试");
  }

  return {
    type: "summary_note",
    preview: content.slice(0, 120),
    data: {
      title,
      content,
      key_points: Array.isArray(data.key_points) ? data.key_points.filter(Boolean) : [],
      tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
    },
  };
}

async function handleEmailDraft(execution) {
  const schema = {
    type: "object",
    properties: {
      to: { type: "string", description: "收件人邮箱，未指定可留空" },
      to_name: { type: "string", description: "收件人称呼" },
      cc: { type: "string", description: "抄送邮箱" },
      subject: { type: "string", description: "邮件主题，必须非空" },
      body: { type: "string", description: "邮件正文 Markdown，必须非空" },
      tone: { type: "string", enum: ["formal", "friendly", "neutral", "urgent"] },
    },
    required: ["subject", "body", "tone"],
  };

  const todayCN = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' });
  const data = await invokeKimiText({
    systemPrompt: [
      "你是一名中文商务邮件助手。请根据用户输入起草一封专业邮件。",
      "要求：1) subject 必须是非空主题；2) body 必须是非空正文，含称呼、正文、署名；3) 语气根据用户意图选择 formal/friendly/neutral/urgent；4) 输出必须是 JSON。"
    ].join("\n"),
    prompt: `当前日期：${todayCN}\n\n用户输入：${execution.originalInput || ""}${buildAttachmentContext(execution)}`,
    responseJsonSchema: schema,
    temperature: 0.4,
  });

  const subject = String(data.subject || "").trim();
  const body = String(data.body || "").trim();
  if (!subject || !body) {
    throw new Error("AI 生成的邮件缺少主题或正文，请重试");
  }

  return {
    type: "email_draft",
    preview: subject,
    data: {
      to: String(data.to || ""),
      to_name: String(data.to_name || ""),
      cc: String(data.cc || ""),
      subject,
      body,
      tone: ["formal", "friendly", "neutral", "urgent"].includes(data.tone) ? data.tone : "formal",
    },
  };
}

async function handleWebResearch(execution) {
  const search = await invokeKimiWebSearch({ query: execution.originalInput || "" });

  const schema = {
    type: "object",
    properties: {
      topic: { type: "string" },
      executive_summary: { type: "string" },
      key_findings: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: { heading: { type: "string" }, body: { type: "string" } },
          required: ["heading", "body"],
        },
      },
      references: { type: "array", items: { type: "string" } },
      markdown: { type: "string" },
    },
    required: ["topic", "executive_summary", "markdown"],
  };

  const data = await invokeKimiText({
    systemPrompt: "你是一名中文研究助理。请根据联网搜索结果撰写结构化调研报告。输出必须是 JSON。",
    prompt: [
      `研究主题：${execution.originalInput || ""}`,
      "联网搜索摘要：",
      search.answer || "",
      "参考链接：",
      ...(Array.isArray(search.references) ? search.references.map((r) => `- ${r.title || ""}: ${r.url || ""}`) : []),
    ].join("\n"),
    responseJsonSchema: schema,
    temperature: 0.3,
  });

  const title = String(data.topic || execution.taskTitle || "调研报告");
  const markdown = String(
    data.markdown || `# ${title}\n\n## 执行摘要\n${data.executive_summary || ""}`
  );
  const { fileName, fileUrl } = saveMarkdownAsHtml({ title, markdown, execution, type: "web_research" });

  return {
    type: "web_research",
    preview: String(data.executive_summary || "").slice(0, 120),
    data: {
      title,
      topic: title,
      executive_summary: String(data.executive_summary || ""),
      key_findings: Array.isArray(data.key_findings) ? data.key_findings : [],
      recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      sections: Array.isArray(data.sections) ? data.sections : [],
      references: Array.isArray(data.references)
        ? data.references
        : Array.isArray(search.references)
          ? search.references.map((r) => r.url).filter(Boolean)
          : [],
      file_name: fileName,
      file_url: fileUrl,
      markdown,
    },
    diff: [{ action: "create", target: fileName, detail: "已生成调研报告 HTML" }],
  };
}

async function handleOfficeDoc(execution) {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string", description: "文档标题，必须非空" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string", description: "章节标题" },
            body: { type: "string", description: "章节正文 Markdown，必须非空" }
          },
          required: ["heading", "body"],
        },
      },
      markdown: { type: "string" },
    },
    required: ["title", "sections"],
  };

  const data = await invokeKimiText({
    systemPrompt: [
      "你是一名中文办公文档助手。请根据用户输入生成一份结构化的办公文档（方案、报告、说明书等）。",
      "要求：1) title 必须非空；2) sections 至少包含 2 个章节，每个章节 heading 和 body 必须非空；3) 输出必须是 JSON。"
    ].join("\n"),
    prompt: `用户输入：${execution.originalInput || ""}${buildAttachmentContext(execution)}`,
    responseJsonSchema: schema,
    temperature: 0.3,
  });

  const title = String(data.title || execution.taskTitle || "办公文档").trim();
  const sections = Array.isArray(data.sections) ? data.sections.filter((s) => s?.heading && s?.body) : [];
  if (!title || sections.length === 0) {
    throw new Error("AI 生成的文档缺少标题或章节，请重试");
  }

  let markdown = String(data.markdown || "").trim();
  if (!markdown) {
    markdown = [`# ${title}`, ...sections.map((s) => `## ${s.heading}\n${s.body}`)].join("\n\n");
  }

  const { fileName, fileUrl } = saveMarkdownAsHtml({ title, markdown, execution, type: "office_doc" });

  return {
    type: "office_doc",
    preview: title,
    data: {
      title,
      sections,
      file_name: fileName,
      file_url: fileUrl,
      markdown,
    },
    diff: [{ action: "create", target: fileName, detail: "已生成办公文档 HTML" }],
  };
}

async function handleCalendarEvent(execution, prisma) {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string", description: "事件标题，必须非空" },
      start_time: { type: "string", description: "开始时间 ISO 8601" },
      end_time: { type: "string", description: "结束时间 ISO 8601" },
      is_all_day: { type: "boolean" },
      description: { type: "string" },
      reminder_time: { type: "string", description: "提醒时间 ISO 8601" },
      location: { type: "string", description: "地点，如会议室、地址" },
      participants: { type: "array", items: { type: "string" }, description: "参会人姓名或邮箱" },
    },
    required: ["title", "start_time", "end_time"],
  };

  const today = new Date().toISOString().slice(0, 10);
  const data = await invokeKimiText({
    systemPrompt: [
      "你是一名中文日程解析助手。请从用户输入中提取事件信息。",
      "规则：",
      "1. title 必须是非空标题；",
      "2. start_time / end_time 必须是 ISO 8601 字符串；",
      "3. 若用户说'本周五'，请基于今天日期推算出本周五的具体日期（含当前年份），不要编造过去年份；",
      "4. 若缺少结束时间，请根据事件类型合理推断（如会议默认1小时）；",
      "5. 提取 location（地点）、participants（参会人）；",
      "6. 输出必须是 JSON，不要解释。"
    ].join("\n"),
    prompt: `今天日期：${today}\n\n用户输入：${execution.originalInput || ""}${buildAttachmentContext(execution)}`,
    responseJsonSchema: schema,
    temperature: 0.2,
  });

  const title = String(data.title || "").trim();
  if (!title) {
    throw new Error("AI 未识别到事件标题，请重试");
  }

  let startTime = coerceFutureTime(data.start_time);
  if (!startTime) {
    throw new Error("AI 未识别到有效的开始时间，请补充时间信息后重试");
  }

  let endTime = coerceFutureTime(data.end_time);
  if (!endTime) {
    const start = new Date(startTime);
    start.setHours(start.getHours() + 1);
    endTime = start.toISOString();
  }
  let reminderTime = coerceFutureTime(data.reminder_time);
  if (!reminderTime) {
    const offsetMs = inferReminderOffsetMs(execution.originalInput);
    if (offsetMs) {
      reminderTime = new Date(new Date(startTime).getTime() - offsetMs).toISOString();
    }
  }
  const location = String(data.location || "").trim();
  const participants = Array.isArray(data.participants) ? data.participants.filter(Boolean) : [];

  // 组装描述：保留原始地点与补充信息
  const descriptionParts = [];
  if (location) descriptionParts.push(`地点：${location}`);
  if (data.description) descriptionParts.push(String(data.description));
  const description = descriptionParts.join("\n");

  const task = await prisma.task.create({
    data: {
      userId: execution.userId,
      title,
      description,
      reminderTime: reminderTime ? new Date(reminderTime) : null,
      endTime: new Date(endTime),
      isAllDay: Boolean(data.is_all_day),
    },
  });

  const reminders = [];
  if (reminderTime) {
    reminders.push(new Date(reminderTime).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }));
  }

  return {
    type: "calendar_event",
    preview: title,
    data: {
      title,
      start_time: startTime,
      end_time: endTime,
      is_all_day: Boolean(data.is_all_day),
      description,
      reminder_time: reminderTime,
      reminders,
      location,
      participants,
      task_id: task.id,
    },
    diff: [{ action: "create", target: title, detail: `已创建约定任务${location ? "，地点：" + location : ""}` }],
  };
}

async function handleLedgerOrganize(execution) {
  const schema = {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            category: { type: "string" },
            item: { type: "string" },
            amount: { type: "number" },
            type: { type: "string", enum: ["income", "expense"] },
            note: { type: "string" },
          },
          required: ["date", "category", "item", "amount", "type"],
        },
      },
      stats: {
        type: "object",
        properties: {
          total_income: { type: "number" },
          total_expense: { type: "number" },
          by_category: { type: "object" },
        },
      },
    },
    required: ["entries"],
  };

  const data = await invokeKimiText({
    systemPrompt: [
      "你是一名中文账目整理助手。请从用户输入中提取每一笔收支记录，并给出分类统计。",
      "要求：1) entries 至少包含 1 条记录；2) 每条记录包含 date、category、item、amount、type（income/expense）；3) 输出必须是 JSON。"
    ].join("\n"),
    prompt: `用户输入：${execution.originalInput || ""}${buildAttachmentContext(execution)}`,
    responseJsonSchema: schema,
    temperature: 0.2,
  });

  const entries = Array.isArray(data.entries) ? data.entries.filter((e) => e?.item && Number(e?.amount) > 0) : [];
  if (entries.length === 0) {
    throw new Error("AI 未从输入中识别出有效账目，请检查输入文本是否包含金额和描述");
  }
  const totalIncome = entries.reduce((sum, e) => sum + (e.type === "income" ? Number(e.amount) || 0 : 0), 0);
  const totalExpense = entries.reduce((sum, e) => sum + (e.type === "expense" ? Number(e.amount) || 0 : 0), 0);
  const byCategory = {};
  for (const e of entries) {
    const cat = String(e.category || "其他");
    if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
    byCategory[cat][e.type] += Number(e.amount) || 0;
  }

  return {
    type: "ledger_organize",
    preview: `共 ${entries.length} 条账目，支出 ${totalExpense.toFixed(2)}，收入 ${totalIncome.toFixed(2)}`,
    data: {
      entries,
      stats: {
        total_income: data?.stats?.total_income ?? totalIncome,
        total_expense: data?.stats?.total_expense ?? totalExpense,
        by_category: data?.stats?.by_category ?? byCategory,
      },
    },
  };
}

async function handleFileOrganize(execution) {
  const schema = {
    type: "object",
    properties: {
      plan: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source_path: { type: "string", description: "原始文件路径或文件名" },
            target_path: { type: "string", description: "目标文件夹路径" },
            category: { type: "string", description: "分类标签" },
            action: { type: "string", enum: ["move", "delete", "create"], description: "操作类型" },
            reason: { type: "string", description: "整理理由" },
          },
          required: ["source_path", "target_path", "action"],
        },
      },
      summary: { type: "string", description: "整理方案一句话总结" },
    },
    required: ["plan"],
  };

  const data = await invokeKimiText({
    systemPrompt: [
      "你是一名中文文件整理助手。请根据用户描述给出具体的文件/资料整理与归档方案。",
      "规则：",
      "1. plan 至少包含 1 项可执行操作；",
      "2. 每项必须包含 source_path（来源）、target_path（目标文件夹）、action（move/delete/create）、reason（理由）；",
      "3. 如果用户提到删除、清理，可使用 action=delete；",
      "4. 输出必须是 JSON，不要解释。"
    ].join("\n"),
    prompt: `用户输入：${execution.originalInput || ""}${buildAttachmentContext(execution)}`,
    responseJsonSchema: schema,
    temperature: 0.3,
  });

  const plan = Array.isArray(data.plan) ? data.plan.filter((p) => p?.source_path && p?.target_path) : [];
  const summary = String(data.summary || "").trim();
  const fallbackPreview = summary || (plan.length > 0 ? `整理方案共 ${plan.length} 项` : "已分析文件整理需求，但未生成具体操作项");

  return {
    type: "file_organize",
    preview: fallbackPreview,
    data: { plan, summary },
    diff: plan.map((item) => ({
      action: ["move", "delete", "create"].includes(item.action) ? item.action : "move",
      target: String(item.source_path || ""),
      detail: `${item.category ? `[${item.category}] ` : ""}建议${item.action === "delete" ? "删除" : item.action === "create" ? "创建" : "归档到"} ${item.target_path || ""}${item.reason ? "：" + item.reason : ""}`,
    })),
  };
}

async function handlePptDoc(execution) {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["title", "bullets"],
        },
      },
    },
    required: ["title", "slides"],
  };

  const data = await invokeKimiText({
    systemPrompt: "你是一名中文演示稿助手。请根据用户输入生成幻灯片大纲。输出必须是 JSON。",
    prompt: `用户输入：${execution.originalInput || ""}${buildAttachmentContext(execution)}`,
    responseJsonSchema: schema,
    temperature: 0.3,
  });

  const title = String(data.title || "");
  const slides = Array.isArray(data.slides) ? data.slides : [];
  return {
    type: "ppt_doc",
    preview: title,
    data: { title, slides },
  };
}

const HANDLERS = {
  summary_note: handleSummaryNote,
  email_draft: handleEmailDraft,
  web_research: handleWebResearch,
  office_doc: handleOfficeDoc,
  calendar_event: handleCalendarEvent,
  ledger_organize: handleLedgerOrganize,
  file_organize: handleFileOrganize,
  ppt_doc: handlePptDoc,
};

export async function executeAutomation({ executionId, phase, userId, prisma }) {
  const execution = await prisma.taskExecution.findFirst({
    where: { id: executionId, userId },
  });

  if (!execution) {
    const error = new Error("执行记录不存在");
    error.status = 404;
    throw error;
  }

  if (phase !== "plan" && phase !== "execute") {
    const error = new Error("phase 必须是 plan 或 execute");
    error.status = 400;
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCredits: true },
  });

  const costKey = phase === "plan" ? "plan" : execution.automationType || "default";
  const cost = AUTOMATION_EXECUTE_COSTS[costKey] ?? AUTOMATION_EXECUTE_COSTS.default;

  if (!user || user.aiCredits < cost) {
    const error = new Error("AI 点数不足");
    error.status = 402;
    error.code = "INSUFFICIENT_CREDITS";
    error.required = cost;
    error.balance = user?.aiCredits ?? 0;
    throw error;
  }

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { aiCredits: { decrement: cost } },
    }),
    prisma.aICreditTransaction.create({
      data: {
        userId,
        type: "CONSUME",
        amount: -cost,
        balanceAfter: user.aiCredits - cost,
        feature: phase === "plan" ? "automation_plan" : `automation_${execution.automationType || "execute"}`,
        description: phase === "plan" ? "自动执行方案规划" : `自动执行 ${execution.automationType || ""}`,
      },
    }),
  ]);

  try {
    if (phase === "plan") {
      const planResult = await generateAutomationPlan(execution);
      await prisma.taskExecution.update({
        where: { id: execution.id },
        data: {
          automationType: planResult.automation_type,
          automationPlan: planResult.plan,
          requiresApproval: planResult.requires_approval,
          executionStatus: planResult.requires_approval ? "waiting_confirm" : "pending",
        },
      });
      return {
        data: {
          automation_type: planResult.automation_type,
          plan: planResult.plan,
          requires_approval: planResult.requires_approval,
        },
      };
    }

    const handler = HANDLERS[execution.automationType];
    if (!handler) {
      throw new Error(`不支持的自动执行类型：${execution.automationType}`);
    }

    await prisma.taskExecution.update({
      where: { id: execution.id },
      data: { executionStatus: "executing" },
    });

    const handlerResult = await handler(execution, prisma);
    const requiresApproval = execution.automationType === "email_draft";
    const nextStatus = requiresApproval ? "waiting_confirm" : "completed";

    await prisma.taskExecution.update({
      where: { id: execution.id },
      data: {
        automationResult: handlerResult,
        executionStatus: nextStatus,
        completedAt: nextStatus === "completed" ? new Date() : null,
      },
    });

    return { data: handlerResult };
  } catch (error) {
    await prisma.taskExecution.update({
      where: { id: execution.id },
      data: {
        executionStatus: "failed",
        errorMessage: error.message || "执行失败",
      },
    });

    const wrapped = new Error(error.message || "执行失败");
    wrapped.status = error.status || 500;
    throw wrapped;
  }
}
