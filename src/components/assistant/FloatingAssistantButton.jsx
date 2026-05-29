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
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const assistantName = user?.assistant_name ? `SoulSentry-${user.assistant_name}` : "SoulSentry-小雅";

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-reminder_time'),
    initialData: [],
  });

  // 监听用户交互，更新活动时间
  useEffect(() => {
    const handleActivity = () => setLastActivityTime(Date.now());
    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, []);

  useEffect(() => {
    // 检查是否有需要关注的约定
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

    // 只显示提示气泡，不自动弹出对话框
    if (todayTasks.length > 0 || overdueTasks.length > 0) {
      // 检查是否已经过了30秒无活动
      const timeSinceLastActivity = Date.now() - lastActivityTime;
      if (timeSinceLastActivity >= 30000) {
        setShouldPrompt(true);
      } else {
        // 设置定时器在30秒后显示提示
        const remainingTime = 30000 - timeSinceLastActivity;
        const timer = setTimeout(() => {
          setShouldPrompt(true);
        }, remainingTime);
        
        return () => clearTimeout(timer);
      }
    }
  }, [tasks, lastActivityTime]);

  const pendingCount = tasks.filter(t => 
    !t.parent_task_id && 
    t.status === "pending" &&
    isSameDay(new Date(t.reminder_time), new Date())
  ).length;

  return (
    <>
      <motion.div
        className="fixed bottom-[88px] right-3 md:bottom-6 md:right-6 z-40"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 20 }}
      >
        <div className="relative">
          {/* 小助按钮 - 缩小版 */}
          <motion.button
            onClick={() => setIsOpen(!isOpen)}
            className="h-14 w-14 md:h-12 md:w-12 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] hover:from-[#4a5670] hover:to-[#152e50] shadow-lg hover:shadow-xl transition-all relative group touch-manipulation"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="h-full w-full flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            
            {/* 在线状态 */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#d5495f] rounded-full border-2 border-white" />
            
            {/* 待办数量 */}
            {pendingCount > 0 && !shouldPrompt && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#06b6d4] text-white flex items-center justify-center text-[10px] font-bold"
              >
                {pendingCount}
              </motion.div>
            )}
          </motion.button>
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