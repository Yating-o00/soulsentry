// 新建「协同约定」/ 已有约定「开启协同」共用的轻量 Dialog：
// 主题 + 场景三选一（决定确认规则与 Agent 语气）+ 共同目标一句话 + Agent 开关
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Heart, Users, Briefcase, Bot, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";

// 场景模板：confirmRule 决定子约定草案的生效门槛（后端按同一口径推进确认）
const SCENARIOS = [
  {
    key: "couple",
    label: "情侣",
    icon: Heart,
    confirmRule: "all",
    description: "双方均可编辑，重要约定双方确认",
    tone: "Agent 语气：温和、不评判对错",
  },
  {
    key: "friends",
    label: "朋友",
    icon: Users,
    confirmRule: "owner",
    description: "人人可提议，发起人协调",
    tone: "Agent 语气：轻快、汇总偏好",
  },
  {
    key: "colleagues",
    label: "同事",
    icon: Briefcase,
    confirmRule: "owner",
    description: "明确负责人、确认人与验收人",
    tone: "Agent 语气：结构化、纪要/风险",
  },
];

export default function CollabCreateDialog({ open, onClose, existingTask = null, onCreated }) {
  const [title, setTitle] = useState("");
  const [scenario, setScenario] = useState("couple");
  const [goal, setGoal] = useState("");
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(existingTask?.title || "");
    setScenario(existingTask?.metadata?.collab?.scenario || "couple");
    setGoal(existingTask?.metadata?.collab?.goal || "");
    setAgentEnabled(existingTask?.metadata?.collab?.agent?.enabled ?? true);
  }, [open, existingTask]);

  const scenarioMeta = SCENARIOS.find((s) => s.key === scenario) || SCENARIOS[0];

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.warning("先给这个约定起个主题吧");
      return;
    }
    setSubmitting(true);
    const collabMeta = {
      scenario,
      goal: goal.trim(),
      agent: { enabled: agentEnabled, paused: false },
      confirmRule: scenarioMeta.confirmRule,
    };
    try {
      if (existingTask?.id) {
        // 开启协同：metadata 整体替换（后端 PATCH 语义），需合并保留既有 metadata（含 _extraFields）
        await httpRequest(`/api/tasks/${existingTask.id}`, {
          method: "PATCH",
          body: { metadata: { ...(existingTask.metadata || {}), collab: collabMeta } },
        });
        toast.success("已开启协同空间");
        onCreated?.(existingTask.id);
      } else {
        const created = await httpRequest("/api/tasks", {
          method: "POST",
          body: {
            title: trimmedTitle,
            description: goal.trim(),
            category: "collab",
            status: "pending",
            priority: "medium",
            metadata: { collab: collabMeta },
          },
        });
        toast.success("协同约定已创建");
        onCreated?.(created?.id);
      }
      onClose?.();
    } catch (error) {
      toast.error(error?.message || (existingTask ? "开启协同失败" : "创建失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="w-5 h-5 text-[#384877]" />
            {existingTask ? "开启协同" : "新建协同约定"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm text-slate-700">主题</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：我们的一周年旅行计划"
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-slate-700">场景</Label>
            <div className="grid grid-cols-3 gap-2">
              {SCENARIOS.map((s) => {
                const Icon = s.icon;
                const active = scenario === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setScenario(s.key)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      active
                        ? "border-[#384877] bg-[#eef2ff] shadow-sm"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    )}
                  >
                    <Icon className={cn("w-5 h-5 mb-1.5", active ? "text-[#384877]" : "text-slate-400")} />
                    <p className={cn("text-sm font-semibold", active ? "text-[#384877]" : "text-slate-700")}>
                      {s.label}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{s.description}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">{scenarioMeta.tone}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-slate-700">共同目标（一句话）</Label>
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="例如：一起定出十月出行的行程和分工"
              maxLength={120}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Bot className="w-4 h-4 text-indigo-600" />
              <div>
                <p className="text-sm font-medium text-slate-700">心栈 Agent</p>
                <p className="text-[11px] text-slate-400">整理讨论、提取子约定、协调分歧（每次 2 积分）</p>
              </div>
            </div>
            <Switch
              checked={agentEnabled}
              onCheckedChange={setAgentEnabled}
              className="data-[state=checked]:bg-[#384877]"
            />
          </div>

          <Button
            className="w-full bg-[#384877] hover:bg-[#2e3a62]"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "创建中…" : existingTask ? "开启协同空间" : "创建并进入共创空间"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
