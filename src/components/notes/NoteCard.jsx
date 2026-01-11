import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pin, Trash2, Edit, Copy, MoreHorizontal, ListTodo, Sparkles, Share2, Users, Brain, Flame, Clock } from "lucide-react";
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

export default function NoteCard({ note, onEdit, onDelete, onPin, onCopy, onConvertToTask, onShare, onSaveToKnowledge, onUpdateInteraction }) {
  const colorClass = COLORS[note.color] || COLORS.white;
  const [timeLeft, setTimeLeft] = useState(null);

  // Calculate time left for burn after read notes
  useEffect(() => {
    if (!note.burn_after_read || !note.last_interaction_at) return;

    const updateTimer = () => {
      const lastInteraction = new Date(note.last_interaction_at);
      const burnTimeMs = note.burn_timeout_minutes * 60 * 1000;
      const expiryTime = lastInteraction.getTime() + burnTimeMs;
      const now = Date.now();
      const remaining = expiryTime - now;

      if (remaining <= 0) {
        setTimeLeft(null);
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimeLeft({ minutes, seconds, total: remaining });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [note.burn_after_read, note.last_interaction_at, note.burn_timeout_minutes]);

  const handleCopy = () => {
    navigator.clipboard.writeText(note.plain_text);
    toast.success("内容已复制");
    if (onCopy) onCopy();
  };

  const handleInteraction = () => {
    if (note.burn_after_read && onUpdateInteraction) {
      onUpdateInteraction(note);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="mb-4 break-inside-avoid"
      onClick={handleInteraction}
    >
      <Card className={`group relative border ${note.burn_after_read ? 'border-orange-300' : 'border-transparent'} shadow-sm hover:shadow-md transition-all duration-200 ${colorClass}`}>
        {/* Burn After Read Timer */}
        {note.burn_after_read && timeLeft && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-2 right-2 z-10"
          >
            <Badge className="bg-orange-500 text-white border-0 shadow-lg flex items-center gap-1 px-2 py-1">
              <Flame className="w-3 h-3 animate-pulse" />
              <span className="text-xs font-mono">
                {timeLeft.minutes}:{timeLeft.seconds.toString().padStart(2, '0')}
              </span>
            </Badge>
          </motion.div>
        )}
        <div className="p-4">
          {/* Content Preview */}
          <div 
            className="prose prose-sm max-w-none mb-3 text-slate-700 line-clamp-[10]"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
          
          {note.ai_analysis && (
            <div className="mb-3 space-y-2">
                {note.ai_analysis.summary && (
                    <div className="p-2.5 bg-white/50 rounded-lg text-xs text-slate-600 border border-purple-100 shadow-sm">
                        <div className="flex items-center gap-1 mb-1.5 font-medium text-purple-700">
                            <Sparkles className="w-3 h-3" />
                            智能摘要
                        </div>
                        <p className="leading-relaxed">{note.ai_analysis.summary}</p>
                    </div>
                )}
                
                {note.ai_analysis.key_points && note.ai_analysis.key_points.length > 0 && (
                    <div className="p-2.5 bg-white/50 rounded-lg text-xs text-slate-600 border border-blue-100 shadow-sm">
                         <div className="flex items-center gap-1 mb-1.5 font-medium text-blue-700">
                            <ListTodo className="w-3 h-3" />
                            要点总结
                        </div>
                        <ul className="list-disc list-inside space-y-1 ml-1">
                            {note.ai_analysis.key_points.map((point, idx) => (
                                <li key={idx} className="leading-relaxed">{point}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {note.ai_analysis.entities && note.ai_analysis.entities.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {note.ai_analysis.entities.map((entity, idx) => {
                            const styles = {
                                person: "bg-blue-50 text-blue-700 border-blue-100",
                                location: "bg-green-50 text-green-700 border-green-100",
                                date: "bg-yellow-50 text-yellow-700 border-yellow-100",
                                org: "bg-purple-50 text-purple-700 border-purple-100",
                                url: "bg-orange-50 text-orange-700 border-orange-100"
                            };
                            return (
                                <span key={idx} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${styles[entity.type] || "bg-gray-50"}`}>
                                    {entity.text}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
          )}

          {/* Tags & Status */}
          {((note.tags && note.tags.length > 0) || note.is_shared) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {note.tags?.map(tag => (
                <Badge 
                  key={tag} 
                  variant="secondary" 
                  className="bg-black/5 text-slate-600 hover:bg-black/10 text-[10px] px-1.5 py-0 border-0"
                >
                  #{tag}
                </Badge>
              ))}
              {note.is_shared && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-600">
                  <Users className="w-2.5 h-2.5 mr-0.5" />
                  已协作
                </Badge>
              )}
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
                onClick={(e) => { 
                  e.stopPropagation(); 
                  handleInteraction();
                  onEdit(note); 
                }}
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
                  {onSaveToKnowledge && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSaveToKnowledge(note); }}>
                      <Brain className="w-4 h-4 mr-2" />
                      保存到知识库
                    </DropdownMenuItem>
                  )}
                  {onShare && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onShare(note); }}>
                      <Share2 className="w-4 h-4 mr-2" />
                      分享协作
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem 
                    onClick={(e) => { e.stopPropagation(); onDelete(note); }}
                    className="text-red-600 focus:text-red-700 focus:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    删除心签
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