import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Inbox, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import IntakeItemCard from "./IntakeItemCard";

const SOURCES = [
  { key: "paste", label: "粘贴" },
  { key: "wechat", label: "微信聊天" },
  { key: "email", label: "邮件" },
  { key: "other", label: "其它" },
];

// 转发即执行：把聊天记录 / 邮件 / 任何内容丢进来，
// 心栈自动拆成「机器做的」和「你做的」两部分。
export default function ForwardInbox() {
  const [content, setContent] = useState("");
  const [source, setSource] = useState("paste");
  const [sending, setSending] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    base44.entities.IntakeItem.list("-created_date", 20)
      .then((rows) => setItems(rows || []))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const send = async () => {
    const raw = content.trim();
    if (!raw || sending) return;
    setSending(true);
    try {
      const res = await base44.functions.invoke("intakeForward", { content: raw, source });
      const item = res?.data?.item;
      if (item) setItems((prev) => [item, ...prev]);
      setContent("");
      toast.success("已拆解完成");
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "拆解失败";
      toast.error(msg);
      load();
    } finally {
      setSending(false);
    }
  };

  const removeItem = async (item) => {
    try {
      for (const h of item.human_parts || []) {
        if (h.task_id && !h.adopted) {
          try {
            await base44.entities.Task.delete(h.task_id);
          } catch (_) {
            /* ignore */
          }
        }
      }
      await base44.entities.IntakeItem.delete(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("已清除这条转发");
    } catch (e) {
      toast.error("清除失败");
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-[#384877]/10 text-[#384877] flex items-center justify-center shrink-0">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">转发即执行</h2>
            <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
              把聊天记录、邮件正文或任何一段内容丢进来，心栈自动分出「机器做的」和「你做的」。
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 focus-within:border-[#384877]/50 focus-within:ring-4 focus-within:ring-[#384877]/10 transition-all p-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="粘贴一段聊天记录或邮件内容…"
            className="w-full bg-transparent border-none outline-none resize-none text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400"
          />
          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <div className="flex gap-1.5">
              {SOURCES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSource(s.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    source === s.key
                      ? "bg-[#384877] text-white border-[#384877]"
                      : "bg-white text-slate-500 border-slate-200 hover:text-[#384877]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={send}
              disabled={!content.trim() || sending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#384877] text-white text-xs font-medium hover:bg-[#2f3d66] transition-colors disabled:opacity-40"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sending ? "正在拆解" : "交给心栈"}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
          系统级入口（iOS 快捷指令、分享扩展、邮件转发地址、浏览器划词）都会投递到这同一个收件接口。
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6 px-2">
          <Loader2 className="w-4 h-4 animate-spin" /> 读取收件箱…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">收件箱还是空的，转发第一条内容试试。</div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <IntakeItemCard key={item.id} item={item} onRemove={() => removeItem(item)} />
          ))}
        </div>
      )}
    </div>
  );
}