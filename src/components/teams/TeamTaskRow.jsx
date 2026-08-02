import React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus } from "lucide-react";
import TaskCard from "@/components/tasks/TaskCard";

const getInitials = (name) => {
  if (!name || typeof name !== "string") return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = (trimmed.includes(" ") ? trimmed.split(" ") : [trimmed]).filter(Boolean);
  return parts.map((n) => n[0] || "").join("").toUpperCase().slice(0, 2) || "?";
};

// 团队约定行：约定卡片 + 邀请伙伴快捷入口 + 协作成员头像
export default function TeamTaskRow({
  task, currentUser, getUserById,
  onComplete, onDelete, onClick, onSubtaskToggle, onInvite,
}) {
  return (
    <div className="relative">
      <TaskCard
        task={task}
        onComplete={onComplete}
        onDelete={onDelete}
        onEdit={() => {}}
        onClick={onClick}
        onSubtaskToggle={onSubtaskToggle} />

      <div className="absolute top-4 right-4 flex items-center gap-2">
        {task.created_by === currentUser?.email && (
          <button
            onClick={(e) => { e.stopPropagation(); onInvite(task); }}
            title="邀请伙伴共同完成"
            className="h-8 w-8 rounded-full bg-white border border-[#dce4ed] shadow-md flex items-center justify-center text-[#384877] hover:bg-[#384877] hover:text-white transition-colors no-min-size"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        )}
        {task.assigned_to && task.assigned_to.length > 0 && (
          <div className="flex -space-x-2">
            {task.assigned_to.slice(0, 3).map((userId) => {
              const user = getUserById(userId);
              return user ? (
                <Avatar
                  key={userId}
                  className="h-8 w-8 border-2 border-white bg-gradient-to-br from-[#1BA1CD] to-[#0D8AB5] text-white text-xs shadow-md"
                  title={user.full_name}>
                  <AvatarFallback className="bg-transparent">{getInitials(user.full_name)}</AvatarFallback>
                </Avatar>
              ) : null;
            })}
            {task.assigned_to.length > 3 && (
              <div className="h-8 w-8 rounded-full bg-[#e5e9ef] border-2 border-white flex items-center justify-center text-xs font-medium text-[#5a647d] shadow-md">
                +{task.assigned_to.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}