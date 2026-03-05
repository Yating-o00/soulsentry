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

  const renderCard = (key) => {
    const d = devices?.[key] || {};
    const Icon = ICONS[key] || Smartphone;
    const hasItems = (d.strategies || []).length > 0;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setSelected(key)}
        className={cn(
          "device-card rounded-2xl p-5 text-center cursor-pointer transition-all border-2",
          selected === key ? "border-[#3b5aa2] ring-1 ring-[#3b5aa2]/30 bg-white" : "border-transparent bg-white"
        )}
      >
        <div className={cn(
          "w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center text-slate-600 shadow-lg",
          selected === key ? "bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white" : "bg-slate-100"
        )}>
          <Icon className="w-6 h-6" />
        </div>
        <h4 className="font-medium text-slate-800 text-sm mb-1">{d.name || key}</h4>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider">{hasItems ? "已规划" : "暂无策略"}</p>
      </button>
    );
  };

  const strategies = devices?.[selected]?.strategies || [];

  return (
    <section className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#384877] flex items-center justify-center"><Zap className="w-4 h-4" /></div>
          <div>
            <h3 className="text-lg md:text-xl font-semibold text-slate-800">全设备智能协同</h3>
            <p className="text-xs text-slate-500">基于情境的分发策略</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
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