import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { invokeDashboardAi } from "../../src/lib/dashboardAi.js";
import { runGeneralCase } from "./general-runner.js";

export async function runLiveGeneralCases(scenarios, createDriver) {
  const { values } = parseArgs({ options: { out: { type: "string" }, repeats: { type: "string", default: "3" } } });
  const repeats = Number(values.repeats);
  if (!values.out || !process.env.DEEPSEEK_API_KEY?.trim() || ![1, 2, 3].includes(repeats)) {
    throw new Error("Supply --out <report>, --repeats 1-3 and DEEPSEEK_API_KEY.");
  }
  const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash";
  const trials = [];
  for (const fixture of scenarios) {
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
      const driver = createDriver({ invoke: async (options) => {
        usage.calls += 1;
        try {
          const result = await invokeDashboardAi(options, { provider: "deepseek", model });
          usage.inputTokens += result.usage?.prompt_tokens ?? 0;
          usage.outputTokens += result.usage?.completion_tokens ?? 0;
          return result;
        } catch (error) {
          usage.providerError = error.code ?? error.message;
          usage.inputTokens += error.usage?.prompt_tokens ?? 0;
          usage.outputTokens += error.usage?.completion_tokens ?? 0;
          throw error;
        }
      } });
      const started = performance.now();
      const report = await runGeneralCase(fixture, driver);
      trials.push({ repeat, ...report, usage, elapsedMs: Math.round(performance.now() - started) });
      console.log(JSON.stringify({ id: report.id, repeat, pass: report.pass, issues: report.issues, usage }));
    }
  }
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, JSON.stringify({ model, repeats, passed: trials.filter(({ pass }) => pass).length, trials }, null, 2) + "\n");
}
