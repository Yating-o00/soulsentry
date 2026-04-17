import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Settings, BellRing, Bell, Zap, CheckCircle2, Check, Trash2, ExternalLink, MessageSquare, UserPlus, Info } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import ExecutionStatusCards from "@/components/notifications/ExecutionStatusCards";
import ExecutionItem from "@/components/notifications/ExecutionItem";
import SmartInputBar from "@/components/notifications/SmartInputBar";
import AIExecutionAdvisor from "@/components/notifications/AIExecutionAdvisor";
import { toast } from "sonner";

export default function NotificationsPage() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("executions");
  const [advisorExecution, setAdvisorExecution] = useState(null);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: executions = [], isLoading: loadingExec } = useQuery({
    queryKey: ['task-executions'],
    queryFn: () => base44.entities.TaskExecution.list("-created_date", 50),
    staleTime: 5000,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time', 30),
    initialData: [],
  });

  const { data: allNotes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date', 20),
    initialData: [],
  });

  const { data: notifications = [], isLoading: loadingNotif } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      return base44.entities.Notification.filter({ recipient_id: currentUser.id }, "-created_date", 50);
    },
    enabled: !!currentUser?.id,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { is_read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.is_read);
      for (const n of unread) {
        await base44.entities.Notification.update(n.id, { is_read: true });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const handleRetry = async (execution) => {
    const now = new Date().toISOString();
    const retrySteps = (execution.execution_steps || []).map(s => ({
      ...s, status: "pending", timestamp: null,
    }));
    if (retrySteps.length > 0) {
      retrySteps[0].status = "running";
      retrySteps[0].timestamp = now;
    }
    await base44.entities.TaskExecution.update(execution.id, {
      execution_status: "executing",
      error_message: null,
      execution_steps: retrySteps,
    });
    queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    toast("正在重试执行...", { icon: "🔄" });
  };

  const handleConfirm = async (execution) => {
    const now = new Date().toISOString();
    await base44.entities.TaskExecution.update(execution.id, {
      execution_status: "completed",
      completed_at: now,
      execution_steps: (execution.execution_steps || []).map(s => ({ ...s, status: "completed", timestamp: s.timestamp || now })),
    });
    queryClient.invalidateQueries({ queryKey: ['task-executions'] });
    toast.success("已确认执行");
  };

  const handleDismiss = async (execution) => {
    await base44.entities.TaskExecution.update(execution.id, { execution_status: "cancelled" });
    queryClient.invalidateQueries({ queryKey: ['task-executions'] });
  };

  const filteredExecutions = executions.filter(e => {
    if (activeFilter === "all") return true;
    return e.category === activeFilter;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const getNotifIcon = (type) => {
    switch (type) {
      case 'assignment': return <UserPlus className="w-4 h-4 text-blue-500" />;
      case 'comment': return <MessageSquare className="w-4 h-4 text-green-500" />;
      case 'mention': return <Info className="w-4 h-4 text-purple-500" />;
      case 'reminder': return <Bell className="w-4 h-4 text-orange-500" />;
      default: return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const filters = [
    { key: "all", label: "全部" },
    { key: "promise", label: "约定" },
    { key: "task", label: "任务" },
    { key: "note", label: "心签" },
  ];

  const advisorRelatedTasks = advisorExecution?.task_id
    ? allTasks.filter(t => t.id === advisorExecution.task_id || t.category === allTasks.find(at => at.id === advisorExecution.task_id)?.category)
    : allTasks.slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50/30 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              智能执行控制台
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-medium text-emerald-600">引擎在线</span>
              </div>
            </h1>
            <p className="text-sm text-slate-500">AI智能规划 · 自动执行链路 · 实时决策建议</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={createPageUrl("ReminderSettings")}><BellRing className="w-4 h-4 mr-1.5" />提醒设置</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={createPageUrl("NotificationSettings")}><Settings className="w-4 h-4 mr-1.5" />通知规则</Link>
            </Button>
          </div>
        </div>

        <SmartInputBar />
        <ExecutionStatusCards executions={executions} />

        {/* Tab switch */}
        <div className="flex items-center gap-3 border-b border-slate-200 pb-0">
          <button onClick={() => setActiveTab("executions")} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "executions" ? "border-[#384877] text-[#384877]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <Zap className="w-4 h-4 inline mr-1.5" />执行控制台
          </button>
          <button onClick={() => setActiveTab("notifications")} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "notifications" ? "border-[#384877] text-[#384877]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <Bell className="w-4 h-4 inline mr-1.5" />系统通知
            {unreadCount > 0 && <Badge className="ml-1.5 bg-red-500 hover:bg-red-600 border-0 text-[10px] px-1.5">{unreadCount}</Badge>}
          </button>
        </div>

        {/* Execution feed */}
        {activeTab === "executions" && (
          <div className="space-y-4">
            <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg w-fit">
              {filters.map(f => (
                <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeFilter === f.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{f.label}</button>
              ))}
            </div>

            {loadingExec ? (
              <div className="p-8 text-center text-slate-500">加载中...</div>
            ) : filteredExecutions.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
                <Zap className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500">暂无执行记录</p>
                <p className="text-xs text-slate-400 mt-1">输入内容后AI将自动生成执行链路并逐步执行</p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {filteredExecutions.map(exec => (
                    <ExecutionItem
                      key={exec.id}
                      execution={exec}
                      onRetry={handleRetry}
                      onConfirm={handleConfirm}
                      onDismiss={handleDismiss}
                      onOpenAdvisor={(ex) => setAdvisorExecution(ex)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {/* Notifications feed */}
        {activeTab === "notifications" && (
          <div className="space-y-4">
            {unreadCount > 0 && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => markAllReadMutation.mutate()} className="text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />全部已读
                </Button>
              </div>
            )}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
              {loadingNotif ? (
                <div className="p-8 text-center text-slate-500">加载通知中...</div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                  <p className="text-slate-500">暂无通知</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {notifications.map(n => (
                    <motion.div key={n.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className={`p-4 transition-colors ${!n.is_read ? "bg-blue-50/30" : ""}`}>
                      <div className="flex gap-3">
                        <div className={`mt-0.5 p-2 rounded-lg ${n.is_read ? "bg-slate-50" : "bg-white shadow-sm"}`}>{getNotifIcon(n.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-0.5">
                            <h4 className={`font-medium text-sm ${n.is_read ? "text-slate-600" : "text-slate-900"}`}>{n.title}</h4>
                            <span className="text-[11px] text-slate-400 ml-2 flex-shrink-0">{format(new Date(n.created_date), "MM-dd HH:mm", { locale: zhCN })}</span>
                          </div>
                          <p className="text-xs text-slate-500 mb-2">{n.content}</p>
                          <div className="flex items-center gap-2">
                            {n.link && <Button variant="outline" size="sm" className="h-6 text-[11px]" asChild><Link to={n.link}>查看 <ExternalLink className="w-3 h-3 ml-1" /></Link></Button>}
                            {!n.is_read && <Button variant="ghost" size="sm" onClick={() => markReadMutation.mutate(n.id)} className="h-6 text-[11px] text-blue-600"><Check className="w-3 h-3 mr-1" />已读</Button>}
                            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(n.id)} className="h-6 text-[11px] text-slate-400 hover:text-red-500 ml-auto"><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        </div>
                        {!n.is_read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}
      </div>

      <AIExecutionAdvisor
        open={!!advisorExecution}
        onOpenChange={(open) => { if (!open) setAdvisorExecution(null); }}
        execution={advisorExecution}
        relatedTasks={advisorRelatedTasks}
        relatedNotes={allNotes.slice(0, 5)}
      />
    </div>
  );
}