import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Users, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function TaskAssignment({ selectedUsers = [], onUpdate, onClose }) {
  const [assignedUsers, setAssignedUsers] = useState(selectedUsers);
  const [isShared, setIsShared] = useState(selectedUsers.length > 0);

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const handleToggleUser = (userId) => {
    setAssignedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSave = () => {
    onUpdate({
      assigned_to: assignedUsers,
      is_shared: isShared,
      team_visibility: assignedUsers.length > 0 ? 'team' : 'private'
    });
    onClose();
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-blue-50 to-purple-50">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          分配约定
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="shared" className="text-sm font-medium">团队共享</Label>
            <p className="text-xs text-slate-500">让团队成员可以看到此约定</p>
          </div>
          <Switch
            id="shared"
            checked={isShared}
            onCheckedChange={setIsShared}
          />
        </div>

        {isShared && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-2"
          >
            <Label className="text-sm font-medium">选择成员</Label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {allUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => handleToggleUser(user.id)}
                >
                  <Checkbox
                    checked={assignedUsers.includes(user.id)}
                    onCheckedChange={() => handleToggleUser(user.id)}
                  />
                  <Avatar className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                    <AvatarFallback className="bg-transparent">
                      {getInitials(user.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{user.full_name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                  {user.role === 'admin' && (
                    <Badge variant="outline" className="text-xs">管理员</Badge>
                  )}
                </div>
              ))}
            </div>

            {assignedUsers.length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-xs text-slate-600 mb-2">已选择 {assignedUsers.length} 位成员</p>
                <div className="flex flex-wrap gap-2">
                  {assignedUsers.map(userId => {
                    const user = allUsers.find(u => u.id === userId);
                    return user ? (
                      <Badge key={userId} variant="outline" className="bg-blue-50 text-blue-700">
                        {user.full_name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}

        <div className="flex gap-2 pt-4">
          <Button
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-black text-white hover:text-white shadow-md border border-blue-600 hover:border-black transition-all duration-200 active:scale-95"
          >
            确认分配
          </Button>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}