// 执行节点：按类别分栏（同一类别一个栏，栏内进度一目了然）+ 勾选完成 + 自定义类别
import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Flag, Plus, RefreshCw, Scale, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { C, NODE_TYPE_LABELS, formatTime } from "./constants";
import { PanelHeader } from "./Common";

const NODE_ICONS = { time: Clock, stage: Flag, decision: Scale, review: RefreshCw };
const PRESET_TYPES = ["time", "stage", "decision", "review"];
const typeLabel = (t) => NODE_TYPE_LABELS[t] || t || "阶段";

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

  // 分组：四个预设类别按固定顺序在前，自定义类别按出现顺序跟在后面
  const groups = useMemo(() => {
    const order = [];
    const map = new Map();
    for (const node of nodes) {
      const t = node.node_type || "stage";
      if (!map.has(t)) { map.set(t, []); order.push(t); }
      map.get(t).push(node);
    }
    order.sort((a, b) => {
      const ia = PRESET_TYPES.indexOf(a);
      const ib = PRESET_TYPES.indexOf(b);
      return (ia === -1 ? PRESET_TYPES.length : ia) - (ib === -1 ? PRESET_TYPES.length : ib);
    });
    return order.map((t) => ({ type: t, nodes: map.get(t) }));
  }, [nodes]);

  const customTypes = useMemo(
    () => [...new Set(nodes.map((n) => n.node_type || "stage"))].filter((t) => !PRESET_TYPES.includes(t)),
    [nodes]
  );

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
        body: { title, node_type: newNode.node_type.trim() || "stage" },
      });
      setNewNode({ title: "", node_type: newNode.node_type });
      invalidateAll();
      toast.success("节点已添加");
    } catch (error) {
      toast.error(error?.message || "添加失败");
    } finally {
      setAddingNode(false);
    }
  };

  const doneTotal = nodes.filter((n) => n.done_at).length;

  return (
    <section id="content-milestones" className="border-b px-4 py-5 sm:px-6" style={{ borderColor: C.line }}>
      <PanelHeader
        eyebrow="Milestones"
        title={`执行节点 · ${doneTotal}/${nodes.length}`}
        description="同一类别的节点归在一个栏里，栏内进度就是该类别的推进情况。"
      />
      <div className="mt-2">
        {nodes.length === 0 && (
          <p className="py-5 text-center text-xs italic" style={{ color: "#99958d" }}>
            还没有执行节点：把讨论「标记节点」，或在下方添加
          </p>
        )}
        {groups.map((group) => {
          const Icon = NODE_ICONS[group.type] || Flag;
          const doneCount = group.nodes.filter((n) => n.done_at).length;
          const ratio = group.nodes.length > 0 ? doneCount / group.nodes.length : 0;
          return (
            <div key={group.type} className="mt-3 first:mt-1">
              {/* 类别栏头：类别名 + 进度 */}
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "#384877" }} />
                <span className="text-xs font-semibold" style={{ color: "#45413d" }}>{typeLabel(group.type)}</span>
                <span className="shrink-0 font-mono text-[9px]" style={{ color: "#858179" }}>
                  {doneCount}/{group.nodes.length}
                </span>
                <span className="h-1 min-w-10 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "#e8e7e1" }}>
                  <span
                    className="block h-1 rounded-full transition-all"
                    style={{ width: `${ratio * 100}%`, backgroundColor: ratio === 1 ? C.green : "#384877" }}
                  />
                </span>
              </div>
              {/* 栏内节点：归口节点在上，同主题推进作为子项缩进挂在下面 */}
              <div className="mt-0.5">
                {(() => {
                  const byParent = new Map();
                  for (const n of group.nodes) {
                    const key = n.parent_id || "";
                    if (!byParent.has(key)) byParent.set(key, []);
                    byParent.get(key).push(n);
                  }
                  const topNodes = byParent.get("") || [];
                  const renderNode = (node, isChild) => {
                    const done = !!node.done_at;
                    const children = byParent.get(node.id) || [];
                    const doneKids = children.filter((c) => c.done_at).length;
                    return (
                      <div key={node.id}>
                        <button
                          type="button"
                          onClick={() => handleToggleNode(node)}
                          disabled={togglingNodeId === node.id}
                          className={cn(
                            "group flex w-full items-start gap-3 text-left disabled:opacity-50 min-h-8 focus-visible:outline-none",
                            isChild ? "py-2 pl-7" : "py-3.5",
                            (!isChild || children.length === 0) && "border-b border-[#dfddd6]"
                          )}
                        >
                          <span
                            className={cn("shrink-0 rounded-full", isChild ? "mt-1.5 h-2 w-2" : "mt-1.5 h-2.5 w-2.5")}
                            style={isChild
                              ? { backgroundColor: done ? C.green : "#c4c0b7" }
                              : { boxShadow: "0 0 0 4px #e8e7e1", backgroundColor: done ? C.green : "#b8b4ab" }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-3">
                              <span className={cn("text-xs font-semibold leading-5", done ? "text-[#858179] line-through" : "")} style={done ? undefined : { color: "#45413d" }}>
                                <span className={cn(!isChild && "truncate", "break-words")}>{node.title}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1 font-mono text-[9px]" style={{ color: "#858179" }}>
                                {node.agent_done && done && <Sparkles className="h-3 w-3" style={{ color: "#384877" }} />}
                                {children.length > 0
                                  ? `${doneKids}/${children.length}`
                                  : done ? formatTime(node.done_at) : node.due_at ? formatTime(node.due_at) : typeLabel(node.node_type)}
                              </span>
                            </span>
                          </span>
                        </button>
                        {children.length > 0 && (
                          <div className="border-b border-[#dfddd6] pb-1">
                            {children.map((child) => renderNode(child, true))}
                          </div>
                        )}
                      </div>
                    );
                  };
                  return topNodes.map((node) => renderNode(node, false));
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* 添加节点：内容 + 类别（预设四选一或输入自定义类别） */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Plus className="h-4 w-4 shrink-0" style={{ color: "#99958d" }} />
        <Input
          value={newNode.title}
          onChange={(e) => setNewNode((prev) => ({ ...prev, title: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") handleAddNode(); }}
          placeholder="节点内容，回车保存"
          className="h-8 min-w-[140px] flex-1 text-xs border-dashed"
        />
        <Input
          value={newNode.node_type}
          onChange={(e) => setNewNode((prev) => ({ ...prev, node_type: e.target.value }))}
          list="collab-node-types"
          placeholder="类别"
          aria-label="节点类别"
          className="h-8 w-28 text-xs border-dashed"
        />
        <datalist id="collab-node-types">
          {PRESET_TYPES.map((t) => <option key={t} value={t} label={NODE_TYPE_LABELS[t]} />)}
          {customTypes.map((t) => <option key={t} value={t} />)}
        </datalist>
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
