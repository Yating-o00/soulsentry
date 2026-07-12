import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Navigation, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * 任务位置关联：从已保存地点选择或使用当前位置，
 * 写入 task.location_reminder，由 SentinelGeoWatcher 到达时自动触发提醒。
 */
export default function TaskLocationBinder({ task, onUpdate }) {
  const [locating, setLocating] = useState(false);
  const lr = task.location_reminder || {};
  const enabled = !!lr.enabled;

  const { data: savedLocations = [] } = useQuery({
    queryKey: ["saved-locations"],
    queryFn: () => base44.entities.SavedLocation.list("-created_date", 50),
    enabled: enabled,
    initialData: [],
  });

  const update = (patch) => {
    onUpdate({ location_reminder: { ...lr, ...patch } });
  };

  const handleToggle = (checked) => {
    update({ enabled: checked });
  };

  const bindSavedLocation = (loc) => {
    update({
      enabled: true,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius: loc.radius || 300,
      location_name: loc.name,
    });
    toast.success(`已关联地点「${loc.name}」`);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("您的浏览器不支持地理定位");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        update({
          enabled: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          radius: lr.radius || 300,
          location_name: lr.location_name || "当前位置",
        });
        toast.success("已使用当前位置");
      },
      (err) => {
        setLocating(false);
        toast.error(`获取位置失败: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const hasCoords = typeof lr.latitude === "number" && typeof lr.longitude === "number";

  return (
    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-900 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-500" />
          位置提醒
        </h4>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>
      <p className="text-xs text-slate-500 -mt-2">到达设定地点时，心栈自动弹出此约定的提醒</p>

      {enabled && (
        <div className="space-y-3">
          {hasCoords ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
              <MapPin className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-800 truncate">
                  {lr.location_name || "已设定位置"}
                </p>
                <p className="text-[11px] text-emerald-600">
                  半径 {lr.radius || 300} 米 · {lr.trigger_on === "exit" ? "离开时提醒" : lr.trigger_on === "both" ? "进出均提醒" : "到达时提醒"}
                </p>
              </div>
              <button
                onClick={() => update({ enabled: true, latitude: null, longitude: null, location_name: "" })}
                className="p-1 rounded-md hover:bg-emerald-100 text-emerald-500"
                title="重新选择地点"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {savedLocations.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">从常用地点选择</Label>
                  <div className="flex flex-wrap gap-2">
                    {savedLocations.map((loc) => (
                      <button
                        key={loc.id}
                        onClick={() => bindSavedLocation(loc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-sm text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                      >
                        <span>{loc.icon || "📍"}</span>
                        <span>{loc.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={useCurrentLocation}
                disabled={locating}
                className="w-full border-emerald-200 hover:bg-emerald-50 text-emerald-700"
              >
                {locating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Navigation className="w-4 h-4 mr-2" />}
                使用当前位置
              </Button>
            </>
          )}

          {hasCoords && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">触发半径 (米)</Label>
                <Input
                  type="number"
                  min="50"
                  step="50"
                  value={lr.radius || 300}
                  onChange={(e) => update({ radius: parseInt(e.target.value) || 300 })}
                  className="bg-white h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">触发条件</Label>
                <Select value={lr.trigger_on || "enter"} onValueChange={(v) => update({ trigger_on: v })}>
                  <SelectTrigger className="bg-white h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enter">到达时</SelectItem>
                    <SelectItem value="exit">离开时</SelectItem>
                    <SelectItem value="both">进出均提醒</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}