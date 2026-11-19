import { extractMemoryObservations, proposeMemoryRetirements } from "../../src/services/memoryLearning.js";
import { rankMemoryRecords } from "../../src/services/memoryRanking.js";

// This adapter isolates the production extraction, consolidation, and ranking
// logic from SQLite scheduling. The worker's transaction behavior has its own tests.
export default {
  async extract({ records, messages, invoke, now }) {
    const observations = await extractMemoryObservations({ messages, records, invoke, now, runWhenEmpty: true });
    const next = [...records];
    for (const observation of observations) {
      const index = next.findIndex((record) => record.slot === observation.slot && record.status !== "superseded");
      if (index === -1) {
        next.unshift({
          id: "learned:" + observation.slot, ...observation, reason: "extracted",
          createdAt: messages.find(({ id }) => observation.sourceIds.includes(id))?.createdAt,
        });
      } else if ((observation.isCorrection || (next[index].fact.expiresAt && new Date(next[index].fact.expiresAt) <= now))
        && (!observation.fact.expiresAt || next[index].fact.expiresAt)
        && !next[index].sourceIds.some((id) => observation.sourceIds.includes(id))) {
        next[index] = { ...next[index], ...observation, reason: "correction" };
      }
    }
    return next;
  },
  async consolidate({ records, messages, invoke, now }) {
    const active = records.filter((record) => !record.fact?.expiresAt || new Date(record.fact.expiresAt) > now);
    const retirements = await proposeMemoryRetirements({ messages, records: active, invoke, runWhenEmpty: true });
    const obsolete = new Set(retirements.map(({ obsoleteId }) => obsoleteId));
    return records.map((record) => {
      if (obsolete.has(record.id)) return { ...record, status: "superseded" };
      if (!active.includes(record)) return { ...record, status: "expired" };
      return record;
    });
  },
  retrieve({ records, query }) {
    return rankMemoryRecords(records, query);
  },
};
