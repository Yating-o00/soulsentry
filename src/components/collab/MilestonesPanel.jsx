// 执行节点：圆点时间线 + 勾选完成 + 按类型添加
import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Clock, Flag, Plus, RefreshCw, Scale, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { C, NODE_TYPE_LABELS, formatTime } from "./constants";
import { PanelHeader } from "./Common";

const NODE_ICONS = { time: Clock, stage: Flag, decision: Scale, review: RefreshCw };

export default function MilestonesPanel({ summary, taskId }) {
  const queryClient = useQueryClient();
  const nodes = summary?.nodes || [];
  const [newNode, setNewNode] = useState({ title: "", node_type: "stage" });
  const [addingNode, setAddingNode] = useState(false);
  const [togglingNodeId, setTogglingNodeId] = useState(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleToggleNode = async (node) => {
    setTogglingNodeId(node.id);
    try {
      await httpRequest(`/api/collab/${taskId}/nodes/${node.id}`, {
        method: "PATCH",
        body: { done_at: node.done_at ? null : new Date().toISOString() },
      });
      invalidateAll();
    } catch (error) {
      toast.error(error?.message || "操作失败");
    } finally {
      setTogglingNodeId(null);
    }
  };

  const handleAddNode = async () => {
    const title = newNode.title.trim();
    if (!title) return;
    setAddingNode(true);
    try {
      await httpRequest(`/api/collab/${taskId}/nodes`, {
        method: "POST",
        body: { title, node_type: newNode.node_type },
      });
      setNewNode({ title: "", node_type: "stage" });
      invalidateAll();
      toast.success("节点已添加");
    } catch (error) {
      toast.error(error?.message || "添加失败");
    } finally {
      setAddingNode(false);
    }
  };

  return (
    <section id="content-milestones" className="border-b px-4 py-5 sm:px-6" style={{ borderColor: C.line }}>
      <PanelHeader
        eyebrow="Milestones"
        title={`执行节点 · ${nodes.filter((n) => n.done_at).length}/${nodes.length}`}
        description="用时间、阶段或决策节点标记共同进度。"
      />
      <div className="mt-2">
        {nodes.length === 0 && (
          <p className="py-5 text-center text-xs italic" style={{ color: "#99958d" }}>
            还没有执行节点：把讨论「标记节点」，或在下方添加
          </p>
        )}
        {nodes.map((node) => {
          const Icon = NODE_ICONS[node.node_type] || Flag;
          const done = !!node.done_at;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => handleToggleNode(node)}
              disabled={togglingNodeId === node.id}
              className="group flex w-full items-start gap-3 border-b py-3.5 text-left last:border-b-0 disabled:opacity-50 min-h-8 focus-visible:outline-none"
              style={{ borderColor: "#dfddd6" }}
            >
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ boxShadow: "0 0 0 4px #e8e7e1", backgroundColor: done ? C.green : "#b8b4ab" }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className={cn("flex items-center gap-1.5 text-xs font-semibold leading-5", done ? "text-[#858179] line-through" : "")} style={done ? undefined : { color: "#45413d" }}>
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: done ? "#b8b4ab" : "#384877" }} />
                    <span className="truncate">{node.title}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[9px]" style={{ color: "#858179" }}>
                    {done ? formatTime(node.done_at) : node.due_at ? formatTime(node.due_at) : NODE_TYPE_LABELS[node.node_type] || node.node_type}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: "#858179" }}>
                  {done ? <Check className="h-3 w-3" style={{ color: C.green }} /> : <ChevronRight className="h-3 w-3" />}
                  {done && node.agent_done && <Sparkles className="h-3 w-3" style={{ color: "#384877" }} />}
                  {done ? (node.agent_done ? "心栈确定完成 · 点击可重新打开" : "已完成 · 点击重新打开") : "点击标记完成"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 添加节点：四类型 chip + 输入 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Plus className="h-4 w-4 shrink-0" style={{ color: "#99958d" }} />
        {(["time", "stage", "decision", "review"]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setNewNode((prev) => ({ ...prev, node_type: type }))}
            className={cn(
              "rounded-full border px-2.5 text-[11px] transition-colors min-h-7",
              newNode.node_type === type ? "border-[#384877] text-[#384877]" : "hover:border-slate-300"
            )}
            style={newNode.node_type === type ? { backgroundColor: C.brandTint } : { borderColor: "#d8d6cf", color: "#77736c" }}
          >
            {NODE_TYPE_LABELS[type]}
          </button>
        ))}
        <Input
          value={newNode.title}
          onChange={(e) => setNewNode((prev) => ({ ...prev, title: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") handleAddNode(); }}
          placeholder="节点内容，回车保存"
          className="h-8 min-w-[180px] flex-1 text-xs border-dashed"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleAddNode}
          disabled={addingNode || !newNode.title.trim()}
          className="h-8 text-xs flex-shrink-0"
        >
          {addingNode ? "添加中…" : "添加"}
        </Button>
      </div>
    </section>
  );
}
