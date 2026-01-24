import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Share2, Minimize2, Maximize2, Palette, RefreshCw, Wand2 } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Check, Circle } from "lucide-react";

const PRESET_HEADERS = [
  "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=800&q=80",
  "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?w=800&q=80",
  "https://images.unsplash.com/photo-1534224039826-c7a0eda0e6b3?w=800&q=80",
  "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800&q=80",
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80",
];

export default function MultiTaskShareCard({ tasks, open, onClose }) {
  const cardRef = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [headerImage, setHeaderImage] = useState(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [expandedView, setExpandedView] = useState(false);

  // Fetch subtasks for all tasks
  const { data: allSubtasks = {} } = useQuery({
    queryKey: ['subtasks-multi', tasks.map(t => t.id).join(',')],
    queryFn: async () => {
      const result = {};
      await Promise.all(tasks.map(async (task) => {
        const subs = await base44.entities.Task.filter({ parent_task_id: task.id });
        result[task.id] = subs || [];
      }));
      return result;
    },
    enabled: tasks.length > 0
  });

  const handleGenerateAIImage = async () => {
    setIsGeneratingImage(true);
    try {
      const { url } = await base44.integrations.Core.GenerateImage({
        prompt: `A beautiful abstract wallpaper background for a task list. minimalist, artistic, high quality, 4k, suitable for card header.`,
      });
      setHeaderImage(url);
      toast.success("顶图已生成");
    } catch (error) {
      console.error(error);
      toast.error("生成失败");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    let previewContainer = null;
    let originalMaxHeight = '';
    let originalOverflow = '';

    try {
      // Temporarily remove height restrictions to capture full content
      previewContainer = cardRef.current.parentElement;
      if (previewContainer) {
        originalMaxHeight = previewContainer.style.maxHeight;
        originalOverflow = previewContainer.style.overflow;
        previewContainer.style.maxHeight = 'none';
        previewContainer.style.overflow = 'visible';
      }

      // Wait for DOM update
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        windowHeight: cardRef.current.scrollHeight,
      });
      
      // Restore styles immediately
      if (previewContainer) {
        previewContainer.style.maxHeight = originalMaxHeight;
        previewContainer.style.overflow = originalOverflow;
      }

      const link = document.createElement('a');
      link.download = `约定清单-${format(new Date(), "yyyyMMddHHmmss")}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success("图片已保存");
    } catch (error) {
      console.error(error);
      toast.error("保存失败");
    } finally {
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
        // Temporarily remove height restrictions
        previewContainer = cardRef.current.parentElement;
        if (previewContainer) {
          originalMaxHeight = previewContainer.style.maxHeight;
          originalOverflow = previewContainer.style.overflow;
          previewContainer.style.maxHeight = 'none';
          previewContainer.style.overflow = 'visible';
        }

        // Wait for DOM update
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(cardRef.current, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          allowTaint: true,
          windowHeight: cardRef.current.scrollHeight,
        });
        
        // Restore styles immediately
        if (previewContainer) {
            previewContainer.style.maxHeight = originalMaxHeight;
            previewContainer.style.overflow = originalOverflow;
        }
        
        canvas.toBlob(async (blob) => {
            if (!blob) {
                toast.error("图片生成失败");
                return;
            }
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                toast.success("图片已复制");
            } catch (err) {
                toast.error("复制失败");
            }
        });
      } catch (error) {
        console.error(error);
        toast.error("生成失败");
      } finally {
        if (previewContainer) {
            previewContainer.style.maxHeight = originalMaxHeight;
            previewContainer.style.overflow = originalOverflow;
        }
        setGenerating(false);
      }
  };

  const handleCopyText = () => {
    const text = `【约定清单】\n\n` + tasks.map((t, i) => {
        const status = t.status === 'completed' ? '✅' : '⭕';
        const time = t.reminder_time ? ` [${format(new Date(t.reminder_time), "MM-dd HH:mm")}]` : '';
        return `${i + 1}. ${t.title}${time} ${status}`;
    }).join('\n') + `\n\n来自「SoulSentry」`;
    
    navigator.clipboard.writeText(text);
    toast.success("文本已复制");
  };

  if (!tasks || tasks.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`${expandedView ? 'max-w-4xl' : 'max-w-2xl'} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-blue-700" />
              分享约定清单 ({tasks.length})
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
            {/* Header Selection */}
            <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Palette className="w-4 h-4" />
                    <span>卡片顶图</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    <button 
                       onClick={() => setHeaderImage(null)}
                       className={`w-14 h-14 rounded-xl border-2 flex-shrink-0 transition-all shadow-sm ${!headerImage ? 'border-blue-600 ring-2 ring-blue-100 ring-offset-1' : 'border-transparent hover:border-slate-300'}`}
                       style={{ background: `linear-gradient(135deg, #384877, #3b5aa2)` }}
                    />
                    {PRESET_HEADERS.map((img, idx) => (
                       <button 
                         key={idx}
                         onClick={() => setHeaderImage(img)}
                         className={`w-14 h-14 rounded-xl border-2 flex-shrink-0 overflow-hidden relative transition-all shadow-sm ${headerImage === img ? 'border-blue-600 ring-2 ring-blue-100 ring-offset-1' : 'border-transparent hover:border-slate-300'}`}
                       >
                         <img src={img} className="w-full h-full object-cover" alt="preset" crossOrigin="anonymous" />
                       </button>
                    ))}
                     <button 
                       onClick={handleGenerateAIImage}
                       disabled={isGeneratingImage}
                       className="w-14 h-14 rounded-xl border-2 border-slate-200 border-dashed flex flex-col items-center justify-center gap-1 flex-shrink-0 bg-white hover:bg-slate-50 transition-colors group"
                     >
                       {isGeneratingImage ? <RefreshCw className="w-5 h-5 animate-spin text-blue-600" /> : <Wand2 className="w-5 h-5 text-purple-500" />}
                     </button>
                </div>
            </div>

            {/* Preview */}
            <div className="flex justify-center bg-slate-100/50 p-4 md:p-8 rounded-2xl max-h-[60vh] overflow-y-auto">
                <div ref={cardRef} className={`${expandedView ? 'w-[720px]' : 'w-[450px]'} bg-white rounded-3xl overflow-hidden shadow-2xl relative`}>
                    {/* Header */}
                    {headerImage ? (
                        <div className="h-40 w-full relative">
                           <img src={headerImage} className="w-full h-full object-cover" crossOrigin="anonymous" />
                           <div className="absolute inset-0 bg-black/20" />
                        </div>
                    ) : (
                        <div className="h-40 w-full bg-gradient-to-br from-[#384877] to-[#3b5aa2]" />
                    )}
                    
                    <div className="px-8 -mt-12 relative z-10">
                        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
                            <h2 className="text-2xl font-bold text-slate-800 mb-2">约定清单</h2>
                            <p className="text-slate-500 text-sm">{format(new Date(), "yyyy年MM月dd日 EEEE", { locale: zhCN })}</p>
                        </div>
                        
                        <div className="space-y-3 pb-8">
                            {tasks.map((task, idx) => (
                                <React.Fragment key={task.id}>
                                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 ${task.status === 'completed' ? 'bg-green-500' : 'bg-slate-400'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-medium text-base mb-1 ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                            {task.title}
                                        </div>
                                        
                                        {task.description && (
                                            <div className="text-sm text-slate-600 mb-2 leading-relaxed bg-white/50 p-2 rounded-lg border border-slate-100/50">
                                                {task.description}
                                            </div>
                                        )}

                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            {task.reminder_time && (
                                                <div className="text-xs text-slate-500 flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                    {format(new Date(task.reminder_time), "MM-dd HH:mm")}
                                                </div>
                                            )}
                                            {task.category && (
                                                <div className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200/50 px-1.5 py-0.5 rounded">
                                                    {task.category}
                                                </div>
                                            )}
                                            {task.priority && task.priority !== 'medium' && (
                                                <div className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                                    task.priority === 'high' || task.priority === 'urgent' 
                                                        ? 'bg-red-50 text-red-600' 
                                                        : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {task.priority}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {task.status === 'completed' && (
                                        <div className="text-green-600 text-xs font-bold px-2 py-1 bg-green-50 rounded-lg">完成</div>
                                    )}
                                </div>
                                
                                {/* 子约定列表 */}
                                {allSubtasks[task.id] && allSubtasks[task.id].length > 0 && (
                                    <div className="ml-11 mt-2 mb-4 space-y-1">
                                        {allSubtasks[task.id].map((st, sIdx) => (
                                            <div key={st.id} className="flex items-center gap-2 text-sm text-slate-600">
                                                {st.status === 'completed' ? (
                                                    <Check className="w-3.5 h-3.5 text-green-500" />
                                                ) : (
                                                    <Circle className="w-3.5 h-3.5 text-slate-300" />
                                                )}
                                                <span className={st.status === 'completed' ? 'line-through text-slate-400' : ''}>
                                                    {st.title}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </React.Fragment>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pb-6 pt-4 border-t border-slate-100">
                             <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-[#384877] flex items-center justify-center text-white font-bold text-xs">
                                    SS
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-900">SoulSentry</p>
                                    <p className="text-[10px] text-slate-400">Focus & Achieve</p>
                                </div>
                             </div>
                             <div className="text-[10px] text-slate-400">
                                共 {tasks.length} 项约定
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-3">
                <Button onClick={handleDownload} disabled={generating} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    下载图片
                </Button>
                <Button onClick={handleCopyImage} disabled={generating} variant="outline">
                    <Copy className="w-4 h-4 mr-2" />
                    复制图片
                </Button>
                <Button onClick={handleCopyText} variant="outline">
                    <Copy className="w-4 h-4 mr-2" />
                    复制文本
                </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}