import fs from "node:fs";
import path from "node:path";
import { invokeKimiText, invokeKimiWebSearch } from "../lib/kimi.js";
import { renderPptHtml, savePptHtml } from "../lib/renderPpt.js";
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

const AUTOMATION_TYPE_ALIASES = {
  总结笔记: "summary_note",
  笔记: "summary_note",
  总结: "summary_note",
  邮件草稿: "email_draft",
  邮件: "email_draft",
  写邮件: "email_draft",
  联网调研: "web_research",
  调研: "web_research",
  网络调研: "web_research",
  办公文档: "office_doc",
  文档: "office_doc",
  word文档: "office_doc",
  日历事件: "calendar_event",
  日程: "calendar_event",
  日历: "calendar_event",
  约定: "calendar_event",
  整理账本: "ledger_organize",
  账本: "ledger_organize",
  记账: "ledger_organize",
  文件整理: "file_organize",
  文件归档: "file_organize",
  整理文件: "file_organize",
  演示稿: "ppt_doc",
  ppt: "ppt_doc",
  幻灯片: "ppt_doc",
};

function normalizeAutomationType(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (SUPPORTED_TYPES.includes(v)) return v;
  return AUTOMATION_TYPE_ALIASES[v] || null;
}

// 判断一段文本是否像账目流水（多条金额 + 消费/收支场景词）
function looksLikeLedger(text) {
  const direct = /整理账本|记账|账本|收支|报销|账单|记账本|支出.*收入|统计.*钱|记一笔|开销|花销/;
  if (direct.test(text)) return true;

  // 至少包含 2 个金额数字
  const amounts = text.match(/\d+(?:\.\d+)?/g) || [];
  if (amounts.length < 2) return false;

  // 包含常见的消费/收支/账目场景词
  const scene = /早饭|午餐|晚餐|吃饭|地铁|公交|打车|出租车|滴滴|咖啡|奶茶|饮料|超市|便利店|水果|外卖|房租|水电|燃气|物业费|宽带|话费|工资|奖金|补贴|报销|收入|支出|花费|消费|买了|红包|转账|还款|贷款|利息|理财|收益|退款|定金|尾款/;
  return scene.test(text);
}

// 当用户没有指定有效类型（或 AI 默认 summary_note）时，从自然语言输入里兜底推断类型
function detectAutomationTypeFromInput(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const t = text.trim();
  const lower = t.toLowerCase();

  // 金额流水账本优先于所有类型：避免"晚上/昨天/今天"等时间词把账本误判为约定
  if (looksLikeLedger(t)) return "ledger_organize";

  // 按优先级匹配：内容生产/整理意图优先于时间约定，避免"会议跟进邮件"
  // "会议要点整理"等被 calendar_event 的"会议"误触发。
  const patterns = [
    // 1. 邮件：必须优先，"给张总发一封会议跟进邮件"不应被 calendar 截胡
    { type: "email_draft", regex: /写邮件|发邮件|邮件草稿|回复邮件|跟进邮件|邮件主题|邮件正文|给.*(?:发|写).*邮|致.*的.*邮|写.*邮|发.*邮/ },
    // 2. PPT / 演示
    { type: "ppt_doc", regex: /做ppt|做PPT|生成ppt|生成PPT|做.*ppt|做.*PPT|生成.*ppt|生成.*PPT|幻灯片|演示稿|演示文稿|演讲稿|路演|pitch deck/ },
    // 3. 调研
    { type: "web_research", regex: /做调研|市场调研|行业调研|竞品调研|调研报告|联网搜索|查.*资料|了解一下|研究一下|分析报告|调研一下/ },
    // 4. 账本：明确关键词兜底
    { type: "ledger_organize", regex: /整理账本|记账|账本|收支|报销|账单|记账本|支出.*收入|统计.*钱/ },
    // 5. 文件整理
    { type: "file_organize", regex: /整理文件|文件归档|归档|整理.*资料|整理.*文件夹|清理文件/ },
    // 6. 办公文档
    { type: "office_doc", regex: /写报告|写方案|写文档|写计划书|写说明书|写proposal|写备忘录|word文档|办公文档|写.*报告|写.*方案|写.*文档/ },
    // 7. 笔记/总结：在 calendar_event 之前，"会议要点整理成心签"优先于心签/总结
    { type: "summary_note", regex: /整理笔记|总结笔记|会议纪要|会议记录|心签|复盘|整理成.*(?:笔记|心签)|总结成.*(?:笔记|心签)/ },
    // 8. 日历约定：只保留明确的约定/日程/时间意图，避免宽泛词覆盖其他类型
    { type: "calendar_event", regex: /加约定|添加约定|创建约定|日程|会议.*时间|约.*时间|提醒.*时间|本周.*周五|下周一|约见|约饭|见面|聚餐|约会|活动|开会|会议|下周[一二三四五六日]|周[一二三四五六日]|明天|后天|今天下午|今晚|早上|上午|下午|晚上|几点/ },
  ];

  for (const { type, regex } of patterns) {
    if (regex.test(t) || regex.test(lower)) return type;
  }

  // 兜底：纯金额流水列表也识别为账本
  if (looksLikeLedger(t)) return "ledger_organize";

  return null;
}

function buildDefaultPlan(automationType, execution) {
  const input = String(execution.originalInput || execution.taskTitle || "").slice(0, 80);
  const taskTitle = String(execution.taskTitle || "").slice(0, 60);
  const maps = {
    email_draft: {
      title: taskTitle || "邮件草稿方案",
      description: `根据用户输入起草一封专业邮件：${input || "未提供具体内容"}`,
      steps: [
        { name: "识别收件人与主题", detail: "从输入中提取收件人、抄送及邮件主题" },
        { name: "生成正文", detail: "撰写含称呼、正文、署名的完整邮件内容" },
        { name: "确认发送", detail: "用户二次确认后通过 Gmail 发送" }
      ],
      risk_warning: "请确认收件人、主题与正文内容，避免误发。",
      estimated_duration: "约 30 秒"
    },
    web_research: {
      title: taskTitle || "联网调研方案",
      description: `针对主题进行联网搜索并生成结构化调研报告：${input || ""}`,
      steps: [
        { name: "联网搜索", detail: "调用 Kimi 联网能力检索最新相关信息" },
        { name: "提炼结论", detail: "总结执行摘要、关键发现与建议" },
        { name: "生成报告", detail: "输出带章节与参考链接的 HTML 报告" }
      ],
      risk_warning: "报告内容基于公开网络信息，关键数据请再次核实。",
      estimated_duration: "约 1-2 分钟"
    },
    ppt_doc: {
      title: taskTitle || "演示稿方案",
      description: `根据主题生成可在线预览的幻灯片：${input || ""}`,
      steps: [
        { name: "梳理大纲", detail: "将主题拆分为封面、章节与内容页" },
        { name: "设计版式", detail: "自动选择封面、卡片、图文、结尾等版式" },
        { name: "渲染演示稿", detail: "生成可全屏播放的 HTML 演示稿" }
      ],
      risk_warning: "生成结果仅供参考，正式演示前请检查内容与排版。",
      estimated_duration: "约 1-2 分钟"
    },
    office_doc: {
      title: taskTitle || "办公文档方案",
      description: `根据需求生成结构化办公文档：${input || ""}`,
      steps: [
        { name: "明确文档结构", detail: "确定标题、章节与核心论点" },
        { name: "撰写内容", detail: "按章节生成 Markdown 格式正文" },
        { name: "导出 HTML", detail: "生成可在线预览的文档文件" }
      ],
      risk_warning: "请核对文档中的事实与数据。",
      estimated_duration: "约 1-2 分钟"
    },
    calendar_event: {
      title: taskTitle || "日程安排方案",
      description: `从输入中提取事件信息并创建提醒：${input || ""}`,
      steps: [
        { name: "解析时间", detail: "识别开始/结束时间与提醒偏移" },
        { name: "提取地点与参与人", detail: "补全地点、描述与参与人信息" },
        { name: "创建约定", detail: "在任务系统中创建待提醒事件" }
      ],
      risk_warning: "请确认时间解析结果，避免错过重要日程。",
      estimated_duration: "约 20 秒"
    },
    ledger_organize: {
      title: taskTitle || "账本整理方案",
      description: `从输入中提取收支记录并分类统计：${input || ""}`,
      steps: [
        { name: "识别账目", detail: "逐条提取日期、项目、金额与收支类型" },
        { name: "自动分类", detail: "按餐饮、交通、居住等维度归类" },
        { name: "汇总分析", detail: "计算总收入、总支出与结余" }
      ],
      risk_warning: "AI 分类可能存在偏差，请核对金额与类别。",
      estimated_duration: "约 30 秒"
    },
    file_organize: {
      title: taskTitle || "文件整理方案",
      description: `根据描述给出文件归档与整理建议：${input || ""}`,
      steps: [
        { name: "分析文件", detail: "识别需要整理的文件/文件夹" },
        { name: "规划归档", detail: "给出目标路径、分类与操作" },
        { name: "输出方案", detail: "生成可执行的整理清单" }
      ],
      risk_warning: "删除/移动操作前请确认，避免误删重要文件。",
      estimated_duration: "约 30 秒"
    },
    summary_note: {
      title: taskTitle || "总结笔记方案",
      description: `将输入整理为结构化笔记：${input || ""}`,
      steps: [
        { name: "提取关键信息", detail: "识别输入中的主题、要点与标签" },
        { name: "组织内容", detail: "生成 Markdown 笔记与核心要点" },
        { name: "保存结果", detail: "输出可编辑的笔记内容" }
      ],
      risk_warning: "请核对总结是否遗漏重要信息。",
      estimated_duration: "约 30 秒"
    }
  };
  return maps[automationType] || {
    title: taskTitle || "自动执行方案",
    description: `根据用户输入完成自动化任务：${input || ""}`,
    steps: [
      { name: "分析需求", detail: "理解用户输入并确定执行方向" },
      { name: "执行处理", detail: "调用 AI 完成内容生成或信息提取" },
      { name: "返回结果", detail: "以可视化方式展示生成结果" }
    ],
    risk_warning: "请确认生成结果后再使用。",
    estimated_duration: "约 1-3 分钟"
  };
}

function sanitizeResearchTitle(title, originalInput, taskTitle) {
  let t = String(title || "").trim();
  const input = String(originalInput || "").trim();
  const fallback = String(taskTitle || "").trim() || "调研报告";
  if (!t) return fallback;

  // 若标题与用户原输入完全一致，则换成任务标题/去重
  if (input && (t === input || t.replace(/\s+/g, "") === input.replace(/\s+/g, ""))) {
    return fallback !== input ? fallback : `${fallback} · 调研报告`;
  }

  // 去除连续重复片段（AI 经常把同一句重复 2-3 次）
  const parts = t.split(/[，。；！？,;!?]/).map((s) => s.trim()).filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const p of parts) {
    const key = p.replace(/\s+/g, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  if (unique.length > 0 && unique.join("").length >= t.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").length * 0.5) {
    t = unique.join("，");
  }

  // 截断并清理首尾标点
  t = t.replace(/^[\s，。；！？,:;!?]+|[\s，。；！？,:;!?]+$/g, "").trim();
  if (t.length > 60) t = t.slice(0, 60).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]$/, "").trim();
  if (!t) return fallback;
  return t;
}

async function generateAutomationPlan(execution) {
  const planSchema = {
    type: "object",
    properties: {
      automation_type: { type: "string", enum: SUPPORTED_TYPES },
      plan: {
        type: "object",
        properties: {
          title: { type: "string", description: "方案标题，必须非空" },
          description: { type: "string", description: "方案描述，必须非空" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "步骤名称，必须非空" },
                detail: { type: "string", description: "步骤详情，必须非空" },
              },
              required: ["name", "detail"],
            },
          },
          risk_warning: { type: "string", description: "风险提示，必须非空" },
          estimated_duration: { type: "string", description: "预计耗时，必须非空" },
        },
        required: ["title", "description", "steps", "risk_warning", "estimated_duration"],
      },
      requires_approval: { type: "boolean" },
    },
    required: ["automation_type", "plan", "requires_approval"],
  };

  // 用户明确指定了非 summary_note 的有效类型时优先采用（快捷模板场景）
  const explicitUserType = normalizeAutomationType(execution.automationType);
  const isExplicitSpecificType = explicitUserType && explicitUserType !== "summary_note";

  // 兜底：当用户没有明确指定具体类型，或只给了 summary_note 时，从输入里再推断一次
  const detectedTypeFromInput = detectAutomationTypeFromInput(execution.originalInput);
  const preferredType = isExplicitSpecificType
    ? explicitUserType
    : (detectedTypeFromInput || explicitUserType || "summary_note");

  const data = await invokeKimiText({
    systemPrompt: [
      "你是一名中文任务自动执行分类与规划助手。",
      "请根据用户的自然语言输入，判断最适合的自动化类型，并给出可执行方案。",
      "支持的类型：summary_note（总结/笔记）、email_draft（邮件草稿）、web_research（联网调研）、office_doc（办公文档）、calendar_event（日历事件）、ledger_organize（整理账本）、file_organize（文件整理）、ppt_doc（演示稿）。",
      "输出必须是 JSON，且 automation_type 必须是上述英文标识之一，不要返回中文类型名。",
      "plan 的 title/description/steps/risk_warning/estimated_duration 必须为非空字符串。",
      "steps 必须针对具体自动化类型给出 3 条有实质内容的执行步骤，不要返回空泛的\"执行\"步骤。",
      "不要默认 summary_note：如果用户输入包含邮件/调研/PPT/演示/约定/账本/文件/报告/方案等具体意图，必须返回对应的具体类型，不要统一归类为 summary_note。",
      "不要输出解释。",
    ].join("\n"),
    prompt: [
      `用户输入：${execution.originalInput || ""}`,
      `建议采用的执行类型：${preferredType}`,
      buildAttachmentContext(execution),
      "请返回 automation_type、plan（title/description/steps/risk_warning/estimated_duration）以及 requires_approval。",
      preferredType && preferredType !== "summary_note"
        ? `注意：本次输入明显属于 ${preferredType} 类型，请务必将 automation_type 设为 ${preferredType}，并给出对应类型的执行方案。`
        : "",
    ].filter(Boolean).join("\n"),
    responseJsonSchema: planSchema,
    temperature: 0.3,
  });

  const aiType = normalizeAutomationType(data.automation_type);

  // 类型优先级：用户明确指定 > 输入关键词兜底 > AI 返回类型
  // 这样即使 AI 把"早饭12 地铁4..."误判为 calendar_event，关键词兜底仍会纠正为 ledger_organize
  let automationType;
  if (isExplicitSpecificType) {
    automationType = explicitUserType;
  } else if (detectedTypeFromInput && detectedTypeFromInput !== "summary_note") {
    automationType = detectedTypeFromInput;
  } else if (aiType && aiType !== "summary_note") {
    automationType = aiType;
  } else {
    automationType = aiType || detectedTypeFromInput || "summary_note";
  }

  // 中国大陆部署：除邮件草稿外默认不需要二次确认
  const requiresApproval = automationType === "email_draft" ? true : Boolean(data.requires_approval);

  const rawPlan = data.plan || {};
  const steps = Array.isArray(rawPlan.steps)
    ? rawPlan.steps.filter((s) => s?.name && s?.detail)
    : [];

  const fallback = buildDefaultPlan(automationType, execution);
  const plan = {
    title: String(rawPlan.title || fallback.title).trim(),
    description: String(rawPlan.description || fallback.description).trim(),
    steps: steps.length > 0 ? steps : fallback.steps,
    risk_warning: String(rawPlan.risk_warning || fallback.risk_warning).trim(),
    estimated_duration: String(rawPlan.estimated_duration || fallback.estimated_duration).trim(),
  };

  return {
    automation_type: automationType,
    plan,
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

// 将联网搜索答案里 [^N]: [title](url) 形式的引用提取为 {title, url} 列表
function extractInlineReferences(answerText) {
  if (typeof answerText !== "string" || !answerText.trim()) return [];
  const refs = [];
  const seen = new Set();
  const re = /\[\^(\d+)\]:\s*(.+?)(?=\n\[\^|\n*$)/gs;
  let m;
  while ((m = re.exec(answerText)) !== null) {
    const line = m[2].trim();
    const linkMatch = line.match(/\[([^\]]*)\]\(([^)]+)\)/);
    if (linkMatch) {
      const title = linkMatch[1].trim();
      const url = linkMatch[2].trim();
      if (url && !seen.has(url)) {
        seen.add(url);
        refs.push({ title: title || url, url });
      }
    }
  }
  return refs;
}

// AI 经常把 JSON key 写成中文，这里做兼容映射
function normalizeResearchData(raw) {
  const keyMap = {
    调研主题: "topic",
    主题: "topic",
    标题: "topic",
    执行摘要: "executive_summary",
    摘要: "executive_summary",
    关键结论: "key_findings",
    核心发现: "key_findings",
    主要发现: "key_findings",
    关键发现: "key_findings",
    建议: "recommendations",
    行动建议: "recommendations",
    参考链接: "references",
    参考资料: "references",
    参考文献: "references",
    章节: "sections",
    报告正文: "markdown",
    正文: "markdown",
    完整报告: "markdown",
  };
  const normalized = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const enKey = keyMap[k] || k;
    normalized[enKey] = v;
  }
  return normalized;
}

async function handleWebResearch(execution) {
  const search = await invokeKimiWebSearch({ query: execution.originalInput || "" });
  const inlineRefs = extractInlineReferences(search.answer);

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

  const dataRaw = await invokeKimiText({
    systemPrompt: [
      "你是一名中文研究助理。请根据联网搜索结果撰写结构化调研报告。",
      "输出必须是 JSON，且顶层字段必须是英文：topic、executive_summary、key_findings、recommendations、sections、references、markdown。",
      "sections 每个元素包含 heading 和 body（body 为 Markdown 格式）。",
      "references 为 URL 字符串数组。",
      "markdown 为完整报告正文（Markdown 格式），必须包含实质性内容，不要为空。"
    ].join("\n"),
    prompt: [
      `研究主题：${execution.originalInput || ""}`,
      "联网搜索摘要：",
      search.answer || "",
      "参考链接：",
      ...inlineRefs.map((r) => `- ${r.title || ""}: ${r.url || ""}`),
    ].join("\n"),
    responseJsonSchema: schema,
    temperature: 0.3,
  });

  const data = normalizeResearchData(dataRaw);

  const title = sanitizeResearchTitle(
    data.topic || execution.taskTitle || "调研报告",
    execution.originalInput,
    execution.taskTitle
  );
  let markdown = String(data.markdown || "").trim();
  const summary = String(data.executive_summary || "").trim();

  if (!title || (!summary && !markdown)) {
    throw new Error("AI 未生成有效调研内容，请重试");
  }

  if (!markdown) {
    markdown = [`# ${title}`, "", "## 执行摘要", summary].join("\n");
    if (Array.isArray(data.sections) && data.sections.length > 0) {
      for (const s of data.sections) {
        markdown += `\n\n## ${s.heading}\n${s.body || ""}`;
      }
    }
  }

  const { fileName, fileUrl } = saveMarkdownAsHtml({ title, markdown, execution, type: "web_research" });

  const references = Array.isArray(data.references)
    ? data.references
    : (inlineRefs.length > 0 ? inlineRefs.map((r) => r.url).filter(Boolean) : []);

  return {
    type: "web_research",
    preview: summary.slice(0, 120),
    data: {
      title,
      topic: title,
      executive_summary: summary,
      key_findings: Array.isArray(data.key_findings) ? data.key_findings.filter(Boolean) : [],
      recommendations: Array.isArray(data.recommendations) ? data.recommendations.filter(Boolean) : [],
      sections: Array.isArray(data.sections) ? data.sections.filter((s) => s?.heading && s?.body) : [],
      references,
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
      title: { type: "string", description: "演示稿标题" },
      subtitle: { type: "string", description: "副标题" },
      theme: { type: "string", enum: ["business", "minimal", "tech"], description: "主题风格" },
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string", description: "幻灯片标题" },
            title: { type: "string", description: "幻灯片标题（与 heading 兼容）" },
            bullets: { type: "array", items: { type: "string" }, description: "要点列表" },
            body: { type: "string", description: "正文段落" },
            images: { type: "array", items: { type: "object", properties: { url: { type: "string" }, caption: { type: "string" } } }, description: "图片" },
            layout: { type: "string", enum: ["cover", "agenda", "section-divider", "quote", "stats", "timeline", "comparison", "image-full", "image-left", "image-right", "cards", "two-column", "closing"], description: "版式" }
          },
        },
      },
    },
    required: ["title", "slides"],
  };

  const data = await invokeKimiText({
    systemPrompt: [
      "你是一名中文演示稿助手。请根据用户输入生成可直接渲染的幻灯片数据。",
      "要求：1) title 必须是非空标题；2) slides 至少包含 3 页，第一页为封面，最后一页为结尾；3) 每页建议包含 heading（或 title）、bullets 要点；4) 输出必须是 JSON。"
    ].join("\n"),
    prompt: `用户输入：${execution.originalInput || ""}${buildAttachmentContext(execution)}`,
    responseJsonSchema: schema,
    temperature: 0.3,
  });

  const title = String(data.title || execution.taskTitle || "演示文稿").trim();
  const subtitle = String(data.subtitle || "").trim();
  const theme = ["business", "minimal", "tech"].includes(data.theme) ? data.theme : "business";
  const rawSlides = Array.isArray(data.slides) ? data.slides : [];
  if (rawSlides.length === 0) {
    throw new Error("AI 未生成有效幻灯片内容，请重试");
  }

  // 兼容 title/heading 字段，并确保每页有基本结构
  const slides = rawSlides.map((s) => ({
    heading: String(s.heading || s.title || "").trim(),
    bullets: Array.isArray(s.bullets) ? s.bullets.filter((b) => typeof b === "string" && b.trim()) : [],
    body: String(s.body || "").trim(),
    images: Array.isArray(s.images) ? s.images.filter((im) => im?.url) : [],
    layout: s.layout || undefined,
  }));

  const pptData = { title, subtitle, theme, slides };
  const { fileName, fileUrl } = savePptHtml({ data: pptData, execution, fileBaseName: title });

  return {
    type: "ppt_doc",
    preview: title,
    data: {
      title,
      subtitle,
      theme,
      slides,
      file_name: fileName,
      file_url: fileUrl,
    },
    diff: [{ action: "create", target: fileName, detail: "已生成演示稿 HTML" }],
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
