import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { format, isToday, isYesterday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { History, MessageSquare, Plus, Loader2, Search, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isToday(d)) return `今天 ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `昨天 ${format(d, "HH:mm")}`;
  return format(d, "MM-dd HH:mm", { locale: zhCN });
}

// 提取会话预览：取最后一条用户消息的开头
function getPreview(conv) {
  const msgs = conv.messages || [];
  // 倒序找一条用户消息
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === "user" && m.content) {
      const clean = m.content
        .replace(/\[Context Info\][\s\S]*$/, "")
        .replace(/请启动后台推理程序[\s\S]*/, "")
        .trim();
      if (clean) return clean.slice(0, 50);
    }
  }
  // 退而求其次：取最后一条助手消息
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === "assistant" && m.content) {
      return m.content.replace(/<[^>]+>/g, "").trim().slice(0, 50);
    }
  }
  return "（空对话）";
}

function getTitle(conv) {
  if (conv?.metadata?.name && conv.metadata.name !== "约定检查对话") {
    return conv.metadata.name;
  }
  const preview = getPreview(conv);
  return preview.length > 20 ? preview.slice(0, 20) + "..." : preview || "新对话";
}

export default function ConversationHistoryPanel({
  open,
  currentConversationId,
  onSelect,
  onNewConversation,
  onClose,
}) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const list = await base44.agents.listConversations({
          agent_name: "task_assistant",
        });
        if (cancelled) return;
        // 按更新时间倒序
        const sorted = (list || []).slice().sort((a, b) => {
          const ta = new Date(a.updated_date || a.created_date || 0).getTime();
          const tb = new Date(b.updated_date || b.created_date || 0).getTime();
          return tb - ta;
        });
        setConversations(sorted);
      } catch (e) {
        console.error("Failed to load conversations:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const title = getTitle(c).toLowerCase();
    const preview = getPreview(c).toLowerCase();
    return title.includes(q) || preview.includes(q);
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 z-20 bg-white flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] p-3 text-white flex items-center justify-between">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-white/90 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs">返回</span>
            </button>
            <div className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <h3 className="text-sm font-semibold">对话历史</h3>
            </div>
            <button
              onClick={() => {
                onNewConversation && onNewConversation();
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors text-xs"
              title="新对话"
            >
              <Plus className="w-3 h-3" />
              新对话
            </button>
          </div>

          {/* Search */}
          <div className="p-2.5 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索历史对话..."
                className="h-8 pl-8 text-xs border-slate-200"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto bg-[#f9fafb]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                加载中...
              </div>
            ) : filtered.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 px-4 text-center">
                <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">
                  {search ? "没有匹配的历史对话" : "还没有历史对话"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map((conv) => {
                  const isCurrent = conv.id === currentConversationId;
                  const msgCount = (conv.messages || []).filter(
                    (m) =>
                      m.content &&
                      !m.content.includes("请启动后台推理程序") &&
                      !m.content.includes("[Context Info]")
                  ).length;

                  return (
                    <button
                      key={conv.id}
                      onClick={() => onSelect(conv.id)}
                      className={`w-full text-left p-3 hover:bg-white transition-colors group ${
                        isCurrent ? "bg-blue-50/60 hover:bg-blue-50" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                            isCurrent
                              ? "bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <h4
                              className={`text-xs font-semibold truncate ${
                                isCurrent ? "text-[#384877]" : "text-slate-800"
                              }`}
                            >
                              {getTitle(conv)}
                            </h4>
                            <span className="text-[10px] text-slate-400 flex-shrink-0">
                              {formatTime(conv.updated_date || conv.created_date)}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 line-clamp-2 leading-snug">
                            {getPreview(conv)}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[9px] text-slate-400">
                              {msgCount} 条消息
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#384877] text-white font-medium">
                                当前
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}