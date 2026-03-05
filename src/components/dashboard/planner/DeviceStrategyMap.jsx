import React, { useState } from "react";
import { Smartphone, Watch, Glasses, Car, Home, Monitor, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { phone: Smartphone, watch: Watch, glasses: Glasses, car: Car, home: Home, pc: Monitor };

export default function DeviceStrategyMap({ devices = [] }) {
  const [active, setActive] = useState(devices?.[0]?.id || null);
  if (!devices || devices.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-lg font-semibold text-slate-800">全设备智能协同</h4>
          <p className="text-xs text-slate-500">基于情境的一对一分发策略</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {devices.map((d) => {
          const Icon = ICONS[d.id] || Smartphone;
          const selected = active === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setActive(d.id)}
              className={cn(
                "device-card rounded-2xl p-5 text-center transition-all border-2",
                selected ? "border-[#3b5aa2] ring-1 ring-[#3b5aa2]/30" : "border-transparent"
              )}
            >
              <div className={cn("w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center shadow-lg",
                selected ? "bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white" : "bg-slate-100 text-slate-600")}
              >
                <Icon className="w-6 h-6" />
              </div>
              <h4 className="font-medium text-slate-800 text-sm mb-1">{d.name || d.id}</h4>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">策略 {d.strategies?.length || 0}</p>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="mt-4 rounded-2xl p-4 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-slate-600">
            <Tag className="w-4 h-4" />
            <span className="text-sm">{devices.find((x) => x.id === active)?.name || active} · 策略</span>
          </div>
          <div className="grid gap-2">
            {(devices.find((x) => x.id === active)?.strategies || []).map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-9 text-right font-mono text-xs text-slate-500 pt-0.5">{s.time || "—"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm text-slate-800 font-medium">{s.method}</span>
                    {s.priority && (
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border",
                        s.priority === 'high' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                        s.priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-slate-50 text-slate-600 border-slate-200'
                      )}>{s.priority}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{s.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}