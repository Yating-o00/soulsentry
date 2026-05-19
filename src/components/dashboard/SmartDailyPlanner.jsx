import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { format, parseISO, addDays } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAICreditGate } from "@/components/credits/useAICreditGate";
import InsufficientCreditsDialog from "@/components/credits/InsufficientCreditsDialog";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Plus,
  ArrowRight,
  Loader2,
  Trash2,
  Edit2,
  Target,
  Mic,
  Type,
  Send,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Undo2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import AnalysisSteps from "./planner/AnalysisSteps";
import VoiceInput from "./planner/VoiceInput";
import DeviceStrategyMap from "./planner/DeviceStrategyMap";
import ContextTimeline from "./planner/ContextTimeline";
import AutoExecCards from "./planner/AutoExecCards";
import KanbanBoard from "./planner/KanbanBoard";
import { extractAndCreateTasks } from "@/components/utils/extractAndCreateTasks";
import { attachPlanChildrenToParent } from "@/components/utils/attachPlanChildren";
import { syncPlanToNote } from "@/components/utils/syncPlanToNote";
import { createExecutionRecord } from "@/components/utils/trackExecution";
import { detectTimeConflicts } from "@/components/planner/detectConflicts";
import ConflictDialog from "@/components/planner/ConflictDialog";
import { detectEmailIntent } from "@/components/gmail/detectEmailIntent";
import EmailSendConfirmDialog from "@/components/gmail/EmailSendConfirmDialog";
import EnrichPlanButton from "./planner/EnrichPlanButton";
import ReplanComposer from "./planner/ReplanComposer";
import { persistExtraDaysFromTimeline } from "@/components/utils/persistMultiDayPlan";

const DEFAULT_STEPS = [
  { key: 'time_extraction', text: '提取时间实体…' },
  { key: 'intent', text: '识别意图与优先级…' },
  { key: 'spatial', text: '空间/路径计算…' },
  { key: 'device', text: '设备协同分发策略…' },
  { key: 'automation', text: '生成自动化任务…' },
];

/**
 * 查找当日已经创建的"根父约定"用于"追加"复用。
 * 规则:
 *   - 必须无 parent_task_id (顶层约定)
 *   - reminder_time 落在 dateStr 当天 (Asia/Shanghai)
 *   - 没有标签 "AI自动执行" / "情境时间线"(那些是子约定标签)
 *   - 按 created_date 升序取最早一个(代表当日首次输入的整体意图)
 */
// 去重工具：按 time+title 标准化键合并 focus_blocks，按 title 合并 key_tasks
function normKey(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "");
}
function dedupeBlocks(blocks) {
  const seen = new Set();
  const out = [];
  for (const b of blocks || []) {
    if (!b) continue;
    const k = `${normKey(b.time)}|${normKey(b.title)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(b);
  }
  return out;
}
function dedupeTasks(tasks) {
  const seen = new Set();
  const out = [];
  for (const t of tasks || []) {
    if (!t) continue;
    const k = normKey(t.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

async function findExistingParentForDay(dateStr) {
  if (!dateStr) return null;
  try {
    const tasks = await base44.entities.Task.list("-created_date", 200);
    const dayStart = new Date(`${dateStr}T00:00:00+08:00`).getTime();
    const dayEnd = dayStart + 24 * 3600 * 1000;
    const candidates = (tasks || []).filter(t => {
      if (!t || t.deleted_at || t.parent_task_id) return false;
      const tags = Array.isArray(t.tags) ? t.tags : [];
      if (tags.includes("AI自动执行") || tags.includes("情境时间线") || tags.includes("来自日规划")) return false;
      if (!t.reminder_time) return false;
      const ts = new Date(t.reminder_time).getTime();
      if (isNaN(ts)) return false;
      return ts >= dayStart && ts < dayEnd;
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
    return candidates[0];
  } catch (_) {
    return null;
  }
}

export default function SmartDailyPlanner() {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
  const draftKey = `smart_daily_draft_${selectedDateStr}`;
  const queryClient = useQueryClient();
  const [userInput, setUserInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInput, setShowInput] = useState(false);
  // AI analysis result (same structure as CalendarDayView)
  const [analysis, setAnalysis] = useState(null);
  const [resolvedDateHint, setResolvedDateHint] = useState(null);
  const [inputMode, setInputMode] = useState("text"); // "text" | "voice"
  const [conflictData, setConflictData] = useState(null); // { conflicts, allBlocks }
  const [emailSuggestion, setEmailSuggestion] = useState(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // null | 'syncing' | 'done'
  const [viewMode, setViewMode] = useState("timeline"); // "timeline" | "kanban"
  const resultsRef = useRef(null);
  const lastSubmittedRef = useRef(""); // 防止重复提交同一内容
  const { gate, showInsufficientDialog, insufficientProps, dismissDialog } = useAICreditGate();
  // 撤销快照：保存上一次修改前的 plan_json 与 analysis（用于一键回退）
  const [undoSnapshot, setUndoSnapshot] = useState(null); // { planJson, analysis, label, ts }
  const [isUndoing, setIsUndoing] = useState(false);

  // Load daily plan from DB using react-query for caching
  const { data: planQueryData, isLoading } = useQuery({
    queryKey: ['dailyPlan', selectedDateStr],
    queryFn: () => base44.entities.DailyPlan.filter({ plan_date: selectedDateStr }),
    staleTime: 2 * 60 * 1000,
  });

  const dayPlan = planQueryData?.[0] || null;
  const existingPlanId = dayPlan?.id || null;

  // Sync UI state when plan data changes
  useEffect(() => {
    if (isLoading) return;
    if (dayPlan) {
      const draft = localStorage.getItem(draftKey);
      setUserInput(draft ?? "");
      setShowInput(false);
    } else {
      const draft = localStorage.getItem(draftKey);
      setUserInput(draft || "");
      setShowInput(true);
    }
    setAnalysis(null);
    setResolvedDateHint(null);
  }, [dayPlan?.id, isLoading, selectedDateStr]);

  // Scroll to results
  useEffect(() => {
    if (analysis && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [analysis]);

  // Use analyzeIntent (same as CalendarDayView)
  const handleAnalyze = async () => {
    const trimmed = userInput.trim();
    if (!trimmed || isProcessing) return;

    // 防止重复提交同一内容
    if (lastSubmittedRef.current === trimmed) {
      toast.info("该内容已提交，请输入新的安排");
      return;
    }

    const allowed = await gate("schedule_optimize", "智能日程规划");
    if (!allowed) return;

    // 立即反馈：捕获输入、清空、收起输入框
    const capturedInput = trimmed;
    lastSubmittedRef.current = capturedInput;
    setUserInput("");
    localStorage.removeItem(draftKey);
    setShowInput(false);
    setIsProcessing(true);
    setSyncStatus(null);
    toast.success("已收到，正在为你规划日程…", { icon: "✨" });

    try {
      // Build existing plan context
      let existingPlan = null;
      if (analysis) {
        existingPlan = {
          timeline: analysis.timeline || [],
          devices: analysis.devices || [],
          automations: analysis.automations || [],
        };
      } else if (dayPlan?.plan_json) {
        const dp = dayPlan.plan_json;
        existingPlan = {
          timeline: (dp.focus_blocks || []).map(b => ({ time: b.time, title: b.title, description: b.description, type: b.type || 'focus', date: selectedDateStr })),
          devices: [],
          automations: (dp.key_tasks || []).map(t => ({ title: t.title, desc: t.description || '', status: t.status === 'completed' ? 'active' : 'ready' })),
        };
      }

      const { data } = await base44.functions.invoke('analyzeIntent', { input: capturedInput, date: selectedDateStr, existingPlan });
      const targetDate = data.resolved_date || selectedDateStr;

      if (targetDate === selectedDateStr) {
        setAnalysis(data);
        setResolvedDateHint(null);

        // Save to DailyPlan
        const planRecord = {
          plan_date: selectedDateStr,
          original_input: [dayPlan?.original_input, capturedInput].filter(Boolean).join('\n'),
          theme: data.parsed?.intents?.[0] || '',
          summary: '',
          plan_json: {
            key_tasks: dedupeTasks([...(dayPlan?.plan_json?.key_tasks || []), ...(data.automations || []).map(a => ({ title: a.title, description: a.desc || '', status: 'pending', priority: 'medium', category: 'other' }))]),
            focus_blocks: dedupeBlocks([...(dayPlan?.plan_json?.focus_blocks || []), ...(data.timeline || []).filter(t => !t.date || t.date === selectedDateStr).map(t => ({ time: t.time, title: t.title, description: t.description || '', type: t.type || 'focus' }))]),
            devices: (data.devices && data.devices.length > 0) ? data.devices : (dayPlan?.plan_json?.devices || []),
          },
          is_active: true,
        };

        if (existingPlanId) {
          await base44.entities.DailyPlan.update(existingPlanId, planRecord);
        } else {
          await base44.entities.DailyPlan.create(planRecord);
        }
        queryClient.invalidateQueries({ queryKey: ['dailyPlan', selectedDateStr] });
        toast.success("日程规划已生成", { icon: "📋" });

        // 跨日分发：AI 返回的 timeline 若含有"非当日"的条目（如"用三天时间…"会带 Day2/Day3 的 date），
        // 把它们写入各自日期的 DailyPlan，避免被丢弃
        persistExtraDaysFromTimeline({
          timeline: data.timeline || [],
          automations: data.automations || [],
          selectedDateStr,
          originalInput: capturedInput,
        }).then(extraDates => {
          if (extraDates.length > 0) {
            extraDates.forEach(d => queryClient.invalidateQueries({ queryKey: ['dailyPlan', d] }));
            toast.success(`已同步到其它 ${extraDates.length} 天：${extraDates.join('、')}`, { icon: '📅' });
          }
        }).catch(e => console.warn("multi-day persist failed", e));

        // 同步执行动态到通知页面（包含规划上下文）
        createExecutionRecord({
          title: capturedInput.slice(0, 60),
          originalInput: capturedInput,
          source: "dashboard",
          category: "task",
          planContext: {
            date: selectedDateStr,
            timelineItems: (data.timeline || []).filter(t => !t.date || t.date === selectedDateStr),
            automationItems: data.automations || [],
            syncTargets: ["tasks", "notes"],
          },
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['task-executions'] });
        }).catch(e => console.warn("Execution tracking failed:", e));

        // 冲突检测
        const mergedBlocks = planRecord.plan_json.focus_blocks || [];
        const conflicts = detectTimeConflicts(mergedBlocks);
        if (conflicts.length > 0) {
          setConflictData({ conflicts, allBlocks: mergedBlocks });
        }

        // 邮件发送意图检测
        detectEmailIntent(capturedInput).then(suggestion => {
          if (suggestion) {
            setEmailSuggestion(suggestion);
            setShowEmailDialog(true);
          }
        }).catch(e => console.warn("Email intent detection skipped:", e));

        // 后台静默：用户原始输入 → 父约定；AI 规划结果（时间线/自动执行）→ 子约定挂在父下
        setSyncStatus('syncing');
        const isAppend = !!existingPlanId;
        const taskPromise = isAppend
          ? findExistingParentForDay(selectedDateStr)
          : extractAndCreateTasks(capturedInput, selectedDateStr).then(arr => arr?.[0] || null);

        Promise.allSettled([
          taskPromise,
          syncPlanToNote(capturedInput, "daily_plan", { date: selectedDateStr })
        ]).then(async results => {
          const parentTask = results[0].status === 'fulfilled' ? results[0].value : null;
          const noteOk = results[1].status === 'fulfilled' && results[1].value;
          if (parentTask?.id) {
            const timelineForDay = (data.timeline || []).filter(t => !t.date || t.date === selectedDateStr);
            await attachPlanChildrenToParent(parentTask.id, {
              timeline: timelineForDay,
              automations: data.automations || [],
              dateStr: selectedDateStr,
            }).catch(e => console.warn("attach children failed", e));
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }
          const parts = [];
          if (!isAppend && parentTask) parts.push('1 个约定');
          else if (isAppend && parentTask) parts.push('已并入当日约定');
          if (noteOk) parts.push('心签');
          if (parts.length > 0) toast.success(`已同步到${parts.join(' + ')}`, { icon: '🔄' });
          setSyncStatus('done');
        });
      } else {
        setAnalysis(null);
        setResolvedDateHint(targetDate);

        // Persist to target date's DailyPlan
        const targetPlanRecord = {
          plan_date: targetDate,
          original_input: capturedInput,
          theme: data.parsed?.intents?.[0] || '',
          summary: '',
          plan_json: {
            key_tasks: (data.automations || []).map(a => ({ title: a.title, description: a.desc || '', status: 'pending', priority: 'medium', category: 'other' })),
            focus_blocks: (data.timeline || []).filter(t => !t.date || t.date === targetDate).map(t => ({ time: t.time, title: t.title, description: t.description || '', type: t.type || 'focus' })),
            devices: data.devices || [],
          },
          is_active: true,
        };
        const targetPlans = await base44.entities.DailyPlan.filter({ plan_date: targetDate });
        if (targetPlans && targetPlans.length > 0) {
          const tp = targetPlans[0];
          targetPlanRecord.plan_json.key_tasks = dedupeTasks([...(tp.plan_json?.key_tasks || []), ...targetPlanRecord.plan_json.key_tasks]);
          targetPlanRecord.plan_json.focus_blocks = dedupeBlocks([...(tp.plan_json?.focus_blocks || []), ...targetPlanRecord.plan_json.focus_blocks]);
          targetPlanRecord.plan_json.devices = (targetPlanRecord.plan_json.devices && targetPlanRecord.plan_json.devices.length > 0) ? targetPlanRecord.plan_json.devices : (tp.plan_json?.devices || []);
          targetPlanRecord.original_input = [tp.original_input, capturedInput].filter(Boolean).join('\n');
          await base44.entities.DailyPlan.update(tp.id, targetPlanRecord);
        } else {
          await base44.entities.DailyPlan.create(targetPlanRecord);
        }
        queryClient.invalidateQueries({ queryKey: ['dailyPlan', targetDate] });
        toast.success(`已保存到 ${targetDate} 的规划`, { icon: '📋' });

        // 冲突检测
        const targetBlocks = targetPlanRecord.plan_json.focus_blocks || [];
        const targetConflicts = detectTimeConflicts(targetBlocks);
        if (targetConflicts.length > 0) {
          setConflictData({ conflicts: targetConflicts, allBlocks: targetBlocks });
        }

        // 后台静默：用户原始输入 → 父约定；AI 规划结果 → 子约定
        setSyncStatus('syncing');
        const targetHasPlan = targetPlans && targetPlans.length > 0;
        const taskPromise = targetHasPlan
          ? findExistingParentForDay(targetDate)
          : extractAndCreateTasks(capturedInput, targetDate).then(arr => arr?.[0] || null);

        Promise.allSettled([
          taskPromise,
          syncPlanToNote(capturedInput, "daily_plan", { date: targetDate })
        ]).then(async results => {
          const parentTask = results[0].status === 'fulfilled' ? results[0].value : null;
          const noteOk = results[1].status === 'fulfilled' && results[1].value;
          if (parentTask?.id) {
            const timelineForDay = (data.timeline || []).filter(t => !t.date || t.date === targetDate);
            await attachPlanChildrenToParent(parentTask.id, {
              timeline: timelineForDay,
              automations: data.automations || [],
              dateStr: targetDate,
            }).catch(e => console.warn("attach children failed", e));
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }
          const parts = [];
          if (!targetHasPlan && parentTask) parts.push('1 个约定');
          else if (targetHasPlan && parentTask) parts.push('已并入当日约定');
          if (noteOk) parts.push('心签');
          if (parts.length > 0) toast.success(`已同步到${parts.join(' + ')}`, { icon: '🔄' });
          setSyncStatus('done');
        });
      }
    } catch (err) {
      console.error("Analysis failed", err);
      toast.error(err?.response?.data?.error || err?.message || '分析失败，请重试');
      // 恢复输入让用户可以重试
      setUserInput(capturedInput);
      setShowInput(true);
      lastSubmittedRef.current = ""; // 允许重新提交
    } finally {
      setIsProcessing(false);
    }
  };

  // 在修改前保存当前 plan_json + analysis 快照
  const captureSnapshot = useCallback((label) => {
    const planJson = dayPlan?.plan_json ? JSON.parse(JSON.stringify(dayPlan.plan_json)) : null;
    const analysisSnap = analysis ? JSON.parse(JSON.stringify(analysis)) : null;
    if (!planJson && !analysisSnap) return;
    setUndoSnapshot({ planJson, analysis: analysisSnap, label, ts: Date.now() });
  }, [dayPlan, analysis]);

  // 执行撤销：把 plan_json 回滚到快照，并同步到数据库
  const handleUndo = useCallback(async () => {
    if (!undoSnapshot || isUndoing) return;
    setIsUndoing(true);
    try {
      const snap = undoSnapshot;
      // 恢复 analysis 视图
      setAnalysis(snap.analysis || null);
      // 恢复 dayPlan 缓存
      if (snap.planJson) {
        queryClient.setQueryData(['dailyPlan', selectedDateStr], (old) => {
          if (!old || !old[0]) return old;
          return [{ ...old[0], plan_json: snap.planJson }];
        });
        if (existingPlanId) {
          await base44.entities.DailyPlan.update(existingPlanId, { plan_json: snap.planJson });
        }
      }
      setUndoSnapshot(null);
      toast.success("已撤销，恢复到上一版", { icon: "↩️" });
    } catch (err) {
      console.error("Undo failed", err);
      toast.error("撤销失败，请重试");
    } finally {
      setIsUndoing(false);
    }
  }, [undoSnapshot, isUndoing, existingPlanId, selectedDateStr, queryClient]);

  // 切换日期时清掉快照（避免误撤销别的日子）
  useEffect(() => { setUndoSnapshot(null); }, [selectedDateStr]);

  // Helper to update dayPlan in cache optimistically
  const updateDayPlanCache = useCallback((updater) => {
    queryClient.setQueryData(['dailyPlan', selectedDateStr], (old) => {
      if (!old || !old[0]) return old;
      const updated = updater(old[0]);
      return [updated];
    });
  }, [queryClient, selectedDateStr]);

  // Kanban drag status change handler
  const handleKanbanStatusChange = async (source, sourceIndex, newStatus) => {
    const planJson = { ...(dayPlan?.plan_json || {}) };
    if (source === "block") {
      const blocks = [...(planJson.focus_blocks || [])];
      if (blocks[sourceIndex]) {
        blocks[sourceIndex] = { ...blocks[sourceIndex], status: newStatus };
        planJson.focus_blocks = blocks;
      }
    } else {
      const tasks = [...(planJson.key_tasks || [])];
      if (tasks[sourceIndex]) {
        tasks[sourceIndex] = { ...tasks[sourceIndex], status: newStatus };
        planJson.key_tasks = tasks;
      }
    }
    updateDayPlanCache(prev => ({ ...prev, plan_json: planJson }));
    if (analysis) {
      setAnalysis(prev => ({
        ...prev,
        timeline: planJson.focus_blocks || prev.timeline,
        automations: (planJson.key_tasks || []).map(t => ({ title: t.title, desc: t.description || '', status: t.status || 'pending' })),
      }));
    }
    if (existingPlanId) {
      await base44.entities.DailyPlan.update(existingPlanId, { plan_json: planJson });
      toast.success("状态已更新");
    }
  };

  // 整体重新规划：基于现有规划 + 用户修改意见，让 AI 重排当日方案，并替换持久化数据
  const handleReplan = useCallback(async ({ feedback }) => {
    if (!feedback || !feedback.trim()) return;
    const allowed = await gate("schedule_optimize", "智能日程规划");
    if (!allowed) return;

    // 保存撤销快照
    captureSnapshot("整体重新规划");

    setIsProcessing(true);
    setSyncStatus(null);
    toast.success("正在按你的意见重新规划…", { icon: "🔄" });

    try {
      // 组装现有方案
      let existingPlan = null;
      if (analysis) {
        existingPlan = {
          timeline: analysis.timeline || [],
          devices: analysis.devices || [],
          automations: analysis.automations || [],
        };
      } else if (dayPlan?.plan_json) {
        const dp = dayPlan.plan_json;
        existingPlan = {
          timeline: (dp.focus_blocks || []).map(b => ({ time: b.time, title: b.title, description: b.description, type: b.type || 'focus', date: selectedDateStr })),
          devices: [],
          automations: (dp.key_tasks || []).map(t => ({ title: t.title, desc: t.description || '', status: t.status === 'completed' ? 'active' : 'ready' })),
        };
      }

      const originalInput = dayPlan?.original_input || "";

      // 落地反馈闭环：把最近 24h 内"未消费"的延期日志带进 AI 重排，作为优先考量
      let deferralContext = "";
      let consumableLogs = [];
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const logs = await base44.entities.TaskDeferralLog.filter(
          { carry_to_next_plan: true },
          "-created_date",
          20
        );
        consumableLogs = (logs || []).filter(l => !l.consumed_in_replan_at && l.created_date >= since);
        if (consumableLogs.length > 0) {
          const REASON_LABEL = {
            device_not_ready: "设备/条件未就绪",
            time_conflict: "时间被占用",
            energy_low: "精力不足",
            external_blocker: "外部阻塞",
            forgot: "忘记了",
            scope_changed: "范围变更",
            other: "其它",
          };
          deferralContext = "\n\n【最近未按时落地的事项 - 请在重排中优先安排，并避开同类原因】\n" +
            consumableLogs.map(l => {
              const r = REASON_LABEL[l.reason_category] || l.reason_category;
              const miss = l.missing_prerequisite ? `（缺：${l.missing_prerequisite}）` : "";
              const note = l.reason_note ? ` - ${l.reason_note}` : "";
              return `• 「${l.task_title || '任务'}」原因：${r}${miss}${note}`;
            }).join("\n");
        }
      } catch (e) {
        console.warn("[Replan] load deferral logs failed", e);
      }

      const replanInput = `【已有规划原始描述】\n${originalInput || "(无)"}\n\n【用户的修改意见 - 请基于已有规划整体重新调整】\n${feedback}${deferralContext}`;

      const { data } = await base44.functions.invoke('analyzeIntent', {
        input: replanInput,
        date: selectedDateStr,
        existingPlan,
        mode: 'replan',
      });

      // 时间线条目：后端可能不返回 date 字段，replan 场景下统一视为当日条目
      const newFocusBlocks = (data.timeline || []).map(t => ({
        time: t.time,
        title: t.title,
        description: t.description || '',
        type: t.type || 'focus',
      }));
      const newKeyTasks = (data.automations || []).map(a => ({
        title: a.title,
        description: a.desc || '',
        status: 'pending',
        priority: 'medium',
        category: 'other',
      }));
      const newDevices = (data.devices && data.devices.length > 0) ? data.devices : (dayPlan?.plan_json?.devices || []);

      const newPlanJson = {
        key_tasks: newKeyTasks,
        focus_blocks: newFocusBlocks,
        devices: newDevices,
      };

      // 关键修复：把 timeline 条目都打上当日 date，避免渲染时被日期过滤掉
      setAnalysis({
        ...data,
        timeline: (data.timeline || []).map(t => ({ ...t, date: t.date || selectedDateStr })),
        automations: data.automations || [],
        devices: newDevices,
      });

      const planRecord = {
        plan_date: selectedDateStr,
        original_input: [originalInput, `[修改意见] ${feedback}`].filter(Boolean).join('\n'),
        theme: data.parsed?.intents?.[0] || dayPlan?.theme || '',
        summary: dayPlan?.summary || '',
        plan_json: newPlanJson,
        is_active: true,
      };

      // 乐观更新缓存，避免 invalidate 后短暂为空
      updateDayPlanCache(prev => ({ ...prev, ...planRecord }));

      if (existingPlanId) {
        await base44.entities.DailyPlan.update(existingPlanId, planRecord);
      } else {
        const created = await base44.entities.DailyPlan.create(planRecord);
        queryClient.setQueryData(['dailyPlan', selectedDateStr], [created]);
      }
      queryClient.invalidateQueries({ queryKey: ['dailyPlan', selectedDateStr] });

      // 标记本次已消费的延期日志，避免下次重排重复影响
      if (consumableLogs.length > 0) {
        const nowIso = new Date().toISOString();
        await Promise.all(
          consumableLogs.map(l =>
            base44.entities.TaskDeferralLog.update(l.id, { consumed_in_replan_at: nowIso })
              .catch(e => console.warn("mark deferral consumed failed", e))
          )
        );
        toast.success(`已根据你的意见重新规划（含 ${consumableLogs.length} 条未完成事项）`, { icon: "✨" });
      } else {
        toast.success("已根据你的意见重新规划", { icon: "✨" });
      }

      const conflicts = detectTimeConflicts(newPlanJson.focus_blocks || []);
      if (conflicts.length > 0) {
        setConflictData({ conflicts, allBlocks: newPlanJson.focus_blocks || [] });
      }
    } catch (err) {
      console.error("Replan failed", err);
      toast.error(err?.response?.data?.error || err?.message || '重新规划失败，请重试');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [analysis, dayPlan, existingPlanId, selectedDateStr, queryClient, gate]);

  const handleDelete = async () => {
    if (!existingPlanId) return;
    try {
      await base44.entities.DailyPlan.delete(existingPlanId);
      queryClient.invalidateQueries({ queryKey: ['dailyPlan', selectedDateStr] });
      setAnalysis(null);
      setUserInput("");
      localStorage.removeItem(draftKey);
      toast.success("规划已清除");
    } catch (err) {
      toast.error("删除失败");
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm animate-pulse">
        <div className="h-5 bg-slate-100 rounded w-1/3 mb-4" />
        <div className="h-20 bg-slate-50 rounded-2xl" />
      </div>
    );
  }

  return (
    <>
    <div className="bg-white rounded-[28px] border border-slate-100/80 shadow-[0_8px_28px_rgba(140,147,201,0.12)] overflow-hidden">
      {/* Header */}
      <div className="px-5 md:px-6 pt-5 pb-4 border-b border-slate-100/60">
        {/* Top row: Title + Actions */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#384877] to-[#5b6dae] flex items-center justify-center shadow-lg shadow-[#384877]/25 shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-[15px] leading-tight">智能日程规划</h3>
              <p className="text-xs text-slate-400 mt-0.5">AI 自动识别时间与意图</p>
            </div>
          </div>

          {/* View toggle + Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {dayPlan && (
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 mr-1">
                <button
                  onClick={() => setViewMode("timeline")}
                  className={cn("px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                    viewMode === "timeline" ? "bg-white text-[#384877] shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  时间线
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={cn("px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                    viewMode === "kanban" ? "bg-white text-[#384877] shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  看板
                </button>
              </div>
            )}
            {dayPlan && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-slate-400 hover:text-[#384877] hover:bg-[#384877]/5"
                  onClick={() => setShowInput(true)}
                  title="追加内容"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50"
                  onClick={handleDelete}
                  title="删除当日规划"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
            {!dayPlan && !showInput && (
              <Button
                size="sm"
                className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-8 px-3.5 text-xs shadow-sm shadow-[#384877]/20"
                onClick={() => setShowInput(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> 新建规划
              </Button>
            )}
          </div>
        </div>

        {/* Bottom row: Date nav + input badge */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date switcher */}
          <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200/60 overflow-hidden">
            <button
              onClick={() => setSelectedDateStr(format(addDays(parseISO(selectedDateStr), -1), "yyyy-MM-dd"))}
              className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-[#384877] hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1.5 text-xs font-medium text-slate-700 min-w-[100px] text-center border-x border-slate-200/60 select-none">
              {format(parseISO(selectedDateStr), "M月d日 EEE", { locale: zhCN })}
              {selectedDateStr === todayStr && (
                <span className="ml-1.5 text-[10px] text-white bg-[#384877] px-1.5 py-0.5 rounded-md font-bold">今</span>
              )}
            </div>
            <button
              onClick={() => setSelectedDateStr(format(addDays(parseISO(selectedDateStr), 1), "yyyy-MM-dd"))}
              className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-[#384877] hover:bg-slate-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Input source badge */}
          {dayPlan?.original_input && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-[#384877]/5 border border-[#384877]/10 rounded-xl max-w-[280px]" title={dayPlan.original_input}>
              <Target className="w-3 h-3 text-[#384877]/60 shrink-0" />
              <span className="text-[11px] text-[#384877]/70 truncate leading-tight">
                {dayPlan.original_input}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 md:px-6 py-5 space-y-3">
              {/* Unified input card */}
              <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 shadow-sm overflow-hidden">
                {/* Mode tabs inside card top */}
                <div className="flex items-center border-b border-slate-100 px-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setInputMode("text")}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px",
                      inputMode === "text"
                        ? "border-[#384877] text-[#384877]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <Type className="w-3.5 h-3.5" /> 文本
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("voice")}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px",
                      inputMode === "voice"
                        ? "border-[#384877] text-[#384877]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <Mic className="w-3.5 h-3.5" /> 语音
                  </button>
                  <div className="flex-1" />
                  {dayPlan && (
                    <button
                      type="button"
                      onClick={() => setShowInput(false)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 px-3 py-2 transition-colors"
                    >
                      取消
                    </button>
                  )}
                </div>

                {/* Text input body */}
                {inputMode === "text" && (
                  <div className="p-3">
                    <Textarea
                      value={userInput}
                      onChange={(e) => { const v = e.target.value; setUserInput(v); localStorage.setItem(draftKey, v); }}
                      placeholder={`输入安排，AI 会自动识别日期和意图…`}
                      className="min-h-[76px] border-none shadow-none focus-visible:ring-0 resize-none bg-transparent text-sm placeholder:text-slate-350"
                      autoFocus
                      onKeyDown={(e) => {
                        const composing = e.nativeEvent && e.nativeEvent.isComposing;
                        if (!composing && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnalyze(); }
                      }}
                    />
                    {/* Bottom bar */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/80 mt-1">
                      <div className="flex gap-1.5 flex-wrap overflow-hidden">
                        {['📞 打电话','📊 报告DDL','✈️ 航班'].map((s, i) => {
                          const texts = ['今晚8点给妈妈打电话，聊聊最近身体情况','下周二前完成Q4报告，每天下午提醒我进度','明天早上7点飞深圳，提前一晚提醒收拾行李'];
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setUserInput(texts[i])}
                              className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-50 border border-slate-150 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors whitespace-nowrap"
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                      <Button
                        onClick={handleAnalyze}
                        disabled={isProcessing || !userInput.trim()}
                        className={cn(
                          "rounded-xl h-8 px-5 text-xs font-medium shadow-sm transition-all shrink-0",
                          userInput.trim()
                            ? "bg-[#384877] hover:bg-[#2d3a5f] text-white shadow-[#384877]/20"
                            : "bg-slate-100 text-slate-400 shadow-none"
                        )}
                      >
                        {isProcessing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />分析中</> : <><Send className="w-3 h-3 mr-1" />发送</>}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Voice input body */}
                {inputMode === "voice" && (
                  <div className="p-5">
                    <VoiceInput
                      disabled={isProcessing}
                      onResult={(text) => {
                        setUserInput((prev) => prev ? prev + "\n" + text : text);
                        setInputMode("text");
                      }}
                    />
                    {userInput && (
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <p className="text-[11px] text-slate-400 mb-1">已识别内容</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{userInput}</p>
                        <Button
                          onClick={handleAnalyze}
                          disabled={isProcessing || !userInput.trim()}
                          className="mt-3 bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-8 px-5 text-xs shadow-sm shadow-[#384877]/20"
                        >
                          {isProcessing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />分析中</> : <><Sparkles className="w-3 h-3 mr-1" />发送分析</>}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Date navigation hint */}
              {resolvedDateHint && resolvedDateHint !== selectedDateStr && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800"
                >
                  <CalendarIcon className="w-4 h-4 shrink-0" />
                  <span className="text-sm flex-1">
                    AI 识别到该安排属于 <strong>{resolvedDateHint}</strong>，已自动保存
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-100 rounded-xl h-8 text-xs gap-1.5 shrink-0"
                    onClick={() => {
                      setSelectedDateStr(resolvedDateHint);
                      setResolvedDateHint(null);
                    }}
                  >
                    跳转查看 <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </motion.div>
              )}

              {isProcessing && <AnalysisSteps steps={DEFAULT_STEPS} running={true} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Processing indicator when input is collapsed */}
      {isProcessing && !showInput && (
        <div className="px-5 md:px-6 py-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#384877]/5 border border-[#384877]/10">
            <Loader2 className="w-4 h-4 text-[#384877] animate-spin shrink-0" />
            <span className="text-sm text-[#384877] font-medium">AI 正在分析并生成日程规划…</span>
          </div>
          <div className="mt-3">
            <AnalysisSteps steps={DEFAULT_STEPS} running={true} />
          </div>
        </div>
      )}

      {/* Sync status indicator */}
      {syncStatus === 'syncing' && (
        <div className="px-5 md:px-6 pb-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>正在同步到约定和心签…</span>
          </div>
        </div>
      )}

      {/* Results from AI analysis */}
      <div ref={resultsRef} className="px-6 pb-6 space-y-5">
        {/* Context Timeline (from analysis) - only current date entries */}
        {analysis?.timeline?.length > 0 && viewMode === "timeline" && (() => {
          // 用原始索引让"改一下"能定位到 analysis.timeline 的真实条目
          const dayBlocksWithIdx = analysis.timeline
            .map((t, i) => ({ ...t, __origIdx: i }))
            .filter(t => !t.date || t.date === selectedDateStr);
          if (dayBlocksWithIdx.length === 0) return null;
          return (
            <ContextTimeline
              blocks={dayBlocksWithIdx.map(t => ({ time: t.time, title: t.title, description: t.description, type: t.type || 'focus', __origIdx: t.__origIdx }))}
              onReplan={handleReplan}
              onReviseItem={(_localIdx, newBlock) => {
                // _localIdx 是过滤后数组的位置，用 __origIdx 回到 analysis.timeline 的真实索引
                const origIdx = dayBlocksWithIdx[_localIdx]?.__origIdx;
                if (origIdx == null) return;
                captureSnapshot("单条修改");
                setAnalysis(prev => {
                  if (!prev) return prev;
                  const next = [...(prev.timeline || [])];
                  next[origIdx] = { ...next[origIdx], ...newBlock };
                  return { ...prev, timeline: next };
                });
                // 同步持久化到 DailyPlan
                if (existingPlanId && dayPlan?.plan_json) {
                  const focus = [...(dayPlan.plan_json.focus_blocks || [])];
                  const matchIdx = focus.findIndex(f => normKey(f.time) === normKey(dayBlocksWithIdx[_localIdx].time) && normKey(f.title) === normKey(dayBlocksWithIdx[_localIdx].title));
                  if (matchIdx >= 0) {
                    focus[matchIdx] = { ...focus[matchIdx], time: newBlock.time, title: newBlock.title, description: newBlock.description, type: newBlock.type };
                    const planJson = { ...dayPlan.plan_json, focus_blocks: focus };
                    updateDayPlanCache(prev => ({ ...prev, plan_json: planJson }));
                    base44.entities.DailyPlan.update(existingPlanId, { plan_json: planJson }).catch(e => console.warn('persist revise failed', e));
                  }
                }
              }}
            />
          );
        })()}

        {/* Auto Exec Cards (from analysis) */}
        {analysis?.automations?.length > 0 && viewMode === "timeline" && (
          <AutoExecCards
            tasks={analysis.automations.map(a => ({ title: a.title, desc: a.desc, status: a.status }))}
            userText={userInput}
          />
        )}

        {/* Kanban view for analysis results */}
        {analysis && viewMode === "kanban" && (
          <KanbanBoard
            focusBlocks={(analysis.timeline || []).filter(t => !t.date || t.date === selectedDateStr)}
            keyTasks={analysis.automations || []}
            onStatusChange={handleKanbanStatusChange}
          />
        )}

        {/* Fallback: show saved dayPlan data when no fresh analysis */}
        {!analysis && dayPlan && (
          <div className="space-y-5">
            {viewMode === "kanban" ? (
              <KanbanBoard
                focusBlocks={dayPlan.plan_json?.focus_blocks || []}
                keyTasks={dayPlan.plan_json?.key_tasks || []}
                onStatusChange={handleKanbanStatusChange}
              />
            ) : (
              <>
                {/* 补全按钮：当时间线或设备协同缺失但有 key_tasks 时显示 */}
                {(dayPlan.plan_json?.key_tasks?.length > 0) && (!dayPlan.plan_json?.focus_blocks?.length || !dayPlan.plan_json?.devices?.length) && (
                  <EnrichPlanButton
                    dayPlan={dayPlan}
                    planId={existingPlanId}
                    dateStr={selectedDateStr}
                    needTimeline={!dayPlan.plan_json?.focus_blocks?.length}
                    needDevices={!dayPlan.plan_json?.devices?.length}
                    onEnriched={(newPlanJson) => {
                      updateDayPlanCache(prev => ({ ...prev, plan_json: newPlanJson }));
                      queryClient.invalidateQueries({ queryKey: ['dailyPlan', selectedDateStr] });
                    }}
                  />
                )}
                {dayPlan.plan_json?.focus_blocks?.length > 0 && (
                  <ContextTimeline
                    blocks={dayPlan.plan_json.focus_blocks}
                    onReplan={handleReplan}
                    onReviseItem={(idx, newBlock) => {
                      if (!existingPlanId) return;
                      captureSnapshot("单条修改");
                      const focus = [...(dayPlan.plan_json.focus_blocks || [])];
                      if (!focus[idx]) return;
                      focus[idx] = { ...focus[idx], time: newBlock.time, title: newBlock.title, description: newBlock.description, type: newBlock.type };
                      const planJson = { ...dayPlan.plan_json, focus_blocks: focus };
                      updateDayPlanCache(prev => ({ ...prev, plan_json: planJson }));
                      base44.entities.DailyPlan.update(existingPlanId, { plan_json: planJson }).catch(e => console.warn('persist revise failed', e));
                    }}
                  />
                )}
                {dayPlan.plan_json?.key_tasks?.length > 0 && (
                  <AutoExecCards
                    tasks={dayPlan.plan_json.key_tasks.map(t => ({
                      title: t.title,
                      desc: t.description || '',
                      // 已完成 → done(已执行)；执行中 → running；其它 → ready
                      status: t.status === 'completed' ? 'done'
                        : (t.status === 'in_progress' || t.status === 'running') ? 'running'
                        : 'ready',
                      execution_id: t.execution_id || null,
                      result_preview: t.result_preview || null,
                    }))}
                    onItemStatusChange={async (idx, patch) => {
                      // 持久化已执行状态到 DailyPlan，避免刷新后丢失
                      if (!existingPlanId) return;
                      const planJson = { ...(dayPlan?.plan_json || {}) };
                      const tasks = [...(planJson.key_tasks || [])];
                      if (!tasks[idx]) return;
                      tasks[idx] = {
                        ...tasks[idx],
                        ...(patch.status === 'done' ? { status: 'completed' } : {}),
                        ...(patch.status === 'running' ? { status: 'in_progress' } : {}),
                        ...(patch.execution_id !== undefined ? { execution_id: patch.execution_id } : {}),
                        ...(patch.result_preview !== undefined ? { result_preview: patch.result_preview } : {}),
                      };
                      planJson.key_tasks = tasks;
                      updateDayPlanCache(prev => ({ ...prev, plan_json: planJson }));
                      await base44.entities.DailyPlan.update(existingPlanId, { plan_json: planJson }).catch(e => console.warn('persist key_task status failed', e));
                    }}
                  />
                )}
                {/* 当时间线或设备协同缺失时，提供一键补全入口 */}
                {((dayPlan.plan_json?.focus_blocks?.length || 0) === 0 || (dayPlan.plan_json?.devices?.length || 0) === 0) && (
                  <EnrichPlanButton
                    dayPlan={dayPlan}
                    planId={existingPlanId}
                    dateStr={selectedDateStr}
                    needTimeline={(dayPlan.plan_json?.focus_blocks?.length || 0) === 0}
                    needDevices={(dayPlan.plan_json?.devices?.length || 0) === 0}
                    onEnriched={(newPlanJson) => {
                      updateDayPlanCache(prev => ({ ...prev, plan_json: newPlanJson }));
                      queryClient.invalidateQueries({ queryKey: ['dailyPlan', selectedDateStr] });
                    }}
                  />
                )}
              </>
            )}

            {/* 整体重新规划 / 追加内容 */}
            {!showInput && (
              <ReplanComposer
                disabled={isProcessing}
                onSubmit={async ({ feedback }) => {
                  await handleReplan({ feedback });
                }}
              />
            )}
          </div>
        )}

        {/* Empty state */}
        {!analysis && !dayPlan && !showInput && (
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Target className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm mb-4">还没有当日规划，输入你的安排开始</p>
            <Button
              size="sm"
              className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl"
              onClick={() => setShowInput(true)}
            >
              <Sparkles className="w-3.5 h-3.5 mr-2" /> 开始规划
            </Button>
          </div>
        )}
      </div>
    </div>
    <ConflictDialog
      open={!!conflictData}
      onClose={() => setConflictData(null)}
      conflicts={conflictData?.conflicts || []}
      dateStr={selectedDateStr}
      allBlocks={conflictData?.allBlocks || []}
      onApplyResolution={(conflictIdx, suggestion) => {
        // Apply the resolution: update focus_blocks with new times
        const conflict = conflictData.conflicts[conflictIdx];
        if (!conflict) return;
        const updatedBlocks = [...(dayPlan?.plan_json?.focus_blocks || analysis?.timeline || [])];
        if (suggestion.new_time_a) {
          const blockA = updatedBlocks.find(b => b.title === conflict.blockA.title);
          if (blockA) blockA.time = suggestion.new_time_a;
        }
        if (suggestion.new_time_b) {
          const blockB = updatedBlocks.find(b => b.title === conflict.blockB.title);
          if (blockB) blockB.time = suggestion.new_time_b;
        }
        // Persist updated plan
        const updatedPlanJson = { ...(dayPlan?.plan_json || {}), focus_blocks: updatedBlocks };
        if (existingPlanId) {
          base44.entities.DailyPlan.update(existingPlanId, { plan_json: updatedPlanJson }).then(() => {
            updateDayPlanCache(prev => ({ ...prev, plan_json: updatedPlanJson }));
            if (analysis) {
              setAnalysis(prev => ({ ...prev, timeline: updatedBlocks }));
            }
            toast.success("已应用调配方案");
          }).catch(e => console.error("Failed to apply resolution", e));
        }
        // Sync conflict resolution to note
        const conflictNoteContent = `⚠️ 冲突处理: 「${conflict.blockA.title}」与「${conflict.blockB.title}」时间重叠 → ${suggestion.strategy_label}: ${suggestion.description}`;
        syncPlanToNote(conflictNoteContent, "daily_plan", { date: selectedDateStr }).catch(() => {});
      }}
    />
    <InsufficientCreditsDialog
      open={showInsufficientDialog}
      onOpenChange={dismissDialog}
      {...insufficientProps}
    />
    <EmailSendConfirmDialog
      open={showEmailDialog}
      onOpenChange={setShowEmailDialog}
      suggestion={emailSuggestion}
    />
    {/* 撤销浮层：上次修改后可一键回退到旧版本 */}
    <AnimatePresence>
      {undoSnapshot && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white shadow-2xl backdrop-blur-xl border border-white/10">
            <span className="text-xs text-slate-300">
              已{undoSnapshot.label}
            </span>
            <button
              onClick={handleUndo}
              disabled={isUndoing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {isUndoing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
              撤销
            </button>
            <button
              onClick={() => setUndoSnapshot(null)}
              className="text-slate-400 hover:text-white text-xs px-1"
              title="关闭"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}