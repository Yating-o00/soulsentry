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
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b border-slate-200 bg-gradient-to-br from-violet-50 to-indigo-50">
          <SheetTitle className="flex items-center gap-2 text-slate-900">
            <Sparkles className="w-5 h-5 text-violet-600" />
            外部视野
          </SheetTitle>
          <SheetDescription className="text-[12.5px] text-slate-600">
            基于你最近的心签，AI 帮你扩展四个维度的外部参考——避免在自己的回声室里打转
          </SheetDescription>
          {topics && (
            <div className="mt-1 text-[11.5px] text-slate-500 truncate" title={topics}>
              当前主题串：<span className="text-slate-700">{topics.length > 80 ? topics.slice(0, 80) + "…" : topics}</span>
            </div>
          )}
        </SheetHeader>

        <Tabs value={activeKey} onValueChange={onTabChange} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-3 grid grid-cols-4 bg-slate-100 h-auto p-1">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              return (
                <TabsTrigger
                  key={c.key}
                  value={c.key}
                  className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                  <span>{c.label}</span>
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
                className="flex-1 overflow-y-auto px-5 py-4 mt-0 data-[state=inactive]:hidden"
              >
                <div className={`rounded-xl ${c.bg} px-3 py-2 mb-3 flex items-start justify-between gap-2`}>
                  <div className="flex items-start gap-2 min-w-0">
                    <c.icon className={`w-4 h-4 ${c.color} mt-0.5 flex-shrink-0`} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-slate-800">{c.label}</div>
                      <div className="text-[11.5px] text-slate-600">{c.desc}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
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
                  <LoadingState label={c.label} />
                ) : state.error ? (
                  <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {state.error}
                  </div>
                ) : state.answer ? (
                  <div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                      <MiniMarkdown text={state.answer} />
                    </div>

                    {state.references?.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[11px] text-slate-400 mb-1.5 uppercase tracking-wide">参考来源</div>
                        <ul className="space-y-1">
                          {state.references.map((r, i) => (
                            <li key={i}>
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[12px] text-blue-600 hover:underline inline-flex items-center gap-1 break-all"
                              >
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                {r.title || r.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {state.generatedAt && (
                      <div className="mt-3 text-[11px] text-slate-400">
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
    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin text-violet-500 mb-3" />
      <div className="text-sm">AI 正在为你检索 {label}…</div>
      <div className="text-[11px] text-slate-400 mt-1">通常 5-15 秒</div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
      <Sparkles className="w-6 h-6 text-slate-300 mb-2" />
      <div className="text-sm">{text}</div>
    </div>
  );
}