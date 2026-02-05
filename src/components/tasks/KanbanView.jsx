import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { motion } from "framer-motion";
import { Plus, MoreHorizontal, AlertCircle, CheckCircle2, Circle, Clock, Ban } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import TaskCard from "./TaskCard";

const COLUMNS = [
  { id: "pending", title: "待办", icon: Circle, color: "text-slate-500", bg: "bg-slate-50" },
  { id: "in_progress", title: "进行中", icon: Clock, color: "text-blue-500", bg: "bg-blue-50" },
  { id: "blocked", title: "阻塞", icon: Ban, color: "text-red-500", bg: "bg-red-50" },
  { id: "completed", title: "已完成", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50" }
];

export default function KanbanView({ tasks, onUpdateTask, onTaskClick, onComplete, onDelete, onEdit }) {
  const [columns] = useState(COLUMNS);

  const getTasksByStatus = (status) => {
    return tasks.filter(task => {
        if (status === 'pending' && (!task.status || task.status === 'pending')) return true;
        if (status === 'in_progress' && task.status === 'in_progress') return true;
        if (status === 'blocked' && task.status === 'blocked') return true;
        if (status === 'completed' && task.status === 'completed') return true;
        return false;
    });
  };

  const onDragEnd = (result) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;
    
    // Update task status
    // Note: We are strictly changing status here. Order within column is not persisted in entity for now.
    onUpdateTask({
        id: draggableId,
        data: { 
            status: newStatus,
            completed_at: newStatus === 'completed' ? new Date().toISOString() : null
        }
    });
  };

  return (
    <div className="h-full overflow-x-auto pb-4">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 min-w-max h-full">
          {columns.map(column => {
            const columnTasks = getTasksByStatus(column.id);
            const ColumnIcon = column.icon;

            return (
              <div key={column.id} className="w-80 flex-shrink-0 flex flex-col h-full bg-slate-50/50 rounded-xl border border-slate-200/60">
                {/* Column Header */}
                <div className={`p-3 flex items-center justify-between border-b border-slate-200 bg-white rounded-t-xl sticky top-0 z-10`}>
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${column.bg}`}>
                        <ColumnIcon className={`w-4 h-4 ${column.color}`} />
                    </div>
                    <span className="font-semibold text-slate-700">{column.title}</span>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 text-xs px-2 py-0 h-5">
                      {columnTasks.length}
                    </Badge>
                  </div>
                  {column.id === 'pending' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600">
                          <Plus className="w-4 h-4" />
                      </Button>
                  )}
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={`flex-1 p-3 overflow-y-auto space-y-3 transition-colors ${
                        snapshot.isDraggingOver ? "bg-slate-100/50" : ""
                      }`}
                    >
                      {columnTasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={{
                                ...provided.draggableProps.style,
                                opacity: snapshot.isDragging ? 0.8 : 1,
                              }}
                            >
                                <TaskCard 
                                    task={task}
                                    onComplete={(status) => onComplete(task, status)}
                                    onDelete={() => onDelete(task.id)}
                                    onEdit={() => onEdit(task)}
                                    onClick={() => onTaskClick(task)}
                                    hideSubtaskList={true} // Keep cards compact
                                />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}