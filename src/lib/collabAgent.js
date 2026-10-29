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
    consensus: { type: "array", items: { type: "string" } },
    divergences: { type: "array", items: { type: "string" } },
    missing_info: { type: "array", items: { type: "string" } },
    subagreements: { type: "array", items: { type: "object", properties: { title: { type: "string" }, done_criteria: { type: "string" }, owner_name: { type: "string" } } } },
    milestones: { type: "array", items: { type: "object", properties: { title: { type: "string" }, milestone_type: { type: "string", enum: ["time", "stage", "decision", "review"] }, due_date: { type: "string" } } } },
    document: { type: "object", properties: { title: { type: "string" }, content: { type: "string" } } },
  },
};

// mode: "init" 初始草稿 | "organize" 整理 | 其他为成员 @Agent 的具体请求
export async function runCollabAgent({ space, messages = [], items = [], request = "organize" }) {
  const scene = SCENES[space.scene] || SCENES.custom;
  const talk = messages.slice(-40).map((m) => `${m.author_name}${m.tag !== "none" ? `[${m.tag}]` : ""}: ${m.content}`).join("\n");
  const existing = items.map((i) => `${i.kind}:${i.title}(${i.status})`).join("; ");
  const task = request === "init"
    ? "根据主题生成共创初始草稿：对共同目标的理解(reply)、建议讨论的问题(missing_info)、可能的子约定方向、建议节点。仅用于启动讨论。"
    : request === "organize"
      ? "整理当前讨论：已达成的共识、尚未一致的分歧、新出现的行动项（子约定草案）、节点草案，并生成一份共识纪要文件(document)。"
      : `成员请求：「${request}」。按请求完成，reply 中直接回应；只在确有必要时给出子约定/节点/文件。`;

  return base44.integrations.Core.InvokeLLM({
    prompt: `你是「心栈」协同约定空间里的 Agent，负责整理记忆、暴露分歧、推动沟通、形成文档。
规则：不替成员作承诺或决定；用中性语言呈现不同观点；表达风格：${scene.tone}。
子约定必须写清"怎样算完成"(done_criteria)。日期用 YYYY-MM-DD，今天是 ${new Date().toISOString().slice(0, 10)}。
不要重复已有内容：${existing || "无"}。
主题：${space.title}
共同目标：${space.goal || "未填写"}
成员：${(space.members || []).map((m) => m.name).join("、")}
讨论记录：
${talk || "（暂无）"}

任务：${task}
用中文输出。`,
    response_json_schema: SCHEMA,
  });
}

// 把 Agent 结果写入空间（全部为草案/建议，需人确认）
export async function persistAgentResult(space, r) {
  const base = { space_id: space.id, member_ids: space.member_ids, source: "agent" };
  const lines = [r.reply];
  if (r.consensus?.length) lines.push("✅ 共识：\n· " + r.consensus.join("\n· "));
  if (r.divergences?.length) lines.push("⚖️ 待讨论分歧：\n· " + r.divergences.join("\n· "));
  if (r.missing_info?.length) lines.push("❓ 待补充：\n· " + r.missing_info.join("\n· "));
  await base44.entities.CollabMessage.create({ ...base, is_agent: true, author_name: "Agent", content: lines.filter(Boolean).join("\n\n") });
  const rows = [
    ...(r.subagreements || []).map((s) => ({ ...base, kind: "subagreement", status: "draft", ...s })),
    ...(r.milestones || []).map((m) => ({ ...base, kind: "milestone", status: "draft", title: m.title, milestone_type: m.milestone_type, due_date: /^\d{4}-\d{2}-\d{2}$/.test(m.due_date || "") ? m.due_date : undefined })),
  ];
  if (r.document?.title && r.document?.content) rows.push({ ...base, kind: "document", status: "draft", title: r.document.title, content: r.document.content });
  if (rows.length) await base44.entities.CollabItem.bulkCreate(rows);
}