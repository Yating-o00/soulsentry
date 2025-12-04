import React from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pin, Trash2, Edit, Copy, MoreHorizontal, ListTodo, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const COLORS = {
  white: "bg-white hover:border-slate-300",
  red: "bg-red-50 hover:border-red-300",
  orange: "bg-orange-50 hover:border-orange-300",
  yellow: "bg-yellow-50 hover:border-yellow-300",
  green: "bg-green-50 hover:border-green-300",
  blue: "bg-blue-50 hover:border-blue-300",
  purple: "bg-purple-50 hover:border-purple-300",
  pink: "bg-pink-50 hover:border-pink-300",
};

export default function NoteCard({ note, onEdit, onDelete, onPin, onCopy, onConvertToTask }) {
  const colorClass = COLORS[note.color] || COLORS.white;

  const handleCopy = () => {
    navigator.clipboard.writeText(note.plain_text);
    toast.success("内容已复制");
    if (onCopy) onCopy();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="mb-4 break-inside-avoid"
    >
      <Card className={`group relative border border-transparent shadow-sm hover:shadow-md transition-all duration-200 ${colorClass}`}>
        <div className="p-4">
          {/* Content Preview */}
          <div 
            className="prose prose-sm max-w-none mb-3 text-slate-700 line-clamp-[10]"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
          
          {note.ai_analysis?.summary && (
            <div className="mb-3 p-2 bg-black/5 rounded text-xs text-slate-600 border-l-2 border-purple-400">
                <div className="flex items-center gap-1 mb-1 font-medium opacity-75">
                    <Sparkles className="w-3 h-3" />
                    摘要
                </div>
                {note.ai_analysis.summary}
            </div>
          )}

          {/* Tags */}
          {note.tags && note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {note.tags.map(tag => (
                <Badge 
                  key={tag} 
                  variant="secondary" 
                  className="bg-black/5 text-slate-600 hover:bg-black/10 text-[10px] px-1.5 py-0 border-0"
                >
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between text-slate-400 pt-2 mt-2 border-t border-black/5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px]">
              {format(new Date(note.updated_date || note.created_date), "MM-dd HH:mm", { locale: zhCN })}
            </span>
            
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${note.is_pinned ? 'text-blue-600 bg-blue-100' : 'hover:bg-black/5'}`}
                onClick={(e) => { e.stopPropagation(); onPin(note); }}
                title={note.is_pinned ? "取消置顶" : "置顶"}
              >
                <Pin className="w-3.5 h-3.5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-black/5"
                onClick={(e) => { e.stopPropagation(); onEdit(note); }}
                title="编辑"
              >
                <Edit className="w-3.5 h-3.5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-black/5">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCopy}>
                    <Copy className="w-4 h-4 mr-2" />
                    复制文本
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onConvertToTask(note); }}>
                    <ListTodo className="w-4 h-4 mr-2" />
                    转为任务
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); onDelete(note); }}
                    className="text-red-600 focus:text-red-700 focus:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    删除便签
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          {/* Mobile Pin Indicator (Always visible if pinned) */}
          {note.is_pinned && (
            <div className="absolute top-2 right-2 text-blue-500 lg:hidden">
                <Pin className="w-3.5 h-3.5 fill-current" />
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}