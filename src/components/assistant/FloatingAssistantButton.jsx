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

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const assistantName = `SoulSentry-${user?.assistant_name || "小雅"}`;

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
          {/* 轻量提示气泡 */}
          <AnimatePresence>
            {shouldPrompt && !isOpen && (
              <motion.div
                initial={{ opacity: 0, x: 10, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.9 }}
                className="absolute bottom-0 right-16 w-56"
              >
                <button
                  onClick={() => setIsOpen(true)}
                  className="bg-white rounded-xl shadow-lg p-3 border border-[#dce4ed] hover:border-[#c8d1e0] transition-all text-left w-full group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#5a647d]" />
                    <span className="text-xs font-semibold text-[#222222]">{assistantName}提醒</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                    今天有 <strong className="text-[#5a647d]">{pendingCount}</strong> 个任务等你完成 💪
                  </p>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 小助按钮 - 缩小版 */}
          <motion.button
            onClick={() => setIsOpen(!isOpen)}
            className="h-12 w-12 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] hover:from-[#4a5670] hover:to-[#152e50] shadow-lg hover:shadow-xl transition-all relative group"
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