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
import { Download, Copy, Share2, Sparkles, Circle, CheckCircle2, Clock, Target, Maximize2, Minimize2, Quote, Calendar, Award, Check } from "lucide-react";
import { format } from "date-fns";
import { createPageUrl } from "@/utils";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";

const CATEGORY_COLORS = {
  work: { accent: "#1D4ED8", bg: "#EFF6FF" },
  personal: { accent: "#8B5CF6", bg: "#F5F3FF" },
  health: { accent: "#10B981", bg: "#ECFDF5" },
  study: { accent: "#F59E0B", bg: "#FFFBEB" },
  family: { accent: "#EC4899", bg: "#FDF2F8" },
  shopping: { accent: "#F97316", bg: "#FFF7ED" },
  finance: { accent: "#EF4444", bg: "#FEF2F2" },
  other: { accent: "#6B7280", bg: "#F9FAFB" },
};

const CATEGORY_LABELS = {
  work: { zh: "工作", en: "Work" },
  personal: { zh: "个人", en: "Personal" },
  health: { zh: "健康", en: "Health" },
  study: { zh: "学习", en: "Study" },
  family: { zh: "家庭", en: "Family" },
  shopping: { zh: "购物", en: "Shopping" },
  finance: { zh: "财务", en: "Finance" },
  other: { zh: "其他", en: "Other" },
};

const PRIORITY_LABELS = {
  low: { zh: "低优先级", en: "Low Priority" },
  medium: { zh: "中优先级", en: "Medium Priority" },
  high: { zh: "高优先级", en: "High Priority" },
  urgent: { zh: "紧急", en: "Urgent" },
};

export default function TaskShareCard({ task, open, onClose }) {
  const cardRef = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [showAllSubtasks, setShowAllSubtasks] = useState(false);
  const [expandedView, setExpandedView] = useState(false);

  // 查询子约定
  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', task?.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: task.id }),
    enabled: !!task?.id,
    initialData: [],
  });

  const completedSubtasks = subtasks.filter(s => s.status === "completed").length;
  const progress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 100;

  const taskUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}${createPageUrl("Tasks")}?taskId=${task.id}`
    : "";

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(taskUrl)}&bgcolor=ffffff`;

  // Detect language
  const isEnglish = React.useMemo(() => {
    const allText = task.title + (task.description || "");
    const chineseChars = (allText.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalChars = allText.length;
    return chineseChars < totalChars * 0.3; // English if less than 30% Chinese
  }, [task]);

  const [quote] = useState(() => {
    const quotesZh = [
      "每一个不曾起舞的日子，都是对生命的辜负。",
      "坚持不是因为看到了希望，而是因为坚持了才有希望。",
      "今日的努力，是明日的惊喜。",
      "自律给我自由。",
      "星光不问赶路人，时光不负有心人。",
      "做难事必有所得。",
      "种一棵树最好的时间是十年前，其次是现在。",
      "不积跬步，无以至千里。",
      "每天进步一点点，坚持带来大改变。",
      "专注当下，未来可期。"
    ];
    const quotesEn = [
      "The only way to do great work is to love what you do.",
      "Success is not final, failure is not fatal: it is the courage to continue that counts.",
      "Believe you can and you're halfway there.",
      "The future belongs to those who believe in the beauty of their dreams.",
      "Don't watch the clock; do what it does. Keep going.",
      "The secret of getting ahead is getting started.",
      "It always seems impossible until it's done.",
      "Small daily improvements are the key to staggering long-term results.",
      "Focus on being productive instead of busy.",
      "Your limitation—it's only your imagination."
    ];
    const quotes = isEnglish ? quotesEn : quotesZh;
    return quotes[Math.floor(Math.random() * quotes.length)];
  });

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
    let previewContainer = null;
    let originalMaxHeight = '';
    let originalOverflow = '';

    try {
      const html2canvas = await loadHtml2Canvas();
      
      // 临时移除预览区域的高度限制，确保捕获完整内容
      previewContainer = cardRef.current.parentElement;
      if (previewContainer) {
        originalMaxHeight = previewContainer.style.maxHeight;
        originalOverflow = previewContainer.style.overflow;
        previewContainer.style.maxHeight = 'none';
        previewContainer.style.overflow = 'visible';
      }
      
      // 等待DOM更新
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 计算卡片高度，长内容时调整 scale
      const cardHeight = cardRef.current.scrollHeight;
      const scaleFactor = cardHeight > 1500 ? 1.2 : cardHeight > 1000 ? 1.5 : 2;
      
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: scaleFactor,
        logging: false,
        useCORS: true,
        allowTaint: true,
        windowWidth: cardRef.current.scrollWidth,
        windowHeight: cardRef.current.scrollHeight,
      });

      // 恢复原始样式
      if (previewContainer) {
        previewContainer.style.maxHeight = originalMaxHeight;
        previewContainer.style.overflow = originalOverflow;
      }

      const link = document.createElement('a');
      link.download = `约定-${task.title}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 0.95);
      link.click();
      
      toast.success("约定卡片已保存到本地");
    } catch (error) {
      console.error("Download error:", error);
      toast.error(error.message || "生成卡片失败，请重试");
    } finally {
      // Ensure styles are restored even if an error occurs
      if (previewContainer) {
        previewContainer.style.maxHeight = originalMaxHeight;
        previewContainer.style.overflow = originalOverflow;
      }
      setGenerating(false);
    }
  };

  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    
    setGenerating(true);
    let previewContainer = null;
    let originalMaxHeight = '';
    let originalOverflow = '';

    try {
      const html2canvas = await loadHtml2Canvas();
      
      // 临时移除预览区域的高度限制
      previewContainer = cardRef.current.parentElement;
      if (previewContainer) {
        originalMaxHeight = previewContainer.style.maxHeight;
        originalOverflow = previewContainer.style.overflow;
        previewContainer.style.maxHeight = 'none';
        previewContainer.style.overflow = 'visible';
      }
      
      // 等待DOM更新
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const cardHeight = cardRef.current.scrollHeight;
      const scaleFactor = cardHeight > 1500 ? 1.2 : cardHeight > 1000 ? 1.5 : 2;
      
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: scaleFactor,
        logging: false,
        useCORS: true,
        allowTaint: true,
        windowWidth: cardRef.current.scrollWidth,
        windowHeight: cardRef.current.scrollHeight,
      });

      // 恢复原始样式
      if (previewContainer) {
        previewContainer.style.maxHeight = originalMaxHeight;
        previewContainer.style.overflow = originalOverflow;
      }

      canvas.toBlob(async (blob) => {
        try {
          if (navigator.clipboard && ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            toast.success("约定卡片已复制到剪贴板");
          } else {
            throw new Error("浏览器不支持复制图片");
          }
        } catch (err) {
          console.error("Copy error:", err);
          toast.error("复制失败，请使用下载功能");
        } finally {
          setGenerating(false);
        }
      }, 'image/png', 0.95);
    } catch (error) {
      console.error("Copy error:", error);
      toast.error(error.message || "复制失败，请重试");
    } finally {
      // Ensure styles are restored even if an error occurs
      if (previewContainer) {
        previewContainer.style.maxHeight = originalMaxHeight;
        previewContainer.style.overflow = originalOverflow;
      }
      // setGenerating(false) is handled in canvas.toBlob callback
      if (!navigator.clipboard || !ClipboardItem) {
        setGenerating(false); // If clipboard isn't supported, set generating to false here
      }
    }
  };

  const handleCopyText = () => {
    const categoryLabel = CATEGORY_LABELS[task.category] || { zh: "其他", en: "Other" };
    const priorityLabel = PRIORITY_LABELS[task.priority] || { zh: "中优先级", en: "Medium" };
    
    const taskText = `
【约定卡片】

📋 ${task.title}

${task.description ? `📝 ${task.description}\n` : ''}
📅 提醒时间：${format(new Date(task.reminder_time), "yyyy年M月d日 EEEE HH:mm", { locale: zhCN })}${task.end_time ? ` - ${format(new Date(task.end_time), "HH:mm", { locale: zhCN })}` : ''}
🏷️ 类别：${categoryLabel.zh}
⚡ 优先级：${priorityLabel.zh}
📊 完成进度：${progress}%
${task.status === "completed" ? "✅ 已完成" : "🔵 进行中"}
${subtasks.length > 0 ? `\n📌 子约定清单 (${completedSubtasks}/${subtasks.length}):\n${subtasks.map((s, i) => {
  const title = s.title || '';
  const titleMatch = title.match(/^(\d+)\.\s*/);
  const cleanTitle = titleMatch ? title.replace(/^\d+\.\s*/, '') : title;
  return `${i + 1}. ${cleanTitle} ${s.status === "completed" ? "✅" : "⭕"}`;
}).join('\n')}` : ''}

---
来自「约定管家」智能提醒系统
${format(new Date(), "yyyy年M月d日 HH:mm", { locale: zhCN })}
    `.trim();

    navigator.clipboard.writeText(taskText).then(() => {
      toast.success("约定文本已复制到剪贴板");
    }).catch(() => {
      toast.error("复制失败");
    });
  };

  if (!task) return null;

  const categoryColor = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.other;
  
  // 决定显示多少子约定
  const displayedSubtasks = showAllSubtasks || expandedView ? subtasks : subtasks.slice(0, 6);
  const hasMoreSubtasks = subtasks.length > 6 && !showAllSubtasks && !expandedView;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`${expandedView ? 'max-w-4xl' : 'max-w-2xl'} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-700" />
              分享约定卡片
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
                <Sparkles className="w-5 h-5 text-blue-700" />
                <div>
                  <Label className="text-sm font-semibold text-blue-900">
                    {isEnglish ? "Show All Subtasks" : "显示所有子约定"}
                  </Label>
                  <p className="text-xs text-blue-700 mt-0.5">
                   {isEnglish 
                     ? `Total ${subtasks.length} items, showing ${displayedSubtasks.length}`
                     : `共 ${subtasks.length} 个子约定，当前显示 ${displayedSubtasks.length} 个`}
                  </p>
                </div>
              </div>
              <Switch
                checked={showAllSubtasks}
                onCheckedChange={setShowAllSubtasks}
                className="data-[state=checked]:bg-blue-700"
              />
            </div>
          )}

          {/* 预览区域 */}
          <div className="flex justify-center bg-slate-100/50 p-4 md:p-8 rounded-2xl max-h-[60vh] overflow-y-auto">
            <div ref={cardRef} className={`${expandedView ? 'w-[720px]' : 'w-[450px]'} relative transition-all duration-300`}>
              {/* 主卡片 - 采用打卡风格 */}
              <div 
                className="relative bg-white rounded-3xl overflow-hidden shadow-2xl"
                style={{
                  boxShadow: `0 20px 60px -10px ${categoryColor.accent}30`
                }}
              >
                {/* 顶部渐变背景 */}
                <div 
                  className="h-32 w-full absolute top-0 left-0"
                  style={{
                    background: `linear-gradient(135deg, ${categoryColor.accent}, ${categoryColor.accent}dd)`,
                    clipPath: 'polygon(0 0, 100% 0, 100% 70%, 0 100%)'
                  }}
                />

                {/* 装饰圆环 */}
                <div className="absolute top-0 right-0 w-32 h-32 opacity-10 transform translate-x-10 -translate-y-10">
                  <div className="w-full h-full rounded-full border-[12px] border-white" />
                </div>
                <div className="absolute top-10 left-0 w-16 h-16 opacity-10 transform -translate-x-8">
                   <div className="w-full h-full rounded-full bg-white" />
                </div>

                <div className="relative z-10 px-8 pt-8 pb-10">
                  {/* 头部：日期与打卡标识 */}
                  <div className="flex justify-between items-start mb-6">
                    <div className="text-white">
                      <div className="flex items-center gap-2 mb-1 opacity-90">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm font-medium tracking-wide">{isEnglish ? "DAILY CHECK-IN" : "每日打卡"}</span>
                      </div>
                      <h3 className="text-3xl font-bold tracking-tight">
                        {format(new Date(), "dd")}
                        <span className="text-lg font-normal ml-1 opacity-80">/ {format(new Date(), "MMM", { locale: zhCN })}</span>
                      </h3>
                      <p className="text-sm opacity-80 mt-1">{format(new Date(), "EEEE", { locale: zhCN })}</p>
                    </div>

                    <div className="bg-white/20 backdrop-blur-md rounded-2xl p-2 border border-white/20">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center bg-white shadow-lg"
                        style={{ color: categoryColor.accent }}
                      >
                         {task.status === "completed" ? (
                           <CheckCircle2 className="w-8 h-8" strokeWidth={3} />
                         ) : (
                           <Target className="w-8 h-8" strokeWidth={2.5} />
                         )}
                      </div>
                    </div>
                  </div>

                  {/* 约定核心内容 */}
                  <div className="mt-8 mb-8">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider" 
                         style={{ 
                           backgroundColor: `${categoryColor.accent}15`, 
                           color: categoryColor.accent 
                         }}
                      >
                        <span className="w-2 h-2 rounded-full bg-current" />
                        {CATEGORY_LABELS[task.category]?.[isEnglish ? 'en' : 'zh'] || task.category}
                      </div>

                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                        task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        task.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        <span className="w-2 h-2 rounded-full bg-current" />
                        {PRIORITY_LABELS[task.priority]?.[isEnglish ? 'en' : 'zh'] || task.priority}
                      </div>
                    </div>

                    <h1 className="text-3xl font-black text-slate-800 leading-tight mb-4">
                      {task.title}
                    </h1>

                    {task.description && (
                      <div className="relative pl-4 border-l-2 border-slate-200 py-1 mb-6">
                        <ReactMarkdown 
                          className="prose prose-sm max-w-none text-slate-600 text-sm leading-relaxed
                            prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:text-sm prose-headings:mb-1 prose-headings:mt-2 first:prose-headings:mt-0
                            prose-p:my-1 prose-p:leading-relaxed first:prose-p:mt-0 last:prose-p:mb-0
                            prose-ul:my-1 prose-ul:list-disc prose-ul:pl-4 prose-ul:space-y-0.5
                            prose-ol:my-1 prose-ol:list-decimal prose-ol:pl-4 prose-ol:space-y-0.5
                            prose-li:text-slate-600 prose-li:text-sm
                            prose-strong:text-slate-800 prose-strong:font-semibold
                            prose-em:text-slate-600 prose-em:italic
                            prose-code:bg-slate-200 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                            prose-blockquote:border-l-2 prose-blockquote:border-slate-300 prose-blockquote:pl-2 prose-blockquote:italic
                            prose-hr:border-slate-200 prose-hr:my-2"
                        >
                          {task.description}
                        </ReactMarkdown>
                      </div>
                    )}

                    {/* 时间信息 */}
                    <div className="grid grid-cols-1 gap-2 mt-4 mb-6 bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-2 text-slate-600 min-w-[80px]">
                        <Clock className="w-4 h-4" />
                        <span className="font-medium">{isEnglish ? "Start Time" : "提醒时间"}</span>
                      </div>
                      <span className="font-semibold text-slate-800">
                        {format(new Date(task.reminder_time), isEnglish ? "MMM dd, yyyy HH:mm" : "yyyy-MM-dd HH:mm", { locale: isEnglish ? undefined : zhCN })}
                      </span>
                    </div>
                    {task.end_time && (
                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex items-center gap-2 text-slate-600 min-w-[80px]">
                          <Target className="w-4 h-4" />
                          <span className="font-medium">{isEnglish ? "End Time" : "截止时间"}</span>
                        </div>
                        <span className="font-semibold text-slate-800">
                          {format(new Date(task.end_time), isEnglish ? "MMM dd, yyyy HH:mm" : "yyyy-MM-dd HH:mm", { locale: isEnglish ? undefined : zhCN })}
                        </span>
                      </div>
                    )}
                    </div>
                  </div>

                  {/* 进度圆环/统计 */}
                  <div className="grid grid-cols-2 gap-4 mb-8">
                     <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col justify-center items-center text-center">
                        <div className="relative w-16 h-16 mb-2">
                           <svg className="w-full h-full transform -rotate-90">
                             <circle cx="32" cy="32" r="28" stroke="#e2e8f0" strokeWidth="6" fill="none" />
                             <circle 
                               cx="32" cy="32" r="28" 
                               stroke={categoryColor.accent} 
                               strokeWidth="6" 
                               fill="none" 
                               strokeDasharray={175.9}
                               strokeDashoffset={175.9 - (175.9 * progress) / 100}
                               className="transition-all duration-1000 ease-out"
                               strokeLinecap="round"
                             />
                           </svg>
                           <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-sm font-bold text-slate-700">{progress}%</span>
                           </div>
                        </div>
                        <span className="text-xs text-slate-500 font-medium">{isEnglish ? "Progress" : "完成进度"}</span>
                     </div>

                     <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col justify-center items-center text-center">
                        <div 
                          className="w-12 h-12 rounded-full mb-3 flex items-center justify-center text-white text-xl font-bold"
                          style={{ background: `linear-gradient(135deg, ${categoryColor.accent}, ${categoryColor.accent}bb)` }}
                        >
                          {completedSubtasks}
                        </div>
                        <span className="text-xs text-slate-500 font-medium">
                          {completedSubtasks === subtasks.length && subtasks.length > 0 
                            ? (isEnglish ? "All Done" : "全部完成") 
                            : (isEnglish ? "Completed" : "已完成项目")}
                        </span>
                     </div>
                  </div>

                  {/* 子约定列表 (精简版) */}
                  {displayedSubtasks.length > 0 && (
                     <div className="mb-8 bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          {isEnglish ? "CHECKLIST" : "清单"}
                          <div className="h-px bg-slate-200 flex-1" />
                        </div>
                        <div className="space-y-2">
                         {displayedSubtasks.map((subtask, index) => {
                            const isCompleted = subtask.status === "completed";
                            const title = subtask.title || '';
                            const cleanTitle = title.replace(/^\d+\.\s*/, '');
                            return (
                              <div key={subtask.id} className="flex items-center gap-3">
                                 <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-300'}`}>
                                   {isCompleted && <Check className="w-3 h-3" />}
                                 </div>
                                 <span className={`text-sm ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                   {cleanTitle}
                                 </span>
                              </div>
                            );
                         })}
                          {hasMoreSubtasks && (
                            <p className="text-xs text-slate-400 italic pl-7 pt-1">
                              + {isEnglish 
                                  ? `${subtasks.length - displayedSubtasks.length} more items` 
                                  : `还有 ${subtasks.length - displayedSubtasks.length} 项子约定`}
                            </p>
                          )}
                        </div>
                     </div>
                  )}

                  {/* 每日金句 */}
                  <div className="mb-8">
                     <div className="relative py-4 px-6 bg-yellow-50/80 rounded-xl border border-yellow-100">
                        <Quote className="absolute top-2 left-2 w-4 h-4 text-yellow-400 opacity-50 transform rotate-180" />
                        <p className="text-center text-sm font-medium text-slate-700 italic">
                          {quote}
                        </p>
                        <Quote className="absolute bottom-2 right-2 w-4 h-4 text-yellow-400 opacity-50" />
                     </div>
                  </div>

                  {/* 底部 Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2.5">
                       <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
                         <Sparkles className="w-4 h-4" />
                       </div>
                       <div>
                         <p className="text-xs font-bold text-slate-900">{isEnglish ? "SoulSentry" : "心灵存放站"}</p>
                         <p className="text-[10px] text-slate-400 uppercase tracking-wider">{isEnglish ? "Focus & Achieve" : "坚定守护 · 适时轻唤"}</p>
                       </div>
                    </div>
                    
                    {/* 二维码区域 */}
                    <div className="flex items-center gap-2">
                       <div className="text-right hidden sm:block">
                         <p className="text-[10px] text-slate-400">{isEnglish ? "Scan to view" : "扫码查看"}</p>
                         <p className="text-[10px] text-slate-400 font-mono">ID: {task.id.slice(0,4)}</p>
                       </div>
                       <div className="w-12 h-12 bg-white rounded-md p-0.5 shadow-sm border border-slate-100">
                         {/* 使用跨域属性以允许 html2canvas 捕获 */}
                         <img 
                            src={qrCodeUrl} 
                            alt="QR Code" 
                            crossOrigin="anonymous"
                            className="w-full h-full object-contain"
                         />
                       </div>
                    </div>
                  </div>

                  {/* 完成印章 */}
                  {task.status === "completed" && (
                    <div className="absolute bottom-24 right-8 transform rotate-[-15deg] opacity-90 pointer-events-none">
                      <div className="w-32 h-32 border-4 border-green-600 rounded-full flex items-center justify-center p-2" style={{ maskImage: 'url("data:image/svg+xml;base64,...")' }}> {/* 模拟印章纹理可用CSS实现，这里简化 */}
                         <div className="w-full h-full border-2 border-green-600 rounded-full flex flex-col items-center justify-center text-green-600">
                            <span className="text-xs font-bold tracking-widest uppercase">{isEnglish ? "Mission" : "任务"}</span>
                            <span className="text-xl font-black uppercase tracking-wider">{isEnglish ? "Completed" : "已完成"}</span>
                            <span className="text-[10px] font-mono mt-1">{format(new Date(), isEnglish ? "MM.dd.yyyy" : "yyyy.MM.dd")}</span>
                         </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-3 gap-3">
            <Button
              onClick={handleDownload}
              disabled={generating}
              variant="outline"
              className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2 text-slate-900" />
              {generating ? "生成中..." : "下载图片"}
            </Button>
            <Button
              onClick={handleCopyImage}
              disabled={generating}
              variant="outline"
              className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              <Copy className="w-4 h-4 mr-2" />
              复制图片
            </Button>
            <Button
              onClick={handleCopyText}
              variant="outline"
              className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              <Copy className="w-4 h-4 mr-2" />
              复制文本
            </Button>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-200">
            <div className="flex gap-3">
              <Sparkles className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900 mb-1">
                  {isEnglish ? "Smart Generation Tips" : "智能生成提示"}
                </p>
                <ul className="text-xs text-blue-800 space-y-1">
                  {isEnglish ? (
                    <>
                      <li>• Long task lists are automatically optimized for clarity</li>
                      <li>• Enable "Show All Subtasks" to generate a complete long image</li>
                      <li>• Copy text function includes all subtask information</li>
                      <li>• Click the expand button for a larger preview</li>
                    </>
                  ) : (
                    <>
                      <li>• 长约定列表将自动优化图片质量以保证清晰度</li>
                      <li>• 开启"显示所有子约定"可以生成包含完整列表的长图</li>
                      <li>• 复制文本功能会包含所有子约定信息</li>
                      <li>• 点击右上角展开按钮可以获得更大的预览视图</li>
                    </>
                  )}
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