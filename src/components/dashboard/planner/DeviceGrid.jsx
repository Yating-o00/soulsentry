import React from "react";
import { Smartphone, Watch, Monitor, Car, Home, Server } from "lucide-react";

const devices = [
  { icon: Smartphone, label: "智能手机" },
  { icon: Watch, label: "智能手表" },
  { icon: Monitor, label: "工作站" },
  { icon: Car, label: "电动汽车" },
  { icon: Home, label: "智能家居" },
  { icon: Server, label: "云端" },
];

export default function DeviceGrid({ originalInput }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="text-lg font-bold text-slate-800">已为你安排</h4>
          {originalInput && (
            <p className="text-xs text-slate-500 mt-0.5">基于输入："{originalInput.slice(0, 36)}{originalInput.length > 36 ? '…' : ''}"</p>
          )}
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">云端同步正常</span>
      </div>

      <h5 className="text-sm font-semibold text-slate-700 mt-3 mb-3">全设备智能协同</h5>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {devices.map((d, idx) => (
          <div key={idx} className="device-card">
            <div className="w-10 h-10 rounded-2xl bg-[#eef2ff] text-[#384877] flex items-center justify-center">
              <d.icon className="w-5 h-5" />
            </div>
            <div className="text-sm font-medium text-slate-700">{d.label}</div>
            <div className="badge-online"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" /> 在线</div>
          </div>
        ))}
      </div>
    </div>
  );
}