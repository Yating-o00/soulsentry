import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { Clock, GripVertical } from "lucide-react";

const COLUMNS = [
  { id: "ready",       label: "待就绪",  color: "bg-indigo-500",  bg: "bg-indigo-50",  border: "border-indigo-200", text: "text-indigo-700" },
  { id: "in_progress", label: "进行中",  color: "bg-amber-500",   bg: "bg-amber-50",   border: "border-amber-200",  text: "text-amber-700" },
  { id: "completed",   label: "已完成",  color: "bg-emerald-500", bg: "bg-emerald-50",  border: "border-emerald-200",text: "text-emerald-700" },
  { id: "blocked",     label: "阻塞",    color: "bg-red-500",     bg: "bg-red-50",      border: "border-red-200",    text: "text-red-700" },
];

// Normalize various status strings to column ids
function normalizeStatus(status) {
  if (!status) return "ready";
  const s = status.toLowerCase();
  if (["ready", "pending", "待就绪"].includes(s)) return "ready";
  if (["active", "in_progress", "monitoring", "进行中"].includes(s)) return "in_progress";
  if (["completed", "done", "已完成"].includes(s)) return "completed";
  if (["blocked", "阻塞"].includes(s)) return "blocked";
  return "ready";
}

// Map column id back to a plan-compatible status
function columnToStatus(colId) {
  const map = { ready: "pending", in_progress: "active", completed: "completed", blocked: "blocked" };
  return map[colId] || "pending";
}

function KanbanCard({ item, index }) {
  return (
    <Draggable draggableId={item._kanbanId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "bg-white rounded-xl border p-3 mb-2 shadow-sm transition-shadow group",
            snapshot.isDragging ? "shadow-lg border-[#384877]/30 ring-2 ring-[#384877]/10" : "border-slate-200 hover:shadow-md"
          )}
        >
          <div className="flex items-start gap-2">
            <div
              {...provided.dragHandleProps}
              className="mt-0.5 text-slate-300 group-hover:text-slate-400 transition-colors cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
              {item.description && (
                <p className="text-xs text-slate-400 mt-0.5 truncate">{item.description}</p>
              )}
              {item.time && (
                <div className="flex items-center gap-1 mt-1.5">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span className="text-[11px] text-slate-500 font-mono">{item.time}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}

function KanbanColumn({ column, items }) {
  return (
    <div className="flex flex-col min-w-[200px] flex-1">
      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl mb-2", column.bg, column.border, "border")}>
        <div className={cn("w-2 h-2 rounded-full", column.color)} />
        <span className={cn("text-xs font-bold", column.text)}>{column.label}</span>
        <span className={cn("text-[10px] font-medium ml-auto", column.text)}>{items.length}</span>
      </div>
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex-1 min-h-[80px] rounded-xl p-1.5 transition-colors",
              snapshot.isDraggingOver ? "bg-slate-100/70" : "bg-slate-50/40"
            )}
          >
            {items.map((item, idx) => (
              <KanbanCard key={item._kanbanId} item={item} index={idx} />
            ))}
            {provided.placeholder}
            {items.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-6 text-xs text-slate-300">拖拽到此处</div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}

export default function KanbanBoard({ focusBlocks = [], keyTasks = [], onStatusChange }) {
  // Merge focus_blocks and key_tasks into kanban items with unique IDs
  const items = React.useMemo(() => {
    const fromBlocks = focusBlocks.map((b, i) => ({
      ...b,
      _kanbanId: `block_${i}`,
      _source: "block",
      _sourceIndex: i,
      status: b.status || "pending",
      description: b.description || "",
    }));
    const fromTasks = keyTasks.map((t, i) => ({
      ...t,
      _kanbanId: `task_${i}`,
      _source: "task",
      _sourceIndex: i,
      status: t.status || "pending",
      description: t.description || "",
    }));
    return [...fromBlocks, ...fromTasks];
  }, [focusBlocks, keyTasks]);

  // Group by column
  const grouped = React.useMemo(() => {
    const g = { ready: [], in_progress: [], completed: [], blocked: [] };
    items.forEach(item => {
      const col = normalizeStatus(item.status);
      g[col].push(item);
    });
    return g;
  }, [items]);

  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const item = items.find(it => it._kanbanId === draggableId);
    if (!item) return;

    const newStatus = columnToStatus(destination.droppableId);
    if (onStatusChange) {
      onStatusChange(item._source, item._sourceIndex, newStatus, item);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 md:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-bold text-[#2c3e50]">看板视图</h4>
        <span className="text-xs text-slate-400">{items.length} 项任务</span>
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {COLUMNS.map(col => (
            <KanbanColumn key={col.id} column={col} items={grouped[col.id]} />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}