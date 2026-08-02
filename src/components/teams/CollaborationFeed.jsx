import React from "react";
import { MessageSquare, CheckCircle2, BellRing, UserPlus, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

const ICONS = {
  comment: { icon: MessageSquare, color: "text-[#384877]" },
  subtask_check: { icon: CheckCircle2, color: "text-green-600" },
  subtask_uncheck: { icon: RotateCcw, color: "text-slate-400" },
  reminder_subscribe: { icon: BellRing, color: "text-amber-500" },
  join: { icon: UserPlus, color: "text-[#0A7EA4]" },
};

const describe = (a) => {
  if (a.activity_type === "comment") return a.content;
  if (a.activity_type === "subtask_check") return `完成了「${a.subtask_title}」`;
  if (a.activity_type === "subtask_uncheck") return `取消完成「${a.subtask_title}」`;
  if (a.activity_type === "reminder_subscribe") return "订阅了这个约定的时间提醒";
  return "加入了协作";
};

// 协作动态流：分享者与被分享者都能看到的参与记录
export default function CollaborationFeed({ activities = [], emptyText = "还没有人参与，快把链接分享出去吧" }) {
  if (activities.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-4">{emptyText}</p>;
  }

  return (
    <div className="space-y-2.5">
      {activities.map((a) => {
        const conf = ICONS[a.activity_type] || ICONS.comment;
        const Icon = conf.icon;
        return (
          <div key={a.id} className="flex items-start gap-2.5">
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${conf.color}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-700 leading-snug">
                <span className="font-semibold">{a.actor_name}</span>{" "}
                <span className="text-slate-600">{describe(a)}</span>
              </p>
              {a.created_date && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {formatDistanceToNow(new Date(a.created_date), { addSuffix: true, locale: zhCN })}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}