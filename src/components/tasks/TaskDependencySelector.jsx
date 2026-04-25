import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Link as LinkIcon, X, AlertCircle, CheckCircle2, FolderOpen, GitMerge } from "lucide-react";

const CATEGORY_LABELS = {
    work: "工作", personal: "个人", health: "健康", study: "学习",
    family: "家庭", shopping: "购物", finance: "财务", other: "其他"
};

function TaskRow({ task, isSelected, isChild, parentTitle, onToggle }) {
    return (
        <div
            onClick={() => onToggle(task.id)}
            className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                isChild ? "ml-5" : ""
            } ${isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50"}`}
        >
            <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggle(task.id)}
                id={`task-${task.id}`}
            />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    {isChild ? (
                        <GitMerge className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    ) : (
                        <FolderOpen className="w-3 h-3 text-blue-500 flex-shrink-0" />
                    )}
                    <p className="text-sm font-medium text-slate-700 truncate">
                        {task.title}
                    </p>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${isChild ? "border-slate-200 text-slate-400" : "border-blue-200 text-blue-600"}`}>
                        {isChild ? "子约定" : "父约定"}
                    </Badge>
                    {isChild && parentTitle && (
                        <span className="text-[10px] text-slate-400 truncate">属于: {parentTitle}</span>
                    )}
                    <span className="text-[10px] text-slate-400">
                        {task.status === 'completed' ? '✓ 已完成' : '○ 未完成'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                        {CATEGORY_LABELS[task.category] || task.category}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function TaskDependencySelector({ currentTaskId, currentTask, selectedDependencies, selectedDependencyIds, onUpdate, onClose }) {
    // 兼容两种调用方式：currentTask/selectedDependencyIds 或 currentTaskId/selectedDependencies
    const effectiveCurrentId = currentTaskId || currentTask?.id;
    const effectiveSelected = selectedDependencyIds ?? selectedDependencies ?? [];
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState("all"); // "all" | "parent" | "child"

    const { data: allTasks = [] } = useQuery({
        queryKey: ['tasks-dependency-search'],
        queryFn: () => base44.entities.Task.list(),
        initialData: []
    });

    // Build a map of task id -> task for parent title lookup
    const taskMap = useMemo(() => {
        const map = {};
        allTasks.forEach(t => { map[t.id] = t; });
        return map;
    }, [allTasks]);

    // Separate parent and child tasks
    const { parentTasks, childTasks } = useMemo(() => {
        const available = allTasks.filter(t => t.id !== effectiveCurrentId && !t.deleted_at);
        const parents = [];
        const children = [];
        available.forEach(t => {
            if (t.parent_task_id) {
                children.push(t);
            } else {
                parents.push(t);
            }
        });
        return { parentTasks: parents, childTasks: children };
    }, [allTasks, effectiveCurrentId]);

    // Apply search and type filter
    const filteredTasks = useMemo(() => {
        let list = [];
        if (filterType === "all") {
            // Group: parents first, then their children underneath
            parentTasks.forEach(p => {
                list.push({ ...p, _isChild: false });
                childTasks
                    .filter(c => c.parent_task_id === p.id)
                    .forEach(c => list.push({ ...c, _isChild: true, _parentTitle: p.title }));
            });
            // Orphan children (parent deleted or not in list)
            const parentIds = new Set(parentTasks.map(p => p.id));
            childTasks
                .filter(c => !parentIds.has(c.parent_task_id))
                .forEach(c => {
                    const parent = taskMap[c.parent_task_id];
                    list.push({ ...c, _isChild: true, _parentTitle: parent?.title || "" });
                });
        } else if (filterType === "parent") {
            list = parentTasks.map(p => ({ ...p, _isChild: false }));
        } else {
            list = childTasks.map(c => ({
                ...c,
                _isChild: true,
                _parentTitle: taskMap[c.parent_task_id]?.title || ""
            }));
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(t => t.title.toLowerCase().includes(q));
        }
        return list;
    }, [parentTasks, childTasks, taskMap, filterType, searchQuery]);

    const dependencies = allTasks.filter(t => effectiveSelected.includes(t.id));

    const handleToggle = (taskId) => {
        const newIds = effectiveSelected.includes(taskId)
            ? effectiveSelected.filter(id => id !== taskId)
            : [...effectiveSelected, taskId];
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
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ml-1 ${dep.parent_task_id ? "border-slate-200 text-slate-400" : "border-blue-200 text-blue-600"}`}>
                                        {dep.parent_task_id ? "子" : "父"}
                                    </Badge>
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

                {/* Type Filter Tabs */}
                <div className="flex gap-1.5">
                    {[
                        { key: "all", label: "全部" },
                        { key: "parent", label: "父约定", icon: <FolderOpen className="w-3 h-3" /> },
                        { key: "child", label: "子约定", icon: <GitMerge className="w-3 h-3" /> }
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilterType(f.key)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                filterType === f.key
                                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                                    : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                            }`}
                        >
                            {f.icon}
                            {f.label}
                            <span className="text-[10px] ml-0.5 opacity-60">
                                {f.key === "all" ? parentTasks.length + childTasks.length : f.key === "parent" ? parentTasks.length : childTasks.length}
                            </span>
                        </button>
                    ))}
                </div>
                
                <ScrollArea className="h-[240px] border rounded-md p-2">
                    <div className="space-y-0.5">
                        {filteredTasks.length === 0 ? (
                            <div className="text-center py-4 text-slate-400 text-sm">
                                没有找到相关约定
                            </div>
                        ) : (
                            filteredTasks.map(task => (
                                <TaskRow
                                    key={task.id}
                                    task={task}
                                    isSelected={effectiveSelected.includes(task.id)}
                                    isChild={task._isChild}
                                    parentTitle={task._parentTitle}
                                    onToggle={handleToggle}
                                />
                            ))
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