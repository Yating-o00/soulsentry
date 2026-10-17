import React from "react";
import { Folder, FileText, Trash2, ArrowRight, FolderPlus } from "lucide-react";

// 文件整理结果视图：统计数据 + 文件树式列表
const ACTION_META = {
  create: { icon: FolderPlus, color: "text-emerald-600", bg: "bg-emerald-50",  label: "已创建" },
  move:   { icon: ArrowRight, color: "text-blue-600",    bg: "bg-blue-50",     label: "已移动" },
  delete: { icon: Trash2,     color: "text-red-500",     bg: "bg-red-50",      label: "已删除" },
  update: { icon: FileText,   color: "text-amber-600",   bg: "bg-amber-50",    label: "已更新" },
};

export default function FileResultView({ result }) {
  const diff = Array.isArray(result?.diff) ? result.diff : [];
  const data = result?.data || {};

  // 统计
  const stats = diff.reduce((acc, d) => {
    acc[d.action] = (acc[d.action] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-2.5">
      {/* 统计卡 */}
      {diff.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat num={stats.move || 0}   label="文件移动" color="text-blue-600" />
          <Stat num={stats.create || 0} label="文件夹创建" color="text-emerald-600" />
          <Stat num={stats.delete || 0} label="重复删除" color="text-red-500" />
        </div>
      )}

      {/* 文件树 */}
      {diff.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100">
          {diff.slice(0, 12).map((d, i) => {
            const meta = ACTION_META[d.action] || ACTION_META.update;
            const Icon = meta.icon;
            const isFolder = d.action === "create" && /\/$|文件夹|folder/i.test(d.target || "");
            return (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                  {isFolder ? (
                    <Folder className={`w-4 h-4 ${meta.color}`} />
                  ) : (
                    <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-slate-800 truncate">{d.target}</div>
                  {d.detail && <div className="text-[10.5px] text-slate-500 truncate">{d.detail}</div>}
                </div>
                <span className={`text-[10px] font-semibold ${meta.color} flex-shrink-0`}>{meta.label}</span>
              </div>
            );
          })}
          {diff.length > 12 && (
            <div className="px-3 py-2 text-[10.5px] text-slate-400 text-center">
              还有 {diff.length - 12} 项…
            </div>
          )}
        </div>
      )}

      {/* 没有 diff 时的兜底 */}
      {diff.length === 0 && result?.preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-48 overflow-y-auto">
          <pre className="text-[11.5px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{result.preview}</pre>
        </div>
      )}

      {data?.summary && (
        <div className="text-[11px] text-slate-500 italic leading-relaxed px-1">{data.summary}</div>
      )}
    </div>
  );
}

function Stat({ num, label, color }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 px-2 py-2.5 text-center">
      <div className={`text-[20px] font-bold ${color} leading-none`}>{num}</div>
      <div className="text-[10px] text-slate-500 mt-1">{label}</div>
    </div>
  );
}