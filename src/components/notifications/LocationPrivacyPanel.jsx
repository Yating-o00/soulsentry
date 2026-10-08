import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Shield, MapPin, Trash2, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

/**
 * 位置与隐私面板（地理守护·隐私架构）
 * - 总开关：关闭即停止一切位置触发的推送（判定仍进行，结果静默）
 * - 停留记录：可查看、可单条删除、可一键清空——理解必须可检查，痕迹随删随清
 * - 透明说明：坐标只用于围栏判定；展示层仅给到 1km 级精度
 */
export default function LocationPrivacyPanel() {
  const [enabled, setEnabled] = useState(true);
  const [sessions, setSessions] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [clearing, setClearing] = useState(false);

  const loadPrefs = async () => {
    try {
      const list = await base44.entities.UserPreference.list("-updated_date", 1);
      setEnabled(list?.[0]?.location_reminders !== false);
    } catch { /* 静默 */ }
  };

  const loadHistory = async () => {
    try {
      const res = await base44.functions.invoke("sentinelDwellLearn", { action: "history", limit: 50 });
      setSessions(res?.data?.sessions || []);
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => {
    loadPrefs();
    loadHistory();
  }, []);

  const toggle = async (on) => {
    setEnabled(on);
    try {
      const list = await base44.entities.UserPreference.list("-updated_date", 1);
      if (list?.[0]?.id) await base44.entities.UserPreference.update(list[0].id, { location_reminders: on });
      else await base44.entities.UserPreference.create({ location_reminders: on });
      toast.success(on ? "地理守护已开启" : "地理守护已关闭，位置触发不再推送");
    } catch {
      setEnabled(!on);
      toast.error("操作失败，请稍后再试");
    }
  };

  // 展示层脱敏：坐标只给到 ~1km 精度（小数点后两位）
  const fuzzy = (v) => (typeof v === "number" ? v.toFixed(2) : "—");

  const fmtRange = (s) => {
    const fmt = (iso) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };
    return `${fmt(s.started_at)} ~ ${s.ended_at ? fmt(s.ended_at).split(" ").pop() : "…"}`;
  };

  const removeOne = async (s) => {
    setBusyId(s.id);
    try {
      await base44.functions.invoke("sentinelDwellLearn", { action: "delete_session", session_id: s.id });
      setSessions((prev) => (prev || []).filter((x) => x.id !== s.id));
      toast.success("已删除这条停留记录");
    } catch {
      toast.error("删除失败，请稍后再试");
    } finally {
      setBusyId(null);
    }
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      const res = await base44.functions.invoke("sentinelDwellLearn", { action: "clear_history" });
      setSessions([]);
      toast.success(`已清空 ${res?.data?.deleted ?? ""} 条停留记录`);
    } catch {
      toast.error("清空失败，请稍后再试");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="w-5 h-5 text-slate-500" />
          位置与隐私
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-base font-medium">地理守护总开关</p>
            <p className="text-sm text-slate-600 mt-1">
              关闭后位置判定的守护动态静默，不再推送；需要的约定仍可随时打开
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={toggle} />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-base font-medium flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-slate-400" />
              停留记录
              <span className="text-xs font-normal text-slate-400">
                {sessions === null ? "读取中…" : `共 ${sessions.length} 条（最近 50 条）`}
              </span>
            </p>
            {sessions?.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAll}
                disabled={clearing}
                className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {clearing ? "清空中…" : "一键清空"}
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-2">
            服务端只记录停留会话（不记移动轨迹），用于学习常驻点；可逐条删除，坐标仅展示到约 1km 精度
          </p>

          {sessions === null ? null : sessions.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-lg">还没有停留记录</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-slate-700">{fmtRange(s)}</p>
                    <p className="text-[11px] text-slate-400 num">
                      约 {s.duration_min} 分钟 · ({fuzzy(s.latitude)}, {fuzzy(s.longitude)})
                    </p>
                  </div>
                  <button
                    onClick={() => removeOne(s)}
                    disabled={busyId === s.id}
                    className="shrink-0 text-[11px] text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                  >
                    {busyId === s.id ? "删除中…" : "删除"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-slate-400 flex items-start gap-1.5">
          <EyeOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          你的坐标只用于围栏判定与常驻点学习，不用于任何其他用途；删除或清空立即生效，学习结论（家/公司）也可在地点管理中随时删除。
        </p>
      </CardContent>
    </Card>
  );
}
