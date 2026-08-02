import React, { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, AlertTriangle, Sparkles, Send, RefreshCw, MessageSquarePlus, Mail, X, ArrowRight, Clock, Maximize2, Minimize2, Paperclip, ChevronDown } from "lucide-react";
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
  // 通用类（research/office_doc/note 等）：预览页内联编辑的本地草稿 + 是否有未保存改动
  const [editedData, setEditedData] = useState(null);
  const [savingEdits, setSavingEdits] = useState(false);
  const hasUnsavedEdits = !!editedData;
  // 弹层尺寸档位：md / lg / xl（默认 xl，给自动化结果更充裕的展示空间）
  const [size, setSize] = useState("xl");
  // 同任务下其它已完成自动化产生的可挂载附件候选
  const [availableAttachments, setAvailableAttachments] = useState([]);
  // 本地副本：调整后能立即覆盖父级 prop，让预览同步更新
  const [localExecution, setLocalExecution] = useState(executionProp);
  // 编辑锁：只要用户有未保存草稿（editedData 非空），就完全锁定本地数据，
  // 不允许父组件 4 秒一次的列表重拉把已编辑内容覆盖回旧版（防止"保存后回滚"的根因）
  const hasDraftRef = React.useRef(false);
  // 包装 setEditedData：每次用户编辑都同步打开"编辑锁"，防止父组件列表轮询覆盖本地数据
  const updateEditedData = React.useCallback((next) => {
    hasDraftRef.current = !!next;
    setEditedData(next);
  }, []);
  useEffect(() => {
    // 仅在弹窗切换到不同 execution（id 变了）时无条件同步；
    // 同一条 execution 期间，如果用户正在编辑，则保留本地副本
    const currentId = localExecution?.id;
    const nextId = executionProp?.id;
    if (currentId !== nextId) {
      setLocalExecution(executionProp);
      return;
    }
    if (hasDraftRef.current) return; // 有未保存编辑 → 不覆盖
    setLocalExecution(executionProp);
  }, [executionProp, localExecution?.id]);
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

  // 弹窗打开时，若已有 execution id，拉取最新数据（避免从列表点进来时 plan/result 缺失或过时）
  useEffect(() => {
    if (open && executionProp?.id && !hasDraftRef.current) {
      reloadExecution();
    }
  }, [open, executionProp?.id]);

  // 当切换到不同 execution 时（id 变化）重置本地草稿与邮件状态。
  // 注意：依赖项只用 execution?.id —— 否则父组件 4 秒一次的列表重拉会让 automation_result.data
  // 引用变化，从而把用户正在编辑的内容（editedData）静默清空，造成"保存后回滚"的假象。
  useEffect(() => {
    if (execution?.automation_type === "email_draft") {
      const initial = execution.automation_result?.data || null;
      setEmailDraft(initial ? { attachments: [], ...initial } : null);
    } else {
      setEmailDraft(null);
    }
    setEditedData(null);
    hasDraftRef.current = false;
  }, [execution?.id]);

  // 保存非邮件类型的内联编辑到后端
  // 接受可选 dataOverride 参数，避免 React 状态批处理时拿不到最新草稿（"完成"按钮触发保存的关键）
  const handleSaveEdits = async (dataOverride) => {
    const target = dataOverride || editedData;
    if (!target || !execution?.id) return;
    setSavingEdits(true);
    try {
      const newResult = { ...(execution.automation_result || {}), data: target };
      console.log("[SaveEdits] 即将写入", {
        executionId: execution.id,
        sectionsCount: Array.isArray(target.sections) ? target.sections.length : 0,
        firstSectionPreview: target.sections?.[0]?.body?.slice(0, 80) || target.sections?.[0]?.content?.slice(0, 80),
      });
      await base44.entities.TaskExecution.update(execution.id, { automation_result: newResult });
      // 重新拉取,确认数据已落库(只校验"关键字段"是否存在,不做严格 JSON 等值比较 ——
      // 后端可能对对象 key 做序列化重排,JSON.stringify 比较会误报失败)
      const fresh = await base44.entities.TaskExecution.get(execution.id);
      const savedData = fresh?.automation_result?.data;
      console.log("[SaveEdits] 后端实际落库", {
        sectionsCount: Array.isArray(savedData?.sections) ? savedData.sections.length : 0,
        firstSectionPreview: savedData?.sections?.[0]?.body?.slice(0, 80) || savedData?.sections?.[0]?.content?.slice(0, 80),
      });
      if (!savedData) {
        throw new Error("保存后服务端未返回数据,请刷新后再试");
      }
      // 抽样校验:章节数 / 标题 / 正文字段是否被持久化(避免后端把整个 data 吞掉)
      if (Array.isArray(target.sections)) {
        const ok = Array.isArray(savedData.sections)
          && savedData.sections.length === target.sections.length;
        if (!ok) {
          console.warn("[SaveEdits] 章节数不一致", { target, savedData });
          throw new Error("章节未完整保存,请刷新后再试");
        }
      }
      hasDraftRef.current = false;
      setLocalExecution(fresh);
      setEditedData(null);
      toast.success("已保存修改");
      refresh();
    } catch (e) {
      console.error("[SaveEdits] 失败", e, { target });
      toast.error("保存失败:" + e.message);
    } finally {
      setSavingEdits(false);
    }
  };

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
  const rawPlan = execution.automation_plan;
  const result = execution.automation_result;
  const status = execution.execution_status;

  // 判断执行方案是否包含实质内容（避免空对象/空字符串仍渲染空白卡片）
  function isPlanMeaningful(p) {
    if (!p || typeof p !== "object") return false;
    return !!(String(p.title || "").trim() || String(p.description || "").trim() || (Array.isArray(p.steps) && p.steps.length > 0));
  }

  // 当后端未返回有效方案时，按类型给出前端兜底方案，避免用户看到"执行方案为空"
  function getDefaultPlan(automationType, taskTitle, originalInput) {
    const input = String(originalInput || taskTitle || "").slice(0, 80);
    const title = String(taskTitle || "").slice(0, 60);
    const maps = {
      email_draft: {
        title: title || "邮件草稿方案",
        description: `根据用户输入起草一封专业邮件：${input || "未提供具体内容"}`,
        steps: [
          { name: "识别收件人与主题", detail: "从输入中提取收件人、抄送及邮件主题" },
          { name: "生成正文", detail: "撰写含称呼、正文、署名的完整邮件内容" },
          { name: "确认发送", detail: "用户二次确认后通过 Gmail 发送" }
        ],
        risk_warning: "请确认收件人、主题与正文内容，避免误发。",
        estimated_duration: "约 30 秒"
      },
      web_research: {
        title: title || "联网调研方案",
        description: `针对主题进行联网搜索并生成结构化调研报告：${input || ""}`,
        steps: [
          { name: "联网搜索", detail: "调用 Kimi 联网能力检索最新相关信息" },
          { name: "提炼结论", detail: "总结执行摘要、关键发现与建议" },
          { name: "生成报告", detail: "输出带章节与参考链接的 HTML 报告" }
        ],
        risk_warning: "报告内容基于公开网络信息，关键数据请再次核实。",
        estimated_duration: "约 1-2 分钟"
      },
      ppt_doc: {
        title: title || "演示稿方案",
        description: `根据主题生成可在线预览的幻灯片：${input || ""}`,
        steps: [
          { name: "梳理大纲", detail: "将主题拆分为封面、章节与内容页" },
          { name: "设计版式", detail: "自动选择封面、卡片、图文、结尾等版式" },
          { name: "渲染演示稿", detail: "生成可全屏播放的 HTML 演示稿" }
        ],
        risk_warning: "生成结果仅供参考，正式演示前请检查内容与排版。",
        estimated_duration: "约 1-2 分钟"
      },
      office_doc: {
        title: title || "办公文档方案",
        description: `根据需求生成结构化办公文档：${input || ""}`,
        steps: [
          { name: "明确文档结构", detail: "确定标题、章节与核心论点" },
          { name: "撰写内容", detail: "按章节生成 Markdown 格式正文" },
          { name: "导出 HTML", detail: "生成可在线预览的文档文件" }
        ],
        risk_warning: "请核对文档中的事实与数据。",
        estimated_duration: "约 1-2 分钟"
      },
      calendar_event: {
        title: title || "日程安排方案",
        description: `从输入中提取事件信息并创建提醒：${input || ""}`,
        steps: [
          { name: "解析时间", detail: "识别开始/结束时间与提醒偏移" },
          { name: "提取地点与参与人", detail: "补全地点、描述与参与人信息" },
          { name: "创建约定", detail: "在任务系统中创建待提醒事件" }
        ],
        risk_warning: "请确认时间解析结果，避免错过重要日程。",
        estimated_duration: "约 20 秒"
      },
      ledger_organize: {
        title: title || "账本整理方案",
        description: `从输入中提取收支记录并分类统计：${input || ""}`,
        steps: [
          { name: "识别账目", detail: "逐条提取日期、项目、金额与收支类型" },
          { name: "自动分类", detail: "按餐饮、交通、居住等维度归类" },
          { name: "汇总分析", detail: "计算总收入、总支出与结余" }
        ],
        risk_warning: "AI 分类可能存在偏差，请核对金额与类别。",
        estimated_duration: "约 30 秒"
      },
      file_organize: {
        title: title || "文件整理方案",
        description: `根据描述给出文件归档与整理建议：${input || ""}`,
        steps: [
          { name: "分析文件", detail: "识别需要整理的文件/文件夹" },
          { name: "规划归档", detail: "给出目标路径、分类与操作" },
          { name: "输出方案", detail: "生成可执行的整理清单" }
        ],
        risk_warning: "删除/移动操作前请确认，避免误删重要文件。",
        estimated_duration: "约 30 秒"
      },
      summary_note: {
        title: title || "总结笔记方案",
        description: `将输入整理为结构化笔记：${input || ""}`,
        steps: [
          { name: "提取关键信息", detail: "识别输入中的主题、要点与标签" },
          { name: "组织内容", detail: "生成 Markdown 笔记与核心要点" },
          { name: "保存结果", detail: "输出可编辑的笔记内容" }
        ],
        risk_warning: "请核对总结是否遗漏重要信息。",
        estimated_duration: "约 30 秒"
      }
    };
    return maps[automationType] || {
      title: title || "自动执行方案",
      description: `根据用户输入完成自动化任务：${input || ""}`,
      steps: [
        { name: "分析需求", detail: "理解用户输入并确定执行方向" },
        { name: "执行处理", detail: "调用 AI 完成内容生成或信息提取" },
        { name: "返回结果", detail: "以可视化方式展示生成结果" }
      ],
      risk_warning: "请确认生成结果后再使用。",
      estimated_duration: "约 1-3 分钟"
    };
  }

  const plan = isPlanMeaningful(rawPlan) ? rawPlan : getDefaultPlan(execution.automation_type, execution.task_title, execution.original_input);

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
      toast.success("✉️ 邮件已发送", { description: `发往 ${emailData.to}`, duration: 5000 });
      const sentData = { ...emailData, sent_at: new Date().toISOString() };
      await base44.entities.TaskExecution.update(execution.id, {
        automation_result: { ...result, data: sentData }
      });
      setEmailDraft(sentData);
      await reloadExecution(); // 同步 localExecution，避免"已发送"提示用旧 result 判断不出来
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
                result={
                  execution.automation_type === "email_draft" && emailDraft
                    ? { ...result, data: emailDraft }
                    : (editedData ? { ...result, data: editedData } : result)
                }
                automationType={execution.automation_type}
                executionId={execution.id}
                onDataChange={
                  execution.automation_type === "email_draft"
                    ? setEmailDraft
                    : updateEditedData
                }
                onSaveEdits={
                  execution.automation_type === "email_draft"
                    ? undefined
                    : () => handleSaveEdits(editedData)
                }
                availableAttachments={execution.automation_type === "email_draft" ? availableAttachments : undefined}
              />

              {/* 非邮件类型：内联编辑后的保存条 */}
              {execution.automation_type !== "email_draft" && hasUnsavedEdits && (
                <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex-1 text-[12px] text-amber-800">
                    你已修改内容，记得保存
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-amber-700 hover:bg-amber-100" onClick={() => updateEditedData(null)}>
                    放弃
                  </Button>
                  <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleSaveEdits(editedData)} disabled={savingEdits}>
                    {savingEdits ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                    保存修改
                  </Button>
                </div>
              )}

              {/* 邮件草稿：提供发送按钮（emailDraft 未初始化时回退用 result.data，避免按钮消失） */}
              {execution.automation_type === "email_draft" && (() => {
                const draft = emailDraft || result?.data;
                if (!draft || draft.sent_at) return null;
                return (
                  <Button
                    className="w-full mt-3 bg-orange-500 hover:bg-orange-600"
                    onClick={handleSendEmail}
                    disabled={sending || !draft.to?.trim()}
                  >
                    {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                    {draft.to?.trim() ? `发送给 ${draft.to}` : "请先填写收件人"}
                  </Button>
                );
              })()}
              {/* 已发送提示：优先看本地 emailDraft，回退看 result.data，确保发完立刻显示 */}
              {execution.automation_type === "email_draft" && (() => {
                const sentAt = emailDraft?.sent_at || result?.data?.sent_at;
                if (!sentAt) return null;
                const toAddr = emailDraft?.to || result?.data?.to;
                return (
                  <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-emerald-800">邮件已成功发送</div>
                      <div className="text-[11.5px] text-emerald-700 mt-0.5 truncate">
                        发往 <span className="font-medium">{toAddr}</span> · {new Date(sentAt).toLocaleString('zh-CN')}
                      </div>
                      <div className="text-[10.5px] text-emerald-600/80 mt-1">无需重复发送，可关闭此窗口</div>
                    </div>
                  </div>
                );
              })()}
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
              <details className="group text-xs rounded-xl border border-slate-200/70 bg-slate-50/40 hover:bg-slate-50 transition-colors overflow-hidden [&[open]]:bg-white [&[open]]:border-slate-200 [&[open]]:shadow-sm">
                <summary className="cursor-pointer select-none list-none px-3 py-2 flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors">
                  <MessageSquarePlus className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <span className="font-medium">方案不太对？告诉 AI 怎么调整</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-400 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
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
              <details className="group text-xs rounded-xl border border-slate-200/70 bg-slate-50/40 hover:bg-slate-50 transition-colors overflow-hidden [&[open]]:bg-white [&[open]]:border-slate-200 [&[open]]:shadow-sm">
                <summary className="cursor-pointer select-none list-none px-3 py-2 flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors">
                  <MessageSquarePlus className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  <span className="font-medium">不满意？继续沟通调整</span>
                  <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-400 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
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