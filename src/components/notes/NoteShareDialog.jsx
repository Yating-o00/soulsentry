import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Share2, Users, Eye, Edit3, Trash2, Check, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export default function NoteShareDialog({ note, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [selectedUsers, setSelectedUsers] = useState(note?.shared_with || []);
  const [sharePermission, setSharePermission] = useState("view");
  const [isPublic, setIsPublic] = useState(note?.is_public || false);

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Note.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success("分享设置已更新");
    },
  });

  const toggleUser = (userId) => {
    const userInList = selectedUsers.find(u => u.user_id === userId);
    if (userInList) {
      setSelectedUsers(selectedUsers.filter(u => u.user_id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, { user_id: userId, permission: sharePermission }]);
    }
  };

  const updateUserPermission = (userId, permission) => {
    setSelectedUsers(selectedUsers.map(u => 
      u.user_id === userId ? { ...u, permission } : u
    ));
  };

  const handleSave = async () => {
    await updateNoteMutation.mutateAsync({
      id: note.id,
      data: {
        shared_with: selectedUsers,
        is_shared: selectedUsers.length > 0 || isPublic,
        is_public: isPublic,
      }
    });

    // Send notifications
    for (const sharedUser of selectedUsers) {
      if (!note.shared_with?.find(u => u.user_id === sharedUser.user_id)) {
        await base44.entities.Notification.create({
          recipient_id: sharedUser.user_id,
          type: "share",
          title: "新的心签分享",
          content: `${currentUser?.full_name || '某人'} 与你分享了心签"${note.plain_text?.slice(0, 30) || '未命名心签'}"`,
          link: `/notes?noteId=${note.id}`,
          related_entity_id: note.id,
          sender_id: currentUser?.id,
        });
      }
    }

    onOpenChange(false);
  };

  const getInitials = (name) => {
    if (!name || typeof name !== 'string') return "?";
    const trimmed = name.trim();
    if (!trimmed) return "?";
    const parts = (trimmed.includes(' ') ? trimmed.split(" ") : [trimmed]).filter(Boolean);
    if (!parts || parts.length === 0) return "?";
    return parts.map(n => (n && n.length > 0 ? n[0] : "")).filter(Boolean).join("").toUpperCase().slice(0, 2) || "?";
  };

  const otherUsers = allUsers.filter(u => u.id !== currentUser?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-blue-600" />
            分享心签
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Public Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2">
              {isPublic ? <Globe className="w-4 h-4 text-blue-600" /> : <Lock className="w-4 h-4 text-slate-400" />}
              <div>
                <Label className="text-sm font-medium">公开访问</Label>
                <p className="text-xs text-slate-500">任何人都可以查看此心签</p>
              </div>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          {/* Share Permission Select */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">默认权限:</Label>
            <Select value={sharePermission} onValueChange={setSharePermission}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-3 h-3" />
                    只读
                  </div>
                </SelectItem>
                <SelectItem value="edit">
                  <div className="flex items-center gap-1.5">
                    <Edit3 className="w-3 h-3" />
                    可编辑
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User List */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <Label className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              选择成员 ({selectedUsers.length})
            </Label>
            {otherUsers.map((user) => {
              const isSelected = selectedUsers.find(u => u.user_id === user.id);
              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                    isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleUser(user.id)}
                    className="flex items-center gap-3 flex-1"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className={`text-xs ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>
                        {getInitials(user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{user.full_name}</span>
                        {user.role === 'admin' && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1">管理员</Badge>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">{user.email}</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                  {isSelected && (
                    <Select
                      value={isSelected.permission}
                      onValueChange={(val) => updateUserPermission(user.id, val)}
                    >
                      <SelectTrigger className="w-24 h-7 text-xs ml-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">
                          <div className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            只读
                          </div>
                        </SelectItem>
                        <SelectItem value="edit">
                          <div className="flex items-center gap-1">
                            <Edit3 className="w-3 h-3" />
                            可编辑
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Current Shares */}
          {note?.shared_with && note.shared_with.length > 0 && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs text-green-700 font-medium mb-2">当前已分享给 {note.shared_with.length} 人</p>
              <div className="flex flex-wrap gap-1">
                {note.shared_with.map(sh => {
                  const user = allUsers.find(u => u.id === sh.user_id);
                  return user ? (
                    <Badge key={sh.user_id} variant="secondary" className="text-xs">
                      {user.full_name}
                      <Badge variant="outline" className="ml-1 text-[8px] h-3 px-1">
                        {sh.permission === 'edit' ? '可编辑' : '只读'}
                      </Badge>
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1 bg-gradient-to-r from-[#384877] to-[#3b5aa2]">
              <Share2 className="w-4 h-4 mr-2" />
              保存分享设置
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}