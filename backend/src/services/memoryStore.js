import { Prisma } from "@prisma/client";
import { enqueueMemoryEmbedding } from "./memoryEmbeddings.js";

export const memoryInclude = {
  user: { select: { email: true } },
  fact: { select: { status: true, expiresAt: true } },
  revisions: { orderBy: { version: "desc" }, take: 1, select: { version: true, sourceMessageIds: true, reason: true } },
};

const snapshotFields = [
  "title", "content", "memoryType", "emotion", "eventDate", "people", "locations", "tags", "aiInsight",
  "sourceTaskId", "sourceNoteId", "isPinned",
];
const jsonFields = ["people", "locations", "tags", "aiInsight"];

export class MemoryStoreError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function ownedMemory(db, userId, id) {
  const item = await db.memoryRecord.findFirst({ where: { id, userId }, include: memoryInclude });
  if (!item) throw new MemoryStoreError(404, "MEMORY_NOT_FOUND", "记忆不存在");
  return item;
}

function snapshot(item) {
  return Object.fromEntries(snapshotFields.map((key) => {
    const value = item[key];
    return [key, value instanceof Date ? value.toISOString() : value ?? null];
  }));
}

export function currentMemoryVersion(item) {
  return item.revisions?.[0]?.version ?? 1;
}

export function knownSources(item) {
  const versionSources = item.revisions?.[0]?.sourceMessageIds;
  if (Array.isArray(versionSources)) return versionSources;
  const source = item.aiInsight?.sourceMessageId;
  return typeof source === "string" && source ? [source] : [];
}

export function recallableMessageScope(userId) {
  return { userId, memorySuppressions: { none: { userId } } };
}

export async function ownedMemoryProposal(db, userId, id) {
  if (typeof id !== "string" || !id || id.length > 100) return null;
  const reply = await db.companionMessage.findFirst({
    where: { ...recallableMessageScope(userId), id, role: "assistant" },
    select: { id: true, meta: true },
  });
  return reply?.meta?.planProposal === true ? reply : null;
}

export function activeMemoryScope(userId, now = new Date()) {
  return {
    userId,
    OR: [
      { fact: null },
      { fact: { is: { status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
    ],
  };
}

export async function excludeSuppressedMemories(db, userId, rows) {
  const sources = [...new Set(rows.flatMap(knownSources))];
  if (!sources.length) return rows;
  const blocked = new Set();
  for (let offset = 0; offset < sources.length; offset += 300) {
    const matches = await db.memorySuppression.findMany({
      where: { userId, messageId: { in: sources.slice(offset, offset + 300) } },
      select: { messageId: true },
    });
    for (const { messageId } of matches) blocked.add(messageId);
  }
  return rows.filter((item) => knownSources(item).every((id) => !blocked.has(id)));
}

async function verifiedMessages(db, userId, ids) {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return [];
  const found = await db.companionMessage.findMany({
    where: { ...recallableMessageScope(userId), id: { in: wanted }, role: "user" },
    select: { id: true },
  });
  return found.map(({ id }) => id);
}

async function requireSources(db, userId, data, ids) {
  const allowed = await verifiedMessages(db, userId, ids);
  if (allowed.length !== new Set(ids).size) {
    throw new MemoryStoreError(422, "INVALID_MEMORY_SOURCE", "记忆来源不存在、已忘记或不属于你");
  }
  for (const [field, model] of [["sourceTaskId", "task"], ["sourceNoteId", "note"]]) {
    if (data[field] && !await db[model].findFirst({ where: { id: data[field], userId }, select: { id: true } })) {
      throw new MemoryStoreError(422, "INVALID_MEMORY_SOURCE", "记忆来源不存在或不属于你");
    }
  }
  return allowed;
}

function sourceInsight(data, sourceIds) {
  if (data.aiInsight === undefined && !sourceIds.length) return data;
  const insight = data.aiInsight && typeof data.aiInsight === "object" && !Array.isArray(data.aiInsight)
    ? { ...data.aiInsight } : {};
  delete insight.sourceMessageId;
  if (sourceIds.length) insight.sourceMessageId = sourceIds[0];
  return { ...data, aiInsight: Object.keys(insight).length ? insight : Prisma.DbNull };
}

function requestedSources(data) {
  const id = data.aiInsight?.sourceMessageId;
  return typeof id === "string" && id ? [id] : [];
}

function saveRevision(db, item, { version, sourceIds, actor, reason, createdAt }) {
  return db.memoryRevision.create({
    data: { memoryId: item.id, version, sourceMessageIds: sourceIds, actor, reason, createdAt, snapshot: snapshot(item) },
  });
}

function legacyRevision(item, sourceIds) {
  return { version: 1, sourceMessageIds: sourceIds, createdAt: item.createdAt, actor: "legacy", reason: "legacy", snapshot: snapshot(item) };
}

function checkVersion(item, expectedVersion) {
  if (expectedVersion !== undefined && expectedVersion !== currentMemoryVersion(item)) {
    throw new MemoryStoreError(409, "MEMORY_CONFLICT", "记忆已更新，请刷新后再试");
  }
}

// The caller may share the transaction with the chat message and its acknowledgement.
export async function createMemory(tx, { userId, data, sourceIds = requestedSources(data), actor = "user", reason = "save" }) {
  const verified = await requireSources(tx, userId, data, sourceIds);
  const item = await tx.memoryRecord.create({ data: { ...sourceInsight(data, verified), userId } });
  await saveRevision(tx, item, { version: 1, sourceIds: verified, actor, reason });
  await enqueueMemoryEmbedding(tx, item, 1);
  return ownedMemory(tx, userId, item.id);
}

async function reviseMemory(tx, { item, userId, data, sourceIds, expectedVersion, actor, reason }) {
  checkVersion(item, expectedVersion);
  const previousSources = await verifiedMessages(tx, userId, knownSources(item));
  const verified = await requireSources(tx, userId, data, sourceIds ?? (requestedSources(data).length ? requestedSources(data) : previousSources));
  const version = currentMemoryVersion(item);
  if (!item.revisions.length) {
    await saveRevision(tx, item, { version, sourceIds: previousSources, actor: "legacy", reason: "legacy", createdAt: item.createdAt });
  }
  const updated = await tx.memoryRecord.update({
    where: { id: item.id, userId },
    data: sourceInsight({ ...data, aiInsight: data.aiInsight === undefined ? item.aiInsight ?? undefined : data.aiInsight }, verified),
  });
  await saveRevision(tx, updated, { version: version + 1, sourceIds: verified, actor, reason });
  await enqueueMemoryEmbedding(tx, updated, version + 1);
  return ownedMemory(tx, userId, item.id);
}

export async function updateMemory(tx, { userId, id, data, expectedVersion, sourceIds, actor = "user", reason = "edit" }) {
  const item = await ownedMemory(tx, userId, id);
  const next = { ...data };
  if (actor === "user" && data.aiInsight === undefined && (data.content !== undefined || data.title !== undefined) && item.aiInsight?.sourceMessageId) {
    next.aiInsight = { ...item.aiInsight, editedAt: new Date().toISOString() };
  }
  return reviseMemory(tx, { item, userId, data: next, sourceIds, expectedVersion, actor, reason });
}

export async function memoryHistory(db, { userId, id, beforeVersion, limit = 30 }) {
  const item = await ownedMemory(db, userId, id);
  const history = item.revisions.length
    ? await db.memoryRevision.findMany({
      where: { memoryId: item.id, ...(beforeVersion === undefined ? {} : { version: { lt: beforeVersion } }) },
      orderBy: { version: "desc" }, take: limit,
    })
    : beforeVersion === undefined || beforeVersion > 1
      ? [legacyRevision(item, await verifiedMessages(db, userId, knownSources(item)))] : [];
  const verified = new Set(await verifiedMessages(db, userId, history.flatMap((entry) => entry.sourceMessageIds)));
  return {
    version: currentMemoryVersion(item),
    revisions: history.map(({ version, actor, reason, createdAt, snapshot: value, sourceMessageIds }) => ({
      version, actor, reason, createdAt, title: value.title, content: value.content,
      sourceMessageIds: sourceMessageIds.filter((id) => verified.has(id)),
    })),
  };
}

export async function memorySource(db, { userId, id, version, messageId }) {
  const history = await memoryHistory(db, { userId, id, beforeVersion: version + 1, limit: 1 });
  const selected = history.revisions[0];
  const source = selected?.version === version && selected.sourceMessageIds.includes(messageId)
    ? await db.companionMessage.findFirst({
      where: { ...recallableMessageScope(userId), id: messageId, role: "user" },
      select: { id: true, content: true, createdAt: true },
    }) : null;
  if (!source) throw new MemoryStoreError(404, "MEMORY_SOURCE_NOT_FOUND", "记忆来源不存在");
  return source;
}

export async function restoreMemory(tx, { userId, id, version, expectedVersion }) {
  const item = await ownedMemory(tx, userId, id);
  checkVersion(item, expectedVersion);
  const entry = await tx.memoryRevision.findUnique({ where: { memoryId_version: { memoryId: id, version } } });
  if (!entry) throw new MemoryStoreError(404, "MEMORY_REVISION_NOT_FOUND", "记忆版本不存在");
  const data = { ...entry.snapshot, eventDate: entry.snapshot.eventDate ? new Date(entry.snapshot.eventDate) : null };
  for (const key of jsonFields) if (data[key] === null) data[key] = Prisma.DbNull;
  if (data.aiInsight === Prisma.DbNull) delete data.aiInsight;
  const sourceIds = await verifiedMessages(tx, userId, entry.sourceMessageIds);
  return reviseMemory(tx, { item, userId, data: { ...data, aiInsight: data.aiInsight ?? null }, sourceIds, expectedVersion, actor: "user", reason: "restore" });
}

export async function forgetMemory(tx, { userId, id }) {
  const item = await ownedMemory(tx, userId, id);
  const versions = await tx.memoryRevision.findMany({ where: { memoryId: id } });
  const sourceIds = new Set([...knownSources(item), ...versions.flatMap((entry) => entry.sourceMessageIds)]);
  const quotes = [...new Set([snapshot(item), ...versions.map((entry) => entry.snapshot)]
    .flatMap(({ content, title }) => [content, title]).filter((part) => typeof part === "string" && part.trim().length >= 4))];
  // Source IDs cover new writes. Literal echoes also cover legacy chat written before trace metadata existed.
  let afterId;
  while (true) {
    const messages = await tx.companionMessage.findMany({
      where: { ...recallableMessageScope(userId), ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: "asc" }, take: 200, select: { id: true, meta: true, content: true },
    });
    const suppressed = messages.filter((message) => sourceIds.has(message.id)
      || (Array.isArray(message.meta?.memoryIds) && message.meta.memoryIds.includes(id))
      || (Array.isArray(message.meta?.memorySourceIds) && message.meta.memorySourceIds.some((source) => sourceIds.has(source)))
      || (Array.isArray(message.meta?.recentUserIds) && message.meta.recentUserIds.some((source) => sourceIds.has(source)))
      || quotes.some((quote) => message.content.includes(quote)));
    if (suppressed.length) {
      await tx.memorySuppression.createMany({ data: suppressed.map((message) => ({ userId, messageId: message.id })) });
      const ids = suppressed.map(({ id }) => id);
      await tx.memoryTaskSignal.deleteMany({
        where: { userId, OR: [{ evidenceId: { in: ids } }, { proposalMessageId: { in: ids } }] },
      });
      for (const { id: messageId } of suppressed) sourceIds.add(messageId);
    }
    if (messages.length < 200) break;
    afterId = messages.at(-1).id;
  }
  const recap = await tx.memoryRecap.findUnique({ where: { userId } });
  if (Array.isArray(recap?.points)) {
    const points = recap.points.filter(({ sourceId }) => !sourceIds.has(sourceId));
    if (points.length !== recap.points.length) await tx.memoryRecap.update({ where: { userId }, data: { points } });
  }
  await tx.memoryRecord.delete({ where: { id: item.id, userId } });
}
