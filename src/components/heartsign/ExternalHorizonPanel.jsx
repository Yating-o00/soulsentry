import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Newspaper, Star, BellRing, Quote, ExternalLink, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

// 四类外部视野的预设
const CATEGORIES = [
  {
    key: "news",
    label: "相关新闻",
    icon: Newspaper,
    color: "text-blue-600",
    bg: "bg-blue-50",
    accent: "bg-blue-500",
    cardBg: "from-blue-50/60 to-white",
    ring: "ring-blue-200/60",
    desc: "与你最近心签内容高度相关的新近资讯",
    buildQuery: (topics) =>
      `根据这些主题：${topics}，搜索最近一周国内外有价值的新闻或行业动态（中文优先）。请用 markdown 列出 3-5 条，每条包含：① 一句话标题 ② 一句话要点 ③ 与原主题的关联点。末尾"参考来源:"附 URL。`,
  },
  {
    key: "follow",
    label: "长期关注",
    icon: Star,
    color: "text-amber-600",
    bg: "bg-amber-50",
    accent: "bg-amber-500",
    cardBg: "from-amber-50/60 to-white",
    ring: "ring-amber-200/60",
    desc: "你长期关心领域的深度内容入口",
    buildQuery: (topics) =>
      `用户长期关注的方向：${topics}。请检索这些方向上"值得长期订阅/收藏"的高质量内容入口（如知名博客、Newsletter、学术综述、行业报告、播客等），用 markdown 列出 4-6 条，每条包含：① 名称 ② 简介（一句话） ③ 适合的人群。末尾"参考来源:"附 URL。`,
  },
  {
    key: "alerts",
    label: "即时通知",
    icon: BellRing,
    color: "text-rose-600",
    bg: "bg-rose-50",
    accent: "bg-rose-500",
    cardBg: "from-rose-50/60 to-white",
    ring: "ring-rose-200/60",
    desc: "与你关注内容相关的即时性更新/事件",
    buildQuery: (topics) =>
      `围绕这些主题：${topics}，检索当下（最近 24-72 小时）正在发生的、可能影响用户决策的即时性事件或公告（如政策更新、产品发布、市场异动、安全事件等）。用 markdown 列出 3-5 条，每条标注大致时间与"为什么值得现在知道"。末尾"参考来源:"附 URL。`,
  },
  {
    key: "wisdom",
    label: "经典语录",
    icon: Quote,
    color: "text-violet-600",
    bg: "bg-violet-50",
    accent: "bg-violet-500",
    cardBg: "from-violet-50/60 to-white",
    ring: "ring-violet-200/60",
    desc: "沉淀已久的经典语录与常识性判断",
    buildQuery: (topics) =>
      `根据这些主题：${topics}，请汇总 5 条与之相关、经过时间检验的经典语录或常识性判断（出处可包含哲学家、科学家、经典书籍、心理学/经济学常识等）。每条包含：① 原句（中英任一） ② 出处 ③ 一句话点评——它在当下与用户的主题如何呼应。`,
  },
];

// 从最近心签提炼"主题串"
function deriveTopics(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return "";
  const recent = notes.slice(0, 12);
  const tags = new Set();
  recent.forEach((n) => (n.tags || []).forEach((t) => t && tags.add(t)));
  const tagStr = Array.from(tags).slice(0, 10).join("、");
  const summaries = recent
    .map((n) => n.ai_analysis?.summary || (n.plain_text || "").slice(0, 60))
    .filter(Boolean)
    .slice(0, 6)
    .join("；");
  return [tagStr, summaries].filter(Boolean).join(" | ");
}

// 极简 markdown 渲染（标题/列表/加粗）
function MiniMarkdown({ text }) {
  if (!text) return null;
  const lines = String(text).split("\n");
  return (
    <div className="space-y-1.5 text-[13.5px] leading-relaxed text-slate-700">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        // headings
        if (/^#{1,6}\s/.test(line)) {
          const content = line.replace(/^#{1,6}\s/, "");
          return (
            <div key={i} className="font-semibold text-slate-900 mt-2">
              {renderInline(content)}
            </div>
          );
        }
        // list
        if (/^\s*[-*•]\s+/.test(line)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <div className="flex-1">{renderInline(line.replace(/^\s*[-*•]\s+/, ""))}</div>
            </div>
          );
        }
        // numbered list
        if (/^\s*\d+[\.\)]\s+/.test(line)) {
          const m = line.match(/^\s*(\d+)[\.\)]\s+(.*)$/);
          return (
            <div key={i} className="flex gap-2">
              <span className="text-slate-400 text-xs mt-1 min-w-[16px]">{m?.[1]}.</span>
              <div className="flex-1">{renderInline(m?.[2] || "")}</div>
            </div>
          );
        }
        return <div key={i}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

function renderInline(text) {
  // bold **xxx**
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, idx) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {p.slice(2, -2)}
        </strong>
      );
    }
    // inline url
    const urlSplit = p.split(/(https?:\/\/[^\s)）"】]+)/g);
    return urlSplit.map((u, j) => {
      if (/^https?:\/\//.test(u)) {
        return (
          <a
            key={`${idx}-${j}`}
            href={u}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline break-all inline-flex items-center gap-0.5"
          >
            {u.length > 50 ? u.slice(0, 50) + "…" : u}
            <ExternalLink className="w-3 h-3 inline-block" />
          </a>
        );
      }
      return <span key={`${idx}-${j}`}>{u}</span>;
    });
  });
}

export default function ExternalHorizonPanel({ open, onOpenChange, notes = [] }) {
  const [activeKey, setActiveKey] = useState("news");
  // { [key]: { loading, answer, references, generatedAt } }
  const [cache, setCache] = useState({});

  const topics = useMemo(() => deriveTopics(notes), [notes]);

  const topicChips = useMemo(() => {
    if (!topics) return [];
    return topics
      .split(/[、|;；]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
  }, [topics]);

  const runFetch = async (cat) => {
    if (!topics) {
      toast.info("先随手写几条心签，AI 才知道你关心什么");
      return;
    }
    setCache((prev) => ({ ...prev, [cat.key]: { ...(prev[cat.key] || {}), loading: true } }));
    try {
      const res = await base44.functions.invoke("kimiWebBrowse", {
        query: cat.buildQuery(topics),
        language: "zh",
      });
      const data = res?.data || {};
      setCache((prev) => ({
        ...prev,
        [cat.key]: {
          loading: false,
          answer: data.answer || "（未获得有效内容）",
          references: Array.isArray(data.references) ? data.references : [],
          generatedAt: new Date().toISOString(),
        },
      }));
    } catch (e) {
      console.error(e);
      setCache((prev) => ({ ...prev, [cat.key]: { loading: false, error: e?.message || "获取失败" } }));
      toast.error("获取外部视野失败");
    }
  };

  // 切换标签时若无缓存自动触发一次
  const onTabChange = (key) => {
    setActiveKey(key);
    const cat = CATEGORIES.find((c) => c.key === key);
    if (cat && !cache[key]?.answer && !cache[key]?.loading) {
      runFetch(cat);
    }
  };

  // 首次打开时若主题非空，自动拉取当前 tab
  React.useEffect(() => {
    if (open && topics && !cache[activeKey]?.answer && !cache[activeKey]?.loading) {
      const cat = CATEGORIES.find((c) => c.key === activeKey);
      if (cat) runFetch(cat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col bg-gradient-to-b from-slate-50/40 to-white"
      >
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-slate-200/70 bg-gradient-to-br from-violet-50 via-indigo-50/60 to-white">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-md shadow-violet-500/20 flex-shrink-0">
              <Sparkles className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-slate-900 text-[15px] font-semibold leading-snug">
                外部视野
              </SheetTitle>
              <SheetDescription className="text-[12px] text-slate-600 mt-0.5 leading-relaxed">
            基于你最近的心签，AI 扩展四个维度的外部参考——跳出回声室
              </SheetDescription>
            </div>
          </div>

          {topicChips.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
              <span className="text-[10.5px] text-slate-400 flex-shrink-0 uppercase tracking-wide">主题</span>
              {topicChips.map((t, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-slate-600 whitespace-nowrap flex-shrink-0"
                >
                  {t.length > 18 ? t.slice(0, 18) + "…" : t}
                </span>
              ))}
            </div>
          )}
        </SheetHeader>

        <Tabs value={activeKey} onValueChange={onTabChange} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-3 grid grid-cols-4 bg-slate-100/80 h-auto p-1 rounded-xl">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const isActive = activeKey === c.key;
              return (
                <TabsTrigger
                  key={c.key}
                  value={c.key}
                  className="relative flex flex-col items-center gap-1 py-2 text-[11px] rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:font-medium"
                >
                  <Icon className={`w-4 h-4 ${isActive ? c.color : "text-slate-400"} transition-colors`} />
                  <span className={isActive ? "text-slate-900" : "text-slate-500"}>{c.label}</span>
                  {isActive && (
                    <span className={`absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full ${c.accent}`} />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {CATEGORIES.map((c) => {
            const state = cache[c.key] || {};
            return (
              <TabsContent
                key={c.key}
                value={c.key}
                className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 mt-0 data-[state=inactive]:hidden scrollbar-hide"
              >
                {/* Category banner */}
                <div className={`rounded-2xl bg-gradient-to-br ${c.cardBg} ring-1 ${c.ring} px-3.5 py-3 mb-4 flex items-center justify-between gap-3`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
                      <c.icon className={`w-4 h-4 ${c.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-slate-900 leading-tight">{c.label}</div>
                      <div className="text-[11.5px] text-slate-600 leading-snug mt-0.5">{c.desc}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2.5 text-[11px] bg-white/70 hover:bg-white border border-slate-200/70 rounded-lg flex-shrink-0"
                    onClick={() => runFetch(c)}
                    disabled={state.loading}
                  >
                    {state.loading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span className="ml-1">{state.answer ? "刷新" : "获取"}</span>
                  </Button>
                </div>

                {!topics ? (
                  <EmptyState text="先写几条心签，AI 才知道你关心什么" />
                ) : state.loading && !state.answer ? (
                  <LoadingState label={c.label} accent={c.color} />
                ) : state.error ? (
                  <div className="text-[13px] text-rose-600 bg-rose-50/80 border border-rose-200 rounded-xl px-3.5 py-3 flex items-start gap-2">
                    <BellRing className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 break-words">{state.error}</div>
                  </div>
                ) : state.answer ? (
                  <div>
                    {/* Result card with accent bar */}
                    <div className="relative bg-white border border-slate-200/80 rounded-2xl shadow-[0_2px_12px_rgba(15,23,42,0.04)] overflow-hidden">
                      <div className={`h-0.5 ${c.accent}`} />
                      <div className="p-4 sm:p-5">
                        <MiniMarkdown text={state.answer} />
                      </div>
                    </div>

                    {state.references?.length > 0 && (
                      <div className="mt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-1 h-3 rounded-full ${c.accent}`} />
                          <div className="text-[10.5px] text-slate-500 uppercase tracking-wider font-medium">
                            参考来源 · {state.references.length}
                          </div>
                        </div>
                        <ul className="space-y-1.5">
                          {state.references.map((r, i) => (
                            <li key={i}>
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-start gap-2 text-[12px] px-2.5 py-1.5 rounded-lg bg-slate-50/80 hover:bg-white hover:border-slate-200 border border-transparent transition-all"
                              >
                                <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-400 group-hover:text-blue-600" />
                                <span className="text-slate-700 group-hover:text-blue-600 break-all line-clamp-2">
                                  {r.title || r.url}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {state.generatedAt && (
                      <div className="mt-4 text-[10.5px] text-slate-400 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        生成于 {new Date(state.generatedAt).toLocaleString("zh-CN")}
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState text='点击右上角 "获取" 让 AI 为你检索' />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function LoadingState({ label, accent = "text-violet-500" }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <div className="relative mb-4">
        <Loader2 className={`w-7 h-7 animate-spin ${accent}`} />
        <div className="absolute inset-0 rounded-full blur-xl bg-current opacity-10" />
      </div>
      <div className="text-[13px] text-slate-700 font-medium">AI 正在为你检索 {label}…</div>
      <div className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1.5">
        <span className="inline-block w-1 h-1 rounded-full bg-slate-300 animate-pulse" />
        通常需要 5–15 秒
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center mb-3 ring-1 ring-slate-200/60">
        <Sparkles className="w-5 h-5 text-slate-400" />
      </div>
      <div className="text-[13px] text-slate-600 text-center max-w-[240px] leading-relaxed">{text}</div>
    </div>
  );
}