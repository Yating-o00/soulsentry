import React from "react";

function buildDefaults(tasks = []) {
  const first = tasks[0]?.title || "关键任务";
  return [
    { idx: 1, time: "今晚 20:00", title: `创建「${first}」并拆解3个子任务`, tag: "日历+提醒", tagColor: "text-rose-600 bg-rose-50 border-rose-200" },
    { idx: 2, time: "每天 09:00", title: "今日进度与数据缺口提示", tag: "推送", tagColor: "text-slate-600 bg-slate-50 border-slate-200" },
    { idx: 3, time: "下周一 21:00", title: "最终检查：格式、数据、错别字", tag: "弹窗+铃声", tagColor: "text-rose-600 bg-rose-50 border-rose-200" },
  ];
}

export default function DeviceStrategy({ title = "智能手机 策略", tasks }) {
  const items = buildDefaults(tasks);
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <h4 className="text-lg font-bold text-slate-800 mb-4">{title}</h4>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.idx} className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center font-semibold text-slate-600">{it.idx}</div>
            <div className="flex-1 min-w-0">
              <div className="text-slate-900 font-medium">{it.time}</div>
              <div className="text-sm text-slate-600 mt-0.5">{it.title}</div>
            </div>
            <span className={`text-[10px] px-2 py-1 rounded-full border ${it.tagColor}`}>{it.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}