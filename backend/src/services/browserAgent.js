import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { callKimiChat } from "../lib/kimi.js";
import { env } from "../config/env.js";

// 浏览器 AI Agent：为自动执行提供"浏览网页、点击、填写、提取信息"的能力。
// 设计要点：
// - 共享无头浏览器实例，每个执行单开独立 context（会话隔离）
// - 每轮把页面快照（可交互元素编号 + 正文摘要）喂给 Kimi，由它决定下一步工具调用
// - 遇到登录/验证码/支付等人工环节调用 ask_user 暂停；用户可远程接管（截图流 + 点按转发）
// - 暂停通过内存 pending promise 实现：handler 一直挂起，executeAutomation 不会提前写终态
// - 服务器重启会丢失会话：启动清扫把中断的浏览器执行单标记为失败（用户可再试一次）

const MAX_STEPS = 24;           // 单次执行最多工具步数
const RUN_DEADLINE_MS = 10 * 60 * 1000; // 单次执行总时限
const KIMI_CALL_TIMEOUT = 35000;
const SCREENSHOT_KEEP = 40;
const VIEWPORT = { width: 1280, height: 800 };

const sessions = new Map();     // executionId -> session
let browserPromise = null;

function agentShotDir() {
  const dir = path.resolve(process.cwd(), env.UPLOAD_DIR || "uploads", "agent");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function getBrowser() {
  if (!browserPromise) {
    const launchOptions = {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    };
    // 允许通过环境变量覆盖浏览器来源（服务器装不上 Chromium 时指向系统浏览器）
    if (env.BROWSER_EXECUTABLE_PATH) launchOptions.executablePath = env.BROWSER_EXECUTABLE_PATH;
    if (env.BROWSER_CHANNEL) launchOptions.channel = env.BROWSER_CHANNEL;
    browserPromise = chromium.launch(launchOptions).catch((err) => {
      browserPromise = null;
      throw new Error("浏览器环境未就绪（缺少 Chromium），请联系管理员执行 npx playwright install chromium，或通过 BROWSER_EXECUTABLE_PATH 指定系统浏览器");
    });
  }
  return browserPromise;
}

// 防 SSRF：只允许公网 http/https
function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || ""));
  } catch {
    throw new Error("不是合法网址");
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error("仅支持 http/https 网址");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "::1") throw new Error("禁止访问本机地址");
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error("禁止访问内网地址");
  return u.toString();
}

async function snapshotPage(page) {
  const data = await page.evaluate(() => {
    const pickText = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const elements = [];
    let ref = 0;
    const push = (el, tag, extra) => {
      ref += 1;
      elements.push({ ref, tag, text: pickText(el), ...extra });
    };
    document.querySelectorAll("a[href]").forEach((el) => push(el, "a", { href: (el.getAttribute("href") || "").slice(0, 120) }));
    document.querySelectorAll("button, [role='button'], input[type='submit']").forEach((el) => push(el, "button", {}));
    document.querySelectorAll("input:not([type='submit']):not([type='hidden'])").forEach((el) =>
      push(el, "input", {
        placeholder: (el.getAttribute("placeholder") || el.getAttribute("name") || el.type || "").slice(0, 60),
        inputType: el.type || "text"
      })
    );
    document.querySelectorAll("textarea").forEach((el) => push(el, "textarea", { placeholder: (el.getAttribute("placeholder") || "").slice(0, 60) }));
    document.querySelectorAll("select").forEach((el) => push(el, "select", { options: Array.from(el.options || []).map((o) => (o.textContent || "").trim()).filter(Boolean).slice(0, 8) }));
    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      url: location.href,
      title: document.title,
      elements: elements.slice(0, 80),
      textExcerpt: bodyText.slice(0, 1400)
    };
  }).catch(() => null);
  return data;
}

function formatObservation(snapshot, goal, extracted) {
  if (!snapshot) return "（页面快照获取失败，可能是弹出新窗口或页面跳转中，请用 goto 重新打开目标网址）";
  const lines = [
    `目标：${goal}`,
    `当前页面：${snapshot.title}（${snapshot.url}）`,
    extracted ? `已记录的信息：${extracted}` : "",
    "可交互元素（用编号引用）：",
    ...snapshot.elements.map((e) => {
      const label = e.text || e.placeholder || e.href || "";
      const opts = e.options ? ` 选项[${e.options.join("/")}]` : "";
      return `  [${e.ref}] <${e.tag}> ${label}${opts}`;
    }),
    "页面正文摘录：",
    snapshot.textExcerpt
  ].filter(Boolean);
  return lines.join("\n");
}

async function saveScreenshot(session) {
  try {
    const file = `${session.executionId}-${Date.now()}.jpg`;
    await session.page.screenshot({ path: path.join(agentShotDir(), file), type: "jpeg", quality: 55, fullPage: false });
    session.files.push(file);
    if (session.files.length > SCREENSHOT_KEEP) {
      const old = session.files.splice(0, session.files.length - SCREENSHOT_KEEP);
      old.forEach((f) => { try { fs.unlinkSync(path.join(agentShotDir(), f)); } catch {} });
    }
    session.latestScreenshot = `/uploads/agent/${file}`;
  } catch {
    // 截图失败不阻断流程
  }
}

function persist(session) {
  const agent = {
    status: session.status,
    goal: session.goal,
    waiting: session.waiting,
    steps: session.steps.slice(-30),
    latestScreenshot: session.latestScreenshot,
    extracted: session.extracted || undefined,
    currentUrl: session.currentUrl,
    error: session.error || undefined
  };
  const payload = {
    type: "browser_task",
    preview: session.status === "waiting_input"
      ? "网页执行中，需要你的回应"
      : session.status === "takeover"
        ? "正在由你手动操作网页"
        : session.finalSummary || "浏览器 Agent 正在执行",
    data: { agent }
  };
  session.prisma.taskExecution.update({
    where: { id: session.executionId },
    data: { automationResult: payload }
  }).catch(() => {});
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// —— Kimi 工具定义 ——
const AGENT_TOOLS = [
  { type: "function", function: { name: "goto", description: "打开一个网址（http/https）", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  { type: "function", function: { name: "click", description: "点击页面上编号为 ref 的元素", parameters: { type: "object", properties: { ref: { type: "number" } }, required: ["ref"] } } },
  { type: "function", function: { name: "fill", description: "向编号为 ref 的输入框/文本域填写内容", parameters: { type: "object", properties: { ref: { type: "number" }, text: { type: "string" } }, required: ["ref", "text"] } } },
  { type: "function", function: { name: "select", description: "在下拉框中选择一项", parameters: { type: "object", properties: { ref: { type: "number" }, option: { type: "string" } }, required: ["ref", "option"] } } },
  { type: "function", function: { name: "press", description: "按键，如 Enter、Escape、Tab、ArrowDown", parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } } },
  { type: "function", function: { name: "scroll", description: "滚动页面", parameters: { type: "object", properties: { direction: { type: "string", enum: ["down", "up"] } }, required: ["direction"] } } },
  { type: "function", function: { name: "extract", description: "把当前页面中用户需要的信息记录下来（可多次调用逐步补充）", parameters: { type: "object", properties: { info: { type: "string" } }, required: ["info"] } } },
  { type: "function", function: { name: "ask_user", description: "遇到必须人工处理（登录、验证码、支付、弹手机验证）或需要用户决定时，向用户提问并暂停", parameters: { type: "object", properties: { question: { type: "string" }, choices: { type: "array", items: { type: "string" } } }, required: ["question"] } } },
  { type: "function", function: { name: "done", description: "任务目标已完成，汇总结果", parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } } },
  { type: "function", function: { name: "fail", description: "页面无法满足目标或无法继续，说明原因", parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } } }
];

const AGENT_SYSTEM = `你是 SoulSentry「心栈」内置的浏览器操作 Agent。你会拿到一个网页快照（可交互元素带编号）和用户的目标，通过工具调用一步步完成目标。

规则：
1. 每轮根据最新快照决定 1 个动作；动作之间用观察结果驱动，不要臆测页面内容。
2. 只在编号列表内引用元素；填写前先确认输入框用途（placeholder/相邻文字）。
3. 涉及登录、注册、短信验证、滑块验证码、支付、输入密码/银行卡等敏感操作时，禁止代劳，立即用 ask_user 暂停并向用户说明需要什么。
4. 需要用户做选择（如多个班次/商品）时，先用 extract 记录选项信息，再 ask_user 给出 choices。
5. 目标完成后用 done 汇总；页面确实无法满足时用 fail 说明原因。不要无限重试同一个失败动作，最多两次后改 ask_user 或 fail。
6. extract 记录的是"用户要的结果信息"，逐条记录，最后 done 的 summary 里汇总。`;

async function executeTool(session, name, args) {
  const page = session.page;
  const snapshot = session.lastSnapshot || {};
  const el = (list, ref) => (list || []).find((e) => e.ref === ref);

  switch (name) {
    case "goto": {
      const url = assertPublicUrl(args.url);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(800);
      return `已打开 ${page.url()}`;
    }
    case "click": {
      const target = el(snapshot.elements, Number(args.ref));
      if (!target) return "元素不存在或编号失效，请重新看最新快照";
      await page.evaluate((refIndex) => {
        const all = [
          ...document.querySelectorAll("a[href]"),
          ...document.querySelectorAll("button, [role='button'], input[type='submit']"),
          ...document.querySelectorAll("input:not([type='submit']):not([type='hidden'])"),
          ...document.querySelectorAll("textarea"),
          ...document.querySelectorAll("select")
        ];
        // 与 snapshotPage 的收集顺序保持一致
        const seen = new Set();
        const ordered = [];
        document.querySelectorAll("a[href]").forEach((e) => { ordered.push(e); seen.add(e); });
        ["button", "[role='button']", "input[type='submit']"].forEach((sel) => document.querySelectorAll(sel).forEach((e) => { if (!seen.has(e)) { ordered.push(e); seen.add(e); } }));
        document.querySelectorAll("input:not([type='submit']):not([type='hidden'])").forEach((e) => { if (!seen.has(e)) { ordered.push(e); seen.add(e); } });
        document.querySelectorAll("textarea").forEach((e) => { if (!seen.has(e)) { ordered.push(e); seen.add(e); } });
        document.querySelectorAll("select").forEach((e) => { if (!seen.has(e)) { ordered.push(e); seen.add(e); } });
        const targetEl = ordered[refIndex - 1];
        if (targetEl) targetEl.scrollIntoView({ block: "center" });
      }, Number(args.ref));
      await page.waitForTimeout(300);
      const handle = await resolveHandle(page, Number(args.ref));
      if (!handle) return "元素已失效（页面可能已变化），请重新看最新快照";
      await handle.click({ timeout: 8000 });
      await page.waitForTimeout(700);
      await dismissPopups(session);
      return "已点击";
    }
    case "fill": {
      const handle = await resolveHandle(page, Number(args.ref));
      if (!handle) return "输入框不存在或编号失效，请重新看最新快照";
      await handle.scrollIntoViewIfNeeded();
      await handle.fill(String(args.text ?? ""), { timeout: 8000 });
      return "已填写";
    }
    case "select": {
      const handle = await resolveHandle(page, Number(args.ref));
      if (!handle) return "下拉框不存在或编号失效，请重新看最新快照";
      await handle.selectOption({ label: String(args.option) }).catch(async () => {
        await handle.selectOption({ value: String(args.option) });
      });
      return "已选择";
    }
    case "press": {
      await page.keyboard.press(String(args.key || "Enter"));
      await page.waitForTimeout(500);
      return `已按 ${args.key}`;
    }
    case "scroll": {
      await page.mouse.wheel(0, args.direction === "up" ? -600 : 600);
      await page.waitForTimeout(400);
      return "已滚动";
    }
    case "extract": {
      session.extracted = session.extracted
        ? `${session.extracted}\n${String(args.info || "").slice(0, 800)}`
        : String(args.info || "").slice(0, 800);
      return "已记录";
    }
    default:
      return "未知工具";
  }
}

// 与 snapshotPage 完全一致的元素收集顺序，把 ref 映射回真实 DOM 元素
async function resolveHandle(page, ref) {
  const index = ref - 1;
  if (index < 0) return null;
  const counts = await page.evaluate(() => ({
    a: document.querySelectorAll("a[href]").length,
    btn: document.querySelectorAll("button, [role='button'], input[type='submit']").length,
    input: document.querySelectorAll("input:not([type='submit']):not([type='hidden'])").length,
    ta: document.querySelectorAll("textarea").length
  }));
  let locator = null;
  if (index < counts.a) locator = page.locator("a[href]").nth(index);
  else if (index < counts.a + counts.btn) locator = page.locator("button, [role='button'], input[type='submit']").nth(index - counts.a);
  else if (index < counts.a + counts.btn + counts.input) locator = page.locator("input:not([type='submit']):not([type='hidden'])").nth(index - counts.a - counts.btn);
  else if (index < counts.a + counts.btn + counts.input + counts.ta) locator = page.locator("textarea").nth(index - counts.a - counts.btn - counts.input);
  else locator = page.locator("select").nth(index - counts.a - counts.btn - counts.input - counts.ta);
  try {
    if (!(await locator.count())) return null;
    return locator.first();
  } catch {
    return null;
  }
}

async function dismissPopups(session) {
  try {
    const pages = session.context.pages();
    for (const p of pages) {
      if (p !== session.page) await p.close().catch(() => {});
    }
  } catch {}
}

function logStep(session, tool, args, result) {
  session.steps.push({
    ts: Date.now(),
    tool,
    args: summarizeArgs(tool, args),
    result: String(result || "").slice(0, 160)
  });
}

function summarizeArgs(tool, args) {
  const a = args || {};
  if (tool === "goto") return a.url;
  if (tool === "fill") return `#${a.ref} ← ${String(a.text || "").slice(0, 40)}`;
  if (tool === "click" || tool === "select") return `#${a.ref}${a.option ? ` → ${a.option}` : ""}`;
  if (tool === "press") return a.key;
  if (tool === "extract") return String(a.info || "").slice(0, 60);
  if (tool === "ask_user") return String(a.question || "").slice(0, 60);
  if (tool === "done") return String(a.summary || "").slice(0, 80);
  if (tool === "fail") return String(a.reason || "").slice(0, 80);
  return "";
}

async function runLoop(session) {
  const deadline = Date.now() + RUN_DEADLINE_MS;
  while (session.stepCount < MAX_STEPS && Date.now() < deadline) {
    // 接管检查点：用户远程操作期间 Agent 挂起
    while (session.takeover) {
      session.status = "takeover";
      persist(session);
      await sleep(600);
    }
    if (session.status === "takeover") session.status = "running";

    const snapshot = await snapshotPage(session.page);
    session.lastSnapshot = snapshot;
    if (snapshot?.url) session.currentUrl = snapshot.url;
    await saveScreenshot(session);

    const observation = formatObservation(snapshot, session.goal, session.extracted);
    const messages = [
      { role: "system", content: AGENT_SYSTEM },
      ...session.history,
      { role: "user", content: observation }
    ];

    let message;
    try {
      const result = await callKimiChat({
        messages,
        tools: AGENT_TOOLS,
        maxTokens: 1200,
        fetchTimeout: KIMI_CALL_TIMEOUT
      });
      message = result.message;
    } catch (err) {
      logStep(session, "error", {}, err?.message || "Kimi 调用失败");
      persist(session);
      throw new Error("浏览器 Agent 思考失败：" + (err?.message || "AI 服务异常"));
    }

    if (!message) throw new Error("浏览器 Agent 没有返回动作");

    if (message.content && !Array.isArray(message.tool_calls?.length ? message.tool_calls : null) && !message.tool_calls?.length) {
      // 纯文本回复：视为观察备注，记入历史继续
      session.history.push({ role: "user", content: observation }, { role: "assistant", content: message.content });
      session.stepCount += 1;
      continue;
    }

    session.history.push({ role: "user", content: observation }, message);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    for (const tc of toolCalls.slice(0, 3)) {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
      const name = tc.function?.name;
      session.stepCount += 1;

      if (name === "done") {
        session.finalSummary = String(args.summary || "任务完成").slice(0, 500);
        logStep(session, "done", args, session.finalSummary);
        persist(session);
        return { summary: session.finalSummary, extracted: session.extracted, url: session.currentUrl, screenshot: session.latestScreenshot };
      }
      if (name === "fail") {
        throw new Error(`浏览器 Agent 放弃：${String(args.reason || "未知原因").slice(0, 200)}`);
      }
      if (name === "ask_user") {
        const question = String(args.question || "需要你确认一下").slice(0, 300);
        const choices = (Array.isArray(args.choices) ? args.choices : []).map((c) => String(c).slice(0, 60)).filter(Boolean).slice(0, 4);
        logStep(session, "ask_user", args, "等待用户回应");
        session.status = "waiting_input";
        session.waiting = { question, choices };
        persist(session);
        const answer = await new Promise((resolve) => { session.pendingResolve = resolve; });
        session.pendingResolve = null;
        session.waiting = null;
        if (answer?.takeover) {
          session.takeover = true;
        } else {
          session.status = "running";
          const answerText = answer?.choice ? `（用户选择了「${answer.choice}」）` : "";
          const feedback = `${answerText}${answer?.text ? ` 用户补充：${answer.text}` : ""}`.trim() || "（用户表示继续）";
          session.history.push({ role: "tool", tool_call_id: tc.id, name: "ask_user", content: feedback });
          logStep(session, "user_answer", {}, feedback);
        }
        persist(session);
        break; // 回到循环顶部刷新快照
      }

      let toolResult;
      try {
        toolResult = await executeTool(session, name, args);
      } catch (err) {
        toolResult = `动作失败：${String(err?.message || err).slice(0, 200)}`;
      }
      logStep(session, name, args, toolResult);
      session.history.push({ role: "tool", tool_call_id: tc.id, name, content: String(toolResult).slice(0, 600) });
      await saveScreenshot(session);
      persist(session);
    }
  }
  throw new Error(session.stepCount >= MAX_STEPS ? `已达最大步数（${MAX_STEPS}），任务未能在限定步数内完成` : "执行超时，任务自动停止");
}

export async function runBrowserAgent(execution, prisma) {
  const goal = String(execution.originalInput || execution.taskTitle || "").slice(0, 300);
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: VIEWPORT, locale: "zh-CN" });
  const page = await context.newPage();

  const session = {
    executionId: execution.id,
    goal,
    prisma,
    browser,
    context,
    page,
    history: [],
    steps: [],
    files: [],
    status: "running",
    waiting: null,
    takeover: false,
    extracted: "",
    finalSummary: "",
    currentUrl: "",
    latestScreenshot: null,
    lastSnapshot: null,
    stepCount: 0,
    pendingResolve: null,
    error: null
  };
  sessions.set(execution.id, session);

  try {
    const outcome = await runLoop(session);
    session.status = "done";
    persist(session);
    return {
      type: "browser_task",
      preview: outcome.summary,
      data: {
        agent: {
          status: "done",
          goal,
          steps: session.steps.slice(-30),
          extracted: outcome.extracted,
          summary: outcome.summary,
          finalUrl: outcome.url,
          latestScreenshot: outcome.screenshot
        }
      }
    };
  } catch (err) {
    session.status = "failed";
    session.error = err?.message || "执行失败";
    persist(session);
    throw err;
  } finally {
    sessions.delete(execution.id);
    await context.close().catch(() => {});
    // 保留最后一张截图供结果页展示，其余清理
    session.files.slice(0, -1).forEach((f) => { try { fs.unlinkSync(path.join(agentShotDir(), f)); } catch {} });
  }
}

// —— 人机交互 API ——
export function getAgentState(executionId) {
  const s = sessions.get(executionId);
  if (!s) return null;
  return {
    status: s.status,
    waiting: s.waiting,
    steps: s.steps.slice(-30),
    latestScreenshot: s.latestScreenshot,
    currentUrl: s.currentUrl,
    goal: s.goal,
    error: s.error
  };
}

export async function respondToAgent(executionId, { choice, text } = {}) {
  const s = sessions.get(executionId);
  if (!s) return { ok: false, message: "会话不存在或已结束" };
  if (s.status !== "waiting_input" || !s.pendingResolve) return { ok: false, message: "当前不在等待回应的状态" };
  s.pendingResolve({ choice: choice || "", text: text || "" });
  return { ok: true };
}

export async function takeoverAgent(executionId) {
  const s = sessions.get(executionId);
  if (!s) return { ok: false, message: "会话不存在或已结束" };
  s.takeover = true;
  s.status = "takeover";
  // 若正在 ask_user 等待中，先以"用户选择亲自操作"解开暂停
  if (s.pendingResolve) {
    s.pendingResolve({ takeover: true });
    s.pendingResolve = null;
    s.waiting = null;
  }
  await saveScreenshot(s);
  persist(s);
  return { ok: true };
}

export async function releaseAgent(executionId, note) {
  const s = sessions.get(executionId);
  if (!s) return { ok: false, message: "会话不存在或已结束" };
  s.takeover = false;
  s.status = "running";
  if (note) s.history.push({ role: "user", content: `（用户刚刚亲自操作了网页，并留言：${String(note).slice(0, 200)}）` });
  persist(s);
  return { ok: true };
}

export async function commandAgent(executionId, cmd) {
  const s = sessions.get(executionId);
  if (!s) return { ok: false, message: "会话不存在或已结束" };
  if (!s.takeover) return { ok: false, message: "请先进入手动操作模式" };
  try {
    const page = s.page;
    if (cmd?.type === "click") {
      await page.mouse.click(Number(cmd.x) || 0, Number(cmd.y) || 0);
      await page.waitForTimeout(400);
    } else if (cmd?.type === "type") {
      await page.keyboard.type(String(cmd.text || ""), { delay: 15 });
      await page.waitForTimeout(200);
    } else if (cmd?.type === "key") {
      await page.keyboard.press(String(cmd.key || "Enter"));
      await page.waitForTimeout(300);
    } else if (cmd?.type === "scroll") {
      await page.mouse.wheel(0, Number(cmd.dy) || 0);
      await page.waitForTimeout(300);
    } else {
      return { ok: false, message: "不支持的指令" };
    }
    await dismissPopups(s);
    await saveScreenshot(s);
    persist(s);
    return { ok: true, screenshot: s.latestScreenshot, url: s.currentUrl };
  } catch (err) {
    return { ok: false, message: String(err?.message || err).slice(0, 200) };
  }
}

// 启动清扫：服务重启后中断的浏览器执行单标记失败（保留再试一次入口）
export function sweepStaleBrowserExecutions(prisma) {
  setTimeout(async () => {
    try {
      const result = await prisma.taskExecution.updateMany({
        where: { automationType: "browser_task", executionStatus: "executing" },
        data: { executionStatus: "failed", errorMessage: "浏览器会话因服务重启中断，请再试一次" }
      });
      if (result.count > 0) console.log(`[browserAgent] 清扫中断会话 ${result.count} 条`);
    } catch (err) {
      console.warn("[browserAgent] 清扫失败:", err?.message || err);
    }
  }, 15000);
}
