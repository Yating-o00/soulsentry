import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Sparkles, Loader2, Wand2, X, CheckCircle2, ChevronRight, ChevronDown, Plus, Calendar as CalendarIcon, Clock, AlertCircle, Tag as TagIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function SmartTextParser({ onTasksGenerated }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedTasks, setParsedTasks] = useState([]);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [refiningState, setRefiningState] = useState(null); // { taskIndex, subIndex }

  const handleParse = async () => {
    if (!text.trim()) {
      toast.error("请输入要解析的文本");
      return;
    }

    setParsing(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个任务拆解专家。请从以下文本中提取任务信息，并识别大任务与子任务的层级关系。

文本内容：
${text}

请分析文本并提取以下信息：
1. 识别主要任务（大任务）和子任务（小任务）的关系
   - 例如："准备晚餐"是主任务，"购买食材"、"炒菜"、"做汤"是子任务
   - 例如："完成项目报告"是主任务，"收集数据"、"分析数据"、"撰写报告"是子任务
2. 为每个任务提取：标题、描述、提醒时间、优先级、类别
3. 子任务的提醒时间应该早于或等于父任务的提醒时间
4. 如果文本中没有明确的层级关系，但任务可以拆解，请智能拆解
5. 为子任务添加序号标识（如：步骤1、步骤2等）

提醒时间规则：
- 如果提到具体时间，转换为ISO格式
- 相对时间（如"明天"、"下周"）计算具体日期
- 没有明确时间时，使用当前时间的第二天上午9点
- 子任务时间应该合理分布在父任务之前

优先级判断：
- urgent: 非常紧急，需要立即处理
- high: 重要且紧急
- medium: 正常优先级
- low: 不紧急

类别判断：
- work: 工作相关
- personal: 个人事务
- health: 健康相关
- study: 学习相关
- family: 家庭相关
- shopping: 购物相关
- finance: 财务相关
- other: 其他

当前时间：${new Date().toISOString()}`,
        response_json_schema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  reminder_time: { type: "string" },
                  priority: { 
                    type: "string",
                    enum: ["low", "medium", "high", "urgent"]
                  },
                  category: { 
                    type: "string",
                    enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"]
                  },
                  subtasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        reminder_time: { type: "string" },
                        priority: { 
                          type: "string",
                          enum: ["low", "medium", "high", "urgent"]
                        },
                        order: { type: "number", description: "子任务的顺序序号" }
                      },
                      required: ["title", "reminder_time"]
                    }
                  }
                },
                required: ["title", "reminder_time"]
              }
            }
          },
          required: ["tasks"]
        }
      });

      if (response.tasks && response.tasks.length > 0) {
        setParsedTasks(response.tasks);
        const totalSubtasks = response.tasks.reduce((sum, task) => 
          sum + (task.subtasks?.length || 0), 0
        );
        toast.success(`成功解析出 ${response.tasks.length} 个主任务${totalSubtasks > 0 ? `和 ${totalSubtasks} 个子任务` : ''}！`);
      } else {
        toast.error("未能从文本中提取到任务信息");
      }
    } catch (error) {
      toast.error("解析失败，请重试");
      console.error("Parse error:", error);
    }
    setParsing(false);
  };

  const handleCreateAll = async () => {
    if (parsedTasks.length === 0) return;
    
    // 直接传递完整的解析结果，包含主任务和子任务的层级结构
    onTasksGenerated(parsedTasks);
    setParsedTasks([]);
    setText("");
    setExpandedTasks(new Set());
  };

  const handleRemoveTask = (index) => {
    setParsedTasks(tasks => tasks.filter((_, i) => i !== index));
  };

  const handleRemoveSubtask = (taskIndex, subtaskIndex) => {
    setParsedTasks(tasks => 
      tasks.map((task, i) => 
        i === taskIndex 
          ? { ...task, subtasks: task.subtasks.filter((_, j) => j !== subtaskIndex) }
          : task
      )
    );
  };

  const handleEditTask = (index, field, value) => {
    setParsedTasks(tasks => 
      tasks.map((task, i) => 
        i === index ? { ...task, [field]: value } : task
      )
    );
  };

  const handleEditSubtask = (taskIndex, subtaskIndex, field, value) => {
    setParsedTasks(tasks => 
      tasks.map((task, i) => 
        i === taskIndex 
          ? {
              ...task,
              subtasks: task.subtasks.map((subtask, j) => 
                j === subtaskIndex ? { ...subtask, [field]: value } : subtask
              )
            }
          : task
      )
    );
  };

  const handleAddSubtask = (taskIndex) => {
    setParsedTasks(tasks => 
      tasks.map((task, i) => {
        if (i === taskIndex) {
          const newSubtask = {
            title: "",
            description: "",
            reminder_time: task.reminder_time, // Default to parent's time
            priority: "medium",
            order: (task.subtasks?.length || 0) + 1
          };
          return {
            ...task,
            subtasks: [...(task.subtasks || []), newSubtask]
          };
        }
        return task;
      })
    );
    // Automatically expand the task to show the new subtask
    setExpandedTasks(prev => new Set(prev).add(taskIndex));
  };

  const toggleExpanded = (index) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSmartRefineSubtask = async (taskIndex, subtaskIndex) => {
    const task = parsedTasks[taskIndex];
    const subtask = task.subtasks[subtaskIndex];
    
    if (!subtask.title.trim()) {
      toast.error("请先输入子任务内容");
      return;
    }

    setRefiningState({ taskIndex, subIndex: subtaskIndex });
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `请分析并完善以下子任务。
        
当前子任务内容：${subtask.title}
${subtask.description ? `当前描述：${subtask.description}` : ""}
所属主任务：${task.title} (时间: ${task.reminder_time})

请执行以下操作：
1. 【语义识别】：如果标题包含时间（如"明天"）或优先级（如"紧急"），请提取并清洗标题。
2. 【内容完善】：优化标题使其更清晰；如果描述为空，生成简短实用的执行步骤；如果已有描述，进行润色。
3. 【属性推断】：基于主任务时间和子任务内容，推断合理的提醒时间（应早于主任务）和优先级。

当前时间：${new Date().toISOString()}`,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            reminder_time: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] }
          },
          required: ["title", "description", "reminder_time", "priority"]
        }
      });

      if (response) {
        setParsedTasks(tasks => 
          tasks.map((t, i) => 
            i === taskIndex 
              ? {
                  ...t,
                  subtasks: t.subtasks.map((st, j) => 
                    j === subtaskIndex 
                      ? { ...st, ...response } 
                      : st
                  )
                }
              : t
          )
        );
        toast.success("子任务已智能完善 ✨");
      }
    } catch (error) {
      console.error("Refine error:", error);
      toast.error("智能完善失败");
    }
    setRefiningState(null);
  };

  const PRIORITY_LABELS = {
    low: { label: "低", color: "bg-[#f4f6f8] text-[#52525b]" },
    medium: { label: "中", color: "bg-[#e5e9ef] text-[#384877]" },
    high: { label: "高", color: "bg-[#fff1f2] text-[#de6d7e]" },
    urgent: { label: "紧急", color: "bg-[#ffe4e6] text-[#d5495f]" },
  };

  const CATEGORY_LABELS = {
    work: { label: "工作", color: "bg-[#e5e9ef] text-[#384877]" },
    personal: { label: "个人", color: "bg-[#e0f2fe] text-[#0891b2]" },
    health: { label: "健康", color: "bg-[#d1fae5] text-[#059669]" },
    study: { label: "学习", color: "bg-[#fef3c7] text-[#d97706]" },
    family: { label: "家庭", color: "bg-[#fce7f3] text-[#db2777]" },
    shopping: { label: "购物", color: "bg-[#fed7aa] text-[#ea580c]" },
    finance: { label: "财务", color: "bg-[#ffe4e6] text-[#d5495f]" },
    other: { label: "其他", color: "bg-[#f4f6f8] text-[#52525b]" },
  };

  return (
    <Card className="border border-[#e5e9ef] shadow-md hover:shadow-lg transition-all bg-white rounded-[16px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <Wand2 className="w-5 h-5 text-[#384877]" />
          <span className="text-[#222222]">智能文本解析</span>
        </CardTitle>
        <p className="text-[15px] text-[#52525b] mt-1.5">
          粘贴任何文本，AI 自动提取并智能拆解任务
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder="粘贴文本，例如：&#10;明天晚上准备家庭聚餐，需要买菜、做三道菜和一个汤&#10;本周完成项目报告，包括数据收集、分析和撰写..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[120px] border border-[#e5e9ef] bg-[#f9fafb] focus-visible:ring-2 focus-visible:ring-[#5a647d]/20 focus-visible:border-[#384877] rounded-[12px] text-[15px]"
          />
          
          <div className="flex gap-2">
            <Button
              onClick={handleParse}
              disabled={parsing || !text.trim()}
              className="flex-1 bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2c3b63] hover:to-[#2a4585] shadow-md hover:shadow-lg transition-all duration-200 rounded-[12px]"
            >
              {parsing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  AI 解析中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  智能解析
                </>
              )}
            </Button>
            
            {text.trim() && (
              <Button
                variant="outline"
                onClick={() => setText("")}
                className="rounded-[12px] border-[#dce4ed]"
              >
                清空
              </Button>
            )}
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {parsedTasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#d5495f]" />
                  <span className="font-semibold text-slate-800">
                    解析结果 ({parsedTasks.length} 个主任务)
                  </span>
                </div>
                <Button
                  onClick={handleCreateAll}
                  className="bg-[#d5495f] hover:bg-[#c03d50] shadow-md hover:shadow-lg transition-all rounded-[12px]"
                  >
                  创建全部任务
                  </Button>
              </div>

              <div className="space-y-2">
                {parsedTasks.map((task, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white rounded-[12px] border border-[#dce4ed] overflow-hidden hover:border-[#c8d1e0] transition-all"
                  >
                    {/* 主任务 */}
                    <div className="p-4 hover:bg-[#f9fafb] transition-all group">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3 flex-1">
                          <button
                            onClick={() => toggleExpanded(index)}
                            className="mt-1 hover:bg-[#e5e9ef] rounded-lg p-1 transition-colors flex-shrink-0"
                          >
                            {(task.subtasks && task.subtasks.length > 0) || expandedTasks.has(index) ? (
                              expandedTasks.has(index) ? (
                                <ChevronDown className="w-4 h-4 text-[#384877]" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-[#384877]" />
                              )
                            ) : (
                              <div className="w-4 h-4" /> 
                            )}
                          </button>
                          <div className="flex-1 space-y-2">
                            <Input
                              value={task.title}
                              onChange={(e) => handleEditTask(index, 'title', e.target.value)}
                              className="font-semibold text-[#222222] text-lg border-none p-0 h-auto focus-visible:ring-0 bg-transparent placeholder:text-slate-300 shadow-none"
                              placeholder="任务标题"
                            />
                            <Textarea
                              value={task.description || ""}
                              onChange={(e) => handleEditTask(index, 'description', e.target.value)}
                              className="text-[14px] text-[#52525b] min-h-[24px] border-none p-0 focus-visible:ring-0 bg-transparent resize-none placeholder:text-slate-300 shadow-none"
                              placeholder="添加描述..."
                              rows={1}
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveTask(index)}
                          className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 ml-9">
                        <Select
                          value={task.priority}
                          onValueChange={(value) => handleEditTask(index, 'priority', value)}
                        >
                          <SelectTrigger className="h-7 w-auto gap-1.5 border-0 bg-[#f4f6f8] hover:bg-[#e5e9ef] rounded-md px-2 text-xs font-medium text-[#384877] shadow-none focus:ring-0">
                            <AlertCircle className="w-3 h-3" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(PRIORITY_LABELS).map(([key, config]) => (
                              <SelectItem key={key} value={key}>
                                {config.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={task.category}
                          onValueChange={(value) => handleEditTask(index, 'category', value)}
                        >
                          <SelectTrigger className="h-7 w-auto gap-1.5 border-0 bg-[#f4f6f8] hover:bg-[#e5e9ef] rounded-md px-2 text-xs font-medium text-[#384877] shadow-none focus:ring-0">
                            <TagIcon className="w-3 h-3" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORY_LABELS).map(([key, config]) => (
                              <SelectItem key={key} value={key}>
                                {config.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" className="h-7 gap-1.5 border-0 bg-[#f4f6f8] hover:bg-[#e5e9ef] rounded-md px-2 text-xs font-medium text-[#384877] shadow-none">
                              <CalendarIcon className="w-3 h-3" />
                              {task.reminder_time ? format(new Date(task.reminder_time), "MM-dd HH:mm") : "设置时间"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={task.reminder_time ? new Date(task.reminder_time) : undefined}
                              onSelect={(date) => date && handleEditTask(index, 'reminder_time', date.toISOString())}
                              locale={zhCN}
                              initialFocus
                            />
                            <div className="p-3 border-t border-slate-100">
                              <Input
                                type="time"
                                value={task.reminder_time ? format(new Date(task.reminder_time), "HH:mm") : "09:00"}
                                onChange={(e) => {
                                  const [hours, minutes] = e.target.value.split(':');
                                  const date = task.reminder_time ? new Date(task.reminder_time) : new Date();
                                  date.setHours(parseInt(hours), parseInt(minutes));
                                  handleEditTask(index, 'reminder_time', date.toISOString());
                                }}
                                className="h-8"
                              />
                            </div>
                          </PopoverContent>
                        </Popover>

                        <div className="flex-1" />
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddSubtask(index)}
                          className="h-7 gap-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-md"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          查看并添加子任务
                        </Button>
                      </div>
                    </div>

                    {/* 子任务列表 */}
                    {task.subtasks && task.subtasks.length > 0 && expandedTasks.has(index) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-[#f9fafb] border-t border-[#e5e9ef] pl-9 pr-4 py-2"
                      >
                        <div className="space-y-2">
                          {task.subtasks.map((subtask, subIndex) => (
                            <div
                              key={subIndex}
                              className="group relative p-3 bg-white rounded-lg border border-[#e5e9ef] hover:border-[#dce4ed] hover:shadow-sm transition-all"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[#384877]/10 text-[#384877] flex items-center justify-center text-[10px] font-bold mt-1">
                                  {subIndex + 1}
                                </div>
                                
                                <div className="flex-1 space-y-2">
                                  <Input
                                    value={subtask.title}
                                    onChange={(e) => handleEditSubtask(index, subIndex, 'title', e.target.value)}
                                    className="font-medium text-[#222222] border-none p-0 h-auto focus-visible:ring-0 bg-transparent shadow-none placeholder:text-slate-300 text-sm"
                                    placeholder="子任务标题"
                                  />
                                  <Textarea
                                    value={subtask.description || ""}
                                    onChange={(e) => handleEditSubtask(index, subIndex, 'description', e.target.value)}
                                    className="text-xs text-[#52525b] min-h-[20px] border-none p-0 focus-visible:ring-0 bg-transparent resize-none shadow-none placeholder:text-slate-300"
                                    placeholder="添加描述..."
                                    rows={1}
                                  />
                                  
                                  <div className="flex items-center gap-2 pt-1">
                                    <Select
                                      value={subtask.priority}
                                      onValueChange={(value) => handleEditSubtask(index, subIndex, 'priority', value)}
                                    >
                                      <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-[#f4f6f8] hover:bg-[#e5e9ef] rounded px-1.5 text-[10px] font-medium text-[#384877] shadow-none focus:ring-0">
                                        <div className={`w-1.5 h-1.5 rounded-full ${PRIORITY_LABELS[subtask.priority]?.color.split(' ')[0].replace('bg-', 'bg-')}`} />
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {Object.entries(PRIORITY_LABELS).map(([key, config]) => (
                                          <SelectItem key={key} value={key} className="text-xs">
                                            {config.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>

                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="ghost" className="h-6 gap-1 border-0 bg-[#f4f6f8] hover:bg-[#e5e9ef] rounded px-1.5 text-[10px] font-medium text-[#384877] shadow-none">
                                          <Clock className="w-3 h-3" />
                                          {subtask.reminder_time ? format(new Date(subtask.reminder_time), "MM-dd HH:mm") : "设置时间"}
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                          mode="single"
                                          selected={subtask.reminder_time ? new Date(subtask.reminder_time) : undefined}
                                          onSelect={(date) => date && handleEditSubtask(index, subIndex, 'reminder_time', date.toISOString())}
                                          locale={zhCN}
                                          initialFocus
                                        />
                                        <div className="p-3 border-t border-slate-100">
                                          <Input
                                            type="time"
                                            value={subtask.reminder_time ? format(new Date(subtask.reminder_time), "HH:mm") : "09:00"}
                                            onChange={(e) => {
                                              const [hours, minutes] = e.target.value.split(':');
                                              const date = subtask.reminder_time ? new Date(subtask.reminder_time) : new Date();
                                              date.setHours(parseInt(hours), parseInt(minutes));
                                              handleEditSubtask(index, subIndex, 'reminder_time', date.toISOString());
                                            }}
                                            className="h-8"
                                          />
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                </div>

                                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleSmartRefineSubtask(index, subIndex)}
                                    disabled={refiningState?.taskIndex === index && refiningState?.subIndex === subIndex}
                                    className="h-6 w-6 text-blue-400 hover:bg-blue-50 hover:text-blue-600 rounded"
                                    title="AI 智能完善：自动提取时间、优先级并生成描述"
                                  >
                                    {refiningState?.taskIndex === index && refiningState?.subIndex === subIndex ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveSubtask(index, subIndex)}
                                    className="h-6 w-6 text-slate-300 hover:bg-red-50 hover:text-red-600 rounded"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-[#f9fafb] border border-[#e5e9ef] rounded-[12px] p-3">
          <p className="text-[13px] text-[#52525b] leading-relaxed">
            💡 <strong className="text-[#222222]">提示：</strong>AI 自动识别任务层级关系。例如"准备晚餐"会被拆解为"购买食材"、"做菜"等子任务。支持自然语言，如"明天下午3点"、"本周五前"等。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}