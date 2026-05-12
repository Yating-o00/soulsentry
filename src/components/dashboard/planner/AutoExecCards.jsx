import React from "react";

// 兼容旧引用：实际渲染由 Dashboard 顶层的 <AutoExecutionPanel /> 承载（输入+清单已合并到那里）
// 此组件保留为空壳避免双重展示。
export default function AutoExecCards() {
  return null;
}

function _LegacyAutoExecCards({ tasks = [], userText = "" }) {
  const text = (userText || "").trim();

  const derivePlaceholders = (t) => {
    if (!t) return [];
    const res = [];
    const push = (title, status = 'READY', desc = '根据你的规划自动执行') => {
      if (!res.find(x => x.title === title)) res.push({ title, status, desc });
    };

    if (/[Qq][1-4]|报告|季度|周报|月报/.test(t)) push('报告完成提醒', 'MONITORING', '自动执行项');
    if (/进度|检查|检视|复盘/.test(t)) {
      if (/晚|夜|晚上|晚间/.test(t)) push('晚间检查进度', 'READY', '自动执行项');
      push('每日进度提醒', 'ACTIVE', '自动执行项');
    }
    if (/电话|来电|联系|通话/.test(t)) push('通话提醒', 'READY', '自动执行项');
    if (/航班|飞|出发|机场|登机/.test(t)) push('行程出发提醒', 'ACTIVE', '自动执行项');
    if (/会议|见面|面谈|准备/.test(t)) push('会议前准备清单', 'READY', '自动执行项');

    return res.slice(0, 4);
  };

  const fromInput = derivePlaceholders(text);

  const items = (tasks || []).map((t, i) => ({
    title: t.title,
    status: t.status || (i === 0 ? 'ACTIVE' : i === 1 ? 'MONITORING' : 'READY'),
    desc: t.desc || t.description || (t.estimated_minutes ? `${t.estimated_minutes}分钟预留` : '自动执行项')
  })).slice(0, 4);

  const merged = [...items, ...fromInput].slice(0, 4);

  if (merged.length === 0) return null;

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