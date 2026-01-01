import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Link as LinkIcon, X, AlertCircle, CheckCircle2 } from "lucide-react";

export default function TaskDependencySelector({ currentTaskId, selectedDependencies = [], onUpdate, onClose }) {
    const [searchQuery, setSearchQuery] = useState("");

    const { data: allTasks = [] } = useQuery({
        queryKey: ['tasks-dependency-search'],
        queryFn: () => base44.entities.Task.list(),
        initialData: []
    });

    const filteredTasks = allTasks.filter(task => 
        task.id !== currentTaskId &&
        !task.deleted_at &&
        (task.title.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const dependencies = allTasks.filter(t => selectedDependencies.includes(t.id));

    const handleToggle = (taskId) => {
        const newIds = selectedDependencies.includes(taskId)
            ? selectedDependencies.filter(id => id !== taskId)
            : [...selectedDependencies, taskId];
        onUpdate(newIds);
    };

    return (
        <div className="space-y-4">
            {/* Selected Dependencies List */}
            <div className="space-y-2">
                <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    当前依赖 ({dependencies.length})
                </h4>
                {dependencies.length > 0 ? (
                    <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        {dependencies.map(dep => (
                            <div key={dep.id} className="flex items-center justify-between bg-white p-2 rounded border border-slate-200">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    {dep.status === 'completed' ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                                    )}
                                    <span className={`text-sm truncate ${dep.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                        {dep.title}
                                    </span>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleToggle(dep.id)}
                                    className="h-6 w-6 text-slate-400 hover:text-red-500"
                                >
                                    <X className="w-3 h-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-slate-400 italic">暂无前置依赖约定</p>
                )}
            </div>

            {/* Add Dependency */}
            <div className="space-y-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="搜索约定添加依赖..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
                
                <ScrollArea className="h-[200px] border rounded-md p-2">
                    <div className="space-y-1">
                        {filteredTasks.length === 0 ? (
                            <div className="text-center py-4 text-slate-400 text-sm">
                                没有找到相关约定
                            </div>
                        ) : (
                            filteredTasks.map(task => {
                                const isSelected = selectedDependencies.includes(task.id);
                                return (
                                    <div
                                        key={task.id}
                                        onClick={() => handleToggle(task.id)}
                                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                                            isSelected ? "bg-blue-50" : "hover:bg-slate-50"
                                        }`}
                                    >
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => handleToggle(task.id)}
                                            id={`task-${task.id}`}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-700 truncate">
                                                {task.title}
                                            </p>
                                            <p className="text-xs text-slate-500 truncate">
                                                {task.status === 'completed' ? '已完成' : '未完成'} • {task.category}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </ScrollArea>
            </div>

            {onClose && (
                <div className="flex justify-end pt-4 border-t">
                    <Button onClick={onClose}>确定</Button>
                </div>
            )}
        </div>
    );
}