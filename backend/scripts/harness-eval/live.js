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
import { asksForDuration, firstDay, fixtures, gradePlan, stamp } from "./live-cases.js";

const { values } = parseArgs({ options: { checkout: { type: "string" }, repeats: { type: "string", default: "2" }, out: { type: "string" }, repeats: { type: "string", default: "2" } }, strict: true });
if (!values.checkout || !values.out || !process.env.DEEPSEEK_API_KEY?.trim()) {
  throw new Error("Supply --checkout <repo>, --out <report>, and DEEPSEEK_API_KEY.");
}
const checkout = resolve(values.checkout);
const backend = join(checkout, "backend");
const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash";
const repeats = Number(values.repeats);
if (![1, 2].includes(repeats)) throw new Error("--repeats must be 1 or 2");
const callsPerTurn = 3;
const maxCalls = repeats * callsPerTurn * fixtures.reduce((sum, fixture) => sum + (fixture.followUp ? 2 : 1), 0);
const now = new Date(firstDay + "T00:00:00.000Z");
const nativeFetch = globalThis.fetch;
const nativeSetTimeout = globalThis.setTimeout;
const dir = mkdtempSync(join(tmpdir(), "soulsentry-live-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "file:" + join(dir, "live.db"),
  JWT_SECRET: "harness-live-synthetic-only",
  CHAT_AI_PROVIDER: "deepseek",
  DEEPSEEK_MODEL: model,
  DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1",
  KIMI_API_KEY: "",
  MOONSHOT_API_KEY: "",
  WECHAT_APPID: "",
  WECHAT_APP_SECRET: "",
  MEMORY_LEARNING_ENABLED: "0",
  MEMORY_HYBRID_ENABLED: "0",
});
const totals = { calls: 0, inputTokens: 0, outputTokens: 0 };
const trials = [];
let db, server, callTrace = [], activeFixture, turnLimit;
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
    if (![
      "https://api.deepseek.com/chat/completions",
      "https://api.deepseek.com/v1/chat/completions",
    ].includes(String(url))) throw new Error("Unexpected external request");
    if (totals.calls >= maxCalls || callTrace.length >= turnLimit) {
      totals.budgetBlocks = (totals.budgetBlocks || 0) + 1;
      throw new Error("Harness live model budget exhausted");
    }
    const { messages } = JSON.parse(options.body);
    const call = { phase: messages[0].content.startsWith("你是约定规划师") ? "planner" : "chat" };
    if (activeFixture.privateText && messages.some(({ content }) => content.includes(activeFixture.privateText))) {
      call.foreignMemoryInPrompt = true;
    }
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
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const account = await db.user.create({ data: {} });
      const stranger = fixture.mode === "confirm_parallel" || fixture.memories?.some(({ foreign }) => foreign)
        ? await db.user.create({ data: {} }) : null;
      for (const [from, to] of fixture.busy || []) {
        await seedBusy(account.id, from + "+08:00", to + "+08:00");
      }
      for (const { text, topic, subject = "self", expires, foreign } of fixture.memories || []) {
        const userId = foreign ? stranger.id : account.id;
        await db.memoryRecord.create({ data: {
          userId, title: text, content: text, memoryType: "preference",
          fact: { create: { userId, subject, topic, attribute: "session_limit", aliases: [], expiresAt: expires ? new Date(expires) : undefined } },
        } });
      }
      const started = performance.now();
      activeFixture = fixture;
      callTrace = [];
      turnLimit = 0;
      const post = async (path, body, as = account) => {
        const response = await nativeFetch(origin + path, {
          method: "POST",
          headers: { authorization: "Bearer " + signAccessToken(as), "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(100000),
        });
        return { status: response.status, data: await response.json() };
      };
      const trial = { id: fixture.id, repeat, calls: callTrace, turns: [], errors: [] };
      try {
        await runScenario(fixture, trial, post, account, stranger);
        if (fixture.privateText && (
          callTrace.some(({ foreignMemoryInPrompt }) => foreignMemoryInPrompt)
          || trial.turns.some(({ reply }) => reply?.includes(fixture.privateText))
        )) trial.errors.push("foreign_memory_exposed");
      } catch (error) {
        trial.errors.push("eval_request_failure");
        trial.error = { type: error.name, message: error.message };
      }
      trial.ms = Math.round(performance.now() - started);
      trial.pass = trial.errors.length === 0;
      trials.push(trial);
      console.info(JSON.stringify({ id: trial.id, repeat, pass: trial.pass, calls: callTrace.length, errors: trial.errors }));
    }
  }
} finally {
  if (server) await new Promise((done) => server.close(done));
  await db?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim();
  writeFileSync(values.out, JSON.stringify({
    sha, model, maxCalls, repeats, expectedTrials: fixtures.length * repeats, totals, trials,
    passed: trials.filter(({ pass }) => pass).length,
    pass2: repeats === 2 ? fixtures.filter(({ id }) => trials.filter((item) => item.id === id && item.pass).length === 2).length : null,
  }, null, 2) + "\n");
}

async function seedBusy(userId, from, to) {
  await db.task.create({ data: {
    userId, title: "已存在的约定",
    reminderTime: new Date(from), endTime: new Date(to),
  } });
}

async function runScenario(fixture, trial, post, account, stranger) {
  const { errors } = trial;
  const expectedBefore = fixture.busy?.length || 0;
  const countTasks = (userId = account.id) => db.task.count({ where: { userId } });
  async function chat(content, lastExtracted) {
    const before = callTrace.length;
    turnLimit = before + callsPerTurn;
    const { status, data } = await post("/api/companion/messages", { content, last_extracted: lastExtracted });
    // A completed reply must not leave the provider budget open during confirmation.
    turnLimit = callTrace.length;
    const plannerCalls = callTrace.slice(before).filter(({ phase }) => phase === "planner").length;
    const reply = data.reply?.content;
    trial.turns.push({ status, reply, calls: callTrace.length - before, plannerCalls });
    if (status !== 200) errors.push("chat_status_" + status);
    if (await countTasks() !== expectedBefore) errors.push("wrote_before_confirmation");
    return { extracted: data.extracted, reply, plannerCalls };
  }

  let turn = await chat(fixture.text);
  if (fixture.mode === "clarify" || fixture.mode === "clarify_then_plan") {
    if (turn.extracted?.plan || turn.plannerCalls !== 0) errors.push("planned_before_clarification");
    // The question must solicit a duration instead of only presenting one.
    if (!asksForDuration(turn.reply)) errors.push("missing_duration_question");
    if (fixture.mode === "clarify") {
      trial.terminal = "clarification";
      return;
    }
    if (errors.length) return;
    turn = await chat(fixture.followUp);
  }

  let extracted = turn.extracted;
  const plan = extracted?.plan;
  if (!plan || plan.source === "fallback") {
    errors.push("no_confirmable_proposal");
    return;
  }
  const firstGrade = gradePlan(plan, fixture);
  trial.sessions = firstGrade.sessions;
  errors.push(...firstGrade.problems);
  if (errors.length) return;
  if (fixture.mode === "adjust") {
    turn = await chat(fixture.followUp, extracted);
    if (turn.plannerCalls !== 0) errors.push("adjustment_called_planner");
    const revised = turn.extracted?.plan;
    if (!revised || revised.source === "fallback") {
      errors.push("missing_adjusted_proposal");
      return;
    }
    const revisedGrade = gradePlan(revised, fixture, { adjusted: true });
    trial.adjustedSessions = revisedGrade.sessions;
    errors.push(...revisedGrade.problems);
    const otherRows = (draft) => draft.children.filter(({ date }) => date !== fixture.adjustment.date)
      .map((child) => [child.date, child.start_time, child.end_time, child.title, child.description, child.session_type].join("|")).sort();
    if (JSON.stringify(otherRows(plan)) !== JSON.stringify(otherRows(revised))) errors.push("unrequested_changes");
    if (errors.length) return;
    extracted = turn.extracted;
  }

  const { path, body } = confirmation(extracted);
  if (fixture.mode === "late_conflict") {
    const first = firstGrade.sessions[0];
    await seedBusy(account.id, stamp(first, "start_time"), stamp(first, "end_time"));
    const result = await post(path, body);
    trial.confirmStatuses = [result.status];
    if (result.status !== 409 || result.data.error !== "PLAN_CONFLICT") errors.push("late_conflict_not_rejected");
    if (await countTasks() !== expectedBefore + 1) errors.push("late_conflict_wrote_tasks");
    trial.terminal = "late_conflict";
    return;
  }

  let confirmed;
  if (fixture.mode === "confirm_parallel") {
    const foreign = await post(path, body, stranger);
    trial.foreignConfirmStatus = foreign.status;
    if (![403, 404].includes(foreign.status) || await countTasks(stranger.id) !== 0) errors.push("foreign_confirmation_accepted");
    const pair = await Promise.all([post(path, body), post(path, body)]);
    trial.confirmStatuses = pair.map(({ status }) => status);
    const [first, replay] = pair.sort((a, b) => b.status - a.status);
    if (first.status !== 201 || replay.status !== 200 || first.data.parent?.id !== replay.data.parent?.id) errors.push("confirmation_not_idempotent");
    confirmed = first;
  } else {
    confirmed = await post(path, body);
    trial.confirmStatuses = [confirmed.status];
  }
  const parentId = confirmed.data.parent?.id;
  const children = parentId ? await db.task.findMany({ where: { userId: account.id, parentTaskId: parentId } }) : [];
  const key = (title, time, end) => [title, new Date(time).toISOString(), new Date(end).toISOString()].join("|");
  const expected = extracted.plan.children.map((child) => key(child.title, stamp(child, "start_time"), stamp(child, "end_time"))).sort();
  const actual = children.map(({ title, reminderTime, endTime }) => key(title, reminderTime, endTime)).sort();
  if (confirmed.status !== 201 || confirmed.data.parent?.title !== extracted.plan.parent.title
    || JSON.stringify(actual) !== JSON.stringify(expected)
    || await countTasks() !== expectedBefore + extracted.plan.children.length + 1) errors.push("incorrect_saved_state");
  trial.terminal = "confirmation";
}

function confirmation(extracted) {
  if (extracted.plan_proposal_id) return {
    path: "/api/tasks/plan-proposals/" + extracted.plan_proposal_id + "/confirm",
    body: {},
  };
  const { plan, memory_proposal_id } = extracted;
  return {
    path: "/api/tasks/plan",
    body: {
      proposal_id: randomUUID(),
      memory_proposal_id,
      parent: { title: plan.parent.title, description: plan.parent.description },
      children: plan.children.map((child) => ({
        title: child.title, description: child.description,
        reminder_time: stamp(child, "start_time"), end_time: stamp(child, "end_time"),
        plan_kind: child.kind, plan_group: child.plan_group, session_type: child.session_type,
      })),
    },
  };
}
