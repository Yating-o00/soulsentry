// 协同约定 Agent：整理（tidy/minutes/disputes/extract_subtasks）+ 沟通（coordinate）双模式。
// 信任边界：只用当前空间数据（子约定树/讨论/节点/文档），不读成员私人记录、其他约定、心签；
// 中性呈现观点、不评判对错、不替人承诺；输出草案必须人工确认后才生效。
import { prisma } from "../lib/prisma.js";
import { callKimiChat, invokeKimiWebSearch, parseModelJson } from "../lib/kimi.js";
import { assertAICredits, chargeAICredits } from "./aiCredits.js";
import { AI_CALL_COSTS } from "../routes/functions.js";
import { collectSubtasks, logCollabChange } from "./collabSpace.js";
import { syncParentProgress } from "../routes/tasks.js";

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
        { title: "确认时间地点", standard: "所有成员给出可行时间并达成一致", assigneeHint: "" },
        { title: "分工准备物料", standard: "物料清单确定且每人认领至少一项", assigneeHint: "" }
      ]
    };
  }
  if (kind === "coordinate") {
    return {
      reply: "（本地调试回复）收到！我先梳理一下目前的讨论要点：各方的想法都已经摆在桌面上了。建议下一步先确认大家最在意的 1-2 个分歧点，需要我整理共识或提取子约定的话，随时 @我。",
      subtasks: [
        { title: "（mock）确认时间地点", standard: "所有成员给出可行时间", assigneeHint: "" }
      ],
      nodes: [{ title: "（mock）出发前确认清单", node_type: "review" }],
      doc: null
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
  return {
    consensus: "（本地 mock）已达成初步共识：共同目标明确，执行路径待细化。",
    disputes: "（本地 mock）待确认：时间安排、分工方案。",
    summary: "（本地 mock）整理完成：共识纪要与分歧清单已更新为草案，请成员到「沉淀」栏目确认。"
  };
}

async function invokeLLM({ system, prompt, json = false, kind }) {
  if (llmInvoker) return llmInvoker({ system, prompt, json, kind });
  if (process.env.COLLAB_AGENT_MOCK_LLM === "1") return mockLLM({ json, kind });
  const result = await callKimiChat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt }
    ],
    responseJsonSchema: json ? { name: "collab_agent_result" } : undefined,
    temperature: 0.4,
    maxTokens: 4000,
    fetchTimeout: 35000
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
  "3. 你生成的子约定只是草案，必须经成员确认后才生效。",
  "4. 情侣/朋友场景不做关系评分、不说教。"
].join("\n");

const SCENARIO_TAILS = {
  couple: "当前是情侣约定空间：语气温和体贴，像一位细心的朋友，多用鼓励性表达。",
  friends: "当前是朋友约定空间：语气轻快自然，可以适度活泼幽默。",
  colleagues: "当前是同事约定空间：语气结构化、要点清晰，突出负责人、时间点与风险。",
  custom: "当前是自定义约定空间：语气中性平和、清晰高效。"
};

export function buildSystem(scenario) {
  return `${TRUST_RULES}\n\n${SCENARIO_TAILS[scenario] || SCENARIO_TAILS.custom}`;
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
    lines.push("\n子约定：");
    for (const st of snapshot.subtasks.slice(0, 30)) {
      const meta = st.metadata?.collab || {};
      const state = meta.state === "draft" ? "草案待确认" : (st.status === "DONE" ? "已完成" : "进行中");
      const standard = meta.standard ? `（完成标准：${String(meta.standard).slice(0, 60)}）` : "";
      lines.push(`- [${state}] ${st.title}${standard}`);
    }
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

// ── 动作实现：每个返回 { ...结果 }；抛错表示动作失败（此时未扣点）──

// 子约定草案统一创建入口（extract_subtasks 与 coordinate 共用）
async function createDraftSubtask(task, user, { title, standard = "", assigneeHint = "", sourceCommentId = null }) {
  const subtask = await prisma.task.create({
    data: {
      userId: user.id,
      title: String(title).trim().slice(0, 120),
      status: "TODO",
      priority: "medium",
      parentTaskId: task.id,
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
    ...(sourceCommentId
      ? [{ field: "agent", field_label: "来源", new_value: "Agent 提取" }]
      : [{ field: "agent", field_label: "来源", new_value: "Agent 沉淀" }])
  ]);
  return subtask;
}

async function runAction({ action, task, snapshot, system, user, commentId }) {
  const spaceText = formatSpaceData(task, snapshot);

  if (action === "tidy") {
    const prompt = `${spaceText}\n\n请基于以上空间数据做整理：\n1. 提炼已达成的共识，写成「共识纪要」正文；\n2. 梳理存在的分歧与待确认事项，写成「分歧清单」正文；\n3. 写一条 150 字以内的整理摘要，将作为 Agent 消息发给成员。\n\n只输出 JSON：{"consensus": "...", "disputes": "...", "summary": "..."}`;
    let data;
    try {
      data = await invokeLLM({ system, prompt, json: true, kind: action });
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
    const message = await postAgentMessage(task.id, {
      content: data.summary || "已完成一轮整理：共识纪要与分歧清单已更新为草案，请成员确认。"
    });
    return { consensus_doc: consensusDoc, dispute_doc: disputeDoc, message_comment_id: message.id };
  }

  if (action === "minutes") {
    const prompt = `${spaceText}\n\n请基于以上空间数据生成一份讨论纪要，包含：背景、各方观点要点、已决事项、待办与负责人建议。\n\n只输出 JSON：{"content": "纪要正文", "summary": "一句话摘要"}`;
    const data = await invokeLLM({ system, prompt, json: true, kind: action });
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
    const data = await invokeLLM({ system, prompt, json: true, kind: action });
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
    const prompt = `约定主题：${task.title}\n\n以下是一条讨论线程：\n${threadText}\n\n请从线程中提取可执行的行动项，每项给出：标题 title（30 字以内）、完成标准 standard（怎样算完成）、负责人建议 assigneeHint（成员姓名，不确定就空字符串）。\n\n只输出 JSON：{"items": [{"title": "...", "standard": "...", "assigneeHint": "..."}]}`;
    const data = await invokeLLM({ system, prompt, json: true, kind: action });
    const items = Array.isArray(data?.items) ? data.items.slice(0, MAX_SUBTASKS_PER_RUN) : [];
    if (items.length === 0 || items.every((item) => !isNonEmptyString(item?.title))) {
      return degradeWithMessage(task.id, "没有从讨论中提取到有效行动项");
    }
    const created = [];
    for (const item of items) {
      if (!isNonEmptyString(item.title)) continue;
      created.push(await createDraftSubtask(task, user, {
        title: item.title,
        standard: item.standard,
        assigneeHint: item.assigneeHint,
        sourceCommentId: commentId
      }));
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
        if (search?.content) {
          searched = true;
          const refs = Array.isArray(search.references) && search.references.length
            ? "\n参考来源：" + search.references.slice(0, 5).map((r) => r.url).join("、")
            : "";
          searchBlock = `\n\n联网检索到的外部信息（用于充实回答，结合成员讨论中的偏好取舍，不要照搬）：\n${String(search.content).slice(0, 2500)}${refs}`;
        }
      }
    } catch (error) {
      console.warn("[collabAgent] 联网检索失败，退回纯空间上下文:", error?.message || error);
    }

    // 全量上下文：整个空间的讨论/子约定/节点/文档都喂给 Agent，并显式要求记住前文信息。
    // 结构化输出：除回复外，按讨论内容把可执行项落成子约定草案、执行节点、沉淀文件（均为草案，待人确认）。
    const prompt = `${spaceText}${searchBlock}\n\n成员在讨论中 @你（所在线程）：\n${threadText}\n\n请回应这位成员，并按需把讨论内容落成空间对象：\n1. reply：直接回复——回答疑问、汇总要点、比较方案，${searched ? "结合联网检索到的外部信息" : "结合完整讨论"}给出有指导意义的建议。全程记住并使用完整讨论里的信息：成员在前面消息提到的地点、时间、预算、偏好等，即使这条 @ 消息没有重复，也视为仍然有效，要贯穿到建议里；建议要落到本约定的具体情境，不要泛泛而谈；\n2. subtasks：若讨论中出现了可执行的行动项（成员要做的事），提取为子约定草案，每项含 title（30 字以内）、standard（完成标准）、assigneeHint（负责人姓名，不确定留空）；没有则返回空数组，最多 ${MAX_SUBTASKS_PER_RUN} 项；\n3. nodes：若讨论中出现了关键时间点、阶段或决策，落成执行节点，含 title 与 node_type（time|stage|decision|review）；没有则返回空数组；\n4. doc：若成员明确要求沉淀/纪要/存档，或讨论内容值得长期保留（达成的方案、攻略汇总、清单），生成 {title, content} 存为沉淀文件；否则返回 null。\n\n所有对象都是草案，需成员确认后才生效；中性、不评判、不替人承诺。reply 200-400 字、分段清晰，不要用"Agent："开头。\n\n只输出 JSON：{"reply":"...","subtasks":[{"title":"...","standard":"...","assigneeHint":"..."}],"nodes":[{"title":"...","node_type":"stage"}],"doc":null}`;
    let data;
    try {
      data = await invokeLLM({ system, prompt, json: true, kind: action });
    } catch (error) {
      console.warn("[collabAgent] coordinate 结构化输出解析失败，降级为纯文本回复:", error?.message || error);
      data = null;
    }

    const createdNotes = [];
    let created = [];
    let createdNodes = [];
    let doc = null;

    if (data && typeof data === "object") {
      const items = Array.isArray(data.subtasks) ? data.subtasks : [];
      for (const item of items.slice(0, MAX_SUBTASKS_PER_RUN)) {
        if (!isNonEmptyString(item?.title)) continue;
        created.push(await createDraftSubtask(task, user, {
          title: item.title,
          standard: item.standard,
          assigneeHint: item.assigneeHint,
          sourceCommentId: target.id
        }));
      }
      if (created.length > 0) {
        await syncParentProgress(task.id);
        createdNotes.push(`${created.length} 条子约定草案`);
      }

      const NODE_TYPES = new Set(["time", "stage", "decision", "review"]);
      const nodeItems = Array.isArray(data.nodes) ? data.nodes : [];
      for (const item of nodeItems.slice(0, 10)) {
        if (!isNonEmptyString(item?.title)) continue;
        const sortOrder = await prisma.collabNode.count({ where: { taskId: task.id } });
        const node = await prisma.collabNode.create({
          data: {
            taskId: task.id,
            title: String(item.title).trim().slice(0, 120),
            nodeType: NODE_TYPES.has(item.node_type) ? item.node_type : "stage",
            sortOrder,
            createdBy: user.id
          }
        });
        createdNodes.push(node);
        await logCollabChange(user.id, task, "collab_node_created", [
          { field: "node", field_label: "执行节点", new_value: node.title },
          { field: "agent", field_label: "来源", new_value: "Agent 沉淀" }
        ]);
      }
      if (createdNodes.length > 0) createdNotes.push(`${createdNodes.length} 个执行节点`);

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

    // 保持一层回复：目标是根则挂其下，目标是回复则挂在同根线程下
    const reply = await postAgentMessage(task.id, {
      content: replyText,
      parentId: target.parentId || target.id,
      topic: target.topic
    });
    return {
      reply_comment_id: reply.id,
      searched,
      ...(created.length > 0 ? { created } : {}),
      ...(createdNodes.length > 0 ? { nodes: createdNodes } : {}),
      ...(doc ? { doc } : {})
    };
  }

  throw errorWith(400, "INVALID_ACTION", `未知 Agent 动作：${action}`);
}

/**
 * 协同约定 Agent 入口。
 * 前置：任务存在且开启协同（metadata.collab），Agent 未被暂停，余额充足（402）。
 * 结算口径：LLM 调用失败不扣点；动作成功后 chargeAICredits（结算竞态只告警，与 functions.js 一致）。
 * 返回 { ok, action, degraded, result }，result 内含原始 ORM 对象（路由层负责序列化）。
 */
export async function runCollabAgent({ taskId, action, user, commentId = null }) {
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
  const system = buildSystem(collab.scenario);
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
