import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AITaskAssistant from "./AITaskAssistant";
import { isSameDay, isPast } from "date-fns";

export default function FloatingAssistantButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldPrompt, setShouldPrompt] = useState(false);

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });

  useEffect(() => {
    // 检查是否有需要关注的任务
    const now = new Date();
    const todayTasks = tasks.filter(task => 
      !task.parent_task_id && 
      task.status === "pending" &&
      isSameDay(new Date(task.reminder_time), now)
    );

    const overdueTasks = tasks.filter(task =>
      !task.parent_task_id &&
      task.status === "pending" &&
      isPast(new Date(task.reminder_time)) &&
      !isSameDay(new Date(task.reminder_time), now)
    );

    // 如果有今日任务或逾期任务，显示提示
    if (todayTasks.length > 0 || overdueTasks.length > 0) {
      setShouldPrompt(true);
      
      // 30秒后自动提示
      const timer = setTimeout(() => {
        if (!isOpen) {
          setIsOpen(true);
        }
      }, 30000);

      return () => clearTimeout(timer);
    }
  }, [tasks, isOpen]);

  const pendingCount = tasks.filter(t => 
    !t.parent_task_id && 
    t.status === "pending" &&
    isSameDay(new Date(t.reminder_time), new Date())
  ).length;

  return (
    <>
      <motion.div
        className="fixed bottom-6 right-6 z-40"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
      >
        <div className="relative">
          {/* 提示气泡 */}
          <AnimatePresence>
            {shouldPrompt && !isOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.8 }}
                className="absolute bottom-full right-0 mb-3 w-64"
              >
                <div className="bg-white rounded-2xl shadow-2xl p-4 border-2 border-purple-200">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-800 mb-2">
                        嗨！我注意到你今天有 <strong className="text-purple-600">{pendingCount} 个任务</strong>
                      </p>
                      <p className="text-xs text-slate-600">
                        需要我帮你检查一下进度吗？ 😊
                      </p>
                    </div>
                  </div>
                  <div className="absolute bottom-0 right-6 transform translate-y-1/2 rotate-45 w-3 h-3 bg-white border-r-2 border-b-2 border-purple-200"></div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 主按钮 */}
          <Button
            size="lg"
            onClick={() => setIsOpen(!isOpen)}
            className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-2xl relative overflow-hidden group"
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 bg-purple-400 rounded-full"
            />
            <div className="relative">
              <Bot className="w-7 h-7 text-white" />
            </div>
            
            {/* 未读消息徽章 */}
            {pendingCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1"
              >
                <Badge className="h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center p-0 text-xs">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </Badge>
              </motion.div>
            )}
          </Button>

          {/* 脉动效果 */}
          {shouldPrompt && (
            <motion.div
              className="absolute inset-0 rounded-full border-4 border-purple-400"
              animate={{
                scale: [1, 1.3],
                opacity: [0.6, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          )}
        </div>
      </motion.div>

      {/* 对话窗口 */}
      <AnimatePresence>
        {isOpen && (
          <AITaskAssistant
            isOpen={isOpen}
            onClose={() => {
              setIsOpen(false);
              setShouldPrompt(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}