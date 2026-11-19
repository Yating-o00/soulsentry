# SoulSentry China memory pilot

From the backend directory:

~~~bash
npm run eval:memory
npm run eval:memory -- --history study --retrieval-only --out /tmp/memory-study-retrieval.json
node --test scripts/memory-eval/run.test.js
npm run eval:memory -- --live --baseline --out /tmp/memory-baseline.json
npm run eval:memory -- --retrieval-only --out /tmp/memory-retrieval-comparison.json
npm run eval:memory -- --live --out /tmp/memory-comparison.json
~~~

The first command runs the offline baseline and makes no provider calls. Live mode defaults to the paired pilot and uses DeepSeek Flash. It reads the API key from the process environment or the backend's local environment configuration. The paired pilot uses 44 calls, split into 24 chat, 8 planner, 8 extraction, and 4 consolidation calls. Add `--baseline` for the 16-call baseline. Each measured call is capped at 2,000 output tokens. If chat cannot complete a planning request, the reserved call runs a diagnostic draft and that draft cannot count as a successful user plan. The pilot also measures a fixed job-call budget, including passes where the production rules already have enough evidence. Scoring is local.

The runner compares four synthetic histories and twelve live-eligible probes. The study history adds seven retrieval probes that run locally even in live mode. It calls the existing retriever, chat prompt, and planner for the baseline. It feeds only the latest prompt plus a fixed recent conversation window to the chat prompt, so the old facts have to come from retrieval. The pilot measures these components in isolation. The HTTP action router, SQLite storage, and worker scheduling are covered separately by integration tests as they are added. Pilot planning uses one draft per case to keep the budget predictable.

The study history includes an explicit 30-minute limit later corrected to 20 minutes, a past 10-minute exception, a paper flashcard preference, two 45-minute lookalikes with different owners or activities, a sister's exam date, and an assistant guess. The replay uses what the baseline would explicitly save. The retrieval-only mode instead seeds both arms with the same six current facts, including legitimate but distracting memories. This lets us measure retrieval independently of capture and consolidation. Use `--retrieval-only --candidate <adapter>` to compare a local retriever using only its `retrieve` method.

The candidate is a trusted backend module that default-exports three methods:

- `extract({ userId, messages, records, invoke })` processes one batch and returns the complete updated record list. Explicit captures are already applied. Each message has `id`, `role`, and `content`.
- `consolidate({ userId, messages, records, invoke })` reviews the resulting state against the supplied history and returns the complete updated record list.
- `retrieve({ userId, query, records })` returns ranked records from the supplied current state.

Each record should have an `id`, `title` or `content`, and `sourceIds` containing the IDs of the supporting messages. Use `status: "active"` or leave it unset for current records. Each job can use its supplied `invoke` at most once. Use only that callback for model calls so the cap and token counts include them. Retrieval has no paid model allocation in this pilot.

The JSON report includes each query, the expected and missing evidence IDs, and the actual selected text as it would appear in the chat prompt. A clean context pass requires all labeled evidence and no unrelated records. On no-evidence probes, the expected context is empty. The report counts stale hits separately. When live mode is enabled, it also includes draft or reply grades and token usage. The organization metric uses facts per 1,000 active text characters as a local proxy, with coverage and duplicates reported separately. The pilot uses simple text rules for open replies. Review those replies and the scorecard on a held-out set before making release decisions.

## Local or staging rollout settings

Generate the Prisma client and apply the additive schema update to an isolated SQLite database before starting the updated backend. `MEMORY_LEARNING_ENABLED=1` turns on queueing, consolidation, and recap. Users can turn learning off from the memory panel. `MEMORY_HYBRID_ENABLED=1` enables the scoped ranker and bounded transcript lookup. To pilot vectors, also configure `MEMORY_EMBEDDING_URL` as a trusted embeddings endpoint and `MEMORY_EMBEDDING_MODEL`, plus `MEMORY_EMBEDDING_API_KEY` if required. New and updated memories are indexed by the worker. Existing records with no vector use the local ranker. `MEMORY_TOPIC_SUMMARY_ENABLED=1` separately enables compact summaries. The 44-call pilot shares the extraction rules, consolidation logic, ranker, chat prompt, planning memory inputs, and planner. It does not measure embeddings, HTTP routing, job scheduling, or real-world rollout behavior.

The companion backend defaults to Kimi. A developer can set `CHAT_AI_PROVIDER=deepseek` in the backend environment and restart the service, or make a single trusted server-side call with `invokeDashboardAi(options, { provider: "deepseek" })`. The live pilot always selects DeepSeek explicitly. Its selection only applies to the pilot process.
