import React, { useState, useRef } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, X, Save, ListTodo, Wand2, RefreshCw, PenLine, Play, Camera, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const COLORS = [
  { name: "white", class: "bg-white border-slate-200" },
  { name: "red", class: "bg-red-50 border-red-200" },
  { name: "orange", class: "bg-orange-50 border-orange-200" },
  { name: "yellow", class: "bg-yellow-50 border-yellow-200" },
  { name: "green", class: "bg-green-50 border-green-200" },
  { name: "blue", class: "bg-blue-50 border-blue-200" },
  { name: "purple", class: "bg-purple-50 border-purple-200" },
  { name: "pink", class: "bg-pink-50 border-pink-200" },
];

export default function NoteEditor({ onSave, onClose, initialData = null }) {
  const [content, setContent] = useState(initialData?.content || "");
  const [tags, setTags] = useState(initialData?.tags || []);
  const [color, setColor] = useState(initialData?.color || "white");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(initialData?.ai_analysis || null);
  const [showAIWriter, setShowAIWriter] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isEphemeral, setIsEphemeral] = useState(initialData?.is_ephemeral || false);
  const quillRef = useRef(null);
  const fileInputRef = useRef(null);

  // 智能标签推荐 (Debounced)
  React.useEffect(() => {
    const plainText = content.replace(/<[^>]+>/g, '').trim(); // Simple strip
    if (!plainText || plainText.length < 5) return;

    const timer = setTimeout(async () => {
      try {
        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `Based on this note content, suggest 3 relevant short tags. Return ONLY a JSON object: {"tags": ["tag1", "tag2", "tag3"]}. Content: "${plainText.slice(0, 200)}..."`,
          response_json_schema: {
            type: "object",
            properties: {
              tags: { type: "array", items: { type: "string" } }
            }
          }
        });
        if (res && res.tags) {
          const newSuggestions = res.tags.filter(t => !tags.includes(t));
          setSuggestedTags(newSuggestions);
        }
      } catch (e) {
        console.error("AI标签建议失败:", e);
        if (e.message) {
          console.error("错误详情:", e.message);
        }
      }
    }, 2000); // 2s debounce for notes

    return () => clearTimeout(timer);
  }, [content, tags]);

  const addSuggestedTag = (tag) => {
    if (!tags.includes(tag)) {
        setTags([...tags, tag]);
        setSuggestedTags(prev => prev.filter(t => t !== tag));
    }
  };

  const handleAIGenerate = async (mode) => {
    if (!quillRef.current) {
      toast.error("编辑器未就绪");
      return;
    }

    setIsGenerating(true);
    const editor = quillRef.current.getEditor();
    const currentText = editor.getText().trim();
    const currentHtml = editor.root.innerHTML;

    let systemPrompt = "";
    let userPrompt = "";

    if (mode === "draft") {
      if (!aiPrompt.trim()) {
        toast.error("请输入写作指令");
        setIsGenerating(false);
        return;
      }
      systemPrompt = "You are a helpful writing assistant. Generate content based on the user's request. Output formatted HTML directly (using <p>, <ul>, <strong>, etc) suitable for a rich text editor. Do not wrap in ```html block.";
      userPrompt = `Write a note about: ${aiPrompt}`;
    } else if (mode === "continue") {
      if (!currentText) {
        toast.error("心签为空，无法续写");
        setIsGenerating(false);
        return;
      }
      systemPrompt = "You are a helpful writing assistant. Continue the text naturally based on the context provided. Output formatted HTML directly. Keep the style consistent.";
      userPrompt = `Context: "${currentText.slice(-500)}"\n\nContinue writing:`;
    } else if (mode === "rewrite") {
       if (!currentText) {
        toast.error("心签为空，无法改写");
        setIsGenerating(false);
        return;
      }
      systemPrompt = "You are a helpful writing assistant. Rewrite/Polish the following text to be more clear, professional, and well-structured. Output formatted HTML directly.";
      userPrompt = `Original text: "${currentText}"\n\nRewrite it:`;
    }

    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n${userPrompt}`,
      });

      // Clean up markdown code blocks if LLM adds them despite instructions
      let generatedHtml = res.replace(/^```html\s*/, '').replace(/\s*```$/, '');

      if (mode === "draft") {
        const range = editor.getSelection(true);
        editor.clipboard.dangerouslyPasteHTML(range ? range.index : 0, generatedHtml);
        toast.success("已生成初稿");
        setShowAIWriter(false);
        setAiPrompt("");
      } else if (mode === "continue") {
        const length = editor.getLength();
        editor.clipboard.dangerouslyPasteHTML(length, generatedHtml);
        toast.success("已续写内容");
        setShowAIWriter(false);
      } else if (mode === "rewrite") {
        editor.root.innerHTML = generatedHtml;
        toast.success("已改写内容");
        setShowAIWriter(false);
      }
      // Update state
      setContent(editor.root.innerHTML);
    } catch (error) {
      console.error("AI生成失败:", error);
      const errorMsg = error?.message || error?.toString() || "未知错误";
      toast.error(`生成失败: ${errorMsg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnalyze = async () => {
    if (!quillRef.current) {
      toast.error("编辑器未就绪");
      return;
    }

    const editor = quillRef.current.getEditor();
    const text = editor.getText().trim();
    // Preserve formatting while getting HTML
    const currentHtml = editor.root.innerHTML;

    if (!text) {
      toast.error("请先输入一些内容");
      return;
    }

    setIsAnalyzing(true);
    try {
      // Extract media URLs (images and videos) for multimodal analysis
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = currentHtml;
      const imgUrls = Array.from(tempDiv.querySelectorAll('img')).map(img => img.src);
      const videoUrls = Array.from(tempDiv.querySelectorAll('iframe')).map(v => v.src);
      // Filter out very large Data URIs to prevent payload issues if necessary, 
      // but keeping them allows analyzing pasted screenshots if supported by backend.
      // For now, we pass all valid sources.
      const mediaUrls = [...imgUrls, ...videoUrls].filter(src => src && src.length > 0);

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this note content deeply, including any attached images or videos.
        
        Tasks:
        1. Visual Analysis (Multimodal):
           - Analyze any images/videos for key objects, scenes, text (OCR), diagrams, or people.
           - EXTRACT VISUAL HIGHLIGHTS: What are the most important visual elements?
        2. Extract Key Entities: names, locations, dates, orgs, urls.
        3. Generate Summaries:
           - "summary": A concise 1-sentence summary combining text and visual insights.
           - "key_points": A list of 3-5 key takeaways. IF IMAGES/VIDEOS ARE PRESENT, explicitly mention the visual highlights in these points (e.g., "Image shows design mockup with...").
        4. Generate Tags: 3-5 relevant tags.

        Text Content:
        "${text}"

        Return JSON matching the schema.`,
        file_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
        response_json_schema: {
          type: "object",
          properties: {
            tags: { type: "array", items: { type: "string" } },
            summary: { type: "string", description: "One sentence summary" },
            key_points: { type: "array", items: { type: "string" }, description: "List of key points" },
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  type: { type: "string", enum: ["person", "location", "date", "org", "url"] }
                },
                required: ["text", "type"]
              }
            }
          },
          required: ["tags", "summary", "key_points", "entities"]
        }
      });

      if (res) {
        const newTags = Array.from(new Set([...tags, ...(res.tags || [])]));
        setTags(newTags);
        setAiAnalysis({
          summary: res.summary,
          key_points: res.key_points,
          entities: res.entities
        });

        // Highlight entities in editor content
        let newHtml = currentHtml;
        // Sort entities by length desc to replace longest first (avoids partial replacement issues)
        const sortedEntities = [...(res.entities || [])].sort((a, b) => b.text.length - a.text.length);
        
        sortedEntities.forEach(entity => {
            if (!entity.text || entity.text.length < 2) return; // Skip very short entities

            // Regex to find text content not inside HTML tags
            // This is still a heuristic but better than nothing
            const regex = new RegExp(`(${entity.text})(?![^<]*>|[^<>]*<\\/)`, "gi");
            
            const colorMap = {
                person: "#dbeafe", // blue-100
                location: "#dcfce7", // green-100
                date: "#fef9c3", // yellow-100
                org: "#f3e8ff", // purple-100
                url: "#ffedd5" // orange-100
            };
            
            const color = colorMap[entity.type] || '#f1f5f9';
            const replacement = `<span style="background-color: ${color}; border-radius: 4px; padding: 0 2px; border-bottom: 1px solid ${color.replace('100', '300')}40;">$1</span>`;
            
            // Only replace if we don't suspect it's already wrapped (heuristic)
            if (!newHtml.includes(`style="background-color: ${color}`) || !newHtml.includes(entity.text)) {
               newHtml = newHtml.replace(regex, replacement);
            }
        });
        
        if (newHtml !== currentHtml) {
            setContent(newHtml);
        }

        toast.success("AI 深度分析完成");
      }
    } catch (error) {
      console.error("AI分析失败:", error);
      const errorMsg = error?.message || error?.toString() || "未知错误";
      toast.error(`AI分析失败: ${errorMsg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = () => {
    if (!quillRef.current) {
      toast.error("编辑器未就绪");
      return;
    }

    const editor = quillRef.current.getEditor();
    const plainText = editor.getText().trim();
    
    if (!plainText && !content.includes("<img")) {
        // Allow save if there's an image even if no text, but basic check
        if (!content.trim()) {
            toast.error("内容不能为空");
            return;
        }
    }

    onSave({
      content,
      plain_text: plainText,
      tags,
      color,
      is_pinned: initialData?.is_pinned || false,
      ai_analysis: aiAnalysis,
      is_ephemeral: isEphemeral,
      last_active_at: new Date().toISOString(),
      ephemeral_ttl_minutes: 5
    });
    
    if (!initialData) {
        setContent("");
        setTags([]);
        setColor("white");
        setIsEphemeral(false);
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleImageUpload = async (file) => {
    if (!file || !quillRef.current) return;

    setIsUploading(true);
    try {
      const response = await base44.integrations.Core.UploadFile({ file });
      const imageUrl = response.file_url;

      // Insert image into editor
      const editor = quillRef.current.getEditor();
      const range = editor.getSelection(true);
      editor.insertEmbed(range.index, 'image', imageUrl);
      editor.setSelection(range.index + 1);

      toast.success("图片已上传");
    } catch (error) {
      console.error("上传失败:", error);
      toast.error("图片上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div 
      className={`rounded-2xl border-2 shadow-xl overflow-hidden transition-all duration-300 ${COLORS.find(c => c.name === color)?.class || "bg-white border-slate-200"} hover:shadow-2xl`}
      onMouseDown={(e) => {
        // Allow ReactQuill to handle its own events
        if (e.target.closest('.ql-editor') || e.target.closest('.ql-toolbar')) {
          return;
        }
      }}
      onClick={(e) => {
        // Prevent parent click handlers
        e.stopPropagation();
      }}
    >
      <div className="p-5">
        <div className="mb-5 bg-white/80 rounded-xl border border-slate-100 overflow-hidden shadow-inner">
            <ReactQuill
            theme="snow"
            value={content}
            onChange={setContent}
            ref={quillRef}
            placeholder="✨ 在这里记下你的想法、粘贴图片或链接... 支持丰富的格式编辑"
            modules={{
                toolbar: [
                ['bold', 'italic', 'underline', 'strike'],
                ['blockquote', 'code-block'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'header': [1, 2, 3, false] }],
                ['link', 'image', 'video'],
                ['clean']
                ],
            }}
            className="border-none [&_.ql-container]:min-h-[140px] [&_.ql-editor]:text-base [&_.ql-editor]:leading-relaxed"
            />
        </div>

        <div className="flex flex-wrap gap-2 mb-4" onMouseDown={(e) => e.stopPropagation()}>
            <AnimatePresence>
            {tags.map(tag => (
                <motion.div
                key={tag}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                >
                <Badge variant="secondary" className="bg-white/80 hover:bg-white text-slate-700 border border-slate-200 pl-2 pr-1 py-1 gap-1">
                    #{tag}
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeTag(tag);
                        }} 
                        className="hover:bg-slate-200 rounded-full p-0.5"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </Badge>
                </motion.div>
            ))}
            </AnimatePresence>
            
            {/* 推荐标签 */}
            {suggestedTags.length > 0 && (
                <div className="flex items-center gap-1 ml-1 mr-2">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    {suggestedTags.map(tag => (
                        <Badge 
                            key={tag} 
                            variant="outline" 
                            className="cursor-pointer border-dashed border-purple-300 text-purple-600 hover:bg-purple-50 text-[10px] px-1.5"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                addSuggestedTag(tag);
                            }}
                        >
                            +{tag}
                        </Badge>
                    ))}
                </div>
            )}

            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAnalyze();
                }}
                disabled={isAnalyzing}
                className="h-8 px-3 text-xs font-medium text-white bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2c3b63] hover:to-[#2d4680] rounded-lg gap-1.5 shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
                {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                AI 智能分析
            </button>
            
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowAIWriter(true);
                }}
                className="h-8 px-3 text-xs font-medium text-white bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-lg gap-1.5 shadow-md hover:shadow-lg transition-all duration-200 flex items-center"
            >
                <Wand2 className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">AI 写作助手</span>
                <span className="sm:hidden">AI</span>
            </button>

            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    fileInputRef.current?.click();
                }}
                disabled={isUploading}
                className="h-8 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg gap-1.5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center disabled:opacity-50"
            >
                {isUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                    <Camera className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">上传图片</span>
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageUpload(e.target.files?.[0])}
            />
            
            <Dialog open={showAIWriter} onOpenChange={setShowAIWriter}>
                <DialogTrigger asChild>
                    <span className="hidden" />
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-purple-700">
                            <Wand2 className="w-5 h-5" />
                            AI 写作助手
                        </DialogTitle>
                    </DialogHeader>
                    <Tabs defaultValue="draft" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="draft">生成初稿</TabsTrigger>
                            <TabsTrigger value="continue">续写</TabsTrigger>
                            <TabsTrigger value="rewrite">润色改写</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="draft" className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label>你想要写什么？</Label>
                                <Textarea 
                                    placeholder="例如：写一篇关于AI在健康领域应用的心签..."
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    className="h-24 resize-none"
                                />
                            </div>
                            <Button 
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleAIGenerate("draft");
                                }} 
                                disabled={isGenerating || !aiPrompt.trim()}
                                className="w-full bg-purple-600 hover:bg-purple-700 cursor-pointer"
                            >
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PenLine className="w-4 h-4 mr-2" />}
                                开始生成
                            </Button>
                        </TabsContent>

                        <TabsContent value="continue" className="space-y-4 pt-4">
                            <div className="bg-slate-50 p-4 rounded-lg text-sm text-slate-600">
                                <p>AI 将根据当前心签的上下文，自动续写下一段内容。</p>
                            </div>
                            <Button 
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleAIGenerate("continue");
                                }} 
                                disabled={isGenerating}
                                className="w-full bg-blue-600 hover:bg-blue-700 cursor-pointer"
                            >
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                智能续写
                            </Button>
                        </TabsContent>

                        <TabsContent value="rewrite" className="space-y-4 pt-4">
                             <div className="bg-slate-50 p-4 rounded-lg text-sm text-slate-600">
                                <p>AI 将优化当前内容的结构、语气和流畅度，使其更加专业。</p>
                                <p className="text-xs text-red-500 mt-2">* 注意：这将替换当前全部内容</p>
                            </div>
                            <Button 
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleAIGenerate("rewrite");
                                }} 
                                disabled={isGenerating}
                                className="w-full bg-orange-500 hover:bg-orange-600 cursor-pointer"
                            >
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                                一键润色
                            </Button>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>
        </div>

        {/* AI Analysis Result Area */}
        {aiAnalysis && (
            <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mb-4 bg-slate-50/80 rounded-lg p-3 border border-slate-100 space-y-3"
            >
                {aiAnalysis.summary && (
                    <div className="text-xs text-slate-600">
                        <div className="flex items-center gap-1 font-semibold text-purple-700 mb-1">
                            <Sparkles className="w-3 h-3" />
                            智能摘要
                        </div>
                        <p>{aiAnalysis.summary}</p>
                    </div>
                )}
                {aiAnalysis.key_points && aiAnalysis.key_points.length > 0 && (
                     <div className="text-xs text-slate-600">
                        <div className="flex items-center gap-1 font-semibold text-blue-700 mb-1">
                            <ListTodo className="w-3 h-3" />
                            核心要点
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 ml-1 text-slate-600">
                            {aiAnalysis.key_points.map((p, i) => (
                                <li key={i}>{p}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </motion.div>
        )}

        <div className="flex flex-col gap-3 pt-4 border-t border-slate-200" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-600">颜色标记</span>
                <div className="flex gap-1.5">
                    {COLORS.map(c => (
                        <button
                        key={c.name}
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setColor(c.name);
                        }}
                        className={`w-7 h-7 rounded-lg border-2 ${c.name === 'white' ? 'bg-white' : `bg-${c.name}-100`} ${color === c.name ? 'ring-2 ring-offset-2 ring-[#384877] scale-110' : 'hover:scale-110 hover:border-slate-300'} transition-all duration-200 shadow-sm`}
                        style={{ backgroundColor: c.name === 'white' ? '#ffffff' : undefined }}
                        title={c.name}
                        />
                    ))}
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsEphemeral(!isEphemeral);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all duration-200 ${
                        isEphemeral 
                            ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white border-orange-500 shadow-lg' 
                            : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300'
                    }`}
                >
                    <span className="text-sm">🔥</span>
                    <span className="text-xs font-medium">阅后即焚</span>
                </button>
                {isEphemeral && (
                    <span className="text-xs text-orange-600">
                        5分钟后自动删除
                    </span>
                )}
            </div>
            
            <div className="flex justify-end">
                <div className="flex gap-2">
                    {onClose && (
                        <button 
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onClose();
                            }}
                            className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                            取消
                        </button>
                    )}
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSave();
                        }} 
                        className="px-4 py-2 bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2c3b63] hover:to-[#2d4680] text-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        保存心签
                    </button>
                </div>
            </div>
        </div>
      </div>
      
      {/* Tailwind dynamic classes safelist mostly handled by style tag or consistent naming, 
          but for colors we might need to ensure they are generated. 
          Since I can't config tailwind config, I used standard classes in the const. 
      */}
    </div>
  );
}