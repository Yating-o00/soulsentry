import { timeLatencyStage } from "./conversationLatency.js";

export function embeddingModel() {
  return process.env.MEMORY_HYBRID_ENABLED === "1" && process.env.MEMORY_EMBEDDING_URL && process.env.MEMORY_EMBEDDING_MODEL
    ? process.env.MEMORY_EMBEDDING_MODEL : null;
}

function vector(value) {
  if (!Array.isArray(value) || !value.length || value.length > 4096 || value.some((n) => !Number.isFinite(n))) return null;
  const magnitude = Math.hypot(...value);
  return magnitude ? value.map((n) => n / magnitude) : null;
}

export async function embedMemoryText(text, { timeout = 1000, fetchImpl = fetch } = {}) {
  const model = embeddingModel();
  if (!model) return null;
  const key = process.env.MEMORY_EMBEDDING_API_KEY;
  return timeLatencyStage("model_attempt", async () => {
    const response = await fetchImpl(process.env.MEMORY_EMBEDDING_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
      body: JSON.stringify({ model, input: String(text).slice(0, 600) }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error("Memory embedding request failed");
    const data = await response.json();
    const values = vector(data.data?.[0]?.embedding);
    if (!values) throw new Error("Invalid memory embedding response");
    return { model, values };
  }, "memory_embedding");
}

export async function memoryVectorScores(records, query, embed = embedMemoryText) {
  const model = embeddingModel();
  const comparable = records.filter(({ embedding, revisions }) => embedding?.model === model
    && embedding.version === (revisions?.[0]?.version ?? 1));
  if (!model || !comparable.length) return new Map();
  try {
    const result = await embed(query);
    if (!result || result.model !== model) return new Map();
    return new Map(comparable.flatMap(({ id, embedding }) => {
      const values = vector(embedding.vector);
      if (!values || values.length !== result.values.length) return [];
      const similarity = result.values.reduce((sum, n, i) => sum + n * values[i], 0);
      return [[id, similarity]];
    }));
  } catch {
    return new Map();
  }
}

export async function enqueueMemoryEmbedding(tx, item, version) {
  if (!embeddingModel()) return;
  const { id, userId } = item;
  const evidenceId = id + ":" + version;
  await tx.memoryJob.upsert({
    where: { userId_kind_evidenceId: { userId, kind: "embed", evidenceId } },
    create: { userId, kind: "embed", evidenceId },
    update: {},
  });
}
