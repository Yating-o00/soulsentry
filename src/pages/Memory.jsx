import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Brain, Clock, Users, Zap, Search, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";

import ProductActivityFeed from "@/components/memory/ProductActivityFeed";
import RelationshipNetwork from "@/components/memory/RelationshipNetwork";
import TimeHeatmap from "@/components/memory/TimeHeatmap";
import PatternInsights from "@/components/memory/PatternInsights";

export default function Memory() {
  const [tab, setTab] = useState("timeline");
  const [search, setSearch] = useState("");

  // Core product data — no separate MemoryRecord needed
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 200),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["notes"],
    queryFn: () => base44.entities.Note.list("-created_date", 100),
  });

  const { data: executions = [] } = useQuery({
    queryKey: ["task-executions"],
    queryFn: () => base44.entities.TaskExecution.list("-created_date", 100),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications-memory"],
    queryFn: () => base44.entities.Notification.list("-created_date", 50),
  });

  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships"],
    queryFn: () => base44.entities.Relationship.list("-closeness", 50),
  });

  const { data: behaviors = [] } = useQuery({
    queryKey: ["behaviors"],
    queryFn: () => base44.entities.UserBehavior.list("-created_date", 500),
  });

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
              从约定 · 心签 · 通知中自动提取行为模式与认知洞察
            </p>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-100/80 p-1 rounded-xl w-full grid grid-cols-4">
          <TabsTrigger value="timeline" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Clock className="w-4 h-4" /> 活动流
          </TabsTrigger>
          <TabsTrigger value="patterns" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <TrendingUp className="w-4 h-4" /> 洞察
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Zap className="w-4 h-4" /> 时间偏好
          </TabsTrigger>
          <TabsTrigger value="relationships" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Users className="w-4 h-4" /> 关系网
          </TabsTrigger>
        </TabsList>

        {/* Activity Feed — aggregated from Tasks, Notes, Executions, Notifications */}
        <TabsContent value="timeline" className="space-y-4">
          <ProductActivityFeed
            tasks={tasks}
            notes={notes}
            executions={executions}
            notifications={notifications}
          />
        </TabsContent>

        {/* Patterns & Planning — deep integration with tasks and planner */}
        <TabsContent value="patterns">
          <PatternInsights
            tasks={tasks}
            notes={notes}
            executions={executions}
            behaviors={behaviors}
          />
        </TabsContent>

        {/* Heatmap */}
        <TabsContent value="heatmap">
          <div className="bg-white rounded-2xl p-4 md:p-6 border border-slate-100 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#384877]" />
              时间偏好热力图
            </h3>
            <TimeHeatmap tasks={tasks} behaviors={behaviors} />
          </div>
        </TabsContent>

        {/* Relationships */}
        <TabsContent value="relationships">
          <RelationshipNetwork relationships={relationships} />
        </TabsContent>
      </Tabs>
    </div>
  );
}