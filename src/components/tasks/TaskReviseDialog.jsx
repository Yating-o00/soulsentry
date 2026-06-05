import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GitBranch, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

/**
 * 发起「新一轮更新」：
 * 把当前约定的标题/描述快照存入 revisions（归档为历史版本），
 * 再用新内容覆盖原约定，实现版本迭代。
 */
export default function TaskReviseDialog({ task, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [updateNote, setUpdateNote] = useState("");

  useEffect(() => {
    if (open && task) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setUpdateNote("");
    }
  }, [open, task?.id]);

  const reviseMutation = useMutation({
    mutationFn: async () => {
      const existingRevisions = task.revisions || [];
      const nextVersion = existingRevisions.length + 1;

      // 把"当前"内容归档为一个历史版本
      const archivedRevision = {
        version: nextVersion,
        title: task.title || "",
        description: task.description || "",
        archived_at: new Date().toISOString(),
        update_note: updateNote || "",
      };

      return base44.entities.Task.update(task.id, {
        title: title.trim(),
        description: description,
        revisions: [...existingRevisions, archivedRevision],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["subtasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", task?.id] });
      toast.success("已发起新一轮更新，旧版本已归档");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("更新失败，请重试");
    },
  });

  if (!task) return null;

  const currentVersion = (task.revisions?.length || 0) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <span className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-amber-600" />
            </span>
            发起新一轮更新
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            当前内容会被归档为
            <span className="font-medium text-amber-600 mx-1">v{currentVersion}</span>
            历史版本，并用下面的新内容覆盖。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">新标题</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="本轮约定标题"
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">新内容描述</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="本轮约定的详细内容"
              className="min-h-[120px] rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">更新说明（可选）</Label>
            <Input
              value={updateNote}
              onChange={(e) => setUpdateNote(e.target.value)}
              placeholder="为什么发起这一轮更新？"
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            取消
          </Button>
          <Button
            onClick={() => reviseMutation.mutate()}
            disabled={!title.trim() || reviseMutation.isPending}
            className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
          >
            {reviseMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            确认更新
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}