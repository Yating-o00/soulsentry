import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// 自生长模板：约定用得越多，这里长出的套路越贴身
export default function PersonalTemplateList() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forging, setForging] = useState(false);

  const load = () => {
    base44.entities.PersonalTemplate.list("-use_count", 20)
      .then((rows) => setTemplates(rows || []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const forge = async () => {
    setForging(true);
    try {
      const res = await base44.functions.invoke("forgePersonalTemplates", {});
      const d = res?.data || {};
      if (d.skipped) toast.info(d.reason || "历史约定还太少");
      else toast.success(`已归纳出 ${d.count || 0} 个贴身模板`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "归纳失败，请重试");
    } finally {
      setForging(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">自生长模板</h2>
            <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
              心栈从你的历史约定里归纳出的套路，创建同类约定时会自动推荐。
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={forge}
          disabled={forging}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-slate-200 text-xs text-slate-600 hover:text-[#384877] hover:border-[#384877]/40 transition-colors disabled:opacity-50 shrink-0"
        >
          {forging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          重新归纳
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> 读取模板…
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 leading-relaxed">
          还没有长出模板。继续记录约定，或点「重新归纳」让心栈现在就看看你的历史。
        </p>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
            <div key={tpl.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800">{tpl.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px]">
                  {(tpl.steps || []).length} 步
                </span>
                {tpl.use_count > 0 && (
                  <span className="text-[10px] text-slate-400">已复用 {tpl.use_count} 次</span>
                )}
              </div>
              {tpl.evidence && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{tpl.evidence}</p>}
              <ul className="mt-2.5 space-y-1">
                {(tpl.steps || []).map((s, i) => (
                  <li key={i} className="text-xs text-slate-600 leading-relaxed">
                    {i + 1}. {s.title}
                    {s.offset_hint ? <span className="text-slate-400"> （{s.offset_hint}）</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}