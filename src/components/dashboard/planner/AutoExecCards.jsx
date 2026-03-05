import React from "react";

export default function AutoExecCards({ tasks = [] }) {
  const items = tasks.slice(0,4);
  const fill = Array.from({ length: Math.max(0, 4 - items.length) }).map((_,i) => ({
    title: `占位操作 ${i+1}`,
    status: i === 0 ? 'ACTIVE' : i === 1 ? 'READY' : 'PENDING',
    desc: '根据你的规划自动执行',
  }));
  const merged = [
    ...items.map((t,i) => ({ title: t.title, status: i===0?'ACTIVE':i===1?'MONITORING':'READY', desc: t.estimated_minutes ? `${t.estimated_minutes}分钟预留` : '自动执行项' })),
    ...fill
  ];

  const badgeColor = (s) => s==='ACTIVE' ? 'text-emerald-600' : s==='READY' ? 'text-indigo-600' : s==='MONITORING' ? 'text-amber-600' : 'text-slate-600';

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-lg font-bold text-slate-800">自动执行清单</h4>
        <span className="text-xs text-slate-500">{merged.length} 项待执行</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {merged.map((it, idx) => (
          <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-slate-800 font-medium truncate">{it.title}</div>
              <span className={`text-[10px] font-medium ${badgeColor(it.status)}`}>• {it.status}</span>
            </div>
            <div className="text-xs text-slate-500">{it.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}