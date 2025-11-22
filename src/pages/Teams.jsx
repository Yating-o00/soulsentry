import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Users, Clock, CheckCircle2, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import TaskCard from "../components/tasks/TaskCard";
import TaskDetailModal from "../components/tasks/TaskDetailModal";

export default function Teams() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterView, setFilterView] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['sharedTasks'],
    queryFn: () => base44.entities.Task.list('-updated_date'),
    initialData: [],
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharedTasks'] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharedTasks'] });
    },
  });

  const sharedTasks = allTasks.filter(task => 
    !task.parent_task_id && 
    (task.is_shared || task.team_visibility !== 'private' || 
     (task.assigned_to && task.assigned_to.length > 0))
  );

  const myAssignedTasks = sharedTasks.filter(task =>
    task.assigned_to && task.assigned_to.includes(currentUser?.id)
  );

  const myCreatedTasks = sharedTasks.filter(task =>
    task.created_by === currentUser?.email
  );

  const filteredTasks = sharedTasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterView === "assigned") {
      return matchesSearch && task.assigned_to?.includes(currentUser?.id);
    } else if (filterView === "created") {
      return matchesSearch && task.created_by === currentUser?.email;
    }
    return matchesSearch;
  });

  const handleComplete = (task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    updateTaskMutation.mutate({
      id: task.id,
      data: { status: newStatus }
    });
  };

  const handleSubtaskToggle = async (subtask) => {
    const newStatus = subtask.status === "completed" ? "pending" : "completed";
    await updateTaskMutation.mutateAsync({
      id: subtask.id,
      data: { 
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null
      }
    });
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getUserById = (userId) => {
    return allUsers.find(u => u.id === userId);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#5a647d] to-[#1e3a5f] bg-clip-text text-transparent mb-2">
          团队协作
        </h1>
        <p className="text-slate-600">查看和管理团队共享的任务</p>
      </motion.div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium mb-1">分配给我的</p>
                <p className="text-3xl font-bold text-blue-700">{myAssignedTasks.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium mb-1">我创建的</p>
                <p className="text-3xl font-bold text-purple-700">{myCreatedTasks.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500 flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-green-100">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium mb-1">团队共享</p>
                <p className="text-3xl font-bold text-green-700">{sharedTasks.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 团队成员 */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            团队成员 ({allUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {allUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Avatar className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                  <AvatarFallback className="bg-transparent">
                    {getInitials(user.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-slate-800">{user.full_name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                {user.role === 'admin' && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    管理员
                  </Badge>
                )}
                {user.id === currentUser?.id && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    我
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 筛选和搜索 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="搜索团队任务..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 border-0 bg-white shadow-lg rounded-xl"
          />
        </div>

        <Tabs value={filterView} onValueChange={setFilterView}>
          <TabsList className="grid w-full md:w-auto grid-cols-3 bg-white shadow-lg rounded-xl p-1">
            <TabsTrigger value="all" className="rounded-lg">
              全部任务 ({sharedTasks.length})
            </TabsTrigger>
            <TabsTrigger value="assigned" className="rounded-lg">
              分配给我 ({myAssignedTasks.length})
            </TabsTrigger>
            <TabsTrigger value="created" className="rounded-lg">
              我创建的 ({myCreatedTasks.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* 任务列表 */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredTasks.map((task) => (
            <div key={task.id} className="relative">
              <TaskCard
                task={task}
                onComplete={() => handleComplete(task)}
                onDelete={() => deleteTaskMutation.mutate(task.id)}
                onEdit={() => {}}
                onClick={() => setSelectedTask(task)}
                onSubtaskToggle={handleSubtaskToggle}
              />
              {/* 显示分配的成员 */}
              {task.assigned_to && task.assigned_to.length > 0 && (
                <div className="absolute top-4 right-4 flex -space-x-2">
                  {task.assigned_to.slice(0, 3).map((userId) => {
                    const user = getUserById(userId);
                    return user ? (
                      <Avatar
                        key={userId}
                        className="h-8 w-8 border-2 border-white bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs"
                        title={user.full_name}
                      >
                        <AvatarFallback className="bg-transparent">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>
                    ) : null;
                  })}
                  {task.assigned_to.length > 3 && (
                    <div className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-medium text-slate-600">
                      +{task.assigned_to.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </AnimatePresence>

        {filteredTasks.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
              <Users className="w-12 h-12 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">暂无团队任务</h3>
            <p className="text-slate-600">创建任务并分配给团队成员</p>
          </motion.div>
        )}
      </div>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}