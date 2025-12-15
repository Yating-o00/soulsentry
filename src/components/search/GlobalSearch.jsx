import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Loader2, ListTodo, StickyNote, User, ArrowRight, Command } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area"; // Assuming ScrollArea exists or use div
import _ from "lodash";

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

        // Client-side filtering (simple implementation)
        const matchedTasks = tasks.filter(t => 
          t.title.toLowerCase().includes(lowerTerm) || 
          t.description?.toLowerCase().includes(lowerTerm) ||
          // Check subtasks if they are loaded or if we want to search them. 
          // Assuming subtasks are tasks with parent_task_id, they are in 'tasks' list.
          // If subtasks are stored as 'subtasks' array in task (not standard in this app based on schema), 
          // Schema says 'dependencies' is array of IDs, but subtasks are separate entities.
          // So subtasks are just tasks.
          false
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
    }, 500),
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
      // Navigate to Teams page, maybe filter by user?
      // Or just Teams page for now as there is no specific user profile page except Account (self)
      navigate(`${createPageUrl('Teams')}`); // Enhancing this to open specific user would require Teams page update
    }
  };

  const hasResults = results.tasks.length > 0 || results.notes.length > 0 || results.users.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden bg-white shadow-2xl border-0">
        <div className="flex items-center border-b border-slate-100 px-4 py-3 bg-slate-50/50">
          <Search className="w-5 h-5 text-slate-400 mr-2" />
          <Input 
            placeholder="搜索任务、笔记、用户..." 
            className="border-0 bg-transparent focus-visible:ring-0 text-base h-auto p-0 placeholder:text-slate-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {isLoading && <Loader2 className="w-4 h-4 text-blue-500 animate-spin ml-2" />}
          <div className="ml-auto flex items-center gap-1">
             <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-slate-100 px-1.5 font-mono text-[10px] font-medium text-slate-500 opacity-100">
              <span className="text-xs">ESC</span>
            </kbd>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!query && (
             <div className="py-10 text-center text-slate-500 text-sm">
                <Command className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p>输入关键词开始搜索...</p>
             </div>
          )}

          {query && !hasResults && !isLoading && (
            <div className="py-10 text-center text-slate-500 text-sm">
              <p>未找到相关结果</p>
            </div>
          )}

          {hasResults && (
            <div className="space-y-4 p-2">
              {results.tasks.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2 px-2 flex items-center gap-1">
                    <ListTodo className="w-3.5 h-3.5" /> 约定 ({results.tasks.length})
                  </h3>
                  <div className="space-y-1">
                    {results.tasks.map(task => (
                      <button
                        key={task.id}
                        onClick={() => handleSelect('task', task.id)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-3 group"
                      >
                         <div className={`w-1.5 h-1.5 rounded-full ${task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`} />
                         <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-700 transition-colors">{task.title}</div>
                            {task.description && <div className="text-xs text-slate-500 truncate">{task.description}</div>}
                         </div>
                         <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.notes.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2 px-2 mt-4 flex items-center gap-1">
                    <StickyNote className="w-3.5 h-3.5" /> 心签 ({results.notes.length})
                  </h3>
                  <div className="space-y-1">
                    {results.notes.map(note => (
                      <button
                        key={note.id}
                        onClick={() => handleSelect('note', note.id)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-3 group"
                      >
                         <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                         <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate group-hover:text-amber-700 transition-colors">
                                {note.plain_text?.slice(0, 30) || "无内容"}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                                {new Date(note.created_date).toLocaleDateString()}
                            </div>
                         </div>
                         <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.users.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2 px-2 mt-4 flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> 用户 ({results.users.length})
                  </h3>
                  <div className="space-y-1">
                    {results.users.map(user => (
                      <button
                        key={user.id}
                        onClick={() => handleSelect('user', user.id)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-3 group"
                      >
                         <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                             {user.full_name?.[0] || user.email?.[0]}
                         </div>
                         <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{user.full_name || "未命名用户"}</div>
                            <div className="text-xs text-slate-500 truncate">{user.email}</div>
                         </div>
                         <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}