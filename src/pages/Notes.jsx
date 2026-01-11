import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StickyNote, Search, Plus, Grid, List as ListIcon, RotateCcw, CalendarIcon, Sparkles, Wand2, Brain, Mic } from "lucide-react";
import NoteEditor from "../components/notes/NoteEditor";
import NoteCard from "../components/notes/NoteCard";
import NoteFilters from "../components/notes/NoteFilters";
import NoteShareDialog from "../components/notes/NoteShareDialog";
import NoteComments from "../components/notes/NoteComments";
import QuickAddTask from "../components/tasks/QuickAddTask";
import AINotesOrganizer from "../components/notes/AINotesOrganizer";
import AIKnowledgeBase from "../components/knowledge/AIKnowledgeBase";
import KnowledgeBaseManager from "../components/knowledge/KnowledgeBaseManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MobileVoiceNoteInput from "../components/notes/MobileVoiceNoteInput";
import { useEphemeralNoteManager } from "../components/notes/EphemeralNoteManager";
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
  const [sharingNote, setSharingNote] = useState(null);
  const [showAIOrganizer, setShowAIOrganizer] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showKnowledgeManager, setShowKnowledgeManager] = useState(false);
  const [showMobileInput, setShowMobileInput] = useState(false);
  const [activeTab, setActiveTab] = useState("notes");
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

  // 启用临时心签自动管理
  useEphemeralNoteManager(notes);

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

  const addToKnowledgeMutation = useMutation({
    mutationFn: (data) => base44.entities.KnowledgeBase.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success("已添加到知识库");
    }
  });

  const handleAddToKnowledge = async (note) => {
    addToKnowledgeMutation.mutate({
      title: note.ai_analysis?.summary || note.plain_text?.slice(0, 100) || "未命名知识",
      content: note.plain_text || note.content,
      source_type: "note",
      source_id: note.id,
      tags: note.tags || [],
      summary: note.ai_analysis?.summary,
      key_points: note.ai_analysis?.key_points || [],
      category: note.tags?.[0] || "其他"
    });
  };

  const saveToKnowledgeMutation = useMutation({
    mutationFn: async (note) => {
      const knowledgeData = {
        title: note.ai_analysis?.summary || note.plain_text?.slice(0, 50) || "未命名知识",
        content: note.ai_analysis?.key_points ? 
          `${note.ai_analysis.summary}\n\n要点：\n${note.ai_analysis.key_points.map(p => `• ${p}`).join('\n')}\n\n原文：\n${note.plain_text}` :
          note.plain_text,
        source_type: "note",
        source_id: note.id,
        tags: note.tags || [],
        category: "其他",
        importance: 3,
        embedding_summary: note.ai_analysis?.summary || note.plain_text?.slice(0, 200)
      };
      return base44.entities.KnowledgeBase.create(knowledgeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success("已保存到知识库");
    },
    onError: () => {
      toast.error("保存失败");
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

        <div className="flex-1">
          <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
            <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
              <StickyNote className="w-4 h-4 md:w-6 md:h-6 text-white" />
            </div>
            <h1 className="text-xl md:text-3xl font-bold text-slate-800">
              灵感心签
            </h1>
          </div>
          <p className="text-xs md:text-base text-slate-600 hidden md:block">让想法的碎片尽情落下</p>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
          <TabsList className="bg-white shadow-md rounded-lg md:rounded-xl p-0.5 md:p-1 h-auto">
            <TabsTrigger value="notes" className="rounded-md md:rounded-lg px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#384877] data-[state=active]:to-[#3b5aa2] data-[state=active]:text-white">
              <StickyNote className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
              <span className="hidden md:inline">心签</span>
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="rounded-md md:rounded-lg px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white">
              <Brain className="w-3 h-3 md:w-4 md:h-4 md:mr-2" />
              <span className="hidden md:inline">知识库</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 flex-1 md:gap-3">
          <div className="relative flex-1 md:max-w-md">
            <Search className="absolute left-2 md:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400" />
            <Input
              placeholder="🔍 搜索..."
              className="pl-8 md:pl-9 pr-8 h-9 md:h-10 text-sm md:text-base bg-white border-slate-200 rounded-lg md:rounded-xl focus:ring-2 focus:ring-[#384877]/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <span className="text-xs md:text-sm">✕</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {activeTab === "notes" && (
        <>
          {/* Filters */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center justify-between gap-2 md:gap-3 flex-wrap"
          >
            <NoteFilters 
              filters={filters} 
              onFiltersChange={setFilters}
              allTags={allTags}
            />

            <div className="flex items-center gap-1.5 md:gap-3">
              <Button
                onClick={() => setShowKnowledgeBase(true)}
                variant="outline"
                size="sm"
                className="h-7 md:h-8 px-2 md:px-3 gap-1 md:gap-1.5 border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs md:text-sm"
              >
                <Brain className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="hidden sm:inline">AI 问答</span>
              </Button>
              <Button
                onClick={() => setShowAIOrganizer(true)}
                variant="outline"
                size="sm"
                className="h-7 md:h-8 px-2 md:px-3 gap-1 md:gap-1.5 border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs md:text-sm"
              >
                <Wand2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="hidden sm:inline">智能整理</span>
              </Button>
              <div className="text-xs md:text-sm text-slate-500 whitespace-nowrap">
                <span className="font-semibold text-[#384877]">{filteredNotes.length}</span>
                <span className="hidden md:inline"> 条心签</span>
              </div>
            </div>
          </motion.div>

          {/* Quick Create Area - Desktop / Mobile Adaptive */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="sticky top-0 z-10 bg-gradient-to-b from-white via-white to-transparent pb-4"
          >
            {!isCreating ? (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="hidden md:flex w-full text-left group relative overflow-hidden bg-gradient-to-br from-white to-slate-50 border-2 border-dashed border-slate-200 hover:border-[#384877] rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.02]"
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
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute -inset-4 bg-gradient-to-br from-[#384877]/10 via-transparent to-purple-500/10 rounded-3xl blur-2xl pointer-events-none" />
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
            className="columns-1 md:columns-2 lg:columns-3 gap-3 md:gap-4 space-y-3 md:space-y-4 pb-20 md:pb-20">

            <AnimatePresence mode="popLayout">
              {filteredNotes.map((note) =>
              <NoteCard
                key={note.id}
                note={note}
                onEdit={setEditingNote}
                onDelete={(n) => deleteNoteMutation.mutate(n.id)}
                onPin={handlePin}
                onShare={setSharingNote}
                onConvertToTask={(n) => setTaskCreationNote(n)}
                onSaveToKnowledge={(n) => saveToKnowledgeMutation.mutate(n)} />

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
        </>
      )}

      {activeTab === "knowledge" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <KnowledgeBaseManager />
        </motion.div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] w-[95vw] md:w-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">编辑心签</DialogTitle>
          </DialogHeader>
          {editingNote && (
            <div className="space-y-6">
              <NoteEditor
                initialData={editingNote}
                onSave={(data) => updateNoteMutation.mutate({ id: editingNote.id, data })}
                onClose={() => setEditingNote(null)}
              />
              
              {/* Comments Section */}
              <div className="pt-6 border-t border-slate-200">
                <NoteComments noteId={editingNote.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <NoteShareDialog
        note={sharingNote}
        open={!!sharingNote}
        onOpenChange={(open) => !open && setSharingNote(null)}
      />

      {/* AI Organizer */}
      <AINotesOrganizer
        notes={notes}
        open={showAIOrganizer}
        onOpenChange={setShowAIOrganizer}
      />

      {/* AI Knowledge Base */}
      <Dialog open={showKnowledgeBase} onOpenChange={setShowKnowledgeBase}>
        <DialogContent className="max-w-3xl w-[95vw] md:w-auto h-[85vh] md:h-[80vh] p-0">
          <AIKnowledgeBase open={showKnowledgeBase} onOpenChange={setShowKnowledgeBase} />
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <Dialog open={!!taskCreationNote} onOpenChange={(open) => !open && setTaskCreationNote(null)}>
        <DialogContent className="max-w-2xl w-[95vw] md:w-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
                <CalendarIcon className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
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

      {/* Mobile Quick Input */}
      <AnimatePresence>
        {showMobileInput && (
          <MobileVoiceNoteInput
            onSave={(data) => {
              createNoteMutation.mutate(data);
              setShowMobileInput(false);
            }}
            onClose={() => setShowMobileInput(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile FAB - Only show on notes tab */}
      {activeTab === "notes" && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowMobileInput(true)}
          className="md:hidden fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white shadow-2xl shadow-[#384877]/40 flex items-center justify-center active:shadow-lg transition-shadow"
        >
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </motion.button>
      )}
    </div>);

}