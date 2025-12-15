import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StickyNote, Search, Plus, Grid, List as ListIcon, RotateCcw, CalendarIcon } from "lucide-react";
import NoteEditor from "../components/notes/NoteEditor";
import NoteCard from "../components/notes/NoteCard";
import QuickAddTask from "../components/tasks/QuickAddTask"; // Added import
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
  const [taskCreationNote, setTaskCreationNote] = useState(null); // State for task creation
  const [viewMode, setViewMode] = useState("grid"); // grid | list
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date'),
    initialData: []
  });

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

  // Filter and Sort
  const filteredNotes = useMemo(() => {
    let result = notes.filter((note) => !note.deleted_at);

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter((note) =>
      note.plain_text && note.plain_text.toLowerCase().includes(lowerQuery) ||
      note.tags && note.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
      );
    }

    // Sort: Pinned first, then by date
    return result.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.created_date) - new Date(a.created_date);
    });
  }, [notes, searchQuery]);

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

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="搜索标签或内容..."
              className="pl-9 bg-white border-slate-200 rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} />

          </div>
          {/* View Toggle (Optional, simpler to just stick to masonry-ish grid) */}
        </div>
      </motion.div>

      {/* Create Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}>

        {!isCreating ?
        <div
          onClick={() => setIsCreating(true)}
          className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 cursor-text hover:shadow-md transition-all flex items-center text-slate-500 gap-3 group">

            <Plus className="w-5 h-5 text-slate-400 group-hover:text-[#384877]" />
            <span className="font-medium">添加新心签...</span>
          </div> :

        <NoteEditor
          onSave={(data) => createNoteMutation.mutate(data)}
          onClose={() => setIsCreating(false)} />

        }
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