// 共创空间双栏工作区共享常量与工具
export const BRAND = "#384877";

export const getInitials = (name) => {
  if (!name || typeof name !== "string") return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/^[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";
};

export const formatTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return d.toLocaleString("zh-CN", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const NODE_TYPE_LABELS = { time: "时间节点", stage: "阶段", decision: "决策", review: "复盘" };
export const NODE_TYPE_ICONS = { time: "Clock", stage: "Flag", decision: "Scale", review: "RefreshCw" };

export const MARK_LABELS = { consensus: "共识", dispute: "分歧", pending: "待确认" };
export const MARK_STYLES = {
  consensus: "bg-emerald-50 text-emerald-700 border-emerald-200",
  dispute: "bg-rose-50 text-rose-700 border-rose-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
};

export const DOC_TYPE_LABELS = {
  consensus: "共识纪要",
  dispute: "分歧清单",
  minutes: "纪要",
  file: "文件",
  decision: "决策",
  review: "复盘",
};

export const ACTIVITY_LABELS = {
  collab_member_added: "新增成员",
  collab_subtask_draft: "新增子约定草案",
  collab_subtask_confirmed: "子约定已确认",
  collab_doc_updated: "更新文档",
  collab_node_done: "完成节点",
  collab_agent_action: "Agent 操作",
  collab_message: "新讨论",
  collab_node_created: "新增执行节点",
  collab_node_updated: "更新执行节点",
  collab_node_deleted: "删除执行节点",
  collab_doc_created: "新建沉淀文档",
  collab_doc_confirmed: "确认沉淀文档",
};

export const AGENT_ACTION_TEXT = {
  tidy: "心栈 Agent 正在整理讨论（约 30 秒）…",
  minutes: "心栈 Agent 正在生成纪要（约 30 秒）…",
  disputes: "心栈 Agent 正在协调分歧（约 30 秒）…",
  extract_subtasks: "心栈 Agent 正在提取子约定（约 30 秒）…",
};

export const agentSuccessText = (action, res) => {
  const r = res?.result || {};
  switch (action) {
    case "tidy": return r.summary || "整理完成：共识纪要与分歧清单已更新";
    case "minutes": return r.doc ? `纪要「${r.doc.title}」已生成` : "纪要已生成";
    case "disputes": return `已向相关成员发出 ${r.questions_count ?? 0} 个补充问题`;
    case "extract_subtasks": return `已生成 ${r.created?.length ?? 0} 条子约定草案，待确认后生效`;
    default: return "Agent 执行完成";
  }
};

// @Agent 意图识别：发送内容按意图给展示层提示（实际触发由后端完成）
export const agentIntentFor = (text) => {
  if (/分歧|协调|意见分歧/.test(text)) return { key: "disputes", toast: "Agent 将协调分歧" };
  if (/纪要|文件|沉淀/.test(text)) return { key: "minutes", toast: "Agent 将生成纪要" };
  if (/子约定|行动项|拆解|计划/.test(text)) return { key: "subtasks", toast: "Agent 将提取子约定" };
  return { key: "reply", toast: "Agent 将回复" };
};

// 视觉语言：纸感底色 + 墨色文字 + 品牌蓝 #384877
export const C = {
  paper: "#f1f0ec",
  head: "#f7f6f2",
  pane: "#fdfcf9",
  card: "#faf9f5",
  ink: "#231f20",
  sub: "#77736c",
  faint: "#858179",
  line: "#dcdad3",
  lineSoft: "#e5e4df",
  green: "#4b7256",
  greenBg: "#e5f1ec",
  greenInk: "#315c43",
  amberBg: "#fff0d5",
  amberInk: "#7b4500",
  brandTint: "#eef2ff",
};
