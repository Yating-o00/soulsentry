// 协同约定 Agent：整理（tidy/minutes/disputes/extract_subtasks）+ 沟通（coordinate）双模式。
// 信任边界：只用当前空间数据（子约定树/讨论/节点/文档），不读成员私人记录、其他约定、心签；
// 中性呈现观点、不评判对错、不替人承诺；输出草案必须人工确认后才生效。
import { prisma } from "../lib/prisma.js";
import { callKimiChat, invokeKimiWebSearch, parseModelJson } from "../lib/kimi.js";
import { assertAICredits, chargeAICredits } from "./aiCredits.js";
import { AI_CALL_COSTS } from "../routes/functions.js";
import { collectSubtasks, logCollabChange, nestSubtasks } from "./collabSpace.js";
import { syncParentProgress } from "../routes/tasks.js";
import { notifyTaskParties } from "./taskSharing.js";
import { findAgentTemplate } from "./agentStore.js";

const COST = () => AI_CALL_COSTS.collab_agent || 2;
const MAX_SUBTASKS_PER_RUN = 10;

// ── LLM 调用（可注入，便于本地无 KIMI key 时验证链路）──
let llmInvoker = null;
export function setCollabLLMInvoker(invoker) {
  llmInvoker = invoker;
}
export function resetCollabLLMInvoker() {
  llmInvoker = null;
}

// 本地 mock：COLLAB_AGENT_MOCK_LLM=1 时替代真实 Kimi 调用，返回确定性结果
function mockLLM({ json, kind }) {
  if (!json) {
    return "（本地调试回复）收到！我先梳理一下目前的讨论要点：各方的想法都已经摆在桌面上了。建议下一步先确认大家最在意的 1-2 个分歧点，需要我整理共识或提取子约定的话，随时 @我。";
  }
  if (kind === "extract_subtasks") {
    return {
      items: [
        { title: "确认时间地点", standard: "所有成员给出可行时间并达成一致", assigneeHint: "", parentHint: "" },
        { title: "分工准备物料", standard: "物料清单确定且每人认领至少一项", assigneeHint: "", parentHint: "" }
      ]
    };
  }
  if (kind === "coordinate") {
    return {
      reply: "（本地调试回复）收到！我先梳理一下目前的讨论要点：各方的想法都已经摆在桌面上了。建议下一步先确认大家最在意的 1-2 个分歧点，需要我整理共识或提取子约定的话，随时 @我。",
      subtasks: [
        { title: "（mock）确认时间地点", standard: "所有成员给出可行时间", assigneeHint: "", parentHint: "" }
      ],
      nodes: [{ title: "（mock）出发前确认清单", node_type: "review" }],
      doc: null,
      completed: { subtasks: [], nodes: [], docs: [], reason: "" }
    };
  }
  if (kind === "drive") {
    return {
      reply: "",
      digest: "## 大方向\n- （mock）确认时间地点：待成员给出可行时间\n\n## 新进展\n- 讨论已启动\n\n## 待确认\n- 暂无",
      subtasks: [
        { title: "（mock）确认时间地点", standard: "所有成员给出可行时间", assigneeHint: "", parentHint: "" }
      ],
      updates: [],
      nodes: [{ title: "（mock）出发前确认清单", node_type: "review" }],
      nodeMoves: [],
      nodeUpdates: [],
      doc: null,
      completed: { subtasks: [], nodes: [], docs: [], reason: "" }
    };
  }
  if (kind === "disputes") {
    return {
      analysis: "（本地 mock）当前分歧主要集中在时间安排与分工两点，各方偏好尚未完全对齐，需要进一步澄清。",
      questions: [{ userId: null, question: "（本地 mock）你更方便的时间窗口是哪几天？" }]
    };
  }
  if (kind === "minutes") {
    return {
      content: "# 讨论纪要（本地 mock）\n\n## 背景\n基于当前空间的讨论整理。\n\n## 已决事项\n暂无，待成员确认。\n\n## 待办\n确认时间与分工。",
      summary: "mock：已生成纪要草案，待确认。"
    };
  }
  if (kind === "tidy") {
    return {
      consensus: "（本地 mock）已达成初步共识：共同目标明确，执行路径待细化。",
      disputes: "（本地 mock）待确认：时间安排、分工方案。",
      summary: "（本地 mock）整理完成：共识纪要与分歧清单已更新为草案，请成员到「沉淀」栏目确认。",
      completed: { subtasks: [], nodes: [], docs: [], reason: "" }
    };
  }
  return {
    consensus: "（本地 mock）已达成初步共识：共同目标明确，执行路径待细化。",
    disputes: "（本地 mock）待确认：时间安排、分工方案。",
    summary: "（本地 mock）整理完成：共识纪要与分歧清单已更新为草案，请成员到「沉淀」栏目确认。"
  };
}

async function invokeLLM({ system, prompt, json = false, kind, maxTokens, fetchTimeout }) {
  if (llmInvoker) return llmInvoker({ system, prompt, json, kind });
  if (process.env.COLLAB_AGENT_MOCK_LLM === "1") return mockLLM({ json, kind });
  const result = await callKimiChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt }
    ],
    responseJsonSchema: json ? { name: "collab_agent_result" } : undefined,
    temperature: 0.4,
    // K2 系推理模型会先用输出预算思考：大上下文（空间全文+联网结果）场景必须给足 token 与超时
    maxTokens: maxTokens || 4000,
    fetchTimeout: fetchTimeout || 35000
  });
  return json ? parseModelJson(result.content) : result.content;
}

// ── Prompt 构建 ──
const TRUST_RULES = [
  "你是「心栈」协同约定空间的 Agent 助手，兼具「整理」与「沟通」两种能力，服务对象是该约定的全体成员。",
  "",
  "严格约束：",
  "1. 只能使用消息中给出的空间数据（共同目标、子约定、讨论、执行节点、沉淀文档），不得臆测或引用成员的私人记录、其他约定、心签等空间外信息。",
  "2. 中性呈现各方观点，不评判谁对谁错，不替任何人做决定或承诺；数据不足就明说，不要编造。",
  "3. 你生成的子约定只是草案，必须经成员确认后才生效；但讨论中已达成共识、且完成标准已被满足的事项，你可以标记为自动完成（completed），成员可随时手动改回。",
  "4. 情侣/朋友场景不做关系评分、不说教。"
].join("\n");

const SCENARIO_TAILS = {
  couple: "当前是情侣约定空间：语气温和体贴，像一位细心的朋友，多用鼓励性表达。",
  friends: "当前是朋友约定空间：语气轻快自然，可以适度活泼幽默。",
  colleagues: "当前是同事约定空间：语气结构化、要点清晰，突出负责人、时间点与风险。",
  custom: "当前是自定义约定空间：语气中性平和、清晰高效。"
};

export function buildSystem(scenario, agentMeta) {
  const base = `${TRUST_RULES}\n\n${SCENARIO_TAILS[scenario] || SCENARIO_TAILS.custom}`;
  // 启用了 Agent 市场的专业方案：注入该领域的专业身份
  const template = agentMeta?.templateId ? findAgentTemplate(agentMeta.templateId) : null;
  if (!template) return base;
  return [
    base,
    "",
    `专业身份：当前以「${template.name}」（${template.domain}领域）身份协同。${template.expertise}`,
    "回应时主动运用该领域的专业知识、常见流程与坑点，让建议更专业、更可落地；",
    "涉及法律/医疗/财务等高风险事项时，提醒成员「仅供参考，必要时咨询持证专业人士」。"
  ].join("\n");
}

// ── 子约定编号与树：空间数据展示与 parentHint 解析共用同一套标签（S1、S1-1…），保证对齐 ──
const SUBTASK_LABEL_LIMIT = 30;

function buildSubtaskLabelTree(rootTaskId, subtasks) {
  const slice = subtasks.slice(0, SUBTASK_LABEL_LIMIT);
  const tree = nestSubtasks(rootTaskId, slice);
  const labelMap = new Map();
  const lines = [];
  const walk = (nodes, prefix, depth) => {
    nodes.forEach((node, i) => {
      const label = `${prefix}${i + 1}`;
      labelMap.set(label, node);
      const meta = node.metadata?.collab || {};
      const state = meta.state === "draft" ? "草案待确认" : (node.status === "DONE" ? "已完成" : "进行中");
      const standard = meta.standard ? `（完成标准：${String(meta.standard).slice(0, 60)}）` : "";
      lines.push(`${depth === 0 ? "-" : `${"  ".repeat(depth)}·`} [${label}] [${state}] ${node.title}${standard}`);
      walk(node.children || [], `${label}-`, depth + 1);
    });
  };
  walk(tree, "S", 0);
  return { labelMap, lines };
}

// 匹配用归一化：小写 + 去空白与标点，保留中英文与数字
function normalizeForMatch(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9一-龥]/g, "");
}

function bigramSet(s) {
  const str = normalizeForMatch(s);
  const set = new Set();
  if (!str) return set;
  if (str.length === 1) {
    set.add(str);
    return set;
  }
  for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2));
  return set;
}

// a 被 b 覆盖的程度（0-1）：hint 的主题词被候选标题包含越多，越可能是其从属
function containment(a, b) {
  const A = bigramSet(a);
  const B = bigramSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / A.size;
}

// 从属归属解析：Agent 给出已有子约定的编号/标题提示，匹配到已有子约定（含本次刚创建的）
function resolveParentSubtask(pool, hint, labelMap) {
  if (!isNonEmptyString(hint)) return null;
  const h = hint.trim();
  const byLabel = labelMap?.get(h) || labelMap?.get(h.toUpperCase());
  if (byLabel) return byLabel;
  const direct = pool.find((s) => s.id === h)
    || pool.find((s) => s.title === h)
    || pool.find((s) => normalizeForMatch(s.title) === normalizeForMatch(h))
    || pool.find((s) => s.title.includes(h) || h.includes(s.title));
  if (direct) return direct;
  // 模糊兜底：hint 的主题被某子约定标题大部分覆盖（如「目的地」→「定目的地和出行日期」）
  if (normalizeForMatch(h).length < 2) return null;
  let best = null;
  let bestScore = 0;
  for (const s of pool) {
    const score = containment(h, s.title);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

// 合并同类项：与已有（或本次刚创建的）子约定近重复（≥90% 覆盖）的提取项不再重复创建
function findDuplicateSubtask(pool, title) {
  const t = normalizeForMatch(title);
  if (!t) return null;
  for (const s of pool) {
    const st = normalizeForMatch(s.title);
    if (!st) continue;
    if (st === t) return s;
    if (t.length >= 4 && st.length >= 4 && containment(title, s.title) >= 0.9) return s;
  }
  return null;
}

export function formatSpaceData(task, snapshot) {
  const collab = task.metadata?.collab || {};
  const memberNames = [task.user, ...task.members.map((m) => m.user)]
    .filter(Boolean)
    .map((u) => u.displayName || u.email || u.phone || "成员");
  const lines = [
    `约定主题：${task.title}`,
    `共同目标：${collab.goal || "（未填写）"}`,
    `场景：${collab.scenario || "custom"}；确认规则：${collab.confirmRule === "owner" ? "发起人确认" : "全员确认"}`,
    `成员：${[...new Set(memberNames)].join("、")}`
  ];
  if (snapshot.subtasks.length > 0) {
    const { lines: subtaskLines } = buildSubtaskLabelTree(task.id, snapshot.subtasks);
    lines.push("\n子约定（编号 S1/S1-1… 可用于指认从属；缩进为从属约定）：");
    lines.push(...subtaskLines);
  }
  if (snapshot.nodes.length > 0) {
    lines.push("\n执行节点：");
    for (const node of snapshot.nodes.slice(0, 30)) {
      const due = node.dueAt ? `（截止 ${new Date(node.dueAt).toISOString().slice(0, 10)}）` : "";
      lines.push(`- [${node.doneAt ? "已完成" : "待办"}] ${node.title}${due}`);
    }
  }
  if (snapshot.docs.length > 0) {
    lines.push("\n沉淀文档：");
    for (const doc of snapshot.docs.slice(0, 10)) {
      lines.push(`- ${doc.title}（${doc.docType} v${doc.version} ${doc.status === "confirmed" ? "已确认" : "草案"}）`);
    }
  }
  if (snapshot.comments.length > 0) {
    lines.push("\n讨论（时间正序）：");
    for (const comment of snapshot.comments.slice(-60)) {
      const who = comment.agent ? "Agent" : (comment.user?.displayName || comment.user?.email || comment.user?.phone || "成员");
      const mark = comment.mark ? ` [标记:${comment.mark}]` : "";
      const atts = Array.isArray(comment.attachments) && comment.attachments.length
        ? ` [附件:${comment.attachments.map((a) => a?.name || a?.type || "文件").join("、")}]`
        : "";
      lines.push(`- ${who}：${String(comment.content).slice(0, 200)}${mark}${atts}`);
    }
  }
  return lines.join("\n");
}

// ── 空间数据快照 ──
export async function loadSpaceSnapshot(task) {
  const [subtasks, comments, nodes, docs] = await Promise.all([
    collectSubtasks(task.id),
    prisma.comment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
      include: { user: true }
    }),
    prisma.collabNode.findMany({
      where: { taskId: task.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    }),
    prisma.collabDoc.findMany({
      where: { taskId: task.id },
      orderBy: { updatedAt: "desc" }
    })
  ]);
  return { subtasks, comments, nodes, docs };
}

export async function postAgentMessage(taskId, { content, parentId = null, topic = null }) {
  return prisma.comment.create({
    data: {
      taskId,
      userId: null,
      agent: true,
      content: String(content || "").slice(0, 5000),
      parentId,
      topic,
      mentions: []
    }
  });
}

// 共识纪要/分歧清单/纪要是同类型单例文档：存在则更新（version+1、history 追加、状态回草案），不存在则创建
async function upsertTypedDoc(taskId, userId, { docType, title, content }) {
  const existing = await prisma.collabDoc.findFirst({ where: { taskId, docType } });
  if (!existing) {
    return prisma.collabDoc.create({
      data: { taskId, userId, title, docType, content: String(content || ""), version: 1, history: [], status: "draft" }
    });
  }
  const history = Array.isArray(existing.history) ? [...existing.history] : [];
  history.push({ content: existing.content, at: new Date().toISOString(), by: userId, event: "update" });
  return prisma.collabDoc.update({
    where: { id: existing.id },
    data: {
      title,
      content: String(content || ""),
      version: existing.version + 1,
      history,
      status: "draft"
    }
  });
}

async function degradeWithMessage(taskId, reason) {
  const comment = await postAgentMessage(taskId, {
    content: `${reason}（Agent 整理失败，请稍后重试）`
  });
  return { degraded: true, message_comment_id: comment.id };
}

function errorWith(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

// ── 共识达成 → 自动完成（子约定/执行节点/沉淀）：打「心栈确定完成」标记，成员可手动改回 ──
async function applyAutoCompletions({ task, user, snapshot, pool, labelMap, completed, createdNodes = [] }) {
  const autoDoneNotes = [];
  if (!completed || typeof completed !== "object") return autoDoneNotes;
  const reason = String(completed.reason || "").trim().slice(0, 200);
  const doneLabel = reason ? `心栈确定完成（${reason}）` : "心栈确定完成";

  const subHints = Array.isArray(completed.subtasks) ? completed.subtasks : [];
  let subtaskProgressChanged = false;
  for (const hint of subHints.slice(0, 10)) {
    const target = resolveParentSubtask(pool, hint, labelMap);
    if (!target || target.status === "DONE") continue;
    const meta = target.metadata?.collab || {};
    if (meta.state === "draft") continue; // 草案走成员确认流程，不自动完成
    await prisma.task.update({
      where: { id: target.id },
      data: {
        status: "DONE",
        completedAt: new Date(),
        metadata: {
          ...(target.metadata || {}),
          collab: {
            ...meta,
            autoCompleted: true,
            autoCompletedAt: new Date().toISOString(),
            autoCompletedReason: reason
          }
        }
      }
    });
    subtaskProgressChanged = true;
    autoDoneNotes.push(`子约定「${target.title}」`);
    await logCollabChange(user.id, task, "collab_subtask_auto_done", [
      { field: "subtask", field_label: "子约定", new_value: target.title },
      { field: "auto", field_label: "完成方式", new_value: doneLabel }
    ]);
  }
  if (subtaskProgressChanged) await syncParentProgress(task.id);

  const allNodes = [...snapshot.nodes, ...createdNodes];
  const nodeHints = Array.isArray(completed.nodes) ? completed.nodes : [];
  for (const hint of nodeHints.slice(0, 10)) {
    const hs = String(hint || "").trim();
    if (!hs) continue;
    const node = allNodes.find((n) => !n.doneAt && (n.title === hs || n.title.includes(hs) || hs.includes(n.title)));
    if (!node) continue;
    await prisma.collabNode.update({ where: { id: node.id }, data: { doneAt: new Date(), agentDone: true } });
    autoDoneNotes.push(`执行节点「${node.title}」`);
    await logCollabChange(user.id, task, "collab_node_auto_done", [
      { field: "node", field_label: "执行节点", new_value: node.title },
      { field: "auto", field_label: "完成方式", new_value: doneLabel }
    ]);
    // 归口传导：子项全部完成 → 归口节点自动完成
    await cascadeNodeCompletion({ ...node, doneAt: new Date() }, { byAgent: true });
  }

  const docHints = Array.isArray(completed.docs) ? completed.docs : [];
  for (const hint of docHints.slice(0, 5)) {
    const hs = String(hint || "").trim();
    if (!hs) continue;
    const target = snapshot.docs.find((d) => d.status !== "confirmed" && (d.title === hs || d.title.includes(hs) || hs.includes(d.title)));
    if (!target) continue;
    const history = Array.isArray(target.history) ? [...target.history] : [];
    history.push({ content: target.content, at: new Date().toISOString(), by: user.id, event: "auto_confirm" });
    await prisma.collabDoc.update({
      where: { id: target.id },
      data: { status: "confirmed", agentConfirmed: true, version: target.version + 1, history }
    });
    autoDoneNotes.push(`沉淀「${target.title}」`);
    await logCollabChange(user.id, task, "collab_doc_auto_confirmed", [
      { field: "doc", field_label: "沉淀文档", new_value: target.title },
      { field: "auto", field_label: "确认方式", new_value: doneLabel.replace("完成", "确认") }
    ]);
  }

  if (autoDoneNotes.length > 0) {
    await notifyTaskParties(task, user, {
      type: "collab_auto_completed",
      title: "心栈已自动完成约定事项",
      body: `根据讨论共识，${autoDoneNotes.join("、")}已由心栈标记完成，可在协同空间中查看并手动调整。`
    });
  }
  return autoDoneNotes;
}

// ── 动作实现：每个返回 { ...结果 }；抛错表示动作失败（此时未扣点）──

// 子约定草案统一创建入口（extract_subtasks 与 coordinate 共用）
async function createDraftSubtask(task, user, { title, standard = "", assigneeHint = "", sourceCommentId = null, parentId = null }) {
  const subtask = await prisma.task.create({
    data: {
      userId: user.id,
      title: String(title).trim().slice(0, 120),
      status: "TODO",
      priority: "medium",
      parentTaskId: parentId || task.id,
      metadata: {
        collab: {
          state: "draft",
          standard: String(standard || "").slice(0, 500),
          assignee: null,
          confirmedBy: [],
          assigneeHint: String(assigneeHint || "").slice(0, 60),
          sourceCommentId
        }
      }
    }
  });
  await logCollabChange(user.id, task, "collab_subtask_draft", [
    { field: "subtask", field_label: "子约定", new_value: subtask.title },
    ...(parentId
      ? [{ field: "parent", field_label: "从属于", new_value: parentId }]
      : []),
    ...(sourceCommentId
      ? [{ field: "agent", field_label: "来源", new_value: "Agent 提取" }]
      : [{ field: "agent", field_label: "来源", new_value: "Agent 沉淀" }])
  ]);
  return subtask;
}

// 合并同类项的核心通道：把对已有子约定的新结论/修正写回原约定，而不是再建一条。
// 只允许更新「进行中」的子约定（草案内容未定、同样允许更新；已完成的不动），并记录变更日志。
async function applySubtaskUpdates({ task, user, pool, labelMap, updates }) {
  const applied = [];
  const list = Array.isArray(updates) ? updates.slice(0, 10) : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const target = resolveParentSubtask(pool, item.target, labelMap);
    if (!target || target.status === "DONE") continue;
    const nextTitle = isNonEmptyString(item.title) ? String(item.title).trim().slice(0, 120) : null;
    const nextStandard = isNonEmptyString(item.standard) ? String(item.standard).trim().slice(0, 500) : null;
    if (!nextTitle && !nextStandard) continue;
    const meta = target.metadata?.collab || {};
    await prisma.task.update({
      where: { id: target.id },
      data: {
        title: nextTitle || target.title,
        metadata: {
          ...(target.metadata || {}),
          collab: { ...meta, standard: nextStandard || meta.standard || "" }
        }
      }
    });
    if (nextTitle) target.title = nextTitle;
    if (nextStandard) target.metadata = { ...(target.metadata || {}), collab: { ...meta, standard: nextStandard } };
    applied.push(target);
    await logCollabChange(user.id, task, "collab_subtask_updated", [
      { field: "subtask", field_label: "子约定", new_value: target.title },
      ...(nextTitle ? [{ field: "title", field_label: "新结论", new_value: nextTitle }] : []),
      ...(nextStandard ? [{ field: "standard", field_label: "完成标准", new_value: nextStandard }] : []),
      { field: "agent", field_label: "来源", new_value: "Agent 合并更新" }
    ]);
  }
  if (applied.length > 0) await syncParentProgress(task.id);
  return applied;
}

// ── 执行节点归口合并：同一主题（如预算）的持续推进只保留一个「归口节点」，相关推进挂为其子项 ──
function resolveNodeByTitle(nodes, hint) {
  if (!isNonEmptyString(hint)) return null;
  const h = String(hint).trim();
  return nodes.find((n) => n.id === h)
    || nodes.find((n) => n.title === h)
    || nodes.find((n) => n.title.includes(h) || h.includes(n.title))
    || null;
}

async function ensureNodeContainer({ task, user, title, nodeType, allNodes }) {
  const existing = resolveNodeByTitle(allNodes, title);
  if (existing) return existing;
  const sortOrder = await prisma.collabNode.count({ where: { taskId: task.id } });
  const node = await prisma.collabNode.create({
    data: {
      taskId: task.id,
      title: String(title).trim().slice(0, 120),
      nodeType: nodeType || "stage",
      sortOrder,
      createdBy: user.id
    }
  });
  allNodes.push(node);
  await logCollabChange(user.id, task, "collab_node_created", [
    { field: "node", field_label: "归口节点", new_value: node.title },
    { field: "agent", field_label: "来源", new_value: "Agent 归口" }
  ]);
  return node;
}

// 子项落位：parentHint 指向已有/新建归口节点；同标题全局去重；同归口下子项去重
async function applyNodeItems({ task, user, snapshot, items, allNodes, sourceLabel }) {
  const created = [];
  const NODE_TYPES = new Set(["time", "stage", "decision", "review"]);
  for (const item of (Array.isArray(items) ? items : []).slice(0, 10)) {
    if (!isNonEmptyString(item?.title)) continue;
    const title = String(item.title).trim().slice(0, 120);
    if (allNodes.some((n) => n.title === title)) continue;
    let parent = null;
    if (isNonEmptyString(item.parentHint)) {
      parent = await ensureNodeContainer({ task, user, title: item.parentHint, nodeType: item.node_type, allNodes });
      if (parent.title === title) parent = null; // 归口节点与子项同名时按平级处理，避免自引用
    }
    if (parent && (await prisma.collabNode.findFirst({ where: { parentId: parent.id, title } }))) continue;
    const sortOrder = await prisma.collabNode.count({ where: { taskId: task.id } });
    const node = await prisma.collabNode.create({
      data: {
        taskId: task.id,
        title,
        nodeType: NODE_TYPES.has(item.node_type) ? item.node_type : "stage",
        sortOrder,
        createdBy: user.id,
        parentId: parent?.id || null
      }
    });
    created.push(node);
    allNodes.push(node);
    await logCollabChange(user.id, task, "collab_node_created", [
      { field: "node", field_label: "执行节点", new_value: node.title },
      ...(parent ? [{ field: "parent", field_label: "归口于", new_value: parent.title }] : []),
      { field: "agent", field_label: "来源", new_value: sourceLabel }
    ]);
  }
  return created;
}

// 既有平级节点归入归口（讨论越多越整齐）：nodeMoves=[{title, parent}]，父节点不存在则创建
async function applyNodeMoves({ task, user, moves, allNodes }) {
  const moved = [];
  for (const move of (Array.isArray(moves) ? moves : []).slice(0, 10)) {
    if (!isNonEmptyString(move?.title) || !isNonEmptyString(move?.parent)) continue;
    const node = resolveNodeByTitle(allNodes, move.title);
    if (!node) continue;
    const container = await ensureNodeContainer({ task, user, title: move.parent, nodeType: node.nodeType, allNodes });
    if (container.id === node.id) continue;
    if (node.parentId === container.id) continue;
    // 只允许两级：归口节点本身不能再有父节点；也不能把归口节点挂到它的子孙下
    if (container.parentId) continue;
    if (node.id === container.parentId) continue;
    await prisma.collabNode.update({ where: { id: node.id }, data: { parentId: container.id } });
    node.parentId = container.id;
    moved.push(node);
    await logCollabChange(user.id, task, "collab_node_moved", [
      { field: "node", field_label: "执行节点", new_value: node.title },
      { field: "parent", field_label: "归口于", new_value: container.title },
      { field: "agent", field_label: "来源", new_value: "Agent 合并同类项" }
    ]);
  }
  return moved;
}

// 覆盖式更新：某主题讨论出新结论时改写其节点表述（只更新未完成的；已完成的是历史推进记录，保留不改）
async function applyNodeUpdates({ task, user, updates, allNodes }) {
  const applied = [];
  for (const item of (Array.isArray(updates) ? updates : []).slice(0, 10)) {
    if (!isNonEmptyString(item?.target) || !isNonEmptyString(item?.title)) continue;
    const node = resolveNodeByTitle(allNodes, item.target);
    if (!node || node.doneAt) continue;
    const nextTitle = String(item.title).trim().slice(0, 120);
    if (nextTitle === node.title) continue;
    await prisma.collabNode.update({ where: { id: node.id }, data: { title: nextTitle } });
    const oldTitle = node.title;
    node.title = nextTitle;
    applied.push(node);
    await logCollabChange(user.id, task, "collab_node_updated", [
      { field: "node", field_label: "执行节点", old_value: oldTitle, new_value: nextTitle },
      { field: "agent", field_label: "来源", new_value: "Agent 结论覆盖" }
    ]);
  }
  return applied;
}

// 完成状态向上传导：子项全部完成 → 归口节点自动完成（可手动改回）；任一子项重新打开 → 自动完成的归口回退
export async function cascadeNodeCompletion(node, { byAgent = false } = {}) {
  if (!node?.parentId) return;
  const parent = await prisma.collabNode.findUnique({
    where: { id: node.parentId },
    include: { children: true }
  });
  if (!parent) return;
  const allChildrenDone = parent.children.length > 0 && parent.children.every((c) => c.doneAt);
  if (node.doneAt && allChildrenDone && !parent.doneAt) {
    const rootTask = await prisma.task.findUnique({
      where: { id: node.taskId },
      select: { id: true, title: true, parentTaskId: true }
    });
    const updated = await prisma.collabNode.update({
      where: { id: parent.id },
      data: { doneAt: new Date(), agentDone: byAgent, autoDone: true }
    });
    await logCollabChange(node.createdBy || null, rootTask || { id: node.taskId }, "collab_node_auto_done", [
      { field: "node", field_label: "归口节点", new_value: parent.title },
      { field: "auto", field_label: "完成方式", new_value: "子项全部完成，自动归口完成" }
    ]);
    await cascadeNodeCompletion(updated, { byAgent });
  } else if (!node.doneAt && parent.autoDone && parent.doneAt) {
    const updated = await prisma.collabNode.update({
      where: { id: parent.id },
      data: { doneAt: null, agentDone: false, autoDone: false }
    });
    await cascadeNodeCompletion(updated, { byAgent });
  }
}

// ── 动作执行 ──
async function runAction({ action, task, snapshot, system, user, commentId }) {
  const spaceText = formatSpaceData(task, snapshot);

  if (action === "tidy") {
    const prompt = `${spaceText}\n\n请基于以上空间数据做整理：\n1. 提炼已达成的共识，写成「共识纪要」正文；\n2. 梳理存在的分歧与待确认事项，写成「分歧清单」正文；\n3. 写一条 150 字以内的整理摘要，将作为 Agent 消息发给成员；\n4. completed：共识既已形成，逐项核对——「进行中」子约定的完成标准是否已被讨论兑现、未到完成的执行节点对应阶段是否已走过、待确认沉淀是否已被各方认可；满足条件的填进 completed（编号子约定用 S1/S1-1 这类编号指认），并给一句依据；没有把握就留空数组。\n\n只输出 JSON：{"consensus": "...", "disputes": "...", "summary": "...", "completed": {"subtasks": [], "nodes": [], "docs": [], "reason": ""}}`;
    let data;
    try {
      data = await invokeLLM({ system, prompt, json: true, kind: action, maxTokens: 12000, fetchTimeout: 120000 });
    } catch (error) {
      throw error;
    }
    if (!data || (!isNonEmptyString(data.consensus) && !isNonEmptyString(data.disputes))) {
      return degradeWithMessage(task.id, "整理结果没有形成有效内容");
    }
    const consensusDoc = await upsertTypedDoc(task.id, user.id, {
      docType: "consensus", title: "共识纪要", content: data.consensus || "（暂无共识内容）"
    });
    const disputeDoc = await upsertTypedDoc(task.id, user.id, {
      docType: "dispute", title: "分歧清单", content: data.disputes || "（暂无分歧内容）"
    });
    // 共识既已提炼：顺手把满足完成条件的子约定/节点/沉淀自动完成（打「心栈确定完成」标记）
    const tidyLabelMap = buildSubtaskLabelTree(task.id, snapshot.subtasks).labelMap;
    const autoDoneNotes = await applyAutoCompletions({
      task, user, snapshot, pool: [...snapshot.subtasks], labelMap: tidyLabelMap, completed: data.completed, createdNodes: []
    });
    let summaryText = data.summary || "已完成一轮整理：共识纪要与分歧清单已更新为草案，请成员确认。";
    if (autoDoneNotes.length > 0) {
      summaryText += `\n\n—— 心栈根据讨论共识自动完成：${autoDoneNotes.join("、")}（可随时手动调整）。`;
    }
    const message = await postAgentMessage(task.id, { content: summaryText });
    return { consensus_doc: consensusDoc, dispute_doc: disputeDoc, message_comment_id: message.id, auto_done: autoDoneNotes };
  }

  if (action === "minutes") {
    const prompt = `${spaceText}\n\n请基于以上空间数据生成一份讨论纪要，包含：背景、各方观点要点、已决事项、待办与负责人建议。\n\n只输出 JSON：{"content": "纪要正文", "summary": "一句话摘要"}`;
    const data = await invokeLLM({ system, prompt, json: true, kind: action, maxTokens: 12000, fetchTimeout: 120000 });
    if (!data || !isNonEmptyString(data.content)) {
      return degradeWithMessage(task.id, "纪要生成没有形成有效内容");
    }
    const doc = await upsertTypedDoc(task.id, user.id, {
      docType: "minutes", title: "讨论纪要", content: data.content
    });
    return { doc, summary: data.summary || null };
  }

  if (action === "disputes") {
    const prompt = `${spaceText}\n\n请找出标记为分歧（dispute）或尚未形成共识的讨论：\n1. 中性汇总各方观点（300 字以内），将作为 Agent 消息发到讨论；\n2. 给出 2-3 个具体可执行的折中方案，帮助各方向一致靠拢（方案要落到本约定的时间/预算/人员约束上）；\n3. 为相关成员各提出一个帮助澄清立场的补充问题。\n\n只输出 JSON：{"analysis": "...", "options": ["折中方案1", "折中方案2"], "questions": [{"userId": "成员ID或空字符串", "question": "..."}]}`;
    const data = await invokeLLM({ system, prompt, json: true, kind: action, maxTokens: 12000, fetchTimeout: 120000 });
    if (!data || !isNonEmptyString(data.analysis)) {
      return degradeWithMessage(task.id, "分歧协调没有形成有效分析");
    }
    const questions = Array.isArray(data.questions) ? data.questions.slice(0, 20) : [];
    // 通知相关成员：分歧线程的发言人（无则全体参与方）
    const disputedIds = new Set(
      snapshot.comments
        .filter((c) => c.mark === "dispute" && c.userId)
        .map((c) => c.userId)
    );
    const allParties = [...new Set([task.userId, ...task.members.map((m) => m.userId)])];
    const targets = disputedIds.size > 0 ? [...disputedIds] : allParties;
    const optionLines = (Array.isArray(data.options) ? data.options : [])
      .filter(isNonEmptyString)
      .map((o, i) => `${i + 1}. ${String(o).slice(0, 120)}`).join("\n");
    const questionLines = questions.map((q) => `· ${String(q.question || "").slice(0, 100)}`).join("\n");
    for (const userId of targets) {
      await prisma.notification.create({
        data: {
          userId,
          title: "协同约定：分歧协调",
          body: `Agent 对「${task.title}」做了分歧汇总与折中建议，请到讨论中查看并确认。`,
          channel: "in_app",
          status: "SENT",
          payload: { type: "collab_agent_disputes", taskId: task.id, link: `/collabspace?taskId=${task.id}` }
        }
      });
    }
    const content = [
      data.analysis,
      optionLines ? `折中方案：\n${optionLines}` : "",
      questionLines ? `补充问题：\n${questionLines}` : ""
    ].filter(Boolean).join("\n\n");
    const message = await postAgentMessage(task.id, { content });
    return { message_comment_id: message.id, notified: targets, questions_count: questions.length };
  }

  if (action === "extract_subtasks") {
    const target = snapshot.comments.find((c) => c.id === commentId);
    if (!target) throw errorWith(404, "NOT_FOUND", "要提取的讨论不存在");
    // 线程视图：目标本身是回复则取其根线程，否则取目标+回复
    const thread = target.parentId
      ? snapshot.comments.filter((c) => c.id === target.parentId || c.parentId === target.parentId)
      : snapshot.comments.filter((c) => c.id === target.id || c.parentId === target.id);
    const threadText = thread.map((c) => {
      const who = c.agent ? "Agent" : (c.user?.displayName || c.user?.email || c.user?.phone || "成员");
      return `- ${who}：${String(c.content).slice(0, 300)}`;
    }).join("\n");
    const prompt = `约定主题：${task.title}

已有的子约定清单（编号可用于指认从属）：
${(() => {
  const { lines } = buildSubtaskLabelTree(task.id, snapshot.subtasks);
  return lines.length ? lines.join("\n") : "（暂无）";
})()}

以下是一条讨论线程：
${threadText}

请从线程中提取可执行的行动项，严格遵守：
1. 先合并同类项：同一主题的多条信息只提取一项核心，不要把细节逐条拆成平级约定；
2. 分级挂载：某项若属于某个已有子约定的范畴，作为它的从属约定——parentHint 填该子约定的编号（如 S1）或标题。例：已有「定目的地和出行日期」，讨论中确定了目的地为新加坡 → title「出行目的地：新加坡」、parentHint「定目的地和出行日期」；真正独立的事项才开新的顶层约定（parentHint 留空）；
3. 宁缺毋滥：只提取真正推进约定的核心决定与行动项，闲聊、重复、纯细节不提取。

每项给出：title（30 字以内，写清具体决定）、standard（怎样算完成）、assigneeHint（成员姓名，不确定就空字符串）、parentHint（编号或标题，顶层留空）。

只输出 JSON：{"items": [{"title": "...", "standard": "...", "assigneeHint": "...", "parentHint": ""}]}`;
    const data = await invokeLLM({ system, prompt, json: true, kind: action, maxTokens: 12000, fetchTimeout: 120000 });
    const items = Array.isArray(data?.items) ? data.items.slice(0, MAX_SUBTASKS_PER_RUN) : [];
    if (items.length === 0 || items.every((item) => !isNonEmptyString(item?.title))) {
      return degradeWithMessage(task.id, "没有从讨论中提取到有效行动项");
    }
    const created = [];
    const pool = [...snapshot.subtasks];
    const labelMap = buildSubtaskLabelTree(task.id, pool).labelMap;
    for (const item of items) {
      if (!isNonEmptyString(item.title)) continue;
      // 合并同类项：与已有/刚创建的子约定近重复（≥90% 覆盖）则不再重复创建
      if (findDuplicateSubtask(pool, item.title)) continue;
      const parent = resolveParentSubtask(pool, item.parentHint, labelMap);
      const subtask = await createDraftSubtask(task, user, {
        title: item.title,
        standard: item.standard,
        assigneeHint: item.assigneeHint,
        sourceCommentId: commentId,
        parentId: parent?.id || null
      });
      created.push(subtask);
      pool.push(subtask); // 允许本次提取的项之间形成从属
    }
    await syncParentProgress(task.id);
    const message = await postAgentMessage(task.id, {
      content: `已从讨论中提取 ${created.length} 条子约定草案，待成员确认后生效。`
    });
    return { created, message_comment_id: message.id };
  }

  if (action === "coordinate") {
    const target = snapshot.comments.find((c) => c.id === commentId);
    if (!target) throw errorWith(404, "NOT_FOUND", "要回复的讨论不存在");
    const thread = target.parentId
      ? snapshot.comments.filter((c) => c.id === target.parentId || c.parentId === target.parentId)
      : snapshot.comments.filter((c) => c.id === target.id || c.parentId === target.id);
    const threadText = thread.map((c) => {
      const who = c.agent ? "Agent" : (c.user?.displayName || c.user?.email || c.user?.phone || "成员");
      return `- ${who}：${String(c.content).slice(0, 300)}`;
    }).join("\n");

    // 联网补充判断：旅行攻略/价格/路线/推荐等时效性、经验性请求先检索外部信息
    let searchBlock = "";
    let searched = false;
    try {
      const classify = await invokeLLM({
        system,
        prompt: `${spaceText}\n\n成员 @Agent 的请求（所在线程）：\n${threadText}\n\n判断：要高质量回应这个请求，是否需要联网检索外部信息（如旅行攻略、景点、交通路线、价格、餐厅/酒店推荐等时效性或经验性内容）？只输出 JSON：{"needsSearch": true/false, "searchQuery": "检索关键词，20字以内"}`,
        json: true,
        kind: "coordinate_classify"
      });
      if (classify?.needsSearch && isNonEmptyString(classify.searchQuery)) {
        const search = await invokeKimiWebSearch({
          query: `${classify.searchQuery.trim().slice(0, 80)}（背景：${task.title}；${task.metadata?.collab?.goal || ""}；成员偏好见讨论记录）`
        });
        // invokeKimiWebSearch 返回 { answer, references }——此前误读为 content，检索结果被 100% 丢弃
        const answerText = String(search?.answer || "").trim();
        if (answerText) {
          searched = true;
          const refs = Array.isArray(search.references) && search.references.length
            ? "\n参考来源：" + search.references.slice(0, 5).map((r) => r.url).join("、")
            : "";
          searchBlock = `\n\n联网检索到的外部信息（用于充实回答，结合成员讨论中的偏好取舍，不要照搬；涉及的事实请在 reply 末尾附上「参考：链接」）：\n${answerText.slice(0, 2500)}${refs}`;
        }
      }
    } catch (error) {
      console.warn("[collabAgent] 联网检索失败，退回纯空间上下文:", error?.message || error);
    }

    // 全量上下文：整个空间的讨论/子约定/节点/文档都喂给 Agent，并显式要求记住前文信息。
    // 结构化输出：除回复外，按讨论内容把可执行项落成子约定草案、执行节点、沉淀文件（均为草案，待人确认）。
    const prompt = `${spaceText}${searchBlock}\n\n成员在讨论中 @你（所在线程）：\n${threadText}\n\n请回应这位成员，并按需把讨论内容落成空间对象：\n1. reply：直接回复——回答疑问、汇总要点、比较方案，${searched ? "结合联网检索到的外部信息给出有指导意义的建议，凡引用检索到的事实（价格、日期、班次、政策等），末尾用「参考：链接」列出出处，方便成员点击核实" : "结合完整讨论"}给出有指导意义的建议。全程记住并使用完整讨论里的信息：成员在前面消息提到的地点、时间、预算、偏好等，即使这条 @ 消息没有重复，也视为仍然有效，要贯穿到建议里；建议要落到本约定的具体情境，不要泛泛而谈；\n2. subtasks：把讨论中出现的【核心决定与待办】提取为子约定草案，严格遵守：①合并同类项——同一主题只提取一项核心，细节不逐条拆成平级约定；②分级挂载——某项属于上方某个已有子约定的范畴时，作为它的从属约定，parentHint 填该子约定的编号（如 S1）或标题（例：已有「定目的地和出行日期」，讨论确定目的地为新加坡 → title「出行目的地：新加坡」、parentHint「定目的地和出行日期」），只有真正独立的事项才开顶层约定（parentHint 留空）；③宁缺毋滥——闲聊、重复、纯细节不提取；没有则返回空数组，最多 ${MAX_SUBTASKS_PER_RUN} 项；每项含 title（30 字以内，写清具体决定）、standard（完成标准）、assigneeHint（负责人姓名，不确定留空）、parentHint（编号或标题，顶层留空）；\n3. nodes：若讨论中出现了关键时间点、阶段或决策，落成执行节点，含 title、node_type（time|stage|decision|review）与 parentHint。合并同类项：同一主题的持续推进只保留一个归口节点（标题用统一口径，如「确定预算统一口径」），相关推进作为其子项——parentHint 填归口节点标题（不存在会自动创建）；同标题节点不重复创建；同一主题的每次推进不要新建平级节点。归类看「主题」而非措辞：凡是对同一件事的逐次调整、确认、修改都算同类——例：日期相关的「11月第二周出行日期」「确定日期策略（11月第二周或flexible）」「日期策略调整为fully flexible」都归「确定目的地与出行日期」；目的地相关的「新疆/新加坡/荷兰目的地确认」「目的地锁定新加坡」也归它；没有则返回空数组；\n4. nodeMoves：已有节点中凡属同一主题逐次递进的平级节点，用 [{"title":"节点标题","parent":"归口节点标题"}] 归并（如把日期/目的地节点归并到「确定目的地与出行日期」）；没有则空数组；\n5. nodeUpdates：讨论对某主题得出新结论时，用 [{"target":"该主题未完成的子项或归口节点的现标题","title":"新结论表述"}] 覆盖改写旧表述（只改写未完成的；已完成的是历史推进记录，保留不改）；没有则空数组；\n6. doc：若成员明确要求沉淀/纪要/存档，或讨论内容值得长期保留（达成的方案、攻略汇总、清单），生成 {title, content} 存为沉淀文件；否则返回 null；\n7. completed：核对上方编号子约定清单（仅限「进行中」的，草案与已完成的不要动）、执行节点（未到完成的，含归口节点）与沉淀文档（待确认的）——若讨论内容已经满足某项的完成条件（完成标准已被讨论兑现、节点对应阶段已经走过、归口节点内容已被成员确认、沉淀内容已被各方认可），就把它填进 completed 并给一句依据；不要全部留空——只要讨论确实兑现了某项的完成条件就应当填上，宁缺毋滥但切勿漏掉已达成的事项；没有把握的对象不要勉强。\n\n所有对象都是草案，需成员确认后才生效；completed 里的自动完成同样允许成员随时手动改回；中性、不评判、不替人承诺。reply 200-400 字、分段清晰，不要用"Agent："开头。\n\n只输出 JSON：{"reply":"...","subtasks":[{"title":"...","standard":"...","assigneeHint":"...","parentHint":""}],"nodes":[{"title":"...","node_type":"stage","parentHint":""}],"nodeMoves":[{"title":"...","parent":"..."}],"nodeUpdates":[{"target":"...","title":"..."}],"doc":null,"completed":{"subtasks":["S1"],"nodes":["节点标题"],"docs":["文档标题"],"reason":"依据"}}`;
    let data;
    try {
      data = await invokeLLM({ system, prompt, json: true, kind: action, maxTokens: 12000, fetchTimeout: 120000 });
    } catch (error) {
      console.warn("[collabAgent] coordinate 结构化输出解析失败，降级为纯文本回复:", error?.message || error);
      data = null;
    }
    // 结构化输出失败（如推理把输出预算耗尽/超时）：退一步只产出回复正文，保证成员能拿到答案
    if (!data || !isNonEmptyString(data.reply)) {
      try {
        const plain = await invokeLLM({
          system,
          prompt: `${spaceText}${searchBlock}\n\n成员在讨论中 @你（所在线程）：\n${threadText}\n\n请直接回复这位成员：回答疑问、汇总要点、比较方案，200-400 字、分段清晰、不要用"Agent："开头，全程记住讨论中的地点/时间/预算/偏好并落到本约定情境${searched ? "；凡引用联网检索到的事实（价格、日期、班次、政策等），末尾用「参考：链接」列出出处" : ""}。只输出回复正文。`,
          json: false,
          kind: action,
          maxTokens: 8000,
          fetchTimeout: 90000
        });
        const reply = String(plain || "").trim();
        data = reply ? { reply } : null;
      } catch (fallbackError) {
        console.warn("[collabAgent] coordinate 纯文本降级也失败:", fallbackError?.message || fallbackError);
        data = null;
      }
    }

    const createdNotes = [];
    const autoDoneNotes = [];
    let created = [];
    let createdNodes = [];
    let doc = null;

    if (data && typeof data === "object") {
      const items = Array.isArray(data.subtasks) ? data.subtasks : [];
      const pool = [...snapshot.subtasks];
      const labelMap = buildSubtaskLabelTree(task.id, pool).labelMap;
      for (const item of items.slice(0, MAX_SUBTASKS_PER_RUN)) {
        if (!isNonEmptyString(item?.title)) continue;
        // 合并同类项：与已有/刚创建的子约定近重复（≥90% 覆盖）则不再重复创建
        if (findDuplicateSubtask(pool, item.title)) continue;
        const parent = resolveParentSubtask(pool, item.parentHint, labelMap);
        const subtask = await createDraftSubtask(task, user, {
          title: item.title,
          standard: item.standard,
          assigneeHint: item.assigneeHint,
          sourceCommentId: target.id,
          parentId: parent?.id || null
        });
        created.push(subtask);
        pool.push(subtask);
      }
      if (created.length > 0) {
        await syncParentProgress(task.id);
        createdNotes.push(`${created.length} 条子约定草案`);
      }

      // 执行节点（归口合并）+ 既有同主题节点归并 + 结论覆盖（最后执行：nodeMoves 先按现标题归位，再改写表述）
      const allNodes = [...snapshot.nodes];
      createdNodes.push(...await applyNodeItems({ task, user, snapshot, items: data.nodes, allNodes, sourceLabel: "Agent 沉淀" }));
      const movedNodes = await applyNodeMoves({ task, user, moves: data.nodeMoves, allNodes });
      const updatedNodes = await applyNodeUpdates({ task, user, updates: data.nodeUpdates, allNodes });
      if (createdNodes.length > 0) createdNotes.push(`${createdNodes.length} 个执行节点`);
      if (updatedNodes.length > 0) createdNotes.push(`更新 ${updatedNodes.length} 个节点结论`);
      if (movedNodes.length > 0) createdNotes.push(`归并 ${movedNodes.length} 个同主题节点`);

      if (data.doc && isNonEmptyString(data.doc.title)) {
        doc = await prisma.collabDoc.create({
          data: {
            taskId: task.id,
            userId: user.id,
            title: String(data.doc.title).trim().slice(0, 120),
            docType: "file",
            content: String(data.doc.content || "").slice(0, 50000),
            version: 1,
            history: [],
            status: "draft",
            sourceCommentId: target.id
          }
        });
        await logCollabChange(user.id, task, "collab_doc_created", [
          { field: "doc", field_label: "沉淀文档", new_value: doc.title },
          { field: "agent", field_label: "来源", new_value: "Agent 沉淀" }
        ]);
        createdNotes.push(`沉淀文件「${doc.title}」`);
      }

      // ── 共识达成 → 自动完成（子约定/执行节点/沉淀），共用 helper（tidy 也会用）──
      if (data.completed && typeof data.completed === "object") {
        autoDoneNotes.push(...await applyAutoCompletions({ task, user, snapshot, pool, labelMap, completed: data.completed, createdNodes }));
      }
    }

    let replyText = isNonEmptyString(data?.reply)
      ? String(data.reply).trim().slice(0, 3000)
      : "";
    if (!replyText) {
      return degradeWithMessage(task.id, "Agent 没能整理出有效回复");
    }
    if (createdNotes.length > 0) {
      replyText += `\n\n—— 已落成草案：${createdNotes.join("、")}，待成员确认。`;
    }
    if (autoDoneNotes.length > 0) {
      replyText += `\n\n—— 心栈根据讨论共识自动完成：${autoDoneNotes.join("、")}（可随时手动调整）。`;
    }

    // 保持一层回复：目标是根则挂其下，目标是回复则挂在同根线程下
    const reply = await postAgentMessage(task.id, {
      content: replyText,
      parentId: target.parentId || target.id,
      topic: target.topic
    });
    if (autoDoneNotes.length > 0) {
      await notifyTaskParties(task, user, {
        type: "collab_auto_completed",
        title: "心栈已自动完成约定事项",
        body: `根据讨论共识，${autoDoneNotes.join("、")}已由心栈标记完成，可在协同空间中查看并手动调整。`
      });
    }
    return {
      reply_comment_id: reply.id,
      searched,
      ...(created.length > 0 ? { created } : {}),
      ...(createdNodes.length > 0 ? { nodes: createdNodes } : {}),
      ...(doc ? { doc } : {})
    };
  }

  if (action === "drive") {
    // 执行驱动：成员只聊天，Agent 每轮自动把讨论落成/更新空间对象，并维护「执行概览」
    const anchor = [...snapshot.comments].reverse().find((c) => !c.agent);
    if (!anchor) throw errorWith(404, "NOT_FOUND", "暂无成员讨论可驱动");
    const anchorWho = anchor.user?.displayName || anchor.user?.email || anchor.user?.phone || "成员";
    const confirmRuleText = task.metadata?.collab?.confirmRule === "owner" ? "发起人确认" : "全员确认";
    const prompt = `${spaceText}\n\n你刚刚旁听了成员讨论，最新一条来自 ${anchorWho}：\n- ${anchorWho}：${String(anchor.content).slice(0, 300)}\n\n你是本空间的「执行驱动」：成员只负责交流，你负责持续把讨论变成清晰、不重复、可确认的空间对象，让任何人一眼看清全局。本轮按需输出（宁缺毋滥）：\n1. reply：只有确有值得说的时候才回复（澄清疑问、协调分歧、补充外部信息建议、推动停滞的事项）；没有就返回空字符串；\n2. digest：重写「执行概览」，严格按以下结构、每节极简（全文 250 字以内），让成员一眼看清「有哪几个大方向、讨论出了什么、还差谁确认」：\n## 大方向\n（进行中/草案的顶层子约定，每项一句当前状态；没有则写「暂无」）\n## 新进展\n（本轮及最近讨论敲定/更新的要点，最多 3 条；没有则写「暂无」）\n## 待确认\n（草案子约定、未确认沉淀、待办节点，统一注明由谁确认——当前确认规则为${confirmRuleText}；没有则写「暂无」）\n3. updates：讨论若推进/修正了某个已有子约定，用 {"target":"编号如 S1","title":"可选的新结论标题","standard":"可选的新完成标准","note":"一句更新原因"} 把它写回该约定，而不是新建第二条——同一方向永远只保留一个约定；只更新「进行中」和「草案」的，已完成的不要动；没有则空数组；\n4. subtasks：仅当出现真正新的、独立的核心决定/行动项才新建草案（遵守合并同类项与 parentHint 分级挂载）；与已有约定同方向的放 updates，不要建新的；没有则空数组；\n5. nodes：讨论中出现了关键时间点、阶段或决策才落成执行节点。必须合并同类项：同一主题的持续推进只保留一个归口节点（标题用统一口径），本轮相关推进作为它的子项——parentHint 填归口节点标题（不存在会自动创建）；同一主题的每次推进不要新建平级节点。归类看「主题」而非措辞：凡是对同一件事的逐次调整、确认、修改都算同类——例：日期相关的「11月第二周出行日期」「确定日期策略（11月第二周或flexible）」「日期策略调整为fully flexible」都归「确定目的地与出行日期」；目的地相关的「新疆/新加坡/荷兰目的地确认」「目的地锁定新加坡」也归「确定目的地与出行日期」；预算相关一律归「确定预算统一口径」；没有则空数组；\n6. nodeMoves：已有节点中凡属同一主题逐次递进的平级节点，用 [{"title":"节点标题","parent":"归口节点标题"}] 归并到统一归口节点下（如把上述日期/目的地节点归并到「确定目的地与出行日期」）；没有则空数组；\n7. nodeUpdates：讨论对某主题得出新结论时，用 [{"target":"该主题未完成的子项或归口节点的现标题","title":"新结论表述"}] 把旧表述改写为新结论——每一次调整都是一次推进，确认结论后覆盖此前表述（只改写未完成的；已完成的子项是历史推进记录，保留不改）；没有则空数组；\n8. doc：讨论内容值得长期保留（定稿方案、攻略汇总、清单）才生成 {title, content} 沉淀文件；否则 null；\n9. completed：核对「进行中」子约定、未完成节点、待确认沉淀——讨论已兑现完成条件就填 completed 并给一句依据（宁缺毋滥，切勿漏掉已达成项）；归口节点的子项全部完成或内容已被成员确认时，把归口节点标题填进 completed.nodes；没有把握留空。\n\n所有对象都是草案，需成员确认后生效；completed 同样允许成员随时手动改回；中性、不评判、不替人承诺。reply 控制在 200 字以内、分段清晰，不要用"Agent："开头。\n\n只输出 JSON：{"reply":"...","digest":"...","subtasks":[{"title":"...","standard":"...","assigneeHint":"...","parentHint":""}],"updates":[{"target":"S1","title":"...","standard":"...","note":"..."}],"nodes":[{"title":"...","node_type":"stage","parentHint":""}],"nodeMoves":[{"title":"...","parent":"..."}],"nodeUpdates":[{"target":"...","title":"..."}],"doc":null,"completed":{"subtasks":["S1"],"nodes":["节点标题"],"docs":["文档标题"],"reason":"依据"}}`;
    let data;
    try {
      data = await invokeLLM({ system, prompt, json: true, kind: action, maxTokens: 12000, fetchTimeout: 120000 });
    } catch (error) {
      console.warn("[collabAgent] drive 结构化输出解析失败，本轮静默跳过:", error?.message || error);
      return { silent: true };
    }

    const createdNotes = [];
    const autoDoneNotes = [];
    let created = [];
    let createdNodes = [];
    let doc = null;
    let updatedSubs = [];
    let digestDoc = null;

    if (data && typeof data === "object") {
      const pool = [...snapshot.subtasks];
      const labelMap = buildSubtaskLabelTree(task.id, pool).labelMap;

      // ① 合并更新（同方向的新结论写回原约定）
      updatedSubs = await applySubtaskUpdates({ task, user, pool, labelMap, updates: data.updates });
      if (updatedSubs.length > 0) {
        createdNotes.push(`更新 ${updatedSubs.length} 条子约定（${updatedSubs.map((s) => `「${s.title}」`).join("、")}）`);
      }

      // ② 新建草案（严格去重：≥90% 覆盖视为同一条，已有方向走 updates 而不是新建）
      const items = Array.isArray(data.subtasks) ? data.subtasks : [];
      for (const item of items.slice(0, MAX_SUBTASKS_PER_RUN)) {
        if (!isNonEmptyString(item?.title)) continue;
        if (findDuplicateSubtask(pool, item.title)) continue;
        const parent = resolveParentSubtask(pool, item.parentHint, labelMap);
        const subtask = await createDraftSubtask(task, user, {
          title: item.title,
          standard: item.standard,
          assigneeHint: item.assigneeHint,
          sourceCommentId: anchor.id,
          parentId: parent?.id || null
        });
        created.push(subtask);
        pool.push(subtask);
      }
      if (created.length > 0) {
        await syncParentProgress(task.id);
        createdNotes.push(`新增 ${created.length} 条子约定草案`);
      }

      // ③ 执行节点（归口合并：同主题持续推进挂到同一归口节点下，既有平级同类项归并进去；最后做结论覆盖改写）
      const allNodes = [...snapshot.nodes];
      createdNodes.push(...await applyNodeItems({ task, user, snapshot, items: data.nodes, allNodes, sourceLabel: "Agent 执行驱动" }));
      const movedNodes = await applyNodeMoves({ task, user, moves: data.nodeMoves, allNodes });
      const updatedNodes = await applyNodeUpdates({ task, user, updates: data.nodeUpdates, allNodes });
      if (createdNodes.length > 0) createdNotes.push(`新增 ${createdNodes.length} 个执行节点`);
      if (updatedNodes.length > 0) createdNotes.push(`更新 ${updatedNodes.length} 个节点结论`);
      if (movedNodes.length > 0) createdNotes.push(`将 ${movedNodes.length} 个同主题节点归并到「${[...new Set(movedNodes.map((n) => allNodes.find((p) => p.id === n.parentId)?.title).filter(Boolean))].join("、")}」`);

      // ④ 沉淀文件
      if (data.doc && isNonEmptyString(data.doc.title)) {
        doc = await prisma.collabDoc.create({
          data: {
            taskId: task.id,
            userId: user.id,
            title: String(data.doc.title).trim().slice(0, 120),
            docType: "file",
            content: String(data.doc.content || "").slice(0, 50000),
            version: 1,
            history: [],
            status: "draft",
            sourceCommentId: anchor.id
          }
        });
        await logCollabChange(user.id, task, "collab_doc_created", [
          { field: "doc", field_label: "沉淀文档", new_value: doc.title },
          { field: "agent", field_label: "来源", new_value: "Agent 执行驱动" }
        ]);
        createdNotes.push(`沉淀「${doc.title}」`);
      }

      // ⑤ 共识自动完成
      if (data.completed && typeof data.completed === "object") {
        autoDoneNotes.push(...await applyAutoCompletions({ task, user, snapshot, pool, labelMap, completed: data.completed, createdNodes }));
      }

      // ⑥ 执行概览（单例文档，始终维护——没有新东西也刷新时间戳以外的内容）
      if (isNonEmptyString(data.digest)) {
        digestDoc = await upsertTypedDoc(task.id, user.id, {
          docType: "digest", title: "执行概览", content: String(data.digest).trim().slice(0, 5000)
        });
      }
    }

    let replyText = isNonEmptyString(data?.reply) ? String(data.reply).trim().slice(0, 3000) : "";
    if (createdNotes.length > 0) {
      replyText += `${replyText ? "\n\n" : ""}—— 已自动更新空间：${createdNotes.join("；")}，待成员确认。`;
    }
    if (autoDoneNotes.length > 0) {
      replyText += `${replyText ? "\n\n" : ""}—— 心栈根据讨论共识自动完成：${autoDoneNotes.join("、")}（可随时手动调整）。`;
    }
    if (!replyText) return { silent: true, digest: digestDoc };

    const reply = await postAgentMessage(task.id, { content: replyText, parentId: anchor.parentId || anchor.id, topic: anchor.topic });
    if (autoDoneNotes.length > 0) {
      await notifyTaskParties(task, user, {
        type: "collab_auto_completed",
        title: "心栈已自动完成约定事项",
        body: `根据讨论共识，${autoDoneNotes.join("、")}已由心栈标记完成，可在协同空间中查看并手动调整。`
      });
    }
    return {
      reply_comment_id: reply.id,
      ...(created.length > 0 ? { created } : {}),
      ...(updatedSubs.length > 0 ? { updated: updatedSubs } : {}),
      ...(createdNodes.length > 0 ? { nodes: createdNodes } : {}),
      ...(doc ? { doc } : {}),
      ...(digestDoc ? { digest: digestDoc } : {})
    };
  }

  throw errorWith(400, "INVALID_ACTION", `未知 Agent 动作：${action}`);
}

// 任务级互斥：同一约定同一时间只允许一轮 Agent 执行。
// coordinate（@Agent 立即触发）与 drive（防抖后自动触发）共用同一快照窗口时会并发跑两轮、
// 几乎同时各回一条消息（重复回复的根因）；这里按 taskId 串行化，冲突方收到 AGENT_BUSY 让行。
const runningTasks = new Set();

/**
 * 协同约定 Agent 入口。
 * 前置：任务存在且开启协同（metadata.collab），Agent 未被暂停，余额充足（402）。
 * 结算口径：LLM 调用失败不扣点；动作成功后 chargeAICredits（结算竞态只告警，与 functions.js 一致）。
 * 返回 { ok, action, degraded, result }，result 内含原始 ORM 对象（路由层负责序列化）。
 */
export async function runCollabAgent(params) {
  if (runningTasks.has(params.taskId)) {
    throw errorWith(409, "AGENT_BUSY", "Agent 正在处理本轮沟通，本次让行");
  }
  runningTasks.add(params.taskId);
  try {
    return await runCollabAgentLocked(params);
  } finally {
    runningTasks.delete(params.taskId);
  }
}

async function runCollabAgentLocked({ taskId, action, user, commentId = null }) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { members: { include: { user: true } }, user: true }
  });
  if (!task) throw errorWith(404, "NOT_FOUND", "约定不存在");
  const collab = task.metadata?.collab;
  if (!collab || typeof collab !== "object") {
    throw errorWith(403, "COLLAB_NOT_ENABLED", "该约定未开启协同空间");
  }
  if (collab.agent?.paused === true) {
    throw errorWith(403, "AGENT_PAUSED", "Agent 已被暂停，恢复后可继续使用");
  }
  if ((action === "coordinate" || action === "extract_subtasks") && !commentId) {
    throw errorWith(400, "INVALID_INPUT", "该动作需要 commentId");
  }

  await assertAICredits(user.id, COST(), "collab_agent");

  const snapshot = await loadSpaceSnapshot(task);
  if (action === "drive") {
    // 循环防护：最新一条发言若来自 Agent（或空间还没有成员发言），本轮驱动没有意义
    const last = snapshot.comments[snapshot.comments.length - 1];
    if (!last || last.agent) {
      throw errorWith(409, "NO_NEW_MEMBER_INPUT", "最新发言来自 Agent 或暂无成员发言，跳过本轮驱动");
    }
    // 最短间隔守卫以「开始时间」为准，而不是结束时间（LLM 一轮可能跑 1-2 分钟）
    await touchLastDriveAt(taskId);
  }
  const system = buildSystem(collab.scenario, collab.agent);
  const result = await runAction({ action, task, snapshot, system, user, commentId });

  // 结算：竞态余额不足只告警放行（沿用 functions.js settleCredits 惯例）
  try {
    await chargeAICredits({
      userId: user.id,
      cost: COST(),
      feature: "collab_agent",
      description: `协同约定 Agent：${action}`
    });
  } catch (error) {
    if (error?.code === "INSUFFICIENT_CREDITS") {
      console.warn(`[collabAgent] collab_agent 结算时余额不足（余额 ${error.balance}，需 ${error.required}），本次放行`);
    } else {
      console.error(`[collabAgent] collab_agent 结算失败:`, error?.message || error);
    }
  }

  await logCollabChange(user.id, task, "collab_agent_action", [
    { field: "agent_action", field_label: "Agent 动作", new_value: action },
    ...(commentId ? [{ field: "comment", field_label: "来源讨论", new_value: commentId }] : [])
  ]);

  return { ok: true, action, degraded: Boolean(result.degraded), result };
}

async function touchLastDriveAt(taskId) {
  try {
    const fresh = await prisma.task.findUnique({ where: { id: taskId } });
    const freshCollab = fresh?.metadata?.collab;
    if (fresh && freshCollab) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          metadata: {
            ...(fresh.metadata || {}),
            collab: {
              ...freshCollab,
              agent: { ...(freshCollab.agent || { enabled: true }), lastDriveAt: new Date().toISOString() }
            }
          }
        }
      });
    }
  } catch (error) {
    console.warn("[collabAgent] 记录 lastDriveAt 失败（不影响本轮结果）:", error?.message || error);
  }
}
