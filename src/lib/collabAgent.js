import { base44 } from "@/api/base44Client";

export const SCENES = {
  couple: { label: "情侣约定", tone: "温柔、平等，绝不评判或站队，不做关系评分" },
  friends: { label: "朋友约定", tone: "轻松友好，照顾每个人的意愿" },
  colleagues: { label: "项目协同", tone: "清晰专业，突出负责人、标准与节点" },
  custom: { label: "自定义", tone: "中性、清晰" },
};

const ITEM = { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, done_criteria: { type: "string" }, owner_name: { type: "string" }, due_date: { type: "string" }, status: { type: "string", enum: ["in_progress", "pending_confirm", "done"] } } };

// 整个空间的"全量快照"：Agent 每次输出的是最新的完整结构，而不是增量追加
const SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" }, title: { type: "string" },
          status: { type: "string", enum: ["discussing", "pending_confirm", "decided"] },
          conclusion: { type: "string" }, next_step: { type: "string" }, confirm_by: { type: "string" },
          subagreements: { type: "array", items: ITEM },
        },
      },
    },
    milestones: { type: "array", items: ITEM },
    remove_ids: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};

const STATUS_LABEL = { discussing: "讨论中", pending_confirm: "待确认", decided: "已定" };

export async function runCollabAgent({ space, messages = [], items = [], request = null }) {
  const scene = SCENES[space.scene] || SCENES.custom;
  const talk = messages.slice(-60).map((m) => `${m.author_name}: ${m.content}`).join("\n");
  const themes = items.filter((i) => i.is_theme);
  const snapshot = themes.map((t) => {
    const kids = items.filter((i) => i.parent_id === t.id && !i.is_theme).map((k) => `    - [${k.id}] ${k.title}｜完成标准:${k.done_criteria || "-"}｜负责人:${k.owner_name || "-"}｜${k.status}`).join("\n");
    return `[${t.id}] 方向:${t.title}｜${t.status}｜结论:${t.content || "-"}｜下一步:${t.done_criteria || "-"}｜待谁确认:${t.owner_name || "-"}\n${kids}`;
  }).join("\n");
  const loose = items.filter((i) => !i.is_theme && i.kind !== "document" && !themes.some((t) => t.id === i.parent_id))
    .map((i) => `[${i.id}] ${i.kind === "milestone" ? "节点" : "子约定"}:${i.title}｜${i.due_date || ""}｜${i.status}`).join("\n");

  const task = request === "init"
    ? "空间刚创建：reply 欢迎大家、复述目标，并提出 2-4 个需要讨论的大方向（写入 themes，status=discussing）。"
    : request
      ? `成员 @你 说：「${request}」。reply 直接回应（回答/建议/查资料），同时更新整体结构。`
      : "这是后台静默整理：reply 必须留空字符串，只更新整体结构。";

  return base44.integrations.Core.InvokeLLM({
    model: "gemini_3_flash",
    add_context_from_internet: !!request,
    prompt: `你是「心栈」协同约定空间的 Agent，负责把成员的自由讨论，持续整理成一张"一眼看懂"的执行看板。

整理原则（最重要）：
1. 输出的是【最新的完整看板】，不是新增内容。已有条目必须带上原 id 并按讨论更新；只有真正新的事项才不带 id。
2. 抓重点、强合并：大方向 themes 控制在 2-6 个；每个方向下子约定最多 4 条；同一件事只保留一条（措辞不同但实质相同即合并），被合并或已无意义的条目 id 放入 remove_ids。闲聊、玩笑、重复表态不产生条目。
3. 每个方向写清：status（讨论中/待确认/已定）、conclusion（目前讨论结果，一句话，未定写目前倾向或分歧点）、next_step（还差什么一步）、confirm_by（需要谁拍板，没有则留空）。
4. 子约定写清 title、done_criteria（怎样算完成）、owner_name（谁做，从讨论推断，不确定留空）；讨论明确完成的标 done，需要成员确认的标 pending_confirm。
5. milestones 只放有明确日期或时间约束的关键节点（YYYY-MM-DD，今天 ${new Date().toISOString().slice(0, 10)}），同样带 id 更新，最多 5 个。
6. summary：用 Markdown 写一份精炼的"讨论纪要"（共识 / 分歧 / 待办与负责人），整体覆盖更新，不超过 250 字。
7. reply 简短自然（3-5 句），风格：${scene.tone}；中立，不站队，不替成员做决定。

主题：${space.title}
共同目标：${space.goal || "未填写"}
成员：${(space.members || []).map((m) => m.name).join("、")}
当前看板：
${snapshot || "（空）"}
${loose ? `未归类条目：\n${loose}` : ""}
讨论记录：
${talk || "（暂无）"}

任务：${task}
用中文输出。`,
    response_json_schema: SCHEMA,
  });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function persistAgentResult(space, r, items = []) {
  const base = { space_id: space.id, member_ids: space.member_ids, source: "agent" };
  const ids = new Set(items.map((i) => i.id));
  if (r.reply?.trim()) await base44.entities.CollabMessage.create({ ...base, is_agent: true, author_name: "心栈Agent", content: r.reply });

  const updates = [];
  const creates = [];
  const keep = new Set();
  const itemData = (s) => ({ title: s.title, done_criteria: s.done_criteria, owner_name: s.owner_name, status: s.status || "in_progress", ...(DATE.test(s.due_date || "") ? { due_date: s.due_date } : {}) });

  for (const t of r.themes || []) {
    if (!t.title) continue;
    const themeData = { title: t.title, content: t.conclusion || "", done_criteria: t.next_step || "", owner_name: t.confirm_by || "", status: t.status === "decided" ? "done" : t.status === "pending_confirm" ? "pending_confirm" : "in_progress" };
    let themeId = t.id;
    if (ids.has(themeId)) updates.push({ id: themeId, ...themeData });
    else themeId = (await base44.entities.CollabItem.create({ ...base, kind: "subagreement", is_theme: true, ...themeData })).id;
    keep.add(themeId);
    for (const s of t.subagreements || []) {
      if (!s.title) continue;
      if (ids.has(s.id)) { keep.add(s.id); updates.push({ id: s.id, parent_id: themeId, ...itemData(s) }); }
      else creates.push({ ...base, kind: "subagreement", parent_id: themeId, ...itemData(s) });
    }
  }
  for (const m of r.milestones || []) {
    if (!m.title) continue;
    if (ids.has(m.id)) { keep.add(m.id); updates.push({ id: m.id, ...itemData(m) }); }
    else creates.push({ ...base, kind: "milestone", ...itemData(m) });
  }

  // 纪要只保留一份，持续覆盖
  if (r.summary?.trim()) {
    const doc = items.find((i) => i.kind === "document" && i.source === "agent");
    if (doc) updates.push({ id: doc.id, content: r.summary, version: (doc.version || 1) + 1 });
    else creates.push({ ...base, kind: "document", status: "done", title: "讨论纪要", content: r.summary });
  }

  if (updates.length) await base44.entities.CollabItem.bulkUpdate(updates);
  if (creates.length) await base44.entities.CollabItem.bulkCreate(creates);
  const removes = (r.remove_ids || []).filter((id) => ids.has(id) && !keep.has(id));
  await Promise.all(removes.map((id) => base44.entities.CollabItem.delete(id)));
}

export { STATUS_LABEL };