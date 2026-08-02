import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Circle, Send, CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { downloadTaskIcs } from "@/lib/ics";

const guestKey = () => {
  let k = localStorage.getItem("soul_guest_key");
  if (!k) {
    k = `g_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("soul_guest_key", k);
  }
  return k;
};

// 未注册的被分享者也能参与：勾选子约定、留言、把约定时间加进自己的日历
export default function GuestParticipationPanel({ token, task, subtasks, viewer, onChanged }) {
  const [name, setName] = useState(viewer?.full_name || localStorage.getItem("soul_guest_name") || "");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");

  const requireName = () => {
    const n = name.trim();
    if (!n) { toast.error("先留个称呼吧，让对方知道是你"); return null; }
    localStorage.setItem("soul_guest_name", n);
    return n;
  };

  const post = async (payload, key) => {
    const actorName = requireName();
    if (!actorName) return;
    setBusy(key);
    try {
      await base44.functions.invoke("postCollaborationActivity", {
        token, actor_name: actorName, guest_key: guestKey(), ...payload,
      });
      if (onChanged) await onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.error || "操作失败，请稍后重试");
    } finally {
      setBusy("");
    }
  };

  const toggleSubtask = (s) =>
    post({ activity_type: s.status === "completed" ? "subtask_uncheck" : "subtask_check", subtask_id: s.id }, s.id);

  const sendComment = async () => {
    if (!comment.trim()) { toast.error("说点什么再发送吧"); return; }
    await post({ activity_type: "comment", content: comment.trim() }, "comment");
    setComment("");
    toast.success("留言已发送给对方");
  };

  const subscribeReminder = async () => {
    downloadTaskIcs(task);
    await post({ activity_type: "reminder_subscribe" }, "reminder");
    toast.success("已生成日历提醒文件，打开即可加入你的日历");
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-800 mb-1">参与这个约定</p>
        <p className="text-xs text-slate-500">不用注册也可以勾选进度、留言，对方会立即收到。</p>
      </div>

      <Input
        placeholder="你的称呼，例如：小林"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-10"
      />

      {subtasks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-500">勾选你已完成的部分</p>
          {subtasks.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleSubtask(s)}
              disabled={!!busy}
              className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              {busy === s.id
                ? <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                : s.status === "completed"
                  ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
              <span className={`text-sm ${s.status === "completed" ? "line-through text-slate-400" : "text-slate-700"}`}>
                {s.title}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          placeholder="留言给发起人，例如：这个时间我可以，到时见！"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-[64px] text-sm"
        />
        <div className="flex gap-2">
          <Button onClick={sendComment} disabled={busy === "comment"} className="flex-1 gap-2 bg-[#384877] text-white">
            {busy === "comment" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            发送留言
          </Button>
          {task.reminder_time && (
            <Button variant="outline" onClick={subscribeReminder} disabled={busy === "reminder"} className="gap-2">
              <CalendarPlus className="w-4 h-4" />
              同时提醒我
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}