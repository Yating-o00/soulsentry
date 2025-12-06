import React, { useState, useRef } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, X, Save, ListTodo } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";

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
  const quillRef = useRef(null);

  const handleAnalyze = async () => {
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
        1. Visual Analysis (if images/videos provided):
           - Identify key objects, scenes, text (OCR), or people in the visuals.
           - Incorporate visual insights into the summary and key points.
        2. Extract Key Entities: names (person), locations, dates/times, organizations, websites (url).
           - Be precise. For Chinese names, ensure full names are captured.
        3. Generate Summaries:
           - "summary": A concise 1-sentence summary of the main idea (combining text and visual context).
           - "key_points": A list of 3-5 key takeaways or action items.
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
      console.error("AI Analysis failed", error);
      toast.error("AI 分析失败");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = () => {
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
      ai_analysis: aiAnalysis
    });
    
    if (!initialData) {
        setContent("");
        setTags([]);
        setColor("white");
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden transition-colors duration-300 ${COLORS.find(c => c.name === color)?.class || "bg-white border-slate-200"}`}>
      <div className="p-4">
        <div className="min-h-[120px] mb-4 bg-white/50 rounded-lg">
            <ReactQuill
            theme="snow"
            value={content}
            onChange={setContent}
            ref={quillRef}
            placeholder="记下你的想法、粘贴图片或链接..."
            modules={{
                toolbar: [
                ['bold', 'italic', 'underline', 'strike'],
                ['blockquote', 'code-block'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link', 'image', 'video'],
                ['clean']
                ],
            }}
            className="border-none"
            />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
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
                    <button onClick={() => removeTag(tag)} className="hover:bg-slate-200 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                    </button>
                </Badge>
                </motion.div>
            ))}
            </AnimatePresence>
            <Button
                variant="ghost"
                size="sm"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="h-7 text-xs text-[#384877] hover:bg-[#384877]/10 rounded-full gap-1.5 border border-[#384877]/20"
            >
                {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                AI 智能分析
            </Button>
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

        <div className="flex items-center justify-between pt-2 border-t border-black/5">
            <div className="flex gap-1">
                {COLORS.map(c => (
                    <button
                    key={c.name}
                    onClick={() => setColor(c.name)}
                    className={`w-6 h-6 rounded-full border ${c.name === 'white' ? 'bg-white' : `bg-${c.name}-100`} ${color === c.name ? 'ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'} transition-all`}
                    style={{ backgroundColor: c.name === 'white' ? '#ffffff' : undefined }} // Tailwind dyn classes fix
                    />
                ))}
            </div>
            <div className="flex gap-2">
                {onClose && (
                    <Button variant="ghost" onClick={onClose}>取消</Button>
                )}
                <Button onClick={handleSave} className="bg-[#384877] hover:bg-[#2c3b63] text-white">
                    <Save className="w-4 h-4 mr-2" />
                    保存便签
                </Button>
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