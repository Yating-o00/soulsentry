import { base44 } from "@/api/base44Client";

export const SCENES = {
  couple: { label: "情侣约定", tone: "温柔、平等，绝不评判或站队，不做关系评分" },
  friends: { label: "朋友约定", tone: "轻松友好，照顾每个人的意愿" },
  colleagues: { label: "项目协同", tone: "清晰专业，突出负责人、标准与节点" },
  custom: { label: "自定义", tone: "中性、清晰" },
};

const SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    subagreements: { type: "array", items: { type: "object", properties: { theme: { type: "string" }, title: { type: "string" }, done_criteria: { type: "string" }, owner_name: { type: "string" } } } },
    regroup: { type: "array", items: { type: "object", properties: { id: { type: "string" }, theme: { type: "string" } } } },
    completed_ids: { type: "array", items: { type: "string" } },
    milestones: { type: "array", items: { type: "object", properties: { title: { type: "string" }, due_date: { type: "string" } } } },
    document: { type: "object", properties: { title: { type: "string" }, content: { type: "string" } } },
  },
};

export async function runCollabAgent({ space, messages = [], items = [], request = "reply" }) {
  const scene = SCENES[space.scene] || SCENES.custom;
  const talk = messages.slice(-40).map((m) => `${m.author_name}: ${m.content}`).join("\n");
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const existing = items.filter((i) => !i.is_theme).map((i) =>
    `[${i.id}] ${i.kind === "subagreement" ? "子约定" : i.kind === "milestone" ? "节点" : "沉淀"}:${i.title}(${i.status === "done" ? "已完成" : "未完成"})${i.parent_id ? ` 主题:${byId[i.parent_id]?.title || ""}` : ""}`).join("\n");
  const task = request === "init"
    ? "这是空间刚创建。用 reply 欢迎大家，复述对共同目标的理解，并抛出 1-2 个最值得先讨论的问题；可给出初始子约定方向（按主题归类）。"
    : `成员 @你 说：「${request}」。优先直接回应这个请求（回答问题 / 给建议 / 整理对话），同时按职责顺带整理子约定与完成状态。`;

  return base44.integrations.Core.InvokeLLM({
    model: "gemini_3_flash",
    add_context_from_internet: true,
    prompt: `你是「心栈」协同约定空间里的 Agent，像一位靠谱又温暖的伙伴参与讨论。你的职责：
1. 推进对话：总结进展，抛出下一个需要决定的问题。
2. 提供外部信息：涉及地点、价格、时间、天气、攻略、专业知识时，联网查询并给出简洁参考。
3. 专业建议与情绪价值：给出可行建议，同时体察成员情绪，给予肯定与安抚。
4. 化解分歧：中立呈现各方观点，提出折中方案，绝不站队、不替成员做决定。
5. 自动整理：把讨论中新出现的行动项写成子约定（subagreements），每条写清"怎样算完成"，并用 theme 归入一个大主题（如"交通""住宿""预算"）；同类合并，不要重复已有内容。已有但未归类的子约定可通过 regroup 指定主题。
6. 关键时间点写入 milestones（日期 YYYY-MM-DD，今天 ${new Date().toISOString().slice(0, 10)}）。
7. 若讨论已就某条已有子约定/节点达成共识或明确完成，把其 ID 放入 completed_ids。
8. 当形成了较完整的共识时，才输出一份简洁 Markdown 纪要 document，否则留空。
reply 要简短自然（3-6 句），不要用清单堆砌。表达风格：${scene.tone}。
主题：${space.title}
共同目标：${space.goal || "未填写"}
成员：${(space.members || []).map((m) => m.name).join("、")}
已有内容：
${existing || "无"}
讨论记录：
${talk || "（暂无）"}

任务：${task}
用中文输出。`,
    response_json_schema: SCHEMA,
  });
}

export async function persistAgentResult(space, r, items = []) {
  const base = { space_id: space.id, member_ids: space.member_ids, source: "agent" };
  if (r.reply) await base44.entities.CollabMessage.create({ ...base, is_agent: true, author_name: "心栈Agent", content: r.reply });

  const themes = items.filter((i) => i.is_theme);
  const themeId = async (name) => {
    if (!name?.trim()) return undefined;
    let t = themes.find((x) => x.title === name.trim());
    if (!t) { t = await base44.entities.CollabItem.create({ ...base, kind: "subagreement", is_theme: true, status: "in_progress", title: name.trim() }); themes.push(t); }
    return t.id;
  };

  const ids = new Set(items.map((i) => i.id));
  const updates = [];
  for (const g of r.regroup || []) if (ids.has(g.id)) updates.push({ id: g.id, parent_id: await themeId(g.theme) });
  for (const id of r.completed_ids || []) if (ids.has(id)) updates.push({ id, status: "done" });
  if (updates.length) await base44.entities.CollabItem.bulkUpdate(updates);

  const rows = [];
  for (const s of r.subagreements || []) {
    if (s.title) rows.push({ ...base, kind: "subagreement", status: "in_progress", title: s.title, done_criteria: s.done_criteria, owner_name: s.owner_name, parent_id: await themeId(s.theme) });
  }
  for (const m of r.milestones || []) {
    if (m.title) rows.push({ ...base, kind: "milestone", status: "in_progress", title: m.title, due_date: /^\d{4}-\d{2}-\d{2}$/.test(m.due_date || "") ? m.due_date : undefined });
  }
  if (r.document?.title && r.document?.content) rows.push({ ...base, kind: "document", status: "done", title: r.document.title, content: r.document.content });
  if (rows.length) await base44.entities.CollabItem.bulkCreate(rows);
}