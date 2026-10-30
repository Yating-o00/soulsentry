// Agent 市场：按领域搜索并选用专业 Agent 方案（法律/旅行/教育等）
// 启用后该 Agent 以所选领域的专业身份参与当前协同空间的讨论、整理与建议
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Baby, Briefcase, Calculator, Compass, Dumbbell, FileSignature, GraduationCap,
  Home, Languages, Loader2, PawPrint, Plane, Salad, Scale, Search, Sparkles,
  PartyPopper, Utensils, Wallet, CheckCircle2, Store,
} from "lucide-react";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { C } from "./constants";

const ICONS = {
  Plane, Compass, FileSignature, Scale, GraduationCap, Languages, Baby,
  Calculator, Wallet, Salad, Dumbbell, Briefcase, PartyPopper, Utensils,
  PawPrint, Home,
};
const IconFor = ({ name, className, style }) => {
  const Cmp = ICONS[name] || Sparkles;
  return <Cmp className={className} style={style} />;
};

export default function AgentStoreDialog({ open, onOpenChange, taskId, currentAgent }) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [domain, setDomain] = useState("全部");
  const [applyingId, setApplyingId] = useState(null);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ['collab-agent-store'],
    queryFn: () => httpRequest("/api/collab/agent-store"),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  const templates = catalog?.templates || [];
  const domains = catalog?.domains || [];

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return templates.filter((t) => {
      if (domain !== "全部" && t.domain !== domain) return false;
      if (!q) return true;
      const hay = `${t.name}${t.domain}${t.summary}${(t.tags || []).join("")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [templates, keyword, domain]);

  const currentId = currentAgent?.templateId || null;

  const apply = async (template) => {
    if (!taskId || applyingId) return;
    setApplyingId(template ? template.id : "__reset__");
    try {
      await httpRequest(`/api/collab/${taskId}/agent`, {
        method: "POST",
        body: { template_id: template ? template.id : null },
      });
      queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(template ? `已启用「${template.name}」，它将以${template.domain}专业身份参与协同` : "已恢复默认 Agent");
    } catch (error) {
      toast.error(error?.message || "启用失败");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-hidden p-0 gap-0"
        style={{ backgroundColor: "#f7f7f2", borderColor: C.line }}
      >
        <DialogHeader className="border-b px-5 py-4" style={{ borderColor: C.lineSoft }}>
          <DialogTitle className="flex items-center gap-2 text-sm" style={{ color: "#312e2c" }}>
            <Store className="h-4 w-4" style={{ color: "#384877" }} /> Agent 市场
          </DialogTitle>
          <p className="mt-1 text-xs leading-5" style={{ color: "#77736c" }}>
            为当前协同约定挑选一位专业 Agent：它将以该领域身份参与讨论、联网查攻略、整理共识与子约定。专业建议仅供参考。
          </p>
        </DialogHeader>

        {/* 搜索 + 领域筛选 */}
        <div className="border-b px-5 py-3" style={{ borderColor: C.lineSoft }}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "#99958d" }} />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索 Agent：如 合同、旅行、备考、预算…"
              className="h-9 pl-9 text-xs"
              style={{ backgroundColor: "#fdfcf9", borderColor: "#cfcdc6" }}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {["全部", ...domains].map((d) => {
              const active = domain === d;
              const count = d === "全部" ? templates.length : templates.filter((t) => t.domain === d).length;
              if (d !== "全部" && count === 0) return null;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDomain(d)}
                  className={cn(
                    "rounded-full px-3 text-[11px] font-medium transition-colors min-h-7 focus-visible:outline-none",
                    active ? "text-[#faf9f5]" : "hover:bg-[#e7e6e0]"
                  )}
                  style={active ? { backgroundColor: C.ink } : { color: "#77736c" }}
                >
                  {d} · {count}
                </button>
              );
            })}
            {currentId && (
              <button
                type="button"
                onClick={() => apply(null)}
                disabled={applyingId !== null}
                className="ml-auto rounded-full border px-3 text-[11px] font-medium min-h-7 disabled:opacity-50"
                style={{ borderColor: "#d4d2cb", color: "#5b5751" }}
              >
                恢复默认 Agent
              </button>
            )}
          </div>
        </div>

        {/* 方案卡片 */}
        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-2.5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          {isLoading && (
            <div className="col-span-full flex items-center justify-center py-10 text-xs" style={{ color: "#99958d" }}>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在载入 Agent 市场…
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="col-span-full py-10 text-center text-xs italic" style={{ color: "#99958d" }}>
              没有找到匹配的 Agent，换个关键词试试
            </div>
          )}
          {filtered.map((t) => {
            const inUse = currentId === t.id;
            const busy = applyingId !== null;
            return (
              <div
                key={t.id}
                className="flex flex-col rounded-lg border p-3.5"
                style={{
                  borderColor: inUse ? "#384877" : "#dcdad3",
                  backgroundColor: inUse ? "#eef0f8" : "#faf9f5",
                }}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: inUse ? "#384877" : "#e4e6f8", color: inUse ? "#faf9f5" : "#384877" }}
                  >
                    <IconFor name={t.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold" style={{ color: "#35312f" }}>{t.name}</span>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                        style={{ backgroundColor: "#e4e6f8", color: "#2a2861" }}
                      >
                        {t.domain}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4" style={{ color: "#716e68" }}>{t.summary}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {(t.tags || []).map((tag) => (
                    <span key={tag} className="rounded-full bg-[#efeee8] px-1.5 py-0.5 text-[9px]" style={{ color: "#77736c" }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-end">
                  {inUse ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#384877" }}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> 使用中
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => apply(t)}
                      disabled={busy}
                      className="rounded-full border px-3.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 min-h-7"
                      style={{ borderColor: "#384877", color: "#384877" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#384877"; e.currentTarget.style.color = "#faf9f5"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#384877"; }}
                    >
                      {applyingId === t.id ? "启用中…" : "启用"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t px-5 py-2.5" style={{ borderColor: C.lineSoft }}>
          <p className="text-[10px] leading-4" style={{ color: "#99958d" }}>
            Agent 仍只读取当前约定空间；生成的子约定与文件均为草案，需成员确认后生效。法律/医疗/财务类建议仅供参考。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
