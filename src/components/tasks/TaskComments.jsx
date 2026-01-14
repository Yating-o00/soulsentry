import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";

export default function TaskComments({ task }) {
  const taskId = task?.id;
  const [newComment, setNewComment] = useState("");
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => base44.entities.Comment.filter({ task_id: taskId }, '-created_date'),
    enabled: !!taskId,
    initialData: [],
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const createCommentMutation = useMutation({
    mutationFn: (data) => base44.entities.Comment.create(data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
      setNewComment("");
      toast.success("评论已发布");

      // Send notifications
      if (task && currentUser) {
        const recipients = new Set();
        
        // Notify assignees
        if (task.assigned_to) {
          task.assigned_to.forEach(uid => recipients.add(uid));
        }

        // Notify creator (need to find ID by email)
        const creator = allUsers.find(u => u.email === task.created_by);
        if (creator) recipients.add(creator.id);

        // Remove current user
        recipients.delete(currentUser.id);

        // Send
        for (const recipientId of recipients) {
          try {
            await base44.entities.Notification.create({
              recipient_id: recipientId,
              type: "comment",
              title: "新评论",
              content: `${currentUser.full_name} 评论了约定: ${task.title}`,
              is_read: false,
              link: "/Tasks", // Ideally deep link
              sender_id: currentUser.id,
              related_entity_id: task.id
            });
          } catch (e) {
            console.error("Failed to send notification", e);
          }
        }
      }
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (id) => base44.entities.Comment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
      toast.success("评论已删除");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    createCommentMutation.mutate({
      task_id: taskId,
      content: newComment,
      mentions: []
    });
  };

  const getInitials = (name) => {
    if (!name || typeof name !== 'string') return "?";
    const trimmed = name.trim();
    if (!trimmed) return "?";
    const parts = (trimmed.includes(' ') ? trimmed.split(" ") : [trimmed]).filter(Boolean);
    if (!parts || parts.length === 0) return "?";
    return parts.map(n => (n && n.length > 0 ? n[0] : "")).filter(Boolean).join("").toUpperCase().slice(0, 2) || "?";
  };

  const getUserByEmail = (email) => {
    return allUsers.find(u => u.email === email);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-slate-800">评论 ({comments.length})</h3>
      </div>

      {/* 评论列表 */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        <AnimatePresence>
          {comments.map((comment) => {
            const user = getUserByEmail(comment.created_by);
            const isOwnComment = comment.created_by === currentUser?.email;

            return (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
              >
                <Card className="p-4 bg-slate-50 border-0">
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                      <AvatarFallback className="bg-transparent">
                        {getInitials(user?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800">
                            {user?.full_name || "未知用户"}
                          </p>
                          {isOwnComment && (
                            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                              我
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-slate-500">
                            {format(new Date(comment.created_date), "M月d日 HH:mm", { locale: zhCN })}
                          </p>
                          {isOwnComment && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteCommentMutation.mutate(comment.id)}
                              className="h-6 w-6 hover:bg-red-100 hover:text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {comments.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无评论，来发表第一条评论吧</p>
          </div>
        )}
      </div>

      {/* 发表评论 */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          placeholder="写下你的评论..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="min-h-[80px] border-slate-200 focus-visible:ring-blue-500"
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!newComment.trim() || createCommentMutation.isPending}
            className="bg-gradient-to-r from-blue-600 to-blue-700"
          >
            <Send className="w-4 h-4 mr-2" />
            发表评论
          </Button>
        </div>
      </form>
    </div>
  );
}