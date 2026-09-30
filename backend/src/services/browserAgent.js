import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { callKimiChat, invokeKimiWebSearch } from "../lib/kimi.js";
import { env } from "../config/env.js";

// 浏览器 AI Agent：为自动执行提供"浏览网页、点击、填写、提取信息"的能力。
// 设计要点：
// - 共享无头浏览器实例，每个执行单开独立 context（会话隔离）
// - 每轮把页面快照（可交互元素编号 + 正文摘要）喂给 Kimi，由它决定下一步工具调用
// - 遇到登录/验证码/支付等人工环节调用 ask_user 暂停；用户可远程接管（截图流 + 点按转发）
// - 暂停通过内存 pending promise 实现：handler 一直挂起，executeAutomation 不会提前写终态
// - 服务器重启会丢失会话：启动清扫把中断的浏览器执行单标记为失败（用户可再试一次）

const MAX_STEPS = 60;           // 单次执行最多工具步数（步数不卡太死，总时限兜底）
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
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"]
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

// 元素收集函数源码：注入页面后暴露两个全局——
// window.__ssCollect() 返回真实 DOM 节点数组（点击/填写用），
// window.__ssDescribeAll() 返回编号元数据（快照喂给 Kimi 用），
// 两者同一份遍历顺序，保证编号一致。
// 分组顺序：链接 → 按钮 → 语义链接/选项/可点击 → 输入框 → 多行文本 → 下拉 → 内容卡片
const COLLECT_FN_SRC = `() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none";
  };
  const groups = [
    { tag: "a", selector: "a[href]", cap: 40 },
    { tag: "button", selector: "button, [role='button'], input[type='submit']", cap: 30 },
    { tag: "link", selector: "[role='link'], [role='tab'], [role='option'], [onclick]", cap: 30 },
    { tag: "input", selector: "input:not([type='submit']):not([type='hidden'])", cap: 20 },
    { tag: "textarea", selector: "textarea", cap: 5 },
    { tag: "select", selector: "select", cap: 5 },
    { tag: "card", selector: "[role='listitem'], li, [class*='flight'], [class*='train'], [class*='ticket'], [class*='result'], [class*='card'], [class*='item']", cap: 24 }
  ];
  const seen = new Set();
  const nodes = [];
  for (const g of groups) {
    let n = 0;
    document.querySelectorAll(g.selector).forEach((el) => {
      if (n >= g.cap || seen.has(el) || !visible(el)) return;
      const text = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
      if (g.tag === "card" && (text.length < 12 || text.length > 420)) return;
      seen.add(el);
      n += 1;
      el.__ssTag = g.tag;
      nodes.push(el);
    });
  }
  return nodes;
}`;

const DESCRIBE_FN_SRC = `() => window.__ssCollect().map((node, i) => {
  const tag = node.__ssTag || "link";
  const pickText = (el) => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  const text = pickText(node);
  const extra = {};
  if (tag === "a") extra.href = (node.getAttribute("href") || "").slice(0, 120);
  if (tag === "input") {
    extra.placeholder = (node.getAttribute("placeholder") || node.getAttribute("aria-label") || node.getAttribute("name") || node.type || "").slice(0, 60);
    extra.inputType = node.type || "text";
    const v = node.value || node.getAttribute("value") || "";
    if (v) extra.value = String(v).slice(0, 40);
    const lab = node.labels && node.labels[0] ? pickText(node.labels[0]) : "";
    if (lab) extra.label = lab.slice(0, 30);
  }
  if (tag === "textarea") extra.placeholder = (node.getAttribute("placeholder") || node.getAttribute("aria-label") || "").slice(0, 60);
  if (tag === "select") extra.options = Array.from(node.options || []).map((o) => (o.textContent || "").trim()).filter(Boolean).slice(0, 8);
  return { ref: i + 1, tag, text: text.slice(0, tag === "card" ? 150 : 80), ...extra };
})`;

// 把收集/描述函数注入页面全局（字符串只做赋值，不带参数调用，与快照 IIFE 同一求值模式）
async function ensureCollect(page) {
  await page.evaluate(`(() => {
    window.__ssCollect = (${COLLECT_FN_SRC});
    window.__ssDescribeAll = (${DESCRIBE_FN_SRC});
    return true;
  })()`).catch(() => {});
}

async function snapshotPage(page) {
  const data = await page.evaluate(() => {
    const elements = typeof window.__ssDescribeAll === "function" ? window.__ssDescribeAll() : [];
    const clone = document.body ? document.body.cloneNode(true) : null;
    if (clone) clone.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
    const bodyText = (clone?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      url: location.href,
      title: document.title,
      elements,
      textExcerpt: bodyText.slice(0, 2400)
    };
  }).catch(() => null);
  if (!data) return null;
  // 卡片去重：内容相同的只留第一条（列表嵌套会产生父子重复）
  const seenText = new Set();
  data.elements = data.elements.filter((e) => {
    if (e.tag !== "card") return true;
    const key = e.text.slice(0, 30);
    if (seenText.has(key)) return false;
    seenText.add(key);
    return true;
  }).slice(0, 130);
  return data;
}

function formatObservation(snapshot, goal, extracted) {
  if (!snapshot) return "（页面快照获取失败，可能是弹出新窗口或页面跳转中，请用 goto 重新打开目标网址）";
  const lines = [
    `目标：${goal}`,
    `当前页面：${snapshot.title}（${snapshot.url}）`,
    extracted ? `已记录的信息：${extracted}` : "",
    "可交互元素（用编号引用；tag=card 是页面信息块，如一趟航班/一个班次，tag=link 是 SPA 里的可点击元素）：",
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
  { type: "function", function: { name: "search_web", description: "联网搜索实时信息（航班时刻/价格/余票/店铺菜单等）。网页打不开、被安全验证拦截、或页面信息不全时用这个补充", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
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
6. extract 记录的是"用户要的结果信息"，逐条记录，最后 done 的 summary 里汇总。
7. 选平台要符合国内用户的常规习惯：订机票/火车票/酒店/门票优先用携程、飞猪、同程、美团这类综合平台（可以一次对比多家供应商的时间与价格），而不是直接扎进某一家航空公司/铁路官网；查通用信息（天气、资讯、百科）优先用百度/必应搜索；查快递用菜鸟裹裹或快递公司官网。用户给了明确网址则以用户为准。
8. 查询对比类目标（比价、查班次、查余票）不要陷入逐条翻页：收集到 2-3 个有代表性的选项后，用 ask_user 把关键差异（时间/价格/耗时）列给用户选，用户选完再继续下一步。
9. 快照里 tag=card 的条目是页面上的信息块（一趟航班、一个班次、一条商品、一条搜索结果），text 已含它的关键信息，click 卡片等于选中它；tag=link 是 SPA 里的可点击元素，同样可以 click。
10. 选定一个平台就坚持办完：先填搜索表单，再看卡片列表，用 extract 记录候选，最后 ask_user 让用户选。同一平台连续两次失败才换下一个，不要到处开网站。
11. 日期/日历控件：优先直接在日期输入框填入日期（YYYY-MM-DD 或 MM月DD日），填完按 Enter；若是弹出的日历面板，就 click 面板里的具体日期数字。
12. 页面打开后内容没加载出来（快照里几乎没东西）时，先等一拍再重新看快照，必要时 scroll 一下触发懒加载。
13. 以结果为导向：订/买/约类任务，每个阶段的目标都是"把可对比的选项交给用户"。查到的候选用 extract 记录关键差异（时间/价格/时长/评分），凑够 2-3 个就 ask_user 让用户选，用户选定后再继续执行。登录、验证码、付款一律 ask_user 把主动权交回用户。网页被安全验证拦截时不要反复重试，直接向用户说明并给选择；页面信息不全或被拦时，用 search_web 联网搜索补齐时刻、价格等关键信息。
14. 按任务类型走流程（本质都是：先弄清需求 → 收集候选 → 对比 → 交用户选 → 执行 → 敏感动作交回用户 → 汇总结果）：
- 订机票/火车票/酒店：出发地、目的地、日期、人数、舱位/席别缺失时先问用户；查 2-3 个候选（时间/价格/耗时），用户选定后进入预订；填乘机人信息前逐项与用户确认；付款必须用户自己来。
- 订外卖/买东西：地址、口味/规格、预算缺失先问；列出 2-3 个合适选项（店名/价格/评分/预计送达），用户选定后下单；支付交回用户。
- 订餐厅/预约服务：时间、人数、偏好先问；找到合适档位后把可约时段交给用户选；提交预约前向用户确认。
- 查资料/比价：直接用 search_web 或搜索引擎；把结论用 extract 汇总，done 时给出清晰答案和出处。
- 借用用户账号在社交平台上互动：先向用户确认要做什么、发布什么内容；任何发布、点赞、评论、关注等对外可见的动作，执行前必须把具体内容给用户过目确认；用户说"可以/发吧"才执行。
15. 涉及真实下单、提交订单、发布内容等"不可逆动作"前，必须先把将要做的事（买了什么/发布了什么）用 ask_user 向用户确认，得到肯定答复再执行。`;

// 中国时区当前日期时间（注入 system，避免模型用训练数据里的旧日期）
function chinaNowText() {
  const cn = new Date(Date.now() + 8 * 3600 * 1000);
  return cn.toISOString().slice(0, 16).replace("T", " ");
}

async function executeTool(session, name, args) {
  const page = session.page;

  switch (name) {
    case "goto": {
      const url = assertPublicUrl(args.url);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(800);
      return `已打开 ${page.url()}`;
    }
    case "click": {
      const clicked = await page.evaluate((refIndex) => {
        const elements = window.__ssCollect();
        const node = elements[refIndex - 1];
        if (!node) return false;
        node.scrollIntoView({ block: "center" });
        ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
          node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
        return true;
      }, Number(args.ref));
      await page.waitForTimeout(700);
      await dismissPopups(session);
      return clicked ? "已点击" : "元素不存在或编号失效，请重新看最新快照";
    }
    case "fill": {
      const filled = await page.evaluate(({ refIndex, text }) => {
        const elements = window.__ssCollect();
        const meta = elements[refIndex - 1];
        if (!meta) return "missing";
        const node = meta;
        node.scrollIntoView({ block: "center" });
        node.focus();
        const proto = node.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(node, text); else node.value = text;
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
        return "ok";
      }, { refIndex: Number(args.ref), text: String(args.text ?? "") });
      if (filled !== "ok") return "输入框不存在或编号失效，请重新看最新快照";
      await page.waitForTimeout(300);
      return "已填写";
    }
    case "select": {
      const selected = await page.evaluate(({ refIndex, option }) => {
        const elements = window.__ssCollect();
        const meta = elements[refIndex - 1];
        if (!meta) return "missing";
        const node = meta;
        const opts = Array.from(node.options || []);
        const hit = opts.find((o) => (o.textContent || "").trim() === option)
          || opts.find((o) => o.value === option)
          || opts.find((o) => (o.textContent || "").includes(option));
        if (!hit) return "nooption";
        node.value = hit.value;
        node.dispatchEvent(new Event("change", { bubbles: true }));
        return "ok";
      }, { refIndex: Number(args.ref), option: String(args.option || "") });
      if (selected === "missing") return "下拉框不存在或编号失效，请重新看最新快照";
      if (selected === "nooption") return "没有匹配的选项，请从快照的选项列表里挑一个";
      await page.waitForTimeout(300);
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
    case "search_web": {
      const query = String(args.query || "").slice(0, 200);
      if (!query) return "请输入搜索内容";
      const r = await invokeKimiWebSearch({ query });
      const answer = String(r?.answer || "").trim();
      return answer ? answer.slice(0, 2000) : "没有搜到有效结果";
    }
    default:
      return "未知工具";
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
  if (tool === "search_web") return String(a.query || "").slice(0, 60);
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

    await ensureCollect(session.page);
    const snapshot = await snapshotPage(session.page);
    session.lastSnapshot = snapshot;
    if (snapshot?.url) session.currentUrl = snapshot.url;
    await saveScreenshot(session);

    // 反爬拦截识别：页面出现安全验证特征时不浪费步数，直接向用户给出选择
    if (!session.blockAsked && snapshot && /whale|captcha|滑块|滑动验证|安全验证|访问验证|人机验证|请完成验证|异常流量|访问过于频繁/i.test(`${snapshot.title} ${snapshot.textExcerpt}`)) {
      session.blockAsked = true;
      const question = "这个网站触发了安全验证（反爬拦截），小助手过不去。你可以亲自操作网页完成验证，也可以换一种方式继续。";
      logStep(session, "ask_user", {}, "页面被安全验证拦截");
      session.status = "waiting_input";
      session.waiting = { question, choices: ["我自己来操作网页", "换个网站试试", "先到这里"] };
      persist(session);
      const answer = await new Promise((resolve) => { session.pendingResolve = resolve; });
      session.pendingResolve = null;
      session.waiting = null;
      const choice = String(answer?.choice || "");
      if (answer?.takeover || choice.includes("我自己来操作")) {
        session.takeover = true;
        logStep(session, "takeover", {}, "用户选择亲自操作网页");
      } else if (choice.includes("先到这里")) {
        session.status = "done";
        session.finalSummary = "网站的安全验证拦住了小助手，已按你的意思先停在这里；想继续时可以在守护记录里再试一次，或选择亲自操作网页。";
        logStep(session, "done", {}, session.finalSummary);
        persist(session);
        return { summary: session.finalSummary, extracted: session.extracted, url: session.currentUrl, screenshot: session.latestScreenshot };
      } else {
        session.status = "running";
        session.history.push({ role: "user", content: "（用户表示：换个网站试试）" });
        logStep(session, "user_answer", {}, "用户选择换个网站");
      }
      persist(session);
      continue;
    }

    const observation = formatObservation(snapshot, session.goal, session.extracted);
    const messages = [
      {
        role: "system",
        content: `${AGENT_SYSTEM}\n\n当前日期时间（中国时区，真实世界）：${chinaNowText()}。计算"明天""下周""X月X日"等相对时间一律以这个真实日期为准；页面日历上显示的"今天"若与它对不上，以真实日期为准并提醒用户。`
      },
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
        if (answer?.takeover || (answer?.choice && answer.choice.includes("我自己来操作"))) {
          // 用户选择亲自操作网页：进入接管模式（截图流 + 点按转发）
          session.takeover = true;
          logStep(session, "takeover", {}, "用户选择亲自操作网页");
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
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    // 桌面 Chrome UA，避免 HeadlessChrome 特征被反爬一眼识破
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    extraHTTPHeaders: { "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" }
  });
  // 基础隐身：抹掉自动化指纹（挡不住硬验证，但能通过大多数基础检测）
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["zh-CN", "zh", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    window.chrome = window.chrome || { runtime: {} };
  });
  const page = await context.newPage();

  const session = {
    executionId: execution.id,
    goal,
    prisma,
    browser,
    context,
    page,    history: [],
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
    blockAsked: false,
    error: null
  };
  sessions.set(execution.id, session);

  // target=_blank 打开的新标签页（如搜索结果新开页）自动接管为当前页，
  // 避免 Agent 盯着旧页面看。点击后的 dismissPopups 会清掉其余标签页。
  context.on("page", (p) => {
    p.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {}).then(() => {
      if (session.page !== p) session.page = p;
    });
  });

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
