import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  History,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  ArrowRight,
  GitBranch,
  Circle,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CHANGE_TYPE_CONFIG = {
  created: { label: "创建约定", icon: Plus, color: "text-emerald-600", bg: "bg-emerald-500", ring: "ring-emerald-100" },
  updated: { label: "修改约定", icon: Pencil, color: "text-blue-600", bg: "bg-blue-500", ring: "ring-blue-100" },
  deleted: { label: "删除约定", icon: Trash2, color: "text-red-600", bg: "bg-red-500", ring: "ring-red-100" },
  status_changed: { label: "状态变更", icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-500", ring: "ring-amber-100" },
  subtask_created: { label: "新增子约定", icon: GitBranch, color: "text-teal-600", bg: "bg-teal-500", ring: "ring-teal-100" },
  subtask_updated: { label: "修改子约定", icon: Pencil, color: "text-indigo-600", bg: "bg-indigo-500", ring: "ring-indigo-100" },
  subtask_deleted: { label: "删除子约定", icon: Trash2, color: "text-orange-600", bg: "bg-orange-500", ring: "ring-orange-100" },
  subtask_status_changed: { label: "子约定状态变更", icon: CheckCircle2, color: "text-purple-600", bg: "bg-purple-500", ring: "ring-purple-100" },
};

export default function TaskChangeHistory({ taskId }) {
  const { data: changeLogs = [], isLoading } = useQuery({
    queryKey: ["task-change-logs", taskId],
    queryFn: () => base44.entities.TaskChangeLog.filter({ task_id: taskId }, "-created_date", 50),
    enabled: !!taskId,
  });

  const { data: completionHistory = [] } = useQuery({
    queryKey: ["task-completions", taskId],
    queryFn: () => base44.entities.TaskCompletion.filter({ task_id: taskId }, "-completed_at"),
    enabled: !!taskId,
  });

  // Merge and sort all history items by time
  const allHistory = React.useMemo(() => {
    const items = [];

    for (const log of changeLogs) {
      items.push({
        type: "change",
        time: new Date(log.created_date),
        data: log,
      });
    }

    for (const record of completionHistory) {
      items.push({
        type: "completion",
        time: new Date(record.completed_at || record.created_date),
        data: record,
      });
    }

    items.sort((a, b) => b.time - a.time);
    return items;
  }, [changeLogs, completionHistory]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (allHistory.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-100">
        <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">暂无历史记录</p>
        <p className="text-xs mt-1 text-slate-300">约定或子约定发生变更时会自动记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">变更历史</h3>
        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
          共 {allHistory.length} 条记录
        </Badge>
      </div>

      <div className="relative border-l-2 border-slate-100 ml-3 space-y-4 pl-6 py-2">
        <AnimatePresence>
          {allHistory.map((item, idx) => (
            <motion.div
              key={item.type === "completion" ? `c-${item.data.id}` : `l-${item.data.id}`}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="relative group"
            >
              {item.type === "completion" ? (
                <CompletionItem record={item.data} isLatest={idx === 0} />
              ) : (
                <ChangeLogItem log={item.data} isLatest={idx === 0} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CompletionItem({ record, isLatest }) {
  return (
    <>
      <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-sm flex items-center justify-center ring-2 ring-transparent group-hover:ring-green-100 transition-all">
        <CheckCircle2 className="w-2.5 h-2.5 text-white" />
      </div>
      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 hover:border-green-200 hover:bg-green-50/30 transition-all">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              约定完成
              {isLatest && <Badge className="h-5 text-[10px] bg-green-500 hover:bg-green-600">最新</Badge>}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-medium font-mono">
              {format(new Date(record.completed_at || record.created_date), "yyyy-MM-dd HH:mm:ss", { locale: zhCN })}
            </p>
          </div>
          <Badge variant="outline" className="bg-white text-green-600 border-green-200 text-xs shadow-sm">
            {record.status === "completed" ? "已完成" : record.status}
          </Badge>
        </div>
        {record.note && (
          <div className="mt-3 text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-100 italic">
            "{record.note}"
          </div>
        )}
      </div>
    </>
  );
}

function ChangeLogItem({ log, isLatest }) {
  const config = CHANGE_TYPE_CONFIG[log.change_type] || CHANGE_TYPE_CONFIG.updated;
  const Icon = config.icon;
  const isSubtask = log.change_type?.startsWith("subtask_");

  return (
    <>
      <div className={`absolute -left-[31px] top-0 w-4 h-4 rounded-full ${config.bg} border-2 border-white shadow-sm flex items-center justify-center ring-2 ring-transparent group-hover:${config.ring} transition-all`}>
        <Icon className="w-2.5 h-2.5 text-white" />
      </div>
      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-800 text-sm flex items-center gap-2 flex-wrap">
              <span className={config.color}>{config.label}</span>
              {isLatest && <Badge className="h-5 text-[10px] bg-blue-500 hover:bg-blue-600">最新</Badge>}
            </p>
            {isSubtask && log.task_title && (
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {log.task_title}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1 font-mono">
              {format(new Date(log.created_date), "yyyy-MM-dd HH:mm:ss", { locale: zhCN })}
            </p>
          </div>
          {log.changed_fields?.length > 0 && (
            <Badge variant="outline" className="bg-white text-slate-500 border-slate-200 text-[10px] shrink-0">
              {log.changed_fields.length} 项变更
            </Badge>
          )}
        </div>

        {log.changes_detail?.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {log.changes_detail.map((change, i) => (
              <div key={i} className="flex items-start gap-2 text-xs bg-white p-2 rounded-lg border border-slate-100">
                <span className="font-medium text-slate-600 shrink-0 min-w-[3.5rem]">
                  {change.field_label}
                </span>
                <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                  {change.old_value && change.old_value !== "(空)" && (
                    <>
                      <span className="text-slate-400 bg-red-50 px-1.5 py-0.5 rounded line-through truncate max-w-[120px]" title={change.old_value}>
                        {change.old_value}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                    </>
                  )}
                  <span className="text-slate-700 bg-green-50 px-1.5 py-0.5 rounded font-medium truncate max-w-[120px]" title={change.new_value}>
                    {change.new_value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}