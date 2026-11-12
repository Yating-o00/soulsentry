// 小助手动作提案：从对话中识别「对现有约定/心签的修改意图」（勾掉子约定、改标题/内容等），
// 产出待确认动作列表；用户在客户端确认后，executeActions 校验权限并落库。
// 提取优先走 Kimi（扣点，失败/余额不足自动降级本地规则），本地规则覆盖最常见的标题匹配场景。
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { callKimiChat, parseModelJson } from "../lib/kimi.js";
import { assertAICredits, chargeAICredits } from "./aiCredits.js";
import { AI_CALL_COSTS } from "../config/aiCosts.js";
import { syncParentProgress } from "../routes/tasks.js";

const COST = () => AI_CALL_COSTS.analyze_intent || 1;
const DONE_STATUSES = ["DONE", "ARCHIVED"];

// 动作意味的动词：命中才进入动作提取（避免普通聊天/创建意图被劫持）
const ACTION_VERB_RE = /勾|划掉|完成|搞定|做完|取消完成|重新打开|改成|改为|换成|修改|删掉|删除|推迟|挪到|延后|更新/;

const VALID_ACTION_TYPES = ["complete_task", "reopen_task", "update_task", "update_note"];

function serializeSnapshotTask(t, parentTitle) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    due_at: t.reminderTime || t.endTime || t.dueAt || null,
    parent_title: parentTitle || null
  };
}

// 用户可操作的约定快照：自己的（含子约定）+ 作为成员的协同空间子约定
async function loadTaskSnapshot(userId) {
  const [own, shared] = await Promise.all([
    prisma.task.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 120,
      select: { id: true, title: true, status: true, userId: true, parentTaskId: true, reminderTime: true, endTime: true, dueAt: true }
    }),
    prisma.task.findMany({
      where: { members: { some: { userId } }, deletedAt: null, parentTaskId: null },
      take: 20,
      select: { id: true }
    })
  ]);
  const sharedRootIds = shared.map((t) => t.id);
  let sharedTasks = [];
  if (sharedRootIds.length > 0) {
    // 协同空间的子约定挂在根约定下（从属层级由 parentTaskId 串联）
    sharedTasks = await prisma.task.findMany({
      where: { deletedAt: null, OR: [{ id: { in: sharedRootIds } }, { parentTaskId: { in: sharedRootIds } }] },
      take: 120,
      select: { id: true, title: true, status: true, userId: true, parentTaskId: true, reminderTime: true, endTime: true, dueAt: true }
    });
  }
  const all = [...own];
  const ownIds = new Set(own.map((t) => t.id));
  for (const t of sharedTasks) {
    if (!ownIds.has(t.id)) all.push(t);
  }
  const titleOf = new Map(all.map((t) => [t.id, t.title]));
  return all.map((t) => serializeSnapshotTask(t, titleOf.get(t.parentTaskId)));
}

async function loadNoteSnapshot(userId) {
  const notes = await prisma.note.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: { id: true, title: true, plainText: true }
  });
  return notes.map((n) => ({ id: n.id, title: n.title, preview: String(n.plainText || "").slice(0, 30) }));
}

// ── 本地规则兜底：不依赖 AI，覆盖「勾掉/完成 X」「把「X」改成 Y」「把「X」内容改成 …」──
function findByTitle(snapshot, raw) {
  const q = String(raw || "").trim().replace(/^[「『"]|[」』"]$/g, "");
  if (!q) return null;
  const exact = snapshot.find((t) => t.title === q);
  if (exact) return exact;
  // 包含匹配：取最长标题命中，避免「开会」命中「开会议准备」之外的歧义
  const hits = snapshot.filter((t) => q.length >= 2 && (t.title.includes(q) || q.includes(t.title)));
  hits.sort((a, b) => b.title.length - a.title.length);
  return hits[0] || null;
}

function localExtract(text, taskSnap, noteSnap) {
  const t = String(text || "").trim();
  const actions = [];

  // 勾掉/完成某条约定（含子约定）
  const completeMatch = t.match(/^(?:帮我|请|麻烦)?(?:把)?[「『"]?([^」』"，。]{2,30})[」』"]?\s*(?:勾掉|划掉|标记?(?:为)?完成|打上勾|设为完成)/)
    || t.match(/(?:勾掉|划掉|完成|搞定了|做完了)[「『"]?([^」』"，。]{2,30})[」』"]?/);
  if (completeMatch) {
    const hit = findByTitle(taskSnap.filter((x) => !DONE_STATUSES.includes(x.status)), completeMatch[1]);
    if (hit) {
      actions.push({
        id: randomUUID(),
        type: "complete_task",
        target_id: hit.id,
        label: `勾掉约定「${hit.title}」`,
        changes: {}
      });
    }
  }

  // 取消完成/重新打开
  const reopenMatch = t.match(/[「『"]?([^」』"，。]{2,30})[」』"]?\s*(?:取消完成|重新打开|还没完成|没做完)/);
  if (reopenMatch) {
    const hit = findByTitle(taskSnap.filter((x) => DONE_STATUSES.includes(x.status)), reopenMatch[1]);
    if (hit) {
      actions.push({
        id: randomUUID(),
        type: "reopen_task",
        target_id: hit.id,
        label: `重新打开约定「${hit.title}」`,
        changes: {}
      });
    }
  }

  // 标题修改：把「X」的标题/名字改成 Y（新标题带引号或到句尾）
  const titleMatch = t.match(/把[「『"]([^」』"]{1,30})[」』"]的?(?:标题|名字|名称)?(?:改成|改为|换成)[「『"]([^」』"]{1,60})[」』"]/)
    || t.match(/把[「『"]([^」』"]{1,30})[」』"]的?(?:标题|名字|名称)(?:改成|改为|换成)([^，。]{1,60})/);
  if (titleMatch) {
    const hit = findByTitle(taskSnap, titleMatch[1]);
    if (hit) {
      actions.push({
        id: randomUUID(),
        type: "update_task",
        target_id: hit.id,
        label: `把约定「${hit.title}」的标题改成「${titleMatch[2].trim()}」`,
        changes: { title: titleMatch[2].trim().slice(0, 60) }
      });
    }
  }

  // 内容/详情修改：把「X」的内容|详情|描述改成 …（先匹配约定，再匹配心签）
  const contentMatch = t.match(/把[「『"]([^」』"]{1,30})[」』"]的(?:内容|详情|描述|正文)(?:改成|改为|换成)[:：]?([\s\S]{1,500})/);
  if (contentMatch) {
    const newContent = contentMatch[2].trim().replace(/^[「『"]|[」』"]$/g, "");
    if (newContent) {
      const taskHit = findByTitle(taskSnap, contentMatch[1]);
      if (taskHit) {
        actions.push({
          id: randomUUID(),
          type: "update_task",
          target_id: taskHit.id,
          label: `修改约定「${taskHit.title}」的详情`,
          changes: { description: newContent.slice(0, 500) }
        });
      } else {
        const noteHit = findByTitle(noteSnap, contentMatch[1]);
        if (noteHit) {
          actions.push({
            id: randomUUID(),
            type: "update_note",
            target_id: noteHit.id,
            label: `修改心签「${noteHit.title}」的内容`,
            changes: { content: newContent.slice(0, 500) }
          });
        }
      }
    }
  }

  return actions;
}

// ── Kimi 提取：带上用户数据快照，让模型直接返回目标 id ──
async function kimiExtract({ text, taskSnap, noteSnap, userId }) {
  await assertAICredits(userId, COST(), "assistant_actions");
  const system = `你是心栈小助手的动作理解器。用户想对【已有的】约定/心签做修改。
根据用户消息，从给定快照里找到目标，输出 JSON：
{"actions":[{"type":"complete_task|reopen_task|update_task|update_note","target_id":"快照中的id","changes":{},"label":"一句话说明要做什么"}],"reply":"小助手给用户的简短回话（温柔、不超过50字）"}
规则：
- type 含义：complete_task=勾掉/完成约定（含子约定）；reopen_task=取消完成；update_task=改约定的标题/详情/时间/优先级，changes 可含 title,description,due_at(ISO时间),priority(high|medium|low)；update_note=改心签内容，changes 可含 title,content
- 只能从快照里选 target_id，不确定就不产出动作（actions 为空数组），reply 里温柔追问
- 用户是在创建新东西（而不是修改已有的）时，actions 也必须为空
- 最多 3 个动作`;
  const user = `约定快照：${JSON.stringify(taskSnap.slice(0, 60))}\n心签快照：${JSON.stringify(noteSnap.slice(0, 25))}\n用户消息：${text}`;
  const content = await callKimiChat({
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    responseJsonSchema: true,
    maxTokens: 1200
  });
  await chargeAICredits({ userId, cost: COST(), feature: "assistant_actions", description: "小助手动作理解" });
  const parsed = parseModelJson(content);
  if (!parsed || !Array.isArray(parsed.actions)) return { actions: [], reply: null };

  const taskIds = new Set(taskSnap.map((x) => x.id));
  const noteIds = new Set(noteSnap.map((x) => x.id));
  const taskTitle = new Map(taskSnap.map((x) => [x.id, x.title]));
  const noteTitle = new Map(noteSnap.map((x) => [x.id, x.title]));
  const actions = [];
  for (const raw of parsed.actions.slice(0, 3)) {
    if (!VALID_ACTION_TYPES.includes(raw?.type)) continue;
    const targetId = String(raw.target_id || "");
    if (raw.type === "update_note" ? !noteIds.has(targetId) : !taskIds.has(targetId)) continue;
    const changes = {};
    if (raw.type === "update_task") {
      if (raw.changes?.title) changes.title = String(raw.changes.title).slice(0, 60);
      if (raw.changes?.description) changes.description = String(raw.changes.description).slice(0, 500);
      if (raw.changes?.due_at && !Number.isNaN(Date.parse(raw.changes.due_at))) changes.due_at = new Date(raw.changes.due_at).toISOString();
      if (["high", "medium", "low"].includes(raw.changes?.priority)) changes.priority = raw.changes.priority;
      if (Object.keys(changes).length === 0) continue;
    }
    if (raw.type === "update_note") {
      if (raw.changes?.title) changes.title = String(raw.changes.title).slice(0, 60);
      if (raw.changes?.content) changes.content = String(raw.changes.content).slice(0, 500);
      if (Object.keys(changes).length === 0) continue;
    }
    const targetTitle = raw.type === "update_note" ? noteTitle.get(targetId) : taskTitle.get(targetId);
    actions.push({
      id: randomUUID(),
      type: raw.type,
      target_id: targetId,
      label: String(raw.label || "").slice(0, 80) || `修改「${targetTitle}」`,
      changes
    });
  }
  return { actions, reply: String(parsed.reply || "").trim() || null };
}

// 从最近一条用户消息里提取动作提案；无可提取内容时返回 null
export async function extractActions({ messages, userId }) {
  const lastUser = [...(messages || [])].reverse().find((m) => m.role === "user");
  const text = String(lastUser?.content || "").trim();
  if (!text || !ACTION_VERB_RE.test(text)) return null;

  const [taskSnap, noteSnap] = await Promise.all([loadTaskSnapshot(userId), loadNoteSnapshot(userId)]);
  if (taskSnap.length === 0 && noteSnap.length === 0) return null;

  try {
    const { actions, reply } = await kimiExtract({ text, taskSnap, noteSnap, userId });
    if (actions.length > 0) return { actions, reply, source: "kimi" };
  } catch (err) {
    // 余额不足/Kimi 不可用：静默降级本地规则
    console.warn("[assistantActions] kimi extract fallback:", err?.message || err);
  }

  const actions = localExtract(text, taskSnap, noteSnap);
  if (actions.length === 0) return null;
  return { actions, reply: null, source: "local" };
}

// ── 确认执行：校验权限后落库，返回每个动作的结果 ──
async function canTouchTask(task, userId) {
  if (!task) return false;
  if (task.userId === userId) return true;
  // 协同空间成员可操作其下子约定：沿父链找到根约定，查成员关系
  let cursor = task;
  for (let depth = 0; depth < 4 && cursor?.parentTaskId; depth += 1) {
    cursor = await prisma.task.findUnique({ where: { id: cursor.parentTaskId }, select: { id: true, userId: true, parentTaskId: true } });
    if (cursor?.userId === userId) return true;
  }
  const rootId = cursor?.id || task.id;
  const membership = await prisma.taskMember.findUnique({
    where: { taskId_userId: { taskId: rootId, userId } }
  });
  return Boolean(membership);
}

export async function executeActions({ actions, userId }) {
  const results = [];
  for (const action of (actions || []).slice(0, 5)) {
    const label = String(action?.label || "").slice(0, 80);
    try {
      if (!VALID_ACTION_TYPES.includes(action?.type) || !action?.target_id) {
        results.push({ id: action?.id, ok: false, label, error: "不认识的动作" });
        continue;
      }

      if (action.type === "update_note") {
        const note = await prisma.note.findUnique({ where: { id: action.target_id } });
        if (!note || note.userId !== userId) {
          results.push({ id: action.id, ok: false, label, error: "没有权限修改这条心签" });
          continue;
        }
        const data = {};
        if (action.changes?.title) data.title = String(action.changes.title).slice(0, 60);
        if (action.changes?.content) {
          data.content = String(action.changes.content).slice(0, 500);
          data.plainText = data.content;
        }
        await prisma.note.update({ where: { id: note.id }, data });
        results.push({ id: action.id, ok: true, label: label || `已修改心签「${note.title}」` });
        continue;
      }

      const task = await prisma.task.findUnique({
        where: { id: action.target_id },
        select: { id: true, userId: true, parentTaskId: true, title: true, status: true }
      });
      if (!(await canTouchTask(task, userId))) {
        results.push({ id: action.id, ok: false, label, error: "没有权限修改这条约定" });
        continue;
      }

      if (action.type === "complete_task") {
        await prisma.task.update({ where: { id: task.id }, data: { status: "DONE", completedAt: new Date() } });
      } else if (action.type === "reopen_task") {
        await prisma.task.update({ where: { id: task.id }, data: { status: "TODO", completedAt: null } });
      } else {
        const data = {};
        if (action.changes?.title) data.title = String(action.changes.title).slice(0, 60);
        if (action.changes?.description) data.description = String(action.changes.description).slice(0, 500);
        if (action.changes?.due_at && !Number.isNaN(Date.parse(action.changes.due_at))) {
          data.dueAt = new Date(action.changes.due_at);
          data.reminderTime = data.dueAt;
        }
        if (["high", "medium", "low"].includes(action.changes?.priority)) data.priority = action.changes.priority;
        if (Object.keys(data).length === 0) {
          results.push({ id: action.id, ok: false, label, error: "没有可修改的字段" });
          continue;
        }
        await prisma.task.update({ where: { id: task.id }, data });
      }
      if (task.parentTaskId) {
        await syncParentProgress(task.parentTaskId).catch(() => {});
      }
      results.push({ id: action.id, ok: true, label: label || `已更新「${task.title}」` });
    } catch (err) {
      console.error("[assistantActions] execute failed:", err?.message || err);
      results.push({ id: action?.id, ok: false, label, error: "执行失败，请稍后再试" });
    }
  }
  return results;
}
