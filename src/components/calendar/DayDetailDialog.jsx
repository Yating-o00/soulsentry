import React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, StickyNote, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PRIORITY_COLORS = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-slate-400"
};

const PRIORITY_LABELS = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低"
};

export default function DayDetailDialog({ open, onOpenChange, date, tasks, notes, onTaskClick }) {
  if (!date) return null;

  // Group subtasks under parent tasks
  const parentTasks = tasks.filter(t => !t.parent_task_id);
  const getSubtasks = (parentId) => tasks.filter(t => t.parent_task_id === parentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-800">
                {format(date, "d日")}
              </span>
              <span className="text-sm text-slate-500">
                {format(date, "EEEE", { locale: zhCN })}
              </span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                {parentTasks.length} 个约定
              </Badge>
              <Badge variant="secondary" className="bg-purple-50 text-purple-700">
                {notes.length} 个心签
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* 约定列表 */}
          {parentTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-slate-800">约定</h3>
                <span className="text-xs text-slate-500">({parentTasks.length})</span>
              </div>
              <div className="space-y-3">
                {parentTasks.map((task) => {
                  const subtasks = getSubtasks(task.id);
                  return (
                    <div key={task.id} className="space-y-2">
                      <div
                        onClick={() => {
                          onTaskClick(task);
                          onOpenChange(false);
                        }}
                        className="p-4 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-slate-800">
                                {task.title}
                              </h4>
                              <Badge variant="outline" className="text-xs">
                                {PRIORITY_LABELS[task.priority]}
                              </Badge>
                              {subtasks.length > 0 && (
                                <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">
                                  {subtasks.length} 个子约定
                                </Badge>
                              )}
                            </div>
                            
                            {task.description && (
                              <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              {task.reminder_time && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    {format(new Date(task.reminder_time), "HH:mm")}
                                    {task.end_time && ` - ${format(new Date(task.end_time), "HH:mm")}`}
                                  </span>
                                </div>
                              )}
                              {task.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {task.category}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* 子约定列表 */}
                      {subtasks.length > 0 && (
                        <div className="ml-8 space-y-1.5">
                          {subtasks.map((subtask) => (
                            <div
                              key={subtask.id}
                              onClick={() => {
                                onTaskClick(subtask);
                                onOpenChange(false);
                              }}
                              className="p-3 bg-blue-50/50 border border-blue-100 rounded-md hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all"
                            >
                              <div className="flex items-start gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_COLORS[subtask.priority]}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-slate-700">
                                      {subtask.title}
                                    </span>
                                  </div>
                                  {subtask.reminder_time && (
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
                                      <Clock className="w-2.5 h-2.5" />
                                      <span>
                                        {format(new Date(subtask.reminder_time), "HH:mm")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 心签列表 */}
          {notes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <StickyNote className="w-4 h-4 text-purple-600" />
                <h3 className="font-semibold text-slate-800">心签</h3>
                <span className="text-xs text-slate-500">({notes.length})</span>
              </div>
              <div className="space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-4 bg-purple-50 border border-purple-100 rounded-lg hover:border-purple-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      {note.tags && note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {note.tags.slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div 
                      className="text-sm text-slate-700 line-clamp-3"
                      dangerouslySetInnerHTML={{ __html: note.plain_text || note.content }}
                    />
                    <div className="text-xs text-slate-500 mt-2">
                      {format(new Date(note.created_date), "HH:mm")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 空状态 */}
          {parentTasks.length === 0 && notes.length === 0 && (
            <div className="text-center py-12">
              <Circle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">这一天还没有约定和心签</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}