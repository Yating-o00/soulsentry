import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, CornerDownRight, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * 让用户把一个父约定快速挂到另一个父约定下，使其成为子约定。
 * - task: 要被挂载的约定（将设置它的 parent_task_id）
 */
export default function AttachToParentDialog({ task, open, onClose }) {
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState(null);
  const queryClient = useQueryClient();

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["attach-parent-candidates"],
    queryFn: () => base44.entities.Task.filter({ parent_task_id: null }, "-updated_date", 200),
    enabled: !!open,
    initialData: [],
  });

  // 排除自身、已是其子约定的约定、已删除的，避免成环；未完成的优先排在前面
  const options = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const filtered = candidates.filter((t) => {
      if (!t || t.id === task?.id) return false;
      if (t.deleted_at) return false;
      if (t.parent_task_id === task?.id) return false;
      if (kw && !(t.title || "").toLowerCase().includes(kw)) return false;
      return true;
    });
    // 未完成（pending/in_progress/blocked/snoozed）排在已完成/已取消之前
    const isDone = (t) => t.status === "completed" || t.status === "cancelled";
    return filtered.sort((a, b) => {
      const ad = isDone(a) ? 1 : 0;
      const bd = isDone(b) ? 1 : 0;
      return ad - bd;
    });
  }, [candidates, search, task?.id]);

  const attachMutation = useMutation({
    mutationFn: (parentId) =>
      base44.entities.Task.update(task.id, { parent_task_id: parentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["subtasks"] });
      toast.success("已挂到目标约定下");
      onClose();
    },
    onError: () => toast.error("操作失败，请重试"),
    onSettled: () => setSavingId(null),
  });

  const handleAttach = (parentId) => {
    setSavingId(parentId);
    attachMutation.mutate(parentId);
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[calc(100%-16px)] rounded-2xl bg-white p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-bold text-slate-900">
            挂到其他约定下
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1 truncate">
            将「{task.title}」设为某个约定的子约定
          </p>
        </DialogHeader>

        <div className="px-5 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              autoFocus
              placeholder="搜索目标约定..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-xl border-slate-200 bg-slate-50/50 focus-visible:bg-white"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-3 pb-4 space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : options.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              没有可选的目标约定
            </div>
          ) : (
            options.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={savingId !== null}
                onClick={() => handleAttach(t.id)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left border border-transparent hover:border-[#d6dcf0] hover:bg-[#f0f3fb] transition-all disabled:opacity-50"
              >
                <CornerDownRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="flex-1 text-[15px] text-slate-800 truncate">
                  {t.title}
                </span>
                {t.status !== "completed" && t.status !== "cancelled" && (
                  <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-100">
                    未完成
                  </span>
                )}
                {savingId === t.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#384877]" />
                ) : (
                  <Check className="w-4 h-4 text-slate-300" />
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}