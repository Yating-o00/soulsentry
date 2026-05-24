import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Smartphone, Monitor, Tablet, Watch, Speaker, RefreshCw, Pencil, Check, X, Wifi, WifiOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { listMyDevices, registerCurrentDevice } from "@/lib/deviceRegistry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";

const TYPE_META = {
  phone: { icon: Smartphone, label: "手机", desc: "主控终端" },
  pc: { icon: Monitor, label: "电脑", desc: "深度工作" },
  tablet: { icon: Tablet, label: "平板", desc: "辅助屏" },
  watch: { icon: Watch, label: "手表", desc: "贴身提醒" },
  speaker: { icon: Speaker, label: "音箱", desc: "语音中枢" },
  other: { icon: Monitor, label: "其他", desc: "辅助设备" },
};

function DeviceCard({ device, onRename, isSelected, onSelect, strategyCount = 0 }) {
  const meta = TYPE_META[device.device_type] || TYPE_META.other;
  const Icon = meta.icon;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name || meta.label);

  const save = async (e) => {
    e?.stopPropagation?.();
    const newName = (draft || "").trim() || meta.label;
    await onRename(device, newName);
    setEditing(false);
  };

  const handleCardClick = () => {
    if (editing) return;
    onSelect?.(device);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleCardClick}
      className={`relative rounded-2xl p-4 border transition-all bg-white cursor-pointer ${
        isSelected
          ? "border-[#384877] shadow-[0_4px_20px_rgba(56,72,119,0.18)] ring-2 ring-[#384877]/15"
          : device.is_current
          ? "border-[#384877]/40 hover:border-[#384877]"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {strategyCount > 0 && !editing && (
        <span
          className={`absolute top-2.5 right-2.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
            isSelected
              ? "bg-[#384877] text-white"
              : "bg-[#384877]/10 text-[#384877]"
          }`}
        >
          {strategyCount} 策略
        </span>
      )}
      <div className="flex items-start gap-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            device.is_current
              ? "bg-gradient-to-br from-[#384877] to-[#5b6dae] text-white shadow-lg shadow-[#384877]/30"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save}>
                <Check className="w-4 h-4 text-emerald-600" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  setDraft(device.name || meta.label);
                  setEditing(false);
                }}
              >
                <X className="w-4 h-4 text-slate-400" />
              </Button>
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 ${strategyCount > 0 ? "pr-16" : ""}`}>
              <h4 className="font-semibold text-slate-900 text-sm truncate">
                {device.name || meta.label}
              </h4>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                className="text-slate-300 hover:text-slate-600 transition-colors shrink-0"
                title="重命名"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {device.platform || meta.desc}
            {device.browser ? ` · ${device.browser}` : ""}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            {device.is_online ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <Wifi className="w-3 h-3" />
                在线
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                <WifiOff className="w-3 h-3" />
                离线
              </span>
            )}
            {device.is_current && (
              <span className="text-[11px] font-medium text-[#384877] bg-[#384877]/10 px-2 py-0.5 rounded-full">
                当前设备
              </span>
            )}
          </div>
          {device.last_seen_at && !device.is_current && (
            <p className="text-[10px] text-slate-400 mt-1.5">
              最近活跃 {formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true, locale: zhCN })}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function ConnectedDevicesPanel({
  selectedDeviceId,
  onSelectDevice,
  strategiesByType = {},
}) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [internalSelected, setInternalSelected] = useState(null);

  const refresh = async () => {
    try {
      const list = await listMyDevices();
      setDevices(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 默认选中当前设备
  useEffect(() => {
    if (selectedDeviceId === undefined && !internalSelected && devices.length > 0) {
      const current = devices.find((d) => d.is_current) || devices[0];
      if (current) setInternalSelected(current.id);
    }
  }, [devices, selectedDeviceId, internalSelected]);

  const activeId = selectedDeviceId ?? internalSelected;
  const handleSelect = (device) => {
    if (selectedDeviceId === undefined) setInternalSelected(device.id);
    onSelectDevice?.(device);
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const handleConnectCurrent = async () => {
    try {
      await registerCurrentDevice();
      toast.success("本机已连接");
      refresh();
    } catch (e) {
      toast.error("连接失败：" + (e?.message || ""));
    }
  };

  const handleTestConnection = async () => {
    try {
      const authed = await base44.auth.isAuthenticated();
      if (!authed) {
        toast.error("未登录，请先登录账号");
        return;
      }
      await registerCurrentDevice();
      toast.success("本机已上线，正在刷新…");
      setTimeout(refresh, 500);
    } catch (e) {
      toast.error("测试失败：" + (e?.message || "未知错误"));
    }
  };

  const handleRename = async (device, newName) => {
    try {
      await base44.entities.Device.update(device.id, { name: newName });
      toast.success("已更新设备名");
      refresh();
    } catch (e) {
      toast.error("重命名失败");
    }
  };

  const onlineCount = devices.filter((d) => d.is_online).length;
  const total = devices.length;
  const hasCurrent = devices.some((d) => d.is_current);

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Wifi className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">设备在线情况</h3>
            <p className="text-xs text-slate-400">
              {loading ? "加载中…" : `共 ${total} 台 · 在线 ${onlineCount} · 离线 ${total - onlineCount}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleTestConnection}
            title="把当前这台设备登记上线"
          >
            测试连接
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={refresh} title="刷新">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </Button>
        </div>
      </div>

      {!loading && !hasCurrent && (
        <button
          onClick={handleConnectCurrent}
          className="w-full mb-3 text-sm py-2.5 rounded-xl border-2 border-dashed border-[#384877]/30 text-[#384877] hover:bg-[#384877]/5 transition-colors"
        >
          + 把当前设备连接到 SoulSentry
        </button>
      )}

      {!loading && devices.length === 0 && (
        <div className="text-center py-8 text-sm text-slate-400">
          还没有连接的设备，在每台你想用的设备上打开本应用即可自动加入。
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {devices.map((d) => (
          <DeviceCard
            key={d.id}
            device={d}
            onRename={handleRename}
            isSelected={activeId === d.id}
            onSelect={handleSelect}
            strategyCount={strategiesByType?.[d.device_type]?.length || 0}
          />
        ))}
      </div>

      {devices.length > 0 && (
        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
          提示：在任何一台手机、平板或电脑上打开 SoulSentry 并保持登录，会自动加入这里的设备列表。
          AI 之后会根据你当前在哪台设备上，把通知和任务精准推到这台机器。
        </p>
      )}
    </div>
  );
}