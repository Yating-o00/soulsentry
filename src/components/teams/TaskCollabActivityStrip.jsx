import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, CheckCircle2, BellRing, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

const ICONS = {
  comment: { Icon: MessageSquare, color: "text-[#384877]" },
  subtask_check: { Icon: CheckCircle2, color: "text-emerald-600" },
  subtask_uncheck: { Icon: RotateCcw, color: "text-amber-600" },
  reminder_subscribe: { Icon: BellRing, color: "text-amber-500" },
  note_edit: { Icon: MessageSquare, color: "text-violet-600" },
};

const describe = (a) => {
  if (a.activity_type === "comment") return `留言：${a.content}`;
  if (a.activity_type === "subtask_check") return `勾选完成了「${a.subtask_title}」`;
  if (a.activity_type === "subtask_uncheck") return `取消了「${a.subtask_title}」的完成`;
  if (a.activity_type === "reminder_subscribe") return "订阅了这个约定的时间提醒";
  return a.content || "参与了这个约定";
};

// 约定卡片下方：被分享者（含未注册访客）的最新参与动态
export default function TaskCollabActivityStrip({ taskId }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await base44.functions.invoke("getTaskCollaborationFeed", { task_id: taskId });
      const list = res?.data?.activities || res?.activities || [];
      if (!cancelled) setItems(list.slice(0, 3));
    };
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [taskId]);

  if (items.length === 0) return null;

  return (
    <div className="mt-2 rounded-2xl border border-[#e6ebf2] bg-[#f8fafc] px-4 py-3 space-y-2">
      <p className="text-[11px] font-semibold text-[#7a869a]">伙伴动态</p>
      {items.map((a) => {
        const { Icon, color } = ICONS[a.activity_type] || ICONS.comment;
        return (
          <div key={a.id} className="flex items-start gap-2">
            <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} />
            <div className="min-w-0">
              <p className="text-xs text-[#33415c] leading-snug">
                <span className="font-medium">{a.actor_name}</span> {describe(a)}
              </p>
              <p className="text-[10px] text-[#9aa5b5]">
                {formatDistanceToNow(new Date(a.created_date), { addSuffix: true, locale: zhCN })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}