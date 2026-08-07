import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function TaskMetaEditor({ task, onSave, onCancel }) {
  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("标题不能为空");
      return;
    }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), description });
      toast.success("已保存");
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 md:p-5 border border-[#d6dcf0] shadow-sm space-y-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="约定标题"
        className="h-11 rounded-xl text-[16px] font-semibold border-slate-200"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="标题下的说明内容..."
        className="min-h-[120px] rounded-xl text-[15px] border-slate-200"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} className="rounded-xl h-9">
          <X className="w-4 h-4 mr-1.5" />
          取消
        </Button>
        <Button onClick={handleSave} disabled={saving} className="rounded-xl h-9 bg-[#384877] hover:bg-[#2e3c64]">
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
          保存
        </Button>
      </div>
    </div>
  );
}