import React from "react";
import { motion } from "framer-motion";
import { MapPin, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

/**
 * 地理情境感知卡片 - 基于 SavedLocation + 真实任务
 */
export default function GeoAwarenessCard({ data, onSnooze }) {
  const navigate = useNavigate();
  if (!data) return null;

  const eventLabel = data.event === 'enter'
    ? `进入${data.location_name}附近`
    : `离开${data.location_name}附近`;

  const priorityDot = (p) => {
    if (p === 'urgent') return 'bg-red-500';
    if (p === 'high') return 'bg-red-500';
    if (p === 'medium') return 'bg-amber-500';
    return 'bg-green-500';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-blue-200 bg-white overflow-hidden shadow-sm"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">地理情境感知</h3>
            <p className="text-xs text-slate-500 mt-0.5">{eventLabel} · 刚刚</p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs rounded-full font-medium whitespace-nowrap">
          高优先级
        </span>
      </div>

      {/* Content */}
      <div className="mx-4 mb-4 p-4 bg-blue-50/60 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Pin className="w-4 h-4 text-red-500" />
          <h4 className="font-semibold text-slate-800 text-sm">
            您已到达{data.location_name}附近（{data.distance}米）
          </h4>
        </div>
        <div className="text-xs text-slate-500 mb-2">今日待办：</div>
        <ul className="space-y-2">
          {data.tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${priorityDot(t.priority)} mt-1.5 flex-shrink-0`} />
              <div className="flex-1">
                <span className="text-slate-700">
                  {t.time && (
                    <span className="text-slate-500 mr-1">
                      {format(parseISO(t.time), 'HH:mm', { locale: zhCN })}
                    </span>
                  )}
                  {t.title}
                </span>
                {t.overdue && (
                  <span className="ml-1 text-red-500 text-xs">（已超时）</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 pb-4">
        <Button
          onClick={() => navigate(`/Tasks?taskId=${data.tasks[0]?.id || ''}`)}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10"
        >
          查看详情
        </Button>
        <Button
          onClick={onSnooze}
          variant="outline"
          className="px-5 border-slate-200 rounded-xl h-10"
        >
          稍后
        </Button>
      </div>
    </motion.div>
  );
}