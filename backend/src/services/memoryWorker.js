import { randomUUID } from "node:crypto";
import { invokeDashboardAi } from "../lib/dashboardAi.js";
import { activeMemoryScope, createMemory, currentMemoryVersion, knownSources, memoryInclude, recallableMessageScope, updateMemory } from "./memoryStore.js";
import { extractMemoryObservations, proposeMemoryRetirements } from "./memoryLearning.js";
import { proposeMemoryRecap, RECENT_CHAT_WINDOW, saveMemoryRecap } from "./memoryContext.js";
import { embedMemoryText, embeddingModel } from "./memoryEmbeddings.js";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 12;
const LEASE_MS = 120_000;
const CONSOLIDATION_DELAY_MS = 300_000;
const PENDING = { completedAt: null, failedAt: null };

export function memoryLearningEnabled() {
  return process.env.MEMORY_LEARNING_ENABLED === "1";
}

export async function enqueueMemoryMessage(tx, message) {
  if (!memoryLearningEnabled() || message.role !== "user") return;
  const state = await tx.memoryWorkerState.findUnique({ where: { userId: message.userId }, select: { enabled: true } });
  if (state?.enabled === false) return;
  await tx.memoryJob.upsert({
    where: { userId_kind_evidenceId: { userId: message.userId, kind: "extract", evidenceId: message.id } },
    update: {},
    create: { userId: message.userId, kind: "extract", evidenceId: message.id },
  });
}

async function claim(db, now) {
  return db.$transaction(async (tx) => {
    const available = {
      ...PENDING,
      kind: { in: [
        ...(memoryLearningEnabled() ? ["extract", "consolidate", "recap"] : []),
        ...(embeddingModel() ? ["embed"] : []),
      ] },
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: now },
      user: {
        OR: [
          { memoryWorkerState: null },
          { memoryWorkerState: { is: { enabled: true, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] } } },
        ],
      },
    };
    const next = await tx.memoryJob.findFirst({ where: available, orderBy: [{ availableAt: "asc" }, { id: "asc" }] });
    if (!next) return null;
    const leaseToken = randomUUID();
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    await tx.memoryWorkerState.upsert({
      where: { userId: next.userId }, create: { userId: next.userId, leaseToken, leaseUntil },
      update: { leaseToken, leaseUntil },
    });
    const jobs = await tx.memoryJob.findMany({
      where: { ...available, user: undefined, userId: next.userId, kind: next.kind },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: BATCH_SIZE,
    });
    await tx.memoryJob.updateMany({
      where: { id: { in: jobs.map(({ id }) => id) } },
      data: { attempts: { increment: 1 }, availableAt: leaseUntil },
    });
    return { userId: next.userId, kind: next.kind, leaseToken, jobs };
  });
}

async function sourceMessages(db, userId, ids) {
  if (!ids.length) return [];
  return db.companionMessage.findMany({
    where: { ...recallableMessageScope(userId), role: "user", id: { in: [...new Set(ids)] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, role: true, content: true, createdAt: true, meta: true },
  });
}

async function context(db, batch, now) {
  const rows = await db.memoryRecord.findMany({
    where: batch.kind === "extract"
      ? { userId: batch.userId, OR: [{ fact: null }, { fact: { is: { status: "active" } } }] }
      : activeMemoryScope(batch.userId, now),
    include: { ...memoryInclude, fact: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 30,
  });
  const records = rows.map((item) => ({
    id: item.id, title: item.title, content: item.content, fact: item.fact,
    sourceIds: knownSources(item), version: currentMemoryVersion(item),
    reason: item.revisions[0]?.reason, createdAt: item.updatedAt,
  }));
  const sources = batch.kind === "extract"
    ? batch.jobs.map(({ evidenceId }) => evidenceId)
    : records.flatMap(({ sourceIds }) => sourceIds).slice(0, 72);
  return { records, messages: await sourceMessages(db, batch.userId, sources) };
}

async function applyObservations(tx, userId, observations, records, now) {
  const seen = new Map(records.map((item) => [item.id, item.version]));
  for (const item of observations) {
    if (!(await sourceMessages(tx, userId, item.sourceIds)).length) continue;
    if (item.fact.expiresAt && Date.parse(item.fact.expiresAt) <= now.getTime()) continue;
    const known = await tx.memoryFact.findUnique({
      where: { userId_slot: { userId, slot: item.slot } },
      include: { memory: { include: memoryInclude } },
    });
    const data = { title: item.title, content: item.content, memoryType: "preference" };
    const fact = { ...item.fact, expiresAt: item.fact.expiresAt ? new Date(item.fact.expiresAt) : null };
    if (!known) {
      const memory = await createMemory(tx, { userId, data, sourceIds: item.sourceIds, actor: "worker", reason: "extracted" });
      await tx.memoryFact.create({ data: { memoryId: memory.id, userId, slot: item.slot, ...fact } });
      continue;
    }
    const prior = known.memory;
    const canRefresh = seen.get(prior.id) === currentMemoryVersion(prior) && !["edit", "restore"].includes(prior.revisions[0]?.reason);
    if (!canRefresh || known.status !== "active") continue;
    if (!item.isCorrection && !(known.expiresAt && known.expiresAt <= now)) continue;
    if (fact.expiresAt && !known.expiresAt) continue;
    const currentSources = await sourceMessages(tx, userId, knownSources(prior));
    const newSources = await sourceMessages(tx, userId, item.sourceIds);
    if (currentSources.some((old) => old.createdAt > newSources.at(-1).createdAt) ||
        currentSources.some(({ id }) => item.sourceIds.includes(id))) continue;
    await updateMemory(tx, {
      userId, id: prior.id, data, sourceIds: item.sourceIds, expectedVersion: seen.get(prior.id), actor: "worker", reason: "correction",
    });
    await tx.memoryFact.update({ where: { memoryId: prior.id }, data: fact });
  }
}

async function applyRetirements(tx, userId, operations, records) {
  const seen = new Map(records.map((record) => [record.id, record]));
  for (const { obsoleteId, currentId } of operations) {
    const rows = await tx.memoryRecord.findMany({
      where: { userId, id: { in: [obsoleteId, ...(currentId ? [currentId] : [])] } }, include: { ...memoryInclude, fact: true },
    });
    if (rows.length !== (currentId ? 2 : 1) || rows.some((row) => seen.get(row.id)?.version !== currentMemoryVersion(row))) continue;
    const obsolete = rows.find(({ id }) => id === obsoleteId);
    const current = rows.find(({ id }) => id === currentId);
    if ((obsolete.fact && obsolete.fact.status !== "active") || (current?.fact && current.fact.status !== "active")) continue;
    if (current && !(await sourceMessages(tx, userId, knownSources(current))).length) continue;
    await tx.memoryFact.upsert({
      where: { memoryId: obsoleteId }, update: { status: "superseded", slot: null },
      create: {
        memoryId: obsoleteId, userId, status: "superseded", subject: current?.fact?.subject ?? "self",
        topic: current?.fact?.topic ?? "legacy", attribute: current?.fact?.attribute ?? "legacy", aliases: [],
      },
    });
  }
}

async function finish(db, batch, now, work) {
  return db.$transaction(async (tx) => {
    const lease = await tx.memoryWorkerState.findFirst({
      where: { userId: batch.userId, enabled: true, leaseToken: batch.leaseToken, leaseUntil: { gt: now } },
    });
    if (!lease) return false;
    await work(tx);
    await tx.memoryJob.updateMany({
      where: { id: { in: batch.jobs.map(({ id }) => id) } }, data: { completedAt: now },
    });
    await tx.memoryWorkerState.update({ where: { userId: batch.userId }, data: { leaseToken: null, leaseUntil: null } });
    return true;
  });
}

async function releaseForRetry(db, batch, now) {
  await db.$transaction(async (tx) => {
    const released = await tx.memoryWorkerState.updateMany({
      where: { userId: batch.userId, leaseToken: batch.leaseToken }, data: { leaseToken: null, leaseUntil: null },
    });
    if (!released.count) return;
    for (const job of batch.jobs) {
      const attempts = job.attempts + 1;
      await tx.memoryJob.update({
        where: { id: job.id }, data: attempts >= MAX_ATTEMPTS
          ? { failedAt: now }
          : { availableAt: new Date(now.getTime() + attempts * 60_000) },
      });
    }
  });
}

async function prepareEmbeddings(db, batch, now) {
  const model = embeddingModel();
  const result = [];
  for (const { evidenceId } of batch.jobs) {
    const splitAt = evidenceId.lastIndexOf(":");
    const id = evidenceId.slice(0, splitAt);
    const version = Number(evidenceId.slice(splitAt + 1));
    const record = await db.memoryRecord.findFirst({ where: { ...activeMemoryScope(batch.userId, now), id }, include: memoryInclude });
    if (!record || currentMemoryVersion(record) !== version) continue;
    const embedding = await embedMemoryText([record.title, record.content].filter(Boolean).join("\n"), { timeout: 7000 });
    if (embedding?.model === model) result.push({ id, version, model, vector: embedding.values });
  }
  return result;
}

export async function runMemoryJob(db, { invoke = invokeDashboardAi, clock = () => new Date() } = {}) {
  const before = clock();
  // The final attempt may have crashed without writing failedAt.
  await db.memoryJob.updateMany({
    where: { ...PENDING, attempts: { gte: MAX_ATTEMPTS }, availableAt: { lte: before } },
    data: { failedAt: before },
  });
  const batch = await claim(db, before);
  if (!batch) return null;
  try {
    if (batch.kind === "embed") {
      const embeddings = await prepareEmbeddings(db, batch, before);
      await finish(db, batch, clock(), async (tx) => {
        for (const { id, ...data } of embeddings) {
          const current = await tx.memoryRecord.findFirst({ where: { ...activeMemoryScope(batch.userId, clock()), id }, include: memoryInclude });
          if (current && currentMemoryVersion(current) === data.version) {
            await tx.memoryEmbedding.upsert({ where: { memoryId: id }, create: { memoryId: id, ...data }, update: data });
          }
        }
      });
      return batch.kind;
    }
    const { records, messages } = await context(db, batch, before);
    if (batch.kind === "extract") {
      const observations = await extractMemoryObservations({ messages, records, now: before, invoke });
      await finish(db, batch, clock(), async (tx) => {
        await applyObservations(tx, batch.userId, observations, records, clock());
        const evidenceId = batch.jobs.at(-1).id;
        if (observations.length || records.some(({ content, title }) => /^(以前|上个月|原来|曾经)/.test(content || title))) {
          await tx.memoryJob.upsert({
            where: { userId_kind_evidenceId: { userId: batch.userId, kind: "consolidate", evidenceId } }, update: {},
            create: {
              userId: batch.userId, kind: "consolidate", evidenceId, availableAt: new Date(clock().getTime() + CONSOLIDATION_DELAY_MS),
            },
          });
        }
        const compactable = await tx.companionMessage.findFirst({
          where: recallableMessageScope(batch.userId), orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: RECENT_CHAT_WINDOW, select: { id: true },
        });
        if (compactable) {
          await tx.memoryJob.upsert({
            where: { userId_kind_evidenceId: { userId: batch.userId, kind: "recap", evidenceId: compactable.id } }, update: {},
            create: { userId: batch.userId, kind: "recap", evidenceId: compactable.id },
          });
        }
      });
    } else if (batch.kind === "consolidate") {
      const retirements = await proposeMemoryRetirements({ messages, records, invoke });
      await finish(db, batch, clock(), (tx) => applyRetirements(tx, batch.userId, retirements, records));
    } else if (batch.kind === "recap") {
      const recap = await proposeMemoryRecap(db, { userId: batch.userId, invoke });
      await finish(db, batch, clock(), async (tx) => {
        if (recap) await saveMemoryRecap(tx, batch.userId, recap);
      });
    }
    return batch.kind;
  } catch (error) {
    await releaseForRetry(db, batch, clock());
    throw error;
  }
}

export function startMemoryWorker(db) {
  if (!memoryLearningEnabled() && !embeddingModel()) return;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runMemoryJob(db);
    } catch (error) {
      console.warn("[memory-worker] job failed:", error.code || error.name);
    } finally {
      running = false;
    }
  }, 15_000);
  timer.unref();
}
