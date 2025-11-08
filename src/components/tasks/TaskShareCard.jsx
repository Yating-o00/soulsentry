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
import { Download, Copy, Share2, Sparkles, Circle, CheckCircle2, Clock, Target, Maximize2, Minimize2 } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const CATEGORY_COLORS = {
  work: { accent: "#3B82F6", bg: "#EFF6FF" },
  personal: { accent: "#8B5CF6", bg: "#F5F3FF" },
  health: { accent: "#10B981", bg: "#ECFDF5" },
  study: { accent: "#F59E0B", bg: "#FFFBEB" },
  family: { accent: "#EC4899", bg: "#FDF2F8" },
  shopping: { accent: "#F97316", bg: "#FFF7ED" },
  finance: { accent: "#EF4444", bg: "#FEF2F2" },
  other: { accent: "#6B7280", bg: "#F9FAFB" },
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
  const [showAllSubtasks, setShowAllSubtasks] = useState(false);
  const [expandedView, setExpandedView] = useState(false);

  // 查询子任务
  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', task?.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: task.id }),
    enabled: !!task?.id,
    initialData: [],
  });

  const completedSubtasks = subtasks.filter(s => s.status === "completed").length;
  const progress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 100;

  // 使用动态导入 html2canvas
  const loadHtml2Canvas = async () => {
    try {
      const html2canvas = (await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')).default;
      return html2canvas;
    } catch (error) {
      console.error("Failed to load html2canvas:", error);
      throw new Error("图片生成库加载失败");
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    
    setGenerating(true);
    try {
      const html2canvas = await loadHtml2Canvas();
      
      // 计算卡片高度，长内容时增加 scale
      const cardHeight = cardRef.current.scrollHeight;
      const scaleFactor = cardHeight > 1000 ? 1.5 : 2;
      
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: scaleFactor,
        logging: false,
        useCORS: true,
        allowTaint: true,
        windowWidth: cardRef.current.scrollWidth,
        windowHeight: cardRef.current.scrollHeight,
      });

      const link = document.createElement('a');
      link.download = `任务-${task.title}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 0.95);
      link.click();
      
      toast.success("任务卡片已保存到本地");
    } catch (error) {
      console.error("Download error:", error);
      toast.error(error.message || "生成卡片失败，请重试");
    }
    setGenerating(false);
  };

  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    
    setGenerating(true);
    try {
      const html2canvas = await loadHtml2Canvas();
      
      const cardHeight = cardRef.current.scrollHeight;
      const scaleFactor = cardHeight > 1000 ? 1.5 : 2;
      
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: scaleFactor,
        logging: false,
        useCORS: true,
        allowTaint: true,
        windowWidth: cardRef.current.scrollWidth,
        windowHeight: cardRef.current.scrollHeight,
      });

      canvas.toBlob(async (blob) => {
        try {
          if (navigator.clipboard && ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            toast.success("任务卡片已复制到剪贴板");
          } else {
            throw new Error("浏览器不支持复制图片");
          }
        } catch (err) {
          console.error("Copy error:", err);
          toast.error("复制失败，请使用下载功能");
        }
        setGenerating(false);
      }, 'image/png', 0.95);
    } catch (error) {
      console.error("Copy error:", error);
      toast.error(error.message || "复制失败，请重试");
      setGenerating(false);
    }
  };

  const handleCopyText = () => {
    const taskText = `
【任务卡片】

📋 ${task.title}

${task.description ? `📝 ${task.description}\n` : ''}
📅 提醒时间：${format(new Date(task.reminder_time), "yyyy年M月d日 EEEE HH:mm", { locale: zhCN })}
🏷️ 类别：${CATEGORY_LABELS[task.category]}
⚡ 优先级：${PRIORITY_LABELS[task.priority]}
📊 完成进度：${progress}%
${task.status === "completed" ? "✅ 已完成" : "🔵 进行中"}
${subtasks.length > 0 ? `\n📌 子任务清单 (${completedSubtasks}/${subtasks.length}):\n${subtasks.map((s, i) => {
  const titleMatch = s.title.match(/^(\d+)\.\s*/);
  const cleanTitle = titleMatch ? s.title.replace(/^\d+\.\s*/, '') : s.title;
  return `${i + 1}. ${cleanTitle} ${s.status === "completed" ? "✅" : "⭕"}`;
}).join('\n')}` : ''}

---
来自「任务管家」智能提醒系统
${format(new Date(), "yyyy年M月d日 HH:mm", { locale: zhCN })}
    `.trim();

    navigator.clipboard.writeText(taskText).then(() => {
      toast.success("任务文本已复制到剪贴板");
    }).catch(() => {
      toast.error("复制失败");
    });
  };

  if (!task) return null;

  const categoryColor = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.other;
  
  // 决定显示多少子任务
  const displayedSubtasks = showAllSubtasks || expandedView ? subtasks : subtasks.slice(0, 6);
  const hasMoreSubtasks = subtasks.length > 6 && !showAllSubtasks && !expandedView;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`${expandedView ? 'max-w-4xl' : 'max-w-2xl'} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-600" />
              分享任务卡片
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpandedView(!expandedView)}
              className="h-8 w-8"
            >
              {expandedView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 控制选项 */}
          {subtasks.length > 6 && (
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <div>
                  <Label className="text-sm font-semibold text-blue-800">显示所有子任务</Label>
                  <p className="text-xs text-blue-600 mt-0.5">
                    共 {subtasks.length} 个子任务，当前显示 {displayedSubtasks.length} 个
                  </p>
                </div>
              </div>
              <Switch
                checked={showAllSubtasks}
                onCheckedChange={setShowAllSubtasks}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
          )}

          {/* 预览区域 */}
          <div className="flex justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-8 rounded-2xl max-h-[60vh] overflow-y-auto">
            <div ref={cardRef} className={`${expandedView ? 'w-[720px]' : 'w-[520px]'} relative`}>
              {/* 主卡片 */}
              <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
                {/* 科技感背景装饰 */}
                <div className="absolute inset-0 opacity-[0.03]">
                  {/* 网格背景 */}
                  <div 
                    className="absolute inset-0" 
                    style={{
                      backgroundImage: `
                        linear-gradient(to right, #94a3b8 1px, transparent 1px),
                        linear-gradient(to bottom, #94a3b8 1px, transparent 1px)
                      `,
                      backgroundSize: '20px 20px'
                    }}
                  />
                </div>

                {/* 顶部色带 */}
                <div 
                  className="h-1.5" 
                  style={{ backgroundColor: categoryColor.accent }}
                />

                {/* 内容区域 */}
                <div className="relative z-10 p-8">
                  {/* 顶部标识 */}
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: categoryColor.bg }}
                      >
                        <Target 
                          className="w-6 h-6" 
                          style={{ color: categoryColor.accent }}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span 
                            className="text-xs font-semibold px-2.5 py-1 rounded-md"
                            style={{ 
                              backgroundColor: categoryColor.bg,
                              color: categoryColor.accent 
                            }}
                          >
                            {CATEGORY_LABELS[task.category]}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs text-slate-500 font-medium">
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          ID: {task.id.slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                    </div>
                    
                    {/* 状态指示器 */}
                    <div className="text-right">
                      {task.status === "completed" ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-xs font-semibold text-green-700">已完成</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
                          <Circle className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-semibold text-blue-700">进行中</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 任务标题 */}
                  <div className="mb-6">
                    <h2 className={`${expandedView ? 'text-4xl' : 'text-3xl'} font-bold text-slate-800 mb-3 leading-tight tracking-tight`}>
                      {task.title}
                    </h2>
                    {task.description && (
                      <p className="text-slate-600 text-sm leading-relaxed">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {/* 时间和进度信息 */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {/* 时间卡片 */}
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-slate-500" />
                        <span className="text-xs text-slate-500 font-medium">提醒时间</span>
                      </div>
                      <p className="text-lg font-bold text-slate-800">
                        {format(new Date(task.reminder_time), "M月d日", { locale: zhCN })}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {format(new Date(task.reminder_time), "EEEE HH:mm", { locale: zhCN })}
                      </p>
                    </div>

                    {/* 进度卡片 */}
                    <div 
                      className="rounded-xl p-4 border"
                      style={{ 
                        backgroundColor: categoryColor.bg,
                        borderColor: categoryColor.accent + '20'
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles 
                          className="w-4 h-4" 
                          style={{ color: categoryColor.accent }}
                        />
                        <span 
                          className="text-xs font-medium"
                          style={{ color: categoryColor.accent }}
                        >
                          完成进度
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <p 
                          className="text-3xl font-bold"
                          style={{ color: categoryColor.accent }}
                        >
                          {progress}
                        </p>
                        <span 
                          className="text-lg font-semibold"
                          style={{ color: categoryColor.accent }}
                        >
                          %
                        </span>
                      </div>
                      {subtasks.length > 0 && (
                        <p className="text-xs text-slate-500 mt-1">
                          {completedSubtasks}/{subtasks.length} 项已完成
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 进度条 */}
                  {subtasks.length > 0 && (
                    <div className="mb-6">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full transition-all duration-500 rounded-full"
                          style={{ 
                            width: `${progress}%`,
                            backgroundColor: categoryColor.accent
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 子任务列表 */}
                  {displayedSubtasks.length > 0 && (
                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="text-xs text-slate-400 font-medium">
                          子任务清单 ({completedSubtasks}/{subtasks.length})
                        </span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                      
                      <div className="space-y-2">
                        {displayedSubtasks.map((subtask, index) => {
                          const isCompleted = subtask.status === "completed";
                          const titleMatch = subtask.title.match(/^(\d+)\.\s*/);
                          const orderNumber = titleMatch ? titleMatch[1] : (index + 1);
                          const cleanTitle = titleMatch ? subtask.title.replace(/^\d+\.\s*/, '') : subtask.title;
                          
                          return (
                            <div
                              key={subtask.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                isCompleted 
                                  ? 'bg-slate-50 border-slate-200' 
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div 
                                className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 ${
                                  isCompleted 
                                    ? 'bg-slate-100 border-slate-300 text-slate-400' 
                                    : 'border-slate-300 text-slate-600'
                                }`}
                              >
                                {isCompleted ? '✓' : orderNumber}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className={`text-sm block ${
                                  isCompleted 
                                    ? 'line-through text-slate-400' 
                                    : 'text-slate-700 font-medium'
                                }`}>
                                  {cleanTitle}
                                </span>
                                {subtask.description && (
                                  <p className="text-xs text-slate-500 mt-1">{subtask.description}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {hasMoreSubtasks && (
                          <div className="text-center py-2 border border-dashed border-slate-300 rounded-lg">
                            <p className="text-xs text-slate-400">
                              还有 {subtasks.length - 6} 个子任务...
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              💡 开启"显示所有子任务"查看完整列表
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 底部信息 */}
                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: categoryColor.bg }}
                        >
                          <Sparkles 
                            className="w-5 h-5" 
                            style={{ color: categoryColor.accent }}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">任务管家</p>
                          <p className="text-xs text-slate-400">智能提醒 · 高效管理</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400 font-mono">
                          {format(new Date(), "yyyy.MM.dd", { locale: zhCN })}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">
                          {format(new Date(), "HH:mm", { locale: zhCN })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 右侧装饰线条 */}
                <div className="absolute right-0 top-1/4 w-32 h-32 opacity-[0.03]">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-400"/>
                    <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-400"/>
                    <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-slate-400"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-3 gap-3">
            <Button
              onClick={handleDownload}
              disabled={generating}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:shadow-lg"
            >
              <Download className="w-4 h-4 mr-2" />
              {generating ? "生成中..." : "下载图片"}
            </Button>
            <Button
              onClick={handleCopyImage}
              disabled={generating}
              variant="outline"
              className="border-slate-300 hover:bg-slate-50"
            >
              <Copy className="w-4 h-4 mr-2" />
              复制图片
            </Button>
            <Button
              onClick={handleCopyText}
              variant="outline"
              className="border-slate-300 hover:bg-slate-50"
            >
              <Copy className="w-4 h-4 mr-2" />
              复制文本
            </Button>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-200">
            <div className="flex gap-3">
              <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800 mb-1">智能生成提示</p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• 长任务列表将自动优化图片质量以保证清晰度</li>
                  <li>• 开启"显示所有子任务"可以生成包含完整列表的长图</li>
                  <li>• 复制文本功能会包含所有子任务信息</li>
                  <li>• 点击右上角展开按钮可以获得更大的预览视图</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}