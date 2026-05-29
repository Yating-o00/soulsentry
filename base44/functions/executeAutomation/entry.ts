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

// === 关键修复(2026-05-29)===
// 原版调用 base44.functions.invoke('invokeKimi') —— 走 base44 平台 axios,
// 会因 base44 平台 quota(Rate limit exceeded)整体卡住几分钟,导致 plan/执行 500。
// 新版:无附件时直连 Moonshot,有附件才走 invokeKimi(因为它内置文件抽取)。
async function callKimi(base44, prompt, response_json_schema, system_prompt, file_urls) {
  const hasFiles = Array.isArray(file_urls) && file_urls.length > 0;
  if (!hasFiles) {
    const apiKey = (Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY") || "").trim();
    if (!apiKey) throw new Error('KIMI_API_KEY 未配置');
    const wantsJson = !!response_json_schema;
    let sys = system_prompt || "你是一位专业、贴心的 AI 助手。";
    if (wantsJson) sys += `\n\n⚠️ 你必须返回一个【符合下方 Schema 的 JSON 实例对象】，而不是返回 Schema 本身。\n- 正确：直接输出 schema 中 properties 描述的真实字段及其真实取值，例如 schema 中要求 {subject,body} 就输出 {"subject":"...","body":"..."}。\n- 禁止：① 不要输出 {"type":"object","properties":{...}} 这种 schema 元描述；② 不要画蛇添足把所有字段塞到额外的 wrapper 对象里（如 {"plan":{...}}、{"data":{...}}），除非 schema 明确要求这种嵌套。\n\nSchema 参考：\n${JSON.stringify(response_json_schema)}`;
    const models = ["kimi-latest", "kimi-k2-0905-preview", "moonshot-v1-auto"];
    let resp = null, lastErr = '', lastStatus = 0;
    for (const m of models) {
      const body = { model: m, messages: [{ role: "system", content: sys }, { role: "user", content: prompt }], temperature: 0.4 };
      if (wantsJson) body.response_format = { type: "json_object" };
      try {
        resp = await fetch("https://api.moonshot.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
        if (resp.ok) break;
        lastErr = await resp.text(); lastStatus = resp.status;
        if (resp.status !== 404 && resp.status !== 403) break;
      } catch (e) { lastErr = e?.message || String(e); lastStatus = 0; }
    }
    if (!resp || !resp.ok) throw new Error(`Kimi API ${lastStatus}: ${String(lastErr).slice(0, 200)}`);
    const j = await resp.json();
    const content = j.choices?.[0]?.message?.content || "";
    if (wantsJson) {
      try { return JSON.parse(content); } catch {
        const m = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (m) { try { return JSON.parse(m[1]); } catch {} }
        return { _raw: content, _parse_error: true };
      }
    }
    return { text: content };
  }
  // 有附件 → 仍走 invokeKimi (内置文件抽取/视觉)
  const MAX = 4; let res, lastErr;
  for (let i = 0; i < MAX; i++) {
    try {
      res = await base44.functions.invoke('invokeKimi', { prompt, response_json_schema, system_prompt, temperature: 0.4, file_urls });
      lastErr = null; break;
    } catch (e) {
      const st = e?.response?.status; const am = e?.response?.data?.error || e?.response?.data?.message || '';
      if ((st === 429 || /rate limit/i.test(am) || /rate limit/i.test(e?.message || '')) && i < MAX - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); continue;
      }
      lastErr = e; break;
    }
  }
  if (lastErr) {
    const am = lastErr?.response?.data?.error || lastErr?.response?.data?.message;
    if (am) throw new Error(`AI 调用失败(HTTP ${lastErr?.response?.status}):${am}`);
    throw lastErr;
  }
  const data = res?.data || {};
  if (data?.error && !data?._doc_extract_failed) throw new Error(`AI 调用失败:${data.error}${data.message ? ' — ' + data.message : ''}`);
  return data;
}

// ========== AI 点数计费（固定单价，与 components/credits/creditConfig 保持一致）==========
const AUTOMATION_EXECUTE_COSTS = {
  plan: 5,
  email_draft: 15,
  summary_note: 20,
  calendar_event: 20,
  file_organize: 20,
  office_doc: 50,
  web_research: 60,
  ppt_doc: 80,
  default: 20,
};

function getAutomationCost(key) {
  return AUTOMATION_EXECUTE_COSTS[key] ?? AUTOMATION_EXECUTE_COSTS.default;
}

// 余额校验：不足则抛出标准化错误（前端可识别 INSUFFICIENT_CREDITS）
async function ensureCredits(base44, user, requiredCredits) {
  const balance = user?.ai_credits ?? 0;
  if (balance < requiredCredits) {
    const err = new Error(`AI 点数不足，需要 ${requiredCredits} 点，当前余额 ${balance} 点`);
    err.code = 'INSUFFICIENT_CREDITS';
    err.required = requiredCredits;
    err.balance = balance;
    throw err;
  }
}

// 成功后扣费 + 写流水（失败/取消不扣费）
async function chargeCredits(base44, userId, cost, featureKey, description) {
  try {
    const fresh = await base44.asServiceRole.entities.User.get(userId);
    const current = fresh?.ai_credits ?? 0;
    const newBalance = Math.max(0, current - cost);
    await base44.asServiceRole.entities.User.update(userId, { ai_credits: newBalance });
    await base44.asServiceRole.entities.AICreditTransaction.create({
      type: 'consume',
      amount: -cost,
      balance_after: newBalance,
      feature: featureKey,
      description: description || `自动执行消耗 ${cost} 点`,
    });
    return newBalance;
  } catch (e) {
    console.warn('[executeAutomation] chargeCredits failed:', e?.message || e);
    return null;
  }
}

// 读取用户上传的参考文件，转为可被 LLM 理解的文本上下文
// 文本/表格/PDF → 用 ExtractDataFromUploadedFile 抽内容；图片 → 收集 URL 走视觉模型
async function buildAttachmentContext(base44, exec) {
  const files = exec?.ai_parsed_result?.attached_files;
  console.log(`[buildAttachmentContext] exec=${exec?.id} attached_files count=${Array.isArray(files) ? files.length : 'N/A'}`);
  if (!Array.isArray(files) || files.length === 0) {
    return { text: '', imageUrls: [], images: [], hasFiles: false };
  }
  console.log(`[buildAttachmentContext] files:`, files.map(f => ({ name: f?.file_name, type: f?.file_type, url: f?.file_url?.slice(0, 80) })));
  // 区分图片 vs 普通文件，分别并发处理（避免多张图片串行超时）
  const imageFiles = [];
  const docFiles = [];
  for (const f of files) {
    if (!f?.file_url) continue;
    const isImage = /^image\//i.test(f.file_type || '') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.file_name || '');
    (isImage ? imageFiles : docFiles).push(f);
  }

  // 并发：图片视觉识别 —— 优先用 Kimi vision，失败再回退到 Gemini
  // 关键：同时做"OCR 文字提取"和"外观描述"。如果图片是文档截图/聊天记录/访谈记录，
  // OCR 出来的文字才是真正可用于会议纪要/笔记整理的素材。
  const imgResults = await Promise.all(imageFiles.map(async (f) => {
    const visionPrompt = `请仔细分析这张图片，严格按以下两部分输出（中间用一行 "---" 分隔，不要省略任何一部分）：

【第一部分：文字 OCR】
逐行抄录图片中【所有肉眼可见的中文/英文/数字文字】，原样保留段落、对话、列表、表格的结构；可见的人名/角色名/时间戳/标题/数字都要保留。如果图片里没有任何文字，本部分写"（图片无可见文字）"。

---

【第二部分：外观描述】
按以下要点用 4-6 句中文描述：
1) 主体物品的种类、颜色、形状、材质质感；
2) 表面是否有【可见的图案、烫印、纹路】（注意：纯文字内容已经在第一部分写过，这里不要重复）；
3) 可见的配件、物品摆放，逐项列出；
4) 整体氛围、背景、拍摄角度；
5) 画面里出现任何水印或 AI 生成标签请明确指出。
⚠️ 严禁编造图片里没出现的元素。看不清的部分写"看不清"。`;
    let description = '';
    // ① Kimi vision（首选）
    try {
      const kimiRes = await base44.functions.invoke('invokeKimi', {
        prompt: visionPrompt,
        file_urls: [f.file_url],
        temperature: 0.1,
      });
      const t = kimiRes?.data?.text || kimiRes?.data?.content || '';
      if (t && String(t).trim().length > 10) description = String(t).trim();
    } catch (_) { /* fallthrough */ }
    // ② Gemini 兜底
    if (!description) {
      try {
        const visionRes = await base44.integrations.Core.InvokeLLM({
          prompt: visionPrompt,
          file_urls: [f.file_url],
          model: 'gemini_3_1_pro',
        });
        const desc = typeof visionRes === 'string' ? visionRes : (visionRes?.text || visionRes?.data || '');
        description = String(desc).trim();
      } catch (e) {
        description = `(视觉识别失败:${e.message})`;
      }
    }
    return { f, description };
  }));

  // 并发：文档抽取 —— 三级兜底：① ExtractDataFromUploadedFile（Word/Excel/PDF/CSV）；② Kimi（原生文件理解，对老 Office 格式更稳）；③ Gemini 视觉模型；任一成功即用。
  // 关键：每一层都用 try/catch 包住，确保单文件失败不会把整次 plan 阶段崩成 500。
  const docResults = await Promise.all(docFiles.map(async (f) => {
    let text = '';
    const errors = [];

    // ① 平台原生文件抽取
    try {
      const ext = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: f.file_url,
        json_schema: { type: 'object', properties: { raw_text: { type: 'string', description: '完整原文，按段落拼接为纯文本，不省略任何信息' } }, required: ['raw_text'] },
      });
      if (ext?.status === 'success') {
        const raw = ext.output?.raw_text || (typeof ext.output === 'string' ? ext.output : '');
        if (raw && String(raw).trim().length > 10) text = String(raw);
      } else if (ext?.details) {
        errors.push(`Extract: ${ext.details}`);
      }
    } catch (e) { errors.push(`Extract: ${e?.message || e}`); }

    // ② Kimi 原生文件理解（对 .doc/.docx/.pdf 兼容性更好）
    if (!text) {
      try {
        const kimiRes = await base44.functions.invoke('invokeKimi', {
          prompt: `请把这个文件的完整内容以纯文本形式抽取出来，保留结构（表格用 Markdown 表格），不要总结，不要省略。如果是会议纪要/名单/列表，逐行输出。`,
          file_urls: [f.file_url],
          temperature: 0.1,
        });
        const raw = kimiRes?.data;
        // 关键：如果 invokeKimi 返回 _doc_extract_failed，说明 Kimi 自己也没拿到文件正文，
        // 此时 .text 字段是模型"我无法访问"之类的客套话，绝不能当真，直接跳过进入下一级兜底
        if (raw?._doc_extract_failed || raw?.error === 'DOC_EXTRACT_FAILED') {
          errors.push(`Kimi: doc_extract_failed (${(raw?.details || []).join('; ').slice(0, 200)})`);
        } else {
          const t = typeof raw === 'string' ? raw : (raw?.text || raw?.content || raw?.raw_text || '');
          if (t && String(t).trim().length > 10) text = String(t);
        }
      } catch (e) { errors.push(`Kimi: ${e?.message || e}`); }
    }

    // ③ Gemini 视觉模型兜底（能读扫描件/图片型 PDF）
    if (!text) {
      try {
        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `请把这个文件的完整内容以纯文本形式抽取，保留结构（表格用 Markdown 表格），不要总结。`,
          file_urls: [f.file_url],
          model: 'gemini_3_1_pro',
        });
        text = typeof res === 'string' ? res : (res?.text || res?.data || '');
      } catch (e) { errors.push(`Gemini: ${e?.message || e}`); }
    }

    if (!text) {
      console.warn(`[buildAttachmentContext] doc extract failed for "${f.file_name}":`, errors);
      text = `(附件「${f.file_name}」无法解析。错误：${errors.join(' | ') || '未知'}；建议用户改用 .txt 或复制内容到任务描述中)`;
    } else {
      console.log(`[buildAttachmentContext] doc "${f.file_name}" extracted ${String(text).length} chars`);
    }
    return { f, text: String(text).slice(0, 8000) };
  }));

  const textChunks = [];
  const imageUrls = [];
  const images = [];
  for (const { f, description } of imgResults) {
    imageUrls.push(f.file_url);
    images.push({ url: f.file_url, name: f.file_name || '图片', description });
    textChunks.push(`【图片附件:${f.file_name}】\nURL:${f.file_url}\n内容描述:${description}`);
  }
  for (const { f, text } of docResults) {
    textChunks.push(`【附件:${f.file_name}】\n${text}`);
  }


  // 给 AI 的图片使用说明：要求在正文中以 Markdown 图片语法嵌入
  const imageGuide = images.length > 0
    ? `\n\n=== 图片嵌入指引（重要） ===\n用户上传了 ${images.length} 张图片，请在生成的正文中合适位置用 Markdown 图片语法 ![描述](url) 完整嵌入它们，并配上文字说明（如"如图所示..."、"下图展示了..."）。可用图片清单：\n${images.map((img, i) => `${i + 1}. ![${(img.description || img.name).slice(0, 50)}](${img.url})\n   名称：${img.name}\n   内容描述：${img.description}`).join('\n')}\n务必：每张图片至少使用一次完整的 ![描述](url) Markdown 语法，不要省略 url，不要只写文字描述。\n`
    : '';

  return {
    text: textChunks.length ? `\n\n=== 用户上传的参考文件 ===\n${textChunks.join('\n\n')}\n=== 文件结束 ===${imageGuide}\n` : '',
    imageUrls,
    images,
    hasFiles: true,
  };
}

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    automation_type: {
      type: "string",
      enum: ["email_draft", "file_organize", "web_research", "office_doc", "ppt_doc", "calendar_event", "summary_note", "ledger_organize", "none"]
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

async function generatePlan(base44, exec, attachmentCtx) {
  const userInput = exec.original_input || exec.task_title;
  const fileHint = attachmentCtx?.hasFiles
    ? `\n\n用户随指令上传了参考文件，方案设计时务必考虑如何利用这些文件内容。${attachmentCtx.text}`
    : '';
  const planRes = await callKimi(
    base44,
    `用户希望心栈自动帮他完成的事项：${userInput}${fileHint}\n\n请分析这是哪种自动执行类型，并给出清晰的执行方案。\n\n【automation_type 选择铁律】\n- summary_note：基于附件内容生成会议纪要/笔记/总结/复盘/读书笔记/访谈记录等"内容产出型"任务（有附件 + 要产出文档默认走这里）。\n- office_doc：生成提案、方案、合同、报告、说明书等结构化办公文档。\n- ppt_doc：生成演示稿/幻灯片/PPT。\n- web_research：联网调研/搜集资料/对比分析。\n- email_draft：写邮件/发邮件（requires_approval=true）。\n- file_organize：**只**用于"对现有文件批量重命名/归档分类"——例如"把我所有发票按月份归档"。⚠️ 当用户带着附件要求"整理成XX/写成XX/转换成XX"时，这是【内容生产】不是【文件整理】，必须选 summary_note 或 office_doc，禁止选 file_organize。\n- ledger_organize：把混乱的记账文本（语音转写、聊天碎片、银行流水、随手记账）整理成结构化账本。任何同时包含【金额数字（如 12 / 9.9 / ¥58 / 块/元）】和【消费/收入描述（如 早饭/咖啡/工资/转给）】的指令，都应该选这个，而不是 summary_note。\n- calendar_event：创建日历事件/约定。\n\n注意：发送邮件/删除文件等不可逆操作 requires_approval 必须为 true。`,
    PLAN_SCHEMA,
    "你是心栈 SoulSentry 的自动执行规划官，负责把用户的自然语言指令转换成结构化执行方案。要简洁、具体、可执行。严格遵守 automation_type 选择铁律：带附件要求生成纪要/总结/笔记的，一律选 summary_note，不要选 file_organize。"
  );

  if (planRes._parse_error || !planRes.automation_type) { const dbg = JSON.stringify(planRes).slice(0, 600); console.error('[generatePlan] bad output:', dbg); throw new Error(`AI 方案生成失败:${planRes?._parse_error ? '非JSON' : '缺automation_type'} | raw=${dbg.slice(0, 200)}`); }

  return planRes;
}

// 收集与当前邮件任务关联的可作附件的产物：
// 1) 同一 task_id 下其它已完成的 TaskExecution（PPT/调研/办公文档/复盘等）的 file_url
// 2) 关联 Task 自身的 attachments
async function collectEmailAttachments(base44, exec) {
  const attachments = [];
  const seen = new Set();

  const push = (file_url, file_name, mime_type, source) => {
    if (!file_url || seen.has(file_url)) return;
    seen.add(file_url);
    attachments.push({ file_url, file_name: file_name || file_url.split('/').pop(), mime_type, source });
  };

  if (exec.task_id) {
    try {
      const siblings = await base44.entities.TaskExecution.filter(
        { task_id: exec.task_id, execution_status: 'completed' },
        '-completed_at',
        10
      );
      for (const s of siblings) {
        if (s.id === exec.id) continue;
        const d = s.automation_result?.data;
        if (d?.file_url) {
          push(d.file_url, d.file_name, null, s.automation_type || s.task_title);
        }
      }
    } catch (e) {
      console.warn('collect siblings failed', e.message);
    }

    try {
      const task = await base44.entities.Task.get(exec.task_id);
      if (Array.isArray(task?.attachments)) {
        task.attachments.forEach(a => push(a.file_url, a.file_name, a.file_type, '任务附件'));
      }
    } catch (e) {
      // ignore
    }
  }

  return attachments;
}

async function executeEmailDraft(base44, exec, attachmentCtx) {
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

  // 先收集附件候选
  const attachments = await collectEmailAttachments(base44, exec);
  const attachmentBrief = attachments.length > 0
    ? attachments.map((a, i) => `${i + 1}. ${a.file_name}（来源：${a.source || '未知'}）`).join('\n')
    : '（无）';

  const todayCN = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' });
  const userFileBlock = attachmentCtx?.text || '';
  let data = await callKimi(
    base44,
    `当前日期：${todayCN}（请在邮件落款日期处使用这个真实日期，不要编造其它日期）\n\n该任务下已生成的产物（将随邮件作为附件发送）：\n${attachmentBrief}${userFileBlock ? `\n\n用户上传的参考文件（请基于其内容撰写邮件正文，可以引用其中的具体信息）：${userFileBlock}` : ''}\n\n请根据用户指令生成一封专业邮件草稿（注意：仅生成草稿，等待用户确认后才会发送）：\n${exec.original_input || exec.task_title}\n\n若有附件，请在正文中自然提及"附件"，但不要罗列附件名。\n\n⚠️ 直接返回 {to, to_name, cc, subject, body, tone}，不要包 wrapper。subject 和 body 必须填，绝不能漏。`,
    schema,
    `你是专业商务邮件助手。今日日期：${todayCN}。要求：1) 主题精炼，10字内最好；2) 正文结构清晰，含问候、正文、署名；3) 若需写落款日期，必须使用今日真实日期，禁止编造历史日期；4) 根据指令推断语气（正式/友好/简洁）；5) 收件人未指明则留空，由用户在确认时填写。⚠️ subject 和 body 都必须填，绝不能漏。`
  );
  // 防御兜底：Kimi 偶尔会把字段塞到 wrapper(plan/data/email),自动解包;仍缺字段则报错
  if (data && (!data.subject || !data.body)) for (const k of ['plan','data','email','draft','result']) if (data[k]?.subject && data[k]?.body) { data = data[k]; break; }
  if (!data?.subject || !data?.body) throw new Error(`AI 生成的邮件缺少必要字段(subject/body),请重试。AI 返回:${JSON.stringify(data||{}).slice(0,300)}`);
  const previewLines = [
    `📧 主题：${data.subject}`,
    `收件人：${data.to || '（待用户填写）'}`,
  ];
  if (data.cc) previewLines.push(`抄送：${data.cc}`);
  if (data.tone) previewLines.push(`语气：${data.tone}`);
  if (attachments.length > 0) {
    previewLines.push(`📎 附件：${attachments.map(a => a.file_name).join('、')}`);
  }
  previewLines.push('', data.body, '', '⚠️ 此为草稿，需在弹窗中确认后才会真正发送。');

  return {
    type: "email_draft",
    preview: previewLines.join('\n'),
    data: { ...data, attachments }
  };
}

async function executeWebResearch(base44, exec, attachmentCtx) {
  const userText = exec.original_input || exec.task_title;
  const fileBlock = attachmentCtx?.text || '';

  // 1. 真实联网爬取（Kimi $web_search）—— 失败时静默回退到纯知识库，
  //    但把真实错误记录到日志，避免出现"Request failed with status code 400"这种泛化错误被一路冒泡
  let answer = '';
  let references = [];
  try {
    const res = await base44.functions.invoke('kimiWebBrowse', { query: userText, language: 'zh' });
    answer = res?.data?.answer || '';
    references = Array.isArray(res?.data?.references) ? res.data.references : [];
  } catch (e) {
    const apiErr = e?.response?.data?.error || e?.message || 'unknown';
    console.warn('[executeWebResearch] kimiWebBrowse failed, fallback to knowledge-only:', apiErr);
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
    `调研主题：${userText}${fileBlock ? `\n\n用户上传的参考文件（这是调研的核心输入，请深入分析其中每一条/每一项）：${fileBlock}` : ''}\n\n以下是联网搜索得到的原始资料：\n\n${answer || '（搜索未返回内容）'}\n\n参考来源：\n${sourcesText}\n\n请基于以上资料${fileBlock ? '（尤其是用户上传的文件）' : ''}生成一份结构清晰、内容深入的调研报告。每节正文请用 Markdown 编写，必要时引用上面的来源编号。`,
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
  const baseName = `${new Date().toISOString().slice(0, 10)}_${safeTopic}_调研报告`;

  // 调研报告固定输出 html —— 浏览器原生可预览，无需下载
  const format = 'html';
  let content;
  if (format === 'html') {
    content = renderRichHtml({
      title: `调研报告：${research.topic || userText}`,
      subtitle: research.executive_summary,
      sections: research.sections || [],
      keyFindings: research.key_findings || [],
      recommendations: research.recommendations || [],
      references,
    });
  } else if (format === 'txt') {
    content = renderPlainText({
      title: `调研报告：${research.topic || userText}`,
      subtitle: research.executive_summary,
      sections: research.sections || [],
      keyFindings: research.key_findings || [],
      recommendations: research.recommendations || [],
      references,
    });
  } else {
    content = markdown;
  }
  const { file_url: fileUrl, file_name: fileName } = await uploadDocFile(base44, baseName, content, format);

  const formatLabel = { md: 'Markdown', txt: '纯文本', html: '富排版 HTML（可打印为 PDF）' }[format];

  return {
    type: "web_research",
    preview: `📄 已生成《${fileName}》\n📐 文件格式：${formatLabel}\n📥 下载链接：${fileUrl}\n\n${research.executive_summary || ''}\n\n${markdown.slice(0, 600)}${markdown.length > 600 ? '\n…（更多内容见文件）' : ''}`,
    data: {
      topic: research.topic,
      file_name: fileName,
      file_url: fileUrl,
      output_format: format,
      executive_summary: research.executive_summary,
      key_findings: research.key_findings,
      recommendations: research.recommendations,
      sections: research.sections,
      references,
      markdown
    },
    diff: [{ action: "create", target: fileName, detail: `${formatLabel} 调研报告（${(research.sections || []).length}节，${references.length}条来源）已上传` }]
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
  const L = [`# ${dateStr} 日终复盘报告`, '', `> 生成时间：${date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`, '', `## 📊 完成项统计`, '', `- 当日已完成任务：**${tasks.length}** 项`];
  const byCat = {}, byPri = {};
  tasks.forEach(t => { byCat[t.category || 'other'] = (byCat[t.category || 'other'] || 0) + 1; byPri[t.priority || 'medium'] = (byPri[t.priority || 'medium'] || 0) + 1; });
  if (Object.keys(byCat).length) L.push(`- 按分类：${Object.entries(byCat).map(([k, v]) => `${k}(${v})`).join(' · ')}`);
  if (Object.keys(byPri).length) L.push(`- 按优先级：${Object.entries(byPri).map(([k, v]) => `${k}(${v})`).join(' · ')}`);
  L.push('', `## ✅ 完成事项明细`, '');
  if (!tasks.length) L.push('_今日暂无已完成任务。_');
  else tasks.forEach((t, i) => {
    const time = t.completed_at ? new Date(t.completed_at).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }) : '-';
    L.push(`${i + 1}. **${t.title}** _(${time} · ${t.category || 'personal'} · ${t.priority || 'medium'})_`);
    if (t.description) L.push(`   - ${t.description.replace(/\n/g, ' ')}`);
  });
  L.push('');
  if (aiSummary) L.push(`## 💡 AI 复盘洞察`, '', aiSummary, '');
  L.push(`---`, `*由心栈 SoulSentry 自动生成*`);
  return L.join('\n');
}

async function uploadMarkdownReport(base44, fileName, markdown) {
  const bytes = new TextEncoder().encode('\uFEFF' + markdown);
  const file = new File([new Blob([bytes], { type: 'text/markdown; charset=utf-8' })], fileName, { type: 'text/markdown; charset=utf-8' });
  const resp = await base44.integrations.Core.UploadFile({ file });
  return resp?.file_url || resp?.data?.file_url;
}

// ========== 多格式文档输出工具 ==========
// 支持：md / txt / html / rtf
// 说明：docx/pdf 由富排版 HTML 替代——浏览器打印即可另存 PDF，Word 可直接打开 .html 转 .docx，
// 内容上比纯 md 更适合带图标、分层、彩色高亮的复杂排版。

// 把 AI 经常输出的"整张表被压成一行"还原成多行：在分隔行处断行，按列数切分单元格
function normalizeInlineTables(raw) {
  let s = String(raw || '');
  // 1) 先在"分隔段"前后插换行（分隔段：连续的 | --- | --- | ...）
  s = s.replace(/(\|\s*:?-{2,}:?\s*)+\|/g, (m) => `\n${m.trim()}\n`);
  // 2) 把分隔段周围多余空白整理
  s = s.replace(/\n{2,}/g, '\n');
  const lines = s.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const isSep = /^\s*\|?\s*(:?-{2,}:?\s*\|\s*){1,}:?-{2,}:?\s*\|?\s*$/.test(cur);
    if (isSep) {
      const colCount = cur.split('|').filter(x => x.trim()).length;
      if (out.length) {
        const prev = out[out.length - 1];
        const prevCells = prev.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
        if (prevCells.length > colCount) {
          out[out.length - 1] = '| ' + prevCells.slice(0, colCount).map(c => c.trim()).join(' | ') + ' |';
          const overflow = prevCells.slice(colCount).map(c => c.trim()).join(' | ');
          if (overflow) lines.splice(i + 1, 0, '| ' + overflow + ' |');
        }
      }
      out.push(cur);
      let j = i + 1;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
        const cells = lines[j].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
        if (cells.length > colCount) {
          const chunks = [];
          for (let k = 0; k < cells.length; k += colCount) {
            chunks.push('| ' + cells.slice(k, k + colCount).join(' | ') + ' |');
          }
          lines.splice(j, 1, ...chunks);
          continue;
        }
        if (cells.every(c => !c)) { lines.splice(j, 1); continue; }
        out.push(lines[j]);
        j++;
      }
      i = j - 1;
      continue;
    }
    out.push(cur);
  }
  return out.join('\n');
}

// 极简 Markdown → HTML（标题/列表/粗体/斜体/段落/分隔线/GFM 表格）
function mdToInlineHtml(md = '') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const raw = String(md || '');
  const trimmedStart = raw.trim();
  // 兜底 1：整段 body 以 HTML 块级标签开头 → 当 HTML 原样返回
  if (/^<(div|section|article|header|footer|h[1-6]|p|table|ul|ol|blockquote|figure|img|span)(\s|>|\/)/i.test(trimmedStart)) {
    return trimmedStart;
  }
  // 兜底 2：body 中只要出现 ≥2 个 HTML 块级标签 → AI 是用 HTML 写的，直接当 HTML，不走 markdown
  // 避免 markdown 解析器把 <div style="...">xxx</div> 转义成 &lt;div style="..."&gt; 字面文本（乱码根源）
  // 注意阈值要低：第一节常见只有 1 对 <div>...</div> 包一段说明，旧阈值 6 会让它落进 markdown 分支被 esc
  const tagMatches = raw.match(/<\/?(div|section|article|header|footer|h[1-6]|p|table|tr|td|th|ul|ol|li|blockquote|figure|img|br|span|strong)(\s|>|\/)/gi);
  if (tagMatches && tagMatches.length >= 2) {
    return raw;
  }
  // 入口预处理：合并被任意空白/换行/全角空格拆散的 markdown 图片
  // ![alt]<空白>(url) → ![alt](url)，确保后续行解析能识别图片
  let normalized = String(md || '').replace(/(!\[[^\]]*\])[\s\u3000]+(\(https?:[^\s)]+\))/g, '$1$2');

  // 抽取并保护合法的 HTML 块（<table>...</table> / <img .../> / <br>），
  // 防止它们被 esc 成字面文本（AI 经常误用 HTML 排版图文表格）
  const htmlPlaceholders = [];
  const stash = (html) => {
    const key = `\u0000HTML${htmlPlaceholders.length}\u0000`;
    htmlPlaceholders.push(html);
    return key;
  };
  // 1) 整段 <table>...</table>
  normalized = normalized.replace(/<table[\s\S]*?<\/table>/gi, (m) => stash(m));
  // 2) 独立 <img ... />
  normalized = normalized.replace(/<img\s[^>]*?>/gi, (m) => {
    // 给 img 补 loading 和样式
    const withAttrs = m.replace(/<img\s/i, '<img loading="lazy" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e2e8f0;margin:8px 0;display:inline-block;vertical-align:middle" ');
    return stash(withAttrs);
  });
  // 3) AI 经常直接吐出整段 HTML 文档结构，把以下常见块级/行内标签整段保护起来原样输出
  //    避免被 esc 转义后渲染成 <div style=...> 字面文本（乱码）
  //    关键：支持【同名嵌套】（如 <div>...<div>...</div>...</div>）——
  //    用一个手写的平衡扫描器，从最外层开始整段抓取，而不是用非贪婪正则（会错配到内层闭合）
  const blockTags = ['div', 'section', 'article', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'ul', 'ol', 'li', 'span', 'strong', 'em', 'b', 'i', 'u', 'a', 'figure', 'figcaption'];
  const stashBalanced = (src, tag) => {
    const openRe = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
    const closeRe = new RegExp(`<\\/${tag}\\s*>`, 'gi');
    let result = '';
    let i = 0;
    while (i < src.length) {
      openRe.lastIndex = i;
      const openMatch = openRe.exec(src);
      if (!openMatch) { result += src.slice(i); break; }
      result += src.slice(i, openMatch.index);
      // 从 openMatch.index 开始扫描，跟踪 depth 直到归零
      let depth = 1;
      let scan = openMatch.index + openMatch[0].length;
      while (depth > 0 && scan < src.length) {
        openRe.lastIndex = scan;
        closeRe.lastIndex = scan;
        const nextOpen = openRe.exec(src);
        const nextClose = closeRe.exec(src);
        if (!nextClose) { scan = src.length; break; }
        if (nextOpen && nextOpen.index < nextClose.index) {
          depth++;
          scan = nextOpen.index + nextOpen[0].length;
        } else {
          depth--;
          scan = nextClose.index + nextClose[0].length;
        }
      }
      const block = src.slice(openMatch.index, scan);
      result += stash(block);
      i = scan;
    }
    return result;
  };
  blockTags.forEach(tag => {
    normalized = stashBalanced(normalized, tag);
  });
  // 4) <br> / <br/>
  normalized = normalized.replace(/<br\s*\/?>/gi, '\n');
  const lines = normalizeInlineTables(normalized).split('\n');
  const out = [];
  let inUl = false, inOl = false, inP = false;
  const closeP = () => { if (inP) { out.push('</p>'); inP = false; } };
  const closeUl = () => { if (inUl) { out.push('</ul>'); inUl = false; } };
  const closeOl = () => { if (inOl) { out.push('</ol>'); inOl = false; } };
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // 图片必须在链接之前匹配
    .replace(/!\[([^\]]*)\]\((https?:[^\s)]+)\)/g, '<figure class="md-figure"><img src="$2" alt="$1" loading="lazy"/><figcaption>$1</figcaption></figure>')
    .replace(/\[(.+?)\]\((https?:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const isTableSep = (s) => /^\s*\|?\s*(:?-{2,}:?\s*\|\s*){1,}:?-{2,}:?\s*\|?\s*$/.test(s);
  const splitRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const line = raw.trimEnd();
    // GFM 表格：当前行有 |，下一行是分隔行
    if (line.includes('|') && li + 1 < lines.length && isTableSep(lines[li + 1])) {
      closeP(); closeUl(); closeOl();
      const header = splitRow(line);
      const rows = [];
      li += 2;
      while (li < lines.length && lines[li].includes('|') && lines[li].trim()) {
        rows.push(splitRow(lines[li]));
        li++;
      }
      li--;
      // 单元格内部排版：① 先抽出 markdown 图片；② 字面 <br> 转真换行；③ ①②③ 等带圈数字前自动断行；④ 多行渲染成<br/>
      const renderCell = (c) => {
        let s = String(c);
        // 先把 HTML 实体形式的 &lt;br&gt; 还原
        s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
        // 还原字面 <br> / <br/> / <br /> （AI 经常误输出）
        s = s.replace(/<br\s*\/?>/gi, '\n');
        // 合并被换行/空白拆散的 markdown 图片：![alt]\n(url) → ![alt](url)
        s = s.replace(/(!\[[^\]]*\])\s+(\()/g, '$1$2');
        // 在 ①②③④⑤⑥⑦⑧⑨⑩⑪⑫ 等圈号前补换行（仅当它不在行首时）
        s = s.replace(/(?<!^|\n)\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])/g, '\n$1');
        // 抽取 markdown 图片 ![alt](url) 渲染为 <img>，其余文本走 esc + bold
        const imgRe = /!\[([^\]]*)\]\((https?:[^\s)]+)\)/g;
        const renderLine = (line) => {
          const parts = [];
          let last = 0; let m;
          while ((m = imgRe.exec(line)) !== null) {
            if (m.index > last) parts.push(esc(line.slice(last, m.index)).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
            parts.push(`<img src="${esc(m[2])}" alt="${esc(m[1] || '')}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e2e8f0;margin:4px 0;display:block"/>`);
            last = m.index + m[0].length;
          }
          if (last < line.length) parts.push(esc(line.slice(last)).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
          imgRe.lastIndex = 0;
          return parts.join('');
        };
        const lines = s.split('\n').map(x => x.trim()).filter(Boolean);
        return lines.map(renderLine).join('<br/>');
      };
      out.push('<table class="md-table"><thead><tr>' +
        header.map(h => `<th>${renderCell(h)}</th>`).join('') +
        '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => `<td>${renderCell(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>');
      continue;
    }
    if (!line.trim()) { closeP(); closeUl(); closeOl(); continue; }
    let m;
    if ((m = line.match(/^#{1,6}\s+(.+)$/))) {
      closeP(); closeUl(); closeOl();
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level}>${inline(m[1])}</h${level}>`);
    } else if (/^---+$/.test(line)) {
      closeP(); closeUl(); closeOl();
      out.push('<hr/>');
    } else if (/^>\s+/.test(line)) {
      closeP(); closeUl(); closeOl();
      out.push(`<blockquote>${inline(line.replace(/^>\s+/, ''))}</blockquote>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.+)$/))) {
      closeP(); closeOl();
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+\.\s+(.+)$/))) {
      closeP(); closeUl();
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (/^!\[[^\]]*\]\(https?:[^\s)]+\)\s*$/.test(line)) {
      // 单行图片：收集连续的图片行，2~3 张并排（Grid），单张则块级 figure
      closeP(); closeUl(); closeOl();
      const imgs = [line];
      while (li + 1 < lines.length) {
        const next = lines[li + 1].trimEnd();
        if (/^!\[[^\]]*\]\(https?:[^\s)]+\)\s*$/.test(next)) {
          imgs.push(next);
          li++;
        } else if (!next.trim()) {
          // 跳过空行继续收集
          const peek = lines[li + 2]?.trimEnd();
          if (peek && /^!\[[^\]]*\]\(https?:[^\s)]+\)\s*$/.test(peek)) {
            imgs.push(peek);
            li += 2;
          } else break;
        } else break;
      }
      if (imgs.length === 1) {
        out.push(inline(imgs[0]));
      } else {
        out.push(`<div class="md-figure-grid cols-${Math.min(imgs.length, 3)}">${imgs.map(s => inline(s)).join('')}</div>`);
      }
    } else {
      closeUl(); closeOl();
      if (!inP) { out.push('<p>'); inP = true; }
      out.push(inline(line));
    }
  }
  closeP(); closeUl(); closeOl();
  let html = out.join('\n');
  // 还原被保护的原始 HTML 块（table / img / br）
  html = html.replace(/\u0000HTML(\d+)\u0000/g, (_, i) => htmlPlaceholders[Number(i)] || '');
  // 给原始 <table> 套上 md-table class 以应用样式（如果还没有 class）
  html = html.replace(/<table(\s)(?![^>]*class=)/gi, '<table class="md-table"$1').replace(/<table>/gi, '<table class="md-table">');
  return html;
}

// 富排版 HTML：图标、层次、彩色高亮、可打印为 PDF
function renderRichHtml({ title, subtitle, sections = [], keyFindings = [], recommendations = [], references = [], accent = '#384877' }) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const findingBlock = keyFindings.length ? `
    <section class="card highlight">
      <h2><span class="icon">⭐</span>关键发现</h2>
      <ol class="num-list">${keyFindings.map(k => `<li>${esc(k)}</li>`).join('')}</ol>
    </section>` : '';
  const recBlock = recommendations.length ? `
    <section class="card accent">
      <h2><span class="icon">💡</span>行动建议</h2>
      <ul class="check-list">${recommendations.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    </section>` : '';
  const refBlock = references.length ? `
    <section class="card muted">
      <h2><span class="icon">🔗</span>参考来源</h2>
      <ol>${references.slice(0, 15).map(r => `<li><a href="${esc(r.url)}" target="_blank">${esc(r.title || r.url)}</a></li>`).join('')}</ol>
    </section>` : '';
  const sectionHtml = sections.map((s, i) => `
    <section class="card">
      <h2><span class="idx">${String(i + 1).padStart(2, '0')}</span>${esc(s.heading)}</h2>
      <div class="body">${mdToInlineHtml(s.body || '')}</div>
    </section>`).join('\n');

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;background:#f8fafc;line-height:1.7;-webkit-font-smoothing:antialiased}
  .page{max-width:880px;margin:0 auto;padding:48px 56px}
  .hero{position:relative;padding:56px 48px;border-radius:24px;background:linear-gradient(135deg,${accent} 0%,${accent}dd 60%,#1e293b 100%);color:#fff;overflow:hidden;margin-bottom:32px;box-shadow:0 20px 60px -20px ${accent}55}
  .hero::before{content:'';position:absolute;right:-80px;top:-80px;width:280px;height:280px;border-radius:50%;background:rgba(255,255,255,.08)}
  .hero::after{content:'';position:absolute;left:-40px;bottom:-60px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.05)}
  .hero h1{position:relative;font-size:34px;font-weight:800;letter-spacing:-.02em;margin:0 0 12px;line-height:1.2}
  .hero .sub{position:relative;font-size:15px;opacity:.85;max-width:60ch}
  .hero .meta{position:relative;margin-top:24px;display:flex;gap:12px;flex-wrap:wrap}
  .hero .chip{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:rgba(255,255,255,.15);backdrop-filter:blur(8px);border-radius:999px;font-size:12px;letter-spacing:.05em}
  .card{background:#fff;border-radius:16px;padding:28px 32px;margin-bottom:20px;box-shadow:0 2px 12px -2px rgba(15,23,42,.06);border:1px solid #e2e8f0}
  .card h2{margin:0 0 16px;font-size:20px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:10px}
  .card h2 .icon{font-size:22px}
  .card h2 .idx{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:${accent}15;color:${accent};font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
  .card .body h3{font-size:16px;color:#334155;margin:20px 0 8px}
  .card .body p{margin:.5em 0;color:#334155}
  .card .body ul,.card .body ol{padding-left:1.4em;color:#334155}
  .card .body li{margin:.3em 0}
  .card .body code{background:#f1f5f9;padding:1px 6px;border-radius:4px;font-size:.9em;color:${accent}}
  .card .body blockquote{margin:1em 0;padding:.6em 1em;border-left:3px solid ${accent};background:${accent}08;color:#475569;border-radius:0 8px 8px 0}
  .card .body .md-table{width:100%;border-collapse:collapse;margin:1em 0;font-size:14px;overflow:hidden;border-radius:8px;border:1px solid #e2e8f0}
  .card .body .md-table th{background:${accent}10;color:${accent};font-weight:700;text-align:left;padding:10px 14px;border-bottom:2px solid ${accent}30;white-space:nowrap}
  .card .body .md-table td{padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top;line-height:1.7;white-space:normal;word-break:break-word}
  .card .body .md-table td br{content:'';display:block;margin:2px 0}
  .card .body .md-table tr:last-child td{border-bottom:0}
  .card .body .md-table tr:nth-child(even) td{background:#f8fafc}
  .card .body .md-figure{margin:1.2em 0;text-align:center}
  .card .body .md-figure img{max-width:100%;height:auto;border-radius:10px;box-shadow:0 4px 20px -8px rgba(15,23,42,.15);border:1px solid #e2e8f0}
  .card .body .md-figure figcaption{margin-top:8px;font-size:13px;color:#64748b;font-style:italic}
  .card .body .md-figure-grid{display:grid;gap:14px;margin:1.2em 0}
  .card .body .md-figure-grid.cols-2{grid-template-columns:repeat(2,1fr)}
  .card .body .md-figure-grid.cols-3{grid-template-columns:repeat(3,1fr)}
  .card .body .md-figure-grid .md-figure{margin:0}
  .card .body .md-figure-grid .md-figure img{aspect-ratio:4/3;object-fit:cover;width:100%}
  @media (max-width:640px){.card .body .md-figure-grid.cols-2,.card .body .md-figure-grid.cols-3{grid-template-columns:1fr}}
  .card.highlight{background:linear-gradient(135deg,#fff7ed,#ffffff);border-color:#fed7aa}
  .card.highlight .num-list{counter-reset:n;list-style:none;padding:0}
  .card.highlight .num-list li{counter-increment:n;padding:10px 0 10px 44px;position:relative;border-bottom:1px dashed #fde68a}
  .card.highlight .num-list li:last-child{border-bottom:0}
  .card.highlight .num-list li::before{content:counter(n);position:absolute;left:0;top:10px;width:32px;height:32px;border-radius:8px;background:#f59e0b;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px}
  .card.accent{background:linear-gradient(135deg,${accent}08,#fff);border-color:${accent}40}
  .card.accent .check-list{list-style:none;padding:0}
  .card.accent .check-list li{padding:8px 0 8px 30px;position:relative}
  .card.accent .check-list li::before{content:'✓';position:absolute;left:0;top:8px;width:22px;height:22px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
  .card.muted{background:#f8fafc}
  .card.muted ol{margin:0;padding-left:1.4em;font-size:13px}
  .card.muted a{color:${accent};text-decoration:none;word-break:break-all}
  .card.muted a:hover{text-decoration:underline}
  .footer{text-align:center;color:#94a3b8;font-size:12px;padding:24px 0 8px;letter-spacing:.05em}
  @media print{
    /* 让浏览器按 A4 纵向打印，并自上而下统一边距，避免不同打印机默认页边距导致左右偏移 */
    @page{size:A4 portrait;margin:14mm 12mm}
    html,body{background:#fff !important;width:100%;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
    /* 容器去掉外边距/最大宽度，让内容铺满 A4 可打印区域 */
    .page{max-width:none;width:100%;margin:0;padding:0}
    /* 封面区不分页切断 */
    .hero{box-shadow:none;border-radius:12px;padding:24px 28px;margin-bottom:14px;page-break-after:avoid;break-after:avoid}
    .hero h1{font-size:24px;margin-bottom:8px}
    .hero .sub{font-size:12px}
    .hero .chip{font-size:10px;padding:4px 10px}
    /* 卡片：去阴影、收紧内边距、整卡不被切断 */
    .card{box-shadow:none !important;border:1px solid #e2e8f0;padding:16px 18px;margin-bottom:12px;border-radius:10px;page-break-inside:avoid;break-inside:avoid}
    .card h2{font-size:15px;margin-bottom:10px}
    .card h2 .idx{width:26px;height:26px;font-size:11px;border-radius:6px}
    .card .body{font-size:11.5px;line-height:1.55}
    .card .body h3{font-size:13px;margin:10px 0 4px}
    .card .body p,.card .body li{font-size:11.5px;line-height:1.55}
    /* 表格：禁止跨页切单元格,允许长内容换行避免横向溢出 */
    .card .body .md-table{font-size:10.5px;page-break-inside:auto;break-inside:auto;table-layout:fixed;width:100%}
    .card .body .md-table th,.card .body .md-table td{padding:6px 8px;word-break:break-word;white-space:normal}
    .card .body .md-table tr{page-break-inside:avoid;break-inside:avoid}
    .card .body .md-table thead{display:table-header-group}
    /* 图片：限制最大高度,避免单张图把一整页吃掉 */
    .card .body img,.card .body .md-figure img{max-width:100% !important;max-height:80mm;height:auto;page-break-inside:avoid;break-inside:avoid}
    .card .body .md-figure{page-break-inside:avoid;break-inside:avoid}
    .card .body .md-figure-grid{page-break-inside:avoid;break-inside:avoid}
    .card .body .md-figure-grid .md-figure img{max-height:55mm}
    /* 列表/段落避免单行孤行 */
    .card .body p,.card .body li{orphans:3;widows:3}
    /* 隐藏屏幕态的页脚说明（PDF 已自带页码） */
    .footer{font-size:10px;color:#94a3b8;padding:8px 0}
  }
</style></head>
<body>
<div class="page">
  <header class="hero">
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
    <div class="meta">
      <span class="chip">📅 ${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span>
      <span class="chip">📑 ${sections.length} 个章节</span>
      ${references.length ? `<span class="chip">🔗 ${references.length} 条来源</span>` : ''}
      <span class="chip">心栈 SoulSentry</span>
    </div>
  </header>
  ${findingBlock}
  ${sectionHtml}
  ${recBlock}
  ${refBlock}
  <div class="footer">由心栈 SoulSentry 自动生成 · 浏览器打印可另存为 PDF</div>
</div>
</body></html>`;
}

function renderPlainText({ title, subtitle, sections = [], keyFindings = [], recommendations = [], references = [] }) {
  const sep = '═'.repeat(48); const L = [sep, `  ${title}`, sep];
  if (subtitle) L.push(subtitle, '');
  L.push(`📅 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`, '');
  if (keyFindings.length) { L.push('━━ ⭐ 关键发现 ━━'); keyFindings.forEach((k, i) => L.push(`  ${i + 1}. ${k}`)); L.push(''); }
  sections.forEach((s, i) => { L.push(`━━ ${String(i + 1).padStart(2, '0')} · ${s.heading} ━━`); L.push(String(s.body || '').replace(/[*_`#>]+/g, '').replace(/^\s*[-*]\s+/gm, '  • '), ''); });
  if (recommendations.length) { L.push('━━ 💡 行动建议 ━━'); recommendations.forEach(r => L.push(`  ✓ ${r}`)); L.push(''); }
  if (references.length) { L.push('━━ 🔗 参考来源 ━━'); references.slice(0, 15).forEach((r, i) => L.push(`  [${i + 1}] ${r.title || r.url}\n      ${r.url}`)); L.push(''); }
  L.push(sep, '由心栈 SoulSentry 自动生成'); return L.join('\n');
}

// 通用上传：根据 format 决定 mime / 扩展名（md/txt/html 三种，rtf 已弃用）
async function uploadDocFile(base44, baseName, content, format) {
  const map = {
    md:   { ext: 'md',   mime: 'text/markdown; charset=utf-8',  bom: true  },
    txt:  { ext: 'txt',  mime: 'text/plain; charset=utf-8',     bom: true  },
    html: { ext: 'html', mime: 'text/html; charset=utf-8',      bom: false },
  };
  const cfg = map[format] || map.md;
  const payload = cfg.bom ? '\uFEFF' + content : content;
  const bytes = new TextEncoder().encode(payload);
  const blob = new Blob([bytes], { type: cfg.mime });
  const fileName = `${baseName}.${cfg.ext}`;
  const file = new File([blob], fileName, { type: cfg.mime });
  const resp = await base44.integrations.Core.UploadFile({ file });
  return { file_url: resp?.file_url || resp?.data?.file_url, file_name: fileName, format };
}

// 是否走"会议纪要 / 智能笔记整理"分支：关键词命中或附件里出现 Q:/参会人/会议
function isMinutesTask(userText, attachmentCtx) {
  const t = String(userText || '');
  if (/会议|纪要|参会|minutes|笔记整理|整理笔记|结构化笔记|访谈/i.test(t)) return true;
  const ftxt = String(attachmentCtx?.text || '');
  if (/参会人[：:]|出席[：:]|(^|\n)Q[：:]/m.test(ftxt)) return true;
  return false;
}

async function executeSummaryNote(base44, exec, attachmentCtx) {
  const userText = exec.original_input || exec.task_title;
  const fileBlock = attachmentCtx?.text || '';

  // === 分支 0：会议纪要 / 智能笔记整理 —— 走专用渲染器（独立 backend function）===
  if (isMinutesTask(userText, attachmentCtx)) {
    console.log(`[executeSummaryNote] enter minutes branch, fileBlock len=${fileBlock.length}, hasFiles=${!!attachmentCtx?.hasFiles}`);
    // fileBlock 已经是 buildAttachmentContext 通过 InvokeLLM 抽取出的真实纯文本，
    // 直接喂给 renderMinutesNote 即可。不要传 file_urls：Kimi 是文本模型，
    // 接到 file_urls 会被当 image_url 处理，反而读不到 Word/PDF 正文，导致编造。
    const res = await base44.functions.invoke('renderMinutesNote', {
      user_text: userText,
      file_block: fileBlock,
    });
    const d = res?.data || {};
    console.log(`[executeSummaryNote] renderMinutesNote status=${res?.status}, has file_url=${!!d?.file_url}, sections=${(d?.sections || []).length}, error=${d?.error || 'none'}`);
    if (d && d.file_url && Array.isArray(d.sections) && d.sections.length > 0) {
      return {
        type: "summary_note",
        preview: `📝 已生成《${d.file_name}》\n👥 参会人：${(d.meta?.attendees || []).slice(0, 6).join('、') || '未识别'}\n📑 ${(d.sections || []).length} 个章节 · ${(d.timeline || []).length} 个时间节点\n📥 ${d.file_url}\n\n${d.plain_preview || ''}`,
        data: { ...d, output_format: 'html', variant: 'minutes' },
        diff: [
          { action: "create", target: d.file_name, detail: `会议纪要（${(d.sections || []).length} 节）已生成` },
          { action: "create", target: `心签索引：${d.title}`, detail: "已归档到心签库" },
        ],
      };
    }
    // renderMinutesNote 失败 —— 直接报错，不再静默生成空骨架
    const errCode = d?.error || 'UNKNOWN';
    const errMsg = d?.message || 'AI 未能从附件中提取到有效内容';
    const fileHint = attachmentCtx?.hasFiles
      ? `（已读取 ${(attachmentCtx.text || '').length} 字符的附件内容，但 AI 解析为空）`
      : `（未读取到任何附件——请确认上传的文件是否在「📎」按钮里成功添加）`;
    throw new Error(`会议纪要整理失败：${errMsg}${fileHint}。错误码：${errCode}`);
  }

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

  // === 分支 B：普通总结 —— 短→心签，长→Word 风格文档 ===
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      length_estimate: { type: "string", enum: ["short", "long"], description: "短(<=400字单一主题)走心签；长文/多章节/含会议要点-结论-行动-风险分区/含表格走 long" },
      content: { type: "string", description: "短文 Markdown（length_estimate=short 时填）" },
      subtitle: { type: "string", description: "长文一句话副标题（可选）" },
      sections: {
        type: "array",
        description: "长文章节（length_estimate=long 时填）",
        items: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading", "body"] }
      },
      tags: { type: "array", items: { type: "string" } }
    },
    required: ["title", "length_estimate", "tags"]
  };

  const hasAttachments = !!attachmentCtx?.hasFiles;
  const wantsDoc = /word|文档|文件|长文|报告|结构化|条理|分区|分明/i.test(userText);
  const hint = (hasAttachments || wantsDoc)
    ? `\n判断指引：用户${hasAttachments ? '上传了参考文件' : '希望生成文档'}，请优先 long（结构化章节），完整覆盖关键内容。`
    : '';

  const data = await callKimi(
    base44,
    `请把以下内容整理成条理分明的总结。${hasAttachments ? '务必先完整阅读上传文件，基于真实内容整理（不遗漏人名/时间/数据/清单），不编造未出现的信息。' : ''}${hint}

用户指令：${userText}${fileBlock ? `\n\n用户上传的参考文件（核心输入）：${fileBlock}` : ''}

要求：1) 判断 length_estimate；2) 若 long：3~8 节，body 用 Markdown（子标题/列表/必要时表格/emoji 分区）；3) 若 short：仅写 content (≤400字)；4) tags 给 2~5 个。`,
    schema,
    "你是用户的思维整理助手。当用户提供附件时，必须基于附件真实内容生成结构化总结。"
  );

  const isLong = data.length_estimate === "long" && Array.isArray(data.sections) && data.sections.length > 0;

  if (isLong) {
    const html = renderRichHtml({ title: data.title, subtitle: data.subtitle || '', sections: data.sections });
    const safeTitle = String(data.title || userText).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const baseName = `${new Date().toISOString().slice(0, 10)}_${safeTitle}`;
    const { file_url: fileUrl, file_name: fileName } = await uploadDocFile(base44, baseName, html, 'html');
    const previewMd = data.sections.map(s => `## ${s.heading}\n\n${s.body || ''}`).join('\n\n');
    const note = await base44.entities.Note.create({
      content: `<h2>${data.title}</h2><div><a href="${fileUrl}" target="_blank">📄 打开完整文档：${fileName}</a></div><div>${previewMd.slice(0, 1200).replace(/\n/g, '<br/>')}${previewMd.length > 1200 ? '<br/>…（更多见文档）' : ''}</div>`,
      plain_text: `${data.title}\n\n${previewMd}`,
      tags: data.tags || [],
      color: "yellow"
    });
    return {
      type: "summary_note",
      preview: `📄 已生成《${fileName}》\n📐 富排版 HTML（可打印为 PDF / Word 打开转 docx）\n📥 ${fileUrl}\n\n${data.subtitle || ''}\n\n${previewMd.slice(0, 600)}${previewMd.length > 600 ? '\n…（更多见文件）' : ''}`,
      data: { title: data.title, subtitle: data.subtitle || '', sections: data.sections, file_name: fileName, file_url: fileUrl, output_format: 'html', note_id: note.id, tags: data.tags || [] },
      diff: [
        { action: "create", target: fileName, detail: `结构化文档（${data.sections.length} 节）已上传` },
        { action: "create", target: `心签索引：${data.title}`, detail: "已归档到心签库" }
      ]
    };
  }

  const shortContent = data.content || '';
  const note = await base44.entities.Note.create({
    content: `<h2>${data.title}</h2><div>${shortContent.replace(/\n/g, '<br/>')}</div>`,
    plain_text: `${data.title}\n\n${shortContent}`,
    tags: data.tags || [],
    color: "yellow"
  });
  return {
    type: "summary_note",
    preview: `${data.title}\n\n${shortContent}`,
    data: { title: data.title, content: shortContent, tags: data.tags || [], note_id: note.id },
    diff: [{ action: "create", target: `心签：${data.title}`, detail: "已创建到心签库" }]
  };
}

async function executeOfficeDoc(base44, exec, attachmentCtx) {
  const userText = exec.original_input || exec.task_title;
  const fileBlock = attachmentCtx?.text || '';
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

  // 把用户上传的图片单独列一份给 AI，强制 body 用 Markdown 图片语法嵌入
  const userImagesOffice = Array.isArray(attachmentCtx?.images) ? attachmentCtx.images : [];
  const imageManifestOffice = userImagesOffice.length > 0
    ? `\n\n=== 用户上传的图片清单（必须在相关章节 body 中用 Markdown 图片语法 ![说明](url) 完整嵌入）===\n${userImagesOffice.map((img, i) => `${i + 1}. ![${(img.description || img.name).slice(0, 50)}](${img.url})\n   文件名：${img.name}\n   内容描述：${img.description}`).join('\n')}\n务必要求：\n- 必须把上述每张图片至少在某节 body 中用完整的 ![描述](url) Markdown 语法嵌入，不要省略 url、不要只写文字描述。\n- 按图片实际描述把图片放到对应章节（例如『礼品盒/书型盒样式』图放在书型盒章节，『布袋样式』图放在布袋章节）。\n- 章节正文请根据图片真实内容描述样式，不要编造与图片不符的细节（如图片里没出现的烫金篆章、网度暗纹等不要凭空写）。\n`
    : '';

  // 如果用户上传了图片，直接把图片喂给支持视觉的 LLM（让它"边看图边写"），而不是只看二手描述
  let data;
  if (Array.isArray(attachmentCtx?.images) && attachmentCtx.images.length > 0) {
    const imgUrls = attachmentCtx.images.map(im => im.url);
    const visionPrompt = `你是办公文档专家。请基于【附带的图片】和用户指令，生成一份完整、可落地的办公文档成稿。

用户指令：${userText}
${fileBlock ? `\n用户上传的参考文件（请深入引用其中的内容、数据、清单）：${fileBlock}` : ''}

附带 ${imgUrls.length} 张图片，URL 清单（必须在对应章节的 body 中用完整 Markdown 图片语法 ![描述](url) 嵌入，按图片描述把图放到对应章节）：
${attachmentCtx.images.map((im, i) => `${i + 1}. ${im.url}\n   文件名：${im.name}`).join('\n')}

⚠️ 关键要求：
- 章节正文必须【严格根据图片中肉眼可见的元素】撰写样式描述。
- 禁止编造图片里不存在的工艺细节（例如：图片是白色磁吸盒，就不要写"靛青满版"；图片没有篆章，就不要写"45mm 烫金禅心映影篆章"；图片没有具体颜色编号/字体名，就不要写"D35 单黑"、"康熙字典体"等）。
- 看不出来的细节就用"建议..."或"可选..."表述，不要伪装成定稿规格。
- 每张图片必须在某节 body 中以 ![说明](url) 完整嵌入一次，url 完整复制不要省略。
- 每节包含具体段落/要点/必要时表格。
- 【🚫 图文一致性铁律】图片只能放在与图片【实际内容】匹配的章节，禁止张冠李戴：
  · 礼品盒/书型盒打开图 → 只能放在"书型盒""礼品盒"相关章节，不能放在"布袋""手提袋"章节。
  · 布袋/手提袋图 → 只能放在"布袋""手提袋"章节，不能放在"内盒结构""书型盒"章节。
  · 单一物件特写图 → 不能放在多物件总览章节。
- 每节的文字描述必须与本节嵌入图片的内容一致：图片是布袋就写布袋的纸质/拎手/印花，禁止描述"EVA 内托/卡位"等图中没有的物件。如果某节没有匹配图片，就纯文字描述、不嵌入任何图片。

【🚫 排版铁律 - body 字段必须遵守】
- 禁止使用 markdown 表格（| col | col |）来排版"图+文对照"。
- 禁止使用 HTML 标签（<br>、<p>、<div> 等），需要换行就直接用真正的换行符（\\n）。
- 图配文的写法：把 ![alt](url) 单独放一行，紧跟其下再用 markdown 无序列表（- xxx）或带圈号的多行（每个 ① ② ③ 各一行）说明，禁止把图片和文字塞进同一个表格单元格。
- 标准格式示例：
\`\`\`
### 3.2 书型盒外盒正面

![书型盒外盒正面](https://example.com/box.png)

- ① 靛青满版
- ② 中央 45mm 烫金"禅心映影"篆章
- ③ 四角《莲影》负形 15% 网度暗纹
- ④ 底边 5mm 压印"2024.10.1-7"
\`\`\`
- ![alt](url) 这一行**绝对不能换行/不能加空格**，alt 后必须紧贴 (url)。
- 也禁止用 <table><tr><td><img>...</td></tr></table> 这种 HTML 表格排版，直接用上面示例里的 markdown 图+列表格式即可。`;

    const visionRes = await base44.integrations.Core.InvokeLLM({
      prompt: visionPrompt,
      response_json_schema: schema,
      file_urls: imgUrls,
      model: 'gemini_3_1_pro',
    });
    data = typeof visionRes === 'string' ? JSON.parse(visionRes) : visionRes;
  } else {
    data = await callKimi(
      base44,
      `请为以下需求生成一份完整的办公文档内容（不是大纲，而是可直接使用的成稿）：\n${userText}${fileBlock ? `\n\n用户上传的参考文件（请深入引用其中的内容、数据、清单）：${fileBlock}` : ''}${imageManifestOffice}`,
      schema,
      "你是办公文档专家。请直接生成完整、可落地的成稿内容（每节包含具体段落、要点、必要时含表格）。"
    );
  }

  // 规范化每节 body 里的图片 markdown，避免被空白/换行拆散导致网页里图片渲染失败
  if (Array.isArray(data.sections)) {
    data.sections = data.sections.map(s => ({
      ...s,
      body: String(s.body || '')
        // ![alt]<任意空白>(url) → ![alt](url)
        .replace(/(!\[[^\]]*\])[\s\u3000]+(\(https?:[^\s)]+\))/g, '$1$2')
        // 表格单元格里如果图片紧跟在 | 后但 alt 文本含括号导致未闭合的情况兜底
        .replace(/!\[([^\]\n]*)\]\s*\n+\s*\((https?:[^\s)]+)\)/g, '![$1]($2)')
    }));
  }

  // 兜底：如果 AI 没把图片用 ![](url) 嵌进任何 body，自动追加一个"附录图片"章节，避免图片缺失
  if (userImagesOffice.length > 0) {
    const allBody = (data.sections || []).map(s => s.body || '').join('\n');
    const missing = userImagesOffice.filter(im => !allBody.includes(im.url));
    if (missing.length > 0) {
      const figs = missing.map((im, i) => `![${(im.description || im.name || `图${i + 1}`).slice(0, 60)}](${im.url})`).join('\n\n');
      data.sections = [
        ...(data.sections || []),
        { heading: '附：相关图片', body: `以下为本任务上传的参考图片，按用户提供顺序展示。\n\n${figs}` }
      ];
    }
  }

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
  const baseName = `${new Date().toISOString().slice(0, 10)}_${safeTitle}`;

  // 办公文档固定输出富排版 HTML —— 图文并茂、浏览器原生可预览，无需下载
  // 仅当用户明确要求"纯文本/txt"时才输出 txt
  const wantsPlain = /纯文本|plain text|\.txt/i.test(userText);
  const format = wantsPlain ? 'txt' : 'html';
  let content;
  if (format === 'html') {
    content = renderRichHtml({
      title: data.title,
      subtitle: data.note || '',
      sections: data.sections || [],
    });
  } else if (format === 'txt') {
    content = renderPlainText({
      title: data.title,
      subtitle: data.note || '',
      sections: data.sections || [],
    });
  } else {
    content = markdown;
  }
  const { file_url: fileUrl, file_name: fileName } = await uploadDocFile(base44, baseName, content, format);
  const formatLabel = { md: 'Markdown', txt: '纯文本', html: '富排版 HTML（可打印为 PDF）' }[format];

  return {
    type: "office_doc",
    preview: `📄 已生成《${fileName}》\n📐 文件格式：${formatLabel}\n📥 下载链接：${fileUrl}\n\n${markdown.slice(0, 800)}${markdown.length > 800 ? '\n…（更多内容见文件）' : ''}`,
    data: { ...data, file_name: fileName, file_url: fileUrl, output_format: format, markdown },
    diff: [{ action: "create", target: fileName, detail: `${formatLabel} 文档（${(data.sections || []).length} 节）已上传` }]
  };
}

async function executePptDoc(base44, exec, attachmentCtx) {
  const userText = exec.original_input || exec.task_title;
  const fileBlock = attachmentCtx?.text || '';
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
            layout: {
              type: "string",
              enum: ["cover", "agenda", "section-divider", "two-column", "image-left", "image-right", "image-full", "quote", "stats", "cards", "timeline", "comparison", "closing"],
              description: "页面版式模板：cover=封面 / agenda=目录 / section-divider=章节分隔 / two-column=左右双列文字 / image-left=左图右文 / image-right=右图左文 / image-full=整页大图 / quote=引言金句 / stats=数据大数字 / cards=要点卡片网格 / timeline=时间线 / comparison=对比表 / closing=结束致谢。请根据本页内容自动挑选最贴切的版式。",
            },
            bullets: { type: "array", items: { type: "string" }, description: "要点列表，3~6 条" },
            body: { type: "string", description: "可选的补充段落，用于结论/数据/案例页" },
            stats: {
              type: "array",
              description: "当 layout=stats 时使用：3~4 个关键数据，每个含数值和说明",
              items: {
                type: "object",
                properties: {
                  value: { type: "string", description: "大数字，如 87% / 1.2M / 24" },
                  label: { type: "string", description: "对应说明" }
                },
                required: ["value", "label"]
              }
            },
            timeline: {
              type: "array",
              description: "当 layout=timeline 时使用：3~5 个时间节点",
              items: {
                type: "object",
                properties: {
                  time: { type: "string", description: "时间或阶段标记，如 Q1 / 2024 / 第一步" },
                  title: { type: "string", description: "该节点的小标题" },
                  desc: { type: "string", description: "一句话说明" }
                },
                required: ["time", "title"]
              }
            },
            comparison: {
              type: "object",
              description: "当 layout=comparison 时使用：A / B 两列对比",
              properties: {
                left_title: { type: "string" },
                right_title: { type: "string" },
                left_items: { type: "array", items: { type: "string" } },
                right_items: { type: "array", items: { type: "string" } }
              }
            },
            images: {
              type: "array",
              description: "本页要展示的图片（必须从用户上传的图片清单中选择 url，禁止编造 URL）。一页 1~2 张为佳。",
              items: {
                type: "object",
                properties: {
                  url: { type: "string", description: "图片 URL（必须来自用户上传清单）" },
                  caption: { type: "string", description: "图片说明，如『礼品盒外观』『布袋样式』" }
                },
                required: ["url"]
              }
            }
          },
          required: ["heading"]
        }
      },
      note: { type: "string", description: "对用户的额外说明" }
    },
    required: ["title", "theme", "slides"]
  };

  // 把用户上传的图片单独列一份给 AI，并强制要求嵌入到对应幻灯片
  const userImages = Array.isArray(attachmentCtx?.images) ? attachmentCtx.images : [];
  const imageManifest = userImages.length > 0
    ? `\n\n=== 用户上传的图片清单（必须按需嵌入到对应幻灯片的 images 字段）===\n${userImages.map((img, i) => `${i + 1}. URL: ${img.url}\n   文件名: ${img.name}\n   内容描述: ${img.description}`).join('\n')}\n务必要求：\n- 必须把上述每张图片至少在一张幻灯片的 images 字段中使用（url 完整复制，禁止编造或简写）。\n- 选择最相关的幻灯片放置（例如『礼品盒样式』图放在样式说明页，『布袋样式』图放在布袋说明页）。\n- 一张幻灯片可放 1~2 张图，配合 caption 文字说明。\n- 含图片的幻灯片 bullets 可以减少，让图片成为主角。\n`
    : '';

  const pptPrompt = `请为以下需求生成一份完整的演示稿（PPT）：\n${userText}${fileBlock ? `\n\n用户上传的参考文件（请把其中的关键信息嵌入到相应幻灯片，不要丢失重要项）：${fileBlock}` : ''}${imageManifest}\n\n要求：\n1) 根据题材自动选择合适的主题风格(theme)；\n2) 至少 8 页，必须包含：① 封面 ② 目录/Agenda ③ 3~5 个核心论点页 ④ 至少 1 个数据/对比/时间线页 ⑤ 结束致谢页；\n3) 每页 bullets 控制在 3~6 条，简洁有力，每条 ≤ 30 个字；\n4) 一定要直接产出可演示的成稿内容，而不是大纲提示；\n5) ${userImages.length > 0 ? `务必把上面列出的 ${userImages.length} 张用户图片嵌入到相应幻灯片的 images 字段（url 完整复制）；图片页应配合 3~6 条 bullets 作为"文字说明对照"，不要把多条说明硬塞进 body 字符串。` : '本次无图片附件'}；\n6) 【关键排版规则】bullets / body / caption 字段都是纯文本，禁止出现 HTML 标签（如 <br>、<br/>、<p>），需要换行就直接拆成 bullets 数组的多个条目；禁止把 "① xx<br>② yy<br>③ zz" 这种带序号 + <br> 的内容塞到单个字符串里——必须拆成 bullets:["① xx","② yy","③ zz"]；\n7) 实拍图配文字说明的页面，优先采用"左图右 bullets"布局（即把图片放 images、说明放 bullets），不要使用 markdown 表格；\n\n8) 【★ 版式模板要求 ★】必须为每一页指定 layout 字段，从以下模板中挑选最贴切的一种，使整份演示稿"图文并茂、版式多变"，避免每页都长得一样：\n   - cover：仅首页使用（heading + subtitle）；\n   - agenda：第 2 页推荐使用，bullets 列出全篇章节；\n   - section-divider：大章节之间的分隔页，只有大标题 + 一句概述（body），无 bullets；\n   - two-column：纯文字双栏，bullets 4~6 条会自动分两列；\n   - image-left / image-right：图文页（图片放 images，说明放 bullets），有图就用其中之一；\n   - image-full：整张大图为主、heading 浮于上方（极少使用，仅用于强冲击的画面）；\n   - quote：金句/关键观点页（heading + body，body 写一段不超 60 字的金句），无 bullets；\n   - stats：数据页（必须填 stats 数组，3~4 个大数字）；\n   - cards：要点卡片网格（4~6 条 bullets 会自动渲染成带编号卡片）；\n   - timeline：时间线/步骤页（必须填 timeline 数组，3~5 个节点）；\n   - comparison：对比页（必须填 comparison 对象：left_title / right_title / left_items / right_items），用于「方案 A vs 方案 B」「优点 vs 缺点」等场景；\n   - closing：最后一页致谢/Call to Action（heading 写"Thank You"或"开始行动"，body 写联系方式或一句行动号召）；\n   ⚠️ 不要所有页都用 cards 或都用 two-column——要根据每页内容挑最合适的，做到节奏感强、视觉不重复。`;
  const pptSystem = "你是顶级演示稿设计师。基于用户输入直接产出完整、有逻辑、可直接演示的幻灯片内容。" + (userImages.length > 0 ? "⚠️ 用户上传了真实图片，请仔细观察每张图片的实际内容。幻灯片正文 bullets/body 必须严格忠于图片肉眼可见的元素（颜色、材质、可见图案/无图案），禁止编造图片中不存在的工艺规格（如『靛青满版』『45mm 烫金禅心映影篆章』『康熙字典体』『D35 单黑丝印』『280×300mm 尺寸』『莲花压纹』等具体数值/工艺名词，除非图中文字明确写出）。看不出来的就用『建议…』或不写。每张图片至少写入一张幻灯片的 images 字段，url 完整复制。" : "");
  const data = userImages.length > 0
    ? await base44.integrations.Core.InvokeLLM({
        prompt: `${pptSystem}\n\n${pptPrompt}`,
        file_urls: userImages.map(im => im.url),
        response_json_schema: schema,
        model: 'gemini_3_1_pro',
      })
    : await callKimi(base44, pptPrompt, schema, pptSystem);

  // 兜底：若 AI 没把图片放进任何幻灯片 images，自动在结尾追加一张图集页，避免图片缺失
  if (userImages.length > 0) {
    const usedUrls = new Set();
    (data.slides || []).forEach(s => {
      const imgs = Array.isArray(s.images) ? s.images : [];
      imgs.forEach(im => { if (im?.url) usedUrls.add(im.url); });
    });
    const missing = userImages.filter(im => !usedUrls.has(im.url));
    if (missing.length > 0) {
      data.slides = [
        ...(data.slides || []),
        {
          heading: '相关图片一览',
          bullets: [],
          body: '以下为本任务参考图片',
          images: missing.map(im => ({ url: im.url, caption: (im.name || '').slice(0, 30) })),
        }
      ];
    }
  }

  // 渲染自包含 HTML 演示稿（已抽到独立 backend function renderPpt 中）
  const safeTitle = (data.title || userText).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const baseName = `${new Date().toISOString().slice(0, 10)}_${safeTitle}`;
  const renderRes = await base44.functions.invoke('renderPpt', { data, file_base_name: baseName });
  const fileUrl = renderRes?.data?.file_url;
  const fileName = renderRes?.data?.file_name || `${baseName}.html`;

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

  // ① 先用专业的 parseNaturalTime 服务精准解析时间（带北京时区 + 日期锚点 + 时段映射）
  //    避免 Kimi 在 executeAutomation 内自己推算时出现"下午两点 → 22:00"这种偏差
  const userInput = exec.original_input || exec.task_title;
  let parsedTime = null;
  try {
    const ptRes = await base44.functions.invoke('parseNaturalTime', { input: userInput });
    parsedTime = ptRes?.data || null;
  } catch (e) {
    console.warn('[executeCalendarEvent] parseNaturalTime failed:', e?.message || e);
  }

  // ② AI 仅负责提取标题/描述/优先级/分类，时间字段一律用 parseNaturalTime 的结果
  const data = await callKimi(
    base44,
    `请把以下指令解析为日历事件的【标题/描述/优先级/分类】（时间不用你解析，已由专门服务处理）：\n${userInput}`,
    {
      type: "object",
      properties: {
        title: { type: "string", description: "事件标题，简短精炼，不要包含时间表述" },
        description: { type: "string", description: "事件描述/备注，可为空" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] }
      },
      required: ["title"]
    },
    "你是日程助手。只负责提取事件的标题/描述/优先级/分类，不要输出时间字段。"
  );

  const reminder_time = parsedTime?.reminder_time || null;
  const end_time = parsedTime?.end_time || null;
  const is_all_day = !!parsedTime?.is_all_day;

  if (!reminder_time) {
    throw new Error(`未能从指令中识别出有效时间："${userInput}"。请补充具体的日期/时间后重试。`);
  }

  // ③ 创建 Task（约定列表）—— 开启 Google Calendar 同步
  const task = await base44.entities.Task.create({
    title: data.title || parsedTime?.title_hint || userInput.slice(0, 30),
    description: data.description || "",
    reminder_time,
    end_time,
    is_all_day,
    priority: data.priority || "medium",
    category: data.category || "personal",
    status: "pending",
    gcal_sync_enabled: true,
  });

  // ④ 把 task_id 回写到 TaskExecution，让 UI 能识别"已关联到约定列表"
  try {
    await base44.entities.TaskExecution.update(exec.id, { task_id: task.id });
  } catch (e) {
    console.warn('[executeCalendarEvent] write back task_id failed:', e?.message || e);
  }

  // ⑤ 尝试同步到 Google Calendar（已授权时才生效，失败不阻塞主流程）
  let gcalSyncStatus = '';
  try {
    const syncRes = await base44.functions.invoke('syncTaskToGoogleCalendar', { task_id: task.id });
    if (syncRes?.data?.event_id || syncRes?.data?.success) {
      gcalSyncStatus = '\n✅ 已同步至 Google Calendar';
    }
  } catch (e) {
    console.warn('[executeCalendarEvent] gcal sync failed:', e?.message || e);
  }

  // 北京时区可读时间
  const displayTime = new Date(reminder_time).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return {
    type: "calendar_event",
    preview: `📅 ${data.title}\n时间：${displayTime}${is_all_day ? '（全天）' : ''}\n${data.description || ''}${gcalSyncStatus}\n\n✅ 已添加到「约定列表」`,
    data: {
      ...data,
      title: data.title,
      reminder_time,
      end_time,
      is_all_day,
      task_id: task.id,
      parsed_confidence: parsedTime?.confidence,
    },
    diff: [
      { action: "create", target: `约定：${data.title}`, detail: `已添加到约定列表，时间 ${displayTime}` },
      ...(gcalSyncStatus ? [{ action: "create", target: `Google Calendar：${data.title}`, detail: '已同步至 Google 日历' }] : []),
    ]
  };
}

// 整理账本：委托给独立的 executeLedgerOrganize backend function
// (本文件已逼近 2000 行硬上限，实现拆到 functions/executeLedgerOrganize.js)
async function executeLedger(base44, exec, attachmentCtx) {
  const res = await base44.functions.invoke('executeLedgerOrganize', {
    user_text: exec.original_input || exec.task_title,
    file_block: attachmentCtx?.text || '',
  });
  const d = res?.data || {};
  if (d?.error) throw new Error(d.error);
  return d;
}

const EXECUTORS = {
  email_draft: executeEmailDraft,
  web_research: executeWebResearch,
  summary_note: executeSummaryNote,
  office_doc: executeOfficeDoc,
  ppt_doc: executePptDoc,
  file_organize: executeFileOrganize,
  calendar_event: executeCalendarEvent,
  ledger_organize: executeLedger,
};

// 关键基础设施：把 base44 entity / auth 调用统一包一层 429 退避重试。
// 平台层偶发 Rate Limit 时直接抛 429 会让 executeAutomation 整个 500，
// 让用户看到"执行失败 500"。这里做最多 4 次指数退避（1s/2s/4s），
// 大多数偶发限流都能在 7s 内自愈，不会显著影响用户体验。
async function withRetry429(fn, label = 'op') {
  const MAX = 4;
  for (let attempt = 0; attempt < MAX; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = e?.response?.status || e?.status;
      const msg = e?.message || '';
      const isRateLimit = status === 429 || /rate limit/i.test(msg);
      if (isRateLimit && attempt < MAX - 1) {
        const wait = 1000 * Math.pow(2, attempt);
        console.warn(`[executeAutomation] ${label} hit 429, retry in ${wait}ms (attempt ${attempt + 1}/${MAX})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await withRetry429(() => base44.auth.me(), 'auth.me');
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { execution_id, phase = "plan" } = await req.json();
    if (!execution_id) return Response.json({ error: 'execution_id required' }, { status: 400 });

    const exec = await withRetry429(
      () => base44.entities.TaskExecution.get(execution_id),
      'TaskExecution.get'
    );
    if (!exec) return Response.json({ error: 'Execution not found' }, { status: 404 });

    // 读取用户上传的附件（plan / execute 都用得到）
    const attachmentCtx = await buildAttachmentContext(base44, exec);

    // === Phase 1: PLAN ===
    if (phase === "plan") {
      // 余额校验：方案规划阶段需要 plan 点数
      const planCost = getAutomationCost('plan');
      try {
        await ensureCredits(base44, user, planCost);
      } catch (e) {
        if (e.code === 'INSUFFICIENT_CREDITS') {
          return Response.json({
            error: 'INSUFFICIENT_CREDITS',
            message: e.message,
            required: e.required,
            balance: e.balance,
          }, { status: 402 });
        }
        throw e;
      }

      // 用 try/catch 包住 plan 生成 —— 失败时把 TaskExecution 状态写为 failed 并返回真实错误，
      // 而不是裸 500，避免前端只看到 "Request failed with status code 500"
      let planRes;
      try {
        planRes = await generatePlan(base44, exec, attachmentCtx);
      } catch (e) {
        const realMsg = e?.response?.data?.error || e?.message || '方案规划失败';
        try {
          await withRetry429(() => base44.entities.TaskExecution.update(execution_id, {
            execution_status: "failed",
            error_message: realMsg,
          }), 'TaskExecution.update[plan-failed]');
        } catch (_) { /* ignore */ }
        return Response.json({ error: realMsg }, { status: 500 });
      }
      const steps = (planRes.plan.steps || []).map(s => ({
        step_name: s.name,
        status: "pending",
        detail: s.detail,
      }));

      const nextStatus = planRes.requires_approval ? "waiting_confirm" : "pending";
      const updated = await withRetry429(() => base44.entities.TaskExecution.update(execution_id, {
        automation_type: planRes.automation_type,
        automation_plan: planRes.plan,
        requires_approval: planRes.requires_approval,
        execution_steps: steps,
        execution_status: nextStatus,
      }), 'TaskExecution.update[plan]');

      // 成功后扣 plan 点数
      await chargeCredits(base44, user.id, planCost, 'automation_plan',
        `自动执行方案规划（${planRes.automation_type}）消耗 ${planCost} 点`);

      return Response.json({ success: true, phase: "plan", execution: updated, charged: planCost });
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

      // 余额校验：根据类型确定单价（失败/取消不扣，成功才扣）
      const execCost = getAutomationCost(autoType);
      try {
        await ensureCredits(base44, user, execCost);
      } catch (e) {
        if (e.code === 'INSUFFICIENT_CREDITS') {
          return Response.json({
            error: 'INSUFFICIENT_CREDITS',
            message: e.message,
            required: e.required,
            balance: e.balance,
          }, { status: 402 });
        }
        throw e;
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
        const result = await executor(base44, exec, attachmentCtx);
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

        // 执行成功后扣费
        await chargeCredits(base44, user.id, execCost, `automation_${autoType}`,
          `自动执行「${exec.task_title || autoType}」消耗 ${execCost} 点`);

        return Response.json({ success: true, phase: "execute", execution: updated, result, charged: execCost });
      } catch (e) {
        // 兜底解包：axios 抛出时尽量挖出真实后端错误，避免前端只显示
        // "Request failed with status code 400" 这种没营养的字符串
        const apiErr = e?.response?.data?.error || e?.response?.data?.message;
        const status = e?.response?.status;
        const realMsg = apiErr
          ? `${apiErr}${status ? `（HTTP ${status}）` : ''}`
          : (e?.message || '执行失败');
        await base44.entities.TaskExecution.update(execution_id, {
          execution_status: "failed",
          error_message: realMsg,
        });
        return Response.json({ error: realMsg }, { status: 500 });
      }
    }

    return Response.json({ error: 'Invalid phase' }, { status: 400 });
  } catch (error) {
    const apiErr = error?.response?.data?.error || error?.response?.data?.message;
    const realMsg = apiErr || error?.message || '未知错误';
    return Response.json({ error: realMsg }, { status: 500 });
  }
});