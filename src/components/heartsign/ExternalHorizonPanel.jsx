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
    ring: "ring-blue-200/60",
    dot: "bg-blue-500",
    accent: "from-blue-500/10 to-blue-50",
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
    ring: "ring-amber-200/60",
    dot: "bg-amber-500",
    accent: "from-amber-500/10 to-amber-50",
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
    ring: "ring-rose-200/60",
    dot: "bg-rose-500",
    accent: "from-rose-500/10 to-rose-50",
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
    ring: "ring-violet-200/60",
    dot: "bg-violet-500",
    accent: "from-violet-500/10 to-violet-50",
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

// 极简 markdown 渲染
function MiniMarkdown({ text }) {
  if (!text) return null;
  const lines = String(text).split("\n");
  return (
    <div className="space-y-1.5 text-[13.5px] leading-relaxed text-slate-700">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (/^#{1,6}\s/.test(line)) {
          const content = line.replace(/^#{1,6}\s/, "");
          return (
            <div key={i} className="font-semibold text-slate-900 mt-2">
              {renderInline(content)}
            </div>
          );
        }
        if (/^\s*[-*•]\s+/.test(line)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <div className="flex-1">{renderInline(line.replace(/^\s*[-*•]\s+/, ""))}</div>
            </div>
          );
        }
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
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, idx) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {p.slice(2, -2)}
        </strong>
      );
    }
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

const STORAGE_KEY = "heartsign_external_horizon_cache_v1";

// 取本地日期串（按用户本地时区），用于判断"是否同一天"
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadCacheFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistCache(cache) {
  try {
    // 只保留有结果的条目，避免把 loading/error 写盘
    const slim = {};
    Object.entries(cache).forEach(([k, v]) => {
      if (v && v.answer) {
        slim[k] = {
          answer: v.answer,
          references: v.references || [],
          generatedAt: v.generatedAt,
          dayKey: v.dayKey,
        };
      }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    /* ignore quota errors */
  }
}

export default function ExternalHorizonPanel({ open, onOpenChange, notes = [] }) {
  const [activeKey, setActiveKey] = useState("news");
  const [cache, setCache] = useState(() => loadCacheFromStorage());

  const topics = useMemo(() => deriveTopics(notes), [notes]);

  // 缓存变化时持久化
  React.useEffect(() => {
    persistCache(cache);
  }, [cache]);

  const runFetch = async (cat) => {
    if (!topics) {
      toast.info("先随手写几条心签，AI 才知道你关心什么");
      return;
    }
    setCache((prev) => ({ ...prev, [cat.key]: { ...(prev[cat.key] || {}), loading: true, error: null } }));
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
          dayKey: todayKey(),
        },
      }));
    } catch (e) {
      console.error(e);
      // 失败时保留旧内容，仅记录 error
      setCache((prev) => ({
        ...prev,
        [cat.key]: { ...(prev[cat.key] || {}), loading: false, error: e?.message || "获取失败" },
      }));
      toast.error("获取外部视野失败");
    }
  };

  // 仅当：① 没有缓存内容 或 ② 缓存的 dayKey 不是今天，才自动拉取
  const shouldAutoRefresh = (key) => {
    const entry = cache[key];
    if (!entry || !entry.answer) return true;
    if (entry.loading) return false;
    return entry.dayKey !== todayKey();
  };

  const onTabChange = (key) => {
    setActiveKey(key);
    const cat = CATEGORIES.find((c) => c.key === key);
    if (cat && shouldAutoRefresh(key)) {
      runFetch(cat);
    }
  };

  React.useEffect(() => {
    if (open && topics && shouldAutoRefresh(activeKey)) {
      const cat = CATEGORIES.find((c) => c.key === activeKey);
      if (cat) runFetch(cat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col bg-gradient-to-b from-slate-50/80 via-white to-white"
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-5 border-b border-slate-200/70 bg-gradient-to-br from-violet-50 via-indigo-50/60 to-white relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gradient-to-br from-violet-300/30 to-indigo-300/20 blur-3xl pointer-events-none" />
          <div className="relative">
            <SheetTitle className="flex items-center gap-2.5 text-slate-900 text-lg">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-sm shadow-violet-500/20">
                <Sparkles className="w-4 h-4 text-white" />
              </span>
              外部视野
            </SheetTitle>
            <SheetDescription className="text-[12.5px] text-slate-600 mt-1.5 leading-relaxed">
              基于你最近的心签，AI 帮你扩展四个维度的外部参考——避免在自己的回声室里打转
            </SheetDescription>
            {topics && (
              <div
                className="mt-3 inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full bg-white/70 backdrop-blur border border-slate-200/70 text-[11px] text-slate-500"
                title={topics}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                <span className="text-slate-400">当前主题</span>
                <span className="text-slate-700 truncate max-w-[280px]">
                  {topics.length > 60 ? topics.slice(0, 60) + "…" : topics}
                </span>
              </div>
            )}
          </div>
        </SheetHeader>

        <Tabs value={activeKey} onValueChange={onTabChange} className="flex-1 flex flex-col min-h-0">
          {/* Tabs */}
          <TabsList className="mx-5 mt-4 grid grid-cols-4 bg-slate-100/80 h-auto p-1 rounded-xl">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const isActive = activeKey === c.key;
              return (
                <TabsTrigger
                  key={c.key}
                  value={c.key}
                  className="flex flex-col items-center gap-1 py-2 text-[11px] rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:shadow-slate-200/60 transition-all"
                >
                  <Icon className={`w-4 h-4 transition-colors ${isActive ? c.color : "text-slate-400"}`} />
                  <span className={isActive ? "text-slate-900 font-medium" : "text-slate-500"}>
                    {c.label}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {CATEGORIES.map((c) => {
            const state = cache[c.key] || {};
            const Icon = c.icon;
            return (
              <TabsContent
                key={c.key}
                value={c.key}
                className="flex-1 overflow-y-auto px-5 py-4 mt-0 data-[state=inactive]:hidden"
              >
                {/* 分类描述卡：色带 + 图标徽章 + 刷新按钮 */}
                <div
                  className={`relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-r ${c.accent} px-4 py-3 mb-4 flex items-center justify-between gap-3`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl bg-white shadow-sm ring-1 ${c.ring} flex items-center justify-center flex-shrink-0`}
                    >
                      <Icon className={`w-[18px] h-[18px] ${c.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold text-slate-900">{c.label}</div>
                      <div className="text-[11.5px] text-slate-600 leading-snug">{c.desc}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-[11.5px] rounded-full bg-white/80 backdrop-blur border-slate-200 hover:bg-white text-slate-700 shadow-sm flex-shrink-0"
                    onClick={() => runFetch(c)}
                    disabled={state.loading}
                  >
                    {state.loading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span className="ml-1.5">{state.answer ? "刷新" : "获取"}</span>
                  </Button>
                </div>

                {!topics ? (
                  <EmptyState text="先写几条心签，AI 才知道你关心什么" />
                ) : state.loading && !state.answer ? (
                  <LoadingState label={c.label} />
                ) : state.error ? (
                  <div className="text-[13px] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-2 flex-shrink-0" />
                    <span className="leading-relaxed">{state.error}</span>
                  </div>
                ) : state.answer ? (
                  <div>
                    {/* 内容卡：左侧色条 + 顶部小标识 */}
                    <div className="relative bg-white border border-slate-200/80 rounded-2xl shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] overflow-hidden">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.dot}`} />
                      <div className="px-5 pt-4 pb-2 flex items-center gap-2 text-[11px] text-slate-400">
                        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                        <span className="uppercase tracking-wider font-medium">AI · Kimi 联网检索</span>
                      </div>
                      <div className="px-5 pb-5">
                        <MiniMarkdown text={state.answer} />
                      </div>
                    </div>

                    {state.references?.length > 0 && (
                      <div className="mt-5">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                            参考来源
                          </div>
                          <div className="flex-1 h-px bg-slate-200/70" />
                          <div className="text-[11px] text-slate-400">{state.references.length}</div>
                        </div>
                        <ul className="space-y-1.5">
                          {state.references.map((r, i) => (
                            <li key={i}>
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200/70 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                              >
                                <span className="w-5 h-5 rounded-md bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0 transition-colors">
                                  <span className="text-[10px] text-slate-500 group-hover:text-blue-600 font-medium">
                                    {i + 1}
                                  </span>
                                </span>
                                <span className="text-[12.5px] text-slate-700 group-hover:text-blue-700 truncate flex-1">
                                  {r.title || r.url}
                                </span>
                                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-500 flex-shrink-0" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {state.generatedAt && (
                      <div className="mt-4 text-[11px] text-slate-400 text-right">
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

function LoadingState({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-violet-200/40 blur-xl animate-pulse" />
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        </div>
      </div>
      <div className="text-[13px] text-slate-700 font-medium">AI 正在为你检索 {label}</div>
      <div className="text-[11.5px] text-slate-400 mt-1.5">联网检索通常需要 5-15 秒</div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
        <Sparkles className="w-5 h-5 text-slate-400" />
      </div>
      <div className="text-[13px] text-slate-600">{text}</div>
    </div>
  );
}