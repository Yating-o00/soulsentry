import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Brain, Clock, Zap, Target, ArrowRight, Sparkles } from "lucide-react";
import ProductTimeline from "@/components/memory/ProductTimeline";
import ProductHeatmap from "@/components/memory/ProductHeatmap";
import ProductInsights from "@/components/memory/ProductInsights";

export default function Memory() {
  const [tab, setTab] = useState("insights");

  // All data comes from product entities — no separate MemoryRecord needed
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 500),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["notes"],
    queryFn: () => base44.entities.Note.list("-created_date", 200),
  });

  const { data: executions = [] } = useQuery({
    queryKey: ["task-executions"],
    queryFn: () => base44.entities.TaskExecution.list("-created_date", 200),
  });

  const { data: behaviors = [] } = useQuery({
    queryKey: ["behaviors"],
    queryFn: () => base44.entities.UserBehavior.list("-created_date", 500),
  });

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
              <Brain className="w-7 h-7 text-[#384877]" />
              记忆进化
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              自动汇聚约定·心签·通知数据，AI 驱动认知升级
            </p>
          </div>
          <Link
            to="/Dashboard"
            className="hidden md:flex items-center gap-1.5 px-4 py-2 bg-[#384877] hover:bg-[#2c3a63] text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" /> 去规划
          </Link>
        </div>

        {/* Quick action cards */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Link to="/Tasks" className="bg-white rounded-xl p-3 border border-slate-100 hover:border-[#384877]/30 hover:shadow-sm transition-all group">
            <div className="text-lg font-bold text-[#384877]">
              {tasks.filter(t => !t.deleted_at && t.status === "pending").length}
            </div>
            <div className="text-[10px] text-slate-400 group-hover:text-[#384877] transition-colors flex items-center gap-0.5">
              待办约定 <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>
          <Link to="/Notes" className="bg-white rounded-xl p-3 border border-slate-100 hover:border-amber-300/50 hover:shadow-sm transition-all group">
            <div className="text-lg font-bold text-amber-600">
              {notes.filter(n => !n.deleted_at).length}
            </div>
            <div className="text-[10px] text-slate-400 group-hover:text-amber-600 transition-colors flex items-center gap-0.5">
              心签积累 <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>
          <Link to="/Notifications" className="bg-white rounded-xl p-3 border border-slate-100 hover:border-purple-300/50 hover:shadow-sm transition-all group">
            <div className="text-lg font-bold text-purple-600">
              {executions.filter(e => e.execution_status === "completed").length}
            </div>
            <div className="text-[10px] text-slate-400 group-hover:text-purple-600 transition-colors flex items-center gap-0.5">
              AI执行 <ArrowRight className="w-2.5 h-2.5" />
            </div>
          </Link>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-100/80 p-1 rounded-xl w-full grid grid-cols-3">
          <TabsTrigger value="insights" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Target className="w-4 h-4" /> 认知洞察
          </TabsTrigger>
          <TabsTrigger value="timeline" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Clock className="w-4 h-4" /> 活动流
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Zap className="w-4 h-4" /> 时间偏好
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights">
          <ProductInsights
            tasks={tasks}
            notes={notes}
            behaviors={behaviors}
            executions={executions}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <ProductTimeline
            tasks={tasks}
            notes={notes}
            executions={executions}
          />
        </TabsContent>

        <TabsContent value="heatmap">
          <ProductHeatmap
            tasks={tasks}
            notes={notes}
            behaviors={behaviors}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}