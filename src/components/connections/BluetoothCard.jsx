import React, { useState } from "react";
import { Bluetooth, Heart, BatteryMedium } from "lucide-react";
import { toast } from "sonner";

export default function BluetoothCard() {
  const [dev, setDev] = useState(null);
  const [hr, setHr] = useState(null);
  const [battery, setBattery] = useState(null);
  const ok = typeof navigator !== "undefined" && !!navigator.bluetooth;

  const connect = async () => {
    try {
      const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ["heart_rate", "battery_service"] });
      const server = await d.gatt.connect();
      setDev(d.name || "蓝牙设备");
      d.addEventListener("gattserverdisconnected", () => { setDev(null); setHr(null); });
      const bat = await server.getPrimaryService("battery_service").catch(() => null);
      if (bat) setBattery((await (await bat.getCharacteristic("battery_level")).readValue()).getUint8(0));
      const hrs = await server.getPrimaryService("heart_rate").catch(() => null);
      if (hrs) {
        const c = await hrs.getCharacteristic("heart_rate_measurement");
        c.addEventListener("characteristicvaluechanged", (e) => {
          const v = e.target.value;
          setHr(v.getUint8(0) & 1 ? v.getUint16(1, true) : v.getUint8(1));
        });
        await c.startNotifications();
      }
    } catch (e) {
      if (e.name !== "NotFoundError") toast.error("连接失败：" + e.message);
    }
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center gap-2 font-semibold text-slate-800"><Bluetooth className="w-4 h-4 text-[#384877]" />蓝牙直连硬件</div>
      <p className="text-xs text-slate-500">连接手环、心率带等设备，实时读取心率与电量。</p>
      {dev && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
          <div className="font-medium text-slate-700">{dev}</div>
          <div className="flex gap-4 text-slate-600">
            <span className="flex items-center gap-1"><Heart className="w-4 h-4 text-rose-500" />{hr ?? "--"} 次/分</span>
            <span className="flex items-center gap-1"><BatteryMedium className="w-4 h-4" />{battery ?? "--"}%</span>
          </div>
        </div>
      )}
      {ok ? (
        <button onClick={connect} className="w-full h-9 rounded-xl bg-[#384877] text-white text-sm">{dev ? "连接其他设备" : "搜索附近设备"}</button>
      ) : <p className="text-[11px] text-slate-400 text-center">当前浏览器不支持蓝牙，请在安卓或电脑的 Chrome 中打开（iPhone 暂不支持）</p>}
    </div>
  );
}