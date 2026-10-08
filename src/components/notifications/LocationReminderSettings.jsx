import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Navigation, Target, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

// 用户主动启用约定地点提醒 → 同步打开全局位置提醒偏好（服务端推送闸：显式关闭才不推）
async function enableGlobalLocationReminders() {
  try {
    const list = await base44.entities.UserPreference.list('-updated_date', 1);
    if (list?.[0]?.location_reminders === false) {
      await base44.entities.UserPreference.update(list[0].id, { location_reminders: true });
    } else if (!list?.length) {
      await base44.entities.UserPreference.create({ location_reminders: true });
    }
  } catch {
    // 偏好同步失败不阻塞主流程，下次保存时会重试
  }
}

export default function LocationReminderSettings({ taskDefaults, onUpdate }) {
  const [locationEnabled, setLocationEnabled] = useState(taskDefaults?.location_reminder?.enabled || false);
  const [locationPermission, setLocationPermission] = useState("prompt");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [semanticText, setSemanticText] = useState("");
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [semanticCandidates, setSemanticCandidates] = useState(null); // 多个候选地点时供点选
  const [settings, setSettings] = useState({
    latitude: taskDefaults?.location_reminder?.latitude || null,
    longitude: taskDefaults?.location_reminder?.longitude || null,
    radius: taskDefaults?.location_reminder?.radius || 500,
    location_name: taskDefaults?.location_reminder?.location_name || "",
    trigger_on: taskDefaults?.location_reminder?.trigger_on || "enter",
    time_gate: taskDefaults?.location_reminder?.time_gate || null,
    semantic: taskDefaults?.location_reminder?.semantic || null
  });

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setLocationPermission(result.state);
        result.addEventListener('change', () => {
          setLocationPermission(result.state);
        });
      });
    }
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("您的浏览器不支持地理定位");
      return;
    }

    toast.loading("正在获取位置...", { id: "location" });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ latitude, longitude });
        
        const newSettings = {
          ...settings,
          latitude,
          longitude,
          location_name: settings.location_name || `位置 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        };
        
        setSettings(newSettings);
        handleUpdate(newSettings);
        
        toast.success("位置获取成功！", { id: "location" });
      },
      (error) => {
        toast.error(`获取位置失败: ${error.message}`, { id: "location" });
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  };

  // web/浏览器定位是 WGS-84 坐标，标记来源供服务端纠偏统一
  const buildReminder = (enabled, s) => ({
    enabled,
    ...s,
    coord_type: "wgs84"
  });

  // 语义地点：解析成功直接落点；多个候选点选；落不了点登记观察（到场后问用户确认）
  const applyPlace = (place) => {
    const newSettings = { ...settings };
    delete newSettings.semantic;
    newSettings.latitude = place.latitude;
    newSettings.longitude = place.longitude;
    newSettings.location_name = place.name;
    if (place.radius) newSettings.radius = place.radius;
    setSettings(newSettings);
    handleUpdate(newSettings);
    setSemanticText("");
    setSemanticCandidates(null);
  };

  const clearSemantic = () => {
    const newSettings = { ...settings };
    delete newSettings.semantic;
    setSettings(newSettings);
    handleUpdate(newSettings);
  };

  const resolveSemantic = async () => {
    const text = semanticText.trim();
    if (!text || semanticBusy) return;
    setSemanticBusy(true);
    setSemanticCandidates(null);
    try {
      // 尽力提供当前位置：无锚点表达（如「超市」）可围绕当前位置找候选；拿不到就用地点库+锚点
      let coords = {};
      if ("geolocation" in navigator) {
        coords = await new Promise((resolve) => {
          const t = setTimeout(() => resolve({}), 1500);
          navigator.geolocation.getCurrentPosition(
            (pos) => { clearTimeout(t); resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, coord_type: "wgs84" }); },
            () => { clearTimeout(t); resolve({}); },
            { enableHighAccuracy: false, timeout: 1500, maximumAge: 300000 }
          );
        });
      }
      const res = await base44.functions.invoke("sentinelSemanticPlace", { text, ...coords });
      const data = res?.data;
      if (data?.status === "resolved" && data.place) {
        applyPlace(data.place);
        toast.success(`已定位到「${data.place.name}」`);
      } else if (data?.status === "candidates" && data.candidates?.length) {
        setSemanticCandidates(data.candidates);
        toast(`找到 ${data.candidates.length} 个候选，点选确认`);
      } else if (data?.status === "watch" && data.watch) {
        const newSettings = { ...settings, semantic: { raw: text, watch_id: data.watch.id } };
        setSettings(newSettings);
        handleUpdate(newSettings);
        toast.success(data.message || "已记住，到场停留后我会问你确认");
      } else {
        toast.error(data?.message || "没听懂这个地点，可以在地图上选点");
      }
    } catch {
      toast.error("解析失败，请稍后再试");
    } finally {
      setSemanticBusy(false);
    }
  };

  const handleUpdate = (newSettings) => {
    onUpdate?.({
      location_reminder: buildReminder(locationEnabled, newSettings)
    });
  };

  const handleToggle = (enabled) => {
    setLocationEnabled(enabled);
    onUpdate?.({
      location_reminder: buildReminder(enabled, settings)
    });
    if (enabled) enableGlobalLocationReminders();
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="w-5 h-5 text-green-500" />
          地理位置提醒
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label htmlFor="location-enabled" className="text-base font-medium">
              启用位置提醒
            </Label>
            <p className="text-sm text-slate-600 mt-1">
              到达或离开指定位置时自动提醒
            </p>
          </div>
          <Switch
            id="location-enabled"
            checked={locationEnabled}
            onCheckedChange={handleToggle}
          />
        </div>

        <AnimatePresence>
          {locationEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 pt-4 border-t"
            >
              {locationPermission === "denied" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700">
                    <p className="font-medium">位置权限已被拒绝</p>
                    <p className="text-xs mt-1">请在浏览器设置中允许位置访问</p>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium mb-2 block">位置名称</Label>
                <Input
                  placeholder="例如：公司、家、健身房"
                  value={settings.location_name}
                  onChange={(e) => {
                    const newSettings = { ...settings, location_name: e.target.value };
                    setSettings(newSettings);
                    handleUpdate(newSettings);
                  }}
                  className="bg-slate-50 border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium mb-2 block">纬度</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    placeholder="纬度"
                    value={settings.latitude || ""}
                    onChange={(e) => {
                      const newSettings = { ...settings, latitude: parseFloat(e.target.value) };
                      setSettings(newSettings);
                      handleUpdate(newSettings);
                    }}
                    className="bg-slate-50 border-slate-200"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">经度</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    placeholder="经度"
                    value={settings.longitude || ""}
                    onChange={(e) => {
                      const newSettings = { ...settings, longitude: parseFloat(e.target.value) };
                      setSettings(newSettings);
                      handleUpdate(newSettings);
                    }}
                    className="bg-slate-50 border-slate-200"
                  />
                </div>
              </div>

              <Button
                onClick={getCurrentLocation}
                variant="outline"
                className="w-full border-green-200 hover:bg-green-50"
                disabled={locationPermission === "denied"}
              >
                <Navigation className="w-4 h-4 mr-2" />
                使用当前位置
              </Button>

              {/* 语义地点：用一句话描述（如：家附近的超市），解析落点或登记到场学习 */}
              <div>
                <Label className="text-sm font-medium mb-2 block">或描述地点（如：家附近的超市）</Label>
                <div className="flex gap-2">
                  <Input
                    value={semanticText}
                    onChange={(e) => setSemanticText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); resolveSemantic(); } }}
                    placeholder="用一句话说出地点"
                    className="bg-slate-50 border-slate-200"
                  />
                  <Button
                    onClick={resolveSemantic}
                    disabled={semanticBusy || !semanticText.trim()}
                    variant="outline"
                    className="shrink-0 border-[#384877] text-[#384877] hover:bg-[#384877]/5"
                  >
                    {semanticBusy ? "解析中…" : "解析"}
                  </Button>
                </div>
                {semanticCandidates && (
                  <div className="mt-2 space-y-1.5">
                    {semanticCandidates.map((c) => (
                      <button
                        key={c.location_id}
                        type="button"
                        onClick={() => applyPlace(c)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:bg-slate-50"
                      >
                        <span className="shrink-0 text-sm text-slate-700">{c.name}</span>
                        {c.address && (
                          <span className="min-w-0 flex-1 truncate text-right text-[11px] text-slate-400">{c.address}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {settings.semantic && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="min-w-0 flex-1 text-xs leading-relaxed text-amber-700">
                      已记住「{settings.semantic.raw}」：到场停留后我会问你确认具体地点
                    </p>
                    <button
                      type="button"
                      onClick={clearSemantic}
                      className="ml-2 shrink-0 text-xs text-amber-500 hover:underline"
                    >
                      清除
                    </button>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">触发半径 (米)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    step="50"
                    min="50"
                    max="5000"
                    value={settings.radius}
                    onChange={(e) => {
                      const newSettings = { ...settings, radius: parseInt(e.target.value) };
                      setSettings(newSettings);
                      handleUpdate(newSettings);
                    }}
                    className="bg-slate-50 border-slate-200"
                  />
                  <span className="text-sm text-slate-600 whitespace-nowrap">米</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  当距离目标位置 {settings.radius} 米内时触发提醒
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">触发时机</Label>
                <Select
                  value={settings.trigger_on}
                  onValueChange={(value) => {
                    const newSettings = { ...settings, trigger_on: value };
                    setSettings(newSettings);
                    handleUpdate(newSettings);
                  }}
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enter">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-green-600" />
                        <span>到达目的地（确认停留后）</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="passby">
                      <div className="flex items-center gap-2">
                        <Navigation className="w-4 h-4 text-sky-600" />
                        <span>路过时（提前一个路口）</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="exit">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-orange-600" />
                        <span>离开时（出门那一刻）</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="both">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-600" />
                        <span>到达或离开时</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  到达型会等你确认停留（约 90 秒）再开口，路过不打扰
                </p>
              </div>

              {/* 复合条件：仅在特定时段触发（如"周五 17:30 后离开公司"） */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">时段条件（可选）</Label>
                  <Switch
                    checked={!!settings.time_gate}
                    onCheckedChange={(on) => {
                      const newSettings = {
                        ...settings,
                        time_gate: on ? { start_hm: "17:30", end_hm: "23:59", days: [] } : null
                      };
                      setSettings(newSettings);
                      handleUpdate(newSettings);
                    }}
                  />
                </div>
                {settings.time_gate && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={settings.time_gate.start_hm || "17:30"}
                        onChange={(e) => {
                          const newSettings = { ...settings, time_gate: { ...settings.time_gate, start_hm: e.target.value } };
                          setSettings(newSettings);
                          handleUpdate(newSettings);
                        }}
                        className="bg-slate-50 border-slate-200"
                      />
                      <span className="text-xs text-slate-500">至</span>
                      <Input
                        type="time"
                        value={settings.time_gate.end_hm || "23:59"}
                        onChange={(e) => {
                          const newSettings = { ...settings, time_gate: { ...settings.time_gate, end_hm: e.target.value } };
                          setSettings(newSettings);
                          handleUpdate(newSettings);
                        }}
                        className="bg-slate-50 border-slate-200"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {["日", "一", "二", "三", "四", "五", "六"].map((label, day) => {
                        const days = settings.time_gate.days || [];
                        const active = days.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              const next = active ? days.filter((d) => d !== day) : [...days, day];
                              const newSettings = { ...settings, time_gate: { ...settings.time_gate, days: next } };
                              setSettings(newSettings);
                              handleUpdate(newSettings);
                            }}
                            className={`h-7 w-7 rounded-full text-xs border transition-colors ${
                              active
                                ? "bg-[#384877] text-white border-[#384877]"
                                : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                      <span className="text-[11px] text-slate-400 self-center ml-1">不选=每天</span>
                    </div>
                  </div>
                )}
              </div>

              {currentLocation && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-green-700 text-sm">
                    <MapPin className="w-4 h-4" />
                    <span className="font-medium">当前位置已设置</span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}