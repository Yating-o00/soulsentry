import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, Repeat, X } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

const DAYS_OF_WEEK = [
  { value: 0, label: "周日", short: "日" },
  { value: 1, label: "周一", short: "一" },
  { value: 2, label: "周二", short: "二" },
  { value: 3, label: "周三", short: "三" },
  { value: 4, label: "周四", short: "四" },
  { value: 5, label: "周五", short: "五" },
  { value: 6, label: "周六", short: "六" },
];

export default function RecurrenceEditor({ value, onChange, onClose }) {
  const [recurrence, setRecurrence] = useState(value || {
    frequency: "weekly",
    interval: 1,
    days_of_week: [],
    days_of_month: [],
    end_date: null,
  });

  const handleUpdate = (updates) => {
    const updated = { ...recurrence, ...updates };
    setRecurrence(updated);
  };

  const handleSave = () => {
    onChange(recurrence);
    onClose?.();
  };

  const toggleDayOfWeek = (day) => {
    const current = recurrence.days_of_week || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort();
    handleUpdate({ days_of_week: updated });
  };

  const toggleDayOfMonth = (day) => {
    const current = recurrence.days_of_month || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b);
    handleUpdate({ days_of_month: updated });
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-purple-50">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Repeat className="w-5 h-5 text-purple-500" />
          自定义重复规则
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
          <Label>重复频率</Label>
          <div className="flex gap-3">
            <Select
              value={recurrence.frequency}
              onValueChange={(value) => handleUpdate({ frequency: value })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">每天</SelectItem>
                <SelectItem value="weekly">每周</SelectItem>
                <SelectItem value="monthly">每月</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">每</span>
              <Input
                type="number"
                min="1"
                max="365"
                value={recurrence.interval}
                onChange={(e) => handleUpdate({ interval: parseInt(e.target.value) || 1 })}
                className="w-20 text-center"
              />
              <span className="text-sm text-slate-600">
                {recurrence.frequency === "daily" && "天"}
                {recurrence.frequency === "weekly" && "周"}
                {recurrence.frequency === "monthly" && "月"}
              </span>
            </div>
          </div>
        </div>

        {recurrence.frequency === "weekly" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-2"
          >
            <Label>重复日期（星期）</Label>
            <div className="grid grid-cols-7 gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <Button
                  key={day.value}
                  variant={recurrence.days_of_week?.includes(day.value) ? "default" : "outline"}
                  onClick={() => toggleDayOfWeek(day.value)}
                  className={`h-12 ${
                    recurrence.days_of_week?.includes(day.value)
                      ? "bg-gradient-to-r from-blue-500 to-purple-600"
                      : ""
                  }`}
                >
                  {day.short}
                </Button>
              ))}
            </div>
            {recurrence.days_of_week?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {recurrence.days_of_week.map((day) => {
                  const dayInfo = DAYS_OF_WEEK.find(d => d.value === day);
                  return (
                    <Badge key={day} className="bg-purple-100 text-purple-700">
                      {dayInfo?.label}
                    </Badge>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {recurrence.frequency === "monthly" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-2"
          >
            <Label>重复日期（每月）</Label>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <Button
                  key={day}
                  variant={recurrence.days_of_month?.includes(day) ? "default" : "outline"}
                  onClick={() => toggleDayOfMonth(day)}
                  className={`h-10 ${
                    recurrence.days_of_month?.includes(day)
                      ? "bg-gradient-to-r from-blue-500 to-purple-600"
                      : ""
                  }`}
                  size="sm"
                >
                  {day}
                </Button>
              ))}
            </div>
            {recurrence.days_of_month?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {recurrence.days_of_month.map((day) => (
                  <Badge key={day} className="bg-purple-100 text-purple-700">
                    每月{day}日
                  </Badge>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <div className="space-y-2">
          <Label>结束日期（可选）</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {recurrence.end_date ? (
                  format(new Date(recurrence.end_date), "PPP", { locale: zhCN })
                ) : (
                  <span className="text-slate-500">选择结束日期</span>
                )}
                {recurrence.end_date && (
                  <X
                    className="ml-auto h-4 w-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdate({ end_date: null });
                    }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={recurrence.end_date ? new Date(recurrence.end_date) : undefined}
                onSelect={(date) => handleUpdate({ end_date: date ? format(date, "yyyy-MM-dd") : null })}
                locale={zhCN}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>规则预览：</strong> 
            {" "}每{recurrence.interval > 1 ? recurrence.interval : ""}
            {recurrence.frequency === "daily" && "天"}
            {recurrence.frequency === "weekly" && "周"}
            {recurrence.frequency === "monthly" && "月"}
            {recurrence.frequency === "weekly" && recurrence.days_of_week?.length > 0 && 
              `的${recurrence.days_of_week.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label).join("、")}`
            }
            {recurrence.frequency === "monthly" && recurrence.days_of_month?.length > 0 && 
              `的${recurrence.days_of_month.join("、")}日`
            }
            {recurrence.end_date && ` 直到${format(new Date(recurrence.end_date), "yyyy年M月d日", { locale: zhCN })}`}
          </p>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600"
            disabled={
              (recurrence.frequency === "weekly" && (!recurrence.days_of_week || recurrence.days_of_week.length === 0)) ||
              (recurrence.frequency === "monthly" && (!recurrence.days_of_month || recurrence.days_of_month.length === 0))
            }
          >
            保存规则
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}