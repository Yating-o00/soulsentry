import React from "react";
import { format } from "date-fns";
import { RotateCcw, Trash2, Clock, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function TrashTaskCard({ task, subtasks = [], onRestore, onDeleteForever, restoring, deleting }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-100 border-l-[3px] border-l-[#d5495f]/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-700 truncate">{task.title}</h3>
          {task.description && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{task.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
            {task.deleted_at && (
              <span className="flex items-center gap-1">
                <Trash2 className="w-3 h-3" />
                删除于 {format(new Date(task.deleted_at), "MM-dd HH:mm")}
              </span>
            )}
            {task.reminder_time && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(task.reminder_time), "MM-dd HH:mm")}
              </span>
            )}
            {subtasks.length > 0 && (
              <span className="flex items-center gap-1">
                <CornerDownRight className="w-3 h-3" />
                {subtasks.length} 个子约定
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <Button
            size="sm"
            onClick={onRestore}
            disabled={restoring || deleting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-9"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            恢复
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDeleteForever}
            disabled={restoring || deleting}
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5 h-9"
          >
            <Trash2 className="w-3.5 h-3.5" />
            永久删除
          </Button>
        </div>
      </div>
    </motion.div>
  );
}