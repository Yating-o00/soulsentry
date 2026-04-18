import React from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { phone: Smartphone, watch: Watch, glasses: Glasses, car: Car, home: Home, pc: Monitor };

export default function DeviceStrategyBoard({ devices }) {
  const deviceKeys = Object.keys(devices || {});
  const firstKey = deviceKeys.find(k => (devices?.[k]?.strategies || []).length > 0) || deviceKeys[0] || "phone";
  const [selected, setSelected] = React.useState(firstKey);

  React.useEffect(() => {
    if (devices && !devices[selected]) {
      setSelected(firstKey);
    }
  }, [devices]);

  const SHORT_NAMES = { phone: "手机", watch: "手表", glasses: "眼镜", car: "汽车", home: "家居", pc: "工作站" };

  const renderCard = (key) => {
    const d = devices?.[key] || {};
    const Icon = ICONS[key] || Smartphone;
    const hasItems = (d.strategies || []).length > 0;
    const isSelected = selected === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setSelected(key)}
        className={cn(
          "flex-shrink-0 w-[100px] md:w-auto bg-white rounded-2xl p-3.5 md:p-4 text-center cursor-pointer transition-all duration-300 border-2",
          "hover:-translate-y-0.5 hover:shadow-md",
          isSelected ? "border-[#384877] shadow-md ring-2 ring-[#384877]/10" : "border-slate-100 hover:border-slate-200"
        )}
      >
        <div className={cn(
          "w-11 h-11 mx-auto mb-2.5 rounded-xl flex items-center justify-center shadow-md transition-all duration-300",
          isSelected ? "bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white" : "bg-slate-100 text-slate-400"
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <h4 className="font-semibold text-slate-800 text-sm whitespace-nowrap mb-0.5">{SHORT_NAMES[key] || d.name || key}</h4>
        <div className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full whitespace-nowrap mt-1.5",
          hasItems ? "bg-emerald-50" : "bg-slate-50"
        )}>
          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", hasItems ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
          <span className={cn("text-[10px] font-medium", hasItems ? "text-emerald-600" : "text-slate-400")}>{hasItems ? "已规划" : "暂无"}</span>
        </div>
      </button>
    );
  };

  const strategies = devices?.[selected]?.strategies || [];

  return (
    <section className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-md"><Zap className="w-4 h-4 text-white" /></div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">全设备智能协同</h3>
            <p className="text-xs text-slate-400">基于情境的分发策略</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide md:grid md:grid-cols-3 lg:grid-cols-6 md:gap-3 md:overflow-visible md:pb-0">
        {deviceKeys.map(renderCard)}
      </div>

      <div className="mt-4 md:mt-6 rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">{devices?.[selected]?.name || selected} · 策略</h4>
            <p className="text-xs text-slate-500">一对一智能分发</p>
          </div>
        </div>
        <div className="grid gap-2">
          {strategies.length === 0 ? (
            <div className="text-sm text-slate-400">暂无策略</div>
          ) : strategies.map((s, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-mono">{idx+1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-0.5">
                  <div className="text-sm font-medium text-slate-800">{s.time} · {s.method}</div>
                  {s.priority && (
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider",
                      s.priority === 'high' ? "bg-rose-50 text-rose-600 border border-rose-200" :
                      s.priority === 'medium' ? "bg-amber-50 text-amber-700 border border-amber-200" :
                      "bg-slate-100 text-slate-600 border border-slate-200"
                    )}>{s.priority}</span>
                  )}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{s.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}