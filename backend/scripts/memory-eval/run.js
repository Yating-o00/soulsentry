import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import { invokeDashboardAi } from "../../src/lib/dashboardAi.js";
import { retrievePersonalMemories } from "../../src/services/personalMemory.js";
import { applyRememberedDuration, planningConstraints } from "../../src/services/taskHarness.js";
import { chatWithKimi } from "../../src/services/flowChat.js";
import { planCommitmentWithKimi } from "../../src/services/planCommitment.js";
import { pilot } from "./pilot.js";

export const MAX_CALLS = 44;
const REPLAY_TIME = new Date("2026-11-18T04:00:00Z");
class PilotBudgetError extends Error {}

function record(entry) {
  return { id: entry.id, title: entry.text, content: entry.text, sourceIds: [entry.id] };
}

const baseline = {
  retrieve({ records, query, userId }) {
    const prisma = { memoryRecord: { findMany: async () => records } };
    return retrievePersonalMemories({ prisma, userId, query });
  },
};

function createMeter(provider) {
  const stages = {};
  let calls = 0;
  const addUsage = (stage, tokens) => {
    if (Number.isFinite(tokens?.prompt_tokens) && Number.isFinite(tokens?.completion_tokens)) {
      stage.inputTokens += tokens.prompt_tokens;
      stage.outputTokens += tokens.completion_tokens;
    } else {
      stage.unmeteredCalls++;
    }
  };
  return {
    stages,
    invoke(stage) {
      let used = false;
      return async (options) => {
        if (used) throw new PilotBudgetError("Pilot allows one model call per stage invocation");
        if (calls >= MAX_CALLS) throw new PilotBudgetError("Pilot model call budget exhausted");
        used = true;
        calls++;
        const usage = stages[stage] ??= { calls: 0, inputTokens: 0, outputTokens: 0, unmeteredCalls: 0, errors: 0 };
        usage.calls++;
        const maxTokens = Math.min(options.maxTokens ?? 2000, 2000);
        try {
          const result = await provider({ ...options, maxTokens });
          addUsage(usage, result?.usage);
          return result;
        } catch (error) {
          usage.errors++;
          addUsage(usage, error.usage);
          throw error;
        }
      };
    },
  };
}

function supportedFacts(item, facts, { forPrompt = false } = {}) {
  const content = String(item.content || "");
  const text = [item.title, forPrompt ? content.slice(0, 300) : content].filter(Boolean).join(" ");
  return facts.filter(({ id, match }) => item.sourceIds?.includes(id) && match.test(text)).map(({ id }) => id);
}

function stateScore(records, facts, expected) {
  const active = records.filter(({ status }) => !status || status === "active");
  const byRecord = active.map((item) => supportedFacts(item, facts));
  const matched = byRecord.flat().filter((label) => expected.includes(label));
  const correct = new Set(matched);
  const duplicateCurrent = matched.length - correct.size;
  const unsupportedOrInactive = byRecord.filter((labels) => !labels.length || labels.some((label) => !expected.includes(label))).length;
  const activeTextChars = active.reduce((sum, item) => sum + String(item.content || item.title || "").length, 0);
  return {
    expected: expected.length,
    correct: correct.size,
    active: active.length,
    duplicateCurrent,
    unsupportedOrInactive,
    activeTextChars,
    currentFactsPer1000Chars: activeTextChars ? correct.size * 1000 / activeTextChars : null,
    exact: correct.size === expected.length && duplicateCurrent === 0 && unsupportedOrInactive === 0,
  };
}

function matches(text, criteria) {
  return (criteria.require || []).every((match) => match.test(text))
    && (criteria.reject || []).every((match) => !match.test(text));
}

function planPass(plan, criteria) {
  const sessions = plan?.children.filter((child) => child.session_type === "session") || [];
  const sessionText = (child) => child.title + " " + (child.description || "");
  const countsAndContentMatch = sessions.length === criteria.count
    && sessions.every((child) => {
      const day = new Date(child.date + "T00:00:00Z").getUTCDay();
      const weekdayEvening = day >= 1 && day <= 5 && (child.start_time >= "18:00" || child.end_time > "18:00");
      return child.duration_minutes === criteria.minutes
        && (!criteria.noWeekdayEvenings || !weekdayEvening)
        && matches(sessionText(child), criteria);
    });
  return countsAndContentMatch && (criteria.requireSome || []).every((match) => sessions.some((child) => match.test(sessionText(child))));
}

async function answer(query, records, meter, isCandidate) {
  // Keep the evidence turns outside chat's recent window. Both variants receive the same recent context.
  const messages = Array.from({ length: 24 }, () => ({ role: "assistant", content: "好的。" }));
  messages.push({ role: "user", content: query.text });
  let chat = {};
  let chatError;
  const memoryContext = isCandidate ? {} : undefined;
  try {
    chat = await chatWithKimi({ messages, memories: records, memoryContext, invoke: meter.invoke("chat") });
  } catch (error) {
    chatError = error.message;
  }
  if (!query.plan) return { pass: !chatError && matches(chat.reply, query), reply: chat.reply, chatError };
  const request = isCandidate
    ? applyRememberedDuration(chat.extracted?.plan_request, query.text, records)
    : chat.extracted?.plan_request;
  const plannerMode = request?.horizon_days === 7 && request.daily_minutes ? "normal" : "diagnostic";
  // Spend the same single planner call per plan probe in both arms. An incomplete
  // request is never scored as a product plan, even if the diagnostic draft passes.
  const goal = request?.goal || query.text;
  const horizon = request?.horizon_days || 7;
  let plannerProviderError;
  const invoke = meter.invoke("planner");
  try {
    const draft = await planCommitmentWithKimi({
      goal,
      horizonDays: horizon,
      dailyMinutes: request?.daily_minutes,
      preferences: isCandidate ? request?.preferences : [request?.preferences, ...records.map((item) => item.content || item.title)].filter(Boolean).join("；"),
      memoryContext: isCandidate ? { memories: records } : undefined,
      constraints: planningConstraints({ goal, horizonDays: horizon, sessionMinutes: request?.daily_minutes, context: query.text, memories: isCandidate ? records : [] }),
      invoke: async (options) => {
        try {
          return await invoke(options);
        } catch (error) {
          plannerProviderError = error.message;
          throw error;
        }
      },
      maxRepairs: 0,
    });
    const draftPass = planPass(draft, query.plan);
    return { pass: plannerMode === "normal" && draftPass, plannerMode, draftPass, chatPlan: request, reply: chat.reply, chatError, children: draft.children };
  } catch (error) {
    return { pass: false, plannerMode, chatPlan: request, reply: chat.reply, chatError, planError: plannerProviderError || error.message };
  }
}

function summarize(cases, states) {
  const answerable = cases.filter((item) => item.required > 0);
  const answers = cases.filter((item) => item.answer);
  return {
    recallAt5: answerable.reduce((sum, item) => sum + item.found / item.required, 0) / answerable.length,
    allEvidence: answerable.filter((item) => item.found === item.required).length,
    answerableCases: answerable.length,
    cleanContext: cases.filter((item) => item.contextPass).length,
    queries: cases.length,
    noEvidencePollution: cases.filter((item) => !item.required && item.returned.length > 0).length,
    irrelevantHits: cases.reduce((sum, item) => sum + item.irrelevant, 0),
    staleHits: cases.reduce((sum, item) => sum + item.stale, 0),
    correctAnswers: answers.length ? answers.filter((item) => item.answer.pass).length : null,
    scoredAnswers: answers.length,
    exactState: states.filter((state) => state.exact).length,
    stateCheckpoints: states.length,
  };
}

export async function runPilot({ provider, candidate, historyId, retrievalOnly = false } = {}) {
  const histories = historyId === undefined ? pilot : pilot.filter(({ id }) => id === historyId);
  if (!histories.length) throw new Error("Unknown pilot history: " + historyId);
  if (retrievalOnly && provider) throw new Error("Retrieval-only mode does not use a model");
  if (candidate && !provider && !retrievalOnly) throw new Error("Supply a provider for a two-job candidate run");
  for (const method of retrievalOnly ? ["retrieve"] : ["extract", "consolidate", "retrieve"]) {
    if (candidate && typeof candidate[method] !== "function") throw new Error("Candidate must export " + method);
  }
  const meter = createMeter(provider);
  const variants = {};
  for (const [name, adapter] of [["baseline", baseline], ...(candidate ? [["candidate", candidate]] : [])]) {
    const cases = [];
    const states = [];
    const jobErrors = [];
    for (const history of histories) {
      const facts = history.batches.flat();
      const toMessage = ({ id, text, explicit, role }) => ({
        id, role, content: explicit ? "记住：" + text : text,
        createdAt: new Date(REPLAY_TIME.getTime() - (facts.length - facts.findIndex((entry) => entry.id === id)) * 3600_000),
      });
      let records = [];
      if (retrievalOnly) {
        // Use identical, already organized records in both arms to isolate search from capture.
        records = facts.filter(({ id }) => history.current.includes(id)).map(record).reverse();
        states.push({ history: history.id, stage: "seeded", ...stateScore(records, facts, history.current) });
      } else {
        for (const batch of history.batches) {
          records.unshift(...batch.filter(({ explicit, role }) => explicit && role === "user").map((entry) => ({
            ...record(entry), reason: "explicit_chat", createdAt: toMessage(entry).createdAt,
          })).reverse());
          if (name === "candidate") {
            try {
              records = await adapter.extract({ userId: history.id, records, messages: batch.map(toMessage), now: REPLAY_TIME, invoke: meter.invoke("extraction") });
            } catch (error) {
              if (error instanceof PilotBudgetError) throw error;
              jobErrors.push({ history: history.id, stage: "extraction", message: error.message });
            }
          }
        }
        states.push({ history: history.id, stage: "beforeConsolidation", ...stateScore(records, facts, history.current) });
        if (name === "candidate") {
          try {
            records = await adapter.consolidate({ userId: history.id, records, messages: facts.map(toMessage), now: REPLAY_TIME, invoke: meter.invoke("consolidation") });
          } catch (error) {
            if (error instanceof PilotBudgetError) throw error;
            jobErrors.push({ history: history.id, stage: "consolidation", message: error.message });
          }
          states.push({ history: history.id, stage: "afterConsolidation", ...stateScore(records, facts, history.current) });
        }
      }
      const active = records.filter(({ status }) => !status || status === "active");
      for (const query of [...history.queries, ...(history.offlineQueries || [])]) {
        const retrieved = (await adapter.retrieve({ records: active, query: query.text, userId: history.id })).slice(0, 5);
        const byRecord = retrieved.map((item) => supportedFacts(item, facts, { forPrompt: true }));
        const selected = new Set(byRecord.flat());
        const missing = query.evidence.filter((id) => !selected.has(id));
        const irrelevant = byRecord.filter((ids) => !ids.length || ids.some((id) => !query.evidence.includes(id))).length;
        const offlineOnly = !history.queries.includes(query);
        const scored = {
          id: query.id,
          query: query.text,
          offlineOnly,
          required: query.evidence.length,
          expectedEvidence: query.evidence,
          missingEvidence: missing,
          found: query.evidence.length - missing.length,
          stale: byRecord.filter((ids) => ids.some((id) => history.stale.includes(id))).length,
          irrelevant,
          contextPass: !missing.length && irrelevant === 0,
          returned: retrieved.map(({ id, title, content, sourceIds }, index) => ({
            id, title, content: String(content || "").slice(0, 300), sourceIds, facts: byRecord[index],
          })),
        };
        if (provider && !offlineOnly) scored.answer = await answer(query, retrieved, meter, name === "candidate");
        cases.push(scored);
      }
    }
    const finalStage = retrievalOnly ? "seeded" : name === "candidate" ? "afterConsolidation" : "beforeConsolidation";
    variants[name] = { summary: summarize(cases, states.filter(({ stage }) => stage === finalStage)), states, cases, jobErrors };
  }
  const totals = Object.values(meter.stages).reduce((sum, stage) => ({
    calls: sum.calls + stage.calls,
    inputTokens: sum.inputTokens + stage.inputTokens,
    outputTokens: sum.outputTokens + stage.outputTokens,
    unmeteredCalls: sum.unmeteredCalls + stage.unmeteredCalls,
    errors: sum.errors + stage.errors,
  }), { calls: 0, inputTokens: 0, outputTokens: 0, unmeteredCalls: 0, errors: 0 });
  return { suite: "memory-pilot-v2", mode: retrievalOnly ? "retrieval-only" : "history-replay", callLimit: retrievalOnly ? 0 : MAX_CALLS, totals, usage: meter.stages, variants };
}

async function main() {
  const { values } = parseArgs({
    options: {
      live: { type: "boolean" },
      "retrieval-only": { type: "boolean" },
      baseline: { type: "boolean" },
      candidate: { type: "string" },
      history: { type: "string" },
      out: { type: "string" },
    },
  });
  const retrievalOnly = values["retrieval-only"];
  if (retrievalOnly && values.live) throw new Error("--retrieval-only cannot be used with --live");
  if (values.candidate && !values.live && !retrievalOnly) throw new Error("--candidate requires --live or --retrieval-only");
  if (values.baseline && values.candidate) throw new Error("--baseline cannot be used with --candidate");
  if (values.live) {
    await import("dotenv/config");
    if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error("Set DEEPSEEK_API_KEY before running the live pilot");
  }
  const candidatePath = values.candidate
    ? pathToFileURL(resolve(values.candidate))
    : !values.baseline && (values.live || retrievalOnly)
      ? new URL("./candidate.js", import.meta.url)
      : null;
  const candidate = candidatePath ? (await import(candidatePath.href)).default : undefined;
  if (values.candidate && !candidate) throw new Error("Candidate module must default-export a memory adapter");
  const liveProvider = (options) => invokeDashboardAi(options, { provider: "deepseek", model: "deepseek-flash" });
  const report = await runPilot({ provider: values.live ? liveProvider : undefined, candidate, historyId: values.history, retrievalOnly });
  const json = JSON.stringify(report, null, 2) + "\n";
  if (values.out) {
    await writeFile(values.out, json);
    console.log(JSON.stringify({ calls: report.totals.calls, report: values.out }));
  } else {
    process.stdout.write(json);
  }
  if (report.totals.errors || Object.values(report.variants).some(({ jobErrors }) => jobErrors.length)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
