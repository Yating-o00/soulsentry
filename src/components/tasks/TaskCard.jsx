import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { 
  Clock, 
  AlertCircle, 
  Repeat, 
  Trash2, 
  Edit,
  Briefcase,
  User,
  Heart,
  GraduationCap,
  Users,
  ShoppingCart,
  Wallet,
  MoreHorizontal,
  Bell,
  Volume2,
  TimerReset
} from "lucide-react";
import { motion } from "framer-motion";

const CATEGORY_ICONS = {
  work: Briefcase,
  personal: User,
  health: Heart,
  study: GraduationCap,
  family: Users,
  shopping: ShoppingCart,
  finance: Wallet,
  other: MoreHorizontal,
};

const CATEGORY_COLORS = {
  work: "bg-blue-100 text-blue-700 border-blue-200",
  personal: "bg-purple-100 text-purple-700 border-purple-200",
  health: "bg-green-100 text-green-700 border-green-200",
  study: "bg-yellow-100 text-yellow-700 border-yellow-200",
  family: "bg-pink-100 text-pink-700 border-pink-200",
  shopping: "bg-orange-100 text-orange-700 border-orange-200",
  finance: "bg-red-100 text-red-700 border-red-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const PRIORITY_COLORS = {
  low: "text-slate-500",
  medium: "text-blue-500",
  high: "text-orange-500",
  urgent: "text-red-500",
};

const PRIORITY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

export default function TaskCard({ task, onComplete, onDelete, onEdit }) {
  const CategoryIcon = CATEGORY_ICONS[task.category] || MoreHorizontal;
  const isCompleted = task.status === "completed";
  const isSnoozed = task.status === "snoozed";
  const isPast = new Date(task.reminder_time) < new Date() && !isCompleted && !isSnoozed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      layout
    >
      <Card className={`group p-5 border-0 shadow-lg hover:shadow-xl transition-all duration-300 ${
        isCompleted 
          ? 'bg-slate-50/50 opacity-70' 
          : isSnoozed
          ? 'bg-yellow-50/50 border-l-4 border-l-yellow-400'
          : isPast 
          ? 'bg-red-50/50 border-l-4 border-l-red-400' 
          : 'bg-white hover:scale-[1.02]'
      }`}>
        <div className="flex items-start gap-4">
          <Checkbox
            checked={isCompleted}
            onCheckedChange={onComplete}
            className="mt-1 h-5 w-5 rounded-lg data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-green-500 data-[state=checked]:to-emerald-500"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className={`text-lg font-semibold ${
                isCompleted ? 'line-through text-slate-400' : 'text-slate-800'
              }`}>
                {task.title}
              </h3>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onEdit}
                  className="h-8 w-8 hover:bg-blue-100 hover:text-blue-600 rounded-lg"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onDelete}
                  className="h-8 w-8 hover:bg-red-100 hover:text-red-600 rounded-lg"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {task.description && (
              <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                {task.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Badge 
                variant="outline" 
                className={`${CATEGORY_COLORS[task.category]} border rounded-lg`}
              >
                <CategoryIcon className="w-3 h-3 mr-1" />
                {task.category}
              </Badge>

              <Badge 
                variant="outline"
                className="rounded-lg"
              >
                <Clock className={`w-3 h-3 mr-1 ${PRIORITY_COLORS[task.priority]}`} />
                {format(new Date(isSnoozed ? task.snooze_until : task.reminder_time), "M月d日 HH:mm", { locale: zhCN })}
              </Badge>

              {task.repeat_rule !== "none" && (
                <Badge variant="outline" className="rounded-lg">
                  <Repeat className="w-3 h-3 mr-1 text-purple-500" />
                  {task.repeat_rule === "daily" ? "每天" : 
                   task.repeat_rule === "weekly" ? "每周" : "每月"}
                </Badge>
              )}

              <Badge 
                variant="outline"
                className={`${PRIORITY_COLORS[task.priority]} border-current rounded-lg`}
              >
                <AlertCircle className="w-3 h-3 mr-1" />
                {PRIORITY_LABELS[task.priority]}
              </Badge>

              {task.persistent_reminder && (
                <Badge className="bg-purple-500 text-white rounded-lg">
                  <Bell className="w-3 h-3 mr-1" />
                  持续提醒
                </Badge>
              )}

              {task.advance_reminders && task.advance_reminders.length > 0 && (
                <Badge variant="outline" className="rounded-lg text-blue-600 border-blue-300">
                  <Volume2 className="w-3 h-3 mr-1" />
                  提前{task.advance_reminders.length}次
                </Badge>
              )}

              {isSnoozed && (
                <Badge className="bg-yellow-500 text-white rounded-lg">
                  <TimerReset className="w-3 h-3 mr-1" />
                  已推迟 {task.snooze_count}次
                </Badge>
              )}

              {isPast && !isCompleted && !isSnoozed && (
                <Badge className="bg-red-500 text-white rounded-lg">
                  已过期
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}