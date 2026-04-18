import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Brain, Clock, Users, Zap, Plus, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import MemoryTimelineCard from "@/components/memory/MemoryTimelineCard";
import RelationshipNetwork from "@/components/memory/RelationshipNetwork";
import TimeHeatmap from "@/components/memory/TimeHeatmap";
import CognitionInsights from "@/components/memory/CognitionInsights";
import AddMemoryDialog from "@/components/memory/AddMemoryDialog";

export default function Memory() {
  const [tab, setTab] = useState("timeline");
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: memories = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: () => base44.entities.MemoryRecord.list("-event_date", 100),
  });

  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships"],
    queryFn: () => base44.entities.Relationship.list("-closeness", 50),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 200),
  });

  const { data: behaviors = [] } = useQuery({
    queryKey: ["behaviors"],
    queryFn: () => base44.entities.UserBehavior.list("-created_date", 500),
  });

  // Filter memories
  const filteredMemories = memories.filter(m => {
    if (typeFilter !== "all" && m.memory_type !== typeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (m.title || "").toLowerCase().includes(s) ||
        (m.content || "").toLowerCase().includes(s) ||
        m.people?.some(p => (p.name || "").toLowerCase().includes(s)) ||
        m.tags?.some(t => t.toLowerCase().includes(s));
    }
    return true;
  });

  const TYPES = [
    { value: "all", label: "全部" },
    { value: "work", label: "工作" },
    { value: "social", label: "人际" },
    { value: "personal", label: "个人" },
    { value: "health", label: "健康" },
    { value: "family", label: "家庭" },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto">
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
              三层架构 · 记录层 · 关系层 · 认知层
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="bg-[#384877] hover:bg-[#2c3a63] rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> 新记忆
          </Button>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-100/80 p-1 rounded-xl w-full grid grid-cols-4">
          <TabsTrigger value="timeline" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Clock className="w-4 h-4" /> 时间线
          </TabsTrigger>
          <TabsTrigger value="relationships" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Users className="w-4 h-4" /> 关系网
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Zap className="w-4 h-4" /> 时间偏好
          </TabsTrigger>
          <TabsTrigger value="cognition" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Brain className="w-4 h-4" /> 认知层
          </TabsTrigger>
        </TabsList>

        {/* Timeline */}
        <TabsContent value="timeline" className="space-y-4">
          {/* Search & filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="搜索记忆..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 rounded-xl border-slate-200"
              />
            </div>
          </div>

          {/* Type filter chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  typeFilter === t.value
                    ? "bg-[#384877] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Timeline */}
          <div className="pl-1">
            {filteredMemories.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Brain className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>暂无记忆记录</p>
                <p className="text-sm mt-1">点击右上角"新记忆"开始积累</p>
              </div>
            ) : (
              filteredMemories.map((memory, idx) => (
                <MemoryTimelineCard
                  key={memory.id}
                  memory={memory}
                  isLast={idx === filteredMemories.length - 1}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* Relationships */}
        <TabsContent value="relationships">
          <RelationshipNetwork relationships={relationships} />
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

        {/* Cognition */}
        <TabsContent value="cognition">
          <CognitionInsights tasks={tasks} memories={memories} behaviors={behaviors} />
        </TabsContent>
      </Tabs>

      <AddMemoryDialog open={addOpen} onOpenChange={setAddOpen} relationships={relationships} />
    </div>
  );
}