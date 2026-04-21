import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Brain, Clock, Zap, Target, Search, ArrowRight, TrendingUp, StickyNote, ListTodo, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import ProductTimeline from "@/components/memory/ProductTimeline";
import ProductHeatmap from "@/components/memory/ProductHeatmap";

export default function Memory() {
  const [tab, setTab] = useState("timeline");

  // All real product data — no standalone MemoryRecord
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
    initialData: [],
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications-memory"],
    queryFn: () => base44.entities.Notification.list("-created_date", 100),
    initialData: [],
  });

  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships-memory"],
    queryFn: () => base44.entities.Relationship.list("-created_date", 50),
    initialData: [],
  });

  const { data: teamUsers = [] } = useQuery({
    queryKey: ["team-users-memory"],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["comments-memory"],
    queryFn: () => base44.entities.Comment.list("-created_date", 200),
    initialData: [],
  });

  // Quick stats from real data
  const stats = useMemo(() => {
    const activeTasks = tasks.filter(t => !t.deleted_at);
    const activeNotes = notes.filter(n => !n.deleted_at);
    const now = new Date();
    const last7d = activeTasks.filter(t => {
      const d = new Date(t.created_date);
      return (now - d) / (1000 * 60 * 60 * 24) <= 7;
    });
    const completedLast7 = last7d.filter(t => t.status === "completed");
    return {
      totalTasks: activeTasks.length,
      totalNotes: activeNotes.length,
      weekActivity: last7d.length,
      weekCompleted: completedLast7.length,
    };
  }, [tasks, notes]);

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto pb-24">
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
            <p className="text-sm text-slate-500 mt-1">
              从你的约定、心签、通知中自动学习与进化
            </p>
          </div>
        </div>

        {/* Data source cards */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <Link to="/Dashboard" className="bg-white rounded-xl p-2.5 border border-slate-100 text-center hover:shadow-sm transition-shadow group">
            <ListTodo className="w-4 h-4 text-[#384877] mx-auto mb-1 group-hover:scale-110 transition-transform" />
            <div className="text-lg font-bold text-[#384877]">{stats.totalTasks}</div>
            <div className="text-[10px] text-slate-400">约定</div>
          </Link>
          <Link to="/Notes" className="bg-white rounded-xl p-2.5 border border-slate-100 text-center hover:shadow-sm transition-shadow group">
            <StickyNote className="w-4 h-4 text-amber-500 mx-auto mb-1 group-hover:scale-110 transition-transform" />
            <div className="text-lg font-bold text-amber-600">{stats.totalNotes}</div>
            <div className="text-[10px] text-slate-400">心签</div>
          </Link>
          <div className="bg-white rounded-xl p-2.5 border border-slate-100 text-center">
            <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <div className="text-lg font-bold text-emerald-600">{stats.weekActivity}</div>
            <div className="text-[10px] text-slate-400">本周活动</div>
          </div>
          <div className="bg-white rounded-xl p-2.5 border border-slate-100 text-center">
            <Target className="w-4 h-4 text-purple-500 mx-auto mb-1" />
            <div className="text-lg font-bold text-purple-600">{stats.weekCompleted}</div>
            <div className="text-[10px] text-slate-400">本周完成</div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-100/80 p-1 rounded-xl w-full grid grid-cols-2">
          <TabsTrigger value="timeline" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Clock className="w-4 h-4" /> 活动流
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="rounded-lg text-xs md:text-sm gap-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Zap className="w-4 h-4" /> 时间偏好
          </TabsTrigger>
        </TabsList>

        {/* Timeline — from real product data */}
        <TabsContent value="timeline" className="space-y-4">
          <ProductTimeline tasks={tasks} notes={notes} executions={executions} relationships={relationships} teamUsers={teamUsers} comments={comments} />
        </TabsContent>

        {/* Heatmap — from real product data */}
        <TabsContent value="heatmap">
          <ProductHeatmap tasks={tasks} notes={notes} behaviors={behaviors} />
        </TabsContent>
      </Tabs>
    </div>
  );
}