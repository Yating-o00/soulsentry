import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Send, Trash2, AtSign } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export default function NoteComments({ noteId }) {
  const [newComment, setNewComment] = useState("");
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['note-comments', noteId],
    queryFn: () => base44.entities.NoteComment.filter({ note_id: noteId }, '-created_date'),
    enabled: !!noteId,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: note } = useQuery({
    queryKey: ['note', noteId],
    queryFn: async () => {
      const notes = await base44.entities.Note.filter({ id: noteId });
      return notes[0];
    },
    enabled: !!noteId,
  });

  const createCommentMutation = useMutation({
    mutationFn: (data) => base44.entities.NoteComment.create(data),
    onSuccess: async (newComment) => {
      queryClient.invalidateQueries({ queryKey: ['note-comments', noteId] });
      setNewComment("");
      toast.success("评论已发布");

      // Send notifications
      const recipientIds = new Set();
      if (note?.created_by && note.created_by !== currentUser?.email) {
        const creator = allUsers.find(u => u.email === note.created_by);
        if (creator) recipientIds.add(creator.id);
      }
      if (note?.shared_with) {
        note.shared_with.forEach(sh => recipientIds.add(sh.user_id));
      }

      for (const recipientId of recipientIds) {
        if (recipientId !== currentUser?.id) {
          await base44.entities.Notification.create({
            recipient_id: recipientId,
            type: "comment",
            title: "心签新评论",
            content: `${currentUser?.full_name || '某人'} 评论了心签`,
            link: `/notes?noteId=${noteId}`,
            related_entity_id: noteId,
            sender_id: currentUser?.id,
          });
        }
      }
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (id) => base44.entities.NoteComment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note-comments', noteId] });
      toast.success("评论已删除");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    createCommentMutation.mutate({
      note_id: noteId,
      content: newComment,
      mentions: [],
    });
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getUserByEmail = (email) => {
    return allUsers.find(u => u.email === email);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#384877]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-slate-600" />
        <h3 className="text-lg font-semibold text-slate-800">
          评论 ({comments.length})
        </h3>
      </div>

      {/* Comment List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {comments.map((comment) => {
            const user = getUserByEmail(comment.created_by);
            const isOwn = comment.created_by === currentUser?.email;

            return (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
              >
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white text-xs">
                    {getInitials(user?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-slate-800">
                      {user?.full_name || '未知用户'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {format(new Date(comment.created_date), "MM月dd日 HH:mm", { locale: zhCN })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed break-words">
                    {comment.content}
                  </p>
                </div>
                {isOwn && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteCommentMutation.mutate(comment.id)}
                    className="h-7 w-7 text-slate-400 hover:text-red-600 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {comments.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无评论，来发表第一条吧</p>
        </div>
      )}

      {/* Comment Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="写下你的想法..."
          className="flex-1 resize-none h-20 text-sm"
        />
        <Button
          type="submit"
          disabled={!newComment.trim() || createCommentMutation.isPending}
          className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2c3b63] hover:to-[#2d4680] h-20"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}