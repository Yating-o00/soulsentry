import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Wand2, Copy, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function SmartTextParser({ onTasksGenerated }) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedTasks, setParsedTasks] = useState([]);

  const handleParse = async () => {
    if (!text.trim()) {
      toast.error("请输入要解析的文本");
      return;
    }

    setParsing(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个任务提取专家。请从以下文本中提取所有任务信息，并转换为结构化的任务列表。

文本内容：
${text}

请分析文本并提取以下信息：
1. 任务标题（简洁明确）
2. 任务描述（详细信息）
3. 提醒时间（如果提到具体时间，转换为ISO格式；如果是相对时间如"明天"、"下周"等，计算具体日期）
4. 优先级（low/medium/high/urgent，根据紧急程度判断）
5. 类别（work/personal/health/study/family/shopping/finance/other，根据内容判断）

注意事项：
- 如果文本中没有明确的时间，使用当前时间的第二天上午9点
- 每个独立的任务都应该提取出来
- 如果是一段话描述多个任务，请拆分成多个任务
- 提醒时间必须是未来的时间
- 返回的任务列表应该是有序的，按紧急程度排序

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
                  }
                },
                required: ["title", "reminder_time"]
              }
            },
            summary: { type: "string" }
          },
          required: ["tasks"]
        }
      });

      if (response.tasks && response.tasks.length > 0) {
        setParsedTasks(response.tasks);
        toast.success(`成功解析出 ${response.tasks.length} 个任务！`);
      } else {
        toast.error("未能从文本中提取到任务信息");
      }
    } catch (error) {
      toast.error("解析失败，请重试");
      console.error("Parse error:", error);
    }
    setParsing(false);
  };

  const handleCreateAll = () => {
    if (parsedTasks.length === 0) return;
    onTasksGenerated(parsedTasks);
    setParsedTasks([]);
    setText("");
  };

  const handleRemoveTask = (index) => {
    setParsedTasks(tasks => tasks.filter((_, i) => i !== index));
  };

  const handleEditTask = (index, field, value) => {
    setParsedTasks(tasks => 
      tasks.map((task, i) => 
        i === index ? { ...task, [field]: value } : task
      )
    );
  };

  const PRIORITY_LABELS = {
    low: { label: "低", color: "bg-slate-100 text-slate-700" },
    medium: { label: "中", color: "bg-blue-100 text-blue-700" },
    high: { label: "高", color: "bg-orange-100 text-orange-700" },
    urgent: { label: "紧急", color: "bg-red-100 text-red-700" },
  };

  const CATEGORY_LABELS = {
    work: { label: "工作", color: "bg-blue-100 text-blue-700" },
    personal: { label: "个人", color: "bg-purple-100 text-purple-700" },
    health: { label: "健康", color: "bg-green-100 text-green-700" },
    study: { label: "学习", color: "bg-yellow-100 text-yellow-700" },
    family: { label: "家庭", color: "bg-pink-100 text-pink-700" },
    shopping: { label: "购物", color: "bg-orange-100 text-orange-700" },
    finance: { label: "财务", color: "bg-red-100 text-red-700" },
    other: { label: "其他", color: "bg-gray-100 text-gray-700" },
  };

  return (
    <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 to-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wand2 className="w-5 h-5 text-purple-600" />
          智能文本解析
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          粘贴任何文本，AI 将自动为您提取任务信息
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder="粘贴文本，例如：&#10;明天下午3点开会讨论项目进展&#10;周五前完成报告&#10;提醒我周末去超市买菜..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[120px] border-0 bg-white/80 focus-visible:ring-2 focus-visible:ring-purple-500 rounded-xl"
          />
          
          <div className="flex gap-2">
            <Button
              onClick={handleParse}
              disabled={parsing || !text.trim()}
              className="flex-1 bg-gradient-to-r from-purple-500 to-blue-600 hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 rounded-xl"
            >
              {parsing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  AI 解析中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  开始解析
                </>
              )}
            </Button>
            
            {text.trim() && (
              <Button
                variant="outline"
                onClick={() => setText("")}
                className="rounded-xl"
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
                    解析结果 ({parsedTasks.length} 个任务)
                  </span>
                </div>
                <Button
                  onClick={handleCreateAll}
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-lg rounded-xl"
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
                    className="bg-white rounded-xl p-4 border-2 border-purple-200 hover:border-purple-400 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => handleEditTask(index, 'title', e.target.value)}
                          className="font-semibold text-slate-800 w-full bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveTask(index)}
                        className="h-8 w-8 hover:bg-red-100 hover:text-red-600 rounded-lg"
                      >
                        <Copy className="w-4 h-4 rotate-45" />
                      </Button>
                    </div>

                    {task.description && (
                      <textarea
                        value={task.description}
                        onChange={(e) => handleEditTask(index, 'description', e.target.value)}
                        className="text-sm text-slate-600 w-full bg-slate-50 rounded-lg p-2 border-0 focus:ring-2 focus:ring-purple-300 mb-2 resize-none"
                        rows={2}
                      />
                    )}

                    <div className="flex flex-wrap gap-2">
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
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            💡 <strong>提示：</strong>AI 会自动识别文本中的任务、时间、优先级和类别。支持自然语言描述，如"明天下午3点"、"本周五前"等。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}