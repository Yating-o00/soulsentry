import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, CheckCircle2, BellRing, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { parseServerDate } from "@/lib/serverTime";

const ICONS = {
  comment: {
    Icon: MessageSquare,
    color: "text-[#384877]",
    box: "bg-[#eef2fb] border-[#c9d6f0]",
    text: "text-[#2b3a63]",
    badge: "bg-[#dbe4f7] text-[#2b3a63]",
    label: "留言",
  },
  subtask_check: {
    Icon: CheckCircle2,
    color: "text-emerald-600",
    box: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800",
    badge: "bg-emerald-100 text-emerald-700",
    label: "完成子项",
  },
  subtask_uncheck: {
    Icon: RotateCcw,
    color: "text-amber-600",
    box: "bg-amber-50 border-amber-200",
    text: "text-amber-800",
    badge: "bg-amber-100 text-amber-700",
    label: "撤销子项",
  },
  reminder_subscribe: {
    Icon: BellRing,
    color: "text-orange-500",
    box: "bg-orange-50 border-orange-200",
    text: "text-orange-800",
    badge: "bg-orange-100 text-orange-700",
    label: "订阅提醒",
  },
  note_edit: {
    Icon: MessageSquare,
    color: "text-violet-600",
    box: "bg-violet-50 border-violet-200",
    text: "text-violet-800",
    badge: "bg-violet-100 text-violet-700",
    label: "修改内容",
  },
};

// 被分享者身份标识：注册用户取用户 ID 尾号，未注册访客取本地标识尾号
const actorTag = (a) => {
  if (a.actor_id) return `ID·${String(a.actor_id).slice(-6)}`;
  if (a.guest_key) return `访客·${String(a.guest_key).slice(-6)}`;
  return "访客";
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
        const cfg = ICONS[a.activity_type] || ICONS.comment;
        const { Icon, color } = cfg;
        return (
          <div key={a.id} className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 ${cfg.box}`}>
            <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span className={`text-xs font-semibold ${cfg.text}`}>{a.actor_name || "伙伴"}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${cfg.badge}`}>{actorTag(a)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${cfg.badge}`}>{cfg.label}</span>
              </div>
              <p className={`text-xs leading-snug ${cfg.text}`}>
                {describe(a)}
              </p>
              <p className="text-[10px] text-[#9aa5b5] mt-0.5">
                {formatDistanceToNow(parseServerDate(a.created_date), { addSuffix: true, locale: zhCN })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}