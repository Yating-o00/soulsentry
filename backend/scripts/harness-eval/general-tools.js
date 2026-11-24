import { isDeepStrictEqual } from "node:util";

const text = { type: "string" };
const version = { type: "integer", minimum: 1 };
const input = (properties, required = Object.keys(properties)) => ({
  type: "object", properties, required, additionalProperties: false,
});
const capability = (name, effect, description, args) => ({ name, effect, description, input: args });

const reads = [
  capability("find_records", "read", "查询本人记录，可按标题片段或所属集合筛选。", input({ query: text, collectionId: text }, [])),
  capability("find_collections", "read", "查询本人集合、容量及占用情况，可按名称片段或 ID 筛选。", input({ query: text, id: text }, [])),
  capability("lookup_action", "read", "通过稳定操作 ID 核实先前的写入结果。", input({ operationId: text })),
];
const single = capability("set_status", "write", "按记录版本更新一条记录的状态，执行时传入稳定操作 ID。", input({
  id: text, status: { enum: ["open", "done", "paused"] }, version,
}));
const batch = capability("move_records", "write", "整批移动记录。来源记录和目标集合版本必须匹配，目标必须容纳全部记录。", input({
  records: { type: "array", minItems: 1, items: input({ id: text, version }) }, target: text, targetVersion: version,
}));

export const initialRecords = [
  { id: "report-a", title: "周报 A", collectionId: "inbox", status: "open", version: 1, owner: "owner" },
  { id: "report-b", title: "周报 B", collectionId: "inbox", status: "open", version: 1, owner: "owner" },
  { id: "filler", title: "外部新增项", collectionId: "backup", status: "open", version: 1, owner: "owner" },
  { id: "other-report", title: "周报 A", collectionId: "other-inbox", status: "done", version: 1, owner: "other" },
];

const initialCollections = [
  { id: "inbox", name: "收件箱", capacity: 10, version: 1, owner: "owner" },
  { id: "review", name: "评审箱", capacity: 2, version: 1, owner: "owner" },
  { id: "backup", name: "备用箱", capacity: 4, version: 1, owner: "owner" },
  { id: "decoy", name: "周报 A", capacity: 5, version: 1, owner: "owner" },
  { id: "other-inbox", name: "收件箱", capacity: 5, version: 1, owner: "other" },
];

const ok = (data) => ({ ok: true, data });
const fail = (code) => ({ ok: false, code });

export function createEnvironment({ holdout, fault }) {
  const records = structuredClone(initialRecords);
  const collections = structuredClone(initialCollections);
  const capabilities = [...reads, single, ...(holdout ? [batch] : [])];
  const receipts = new Map();
  const occupancy = (id) => records.filter(({ collectionId }) => collectionId === id).length;

  function move(changes, target) {
    const changed = new Set([target]);
    for (const record of changes) {
      changed.add(record.collectionId);
      record.collectionId = target;
      record.version += 1;
    }
    for (const collection of collections) {
      if (changed.has(collection.id)) collection.version += 1;
    }
  }

  function apply(actorId, name, args, operationId) {
    if (typeof operationId !== "string" || !operationId.trim()) return fail("missing_operation_id");
    const key = JSON.stringify([actorId, operationId]);
    const previous = receipts.get(key);
    if (previous) {
      if (!isDeepStrictEqual(previous.action, { name, args })) return fail("operation_id_reused");
      return ok(previous.data);
    }

    if (name === "set_status") {
      const record = records.find(({ id, owner }) => id === args.id && owner === actorId);
      if (!record) return fail("forbidden");
      if (record.version !== args.version) return fail("precondition_changed");
      if (!single.input.properties.status.enum.includes(args.status)) return fail("invalid_input");
      record.status = args.status;
      record.version += 1;
    } else {
      const target = collections.find(({ id, owner }) => id === args.target && owner === actorId);
      if (!target) return fail("forbidden");
      if (!Array.isArray(args.records) || !args.records.length
        || args.records.some((record) => typeof record?.id !== "string" || !Number.isInteger(record.version))) {
        return fail("invalid_input");
      }
      const requested = new Map(args.records.map(({ id, version }) => [id, version]));
      if (requested.size !== args.records.length) return fail("invalid_input");
      const selected = records.filter(({ id, owner }) => requested.has(id) && owner === actorId);
      if (selected.length !== requested.size) return fail("forbidden");
      if (target.version !== args.targetVersion || selected.some((record) => requested.get(record.id) !== record.version)) {
        return fail("precondition_changed");
      }
      const coming = selected.filter((record) => record.collectionId !== target.id);
      if (occupancy(target.id) + coming.length > target.capacity) return fail("precondition_changed");
      move(coming, target.id);
    }

    const data = { operationId, committed: true };
    receipts.set(key, { data, action: { name, args } });
    return fault ? fail("timeout") : ok(data);
  }

  function call(actorId, name, args, operationId) {
    if (!args || typeof args !== "object" || Array.isArray(args)) return fail("invalid_input");
    if (name === "find_records") {
      return ok(records.filter((record) => record.owner === actorId
        && (!args.query || record.title.includes(args.query))
        && (!args.collectionId || record.collectionId === args.collectionId)));
    }
    if (name === "find_collections") {
      return ok(collections.filter((collection) => collection.owner === actorId
        && (!args.id || collection.id === args.id)
        && (!args.query || collection.name.includes(args.query)))
        .map((collection) => ({ ...collection, occupied: occupancy(collection.id) })));
    }
    if (name === "lookup_action") {
      if (fault === "verify_unavailable") return fail("verify_unavailable");
      const receipt = receipts.get(JSON.stringify([actorId, args.operationId]));
      return receipt ? ok(receipt.data) : fail("not_found");
    }
    if (capabilities.some((tool) => tool.name === name && tool.effect === "write")) {
      return apply(actorId, name, args, operationId);
    }
    return fail("unknown_tool");
  }

  return {
    capabilities: structuredClone(capabilities),
    commitCount: () => receipts.size,
    snapshot: () => structuredClone(records),
    async call(actorId, name, args, operationId) {
      return structuredClone(call(actorId, name, args, operationId));
    },
    fillReview() {
      move(records.filter(({ id }) => id === "filler"), "review");
    },
  };
}
