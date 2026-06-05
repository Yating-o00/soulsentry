import React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { GitBranch, CheckCircle2, CircleDot } from "lucide-react";

/**
 * 版本时间线：把约定的历史迭代（revisions）和当前版本串联展示，
 * 让用户追溯约定的演化过程。
 */
export default function TaskRevisionTimeline({ task }) {
  if (!task) return null;

  const revisions = task.revisions || [];

  // 历史版本按版本号从新到旧排列
  const sortedRevisions = [...revisions].sort((a, b) => (b.version || 0) - (a.version || 0));

  if (revisions.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">暂无历史版本</p>
        <p className="text-xs mt-1 text-slate-300">
          点击「发起新一轮更新」后，旧内容会归档到这里
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-2">
      {/* 当前版本（最新） */}
      <div className="relative flex gap-3 pb-6">
        <div className="flex flex-col items-center">
          <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-200 z-10">
            <CircleDot className="w-4 h-4 text-white" />
          </div>
          <div className="w-0.5 flex-1 bg-slate-200 mt-1" />
        </div>
        <div className="flex-1 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
              当前 · v{revisions.length + 1}
            </span>
          </div>
          <h4 className="font-semibold text-slate-900 text-[15px]">{task.title}</h4>
          {task.description && (
            <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap line-clamp-4">
              {task.description}
            </p>
          )}
        </div>
      </div>

      {/* 历史版本 */}
      {sortedRevisions.map((rev, idx) => {
        const isLast = idx === sortedRevisions.length - 1;
        return (
          <div key={rev.version || idx} className="relative flex gap-3 pb-6">
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center z-10">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              {!isLast && <div className="w-0.5 flex-1 bg-slate-200 mt-1" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  v{rev.version}
                </span>
                {rev.archived_at && (
                  <span className="text-[11px] text-slate-400">
                    {format(new Date(rev.archived_at), "yyyy-MM-dd HH:mm", { locale: zhCN })}
                  </span>
                )}
              </div>
              <h4 className="font-medium text-slate-600 text-[15px] line-through decoration-slate-300">
                {rev.title}
              </h4>
              {rev.description && (
                <p className="text-sm text-slate-400 mt-1 whitespace-pre-wrap line-clamp-3">
                  {rev.description}
                </p>
              )}
              {rev.update_note && (
                <p className="text-xs text-amber-600 mt-1.5 bg-amber-50 px-2 py-1 rounded-md inline-block">
                  💬 {rev.update_note}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}