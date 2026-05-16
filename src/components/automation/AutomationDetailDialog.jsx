import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, AlertTriangle, Sparkles, Send, RefreshCw, MessageSquarePlus, Mail, X, ArrowRight, Clock, Maximize2, Minimize2, Paperclip } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AUTOMATION_TYPES } from "./automationConfig";
import AutomationResultPreview from "./AutomationResultPreview";

export default function AutomationDetailDialog({ execution: executionProp, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [executing, setExecuting] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustText, setAdjustText] = useState("");
  const [adjustAttachments, setAdjustAttachments] = useState([]); // [{file_name,file_url}]
  const [uploadingAdjust, setUploadingAdjust] = useState(false);
  const [sending, setSending] = useState(false);
  // 邮件类：本地维护可编辑的草稿（收件人/抄送/主题/正文 + 附件），编辑后用于发送
  const [emailDraft, setEmailDraft] = useState(null);
  // 弹层尺寸档位：md(默认) / lg / xl
  const [size, setSize] = useState("lg");
  // 同任务下其它已完成自动化产生的可挂载附件候选
  const [availableAttachments, setAvailableAttachments] = useState([]);
  // 本地副本：调整后能立即覆盖父级 prop，让预览同步更新
  const [localExecution, setLocalExecution] = useState(executionProp);
  useEffect(() => { setLocalExecution(executionProp); }, [executionProp]);
  const execution = localExecution || executionProp;

  // 拉取最新 execution 数据并写回本地，确保预览实时刷新
  const reloadExecution = async () => {
    if (!execution?.id) return null;
    try {
      const fresh = await base44.entities.TaskExecution.get(execution.id);
      if (fresh) setLocalExecution(fresh);
      return fresh;
    } catch { return null; }
  };

  // 当 execution 变化时（首次打开 / 重新规划后），同步邮件草稿
  useEffect(() => {
    if (execution?.automation_type === "email_draft") {
      const initial = execution.automation_result?.data || null;
      // 兼容历史草稿：未带 attachments 字段时初始化为空数组
      setEmailDraft(initial ? { attachments: [], ...initial } : null);
    } else {
      setEmailDraft(null);
    }
  }, [execution?.id, execution?.automation_result?.data]);

  // 邮件类：拉取候选附件
  // 优先：同 task_id 下其它执行的产物；回退：当前用户最近 50 条已完成执行中的产物
  useEffect(() => {
    if (execution?.automation_type !== "email_draft") {
      setAvailableAttachments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const collect = (list) => {
        const files = [];
        const seen = new Set();
        (list || []).forEach(ex => {
          if (ex.id === execution.id) return;
          const d = ex.automation_result?.data;
          if (d?.file_url && d?.file_name && !seen.has(d.file_url)) {
            seen.add(d.file_url);
            files.push({
              file_name: d.file_name,
              file_url: d.file_url,
              source: ex.task_title || AUTOMATION_TYPES[ex.automation_type]?.label || "自动化产物"
            });
          }
        });
        return files;
      };
      try {
        // 1) 同任务关联（如果有 task_id）
        let files = [];
        if (execution.task_id) {
          const sib = await base44.entities.TaskExecution.filter({ task_id: execution.task_id });
          if (cancelled) return;
          files = collect(sib);
        }
        // 2) 回退：最近的已完成执行（无论是否同任务）
        if (files.length === 0) {
          const recent = await base44.entities.TaskExecution.filter(
            { execution_status: 'completed' },
            '-completed_at',
            50
          );
          if (cancelled) return;
          files = collect(recent);
        }
        setAvailableAttachments(files);
      } catch (e) {
        console.error("加载候选附件失败", e);
        setAvailableAttachments([]);
      }
    })();
    return () => { cancelled = true; };
  }, [execution?.id, execution?.task_id, execution?.automation_type]);

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
      await reloadExecution();
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
      // 把"上一次的产物"作为上下文带给 AI，让它在已有内容上做增量修改而不是从头重做
      const prevResult = execution.automation_result;
      const prevSnapshot = prevResult
        ? (prevResult.data?.markdown
            || prevResult.data?.body
            || prevResult.data?.content
            || prevResult.preview
            || '')
        : '';
      const prevBlock = prevSnapshot
        ? `\n\n[上次生成的内容 - 请在此基础上做调整，保留未提及的部分]：\n${String(prevSnapshot).slice(0, 6000)}`
        : '';
      const attachBlock = adjustAttachments.length > 0
        ? `\n\n[用户提供的参考附件 - 请阅读并基于这些资料调整内容]：\n${adjustAttachments.map(a => `- ${a.file_name}: ${a.file_url}`).join('\n')}`
        : '';
      const newInput = `${execution.original_input || execution.task_title}${prevBlock}${attachBlock}\n\n[用户本次调整指令]：${adjustText}`;

      // 关键：把附件写入 ai_parsed_result.attached_files，executeAutomation 才会做视觉识别并把图片嵌入到生成结果中
      const prevFiles = Array.isArray(execution.ai_parsed_result?.attached_files)
        ? execution.ai_parsed_result.attached_files
        : [];
      const newFiles = adjustAttachments.map(a => ({
        file_url: a.file_url,
        file_name: a.file_name,
        file_type: a.file_type || '',
      }));
      const seen = new Set();
      const mergedFiles = [...prevFiles, ...newFiles].filter(f => {
        if (!f?.file_url || seen.has(f.file_url)) return false;
        seen.add(f.file_url);
        return true;
      });

      await base44.entities.TaskExecution.update(execution.id, {
        original_input: newInput,
        execution_status: "parsing",
        automation_plan: null,
        automation_result: null,
        error_message: null,
        ai_parsed_result: {
          ...(execution.ai_parsed_result || {}),
          attached_files: mergedFiles,
        },
      });
      const planRes = await base44.functions.invoke('executeAutomation', {
        execution_id: execution.id,
        phase: "plan"
      });
      if (planRes.data?.error) throw new Error(planRes.data.error);

      // 重新规划完成后立即执行，让用户直接看到更新后的产物
      const execRes = await base44.functions.invoke('executeAutomation', {
        execution_id: execution.id,
        phase: "execute"
      });
      if (execRes.data?.error) throw new Error(execRes.data.error);

      await reloadExecution(); // 关键：拉取最新数据，刷新弹窗内预览
      toast.success("AI 已根据反馈在原内容上修改");
      setAdjustText("");
      setAdjustAttachments([]);
      refresh();
    } catch (e) {
      toast.error("重新规划失败：" + e.message);
    } finally {
      setAdjusting(false);
    }
  };

  const handleAdjustUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingAdjust(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const res = await base44.integrations.Core.UploadFile({ file });
        if (res?.file_url) {
          uploaded.push({ file_name: file.name, file_url: res.file_url, file_type: file.type || '' });
        }
      }
      setAdjustAttachments(prev => [...prev, ...uploaded]);
      toast.success(`已上传 ${uploaded.length} 个附件`);
    } catch (err) {
      toast.error("上传失败：" + err.message);
    } finally {
      setUploadingAdjust(false);
      e.target.value = ""; // 允许再次选择同一文件
    }
  };

  const renderAdjustAttachments = () => (
    <div className="flex flex-wrap items-center gap-1.5">
      {adjustAttachments.map((a, i) => (
        <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-[11px] max-w-[180px]">
          <Paperclip className="w-3 h-3 flex-shrink-0" />
          <span className="truncate" title={a.file_name}>{a.file_name}</span>
          <button
            type="button"
            onClick={() => setAdjustAttachments(prev => prev.filter((_, idx) => idx !== i))}
            className="text-slate-400 hover:text-red-500 flex-shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 text-[11px] transition">
        {uploadingAdjust ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
        添加附件
        <input type="file" multiple className="hidden" onChange={handleAdjustUpload} disabled={uploadingAdjust} />
      </label>
    </div>
  );

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
    const emailData = emailDraft || result?.data;
    if (!emailData?.to?.trim()) { toast.error("请填写收件人"); return; }
    if (!emailData?.subject?.trim() || !emailData?.body?.trim()) {
      toast.error("主题与正文不能为空");
      return;
    }
    setSending(true);
    try {
      // 先把用户的最新编辑持久化（即便发送失败，下次打开也能看到）
      await base44.entities.TaskExecution.update(execution.id, {
        automation_result: { ...result, data: emailData }
      });
      const res = await base44.functions.invoke('sendGmailEmail', {
        to: emailData.to,
        cc: emailData.cc || undefined,
        subject: emailData.subject,
        body: emailData.body,
        attachments: Array.isArray(emailData.attachments)
          ? emailData.attachments.map(a => ({ file_url: a.file_url, file_name: a.file_name, mime_type: a.mime_type }))
          : [],
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("邮件已发送");
      const sentData = { ...emailData, sent_at: new Date().toISOString() };
      await base44.entities.TaskExecution.update(execution.id, {
        automation_result: { ...result, data: sentData }
      });
      setEmailDraft(sentData);
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

  const sizeCls = size === "xl"
    ? "sm:max-w-[96vw] md:max-w-[1200px]"
    : size === "lg"
      ? "sm:max-w-[90vw] md:max-w-[860px]"
      : "sm:max-w-lg";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${sizeCls} max-h-[90vh] overflow-y-auto transition-[max-width] duration-200`}>
        {/* 尺寸切换：在三档之间循环（中/宽/超宽）*/}
        <div className="absolute right-12 top-3.5 z-10 flex items-center gap-0.5 bg-slate-100 rounded-full p-0.5">
          {[
            { k: "md", label: "中" },
            { k: "lg", label: "宽" },
            { k: "xl", label: "超宽" },
          ].map(s => (
            <button
              key={s.k}
              type="button"
              onClick={() => setSize(s.k)}
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition ${
                size === s.k ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
              title={`切换为${s.label}尺寸`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base pr-28">
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
              <AutomationResultPreview
                result={execution.automation_type === "email_draft" && emailDraft ? { ...result, data: emailDraft } : result}
                automationType={execution.automation_type}
                onDataChange={execution.automation_type === "email_draft" ? setEmailDraft : undefined}
                availableAttachments={execution.automation_type === "email_draft" ? availableAttachments : undefined}
              />

              {/* 邮件草稿：提供发送按钮 */}
              {execution.automation_type === "email_draft" && emailDraft && !emailDraft.sent_at && (
                <Button
                  className="w-full mt-3 bg-orange-500 hover:bg-orange-600"
                  onClick={handleSendEmail}
                  disabled={sending || !emailDraft.to?.trim()}
                >
                  {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                  {emailDraft.to?.trim() ? `发送给 ${emailDraft.to}` : "请先填写收件人"}
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
                  {renderAdjustAttachments()}
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
                  {renderAdjustAttachments()}
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