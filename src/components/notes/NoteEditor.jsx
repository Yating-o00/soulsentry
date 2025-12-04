import React, { useState, useRef } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, X, Save } from "lucide-react";
import AINoteAssistant from "./AINoteAssistant";
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
  const quillRef = useRef(null);
  
  const getPlainText = () => {
    if (!quillRef.current) return "";
    const editor = quillRef.current.getEditor();
    return editor.getText().trim();
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
      is_pinned: initialData?.is_pinned || false
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
        </div>

        <AINoteAssistant 
            noteContent={getPlainText()}
            onTagsGenerated={(newTags) => {
                const mergedTags = Array.from(new Set([...tags, ...newTags]));
                setTags(mergedTags);
            }}
            onSummaryGenerated={(summary) => {
                // Optional: Save summary to note if you update the entity schema
            }}
        />

        <div className="flex items-center justify-between pt-4 mt-2 border-t border-black/5">
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