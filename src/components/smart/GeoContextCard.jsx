import React from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const dotColor = (p) => {
  if (p === 'urgent' || p === 'high') return 'bg-red-500';
  if (p === 'medium') return 'bg-amber-500';
  return 'bg-blue-500';
};

export default function GeoContextCard({ card, onSnooze }) {
  const navigate = useNavigate();
  if (!card) return null;

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-900">{card.title}</div>
            <div className="text-xs text-slate-500 mt-0.5">{card.subtitle}</div>
          </div>
        </div>
        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
          {card.priority === 'high' ? '高优先级' : '情境感知'}
        </span>
      </div>

      <div className="rounded-xl bg-blue-50/60 p-4 mb-4">
        <div className="text-sm font-semibold text-slate-900 mb-2">{card.headline}</div>
        {card.today_tasks?.length > 0 && (
          <>
            <div className="text-xs text-slate-500 mb-2">今日待办：</div>
            <ul className="space-y-1.5">
              {card.today_tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor(t.priority)}`} />
                  <span>
                    {t.time && <span className="font-medium">{t.time} </span>}
                    {t.title}
                    {t.overdue_days > 0 && (
                      <span className="text-xs text-amber-600 ml-1">（已超时{t.overdue_days}天）</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {(!card.today_tasks || card.today_tasks.length === 0) && (
          <div className="text-xs text-slate-500">今日此地点暂无相关待办，放松一下 ☕</div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1 bg-blue-600 hover:bg-blue-700"
          onClick={() => navigate(card.cta_link || '/Tasks')}
        >
          查看详情
        </Button>
        <Button variant="outline" onClick={onSnooze}>稍后</Button>
      </div>
    </div>
  );
}