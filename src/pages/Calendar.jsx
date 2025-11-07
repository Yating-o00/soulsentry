
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar as BigCalendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion } from "framer-motion";
import { Clock, CheckCircle2 } from "lucide-react";
import TaskCard from "../components/tasks/TaskCard";
import TaskDetailModal from "../components/tasks/TaskDetailModal";

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState(null);
  const queryClient = useQueryClient();

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });

  // 只显示主任务（没有 parent_task_id 的任务）
  const tasks = allTasks.filter(task => !task.parent_task_id);

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const tasksOnSelectedDate = tasks.filter(task => 
    isSameDay(new Date(task.reminder_time), selectedDate)
  );

  const taskDates = tasks.reduce((acc, task) => {
    const dateKey = format(new Date(task.reminder_time), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(task);
    return acc;
  }, {});

  const handleComplete = (task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    updateTaskMutation.mutate({
      id: task.id,
      data: { status: newStatus }
    });
  };

  const handleSubtaskToggle = async (subtask) => {
    const newStatus = subtask.status === "completed" ? "pending" : "completed";
    
    // 更新子任务状态
    await updateTaskMutation.mutateAsync({
      id: subtask.id,
      data: { 
        status: newStatus,
        completed_at: newStatus === "completed" ? new Date().toISOString() : null
      }
    });

    // 重新计算父任务进度
    if (subtask.parent_task_id) {
      const parentTask = allTasks.find(t => t.id === subtask.parent_task_id);
      if (parentTask) {
        // Find all siblings including the current subtask
        const siblings = allTasks.filter(t => t.parent_task_id === subtask.parent_task_id);
        
        const completed = siblings.filter(s => 
          s.id === subtask.id ? newStatus === "completed" : s.status === "completed"
        ).length;
        
        const progress = siblings.length > 0 ? Math.round((completed / siblings.length) * 100) : 0;

        await updateTaskMutation.mutateAsync({
          id: parentTask.id,
          data: { progress }
        });
      }
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
          日历视图
        </h1>
        <p className="text-slate-600">查看您的任务时间线</p>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          <Card className="p-6 border-0 shadow-xl bg-white">
            <BigCalendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={zhCN}
              className="rounded-xl"
              modifiers={{
                hasTask: (date) => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  return taskDates[dateKey] && taskDates[dateKey].length > 0;
                }
              }}
              modifiersStyles={{
                hasTask: {
                  fontWeight: 'bold',
                  position: 'relative',
                }
              }}
              components={{
                DayContent: ({ date }) => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  const dayTasks = taskDates[dateKey] || [];
                  const hasTasks = dayTasks.length > 0;
                  
                  return (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <span>{format(date, 'd')}</span>
                      {hasTasks && (
                        <div className="absolute bottom-1 flex gap-0.5">
                          {dayTasks.slice(0, 3).map((_, idx) => (
                            <div 
                              key={idx}
                              className="w-1 h-1 rounded-full bg-purple-500"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
              }}
            />
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <Card className="p-6 border-0 shadow-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
            <h3 className="text-lg font-semibold mb-2">
              {format(selectedDate, "M月d日", { locale: zhCN })}
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                <span className="text-2xl font-bold">
                  {tasksOnSelectedDate.filter(t => t.status === "pending").length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-2xl font-bold">
                  {tasksOnSelectedDate.filter(t => t.status === "completed").length}
                </span>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800">当日任务</h3>
            {tasksOnSelectedDate.length > 0 ? (
              tasksOnSelectedDate.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={() => handleComplete(task)}
                  onDelete={() => deleteTaskMutation.mutate(task.id)}
                  onEdit={() => {}}
                  onClick={() => setSelectedTask(task)}
                  onSubtaskToggle={handleSubtaskToggle}
                />
              ))
            ) : (
              <Card className="p-8 border-0 shadow-lg bg-white text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                  <Clock className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-600">这一天没有安排任务</p>
              </Card>
            )}
          </div>
        </motion.div>
      </div>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}
