import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StickyNote, Loader2 } from "lucide-react";
import { toast } from "sonner";

const esc = (s = "") =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 把约定转为心签：创建 Note 后将原约定移入回收站
export default function ConvertToNoteButton({ task, onDone }) {
  const [converting, setConverting] = useState(false);
  const queryClient = useQueryClient();

  const handleConvert = async () => {
    if (converting || !task?.id) return;
    if (!window.confirm(`将「${task.title}」转为心签？原约定会移入回收站。`)) return;
    setConverting(true);
    try {
      const taskNotes = (task.notes || [])
        .map((n) => `<p>${esc(n.content)}</p>`)
        .join("");
      const content =
        `<h2>${esc(task.title)}</h2>` +
        (task.description ? `<p>${esc(task.description).replace(/\n/g, "<br/>")}</p>` : "") +
        taskNotes;
      const plainText = [task.title, task.description, ...(task.notes || []).map((n) => n.content)]
        .filter(Boolean)
        .join("\n");

      await base44.entities.Note.create({
        content,
        plain_text: plainText,
        tags: [...(task.tags || []), "来自约定"],
        source_type: "manual",
        ai_status: "pending",
      });
      await base44.entities.Task.update(task.id, { deleted_at: new Date().toISOString() });

      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success("已转为心签，可在「心签」页查看");
      onDone?.();
    } catch (e) {
      console.error("转为心签失败", e);
      toast.error("转为心签失败，请重试");
    } finally {
      setConverting(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleConvert}
      disabled={converting}
      className="h-9 w-9 p-0 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500"
      title="转为心签"
    >
      {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <StickyNote className="w-4 h-4" />}
    </Button>
  );
}