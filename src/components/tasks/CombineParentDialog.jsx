import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Layers, Loader2 } from "lucide-react";

/**
 * 把勾选出来的（可来自不同父约定的）子约定组合成一个新的父约定。
 * - 用户自行编辑新父约定名称
 * - 创建新父约定后，将所选约定的 parent_task_id 改挂到新父约定
 */
export default function CombineParentDialog({
  open,
  onClose,
  selectedTasks = [],
  createTaskAsync,
  updateTaskAsync,
  onCombined,
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const count = selectedTasks.length;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const name = title.trim();
    if (!name || count === 0 || saving) return;
    setSaving(true);
    try {
      const parent = await createTaskAsync({
        title: name,
        status: "pending",
        priority: "medium",
        category: "personal",
      });
      const parentId = parent?.id;
      if (parentId) {
        await Promise.all(
          selectedTasks.map((t) =>
            updateTaskAsync({ id: t.id, data: { parent_task_id: parentId } })
          )
        );
      }
      setTitle("");
      onCombined?.();
      onClose?.();
    } catch (err) {
      console.error("Combine into new parent failed", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-[#eef2ff] flex items-center justify-center">
              <Layers className="w-4 h-4 text-[#384877]" />
            </span>
            组合为新父约定
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <p className="text-sm text-slate-500">
            将选中的 <span className="font-semibold text-[#384877]">{count}</span> 个约定归到一个新的父约定下，名称由你自定义。
          </p>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">新父约定名称</label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：本周重点 / 出差准备"
            />
          </div>

          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 divide-y divide-slate-100">
            {selectedTasks.map((t) => (
              <div key={t.id} className="px-3 py-2 text-sm text-slate-600 truncate">
                {t.title}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || count === 0 || saving}
              className="bg-[#384877] hover:bg-[#2f3d66]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "创建并归类"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}