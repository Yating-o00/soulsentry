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

const ROLE_META = {
  primary: "主控",
  deep_work: "深度工作",
  voice_hub: "语音中枢",
  wearable: "贴身",
  secondary: "辅助",
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
      className={`relative rounded-3xl p-4 sm:p-5 border backdrop-blur-xl cursor-pointer transition-all duration-300 bg-white/60 ${
        isSelected
          ? "border-[#384877]/60 shadow-[0_20px_60px_-15px_rgba(56,72,119,0.35),0_0_0_4px_rgba(91,109,174,0.12)]"
          : device.is_current
          ? "border-white/80 shadow-[0_10px_40px_-12px_rgba(56,72,119,0.25)] hover:shadow-[0_15px_50px_-12px_rgba(56,72,119,0.32)]"
          : "border-white/70 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] hover:shadow-[0_12px_40px_-12px_rgba(56,72,119,0.22)]"
      }`}
    >
      {/* 右上角策略徽章（独立浮标，不挤压标题区） */}
      {!editing && strategyCount > 0 && (
        <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-gradient-to-r from-[#384877] via-[#6b6aae] to-[#a98ec4] shadow-[0_4px_12px_-2px_rgba(107,106,174,0.45)]">
          <span>{strategyCount}</span>
          <span className="opacity-90">策略</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
        <div
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-md ${
            device.is_current || isSelected
              ? "bg-gradient-to-br from-[#384877] via-[#4a5a96] to-[#5b6dae] text-white shadow-[0_8px_24px_-6px_rgba(56,72,119,0.55)]"
              : "bg-gradient-to-br from-white/80 to-slate-100/80 text-[#384877] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_12px_-4px_rgba(15,23,42,0.1)]"
          }`}
        >
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div
          className={`min-w-0 w-full flex-1 ${!editing && strategyCount > 0 ? "pr-16 sm:pr-14" : ""}`}
          style={{ writingMode: "horizontal-tb" }}
        >
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
            <div className="flex items-start gap-1.5">
              <h4 className="font-semibold text-slate-900 text-[15px] leading-snug min-w-0 flex-1 break-all" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                {device.name || meta.label}
              </h4>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                className="text-slate-300 hover:text-[#384877] transition-colors shrink-0 mt-1"
                title="重命名"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 设备类型 + 角色 */}
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
            <span className="font-medium text-slate-600">{meta.label}</span>
            {device.role && ROLE_META[device.role] && (
              <>
                <span className="text-slate-300">·</span>
                <span>{ROLE_META[device.role]}</span>
              </>
            )}
          </div>

          {/* 平台 / 浏览器 */}
          <p className="text-xs text-slate-500 mt-1.5 break-words">
            {device.platform || meta.desc}
            {device.browser ? ` · ${device.browser}` : ""}
          </p>

          {/* 屏幕分辨率（如有） */}
          {device.screen_size && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              屏幕 {device.screen_size}
            </p>
          )}

          {/* 状态徽章行 */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {device.is_online ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60"></span>
                  <span className="relative rounded-full w-2 h-2 bg-emerald-500"></span>
                </span>
                在线
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                离线
              </span>
            )}
            {device.is_current && (
              <span className="text-[10px] font-semibold text-[#384877] bg-white/70 backdrop-blur-sm border border-[#384877]/15 px-2 py-0.5 rounded-full">
                当前设备
              </span>
            )}
          </div>

          {/* 活跃时间（始终显示） */}
          {device.last_seen_at && (
            <p className="text-[11px] text-slate-500 mt-2">
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