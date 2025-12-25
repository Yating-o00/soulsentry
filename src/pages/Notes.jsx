import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StickyNote, Search, Plus, Grid, List as ListIcon, RotateCcw, CalendarIcon, Sparkles } from "lucide-react";
import NoteEditor from "../components/notes/NoteEditor";
import NoteCard from "../components/notes/NoteCard";
import NoteFilters from "../components/notes/NoteFilters";
import QuickAddTask from "../components/tasks/QuickAddTask";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";

export default function Notes() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [taskCreationNote, setTaskCreationNote] = useState(null);
  const [filters, setFilters] = useState({});
  const [viewMode, setViewMode] = useState("grid");
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // Keyboard shortcut: Ctrl+N to quick create
  useEffect(() => {
    const handleKeyPress = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setIsCreating(true);
        // Auto-focus on editor after a short delay
        setTimeout(() => {
          const quillEditor = document.querySelector('.ql-editor');
          if (quillEditor) quillEditor.focus();
        }, 100);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date'),
    initialData: []
  });

  // Handle URL param for opening specific note
  useEffect(() => {
    const noteId = searchParams.get("noteId");
    if (noteId && notes.length > 0) {
      const note = notes.find(n => n.id === noteId);
      if (note) {
        setEditingNote(note);
      } else {
        base44.entities.Note.filter({ id: noteId }).then(res => {
          if (res && res.length > 0) {
             setEditingNote(res[0]);
          }
        });
      }
    }
  }, [searchParams, notes]);

  // Mutations
  const createNoteMutation = useMutation({
    mutationFn: (data) => base44.entities.Note.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setIsCreating(false);
      toast.success("心签已创建");
    }
  });

  const createTaskMutation = useMutation({
    mutationFn: (taskData) => base44.entities.Task.create(taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] }); // Ideally invalidate tasks, but might not be mounted
      setTaskCreationNote(null);
      toast.success("约定已创建");
    },
    onError: () => {
      toast.error("约定创建失败");
    }
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Note.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setEditingNote(null);
      toast.success("心签已更新");
    }
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id) => base44.entities.Note.delete(id), // Or soft delete if prefer
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success("心签已删除");
    }
  });

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set();
    notes.forEach(note => {
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Enhanced Filter and Sort
  const filteredNotes = useMemo(() => {
    let result = notes.filter((note) => !note.deleted_at);

    // Full-text search (content + tags)
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter((note) =>
        (note.plain_text && note.plain_text.toLowerCase().includes(lowerQuery)) ||
        (note.content && note.content.toLowerCase().includes(lowerQuery)) ||
        (note.tags && note.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)))
      );
    }

    // Color filter
    if (filters.colors && filters.colors.length > 0) {
      result = result.filter((note) => filters.colors.includes(note.color || 'white'));
    }

    // Tag filter
    if (filters.tags && filters.tags.length > 0) {
      result = result.filter((note) => 
        note.tags && filters.tags.some(filterTag => note.tags.includes(filterTag))
      );
    }

    // Pinned filter
    if (filters.pinnedOnly === true) {
      result = result.filter((note) => note.is_pinned === true);
    }

    // Date range filter
    if (filters.dateRange?.from) {
      const fromDate = new Date(filters.dateRange.from);
      fromDate.setHours(0, 0, 0, 0);
      
      result = result.filter((note) => {
        const noteDate = new Date(note.created_date);
        noteDate.setHours(0, 0, 0, 0);
        
        if (filters.dateRange.to) {
          const toDate = new Date(filters.dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          return noteDate >= fromDate && noteDate <= toDate;
        }
        return noteDate >= fromDate;
      });
    }

    // Sort: Pinned first, then by date
    return result.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.created_date) - new Date(a.created_date);
    });
  }, [notes, searchQuery, filters]);

  const handlePin = (note) => {
    updateNoteMutation.mutate({
      id: note.id,
      data: { is_pinned: !note.is_pinned }
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4">

        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
              <StickyNote className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-800">
              灵感心签
            </h1>
          </div>
          <p className="text-slate-600">让想法的碎片尽情落下</p>
        </div>

        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="🔍 搜索内容、标签..."
              className="pl-9 bg-white border-slate-200 rounded-xl focus:ring-2 focus:ring-[#384877]/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <span className="text-sm">✕</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="flex items-center justify-between gap-3"
      >
        <NoteFilters 
          filters={filters} 
          onFiltersChange={setFilters}
          allTags={allTags}
        />
        <div className="text-sm text-slate-500">
          共 <span className="font-semibold text-[#384877]">{filteredNotes.length}</span> 条心签
        </div>
      </motion.div>

      {/* Quick Create Area - Always Visible */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="sticky top-0 z-10 bg-gradient-to-b from-white via-white to-transparent pb-4"
      >
        {!isCreating ? (
          <div
            onClick={() => setIsCreating(true)}
            className="group relative overflow-hidden bg-gradient-to-br from-white to-slate-50 border-2 border-dashed border-slate-200 hover:border-[#384877] rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.02]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#384877]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            <div className="relative flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20 group-hover:scale-110 transition-transform duration-300">
                <Plus className="w-6 h-6 text-white" />
              </div>
              
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-800 group-hover:text-[#384877] transition-colors mb-1">
                  快速记录心签
                </h3>
                <p className="text-sm text-slate-500">
                  💭 随手记下灵感 | 🎯 快捷键：<kbd className="px-1.5 py-0.5 text-xs bg-slate-100 border border-slate-300 rounded">Ctrl+N</kbd>
                </p>
              </div>

              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Badge variant="outline" className="text-xs border-[#384877] text-[#384877]">
                  <Sparkles className="w-3 h-3 mr-1" />
                  AI 辅助
                </Badge>
                <Badge variant="outline" className="text-xs border-purple-500 text-purple-600">
                  快速创建
                </Badge>
              </div>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-gradient-to-br from-[#384877]/10 via-transparent to-purple-500/10 rounded-3xl blur-2xl" />
            <NoteEditor
              onSave={(data) => createNoteMutation.mutate(data)}
              onClose={() => setIsCreating(false)}
            />
          </motion.div>
        )}
      </motion.div>

      {/* Notes Grid - Using CSS Columns for Masonry effect */}
      <motion.div
        layout
        className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4 pb-20">

        <AnimatePresence mode="popLayout">
          {filteredNotes.map((note) =>
          <NoteCard
            key={note.id}
            note={note}
            onEdit={setEditingNote}
            onDelete={(n) => deleteNoteMutation.mutate(n.id)}
            onPin={handlePin}
            onConvertToTask={(n) => setTaskCreationNote(n)} />

          )}
        </AnimatePresence>
      </motion.div>

      {/* Empty State */}
      {filteredNotes.length === 0 && !isCreating &&
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-20">

          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <StickyNote className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-700 mb-1">暂无心签</h3>
          <p className="text-slate-500">记录下你的第一个灵感吧</p>
        </motion.div>
      }

      {/* Edit Dialog */}
      <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑心签</DialogTitle>
          </DialogHeader>
          {editingNote &&
          <NoteEditor
            initialData={editingNote}
            onSave={(data) => updateNoteMutation.mutate({ id: editingNote.id, data })}
            onClose={() => setEditingNote(null)} />

          }
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <Dialog open={!!taskCreationNote} onOpenChange={(open) => !open && setTaskCreationNote(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                从心签创建约定
            </DialogTitle>
          </DialogHeader>
          {taskCreationNote &&
          <QuickAddTask
            initialData={{
              title: taskCreationNote.ai_analysis?.summary || taskCreationNote.plain_text?.slice(0, 50) || "新约定",
              description: taskCreationNote.ai_analysis?.key_points ?
              `要点总结：\n- ${taskCreationNote.ai_analysis.key_points.join('\n- ')}\n\n原文内容：\n${taskCreationNote.plain_text || ""}` :
              taskCreationNote.plain_text || ""
            }}
            onAdd={(taskData) => {
              // Ensure reminder_time is set if QuickAddTask doesn't enforce it strictly or if user didn't change it
              const dataToSubmit = {
                ...taskData,
                reminder_time: taskData.reminder_time || new Date().toISOString()
              };
              createTaskMutation.mutate(dataToSubmit);
            }} />

          }
        </DialogContent>
      </Dialog>
    </div>);

}