import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Database, Download, Loader2, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

// 数据主权：记忆是用户的资产 —— 可查看、可导出、可删除
export default function MemoryVaultPanel() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [data, setData] = useState({ points: [], memories: [], deferrals: [], templates: [], profile: null, prefId: null });
  const [busy, setBusy] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const user = await base44.auth.me();
      setMe(user);
      const [points, memories, deferrals, templates, prefs] = await Promise.all([
        base44.entities.UserDataPoint.filter({ created_by_id: user.id }, "-occurred_at", 500),
        base44.entities.MemoryRecord.filter({ created_by_id: user.id }, "-created_date", 300).catch(() => []),
        base44.entities.TaskDeferralLog.filter({ created_by_id: user.id }, "-created_date", 300),
        base44.entities.PersonalTemplate.filter({ created_by_id: user.id }, "-updated_date", 50),
        base44.entities.UserPreference.filter({ created_by_id: user.id }, "-updated_date", 1),
      ]);
      setData({
        points: points || [],
        memories: memories || [],
        deferrals: deferrals || [],
        templates: templates || [],
        profile: prefs?.[0]?.cognition_profile || null,
        prefId: prefs?.[0]?.id || null,
      });
    } catch (e) {
      toast.error("读取记忆库失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const exportAll = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      owner: me?.email || "",
      cognition_profile: data.profile,
      personal_templates: data.templates,
      behavior_data_points: data.points,
      memories: data.memories,
      deferral_logs: data.deferrals,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `心栈记忆库_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("已导出你的全部记忆");
  };

  const purge = async (scope) => {
    if (!me) return;
    setBusy(scope);
    try {
      if (scope === "profile") {
        if (data.prefId) await base44.entities.UserPreference.update(data.prefId, { cognition_profile: {} });
      } else if (scope === "points") {
        await base44.entities.UserDataPoint.deleteMany({ created_by_id: me.id });
      } else if (scope === "templates") {
        await base44.entities.PersonalTemplate.deleteMany({ created_by_id: me.id });
      } else if (scope === "deferrals") {
        await base44.entities.TaskDeferralLog.deleteMany({ created_by_id: me.id });
      }
      toast.success("已清除，后续 AI 不会再引用这部分记忆");
      setConfirming(null);
      await load();
    } catch (e) {
      toast.error("清除失败，请重试");
    } finally {
      setBusy(null);
    }
  };

  const rows = [
    { key: "profile", label: "认知画像", count: data.profile?.persona ? 1 : 0, note: "AI 对你的一句话理解、能量模式与压力区" },
    { key: "templates", label: "个人模板", count: data.templates.length, note: "从历史约定中长出的重复套路" },
    { key: "points", label: "行为数据点", count: data.points.length, note: "使用习惯、约定结果与决策记录" },
    { key: "deferrals", label: "顺延记录", count: data.deferrals.length, note: "没能按时完成的原因，用于校准估算" },
  ];

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-[#384877]/10 text-[#384877] flex items-center justify-center shrink-0">
          <Database className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">我的记忆库</h2>
          <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
            这些记忆属于你 —— 随时查看、导出，或彻底删除。删除后 AI 立刻停止引用。
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> 读取你的记忆…
        </div>
      ) : (
        <>
          {data.profile?.persona && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 mb-5">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-[#384877]" />
                <span className="text-xs font-semibold text-slate-600">当前画像快照</span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{data.profile.persona}</p>
              {data.profile.energy_pattern && (
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{data.profile.energy_pattern}</p>
              )}
              {(data.profile.pressure_zones || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {data.profile.pressure_zones.map((z, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                      {z}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50/60">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-800">{row.label}</span>
                    <span className="text-xs text-slate-400">{row.count} 条</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{row.note}</p>
                </div>
                {confirming === row.key ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => purge(row.key)}
                      disabled={busy === row.key}
                      className="px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50"
                    >
                      {busy === row.key ? "清除中…" : "确认清除"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-500 text-xs"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(row.key)}
                    disabled={row.count === 0}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-500 text-xs hover:text-rose-600 hover:border-rose-200 transition-colors disabled:opacity-40 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 清除
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={exportAll}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#384877] text-white text-sm font-medium hover:bg-[#2f3d66] transition-colors"
          >
            <Download className="w-4 h-4" /> 导出我的全部记忆
          </button>
        </>
      )}
    </div>
  );
}