import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Users, Clock } from "lucide-react";
import { format } from "date-fns";

// 协作快照：被邀请者看到的约定内容概览
export default function CollaborationSnapshot({ task, subtasks = [], inviterName, message }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] px-5 py-4 text-white">
        <p className="text-xs opacity-80 mb-1">{inviterName} 邀请你共同完成</p>
        <h2 className="text-lg font-bold leading-snug">{task.title}</h2>
      </div>

      <div className="p-5 space-y-4">
        {message && (
          <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2.5 leading-relaxed">
            “{message}”
          </p>
        )}

        {task.description && (
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{task.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Users className="w-3 h-3" /> {task.collaborator_count} 位协作者
          </Badge>
          {task.reminder_time && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Clock className="w-3 h-3" /> {format(new Date(task.reminder_time), "MM-dd HH:mm")}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">进度 {task.progress || 0}%</Badge>
        </div>

        {subtasks.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-semibold text-slate-500">拆解步骤</p>
            {subtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                {s.status === "completed"
                  ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
                <span className={s.status === "completed" ? "line-through text-slate-400" : ""}>{s.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}