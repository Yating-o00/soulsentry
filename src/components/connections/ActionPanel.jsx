import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// 通用连接面板：标题 + 说明 + 若干操作按钮（每个按钮执行一个异步动作并提示结果）
export default function ActionPanel({ title, desc, actions }) {
  const [busy, setBusy] = useState(null);
  const run = async (a) => {
    setBusy(a.label);
    try {
      toast.success(await a.run());
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "操作失败");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500 mt-1 whitespace-pre-line">{desc}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <Button key={a.label} variant={i === 0 ? "default" : "outline"} disabled={!!busy || a.disabled} onClick={() => run(a)}>
            {busy === a.label && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}