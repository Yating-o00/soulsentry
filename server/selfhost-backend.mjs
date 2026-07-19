import http from "node:http";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "uploads");
const dbPath = path.join(dataDir, "db.json");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
let writeQueue = Promise.resolve();

const DEFAULT_USER = {
  id: "local-user",
  email: process.env.SELF_HOST_DEFAULT_EMAIL || "local@xinzhan.local",
  full_name: process.env.SELF_HOST_DEFAULT_NAME || "本地用户",
  assistant_name: "小雅",
  role: "admin",
  ai_credits: 100000,
  subscription_plan: "pro",
  avatar_url: "",
  created_date: new Date().toISOString(),
  updated_date: new Date().toISOString(),
  location_tracking_enabled: true,
  push_enabled: false,
};

const DEFAULT_DB = {
  meta: {
    currentUserId: DEFAULT_USER.id,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
    createdAt: new Date().toISOString(),
  },
  users: [DEFAULT_USER],
  entities: {
    User: [DEFAULT_USER],
    UserPreference: [
      {
        id: randomId("pref"),
        user_id: DEFAULT_USER.id,
        onboarded: false,
        enabled_card_types: ["geo_context", "decision_preload", "on_the_way"],
        location_tracking_enabled: true,
        push_enabled: false,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      },
    ],
  },
  uploads: [],
  orders: {},
  emails: [],
  sms: [],
};

function randomId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function json(data, status = 200, headers = {}) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      ...headers,
    },
    body: JSON.stringify(data),
  };
}

function text(body, status = 200, headers = {}) {
  return {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
    body,
  };
}

async function ensureStorage() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
}

async function readDb() {
  await ensureStorage();
  if (!existsSync(dbPath)) {
    await fs.writeFile(dbPath, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
  }
  const raw = await fs.readFile(dbPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const backupPath = path.join(
      dataDir,
      `db.broken.${Date.now()}.json`
    );
    await fs.writeFile(backupPath, raw, "utf8");
    await fs.writeFile(dbPath, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
    parsed = structuredClone(DEFAULT_DB);
  }
  parsed.entities = parsed.entities || {};
  parsed.users = parsed.users || [];
  parsed.meta = parsed.meta || {};
  parsed.uploads = parsed.uploads || [];
  parsed.orders = parsed.orders || {};
  parsed.emails = parsed.emails || [];
  parsed.sms = parsed.sms || [];
  return parsed;
}

async function writeDb(db) {
  await ensureStorage();
  const serialized = JSON.stringify(db, null, 2);
  const tempPath = `${dbPath}.tmp`;
  writeQueue = writeQueue.then(async () => {
    await fs.writeFile(tempPath, serialized, "utf8");
    await fs.rename(tempPath, dbPath);
  });
  await writeQueue;
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function send(res, payload) {
  res.writeHead(payload.status, payload.headers);
  res.end(payload.body);
}

function parseUrl(req) {
  return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
}

function getEntityStore(db, name) {
  if (!db.entities[name]) db.entities[name] = [];
  return db.entities[name];
}

function getCurrentUser(db) {
  const userId = db.meta.currentUserId || DEFAULT_USER.id;
  const fromUsers = db.users.find((item) => item.id === userId);
  if (fromUsers) return fromUsers;
  const userList = getEntityStore(db, "User");
  const fromEntities = userList.find((item) => item.id === userId);
  if (fromEntities) return fromEntities;
  userList.push(DEFAULT_USER);
  db.users = userList;
  db.meta.currentUserId = DEFAULT_USER.id;
  return DEFAULT_USER;
}

function normalizeRecord(data = {}, currentUserId) {
  const now = new Date().toISOString();
  return {
    id: data.id || randomId("rec"),
    created_date: data.created_date || now,
    updated_date: now,
    user_id: data.user_id || currentUserId || DEFAULT_USER.id,
    ...data,
  };
}

function matchesFilter(record, filter = {}) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    const actual = record?.[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if (Array.isArray(expected.$in)) {
        return expected.$in.includes(actual);
      }
      if (expected.$ne !== undefined) {
        return actual !== expected.$ne;
      }
      if (expected.$contains !== undefined) {
        return String(actual || "").includes(String(expected.$contains));
      }
      return Object.entries(expected).every(([subKey, subValue]) => {
        return actual?.[subKey] === subValue;
      });
    }
    if (expected === null) {
      return actual === null || actual === undefined;
    }
    if (Array.isArray(actual)) {
      return actual.includes(expected);
    }
    return actual === expected;
  });
}

function sortRecords(records, sortSpec) {
  if (!sortSpec) return [...records];
  const key = sortSpec.startsWith("-") ? sortSpec.slice(1) : sortSpec;
  const direction = sortSpec.startsWith("-") ? -1 : 1;
  return [...records].sort((left, right) => {
    const a = left?.[key];
    const b = right?.[key];
    if (a === b) return 0;
    if (a === undefined || a === null) return 1;
    if (b === undefined || b === null) return -1;
    if (typeof a === "number" && typeof b === "number") {
      return (a - b) * direction;
    }
    return String(a).localeCompare(String(b), "zh-CN") * direction;
  });
}

function limitRecords(records, limit) {
  if (!limit) return records;
  const size = Number(limit);
  if (!Number.isFinite(size) || size <= 0) return records;
  return records.slice(0, size);
}

function parseMaybeJson(value) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function extractPrompt(payload = {}) {
  if (payload.prompt) return String(payload.prompt);
  if (Array.isArray(payload.messages)) {
    return payload.messages
      .map((message) => `${message.role || "user"}: ${message.content || ""}`)
      .join("\n\n");
  }
  return "";
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function formatDateZh(input) {
  return new Date(input).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function splitMeaningfulLines(text) {
  return String(text || "")
    .split(/\n|；|;|。/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function inferCategory(text) {
  const source = String(text || "");
  if (/(会议|项目|客户|汇报|代码|研发|工作)/.test(source)) return "work";
  if (/(跑步|运动|健身|医院|体检|睡眠)/.test(source)) return "health";
  if (/(学习|复习|阅读|课程|考试)/.test(source)) return "study";
  if (/(家人|家庭|父母|孩子)/.test(source)) return "family";
  if (/(购物|买|下单|快递|超市)/.test(source)) return "shopping";
  if (/(预算|报销|发票|付款|账单|理财)/.test(source)) return "finance";
  return "personal";
}

function inferPriority(text) {
  if (/(马上|立刻|尽快|今天必须|紧急|urgent)/i.test(text || "")) {
    return "high";
  }
  if (/(重要|关键|本周|deadline)/i.test(text || "")) {
    return "medium";
  }
  return "low";
}

function parseDateFromText(text, fallbackDate) {
  const base = fallbackDate ? new Date(`${fallbackDate}T09:00:00`) : new Date();
  const source = String(text || "");
  if (/明天/.test(source)) {
    base.setDate(base.getDate() + 1);
  } else if (/后天/.test(source)) {
    base.setDate(base.getDate() + 2);
  } else if (/下周/.test(source)) {
    base.setDate(base.getDate() + 7);
  }
  const dateMatch = source.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
  }
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(
    base.getDate()
  ).padStart(2, "0")}`;
}

function parseTimeFromText(text, defaultHour = 9) {
  const source = String(text || "");
  const explicit = source.match(/(\d{1,2})[:：](\d{2})/);
  if (explicit) {
    return `${explicit[1].padStart(2, "0")}:${explicit[2]}`;
  }
  const hourMatch = source.match(/(\d{1,2})点/);
  if (hourMatch) {
    let hour = Number(hourMatch[1]);
    if (/下午|晚上/.test(source) && hour < 12) hour += 12;
    return `${String(hour).padStart(2, "0")}:00`;
  }
  if (/上午|早上/.test(source)) return "09:00";
  if (/中午/.test(source)) return "12:00";
  if (/下午/.test(source)) return "15:00";
  if (/晚上/.test(source)) return "19:00";
  return `${String(defaultHour).padStart(2, "0")}:00`;
}

function plusDays(dateString, delta) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function getWeekDates(startDate) {
  return Array.from({ length: 7 }, (_, index) => plusDays(startDate, index));
}

function haversineDistanceMeters(a, b) {
  if (!a || !b) return Infinity;
  if (!isFinite(a.latitude) || !isFinite(a.longitude) || !isFinite(b.latitude) || !isFinite(b.longitude)) {
    return Infinity;
  }
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const inner =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(inner));
}

async function invokeMoonshot(payload = {}) {
  const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!apiKey) return null;

  const prompt = extractPrompt(payload);
  const messages = Array.isArray(payload.messages)
    ? payload.messages
    : [
        {
          role: "system",
          content:
            payload.system_prompt ||
            "You are a precise AI assistant. Return JSON only when the user explicitly asks for JSON.",
        },
        {
          role: "user",
          content: [
            prompt,
            Array.isArray(payload.file_urls) && payload.file_urls.length
              ? `\n\nAttached file URLs:\n${payload.file_urls.join("\n")}`
              : "",
          ]
            .filter(Boolean)
            .join(""),
        },
      ];

  const response = await fetch(
    process.env.MOONSHOT_API_BASE || "https://api.moonshot.cn/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: payload.model || process.env.MOONSHOT_MODEL || "moonshot-v1-8k",
        temperature: payload.temperature ?? 0.3,
        messages,
        ...(payload.response_json_schema
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Moonshot API error: ${response.status} ${detail}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function runLLM(payload = {}) {
  const content = await invokeMoonshot(payload).catch(() => null);
  if (payload.response_json_schema) {
    const parsed = extractJson(content || "");
    if (parsed) return parsed;
  }
  if (content) return { text: content };
  return fallbackLLM(payload);
}

function fallbackLLM(payload = {}) {
  const prompt = extractPrompt(payload);
  const schema = payload.response_json_schema || {};
  const properties = schema.properties || {};

  if (properties.translations) {
    const lines = prompt
      .split("\n")
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
      .filter((line) => !/^Input:?$/i.test(line));
    return { translations: lines };
  }

  if (properties.items) {
    const items = splitMeaningfulLines(prompt).map((line) => ({
      kind: /(待办|提醒|要|需要|安排|会议|复盘|跟进)/.test(line) ? "commitment" : "note",
      text: line.slice(0, 120),
    }));
    return { items };
  }

  if (properties.title && properties.priority && properties.category) {
    const lines = splitMeaningfulLines(prompt);
    const first = lines[0] || "待处理事项";
    return {
      title: first.slice(0, 30),
      description: lines.join("\n").slice(0, 400),
      priority: inferPriority(prompt),
      category: inferCategory(prompt),
      reminder_time: new Date().toISOString(),
    };
  }

  return {
    text: `本地 AI 已收到请求，但未配置 Kimi Key。原始提示如下：\n\n${prompt}`.trim(),
  };
}

async function handleInvokeLLM(body) {
  const result = await runLLM(body || {});
  if (result && typeof result === "object" && result.text && !body?.response_json_schema) {
    return result;
  }
  return result;
}

async function handleUploadFile(body) {
  const name = body?.name || "upload.bin";
  const dataUrl = String(body?.data_url || "");
  const type = body?.type || "application/octet-stream";
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
  if (!base64) {
    throw new Error("Missing file data");
  }
  const extension = path.extname(name) || inferExtensionFromMime(type);
  const fileName = `${Date.now()}_${crypto.randomUUID()}${extension}`;
  const filePath = path.join(uploadsDir, fileName);
  await fs.writeFile(filePath, Buffer.from(base64, "base64"));
  return {
    file_url: `http://localhost:${PORT}/uploads/${fileName}`,
    file_name: name,
    mime_type: type,
    size: body?.size || Buffer.byteLength(base64, "base64"),
  };
}

function inferExtensionFromMime(mime = "") {
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("json")) return ".json";
  if (mime.includes("plain")) return ".txt";
  return ".bin";
}

function buildImageUrl(prompt, imageSize = "landscape_16_9") {
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    prompt
  )}&image_size=${imageSize}`;
}

async function handleGenerateImage(body) {
  const prompt =
    body?.prompt ||
    "soft gradient productivity dashboard background, clean composition, premium web illustration";
  return {
    url: buildImageUrl(prompt, body?.image_size || "landscape_16_9"),
  };
}

async function handleSendEmail(db, body) {
  const record = {
    id: randomId("mail"),
    to: body?.to,
    subject: body?.subject || "No subject",
    body: body?.body || "",
    created_at: new Date().toISOString(),
  };
  db.emails.push(record);
  await writeDb(db);
  return { success: true, id: record.id };
}

async function handleSendSMS(db, body) {
  const record = {
    id: randomId("sms"),
    to: body?.to,
    body: body?.body || "",
    created_at: new Date().toISOString(),
  };
  db.sms.push(record);
  await writeDb(db);
  return { success: true, id: record.id };
}

async function handleExtractDataFromUploadedFile(body) {
  return {
    text: `已记录文件：${(body?.file_urls || []).join(", ")}`,
    metadata: {
      file_urls: body?.file_urls || [],
    },
  };
}

async function analyzeHeartSign(db, body) {
  const notes = getEntityStore(db, "Note");
  const note =
    notes.find((item) => item.id === body?.note_id) ||
    (body?.note_data
      ? {
          id: body.note_id || randomId("note"),
          ...body.note_data,
        }
      : null);
  if (!note) {
    return { success: false, error: "Note not found" };
  }

  const plain = String(note.plain_text || note.content || "").trim();
  const summary = plain.slice(0, 80) || "空白心签";
  const tags = Array.from(
    new Set(
      [note.source_type, inferCategory(plain), ...(Array.isArray(note.tags) ? note.tags : [])].filter(Boolean)
    )
  ).slice(0, 6);

  const analysis = {
    summary,
    key_points: splitMeaningfulLines(plain).slice(0, 5),
    mood: /开心|高兴|满意|庆祝/.test(plain)
      ? "positive"
      : /焦虑|担心|压力|难过/.test(plain)
        ? "negative"
        : "neutral",
    suggested_tags: tags,
    updated_at: new Date().toISOString(),
  };

  const existingIndex = notes.findIndex((item) => item.id === note.id);
  if (existingIndex !== -1) {
    notes[existingIndex] = {
      ...notes[existingIndex],
      ai_status: "done",
      ai_analysis: analysis,
      tags: Array.from(new Set([...(notes[existingIndex].tags || []), ...tags])),
      updated_date: new Date().toISOString(),
    };
    await writeDb(db);
  }

  return { success: true, analysis };
}

async function translateTask(body) {
  const toEnglish = /english/i.test(body?.targetLang || "");
  const translate = (value) => {
    const text = String(value || "");
    if (!text) return "";
    if (toEnglish) return `[EN] ${text}`;
    return `[中] ${text}`;
  };

  return {
    title: translate(body?.title),
    description: translate(body?.description),
    subtasks: (body?.subtasks || []).map((item) => ({
      id: item.id,
      title: translate(item.title),
      description: translate(item.description),
    })),
    notes: (body?.notes || []).map((item) => ({
      index: item.index,
      content: translate(item.content),
    })),
  };
}

async function callAI(db, body) {
  const user = getCurrentUser(db);
  if ((user.ai_credits || 0) < 1) {
    return {
      error: "INSUFFICIENT_CREDITS",
      message: "AI 点数不足",
      balance: user.ai_credits || 0,
    };
  }

  const result = await handleInvokeLLM(body || {});
  user.ai_credits = Math.max(0, (user.ai_credits || 0) - 1);
  user.updated_date = new Date().toISOString();

  const users = getEntityStore(db, "User");
  const userIndex = users.findIndex((item) => item.id === user.id);
  if (userIndex !== -1) users[userIndex] = { ...users[userIndex], ...user };
  db.users = users;

  const transactions = getEntityStore(db, "AICreditTransaction");
  transactions.unshift({
    id: randomId("credit"),
    type: "consume",
    amount: -1,
    balance_after: user.ai_credits,
    description: body?.feature || "general_ai",
    created_date: new Date().toISOString(),
    updated_date: new Date().toISOString(),
    user_id: user.id,
  });
  await writeDb(db);

  return {
    data: result?.text !== undefined && !body?.response_json_schema ? result.text : result,
    balance: user.ai_credits,
  };
}

function analyzeIntent(body) {
  const input = String(body?.input || "");
  const fallbackDate = body?.date || parseDateFromText(input);
  const lines = splitMeaningfulLines(input).slice(0, 8);
  const timeline = lines.map((line, index) => ({
    time: parseTimeFromText(line, 9 + index),
    title: line.slice(0, 30),
    description: line,
    type: /(会议|通话|沟通)/.test(line) ? "meeting" : "focus",
    date: parseDateFromText(line, fallbackDate),
  }));
  const automations = lines
    .filter((line) => /(发|整理|同步|总结|写|生成|提醒)/.test(line))
    .slice(0, 4)
    .map((line) => ({
      title: line.slice(0, 30),
      desc: line,
      status: "ready",
    }));

  const devices = [];
  if (/手机|移动/.test(input)) devices.push({ name: "手机", mode: "mobile" });
  if (/电脑|桌面/.test(input)) devices.push({ name: "电脑", mode: "desktop" });

  return {
    resolved_date: fallbackDate,
    parsed: {
      intents: [lines[0] || "今日规划"],
    },
    timeline,
    automations,
    devices,
  };
}

function generateDailyBriefing(db) {
  const tasks = getEntityStore(db, "Task").filter((item) => !item.deleted_at);
  const today = new Date().toISOString().slice(0, 10);
  const active = tasks.filter((item) => !["completed", "cancelled"].includes(item.status));
  const urgent = active.filter((item) => ["high", "urgent"].includes(item.priority));
  const overdue = active.filter(
    (item) => item.reminder_time && String(item.reminder_time).slice(0, 10) < today
  );
  const todayDue = active.filter(
    (item) => item.reminder_time && String(item.reminder_time).slice(0, 10) === today
  );
  const recentCompleted = tasks.filter((item) => item.status === "completed").slice(0, 10).length;

  return {
    title: "今日心栈简报",
    greeting: "今天也继续把重要的事推进一点点。",
    short_term_narrative:
      todayDue.length > 0
        ? `今天重点看 ${todayDue.length} 项到期任务，优先处理最靠前的安排。`
        : "今天没有密集到期项，适合推进长期目标和整理积压事项。",
    long_term_narrative:
      active.length > 0
        ? `当前仍有 ${active.length} 项活跃任务在路上，建议把最高优先级的 1~3 项拉到今天。`
        : "当前任务池比较轻，可以趁机做复盘、总结和知识整理。",
    value_guidance: urgent.length > 0 ? "先做最重要的，不被低价值噪音打断。" : "保持节奏感，比一次性爆发更可持续。",
    mindful_tip: "给自己留出 20 分钟的空白缓冲。",
    task_stats: {
      active: active.length,
      urgent: urgent.length,
      overdue: overdue.length,
      today_due: todayDue.length,
      recent_completed: recentCompleted,
    },
  };
}

function generateWeekPlan(body) {
  const startDate = body?.startDate || new Date().toISOString().slice(0, 10);
  const dates = getWeekDates(startDate);
  const lines = splitMeaningfulLines(body?.input || "").slice(0, 7);
  const baseEvents = (lines.length ? lines : ["推进重点事项", "处理协作与沟通", "整理复盘与知识沉淀"]).map(
    (line, index) => ({
      title: line.slice(0, 30),
      description: line,
      date: dates[index % dates.length],
      time: ["09:00", "14:00", "19:00"][index % 3],
      type: /(会议|沟通)/.test(line) ? "meeting" : "focus",
    })
  );

  return {
    plan_start_date: startDate,
    theme: lines[0] || "本周推进",
    summary: `围绕“${lines[0] || "本周推进"}”展开，兼顾执行、沟通和复盘。`,
    stats: {
      focus_hours: baseEvents.length * 2,
      meetings: baseEvents.filter((item) => item.type === "meeting").length,
    },
    events: baseEvents,
    automations: [
      { title: "同步关键任务到提醒中心", description: "把本周重点事项写入任务流", status: "ready" },
      { title: "周中复盘提醒", description: "在周三自动提醒复盘当前进度", status: "ready" },
    ],
    device_strategies: {
      phone: "移动场景只处理轻量沟通和确认动作。",
      desktop: "桌面时段安排深度工作与文档输出。",
      watch: "仅保留高优先级提醒，避免噪音。",
    },
  };
}

function generateMonthPlan(body) {
  const startDate = body?.startDate || new Date().toISOString().slice(0, 10);
  const lines = splitMeaningfulLines(body?.input || "").slice(0, 6);
  const milestones = (lines.length ? lines : ["明确本月主题", "完成关键交付", "建立稳定习惯"]).map(
    (line, index) => ({
      title: line.slice(0, 30),
      type: index === 0 ? "goal" : index === 1 ? "delivery" : "milestone",
      deadline: plusDays(startDate, index * 7 + 2),
    })
  );

  return {
    plan_start_date: startDate,
    theme: lines[0] || "月度推进",
    summary: `本月围绕“${lines[0] || "月度推进"}”拆解目标、节奏与关键里程碑。`,
    stats: {
      focus_hours: milestones.length * 8,
      milestones_count: milestones.length,
    },
    strategies: {
      execution: "把目标拆成每周可验证的小步推进。",
      recovery: "每周保留半天用于整理、补位和恢复。",
      collaboration: "提前确认需要协作的资源和时间窗口。",
    },
    key_milestones: milestones,
    weeks_breakdown: Array.from({ length: 4 }, (_, index) => ({
      week_label: `第${index + 1}周`,
      focus: milestones[index]?.title || `推进第 ${index + 1} 周重点`,
      key_events: milestones
        .slice(index, index + 2)
        .map((item) => `${item.title} · ${item.deadline}`),
    })),
  };
}

function generateSmartReminders(body) {
  const title = String(body?.title || body?.task_title || "当前任务");
  return {
    reminders: [
      { minutes_before: 60, copy: `距「${title}」还有 1 小时，适合现在收尾并切换上下文。`, channel: "browser" },
      { minutes_before: 15, copy: `「${title}」快到了，开始准备进入执行状态。`, channel: "browser" },
      { minutes_before: 0, copy: `现在就开始「${title}」吧。`, channel: "browser" },
    ],
  };
}

function weaveInputToTasks(body) {
  const text = String(body?.text || "");
  const items = splitMeaningfulLines(text).slice(0, 5);
  const tasks = items.map((item) => ({
    title: item.slice(0, 30),
    description: item,
    priority: inferPriority(item),
    category: inferCategory(item),
  }));
  return { tasks };
}

function getTaskLocation(task) {
  return {
    latitude: Number(task?.latitude || task?.lat || task?.location_latitude),
    longitude: Number(task?.longitude || task?.lng || task?.location_longitude),
  };
}

function nearbyTaskMatcher(db, body) {
  const current = {
    latitude: Number(body?.latitude),
    longitude: Number(body?.longitude),
  };
  const tasks = getEntityStore(db, "Task")
    .filter((item) => !item.deleted_at && !["completed", "cancelled"].includes(item.status))
    .map((item) => {
      const location = getTaskLocation(item);
      const distance = haversineDistanceMeters(current, location);
      return { item, distance };
    })
    .filter((entry) => Number.isFinite(entry.distance) && entry.distance <= 3000)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 5)
    .map((entry) => ({
      task_id: entry.item.id,
      title: entry.item.title,
      distance_meters: Math.round(entry.distance),
      minutes: Math.max(5, Math.round(entry.distance / 80)),
      first_step: entry.item.description?.slice(0, 40) || "打开任务查看详情",
    }));

  return { matches: tasks };
}

function getSceneContextTasks(db, body) {
  const matches = nearbyTaskMatcher(db, body).matches;
  if (!matches.length) {
    return { scene: null, actions: [] };
  }
  return {
    scene: {
      name: "附近场景",
      icon: "📍",
    },
    headline: "你已经接近这些可顺手完成的事项",
    actions: matches.map((item) => ({
      task_id: item.task_id,
      title: item.title,
      minutes: item.minutes,
      first_step: item.first_step,
    })),
  };
}

function getSentinelGuard(db, body) {
  const geo = getSceneContextTasks(db, body);
  const tasks = getEntityStore(db, "Task").filter(
    (item) => !item.deleted_at && !["completed", "cancelled"].includes(item.status)
  );
  const stale = tasks
    .filter((item) => {
      const updated = new Date(item.updated_date || item.created_date || 0).getTime();
      return Date.now() - updated > 5 * 24 * 60 * 60 * 1000;
    })
    .slice(0, 1)[0];

  return {
    geo_context: geo.actions.length
      ? {
          title: "附近可推进事项",
          subtitle: `${geo.actions.length} 条任务与你当前场景相关`,
          headline: geo.headline,
          priority: "high",
          today_tasks: geo.actions.map((item) => ({
            id: item.task_id,
            title: item.title,
            time: `${item.minutes}min`,
            priority: "medium",
            overdue_days: 0,
          })),
          cta_link: "/Tasks",
        }
      : null,
    forgetting_rescue: stale
      ? {
          primary: {
            title: stale.title,
            reason: "已较久未更新，可能被遗忘",
            cta_link: "/Tasks",
          },
        }
      : {},
  };
}

function getAssociationRecommendations(db) {
  const recentTasks = sortRecords(getEntityStore(db, "Task"), "-updated_date")
    .filter((item) => !item.deleted_at)
    .slice(0, 2);
  const recentNotes = sortRecords(getEntityStore(db, "Note"), "-updated_date")
    .filter((item) => !item.deleted_at)
    .slice(0, 2);
  return {
    sequential_recommendation:
      recentTasks.length >= 2
        ? {
            title: `${recentTasks[0].title} 之后可继续 ${recentTasks[1].title}`,
            reason: "最近常一起出现，可串联处理。",
          }
        : null,
    location_pattern:
      recentNotes.length >= 1
        ? {
            title: "地点与心签关联已更新",
            reason: "可把常去地点绑定到相关任务，提高提醒命中率。",
          }
        : null,
  };
}

function getSmartContextCards(db, body) {
  const matches = nearbyTaskMatcher(db, body).matches;
  const cards = [];
  if (matches[0]) {
    cards.push({
      type: "on_the_way",
      title: "顺路提醒",
      subtitle: "你正在接近可完成的任务",
      meta: `${matches[0].distance_meters} 米内`,
      cta_link: "/Tasks",
    });
  }

  const focusTask = sortRecords(getEntityStore(db, "Task"), "-updated_date").find(
    (item) => !item.deleted_at && !["completed", "cancelled"].includes(item.status)
  );
  if (focusTask) {
    cards.push({
      type: "decision_preload",
      title: "提前准备",
      subtitle: "把阻塞点提前想清楚",
      headline: `下一步可直接推进「${focusTask.title}」`,
      payload_title: focusTask.title,
      suggestions: ["确认输入材料", "预留 25 分钟专注块", "完成后顺手做记录"],
      context_note: focusTask.description?.slice(0, 80) || "",
      cta_link: "/Tasks",
    });
  }

  const guard = getSentinelGuard(db, body);
  if (guard.geo_context) {
    cards.push({
      type: "geo_context",
      ...guard.geo_context,
    });
  }

  return { cards };
}

function suggestGeofenceParams(body) {
  const address = String(body?.address || body?.query || body?.text || "");
  return {
    address,
    latitude: Number(body?.latitude) || 39.9042,
    longitude: Number(body?.longitude) || 116.4074,
    radius_meters: 300,
    quiet_hours: { start: "22:00", end: "08:00" },
    hints: [
      "默认使用 WGS-84 坐标",
      "半径建议根据场景在 200m~500m 之间微调",
    ],
  };
}

async function fetchExternalFeeds(db, body) {
  const feeds = getEntityStore(db, "ExternalFeed");
  const notes = getEntityStore(db, "Note");
  const targetFeeds = body?.feed_id ? feeds.filter((item) => item.id === body.feed_id) : feeds;
  let archived = 0;

  for (const feed of targetFeeds) {
    if (!feed?.url) continue;
    try {
      const response = await fetch(feed.url, {
        headers: {
          "User-Agent": "XinZhanSelfHost/1.0",
        },
      });
      const xml = await response.text();
      const items = parseRssItems(xml).slice(0, 5);
      for (const item of items) {
        if (notes.some((entry) => entry.source_url && entry.source_url === item.link)) {
          continue;
        }
        notes.push(
          normalizeRecord(
            {
              id: randomId("note"),
              content: `<p><strong>${item.title}</strong></p><p>${item.description}</p>`,
              plain_text: `${item.title} ${item.description}`.trim(),
              source_type: "external_feed",
              source_url: item.link,
              tags: [feed.name, feed.feed_type].filter(Boolean),
              ai_status: "pending",
            },
            DEFAULT_USER.id
          )
        );
        archived += 1;
      }
      feed.last_fetched_at = new Date().toISOString();
      feed.last_item_count = items.length;
    } catch (error) {
      feed.last_error = error.message;
    }
  }

  await writeDb(db);
  return {
    success: true,
    archived,
  };
}

function parseRssItems(xml) {
  const blocks = String(xml || "").match(/<item[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block) => {
    const getTag = (tag) => {
      const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return match ? stripHtml(match[1]) : "";
    };
    return {
      title: getTag("title"),
      description: getTag("description"),
      link: getTag("link"),
      pubDate: getTag("pubDate"),
    };
  });
}

function stripHtml(input) {
  return String(input || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getExternalVision(db) {
  const notes = sortRecords(getEntityStore(db, "Note"), "-created_date").slice(0, 5);
  const cards = notes.map((item, index) => ({
    type: ["news", "classic", "expansion"][index % 3],
    title: item.plain_text?.slice(0, 24) || `外部视角 ${index + 1}`,
    summary:
      item.ai_analysis?.summary ||
      item.plain_text?.slice(0, 80) ||
      "从近期记录里提炼出的相关外部视角建议。",
    source: item.tags?.[0] || "心栈",
    relevance: "基于你最近的心签主题推送",
    url: item.source_url || "",
  }));
  return { cards };
}

function kimiWebBrowse(body) {
  return {
    answer: `围绕“${body?.query || "当前主题"}”的本地整理结果：建议先看最新趋势、对比主流方案、再结合你自己的任务背景做判断。`,
    references: [],
  };
}

function kimiMemoryInsight(db, body) {
  const tasks = getEntityStore(db, "Task").filter((item) => !item.deleted_at);
  const notes = getEntityStore(db, "Note").filter((item) => !item.deleted_at);
  return {
    answer: `当前共沉淀 ${notes.length} 条心签、${tasks.length} 条任务。你最近更适合把零散记录收束成 1~2 个明确主题。`,
    highlights: notes.slice(0, 3).map((item) => item.plain_text?.slice(0, 40) || item.title),
    prompt: body?.prompt || "",
  };
}

function kimiPersonalInsight(db, body) {
  const points = getEntityStore(db, "UserDataPoint");
  const tasks = getEntityStore(db, "Task").filter((item) => !item.deleted_at);
  if (body?.mode === "profile" || body?.scope === "profile") {
    return {
      title: "你的执行画像",
      summary: `当前累计 ${tasks.length} 条任务、${points.length} 条行为数据。你偏向在有明确时间框架时推进更快。`,
      strengths: ["能快速把模糊想法转成任务", "愿意记录和复盘"],
      suggestions: ["给长期目标设置更小的里程碑", "把高频重复动作沉淀成模板"],
    };
  }
  if (body?.mode === "deferral_guess") {
    return {
      reason: "任务可能因为上下文切换成本高、缺少明确第一步而被顺延。",
      recommendation: "把任务改写成 15 分钟可启动的小动作。",
    };
  }
  return {
    scene: body?.scene || "当前场景",
    suggestion: "优先处理最小可完成单元，减少切换。",
  };
}

function getAutomationTrust(db) {
  const executions = getEntityStore(db, "TaskExecution");
  return {
    score: executions.length > 10 ? 0.82 : 0.65,
    total_runs: executions.length,
    successful_runs: executions.filter((item) => item.execution_status === "completed").length,
  };
}

function executeAutomation(db, body) {
  const executions = getEntityStore(db, "TaskExecution");
  const now = new Date().toISOString();
  const execution =
    executions.find((item) => item.id === body?.execution_id) ||
    normalizeRecord(
      {
        id: body?.execution_id || randomId("exec"),
        title: "自动执行任务",
        original_input: body?.input || "",
        execution_status: "pending",
      },
      DEFAULT_USER.id
    );

  if (!executions.some((item) => item.id === execution.id)) {
    executions.unshift(execution);
  }

  if (body?.phase === "plan") {
    execution.execution_status = "planned";
    execution.plan_result = {
      summary: "本地后端已生成自动执行计划草案。",
      steps: [
        { step_name: "理解任务", action_key: "analyze" },
        { step_name: "整理输出", action_key: "create_note" },
      ],
    };
    execution.updated_date = now;
    return execution.plan_result;
  }

  execution.execution_status = "completed";
  execution.result = {
    summary: "本地后端已完成简化版自动执行。",
    output_text: body?.adjust_text || execution.original_input || "已执行",
  };
  execution.updated_date = now;
  return execution.result;
}

function renderPpt(body) {
  const slides = Array.isArray(body?.data?.slides)
    ? body.data.slides
    : [
        { title: "封面", bullets: ["主题", "摘要"] },
        { title: "要点", bullets: ["关键结论", "下一步"] },
      ];
  return {
    html: `<!doctype html><html><body><h1>${slides[0]?.title || "演示稿"}</h1></body></html>`,
    slides,
  };
}

function rerenderPpt(body) {
  return renderPpt(body);
}

function sendTaskAlert(db, body) {
  const notifications = getEntityStore(db, "Notification");
  notifications.unshift(
    normalizeRecord(
      {
        id: randomId("notif"),
        title: body?.title || "任务提醒",
        content: body?.message || body?.body || "你有一条任务提醒",
        is_read: false,
        recipient_id: getCurrentUser(db).id,
      },
      getCurrentUser(db).id
    )
  );
  return { success: true };
}

function sendGmailEmail(db, body) {
  db.emails.unshift({
    id: randomId("gmail"),
    to: body?.to,
    cc: body?.cc || [],
    subject: body?.subject || "",
    body: body?.html || body?.body || "",
    created_at: new Date().toISOString(),
  });
  return { success: true, message_id: randomId("msg") };
}

function agentSendEmail(db, body) {
  return sendGmailEmail(db, body);
}

function createWechatOrder(db, body) {
  const orderNo = `WX${Date.now()}`;
  db.orders[orderNo] = {
    order_no: orderNo,
    packId: body?.packId,
    price: body?.price,
    paid: false,
    created_at: new Date().toISOString(),
  };
  return {
    order_no: orderNo,
    code_url: `weixin://wxpay/bizpayurl?pr=${orderNo}`,
    mode: "manual-demo",
  };
}

function queryWechatOrder(db, body) {
  const order = db.orders[body?.order_no];
  return {
    paid: !!order?.paid,
    order_no: body?.order_no,
  };
}

function createStripeCheckout() {
  return {
    url: "",
    message: "自建后端模式下暂未接入 Stripe，请优先使用微信支付或手动充值。",
  };
}

function syncTaskToGoogleCalendar() {
  return {
    success: false,
    skipped: true,
    message: "本地模式未接入 Google Calendar。",
  };
}

function bulkSyncTasksToCalendar() {
  return {
    success: false,
    synced: 0,
    message: "本地模式未接入 Google Calendar。",
  };
}

function syncToGoogleTasks() {
  return {
    success: false,
    synced: 0,
    message: "本地模式未接入 Google Tasks。",
  };
}

function savePushSubscription(db, body) {
  const prefs = getEntityStore(db, "UserPreference");
  const current = prefs[0] || normalizeRecord({}, DEFAULT_USER.id);
  current.push_subscription = body?.subscription || null;
  current.push_enabled = !!body?.subscription;
  current.updated_date = new Date().toISOString();
  if (!prefs[0]) prefs.unshift(current);
  return {
    success: true,
    subscribed: !!body?.subscription,
  };
}

function getVapidPublicKey(db) {
  return {
    publicKey: db.meta.vapidPublicKey || "",
  };
}

function sendWebPush(db, body) {
  const notifications = getEntityStore(db, "Notification");
  notifications.unshift(
    normalizeRecord(
      {
        id: randomId("notif"),
        title: body?.title || "推送通知",
        content: body?.body || "",
        is_read: false,
        recipient_id: getCurrentUser(db).id,
      },
      getCurrentUser(db).id
    )
  );
  return {
    success: true,
    delivered: false,
    fallback: "notification_entity",
  };
}

function deleteAccount(db, body) {
  if (body?.confirm_text !== "DELETE") {
    return {
      success: false,
      error: "请输入 DELETE 以确认删除账户",
    };
  }
  const user = getCurrentUser(db);
  user.deleted_at = new Date().toISOString();
  return { success: true };
}

function testWeworkWebhook(body) {
  return {
    success: !!body?.webhook_url,
    message: body?.webhook_url ? "Webhook 格式已记录，本地模式不主动向企业微信发送请求。" : "请先填写企业微信 Webhook URL",
  };
}

function geofenceTrigger(db, body) {
  return getSmartContextCards(db, body);
}

function sentinelGeofenceTrigger(db, body) {
  return getSmartContextCards(db, body);
}

function unsupportedFunction(name) {
  return {
    success: false,
    unsupported: true,
    error: `自建后端尚未实现函数：${name}`,
  };
}

async function invokeFunction(db, name, body) {
  switch (name) {
    case "callAI":
      return callAI(db, body);
    case "invokeKimi":
      return handleInvokeLLM(body);
    case "gemini": {
      const result = await handleInvokeLLM(body);
      return {
        success: true,
        text: result?.text || JSON.stringify(result, null, 2),
      };
    }
    case "analyzeHeartSign":
      return analyzeHeartSign(db, body);
    case "translateTask":
      return translateTask(body);
    case "analyzeIntent":
      return analyzeIntent(body);
    case "generateDailyBriefing":
      return generateDailyBriefing(db);
    case "generateWeekPlan":
      return generateWeekPlan(body);
    case "generateMonthPlan":
      return generateMonthPlan(body);
    case "generateSmartReminders":
      return generateSmartReminders(body);
    case "weaveInputToTasks":
      return weaveInputToTasks(body);
    case "nearbyTaskMatcher":
      return nearbyTaskMatcher(db, body);
    case "getSceneContextTasks":
      return getSceneContextTasks(db, body);
    case "getSentinelGuard":
      return getSentinelGuard(db, body);
    case "getAssociationRecommendations":
      return getAssociationRecommendations(db, body);
    case "getSmartContextCards":
      return getSmartContextCards(db, body);
    case "suggestGeofenceParams":
      return suggestGeofenceParams(body);
    case "fetchExternalFeeds":
      return fetchExternalFeeds(db, body);
    case "getExternalVision":
      return getExternalVision(db);
    case "kimiWebBrowse":
      return kimiWebBrowse(body);
    case "kimiMemoryInsight":
      return kimiMemoryInsight(db, body);
    case "kimiPersonalInsight":
      return kimiPersonalInsight(db, body);
    case "getAutomationTrust":
      return getAutomationTrust(db);
    case "executeAutomation":
      return executeAutomation(db, body);
    case "renderPpt":
      return renderPpt(body);
    case "rerenderPpt":
      return rerenderPpt(body);
    case "sendTaskAlert":
      return sendTaskAlert(db, body);
    case "sendGmailEmail":
      return sendGmailEmail(db, body);
    case "agentSendEmail":
      return agentSendEmail(db, body);
    case "createWechatOrder":
      return createWechatOrder(db, body);
    case "queryWechatOrder":
      return queryWechatOrder(db, body);
    case "createStripeCheckout":
      return createStripeCheckout(db, body);
    case "syncTaskToGoogleCalendar":
      return syncTaskToGoogleCalendar(db, body);
    case "bulkSyncTasksToCalendar":
      return bulkSyncTasksToCalendar(db, body);
    case "syncToGoogleTasks":
      return syncToGoogleTasks(db, body);
    case "savePushSubscription":
      return savePushSubscription(db, body);
    case "getVapidPublicKey":
      return getVapidPublicKey(db);
    case "sendWebPush":
      return sendWebPush(db, body);
    case "deleteAccount":
      return deleteAccount(db, body);
    case "testWeworkWebhook":
      return testWeworkWebhook(body);
    case "geofenceTrigger":
      return geofenceTrigger(db, body);
    case "sentinelGeofenceTrigger":
      return sentinelGeofenceTrigger(db, body);
    default:
      return unsupportedFunction(name);
  }
}

async function serveUpload(req, res, pathname) {
  const fileName = pathname.replace(/^\/uploads\//, "");
  const filePath = path.join(uploadsDir, fileName);
  if (!existsSync(filePath)) {
    send(res, text("Not found", 404));
    return true;
  }
  const data = await fs.readFile(filePath);
  res.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": guessContentType(filePath),
  });
  res.end(data);
  return true;
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".json") return "application/json";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

async function handleAuth(req, res, db, pathname) {
  if (pathname === "/api/auth/me" && req.method === "GET") {
    send(res, json(getCurrentUser(db)));
    return true;
  }
  if (pathname === "/api/auth/me" && req.method === "PATCH") {
    const patch = await readJsonBody(req);
    const user = getCurrentUser(db);
    Object.assign(user, patch || {}, { updated_date: new Date().toISOString() });
    const users = getEntityStore(db, "User");
    const userIndex = users.findIndex((item) => item.id === user.id);
    if (userIndex !== -1) users[userIndex] = { ...users[userIndex], ...user };
    db.users = users;
    await writeDb(db);
    send(res, json(user));
    return true;
  }
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    send(res, json({ success: true }));
    return true;
  }
  return false;
}

async function handleEntities(req, res, db, pathname, url) {
  const match = pathname.match(/^\/api\/entities\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return false;

  const entityName = decodeURIComponent(match[1]);
  const resourceId = match[2] ? decodeURIComponent(match[2]) : null;
  const store = getEntityStore(db, entityName);

  if (!resourceId && req.method === "GET") {
    const filter = parseMaybeJson(url.searchParams.get("filter")) || undefined;
    const sort = url.searchParams.get("sort") || undefined;
    const limit = url.searchParams.get("limit") || undefined;
    const items = limitRecords(sortRecords(filter ? store.filter((item) => matchesFilter(item, filter)) : store, sort), limit);
    send(res, json(items));
    return true;
  }

  if (resourceId === "bulk-create" && req.method === "POST") {
    const body = await readJsonBody(req);
    const currentUser = getCurrentUser(db);
    const created = (body?.items || []).map((item) => normalizeRecord(item, currentUser.id));
    store.push(...created);
    await writeDb(db);
    send(res, json(created));
    return true;
  }

  if (resourceId === "bulk-update" && req.method === "POST") {
    const body = await readJsonBody(req);
    const updated = [];
    for (const patch of body?.items || []) {
      const index = store.findIndex((item) => item.id === patch.id);
      if (index === -1) continue;
      store[index] = {
        ...store[index],
        ...patch,
        updated_date: new Date().toISOString(),
      };
      updated.push(store[index]);
    }
    await writeDb(db);
    send(res, json(updated));
    return true;
  }

  if (!resourceId && req.method === "POST") {
    const body = await readJsonBody(req);
    const record = normalizeRecord(body, getCurrentUser(db).id);
    store.push(record);
    await writeDb(db);
    send(res, json(record, 201));
    return true;
  }

  if (resourceId && req.method === "GET") {
    const found = store.find((item) => item.id === resourceId);
    if (!found) {
      send(res, json({ error: `${entityName} not found` }, 404));
      return true;
    }
    send(res, json(found));
    return true;
  }

  if (resourceId && req.method === "PATCH") {
    const patch = await readJsonBody(req);
    const index = store.findIndex((item) => item.id === resourceId);
    if (index === -1) {
      send(res, json({ error: `${entityName} not found` }, 404));
      return true;
    }
    store[index] = {
      ...store[index],
      ...patch,
      updated_date: new Date().toISOString(),
    };
    await writeDb(db);
    send(res, json(store[index]));
    return true;
  }

  if (resourceId && req.method === "DELETE") {
    const index = store.findIndex((item) => item.id === resourceId);
    if (index === -1) {
      send(res, json({ error: `${entityName} not found` }, 404));
      return true;
    }
    const [removed] = store.splice(index, 1);
    await writeDb(db);
    send(res, json(removed));
    return true;
  }

  return false;
}

async function handleFunctions(req, res, db, pathname) {
  const match = pathname.match(/^\/api\/functions\/([^/]+)$/);
  if (!match || req.method !== "POST") return false;
  const name = decodeURIComponent(match[1]);
  const body = await readJsonBody(req);
  const result = await invokeFunction(db, name, body);
  await writeDb(db);
  send(res, json(result));
  return true;
}

async function handleIntegrations(req, res, db, pathname) {
  if (pathname === "/api/integrations/invoke-llm" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = await handleInvokeLLM(body);
    send(res, json(result));
    return true;
  }

  if (pathname === "/api/integrations/upload-file" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = await handleUploadFile(body);
    db.uploads.unshift({
      id: randomId("upload"),
      ...result,
      created_at: new Date().toISOString(),
    });
    await writeDb(db);
    send(res, json(result));
    return true;
  }

  if (pathname === "/api/integrations/generate-image" && req.method === "POST") {
    const body = await readJsonBody(req);
    send(res, json(await handleGenerateImage(body)));
    return true;
  }

  if (pathname === "/api/integrations/send-email" && req.method === "POST") {
    const body = await readJsonBody(req);
    send(res, json(await handleSendEmail(db, body)));
    return true;
  }

  if (pathname === "/api/integrations/send-sms" && req.method === "POST") {
    const body = await readJsonBody(req);
    send(res, json(await handleSendSMS(db, body)));
    return true;
  }

  if (pathname === "/api/integrations/extract-data-from-uploaded-file" && req.method === "POST") {
    const body = await readJsonBody(req);
    send(res, json(await handleExtractDataFromUploadedFile(body)));
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = parseUrl(req);
    const pathname = url.pathname;
    if (req.method === "OPTIONS") {
      send(res, json({ ok: true }));
      return;
    }

    if (pathname.startsWith("/uploads/")) {
      await serveUpload(req, res, pathname);
      return;
    }

    if (pathname === "/health") {
      send(
        res,
        json({
          ok: true,
          mode: "self-host",
          root: workspaceRoot,
        })
      );
      return;
    }

    const db = await readDb();

    if (await handleAuth(req, res, db, pathname)) return;
    if (await handleEntities(req, res, db, pathname, url)) return;
    if (await handleFunctions(req, res, db, pathname)) return;
    if (await handleIntegrations(req, res, db, pathname)) return;

    send(res, json({ error: "Not found" }, 404));
  } catch (error) {
    console.error("[selfhost-backend]", error);
    send(
      res,
      json(
        {
          error: error.message || "Internal server error",
        },
        500
      )
    );
  }
});

await ensureStorage();
server.listen(PORT, HOST, () => {
  console.log(`[selfhost-backend] listening on http://${HOST}:${PORT}`);
});
