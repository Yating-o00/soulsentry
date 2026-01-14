import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
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

export default function SmartTextParser({ onTasksGenerated, className = "" }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedTasks, setParsedTasks] = useState([]);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [refiningState, setRefiningState] = useState(null); // { taskIndex, subIndex }
  const [batchRefineInstruction, setBatchRefineInstruction] = useState("");
  const [isBatchRefining, setIsBatchRefining] = useState(false);
  const [openDatePopover, setOpenDatePopover] = useState(null); // { taskIndex, subIndex: null | number }

  const handleDateSelect = (date, currentIso, callback) => {
    if (!date) return;
    const current = currentIso ? new Date(currentIso) : new Date();
    const newDate = new Date(date);
    newDate.setHours(current.getHours());
    newDate.setMinutes(current.getMinutes());
    newDate.setSeconds(current.getSeconds());
    callback(newDate.toISOString());
    setOpenDatePopover(null);
  };

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const handleParse = async () => {
    if (!text.trim()) {
      toast.error("请输入要解析的文本");
      return;
    }

    setParsing(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个约定拆解专家。请从以下文本中提取或生成约定信息，并识别大约定与子约定的层级关系。

文本内容：
${text}

请分析文本并提取以下信息：
1. **智能生成与拆解**：
   - 如果文本是详细的，提取主要约定（大约定）和子约定（小约定）的关系。
   - 如果文本是简短指令（如"安排下周的入职培训"、"制定旅游计划"），请**自动生成**详细的子约定步骤（如"准备电脑"、"办理手续"等）和描述。
2. 为每个约定提取或生成：标题、描述（包含生成的会议纪要模板或任务详情）、提醒时间、优先级、类别。
3. 子约定的提醒时间应该早于或等于父约定的提醒时间。
4. 如果文本中没有明确的层级关系，但约定可以拆解，请智能拆解。
5. 为子约定添加序号标识（如：步骤1、步骤2等）。
6. 提取参与者/负责人：从文本中识别提到的人名（如"和张三"、"交给李四"），返回名字列表。
7. **语言优化**：确保生成的标题和描述语言通顺、专业，无语法错误。

提醒时间规则：
- 如果提到具体时间，转换为ISO格式
- 相对时间（如"明天"、"下周"）计算具体日期
- 没有明确时间时，使用当前时间的第二天上午9点
- 子约定时间应该合理分布在父约定之前

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

当前时间：${new Date().toISOString()}
重点：所有返回的文本内容（标题、描述等）必须使用中文。`,
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
                  participants: {
                    type: "array",
                    items: { type: "string" },
                    description: "提到的参与者姓名"
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
                        order: { type: "number", description: "子约定的顺序序号" }
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
        // Map participants to users
        const tasksWithAssignments = response.tasks.map(task => {
          let assignedIds = [];
          if (task.participants && task.participants.length > 0) {
             assignedIds = task.participants.map(name => {
               // Simple fuzzy match: check if user full_name or email contains the name
               const match = users.find(u => 
                 (u.full_name && typeof u.full_name === 'string' && u.full_name.toLowerCase().includes(name.toLowerCase())) ||
                 (u.email && typeof u.email === 'string' && u.email.toLowerCase().includes(name.toLowerCase()))
               );
               return match ? match.id : null;
             }).filter(Boolean);
          }
          return { ...task, assigned_to: assignedIds };
        });

        setParsedTasks(tasksWithAssignments);
        const totalSubtasks = tasksWithAssignments.reduce((sum, task) => 
          sum + (task.subtasks?.length || 0), 0
        );
        toast.success(`成功解析出 ${response.tasks.length} 个主约定${totalSubtasks > 0 ? `和 ${totalSubtasks} 个子约定` : ''}！`);
      } else {
        toast.error("未能从文本中提取到约定信息");
      }
    } catch (error) {
      toast.error("解析失败，请重试");
      console.error("Parse error:", error);
    }
    setParsing(false);
  };

  const handleBatchRefine = async () => {
    if (!batchRefineInstruction.trim() || parsedTasks.length === 0) return;

    setIsBatchRefining(true);
    try {
        const response = await base44.integrations.Core.InvokeLLM({
            prompt: `你是一个约定整理专家。用户希望批量调整已解析的任务列表。

当前任务列表 (JSON):
${JSON.stringify(parsedTasks.map(t => ({ title: t.title, description: t.description, reminder_time: t.reminder_time, priority: t.priority, category: t.category, subtasks: t.subtasks })))}

用户的批量调整指令: "${batchRefineInstruction}"

请根据指令更新列表。
规则：
1. 可以批量修改时间（如"所有任务推迟一小时"）、优先级、分类等。
2. 可以增加或删除任务。
3. 保持 JSON 结构一致。
4. 返回更新后的 tasks 数组。
5. 确保所有文本内容使用中文。`,
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
                                priority: { type: "string" },
                                category: { type: "string" },
                                subtasks: { 
                                    type: "array", 
                                    items: { 
                                        type: "object",
                                        properties: {
                                            title: { type: "string" },
                                            description: { type: "string" },
                                            reminder_time: { type: "string" },
                                            priority: { type: "string" },
                                            order: { type: "number" }
                                        }
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

        if (response?.tasks) {
            // 保留原有的 assigned_to 等字段（LLM可能丢失）
            // 这里简单处理，假设主要修改内容属性
            const updatedTasks = response.tasks.map((newTask, i) => {
                const original = parsedTasks[i] || {};
                return {
                    ...newTask,
                    assigned_to: original.assigned_to || [], // 尝试保留，如果不匹配则为空
                };
            });
            setParsedTasks(updatedTasks);
            setBatchRefineInstruction("");
            toast.success("列表已批量更新");
        }
    } catch (error) {
        console.error("Batch refine error:", error);
        toast.error("批量调整失败");
    }
    setIsBatchRefining(false);
  };

  const handleCreateAll = async () => {
    if (parsedTasks.length === 0) return;
    
    // 直接传递完整的解析结果，包含主约定和子约定的层级结构
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
      toast.error("请先输入子约定内容");
      return;
    }

    setRefiningState({ taskIndex, subIndex: subtaskIndex });
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `请分析并完善以下子约定。
        
当前子约定内容：${subtask.title}
${subtask.description ? `当前描述：${subtask.description}` : ""}
所属主约定：${task.title} (时间: ${task.reminder_time})

请执行以下操作：
1. 【语义识别】：如果标题包含时间（如"明天"）或优先级（如"紧急"），请提取并清洗标题。
2. 【内容完善】：优化标题使其更清晰；如果描述为空，生成简短实用的执行步骤；如果已有描述，进行润色。
3. 【属性推断】：基于主约定时间和子约定内容，推断合理的提醒时间（应早于主约定）和优先级。

当前时间：${new Date().toISOString()}
重点：所有返回的文本内容（标题、描述等）必须使用中文。`,
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
        toast.success("子约定已智能完善 ✨");
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
    <Card className={`border border-[#e5e9ef] shadow-md hover:shadow-lg transition-all bg-white rounded-[16px] ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <Wand2 className="w-5 h-5 text-[#384877]" />
          <span className="text-[#222222]">智能文本解析</span>
        </CardTitle>
        <p className="text-[15px] text-[#52525b] mt-1.5">
          粘贴任何文本，AI 自动提取并智能拆解约定
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
              <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-[#d5495f]" />
                      <span className="font-semibold text-slate-800">
                        解析结果 ({parsedTasks.length} 个主约定)
                      </span>
                    </div>
                    <Button
                      onClick={handleCreateAll}
                      className="bg-[#d5495f] hover:bg-[#c03d50] shadow-md hover:shadow-lg transition-all rounded-[12px]"
                      >
                      创建全部约定
                      </Button>
                  </div>
                  
                  {/* 批量微调栏 */}
                  <div className="flex gap-2 items-center bg-purple-50 p-2 rounded-xl border border-purple-100">
                      <Sparkles className="w-4 h-4 text-purple-500 ml-2" />
                      <Input 
                          value={batchRefineInstruction}
                          onChange={(e) => setBatchRefineInstruction(e.target.value)}
                          placeholder="批量调整：例如 '所有任务时间推迟2小时' 或 '把工作类别的优先级都设为高'..."
                          className="border-0 bg-transparent shadow-none focus-visible:ring-0 placeholder:text-purple-300 text-purple-800 h-8 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleBatchRefine()}
                      />
                      <Button 
                          size="sm" 
                          onClick={handleBatchRefine}
                          disabled={isBatchRefining || !batchRefineInstruction.trim()}
                          className="h-8 bg-white text-purple-600 hover:bg-purple-100 border border-purple-200 shadow-sm"
                      >
                          {isBatchRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : "AI 调整"}
                      </Button>
                  </div>
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
                    {/* 主约定 */}
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
                              placeholder="约定标题"
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

                        <Popover 
                          open={openDatePopover?.taskIndex === index && openDatePopover?.subIndex === undefined}
                          onOpenChange={(open) => setOpenDatePopover(open ? { taskIndex: index } : null)}
                        >
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
                              onSelect={(date) => handleDateSelect(date, task.reminder_time, (val) => handleEditTask(index, 'reminder_time', val))}
                              locale={zhCN}
                              initialFocus
                            />
                            <div className="p-3 border-t border-slate-100">
                              <Input
                                type="time"
                                value={task.reminder_time ? format(new Date(task.reminder_time), "HH:mm") : "09:00"}
                                onChange={(e) => {
                                  const timeValue = e.target.value;
                                    if (!timeValue || typeof timeValue !== 'string' || !timeValue.includes(':')) return;
                                    const parts = timeValue.split(':');
                                    if (!parts || parts.length < 2) return;
                                    const [hours, minutes] = parts;
                                    const date = task.reminder_time ? new Date(task.reminder_time) : new Date();
                                    date.setHours(parseInt(hours) || 0, parseInt(minutes) || 0);
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
                          查看并添加子约定
                        </Button>
                      </div>
                      {task.assigned_to && task.assigned_to.length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                           <span className="text-xs text-slate-500">分配给:</span>
                           <div className="flex -space-x-2">
                             {task.assigned_to.map(userId => {
                               const user = users.find(u => u.id === userId);
                               return user ? (
                                 <div key={userId} className="w-6 h-6 rounded-full bg-blue-100 border border-white flex items-center justify-center text-[10px] text-blue-700" title={user.full_name || user.email || "用户"}>
                                     {((user.full_name && typeof user.full_name === 'string' ? user.full_name : '') || (user.email && typeof user.email === 'string' ? user.email : '') || "?")[0].toUpperCase()}
                                 </div>
                               ) : null;
                             })}
                           </div>
                        </div>
                      )}
                    </div>

                    {/* 子约定列表 */}
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
                                    placeholder="子约定标题"
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

                                    <Popover
                                      open={openDatePopover?.taskIndex === index && openDatePopover?.subIndex === subIndex}
                                      onOpenChange={(open) => setOpenDatePopover(open ? { taskIndex: index, subIndex } : null)}
                                    >
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
                                          onSelect={(date) => handleDateSelect(date, subtask.reminder_time, (val) => handleEditSubtask(index, subIndex, 'reminder_time', val))}
                                          locale={zhCN}
                                          initialFocus
                                        />
                                        <div className="p-3 border-t border-slate-100">
                                          <Input
                                            type="time"
                                            value={subtask.reminder_time ? format(new Date(subtask.reminder_time), "HH:mm") : "09:00"}
                                            onChange={(e) => {
                                              const timeValue = e.target.value;
                                              if (!timeValue || typeof timeValue !== 'string' || !timeValue.includes(':')) return;
                                              const parts = timeValue.split(':');
                                              if (!parts || parts.length < 2) return;
                                              const [hours, minutes] = parts;
                                              const date = subtask.reminder_time ? new Date(subtask.reminder_time) : new Date();
                                              date.setHours(parseInt(hours) || 0, parseInt(minutes) || 0);
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
            💡 <strong className="text-[#222222]">提示：</strong>AI 自动识别约定层级关系。例如"准备晚餐"会被拆解为"购买食材"、"做菜"等子约定。支持自然语言，如"明天下午3点"、"本周五前"等。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}