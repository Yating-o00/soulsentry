import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, Loader2, Calendar, Clock, SplitSquareHorizontal, StickyNote, Mail, Bell, ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const ACTION_CONFIG = {
  postpone: { icon: Clock, label: "推迟任务", color: "text-amber-600 bg-amber-50 border-amber-200" },
  split: { icon: SplitSquareHorizontal, label: "拆分任务", color: "text-blue-600 bg-blue-50 border-blue-200" },
  merge: { icon: SplitSquareHorizontal, label: "合并任务", color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  link_note: { icon: StickyNote, label: "关联心签", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  set_reminder: { icon: Bell, label: "设置提醒", color: "text-purple-600 bg-purple-50 border-purple-200" },
  sync_calendar: { icon: Calendar, label: "同步日历", color: "text-blue-600 bg-blue-50 border-blue-200" },
  send_email: { icon: Mail, label: "发送邮件", color: "text-red-600 bg-red-50 border-red-200" },
  update_priority: { icon: AlertTriangle, label: "调整优先级", color: "text-orange-600 bg-orange-50 border-orange-200" },
  complete: { icon: Check, label: "标记完成", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
};

export default function AIExecutionAdvisor({ open, onOpenChange, execution, relatedTasks, relatedNotes }) {
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState(null);
  const [executingAction, setExecutingAction] = useState(null);
  const [completedActions, setCompletedActions] = useState({});
  const queryClient = useQueryClient();

  const fetchAdvice = async () => {
    if (!execution) return;
    setLoading(true);
    setAdvice(null);

    const taskContext = relatedTasks?.slice(0, 5).map(t => 
      `- ${t.title} [${t.status}] ${t.priority} ${t.reminder_time ? new Date(t.reminder_time).toLocaleString('zh-CN') : ''}`
    ).join('\n') || '无相关任务';

    const noteContext = relatedNotes?.slice(0, 3).map(n => 
      `- ${n.plain_text?.slice(0, 80) || n.content?.slice(0, 80) || '无内容'} [标签: ${(n.tags || []).join(',')}]`
    ).join('\n') || '无相关心签';

    const prompt = `你是一个智能任务执行顾问。分析以下任务执行记录，给出具体可操作的执行建议。

## 当前执行记录
- 标题: ${execution.task_title}
- 原始输入: ${execution.original_input || '无'}
- 状态: ${execution.execution_status}
- 类型: ${execution.category}
- 创建时间: ${new Date(execution.created_date).toLocaleString('zh-CN')}
${execution.error_message ? `- 错误信息: ${execution.error_message}` : ''}
${execution.ai_parsed_result?.summary ? `- AI摘要: ${execution.ai_parsed_result.summary}` : ''}

## 相关任务上下文
${taskContext}

## 相关心签
${noteContext}

## 当前时间
${new Date().toLocaleString('zh-CN')}

请输出JSON格式：
{
  "analysis": "对当前任务状态的简洁分析（1-2句话）",
  "suggestions": [
    {
      "action": "动作类型(postpone/split/merge/link_note/set_reminder/sync_calendar/send_email/update_priority/complete)",
      "title": "建议标题",
      "description": "具体描述和理由",
      "params": {},
      "confidence": 0.9,
      "requires_confirm": false
    }
  ]
}

要求：
1. 最多给出3个最有价值的建议
2. 每个建议必须可以直接执行
3. params中给出执行所需的具体参数
4. 如果是会议类任务，考虑日历同步、提醒设置、邮件通知等
5. 如果任务已延迟或失败，给出恢复方案
6. confidence低于0.7的标记requires_confirm=true`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          analysis: { type: "string" },
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                params: { type: "object" },
                confidence: { type: "number" },
                requires_confirm: { type: "boolean" }
              }
            }
          }
        }
      }
    });

    setAdvice(result);
    setLoading(false);
  };

  useEffect(() => {
    if (open && execution) {
      fetchAdvice();
    } else {
      setAdvice(null);
      setCompletedActions({});
    }
  }, [open, execution?.id]);

  const executeAction = async (suggestion, index) => {
    setExecutingAction(`${suggestion.action}-${index}`);

    // 不需要 task 的动作：link_note 可直接创建心签
    const NO_TASK_REQUIRED = ["link_note"];

    try {
      // 若无关联 task，但动作需要 task，则自动创建一个任务作为载体
      let taskId = execution?.task_id;
      if (!taskId && !NO_TASK_REQUIRED.includes(suggestion.action)) {
        const newTask = await base44.entities.Task.create({
          title: execution?.task_title || suggestion.title || "AI 采纳任务",
          description: execution?.original_input || suggestion.description || "",
          status: "pending",
          priority: suggestion.params?.priority || "medium",
          category: suggestion.params?.category || "work",
        });
        taskId = newTask.id;
        // 回写到执行记录，避免后续重复创建
        if (execution?.id) {
          await base44.entities.TaskExecution.update(execution.id, { task_id: taskId });
        }
        toast.success(`已为"${newTask.title}"创建任务`);
      }

      switch (suggestion.action) {
        case "postpone": {
          const newTime = suggestion.params?.new_time || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          await base44.entities.Task.update(taskId, { 
            reminder_time: newTime,
            status: "snoozed",
            snooze_until: newTime,
            snooze_count: (suggestion.params?.current_snooze || 0) + 1
          });
          toast.success(`已推迟至 ${new Date(newTime).toLocaleString('zh-CN')}`);
          break;
        }
        case "split": {
          const subtasks = suggestion.params?.subtasks || [];
          for (const st of subtasks) {
            await base44.entities.Task.create({
              title: st.title || st,
              parent_task_id: taskId,
              status: "pending",
              priority: suggestion.params?.priority || "medium",
              category: suggestion.params?.category || "work",
            });
          }
          toast.success(`已拆分为 ${subtasks.length} 个子任务`);
          break;
        }
        case "link_note": {
          const noteContent = suggestion.params?.note_content || suggestion.description;
          await base44.entities.Note.create({
            content: noteContent,
            plain_text: noteContent,
            tags: [execution.task_title?.slice(0, 20), "AI关联"],
          });
          toast.success("已创建关联心签");
          break;
        }
        case "set_reminder": {
          const reminderTime = suggestion.params?.reminder_time || new Date(Date.now() + 30 * 60 * 1000).toISOString();
          await base44.entities.Task.update(taskId, {
            reminder_time: reminderTime,
            advance_reminders: suggestion.params?.advance_minutes || [15, 5],
            notification_channels: ["in_app", "browser"],
          });
          toast.success("提醒已设置");
          break;
        }
        case "sync_calendar": {
          await base44.functions.invoke('syncTaskToGoogleCalendar', { task_id: taskId });
          toast.success("已同步到Google日历");
          break;
        }
        case "send_email": {
          const user = await base44.auth.me();
          await base44.integrations.Core.SendEmail({
            to: suggestion.params?.to || user.email,
            subject: suggestion.params?.subject || `任务提醒: ${execution.task_title}`,
            body: suggestion.params?.body || `任务「${execution.task_title}」需要您的关注。\n\n${suggestion.description}`,
          });
          toast.success("邮件已发送");
          break;
        }
        case "update_priority": {
          await base44.entities.Task.update(taskId, {
            priority: suggestion.params?.priority || "high",
          });
          toast.success(`优先级已调整为 ${suggestion.params?.priority || "高"}`);
          break;
        }
        case "complete": {
          await base44.entities.Task.update(taskId, {
            status: "completed",
            completed_at: new Date().toISOString(),
          });
          toast.success("任务已标记完成");
          break;
        }
        default:
          toast.info("此建议需要手动执行");
      }

      // 尝试将 AI 建议匹配到已有执行链路步骤——命中则标记完成，否则才追加新步骤
      const ACTION_STEP_KEYWORDS = {
        sync_calendar: ["同步日历", "日历同步", "日历", "calendar"],
        set_reminder: ["提醒", "推送提醒", "设置提醒", "多级提醒"],
        send_email: ["发送通知", "邮件", "通知", "发邮件"],
        link_note: ["准备资料", "记录", "笔记", "心签"],
        complete: ["记录执行", "完成", "标记完成"],
        update_priority: ["优先级"],
        postpone: ["推迟", "延期"],
        split: ["拆分", "整理清单", "清单"],
      };
      const keywords = ACTION_STEP_KEYWORDS[suggestion.action] || [];
      const prevSteps = execution.execution_steps || [];
      const matchIdx = prevSteps.findIndex(s =>
        s && s.status !== "completed" &&
        keywords.some(k => (s.step_name || "").toLowerCase().includes(k.toLowerCase()))
      );

      let nextSteps;
      if (matchIdx >= 0) {
        // 命中：把已有步骤更新为 completed，不再追加
        nextSteps = prevSteps.map((s, idx) => idx === matchIdx
          ? { ...s, status: "completed", detail: s.detail || `已采纳AI建议：${suggestion.title}`, timestamp: new Date().toISOString() }
          : s
        );
      } else {
        // 未命中：作为新步骤追加
        nextSteps = [
          ...prevSteps,
          {
            step_name: `AI建议: ${suggestion.title}`,
            status: "completed",
            detail: `已采纳并执行: ${suggestion.description?.slice(0, 50)}`,
            timestamp: new Date().toISOString(),
          }
        ];
      }

      const allDone = nextSteps.length > 0 && nextSteps.every(s => s.status === "completed");
      await base44.entities.TaskExecution.update(execution.id, {
        execution_status: suggestion.action === "complete" || allDone ? "completed" : "executing",
        execution_steps: nextSteps,
      });

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });

      setCompletedActions(prev => ({ ...prev, [index]: { success: true, action: suggestion.action, title: suggestion.title } }));
    } catch (err) {
      console.error("Action execution failed:", err);
      toast.error("执行失败: " + (err.message || "未知错误"));
      setCompletedActions(prev => ({ ...prev, [index]: { success: false, action: suggestion.action, title: suggestion.title, error: err.message } }));
    }

    setExecutingAction(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            AI 执行顾问
          </DialogTitle>
        </DialogHeader>

        {execution && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-slate-500">分析任务</span>
              <Badge variant="outline" className="text-[10px]">{execution.category === "promise" ? "约定" : execution.category === "note" ? "心签" : "任务"}</Badge>
            </div>
            <p className="text-sm font-medium text-slate-800">{execution.task_title}</p>
            {execution.original_input && execution.original_input !== execution.task_title && (
              <p className="text-xs text-slate-500 mt-1 italic">"{execution.original_input}"</p>
            )}
          </div>
        )}

        {loading && (
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">AI 正在分析任务状态...</p>
              <p className="text-xs text-slate-400 mt-1">结合上下文生成执行建议</p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {advice && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-indigo-800">{advice.analysis}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">执行建议</p>
                {(advice.suggestions || []).map((s, i) => {
                  const cfg = ACTION_CONFIG[s.action] || ACTION_CONFIG.complete;
                  const Icon = cfg.icon;
                  const isExecuting = executingAction === `${s.action}-${i}`;
                  const completed = completedActions[i];

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`p-4 rounded-xl border transition-all ${completed?.success ? 'bg-emerald-50 border-emerald-200' : completed && !completed.success ? 'bg-red-50 border-red-200' : cfg.color + ' hover:shadow-sm'}`}
                    >
                      {completed ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-3"
                        >
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${completed.success ? 'bg-emerald-100' : 'bg-red-100'}`}>
                            {completed.success ? (
                              <Check className="w-5 h-5 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${completed.success ? 'text-emerald-800' : 'text-red-800'}`}>
                              {completed.success ? '已采纳' : '执行失败'}
                            </p>
                            <p className={`text-xs mt-0.5 ${completed.success ? 'text-emerald-600' : 'text-red-600'}`}>
                              {completed.success ? `「${s.title}」已成功执行` : (completed.error || '请稍后重试')}
                            </p>
                            {completed.success && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <div className="h-1 flex-1 rounded-full bg-emerald-200 overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: '100%' }}
                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                    className="h-full bg-emerald-500 rounded-full"
                                  />
                                </div>
                                <span className="text-[10px] text-emerald-600 font-medium">100%</span>
                              </div>
                            )}
                            {!completed.success && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setCompletedActions(prev => { const n = {...prev}; delete n[i]; return n; });
                                  executeAction(s, i);
                                }}
                                className="h-7 text-xs mt-2 border-red-300 text-red-700 hover:bg-red-100"
                              >
                                重试
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.color.split(' ')[1]}`}>
                            <Icon className={`w-4 h-4 ${cfg.color.split(' ')[0]}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-slate-800">{s.title}</h4>
                              {s.confidence >= 0.8 && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">推荐</Badge>
                              )}
                              {s.requires_confirm && (
                                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">需确认</Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mb-3">{s.description}</p>
                            <Button
                              size="sm"
                              onClick={() => executeAction(s, i)}
                              disabled={isExecuting}
                              className="h-8 text-xs bg-slate-800 hover:bg-slate-700 text-white gap-1.5"
                            >
                              {isExecuting ? (
                                <><Loader2 className="w-3 h-3 animate-spin" /> 执行中...</>
                              ) : (
                                <><ArrowRight className="w-3 h-3" /> 一键采纳</>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {Object.keys(completedActions).length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <span className="text-xs text-slate-600">
                        已采纳 <span className="font-semibold text-slate-800">{Object.values(completedActions).filter(c => c.success).length}</span> / {(advice.suggestions || []).length} 项建议
                      </span>
                    </div>
                    {Object.values(completedActions).filter(c => c.success).length === (advice.suggestions || []).length && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">全部完成</Badge>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}