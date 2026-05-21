import React, { useState } from "react";
import { Palette, Loader2, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

// 主题预设：3 种整份风格
const THEMES = [
  { key: "business", label: "商务", desc: "深蓝紫渐变 · 庄重", gradient: "linear-gradient(135deg,#1e3a8a,#3b0764)" },
  { key: "minimal",  label: "简约", desc: "白底黑字 · 极简",   gradient: "linear-gradient(135deg,#fafafa,#e5e5e5)" },
  { key: "tech",     label: "科技", desc: "深蓝青绿 · 现代",   gradient: "linear-gradient(135deg,#022c43,#164e63)" },
];

/**
 * 整份主题切换器（顶部条）
 * - executionId: TaskExecution.id（必填）
 * - currentTheme: 当前主题
 * - slides: 当前 slides 数据
 * - onSwitched: ({theme, fileUrl, fileName, slides}) => void
 */
export default function PptTemplateSwitcher({ executionId, currentTheme = "business", slides, onSwitched }) {
  const [busy, setBusy] = useState(null); // 正在切换中的 theme

  const switchTheme = async (themeKey) => {
    if (themeKey === currentTheme || busy) return;
    if (!executionId) {
      toast.error("缺少 execution_id，无法切换主题");
      return;
    }
    setBusy(themeKey);
    try {
      const res = await base44.functions.invoke("rerenderPpt", {
        execution_id: executionId,
        theme: themeKey,
        slides,
      });
      const d = res?.data || {};
      if (!d.success) throw new Error(d.error || "切换失败");
      toast.success(`已切换为「${THEMES.find(t => t.key === themeKey)?.label}」风格`);
      onSwitched?.({ theme: d.theme, fileUrl: d.file_url, fileName: d.file_name, slides: d.slides });
    } catch (e) {
      toast.error(`切换失败：${e?.message || e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200">
      <Palette className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      <div className="text-[11px] text-slate-500 font-medium flex-shrink-0">主题</div>
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
        {THEMES.map((t) => {
          const active = t.key === currentTheme;
          const isBusy = busy === t.key;
          return (
            <button
              key={t.key}
              type="button"
              disabled={!!busy}
              onClick={() => switchTheme(t.key)}
              title={t.desc}
              className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex-shrink-0 ${
                active
                  ? "bg-white border-[#384877] text-[#384877] shadow-sm"
                  : "bg-white/60 border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-white"
              } ${busy && !isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span
                className="w-3 h-3 rounded-sm border border-white/40 shadow-inner flex-shrink-0"
                style={{ background: t.gradient }}
              />
              <span>{t.label}</span>
              {active && !isBusy && <Check className="w-3 h-3" />}
              {isBusy && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}