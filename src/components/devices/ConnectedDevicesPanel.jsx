import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Smartphone, Monitor, Tablet, Watch, Speaker, RefreshCw, Pencil, Check, X, Wifi, WifiOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { listMyDevices, registerCurrentDevice } from "@/lib/deviceRegistry";
import { resolveDeviceBrand } from "./DeviceBrandIcon";
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
  const brand = resolveDeviceBrand(device);
  // 用 brand.deviceType(由 UA 实时判定)取元信息,绕开数据库可能残留的旧 device_type
  const meta = TYPE_META[brand.deviceType] || TYPE_META[device.device_type] || TYPE_META.other;
  const Icon = brand.Icon;
  const visual = { brandColor: brand.brandColor, label: brand.label };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name || brand.label || meta.label);

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
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={`group relative overflow-hidden rounded-2xl p-3 border cursor-pointer transition-all duration-300 ${
        isSelected
          ? "bg-white border-[#384877]/40 shadow-[0_8px_24px_-12px_rgba(56,72,119,0.35)] ring-1 ring-[#384877]/15"
          : device.is_current
          ? "bg-white border-slate-200 shadow-[0_4px_14px_-10px_rgba(15,23,42,0.18)] hover:border-[#384877]/30"
          : "bg-white/90 border-slate-200/80 hover:bg-white hover:border-slate-300 hover:shadow-[0_4px_14px_-10px_rgba(15,23,42,0.15)]"
      }`}
    >
      <div className="relative flex items-start gap-3" style={{ writingMode: "horizontal-tb" }}>
        {/* 图标块（小巧扁平，按品牌着色） */}
        <div
          className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={
            device.is_current || isSelected
              ? { backgroundColor: visual.brandColor, color: "#fff" }
              : { backgroundColor: `${visual.brandColor}14`, color: visual.brandColor }
          }
        >
          <Icon className="w-5 h-5" width={20} height={20} />
          {/* 在线状态点（叠在图标右下） */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${
              device.is_online ? "bg-emerald-500" : "bg-slate-300"
            }`}
          />
        </div>

        {/* 主信息区 */}
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-7 text-sm"
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
            <>
              {/* 标题行：名称 + 编辑 + 策略徽章 */}
              <div className="flex items-center gap-1.5">
                <h4
                  className="font-semibold text-slate-900 text-sm leading-snug truncate flex-1 min-w-0"
                  title={device.name || meta.label}
                >
                  {device.name || meta.label}
                </h4>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(true);
                  }}
                  className="text-slate-300 hover:text-[#384877] transition-colors shrink-0"
                  title="重命名"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                {strategyCount > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-[#384877] bg-[#384877]/8">
                    {strategyCount}<span className="opacity-70">策略</span>
                  </span>
                )}
              </div>

              {/* 元信息行：类型 · 角色 · 状态 */}
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate-500 truncate">
                <span>{meta.label}</span>
                {device.role && ROLE_META[device.role] && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="truncate">{ROLE_META[device.role]}</span>
                  </>
                )}
                <span className="text-slate-300">·</span>
                <span className={device.is_online ? "text-emerald-600 font-medium" : "text-slate-400"}>
                  {device.is_online ? "在线" : "离线"}
                </span>
                {device.is_current && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-[#384877] font-medium">本机</span>
                  </>
                )}
              </div>

              {/* 平台 / 浏览器 — 若数据库里的 platform 与 brand 实时判定形态冲突,
                  以 brand.label(如 iPhone/Android/Mac) 为准,避免显示矛盾信息 */}
              {(() => {
                const p = (device.platform || "").toLowerCase();
                const ua = (device.user_agent || "").toLowerCase();
                const dt = brand.deviceType;
                const platformMismatch =
                  (dt === "phone" && (p.includes("mac") || p.includes("win") || p.includes("linux"))) ||
                  (dt === "pc" && (p.includes("ios") || p.includes("android") || ua.includes("iphone")));
                const platformText = platformMismatch ? brand.label : (device.platform || meta.desc);
                if (!platformText && !device.browser) return null;
                return (
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={`${platformText}${device.browser ? " · " + device.browser : ""}`}>
                    {platformText}
                    {device.browser ? ` · ${device.browser}` : ""}
                  </p>
                );
              })()}

              {/* 最近活跃 */}
              {device.last_seen_at && (
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true, locale: zhCN })}
                </p>
              )}
            </>
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
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