import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, AlertTriangle, Sparkles, Send, RefreshCw, MessageSquarePlus, Mail, X, ArrowRight, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AUTOMATION_TYPES } from "./automationConfig";
import AutomationResultPreview from "./AutomationResultPreview";

export default function AutomationDetailDialog({ execution, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [executing, setExecuting] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustText, setAdjustText] = useState("");
  const [sending, setSending] = useState(false);

  if (!execution) return null;

  const cfg = AUTOMATION_TYPES[execution.automation_type] || AUTOMATION_TYPES.none;
  const Icon = cfg.icon;
  const plan = execution.automation_plan;
  const result = execution.automation_result;
  const status = execution.execution_status;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['task-executions'] });

  const handleApprove = async () => {
    setExecuting(true);
    try {
      const res = await base44.functions.invoke('executeAutomation', {
        execution_id: execution.id,
        phase: "execute"
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("AI 已完成执行");
      refresh();
    } catch (e) {
      toast.error("执行失败：" + e.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjustText.trim()) return;
    setAdjusting(true);
    try {
      const newInput = `${execution.original_input || execution.task_title}\n\n[用户调整]：${adjustText}`;
      await base44.entities.TaskExecution.update(execution.id, {
        original_input: newInput,
        execution_status: "parsing",
        automation_plan: null,
        automation_result: null,
        error_message: null,
      });
      const res = await base44.functions.invoke('executeAutomation', {
        execution_id: execution.id,
        phase: "plan"
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("AI 已根据反馈重新规划");
      setAdjustText("");
      refresh();
    } catch (e) {
      toast.error("重新规划失败：" + e.message);
    } finally {
      setAdjusting(false);
    }
  };

  const handleCancel = async () => {
    await base44.entities.TaskExecution.update(execution.id, {
      execution_status: "cancelled"
    });
    toast("已取消", { icon: "✋" });
    refresh();
    onOpenChange(false);
  };

  const handleSendEmail = async () => {
    if (execution.automation_type !== "email_draft") return;
    const emailData = result?.data;
    if (!emailData?.to || !emailData?.subject || !emailData?.body) {
      toast.error("邮件信息不完整，请补充收件人");
      return;
    }
    setSending(true);
    try {
      const res = await base44.functions.invoke('sendGmailEmail', {
        to: emailData.to,
        subject: emailData.subject,
        body: emailData.body,
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("邮件已发送");
      await base44.entities.TaskExecution.update(execution.id, {
        automation_result: {
          ...result,
          data: { ...emailData, sent_at: new Date().toISOString() }
        }
      });
      refresh();
    } catch (e) {
      toast.error("发送失败：" + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleRate = async (rating) => {
    await base44.entities.TaskExecution.update(execution.id, {
      user_feedback: {
        rating,
        comment: execution.user_feedback?.comment || "",
        rated_at: new Date().toISOString()
      }
    });
    toast.success("感谢反馈");
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.iconBg}`}>
              <Icon className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate">{execution.task_title}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>{cfg.emoji} {cfg.label}</Badge>
                {status === "waiting_confirm" && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">待你确认</Badge>}
                {status === "executing" && <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-600 border-indigo-200">执行中</Badge>}
                {status === "completed" && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200">已完成</Badge>}
                {status === "parsing" && <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-600 border-indigo-200">规划中</Badge>}
                {status === "failed" && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">失败</Badge>}
              </div>
            </div>
          </DialogTitle>
          {execution.original_input && (
            <DialogDescription className="text-xs text-slate-500 pl-11 mt-1">
              "{execution.original_input.length > 100 ? execution.original_input.slice(0, 100) + '...' : execution.original_input}"
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* 规划中状态 */}
          {status === "parsing" && (
            <div className="py-8 text-center">
              <Loader2 className="w-8 h-8 mx-auto text-indigo-500 animate-spin mb-3" />
              <p className="text-sm text-slate-600">AI 正在分析并规划...</p>
            </div>
          )}

          {/* 执行方案 */}
          {plan && (
            <div className="rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50/40 to-white p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-indigo-700">AI 执行方案</span>
                {plan.estimated_duration && (
                  <Badge variant="outline" className="text-[10px] gap-1 text-slate-500 border-slate-200 ml-auto">
                    <Clock className="w-2.5 h-2.5" />{plan.estimated_duration}
                  </Badge>
                )}
              </div>
              <div className="text-sm font-medium text-slate-800 mb-1">{plan.title}</div>
              <div className="text-xs text-slate-600 mb-2.5 leading-relaxed">{plan.description}</div>
              {plan.steps && plan.steps.length > 0 && (
                <div className="space-y-1.5">
                  {plan.steps.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-slate-700 font-medium">{s.name}</div>
                        {s.detail && <div className="text-slate-500 text-[11px] mt-0.5">{s.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {plan.risk_warning && (
                <div className="mt-2.5 flex items-start gap-1.5 p-2 rounded-md bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-[11px] text-amber-700">{plan.risk_warning}</span>
                </div>
              )}
            </div>
          )}

          {/* 执行结果 */}
          {result && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">执行结果</span>
              </div>
              <AutomationResultPreview result={result} />

              {/* 邮件草稿：提供发送按钮 */}
              {execution.automation_type === "email_draft" && result.data && !result.data.sent_at && (
                <Button
                  className="w-full mt-3 bg-orange-500 hover:bg-orange-600"
                  onClick={handleSendEmail}
                  disabled={sending || !result.data.to}
                >
                  {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                  {result.data.to ? `发送给 ${result.data.to}` : "请先在通知页补充收件人"}
                </Button>
              )}
              {execution.automation_type === "email_draft" && result.data?.sent_at && (
                <div className="mt-3 flex items-center gap-2 p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                  <Mail className="w-3.5 h-3.5" />邮件已于 {new Date(result.data.sent_at).toLocaleString('zh-CN')} 发送
                </div>
              )}
            </div>
          )}

          {/* 错误信息 */}
          {status === "failed" && execution.error_message && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              <div className="font-medium mb-1">执行失败</div>
              <div>{execution.error_message}</div>
            </div>
          )}

          {/* 待审批：确认 / 调整 / 取消 */}
          {status === "waiting_confirm" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleCancel}>
                  <X className="w-4 h-4 mr-1.5" />取消
                </Button>
                <Button className="flex-1 bg-gradient-to-r from-[#384877] to-[#3b5aa2]" onClick={handleApprove} disabled={executing}>
                  {executing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1.5" />}
                  确认并执行
                </Button>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <MessageSquarePlus className="w-3 h-3" />方案不太对？告诉 AI 怎么调整
                </summary>
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={adjustText}
                    onChange={(e) => setAdjustText(e.target.value)}
                    placeholder="例如：语气再正式一点 / 范围缩小到本周 / 加上数据图表..."
                    className="text-xs min-h-[60px]"
                  />
                  <Button size="sm" variant="outline" className="w-full" onClick={handleAdjust} disabled={adjusting || !adjustText.trim()}>
                    {adjusting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    让 AI 重新规划
                  </Button>
                </div>
              </details>
            </div>
          )}

          {/* 已完成：调整反馈 */}
          {status === "completed" && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <MessageSquarePlus className="w-3 h-3" />不满意？继续沟通调整
                </summary>
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={adjustText}
                    onChange={(e) => setAdjustText(e.target.value)}
                    placeholder="告诉 AI 哪里需要改进..."
                    className="text-xs min-h-[60px]"
                  />
                  <Button size="sm" variant="outline" className="w-full" onClick={handleAdjust} disabled={adjusting || !adjustText.trim()}>
                    {adjusting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    让 AI 重做一次
                  </Button>
                </div>
              </details>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}