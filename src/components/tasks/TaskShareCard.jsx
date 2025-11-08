import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Share2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import html2canvas from "html2canvas";

const CATEGORY_GRADIENTS = {
  work: "from-blue-400 via-blue-500 to-indigo-600",
  personal: "from-purple-400 via-purple-500 to-pink-600",
  health: "from-green-400 via-emerald-500 to-teal-600",
  study: "from-yellow-400 via-amber-500 to-orange-600",
  family: "from-pink-400 via-rose-500 to-red-600",
  shopping: "from-orange-400 via-orange-500 to-red-600",
  finance: "from-red-400 via-red-500 to-rose-600",
  other: "from-gray-400 via-slate-500 to-gray-600",
};

const CATEGORY_LABELS = {
  work: "工作",
  personal: "个人",
  health: "健康",
  study: "学习",
  family: "家庭",
  shopping: "购物",
  finance: "财务",
  other: "其他",
};

const PRIORITY_LABELS = {
  low: "低优先级",
  medium: "中优先级",
  high: "高优先级",
  urgent: "紧急",
};

export default function TaskShareCard({ task, open, onClose }) {
  const cardRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  // 查询子任务
  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', task?.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: task.id }),
    enabled: !!task?.id,
    initialData: [],
  });

  const completedSubtasks = subtasks.filter(s => s.status === "completed").length;
  const progress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 100;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        logging: false,
        useCORS: true,
      });

      const link = document.createElement('a');
      link.download = `任务-${task.title}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast.success("任务卡片已保存到本地");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("生成卡片失败，请重试");
    }
    setGenerating(false);
  };

  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        logging: false,
        useCORS: true,
      });

      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          toast.success("任务卡片已复制到剪贴板");
        } catch (err) {
          toast.error("复制失败，请使用下载功能");
        }
      });
    } catch (error) {
      console.error("Copy error:", error);
      toast.error("复制失败，请重试");
    }
    setGenerating(false);
  };

  if (!task) return null;

  const gradient = CATEGORY_GRADIENTS[task.category] || CATEGORY_GRADIENTS.other;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-purple-600" />
            分享任务卡片
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 预览区域 */}
          <div className="flex justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-8 rounded-2xl">
            <div ref={cardRef} className="w-[500px] relative">
              {/* 主卡片 */}
              <div className={`relative bg-gradient-to-br ${gradient} rounded-3xl shadow-2xl overflow-hidden`}>
                {/* 装饰性背景图案 */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2"></div>
                </div>

                {/* 内容区域 */}
                <div className="relative z-10 p-8 text-white">
                  {/* 顶部信息 */}
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium">
                          {CATEGORY_LABELS[task.category]}
                        </div>
                        <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium">
                          {PRIORITY_LABELS[task.priority]}
                        </div>
                      </div>
                      <h2 className="text-3xl font-bold mb-2 leading-tight">
                        {task.title}
                      </h2>
                      {task.description && (
                        <p className="text-white/90 text-sm leading-relaxed line-clamp-2">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <div className="ml-4">
                      <Sparkles className="w-10 h-10 text-white/60" />
                    </div>
                  </div>

                  {/* 时间信息 */}
                  <div className="mb-6 p-4 bg-white/10 backdrop-blur-sm rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white/70 text-xs mb-1">提醒时间</p>
                        <p className="text-lg font-semibold">
                          {format(new Date(task.reminder_time), "yyyy年M月d日", { locale: zhCN })}
                        </p>
                        <p className="text-sm text-white/90">
                          {format(new Date(task.reminder_time), "EEEE HH:mm", { locale: zhCN })}
                        </p>
                      </div>
                      {task.status === "completed" ? (
                        <div className="text-center">
                          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-1">
                            <span className="text-3xl">✓</span>
                          </div>
                          <p className="text-xs text-white/80">已完成</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-1">
                            <span className="text-2xl font-bold">{progress}%</span>
                          </div>
                          <p className="text-xs text-white/80">进度</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 子任务列表 */}
                  {subtasks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-white/70 text-xs mb-3 flex items-center gap-2">
                        <span>子任务清单</span>
                        <span className="text-white/90 font-semibold">
                          {completedSubtasks}/{subtasks.length}
                        </span>
                      </p>
                      <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {subtasks.slice(0, 5).map((subtask, index) => {
                          const isCompleted = subtask.status === "completed";
                          const titleMatch = subtask.title.match(/^(\d+)\.\s*/);
                          const orderNumber = titleMatch ? titleMatch[1] : (index + 1);
                          const cleanTitle = titleMatch ? subtask.title.replace(/^\d+\.\s*/, '') : subtask.title;
                          
                          return (
                            <div
                              key={subtask.id}
                              className="flex items-center gap-3 p-2 bg-white/10 backdrop-blur-sm rounded-xl"
                            >
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                isCompleted ? 'bg-white/30' : 'bg-white/20'
                              }`}>
                                {isCompleted ? '✓' : orderNumber}
                              </div>
                              <span className={`text-sm flex-1 ${isCompleted ? 'line-through text-white/60' : 'text-white'}`}>
                                {cleanTitle}
                              </span>
                            </div>
                          );
                        })}
                        {subtasks.length > 5 && (
                          <p className="text-xs text-white/60 text-center py-2">
                            还有 {subtasks.length - 5} 个子任务...
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 底部水印 */}
                  <div className="mt-6 pt-4 border-t border-white/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">任务管家</p>
                        <p className="text-[10px] text-white/70">智能提醒，贴心陪伴</p>
                      </div>
                    </div>
                    <p className="text-xs text-white/60">
                      {format(new Date(), "yyyy.MM.dd", { locale: zhCN })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <Button
              onClick={handleDownload}
              disabled={generating}
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:shadow-lg"
            >
              <Download className="w-4 h-4 mr-2" />
              {generating ? "生成中..." : "下载图片"}
            </Button>
            <Button
              onClick={handleCopyImage}
              disabled={generating}
              variant="outline"
              className="flex-1"
            >
              <Copy className="w-4 h-4 mr-2" />
              复制图片
            </Button>
          </div>

          <p className="text-xs text-slate-500 text-center">
            💡 提示：生成的图片可以分享到社交媒体或保存到相册
          </p>
        </div>

        <style jsx>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 10px;
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}