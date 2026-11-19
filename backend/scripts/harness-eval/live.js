// Run once per checkout against the same model and fixtures. Uses only synthetic data.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { mock } from "node:test";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const { values } = parseArgs({ options: { checkout: { type: "string" }, out: { type: "string" } }, strict: true });
if (!values.checkout || !values.out || !process.env.DEEPSEEK_API_KEY?.trim()) {
  throw new Error("Supply --checkout <repo>, --out <report>, and DEEPSEEK_API_KEY.");
}
const checkout = resolve(values.checkout);
const backend = join(checkout, "backend");
const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash";
const MAX_CALLS = 18;
const now = new Date("2026-11-16T00:00:00.000Z");
const nativeFetch = globalThis.fetch;
const nativeSetTimeout = globalThis.setTimeout;
const dir = mkdtempSync(join(tmpdir(), "soulsentry-live-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "file:" + join(dir, "live.db"),
  JWT_SECRET: "harness-live-synthetic-only",
  CHAT_AI_PROVIDER: "deepseek",
  DEEPSEEK_MODEL: model,
  KIMI_API_KEY: "",
  MOONSHOT_API_KEY: "",
  WECHAT_APPID: "",
  WECHAT_APP_SECRET: "",
  MEMORY_LEARNING_ENABLED: "0",
  MEMORY_HYBRID_ENABLED: "0",
});
const fixtures = [
  {
    id: "reading_busy",
    text: "帮我安排一周阅读练习，每周三次，每次正好25分钟，工作日晚上没空，请避开已有安排。",
    minutes: 25,
    busy: ["2026-11-16T08:30:00+08:00", "2026-11-16T18:00:00+08:00"],
  },
  {
    id: "vocabulary_limit",
    text: "想做一个为期7天的英语词汇复习计划，每周三次，单次按我平常的上限，每次请用纸质词卡。",
    minutes: 25,
    max: true,
    memory: "英语词汇复习每次最多25分钟",
    content: /纸质|纸卡|词卡|单词卡/,
  },
  {
    id: "dumbbell_training",
    text: "想做一周居家练背计划，每周三次，每次正好35分钟。我是新手，在家只有一副哑铃。",
    minutes: 35,
    content: /\d+\s*组.*\d+\s*(次|秒)|[一二三四五六七八九十]+组.*\d+\s*(次|秒)/,
    forbidden: /高位下拉机|史密斯机|跑步机|引体向上杆|杠铃|坐姿划船机/,
  },
];

const totals = { calls: 0, inputTokens: 0, outputTokens: 0 };
const trials = [];
let db, server, callTrace = [];
const imported = (name) => import(pathToFileURL(join(backend, name)).href);

try {
  const schema = execFileSync(process.execPath, [
    join(backend, "node_modules/prisma/build/index.js"), "migrate", "diff",
    "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script",
  ], { cwd: backend, encoding: "utf8" });
  const sqlite = new DatabaseSync(join(dir, "live.db"));
  try {
    sqlite.exec(schema);
  } finally {
    sqlite.close();
  }
  ({ prisma: db } = await imported("src/lib/prisma.js"));
  const { signAccessToken } = await imported("src/lib/jwt.js");
  const { app } = await imported("src/app.js");
  mock.timers.enable({ apis: ["Date"], now });
  mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    const timer = nativeSetTimeout(callback, delay, ...args);
    return delay >= 35000 ? timer.unref() : timer;
  });
  mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) !== "https://api.deepseek.com/chat/completions") throw new Error("Unexpected external request");
    if (totals.calls >= MAX_CALLS || callTrace.length >= 3) throw new Error("Harness live model budget exhausted");
    const { messages: [system] } = JSON.parse(options.body);
    const call = { phase: system.content.startsWith("你是约定规划师") ? "planner" : "chat" };
    callTrace.push(call);
    totals.calls += 1;
    const started = performance.now();
    try {
      const response = await nativeFetch(url, options);
      call.status = response.status;
      const { usage } = await response.clone().json().catch(() => ({}));
      call.inputTokens = usage?.prompt_tokens || 0;
      call.outputTokens = usage?.completion_tokens || 0;
      totals.inputTokens += call.inputTokens;
      totals.outputTokens += call.outputTokens;
      return response;
    } catch (error) {
      call.error = error.name;
      throw error;
    } finally {
      call.ms = Math.round(performance.now() - started);
    }
  });
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;

  for (const fixture of fixtures) {
    for (let repeat = 1; repeat <= 2; repeat += 1) {
      if (totals.calls >= MAX_CALLS) break;
      const account = await db.user.create({ data: {} });
      if (fixture.busy) {
        await db.task.create({ data: {
          userId: account.id, title: "读者的既有约定",
          reminderTime: new Date(fixture.busy[0]), endTime: new Date(fixture.busy[1]),
        } });
      }
      if (fixture.memory) {
        await db.memoryRecord.create({ data: {
          userId: account.id, title: fixture.memory, content: fixture.memory, memoryType: "preference",
          fact: { create: { userId: account.id, subject: "self", topic: "english_vocabulary", attribute: "session_limit", aliases: [] } },
        } });
      }
      const countTasks = (where = {}) => db.task.count({ where: { userId: account.id, ...where } });
      const started = performance.now();
      callTrace = [];
      const post = async (path, body) => {
        const response = await nativeFetch(origin + path, {
          method: "POST",
          headers: { authorization: "Bearer " + signAccessToken(account), "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(100000),
        });
        return { status: response.status, data: await response.json() };
      };
      const errors = [];
      const trial = { id: fixture.id, repeat, calls: callTrace, errors };
      try {
        const { data, status } = await post("/api/companion/messages", { content: fixture.text });
        trial.chatStatus = status;
        trial.reply = data.reply?.content;
        const expectedBefore = fixture.busy ? 1 : 0;
        if (await countTasks() !== expectedBefore) errors.push("wrote_before_confirmation");
        const extracted = data.extracted;
        const plan = extracted?.plan;
        if (!plan || plan.source === "fallback") {
          errors.push("no_confirmable_proposal");
        } else {
          const { sessions, problems } = grade(plan, fixture);
          trial.sessions = sessions;
          errors.push(...problems);
          // Confirm only cards that independently meet the reference requirements.
          if (!errors.length) {
            const confirmed = await (extracted.plan_proposal_id
              ? post("/api/tasks/plan-proposals/" + extracted.plan_proposal_id + "/confirm", {})
              : post("/api/tasks/plan", legacyPayload(extracted)));
            trial.confirmStatus = confirmed.status;
            const parentId = confirmed.data.parent?.id;
            const children = parentId ? await db.task.findMany({ where: { userId: account.id, parentTaskId: parentId } }) : [];
            const key = (title, time, end) => [title, new Date(time).toISOString(), new Date(end).toISOString()].join("|");
            const expected = plan.children.map((child) => key(child.title, stamp(child, "start_time"), stamp(child, "end_time"))).sort();
            const actual = children.map((child) => key(child.title, child.reminderTime, child.endTime)).sort();
            if (confirmed.status !== 201 || JSON.stringify(actual) !== JSON.stringify(expected)
              || await countTasks() !== expectedBefore + plan.children.length + 1) errors.push("incorrect_saved_state");
          }
        }
      } catch (error) {
        errors.push("eval_request_failure");
        trial.error = error.name;
      }
      trial.ms = Math.round(performance.now() - started);
      trial.pass = errors.length === 0;
      trials.push(trial);
      console.info(JSON.stringify({ id: trial.id, repeat, pass: trial.pass, calls: callTrace.length, errors }));
    }
  }
} finally {
  if (server) await new Promise((done) => server.close(done));
  await db?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim();
  writeFileSync(values.out, JSON.stringify({
    sha, model, totals, trials, passed: trials.filter(({ pass }) => pass).length,
    pass2: fixtures.filter(({ id }) => trials.filter((item) => item.id === id && item.pass).length === 2).length,
  }, null, 2) + "\n");
}

function stamp(child, field) {
  return child.date + "T" + child[field] + ":00+08:00";
}

function grade(plan, fixture) {
  const sessions = plan.children.filter((entry) => entry.session_type === "session");
  const problems = [];
  if (sessions.length !== 3 || new Set(sessions.map(({ date }) => date)).size !== 3) problems.push("wrong_frequency");
  if (sessions.some((child) => {
    const minutes = (Date.parse(stamp(child, "end_time")) - Date.parse(stamp(child, "start_time"))) / 60000;
    return !(minutes > 0 && (fixture.max ? minutes <= fixture.minutes : minutes === fixture.minutes));
  })) problems.push("wrong_duration");
  if (plan.children.some(({ date }) => date < "2026-11-16" || date > "2026-11-22")) problems.push("out_of_horizon");
  if (fixture.busy) {
    const [from, to] = fixture.busy.map(Date.parse);
    if (plan.children.some((child) => Date.parse(stamp(child, "start_time")) < to && Date.parse(stamp(child, "end_time")) > from)) problems.push("busy_conflict");
    if (sessions.some((child) => {
      const day = new Date(child.date).getUTCDay();
      return day >= 1 && day <= 5 && child.end_time > "18:00";
    })) problems.push("weekday_evening");
  }
  if (fixture.content && sessions.some(({ title, description }) => !fixture.content.test(title + " " + description))) problems.push("missing_activity_detail");
  if (fixture.forbidden && sessions.some(({ title, description }) => fixture.forbidden.test(title + " " + description))) problems.push("unavailable_equipment");
  return { sessions, problems };
}

function legacyPayload({ plan, memory_proposal_id }) {
  return {
    proposal_id: randomUUID(),
    memory_proposal_id,
    parent: { title: plan.parent.title, description: plan.parent.description },
    children: plan.children.map((child) => ({
      title: child.title, description: child.description,
      reminder_time: stamp(child, "start_time"), end_time: stamp(child, "end_time"),
      plan_kind: child.kind, plan_group: child.plan_group, session_type: child.session_type,
    })),
  };
}
