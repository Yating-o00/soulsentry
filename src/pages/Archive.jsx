import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, parseISO, startOfDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Archive as ArchiveIcon, Search, RotateCcw, CheckCircle2, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const CATEGORY_LABELS = {
  work: "工作",
  personal: "个人",
  health: "健康",
  study: "学习",
  family: "家庭",
  shopping: "购物",
  finance: "财务",
  other: "其他",
};

const PRIORITY_COLORS = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function ArchivePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: completedTasks = [], isLoading } = useQuery({
    queryKey: ["archived-tasks"],
    queryFn: async () => {
      const tasks = await base44.entities.Task.filter(
        { status: "completed" },
        "-completed_at",
        500
      );
      return (tasks || []).filter((t) => !t.deleted_at);
    },
  });

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return completedTasks.filter((t) => {
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (!kw) return true;
      return (
        (t.title || "").toLowerCase().includes(kw) ||
        (t.description || "").toLowerCase().includes(kw)
      );
    });
  }, [completedTasks, search, categoryFilter]);

  // 按完成日期分组
  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((t) => {
      const when = t.completed_at || t.updated_date;
      if (!when) return;
      const key = format(startOfDay(parseISO(when)), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const handleRestore = async (task) => {
    try {
      await base44.entities.Task.update(task.id, {
        status: "pending",
        completed_at: null,
        progress: 0,
      });
      toast.success("已恢复到待办");
      queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e) {
      toast.error("恢复失败");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
            <ArchiveIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">归档</h1>
            <p className="text-sm text-slate-500 mt-1">
              {completedTasks.length} 个已完成的任务记录
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="搜索已完成的任务..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-slate-200"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-44 border-slate-200">
              <SelectValue placeholder="分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">加载中...</div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">
              {completedTasks.length === 0 ? "还没有已完成的任务" : "没有匹配的记录"}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-600">
                    {format(parseISO(date), "yyyy年M月d日 EEEE", { locale: zhCN })}
                  </h2>
                  <span className="text-xs text-slate-400">· {items.length} 项</span>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {items.map((task) => (
                    <div
                      key={task.id}
                      className="p-4 flex items-start gap-3 hover:bg-slate-50/60 transition-colors group"
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <h3 className="font-medium text-slate-800 line-through decoration-slate-300">
                            {task.title}
                          </h3>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {task.category && (
                              <Badge variant="outline" className="text-xs border-slate-200 text-slate-600">
                                {CATEGORY_LABELS[task.category] || task.category}
                              </Badge>
                            )}
                            {task.priority && task.priority !== "medium" && (
                              <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[task.priority] || ""}`}>
                                {task.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {task.description && (
                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                        {task.completed_at && (
                          <p className="text-xs text-slate-400 mt-1.5">
                            完成于 {format(parseISO(task.completed_at), "HH:mm")}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(task)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-[#384877] flex-shrink-0"
                        title="恢复为待办"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}