import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ListTodo } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

const PRIORITY_LABEL = { urgent: "紧急", high: "高", medium: "中", low: "低" };

function fmtTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "M月d日 HH:mm", { locale: zhCN });
}

function SubtaskNode({ node, depth }) {
  const done = node.status === "completed";
  return (
    <div>
      <div className="flex items-start gap-2 py-0.5" style={{ paddingLeft: depth * 18 }}>
        <span className={`flex-shrink-0 text-xs leading-5 ${done ? "text-green-500" : "text-slate-300"}`}>
          {done ? "✓" : "○"}
        </span>
        <div className="min-w-0">
          <p className={`text-sm break-words ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>
            {node.title}
          </p>
          {node.description && (
            <p className="text-xs text-slate-400 break-words">{node.description}</p>
          )}
        </div>
      </div>
      {(node.children || []).map((c, i) => (
        <SubtaskNode key={`${depth}-${i}`} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

function countNodes(nodes) {
  return (nodes || []).reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

function MetaRow({ task, parentTitle }) {
  const items = [];
  if (task.priority) items.push(`优先级：${PRIORITY_LABEL[task.priority] || task.priority}`);
  if (task.category) items.push(`分类：${task.category}`);
  const reminder = fmtTime(task.reminder_time);
  if (reminder) items.push(`提醒：${reminder}`);
  const end = fmtTime(task.end_time);
  if (end) items.push(`截止：${end}`);
  if (parentTitle) items.push(`所属约定：${parentTitle}`);
  if (items.length === 0) return null;
  return (
    <p className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((s, i) => <span key={i}>{s}</span>)}
    </p>
  );
}

// 约定沉淀条目的完整信息：约定信息 + 子约定树（沉淀时快照；老数据回退到实时拉取）
export default function TaskKnowledgeSnapshot({ item }) {
  const snap = item?.snapshot?.task ? item.snapshot : null;
  const needLive = item?.source_type === "task" && !snap;

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks', 'with-subs'],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: "all" }, '-reminder_time', 300),
    enabled: needLive,
    initialData: []
  });

  if (item?.source_type !== "task") return null;

  // 快照模式：展示沉淀时的完整信息
  if (snap) {
    const subCount = countNodes(snap.subtasks);
    return (
      <div className="space-y-3">
        <MetaRow task={snap.task} parentTitle={snap.task.parent_title} />
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
            <ListTodo className="w-3.5 h-3.5" />
            子约定（沉淀时 · 共 {subCount} 条）
          </p>
          {subCount > 0 ? (
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              {(snap.subtasks || []).map((n, i) => (
                <SubtaskNode key={i} node={n} depth={0} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">（沉淀时没有子约定）</p>
          )}
        </div>
      </div>
    );
  }

  // 老数据无快照：实时回退（原约定可能已删除或已被清理）
  const task = allTasks.find(t => t.id === item.source_id);
  if (!task) {
    return (
    <p className="text-xs text-slate-400">
        该条目沉淀较早未留存快照，且原约定已不在列表中，子约定信息不可用。
      </p>
    );
  }
  const children = allTasks.filter(t => t.parent_task_id === task.id);
  const parent = task.parent_task_id ? allTasks.find(t => t.id === task.parent_task_id) : null;
  return (
    <div className="space-y-3">
      <MetaRow task={task} parentTitle={parent?.title} />
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
          <ListTodo className="w-3.5 h-3.5" />
          子约定（实时 · 共 {children.length} 条）
        </p>
        {children.length > 0 ? (
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
            {children.map(c => (
              <SubtaskNode
                key={c.id}
                node={{ title: c.title, description: c.description, status: c.status, children: allTasks.filter(g => g.parent_task_id === c.id).map(g => ({ title: g.title, description: g.description, status: g.status })) }}
                depth={0}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">（暂无子约定）</p>
        )}
      </div>
    </div>
  );
}
