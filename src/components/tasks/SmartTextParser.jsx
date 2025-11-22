import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Wand2, X, CheckCircle2, ChevronRight, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function SmartTextParser({ onTasksGenerated }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedTasks, setParsedTasks] = useState([]);
  const [expandedTasks, setExpandedTasks] = useState(new Set());

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

  const PRIORITY_LABELS = {
    low: { label: "低", color: "bg-[#f4f6f8] text-[#52525b]" },
    medium: { label: "中", color: "bg-[#e5e9ef] text-[#5a647d]" },
    high: { label: "高", color: "bg-[#fed7aa] text-[#ea580c]" },
    urgent: { label: "紧急", color: "bg-[#fecaca] text-[#dc2626]" },
  };

  const CATEGORY_LABELS = {
    work: { label: "工作", color: "bg-[#e5e9ef] text-[#5a647d]" },
    personal: { label: "个人", color: "bg-[#e0f2fe] text-[#0891b2]" },
    health: { label: "健康", color: "bg-[#d1fae5] text-[#059669]" },
    study: { label: "学习", color: "bg-[#fef3c7] text-[#d97706]" },
    family: { label: "家庭", color: "bg-[#fce7f3] text-[#db2777]" },
    shopping: { label: "购物", color: "bg-[#fed7aa] text-[#ea580c]" },
    finance: { label: "财务", color: "bg-[#fecaca] text-[#dc2626]" },
    other: { label: "其他", color: "bg-[#f4f6f8] text-[#52525b]" },
  };

  return (
    <Card className="border border-[#e5e9ef] shadow-md hover:shadow-lg transition-all bg-white rounded-[16px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <Wand2 className="w-5 h-5 text-[#5a647d]" />
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
            className="min-h-[120px] border border-[#e5e9ef] bg-[#f9fafb] focus-visible:ring-2 focus-visible:ring-[#5a647d]/20 focus-visible:border-[#5a647d] rounded-[12px] text-[15px]"
          />
          
          <div className="flex gap-2">
            <Button
              onClick={handleParse}
              disabled={parsing || !text.trim()}
              className="flex-1 bg-gradient-to-r from-[#5a647d] to-[#1e3a5f] hover:from-[#4a5670] hover:to-[#152e50] shadow-md hover:shadow-lg transition-all duration-200 rounded-[12px]"
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
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-slate-800">
                    解析结果 ({parsedTasks.length} 个主任务)
                  </span>
                </div>
                <Button
                  onClick={handleCreateAll}
                  className="bg-[#10b981] hover:bg-[#059669] shadow-md hover:shadow-lg transition-all rounded-[12px]"
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
                    <div className="p-4 hover:bg-[#f9fafb] transition-all">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-start gap-2 flex-1">
                          {task.subtasks && task.subtasks.length > 0 && (
                            <button
                              onClick={() => toggleExpanded(index)}
                              className="mt-1 hover:bg-[#e5e9ef] rounded-lg p-0.5 transition-colors"
                            >
                              {expandedTasks.has(index) ? (
                                <ChevronDown className="w-4 h-4 text-[#5a647d]" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-[#5a647d]" />
                              )}
                            </button>
                          )}
                          <div className="flex-1">
                            <input
                              type="text"
                              value={task.title}
                              onChange={(e) => handleEditTask(index, 'title', e.target.value)}
                              className="font-semibold text-[#222222] w-full bg-transparent border-none focus:outline-none focus:ring-0 p-0 text-[17px] tracking-tight"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveTask(index)}
                          className="h-8 w-8 hover:bg-red-100 hover:text-red-600 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>

                      {task.description && (
                        <textarea
                          value={task.description}
                          onChange={(e) => handleEditTask(index, 'description', e.target.value)}
                          className="text-[15px] text-[#222222] w-full bg-[#f9fafb] rounded-[10px] p-2 border border-[#e5e9ef] focus:ring-2 focus:ring-[#5a647d]/20 focus:border-[#5a647d] mb-2 resize-none ml-6"
                          rows={2}
                        />
                      )}

                      <div className="flex flex-wrap gap-2 ml-6">
                        <Badge className={PRIORITY_LABELS[task.priority]?.color}>
                          {PRIORITY_LABELS[task.priority]?.label || task.priority}
                        </Badge>
                        <Badge className={CATEGORY_LABELS[task.category]?.color}>
                          {CATEGORY_LABELS[task.category]?.label || task.category}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {new Date(task.reminder_time).toLocaleString('zh-CN', {
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Badge>
                        {task.subtasks && task.subtasks.length > 0 && (
                          <Badge className="bg-[#5a647d] text-white rounded-[6px]">
                            📋 {task.subtasks.length} 个子任务
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* 子任务列表 */}
                    {task.subtasks && task.subtasks.length > 0 && expandedTasks.has(index) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-[#f9fafb] border-t border-[#e5e9ef]"
                      >
                        {task.subtasks.map((subtask, subIndex) => (
                          <div
                            key={subIndex}
                            className="p-3 ml-8 border-l-2 border-[#dce4ed] hover:bg-white transition-all flex items-start gap-3"
                          >
                            {/* 子任务序号标识 */}
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#5a647d] text-white flex items-center justify-center text-xs font-bold mt-0.5">
                              {subtask.order || subIndex + 1}
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <input
                                  type="text"
                                  value={subtask.title}
                                  onChange={(e) => handleEditSubtask(index, subIndex, 'title', e.target.value)}
                                  className="flex-1 font-medium text-[#222222] bg-transparent border-none focus:outline-none focus:ring-0 p-0 text-[15px]"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveSubtask(index, subIndex)}
                                  className="h-6 w-6 hover:bg-red-100 hover:text-red-600 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>

                              {subtask.description && (
                                <textarea
                                  value={subtask.description}
                                  onChange={(e) => handleEditSubtask(index, subIndex, 'description', e.target.value)}
                                  className="text-[13px] text-[#52525b] w-full bg-white rounded-[8px] p-2 border border-[#e5e9ef] focus:ring-2 focus:ring-[#5a647d]/20 focus:border-[#5a647d] mb-2 resize-none"
                                  rows={1}
                                />
                              )}

                              <div className="flex flex-wrap gap-1.5">
                                <Badge className={`${PRIORITY_LABELS[subtask.priority]?.color} text-xs`}>
                                  {PRIORITY_LABELS[subtask.priority]?.label || subtask.priority}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  ⏰ {new Date(subtask.reminder_time).toLocaleString('zh-CN', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </Badge>
                                <Badge variant="outline" className="text-xs bg-slate-50">
                                  📌 待完成
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
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