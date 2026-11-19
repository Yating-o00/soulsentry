import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MAX_CALLS, runPilot } from "./run.js";

test("default pilot scores the current retriever with no model calls", async () => {
  const report = await runPilot();
  assert.equal(report.totals.calls, 0);
  assert.equal(report.variants.baseline.cases.filter(({ offlineOnly }) => !offlineOnly).length, 12);
  assert.equal(report.variants.baseline.summary.scoredAnswers, 0);
  assert.equal(report.variants.baseline.cases.find(({ id }) => id === "commute-mode").found, 0);
  assert.equal(report.variants.baseline.cases.find(({ id }) => id === "equipment").stale, 1);
});

test("retrieval-only study comparison scores identical seeded evidence without jobs or model calls", async () => {
  const report = await runPilot({
    historyId: "study",
    retrievalOnly: true,
    candidate: {
      retrieve({ records, query }) {
        assert.ok(records.some(({ id }) => id === "duration"));
        assert.ok(records.some(({ id }) => id === "sister-duration"));
        assert.ok(!records.some(({ id }) => id === "duration-old" || id === "guessed-exam"));
        if (query.includes("也用我平常的复习方式")) {
          return records.filter(({ id }) => id === "duration" || id === "format" || id === "sister-duration");
        }
        return [];
      },
    },
  });
  assert.equal(report.totals.calls, 0);
  assert.equal(report.callLimit, 0);
  assert.equal(report.variants.baseline.cases.length, 10);
  const result = report.variants.candidate.cases.find(({ id }) => id === "study-plan");
  assert.equal(result.found, 2);
  assert.deepEqual(result.missingEvidence, []);
  assert.equal(result.irrelevant, 1);
  assert.equal(result.contextPass, false, "selecting all required facts cannot hide misleading context");
  assert.ok(result.returned.some(({ id, content }) => id === "duration" && content.includes("20分钟")));
});

test("the retrieval-only CLI defaults to baseline and candidate with no provider calls", () => {
  const runner = fileURLToPath(new URL("./run.js", import.meta.url));
  const report = JSON.parse(execFileSync(process.execPath, [runner, "--retrieval-only", "--history", "study"], { encoding: "utf8" }));
  assert.deepEqual(Object.keys(report.variants), ["baseline", "candidate"]);
  assert.equal(report.totals.calls, 0);
});

test("paired pilot uses at most 44 metered calls, including both jobs and the planner", async () => {
  const report = await runPilot({
    provider: async ({ prompt, systemPrompt, maxTokens }) => {
      assert.ok(maxTokens <= 2000);
      const data = systemPrompt?.startsWith("你是约定规划师")
        ? { patterns: [{ title: "复习", description: "练习", applies_to: "周一,周三,周五", start_time: "10:00", duration_minutes: 30, session_type: "session" }] }
        : { reply: "好的", extracted: /每周三次/.test(prompt) ? { type: "plan", plan_request: { goal: "测试规划", horizon_days: 7, daily_minutes: 30 } } : null };
      return { data, usage: { prompt_tokens: 10, completion_tokens: 5 } };
    },
    candidate: {
      async extract({ records, messages, invoke }) {
        await invoke({ prompt: "extract" });
        return [...records, ...messages.filter(({ role, content }) => role === "user" && !content.startsWith("记住：")).map(({ id, content }) => ({ id, content, sourceIds: [id] }))];
      },
      async consolidate({ records, invoke }) {
        await invoke({ prompt: "consolidate" });
        return records.filter(({ id }) => !["dumbbells", "duration-old", "past-exception"].includes(id));
      },
      retrieve({ records }) {
        return records;
      },
    },
  });
  assert.equal(report.totals.calls, MAX_CALLS);
  assert.equal(report.usage.chat.calls, 24);
  assert.equal(report.usage.planner.calls, 8);
  assert.equal(report.usage.extraction.calls, 8);
  assert.equal(report.usage.consolidation.calls, 4);
  assert.equal(report.totals.inputTokens, 440);
  assert.equal(report.totals.outputTokens, 220);
  assert.equal(report.variants.candidate.summary.exactState, 4);
});

test("a job cannot bill a second model call through its callback", async () => {
  let calls = 0;
  await assert.rejects(runPilot({
    provider: async () => {
      calls++;
      return { data: { reply: "好的" } };
    },
    candidate: {
      async extract({ records, invoke }) {
        await invoke({ prompt: "first" });
        await invoke({ prompt: "duplicate" });
        return records;
      },
      consolidate: ({ records }) => records,
      retrieve: ({ records }) => records,
    },
  }), /one model call/);
  assert.equal(calls, 17);
});
