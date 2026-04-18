import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Brain, Clock, Zap, Target, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTaskOperations } from "@/components/hooks/useTaskOperations";
import ProductTimeline from "@/components/memory/ProductTimeline";
import ProductHeatmap from "@/components/memory/ProductHeatmap";
import ProductInsights from "@/components/memory/ProductInsights";

export default function Memory() {
  const [tab, setTab] = useState("timeline");
  const [search, setSearch] = useState("");

  const { handleComplete } = useTaskOperations();

  // Core product data — no separate MemoryRecord needed
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 300),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["notes"],
    queryFn: () => base44.entities.Note.list("-created_date", 200),
  });

  const { data: behaviors = [] } = useQuery({
    queryKey: ["behaviors"],
    queryFn: () => base44.entities.UserBehavior.list("-created_date", 500),
  });

  const { data: executions = [] } = useQuery({
    queryKey: ["task-executions"],
    queryFn: () => base44.entities.TaskExecution.list("-created_date", 100),
  });

  // Task actions directly from memory timeline
  const onCompleteTask = (task) => {
    if (task) handleComplete(task, tasks, "completed");
  };
  const onReopenTask = (task) => {
    if (task) handleComplete(task, tasks, "pending");
  };

  // Search filter for timeline
  const filteredTasks = search
    ? tasks.filter(t => (t.title || "").toLowerCase().includes(search.toLowerCase()) || (t.description || "").toLowerCase().includes(search.toLowerCase()))
    : tasks;
  const filteredNotes = search
    ? notes.filter(n => (n.plain_text || n.content || "").toLowerCase().includes(search.toLowerCase()))
    : notes;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
              <Brain className="w-7 h-7 text-[#384877]" />
              记忆进化
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              基于约定·心签·通知的三层记忆系统
            </p>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-100/80 p-1 rounded-xl w-full grid grid-cols-3">
          <TabsTrigger value="timeline" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Clock className="w-4 h-4" /> Lv.1 记录
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Zap className="w-4 h-4" /> Lv.2 规律
          </TabsTrigger>
          <TabsTrigger value="cognition" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Target className="w-4 h-4" /> Lv.3 认知
          </TabsTrigger>
        </TabsList>

        {/* Lv.1 记录层 — 产品行为时间线 */}
        <TabsContent value="timeline" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="搜索约定、心签..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-slate-200"
            />
          </div>
          <ProductTimeline
            tasks={filteredTasks}
            notes={filteredNotes}
            executions={executions}
            onCompleteTask={onCompleteTask}
            onReopenTask={onReopenTask}
          />
        </TabsContent>

        {/* Lv.2 规律层 — 时间偏好分析 */}
        <TabsContent value="heatmap">
          <ProductHeatmap tasks={tasks} notes={notes} behaviors={behaviors} />
        </TabsContent>

        {/* Lv.3 认知层 — 深度洞察 + 联动约定 */}
        <TabsContent value="cognition">
          <ProductInsights tasks={tasks} notes={notes} behaviors={behaviors} />
        </TabsContent>
      </Tabs>
    </div>
  );
}