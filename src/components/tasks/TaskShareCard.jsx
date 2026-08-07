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
import { Download, Copy, Share2, Sparkles, Circle, CheckCircle2, Clock, Target, Maximize2, Minimize2, Quote, Calendar, Award, Check, Paperclip, FileText, Link as LinkIcon, StickyNote, Palette, RefreshCw, Wand2, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { createPageUrl } from "@/utils";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";
import html2canvas from "html2canvas";
import useCollabInviteUrl from "@/lib/useCollabInviteUrl";
import { SHARE_CARD_SCENES, getScene } from "@/components/tasks/shareCardScenes";
import ShareCardTemplate from "@/components/tasks/share-templates/ShareCardTemplate";

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

// 品牌基础色（分享卡片统一使用）
const BRAND_COLOR = { accent: "#384877", bg: "#EEF1F8" };

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

// Share Card Component
export default function TaskShareCard({ task, open, onClose }) {
  const cardRef = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [showAllSubtasks, setShowAllSubtasks] = useState(false);
  const [showSubLevels, setShowSubLevels] = useState(true);
  const [expandedView, setExpandedView] = useState(false);
  const [headerImage, setHeaderImage] = useState(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [sceneId, setSceneId] = useState("brand");
  const scene = getScene(sceneId);

  const PRESET_HEADERS = [
    "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=800&q=80", // Landscape
    "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?w=800&q=80", // Nature
    "https://images.unsplash.com/photo-1534224039826-c7a0eda0e6b3?w=800&q=80", // Gradient art
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800&q=80", // Tech
    "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80", // Texture
  ];

  const handleGenerateAIImage = async () => {
    setIsGeneratingImage(true);
    try {
      const { url } = await base44.integrations.Core.GenerateImage({
        prompt: `A beautiful abstract wallpaper background for a task named "${task.title}". ${scene.aiStyle}, high quality, 4k, suitable for card header.`,
      });
      setHeaderImage(url);
      toast.success(isEnglish ? "Header image generated" : "顶图已生成");
    } catch (error) {
      console.error(error);
      toast.error(isEnglish ? "Generation failed" : "生成失败");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 查询子约定
  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', task?.id],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: task.id }),
    enabled: !!task?.id,
    initialData: [],
  });

  // 二级子约定（展开所有层级时使用）
  const { data: grandChildren = [] } = useQuery({
    queryKey: ['shareCardGrandChildren', task?.id, subtasks.map(s => s.id).join(',')],
    queryFn: async () => {
      const lists = await Promise.all(subtasks.map(s => base44.entities.Task.filter({ parent_task_id: s.id })));
      return lists.flat().filter(c => !c.deleted_at);
    },
    enabled: subtasks.length > 0,
    initialData: [],
  });

  const { data: dependencyTasks = [] } = useQuery({
    queryKey: ['dependencies', task?.id],
    queryFn: async () => {
      if (!task?.dependencies?.length) return [];
      const results = await Promise.all(task.dependencies.map(id => 
        base44.entities.Task.filter({ id }).then(res => res[0]).catch(() => null)
      ));
      return results.filter(Boolean);
    },
    enabled: !!task?.dependencies?.length,
  });

  const completedSubtasks = subtasks.filter(s => s.status === "completed").length;
  const progress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 100;

  // 二维码指向免注册协作页：对方扫码即可勾选、留言、订阅提醒，动态回流给分享者
  const collabUrl = useCollabInviteUrl({ resourceType: "task", resource: task, enabled: open });
  const taskUrl = collabUrl || (typeof window !== 'undefined'
    ? `${window.location.origin}${createPageUrl("Tasks")}?taskId=${task.id}`
    : "");

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(taskUrl)}&bgcolor=ffffff`;

  // Detect language
  const isEnglish = React.useMemo(() => {
    const allText = task.title + (task.description || "");
    const chineseChars = (allText.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalChars = allText.length;
    return chineseChars < totalChars * 0.3; // English if less than 30% Chinese
  }, [task]);

  // 金句跟随场景风格切换
  const quote = React.useMemo(() => {
    const quotes = scene.quotes[isEnglish ? "en" : "zh"];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }, [sceneId, isEnglish]);

  // html2canvas is now imported directly for better performance

  const handleDownload = async () => {
    if (!cardRef.current) return;
    
    setGenerating(true);
    let previewContainer = null;
    let originalMaxHeight = '';
    let originalOverflow = '';

    try {
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
      // 临时移除预览区域的高度限制
      previewContainer = cardRef.current.parentElement;
      if (previewContainer) {
        originalMaxHeight = previewContainer.style.maxHeight;
        originalOverflow = previewContainer.style.overflow;
        previewContainer.style.maxHeight = 'none';
        previewContainer.style.overflow = 'visible';
      }
      
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
        previewContainer = null; // 标记已恢复
      }

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
      
      if (!blob) throw new Error("图片生成失败");

      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        toast.success("约定卡片已复制到剪贴板");
      } else {
        throw new Error("浏览器不支持复制图片");
      }
    } catch (error) {
      console.error("Copy error:", error);
      toast.error("复制失败，请重试");
    } finally {
      if (previewContainer) {
        previewContainer.style.maxHeight = originalMaxHeight;
        previewContainer.style.overflow = originalOverflow;
      }
      setGenerating(false);
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
  const kids = showSubLevels ? grandChildren.filter(c => c.parent_task_id === s.id) : [];
  const kidLines = kids.map(c => `    - ${(c.title || '').replace(/^\d+\.\s*/, '')} ${c.status === "completed" ? "✅" : "⭕"}`).join('\n');
  return `${i + 1}. ${cleanTitle} ${s.status === "completed" ? "✅" : "⭕"}${kidLines ? `\n${kidLines}` : ''}`;
}).join('\n')}` : ''}

🔗 查看详情：
${taskUrl}

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

  // 分享卡片基础色跟随场景风格（默认为品牌色）
  const categoryColor = { accent: scene.accent, bg: scene.bg };
  
  // 决定显示多少子约定
  const baseSubtasks = showAllSubtasks || expandedView ? subtasks : subtasks.slice(0, 6);
  const displayedSubtasks = baseSubtasks.map(s => ({
    ...s,
    children: showSubLevels ? grandChildren.filter(c => c.parent_task_id === s.id) : [],
  }));
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
          {/* 场景风格选择 */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Sparkles className="w-4 h-4" />
              <span>{isEnglish ? "Scene Style" : "场景风格"}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {SHARE_CARD_SCENES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSceneId(s.id);
                    setHeaderImage(s.headerImage);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-semibold flex-shrink-0 transition-all ${
                    sceneId === s.id
                      ? "bg-white shadow-sm"
                      : "border-transparent bg-white/60 text-slate-500 hover:bg-white"
                  }`}
                  style={sceneId === s.id ? { borderColor: s.accent, color: s.accent } : {}}
                >
                  <span>{s.emoji}</span>
                  {s.name[isEnglish ? "en" : "zh"]}
                </button>
              ))}
            </div>
          </div>

          {/* 样式控制选项 */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
               <Palette className="w-4 h-4" />
               <span>{isEnglish ? "Header Style" : "卡片顶图"}</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
               {/* Default Gradient */}
               <button 
                 onClick={() => setHeaderImage(null)}
                 className={`w-14 h-14 rounded-xl border-2 flex-shrink-0 transition-all shadow-sm ${!headerImage ? 'border-blue-600 ring-2 ring-blue-100 ring-offset-1' : 'border-transparent hover:border-slate-300'}`}
                 style={{ background: `linear-gradient(135deg, ${categoryColor.accent}, ${categoryColor.accent}dd)` }}
                 title={isEnglish ? "Default Color" : "默认颜色"}
               />
               
               {/* Presets */}
               {PRESET_HEADERS.map((img, idx) => (
                 <button 
                   key={idx}
                   onClick={() => setHeaderImage(img)}
                   className={`w-14 h-14 rounded-xl border-2 flex-shrink-0 overflow-hidden relative transition-all shadow-sm ${headerImage === img ? 'border-blue-600 ring-2 ring-blue-100 ring-offset-1' : 'border-transparent hover:border-slate-300'}`}
                 >
                   <img src={img} className="w-full h-full object-cover" alt="preset" crossOrigin="anonymous" />
                 </button>
               ))}

               {/* AI Generate */}
               <button 
                 onClick={handleGenerateAIImage}
                 disabled={isGeneratingImage}
                 className="w-14 h-14 rounded-xl border-2 border-slate-200 border-dashed flex flex-col items-center justify-center gap-1 flex-shrink-0 bg-white hover:bg-slate-50 transition-colors group"
                 title={isEnglish ? "AI Generate" : "AI生成"}
               >
                 {isGeneratingImage ? (
                   <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                 ) : (
                   <>
                     <Wand2 className="w-5 h-5 text-purple-500 group-hover:scale-110 transition-transform" />
                     <span className="text-[10px] text-slate-500 font-medium">AI</span>
                   </>
                 )}
               </button>
            </div>
          </div>

          {/* 展开所有层级 */}
          {grandChildren.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-slate-50/80 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-slate-500" />
                <div>
                  <Label className="text-sm font-semibold text-slate-800">
                    {isEnglish ? "Expand All Levels" : "展开所有子约定层级"}
                  </Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isEnglish
                      ? `${grandChildren.length} nested items will be shown`
                      : `共 ${grandChildren.length} 个二级子约定，展开后一并显示在卡片中`}
                  </p>
                </div>
              </div>
              <Switch
                checked={showSubLevels}
                onCheckedChange={setShowSubLevels}
                className="data-[state=checked]:bg-[#384877]"
              />
            </div>
          )}

          {/* 列表控制选项 */}
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
              <ShareCardTemplate
                sceneId={sceneId}
                task={task}
                scene={scene}
                isEnglish={isEnglish}
                headerImage={headerImage}
                displayedSubtasks={displayedSubtasks}
                hasMoreSubtasks={hasMoreSubtasks}
                remaining={subtasks.length - displayedSubtasks.length}
                totalSubtasks={subtasks.length}
                progress={progress}
                completedSubtasks={completedSubtasks}
                dependencyTasks={dependencyTasks}
                qrCodeUrl={qrCodeUrl}
                quote={quote}
              />
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
                  {isEnglish ? "What is this card for?" : "这张卡片能做什么"}
                </p>
                <ul className="text-xs text-blue-800 space-y-1">
                  {isEnglish ? (
                    <>
                      <li>• Download or copy the image, then send it in chat apps or post it — friends see your promise at a glance</li>
                      <li>• Scanning the QR code opens the collaboration page: no signup needed to check items, leave notes, or subscribe to reminders</li>
                      <li>• "Copy text" gives a plain-text version with every subtask, handy where images aren't allowed</li>
                      <li>• After signing up or logging in, the shared promise syncs into their own list so you can build it together</li>
                      <li>• Turn on "Show All Subtasks" for a full-length image; the expand button gives a bigger preview</li>
                    </>
                  ) : (
                    <>
                      <li>• 下载或复制图片后，可直接发到微信/朋友圈、X、Facebook、小红书等，让朋友一眼看到你的约定</li>
                      <li>• 对方扫描卡片上的二维码即可进入协作页，无需注册就能勾选进度、留言、订阅提醒，操作内容实时反馈给分享者</li>
                      <li>•「复制文本」生成含全部子约定的纯文字版，适合不方便发图的场景</li>
                      <li>• 被分享者注册或登录后，该约定会同步到其约定列表中，双方可一起构建内容、协作推进</li>
                      <li>• 开启「显示所有子约定」可生成完整长图；点右上角展开可放大预览</li>
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