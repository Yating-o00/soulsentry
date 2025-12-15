import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Loader2, ListTodo, StickyNote, User, ArrowRight, Command, Calendar, Clock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import _ from "lodash";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export default function GlobalSearch({ open, onOpenChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ tasks: [], notes: [], users: [] });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const performSearch = useCallback(
    _.debounce(async (searchTerm) => {
      if (!searchTerm.trim()) {
        setResults({ tasks: [], notes: [], users: [] });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const lowerTerm = searchTerm.toLowerCase();

        // Parallel fetch
        const [tasks, notes, users] = await Promise.all([
          base44.entities.Task.list(),
          base44.entities.Note.list(),
          base44.entities.User.list()
        ]);

        const matchedTasks = tasks.filter(t => 
          t.title.toLowerCase().includes(lowerTerm) || 
          t.description?.toLowerCase().includes(lowerTerm)
        ).slice(0, 5);

        const matchedNotes = notes.filter(n => 
          n.plain_text?.toLowerCase().includes(lowerTerm) || 
          n.content?.toLowerCase().includes(lowerTerm)
        ).slice(0, 5);

        const matchedUsers = users.filter(u => 
          u.full_name?.toLowerCase().includes(lowerTerm) || 
          u.email?.toLowerCase().includes(lowerTerm)
        ).slice(0, 5);

        setResults({
          tasks: matchedTasks,
          notes: matchedNotes,
          users: matchedUsers
        });

      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    []
  );

  useEffect(() => {
    performSearch(query);
  }, [query, performSearch]);

  const handleSelect = (type, id) => {
    onOpenChange(false);
    if (type === 'task') {
      navigate(`${createPageUrl('Tasks')}?taskId=${id}`);
    } else if (type === 'note') {
      navigate(`${createPageUrl('Notes')}?noteId=${id}`);
    } else if (type === 'user') {
      navigate(`${createPageUrl('Teams')}`);
    }
  };

  const hasResults = results.tasks.length > 0 || results.notes.length > 0 || results.users.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] p-0 gap-0 overflow-hidden bg-white/95 backdrop-blur-xl shadow-2xl border-0 ring-1 ring-slate-200">
        {/* Search Header */}
        <div className="relative flex items-center border-b border-slate-100/80 px-4 py-4 bg-white/50">
          <Search className="w-5 h-5 text-blue-500 mr-3 animate-pulse" />
          <Input 
            placeholder="搜索约定、灵感心签、团队成员..." 
            className="border-0 bg-transparent focus-visible:ring-0 text-[17px] h-auto p-0 placeholder:text-slate-400 font-medium text-slate-700"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {isLoading && (
            <div className="absolute right-14">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
          </div>
        </div>

        {/* Results Area */}
        <div className="max-h-[65vh] overflow-y-auto p-2 scrollbar-hide">
          <AnimatePresence mode="wait">
            {!query && (
               <motion.div 
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -10 }}
                 className="py-16 text-center"
               >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center shadow-inner">
                    <Sparkles className="w-8 h-8 text-blue-400" />
                  </div>
                  <h3 className="text-slate-700 font-medium mb-1">全局搜索</h3>
                  <p className="text-slate-400 text-sm">查找任何你需要的内容</p>
               </motion.div>
            )}

            {query && !hasResults && !isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-16 text-center"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
                  <Command className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-500">未找到与 "{query}" 相关的内容</p>
              </motion.div>
            )}

            {hasResults && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6 p-2"
              >
                {/* Tasks Section */}
                {results.tasks.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 flex items-center gap-2">
                      <ListTodo className="w-3.5 h-3.5" /> 约定
                    </h3>
                    <div className="grid gap-1">
                      {results.tasks.map(task => (
                        <motion.button
                          layout
                          key={task.id}
                          onClick={() => handleSelect('task', task.id)}
                          className="w-full text-left px-3 py-3 rounded-xl hover:bg-blue-50/50 transition-all group border border-transparent hover:border-blue-100 flex items-center gap-4"
                        >
                           <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                             task.status === 'completed' ? 'bg-green-400 shadow-green-200' : 
                             task.priority === 'urgent' ? 'bg-red-400 shadow-red-200' : 
                             'bg-blue-400 shadow-blue-200'
                           } shadow-lg`} />
                           
                           <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-700 transition-colors truncate">
                                  {task.title}
                                </span>
                                {task.status === 'completed' && (
                                  <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-green-100 text-green-700">完成</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400">
                                {task.description && <span className="truncate max-w-[200px]">{task.description}</span>}
                                {task.reminder_time && (
                                  <span className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                    <Clock className="w-3 h-3" />
                                    {format(new Date(task.reminder_time), 'MM-dd HH:mm')}
                                  </span>
                                )}
                              </div>
                           </div>
                           <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes Section */}
                {results.notes.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 flex items-center gap-2">
                      <StickyNote className="w-3.5 h-3.5" /> 灵感心签
                    </h3>
                    <div className="grid gap-1">
                      {results.notes.map(note => (
                        <motion.button
                          layout
                          key={note.id}
                          onClick={() => handleSelect('note', note.id)}
                          className="w-full text-left px-3 py-3 rounded-xl hover:bg-amber-50/50 transition-all group border border-transparent hover:border-amber-100 flex items-center gap-4"
                        >
                           <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-600">
                              <StickyNote className="w-4 h-4" />
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-700 group-hover:text-amber-700 transition-colors truncate mb-0.5">
                                  {note.plain_text?.slice(0, 40) || "无文本内容"}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(note.created_date), 'yyyy年MM月dd日', { locale: zhCN })}
                              </div>
                           </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Users Section */}
                {results.users.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 flex items-center gap-2">
                      <User className="w-3.5 h-3.5" /> 团队成员
                    </h3>
                    <div className="grid gap-1">
                      {results.users.map(user => (
                        <motion.button
                          layout
                          key={user.id}
                          onClick={() => handleSelect('user', user.id)}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-indigo-50/50 transition-all group border border-transparent hover:border-indigo-100 flex items-center gap-3"
                        >
                           <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-md shadow-indigo-200">
                               {user.full_name?.[0] || user.email?.[0]}
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-700">{user.full_name || "未命名用户"}</div>
                              <div className="text-xs text-slate-500 truncate">{user.email}</div>
                           </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Footer Hint */}
        {hasResults && (
           <div className="bg-slate-50/80 px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100 flex justify-between items-center">
              <span>使用 ↑↓ 键导航 (即将支持)</span>
              <span>回车键选定</span>
           </div>
        )}
      </DialogContent>
    </Dialog>
  );
}