import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { get, post, patch } from "@/utils/api";
import { getToken, isDemoMode } from "@/utils/auth";
import { ensureDemoSession } from "@/utils/demo";
import SharePoster from "@/components/SharePoster";
import ShareButton from "@/components/ShareButton";
import { useShare } from "@/hooks/useShare";
import Composer from "@/components/tasks/Composer";
import PromiseCard from "@/components/tasks/PromiseCard";
import CheckinCard from "@/components/tasks/CheckinCard";
import { MILESTONE_QUOTES } from "@/components/tasks/checkinMeta";
import { SnoozeSheet, ExecPreview } from "@/components/tasks/Sheets";
import EvolutionRail, { computeEvolution } from "@/components/tasks/EvolutionRail";
import DailyReviewSheet from "@/components/tasks/DailyReviewSheet";
import theme from "@/components/tasks/theme";
import { generateCheckinCover } from "@/lib/shareCover";

function AiBadge({ text = "AI 生成" }) {
  return (
    <View
      style={{
        padding: "2rpx 10rpx",
        borderRadius: "8rpx",
        background: "rgba(91,130,160,0.10)",
        border: "1rpx solid rgba(91,130,160,0.20)"
      }}
    >
      <Text style={{ fontSize: "18rpx", color: theme.water, fontWeight: 500 }}>{text}</Text>
    </View>
  );
}

const groups = [
  { key: "now", zh: "现在能做" },
  { key: "due", zh: "即将截止" },
  { key: "suggested", zh: "哨兵建议" },
  { key: "fixed", zh: "固定安排" },
];

const categoryMap = {
  work: "工作",
  personal: "个人",
  health: "健康",
  study: "学习",
  family: "家庭",
  shopping: "购物",
  finance: "财务",
  other: "其他",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "凌晨好";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

const dateLabel = new Date().toLocaleDateString("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

function isTaskDone(task) {
  return task.status === "completed" || task.status === "done" || task.status === "archived";
}

function mergeAnalysis(_task, raw) {
  if (!raw) return {};
  // 完全信任后端的 aiNote；后端未返回时留空，不显示通用兜底
  return { ...raw };
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [subtaskMap, setSubtaskMap] = useState({});
  const [analysisMap, setAnalysisMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [snoozeTask, setSnoozeTask] = useState(null);
  const [reviewTask, setReviewTask] = useState(null);
  const [posterTask, setPosterTask] = useState(null);
  const [posterToken, setPosterToken] = useState("");
  const [toast, setToast] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [showDailyReview, setShowDailyReview] = useState(false);
  // 本会话内刚盖章完成的约定 id：卡片先暂留列表显示「已盖章」样式（不移除节点，滚动位置不跳回页眉），
  // 短暂延迟后收起并归档出列表
  const [sessionDoneIds, setSessionDoneIds] = useState(() => new Set());
  const [collapsingIds, setCollapsingIds] = useState(() => new Set()); // 正在收起动画的盖章卡片
  const collapseTimersRef = useRef({}); // task.id -> [timeout...]，取消完成时撤销收起计划
  const [svScrollTop, setSvScrollTop] = useState(0); // 滚动守护：归档移除后恢复位置，不跳回页眉
  const svTopRef = useRef(0);
  const lastCompleteAtRef = useRef(0); // 最近盖章时间，AI 分析到位重渲染后也补一次恢复

  // 记录约定页 ScrollView 当前滚动位置
  const captureSvScroll = () => {
    Taro.createSelectorQuery()
      .select("#taskScroll")
      .fields({ scrollOffset: true })
      .exec((res) => {
        svTopRef.current = res?.[0]?.scrollTop || 0;
      });
  };

  // 恢复滚动位置：优先 enhanced 节点 scrollTo（命令式直改）；兜底受控 scroll-top 错位触发
  const restoreSvScroll = (top) => {
    if (!(top > 10)) return;
    Taro.createSelectorQuery()
      .select("#taskScroll")
      .node()
      .exec((res) => {
        const node = res?.[0]?.node;
        if (node && typeof node.scrollTo === "function") {
          try {
            node.scrollTo({ top, duration: 0 });
            return;
          } catch (_e) {}
        }
        setSvScrollTop(top + 1);
        setTimeout(() => setSvScrollTop(top), 100);
      });
  };

  const toastTimerRef = useRef(null);
  // 一键转发：预取约定的公开分享 token（生成接口幂等），转发给朋友无需登录即可查看
  const shareTokensRef = useRef({});
  const sharePendingRef = useRef(new Set());
  // 打卡约定的累计次数：卡片展示 + 微信转发卡片标题「已赴约 N 次」
  const [checkinMetaMap, setCheckinMetaMap] = useState({});
  const checkinTotalsRef = useRef({});
  const checkinFetchedRef = useRef(new Set());
  // 打卡约定的转发封面图（imageUrl）：数据到位后预生成缓存，分享时同步取用
  const shareCoversRef = useRef({});

  useShare({
    title: "心栈约定 · 和自己的一个约定",
    path: "pages/tasks/index",
    buildShare: (options) => {
      if (options.from !== "button") return {};
      const taskId = options.target?.dataset?.taskId;
      if (!taskId) return {};
      const task = tasks.find((t) => t.id === taskId);
      const token = shareTokensRef.current[taskId];
      const path = token ? `pages/share/index?token=${token}` : `pages/task-detail/index?id=${taskId}`;
      // 打卡约定：转发卡片标题 + 品牌蓝封面图直接呈现打卡情况
      if (task?.category === "checkin") {
        const total = checkinTotalsRef.current[taskId] ?? 0;
        const t = String(task.title || "打卡约定").trim();
        const subs = subtaskMap[taskId] || [];
        const subDone = subs.filter((s) => s.status === "completed" || s.status === "done").length;
        const parts = [];
        if (task.done_today) parts.push("今日已打卡");
        parts.push(`累计赴约 ${total} 次`);
        if (subs.length > 0) parts.push(`子约定 ${subDone}/${subs.length}`);
        return {
          title: `打卡约定「${t.slice(0, 12)}」：${parts.join(" · ")}`.slice(0, 60),
          path,
          imageUrl: shareCoversRef.current[taskId]?.path || undefined,
        };
      }
      return { title: `约定 · ${String(task?.title || "和自己的一个约定").trim().slice(0, 18)}`, path };
    }
  });

  useEffect(() => {
    if (isGuest) return;
    tasks.slice(0, 30).forEach((t) => {
      if (shareTokensRef.current[t.id] !== undefined || sharePendingRef.current.has(t.id)) return;
      sharePendingRef.current.add(t.id);
      post(`/public/share/generate/task/${t.id}`)
        .then((s) => { shareTokensRef.current[t.id] = (s && s.token) || ""; })
        .catch(() => { shareTokensRef.current[t.id] = ""; })
        .finally(() => sharePendingRef.current.delete(t.id));
    });
    // 打卡约定：预取累计次数（卡片展示 + 转发标题），失败静默不影响卡片
    tasks.filter((t) => t.category === "checkin").slice(0, 20).forEach((t) => {
      if (checkinFetchedRef.current.has(t.id)) return;
      checkinFetchedRef.current.add(t.id);
      get(`/tasks/${t.id}/checkins`, { limit: 1 })
        .then((d) => {
          const meta = { total: d?.total ?? 0, first_at: d?.first_at || null };
          checkinTotalsRef.current[t.id] = meta.total;
          setCheckinMetaMap((prev) => ({ ...prev, [t.id]: meta }));
        })
        .catch(() => { checkinFetchedRef.current.delete(t.id); });
    });
  }, [tasks, isGuest]);

  // 打卡约定的转发封面图：次数/今日状态/子约定变化时重新生成，按 key 去重
  useEffect(() => {
    if (isGuest) return;
    Object.entries(checkinMetaMap).forEach(([taskId, meta]) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const subs = subtaskMap[taskId] || [];
      const key = `${meta.total}-${Boolean(task.done_today)}-${subs.length}-${subs.filter((s) => s.status === "completed" || s.status === "done").length}`;
      if (shareCoversRef.current[taskId]?.key === key) return;
      shareCoversRef.current[taskId] = { key, path: "" };
      generateCheckinCover({
        title: task.title,
        total: meta.total,
        firstAt: meta.first_at,
        subtasks: subs,
        doneToday: Boolean(task.done_today),
        quote: MILESTONE_QUOTES[meta.total] || "每一次都算数。",
      }).then((path) => {
        if (shareCoversRef.current[taskId]) shareCoversRef.current[taskId].path = path;
      });
    });
  }, [checkinMetaMap, tasks, subtaskMap, isGuest]);

  const showToast = (msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 一次拉全量约定+子约定（parent_task_id=all），避免每条约定单独请求的 N+1 开销
      const [allData, execData] = await Promise.all([
        get("/tasks", { parent_task_id: "all", sort: "-created_date", limit: 300 }),
        get("/task-executions", { limit: 100 }),
      ]);
      const all = Array.isArray(allData) ? allData : [];
      const execList = Array.isArray(execData) ? execData : [];

      const topTasks = all.filter((t) => !t.parent_task_id);
      const subMap = {};
      all.forEach((t) => {
        if (!t.parent_task_id) return;
        if (!subMap[t.parent_task_id]) subMap[t.parent_task_id] = [];
        subMap[t.parent_task_id].push(t);
      });

      setTasks(topTasks);
      setSessionDoneIds(new Set()); // 以服务端数据为准：本会话盖章的约定正式归档出列表
      setExecutions(execList);
      setSubtaskMap(subMap);

      // AI 分析（每条约定一次 Kimi 调用）不阻塞渲染：约定列表先展示，分析结果到了再更新分组/建议
      // 共有约定跳过：分析结果在共享行上天然同步，避免成员重复消耗 AI 点数
      const analyzableTasks = topTasks.filter((t) => t.shared_role !== "member");
      if (analyzableTasks.length > 0) {
        post("/functions/analyzeTasks", { tasks: analyzableTasks, executions: execList, subtasks: subMap })
          .then((analysisResult) => {
            setAnalysisMap(isPlainObject(analysisResult) ? analysisResult : {});
          })
          .catch(() => {});
      }
    } catch (err) {
      setTasks([]);
      setExecutions([]);
      setSubtaskMap({});
      setAnalysisMap({});
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    (async () => {
      await ensureDemoSession();
      const guest = !getToken() || isDemoMode();
      setIsGuest(guest);
      if (getToken()) fetchData();
      else setLoading(false);
    })();
  });

  // 约定详情页改了子约定后发事件，这里定向刷新对应卡片的子约定，保证回到列表时数据同步
  useEffect(() => {
    const handler = ({ taskId } = {}) => {
      if (!taskId) {
        fetchData();
        return;
      }
      get("/tasks", { parent_task_id: taskId, limit: 200 })
        .then((subs) => {
          setSubtaskMap((prev) => ({ ...prev, [taskId]: Array.isArray(subs) ? subs : [] }));
        })
        .catch(() => {});
    };
    Taro.eventCenter.on("task:subtasks-changed", handler);
    return () => {
      Taro.eventCenter.off("task:subtasks-changed", handler);
    };
  }, [fetchData]);

  // AI 分析到位会触发整页重渲染，也可能把 ScrollView 滚动位置重置回页眉；
  // 盖章后不久（5s 内）到位时补一次恢复
  useEffect(() => {
    if (Date.now() - lastCompleteAtRef.current < 5000) {
      restoreSvScroll(svTopRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisMap]);

  const grouped = useMemo(() => {
    return groups.map((g) => ({
      ...g,
      items: tasks.filter((t) => {
        // 本会话刚盖章的暂留原位显示盖章样式；服务端已完成的（非本会话）归档不显示
        if (isTaskDone(t) && !sessionDoneIds.has(t.id)) return false;
        const analysis = analysisMap[t.id] || {};
        return (analysis.group || "suggested") === g.key;
      }),
    }));
  }, [tasks, analysisMap, sessionDoneIds]);

  const doneItems = useMemo(() => tasks.filter((t) => isTaskDone(t)), [tasks]);
  const pendingItems = useMemo(() => tasks.filter((t) => !isTaskDone(t)), [tasks]);

  const evo = useMemo(() => computeEvolution(tasks, executions), [tasks, executions]);

  const handleComplete = (task) => {
    // 重复约定：打卡/取消打卡只切换"今天已完成"，卡片保留在列表，系列继续
    const recurring = task.repeat_rule && task.repeat_rule !== "none";
    if (recurring) {
      const marking = !task.done_today;
      const prevDone = Boolean(task.done_today);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done_today: marking } : t)));
      showToast(marking ? "已盖章 · 今天已完成" : "已取消完成");
      patch(`/tasks/${task.id}`, { status: marking ? "completed" : "pending" }).catch(() => {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done_today: prevDone } : t)));
        showToast("网络开小差了，请再试一次");
      });
      return;
    }

    const markingDone = !isTaskDone(task);
    const prevStatus = task.status; // 网络失败回滚用
    const nextStatus = markingDone ? "completed" : "pending";
    captureSvScroll(); // 记录当前滚动位置，归档移除后分次恢复，不跳回页眉
    lastCompleteAtRef.current = Date.now();
    // 就地标记完成/还原（卡片保留，切换盖章样式）：不触发整页刷新、不移除节点，页面不跳动
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    setSessionDoneIds((prev) => {
      const next = new Set(prev);
      if (markingDone) next.add(task.id);
      else next.delete(task.id);
      return next;
    });
    // 盖章后延迟收起并归档出列表：先展示约 1s 盖章样式，再收起（节点占位归 0），最后移除。
    // 移除时列表高度已不变，滚动位置不会跳回页眉；取消完成可撤销收起计划
    const timers = collapseTimersRef.current[task.id] || [];
    timers.forEach(clearTimeout);
    if (markingDone) {
      collapseTimersRef.current[task.id] = [
        setTimeout(() => {
          setCollapsingIds((prev) => new Set(prev).add(task.id));
        }, 1100),
        setTimeout(() => {
          collapseTimersRef.current[task.id] = [];
          setCollapsingIds((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
          setSessionDoneIds((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
          setTasks((prev) => {
            const target = prev.find((t) => t.id === task.id);
            // 期间被取消了完成或已不存在，则不移除
            if (!target || !isTaskDone(target)) return prev;
            return prev.filter((t) => t.id !== task.id);
          });
          // 归档移除（及随后的重渲染）可能触发微信 ScrollView 重置滚动位置，分次恢复兜底
          [80, 400, 900].forEach((delay) => {
            setTimeout(() => restoreSvScroll(svTopRef.current), delay);
          });
        }, 1700),
      ];
    } else {
      delete collapseTimersRef.current[task.id];
      setCollapsingIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }

    showToast(markingDone ? "已盖章 · 如约而至" : "已取消完成");
    patch(`/tasks/${task.id}`, { status: nextStatus }).catch(() => {
      // 失败回滚：还原状态与盖章标记
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: prevStatus } : t)));
      setSessionDoneIds((prev) => {
        const next = new Set(prev);
        if (markingDone) next.delete(task.id);
        else next.add(task.id);
        return next;
      });
      showToast("网络开小差了，请再试一次");
    });
  };

  const handleSubtaskToggle = async (sub) => {
    const nextStatus = isTaskDone(sub) ? "pending" : "completed";
    try {
      await patch(`/tasks/${sub.id}`, { status: nextStatus });
      setSubtaskMap((prev) => {
        const next = { ...prev };
        const list = next[sub.parent_task_id] || [];
        next[sub.parent_task_id] = list.map((s) => (s.id === sub.id ? { ...s, status: nextStatus } : s));
        return next;
      });
    } catch (err) {
      // handled globally
    }
  };

  // 打卡约定：点 👣 = 一次赴约（服务端记录打卡并把排期滚到下一期，done_today 置真）
  const handleCheckin = async (task) => {
    try {
      const res = await post(`/tasks/${task.id}/checkins`, {});
      const total = res?.total ?? 0;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done_today: true } : t)));
      setCheckinMetaMap((prev) => ({
        ...prev,
        [task.id]: { total, first_at: res?.first_at || prev[task.id]?.first_at || null },
      }));
      checkinTotalsRef.current[task.id] = total;
      showToast(MILESTONE_QUOTES[total] ? `第 ${total} 次赴约 · ${MILESTONE_QUOTES[total]}` : `第 ${total} 次赴约`);
    } catch (err) {
      // handled globally
    }
  };

  // 从属子约定树：逐级展开成带 depth 的扁平列表（打卡卡片按层级缩进渲染、每级都可勾选）
  const buildSubTree = (taskId) => {
    const walk = (pid, depth) => (subtaskMap[pid] || []).flatMap((s) => [{ ...s, depth }, ...walk(s.id, depth + 1)]);
    return walk(taskId, 0);
  };

  const handleCheckinDoneToday = (task) => {
    showToast("今日已赴约 · 点卡片可查看打卡记录");
    Taro.navigateTo({ url: `/pages/task-detail/index?id=${task.id}` });
  };

  const handleSnoozeConfirm = async (_task, payload) => {
    try {
      await patch(`/tasks/${_task.id}`, {
        reminder_time: payload.reminder_time,
        snooze_until: payload.snooze_until,
        snooze_reason: payload.reason,
        status: "snoozed"
      });
      setSnoozeTask(null);
      const recurringSnooze = _task?.repeat_rule && _task.repeat_rule !== "none";
      showToast(recurringSnooze
        ? `已顺延这一次到${payload.when} · 下一次提醒照常`
        : `已顺延到${payload.when} · 「${payload.reason}」记入记忆`);
      fetchData();
    } catch (err) {
      // handled globally
    }
  };

  const handleApprove = async (task) => {
    try {
      const autoExec = analysisMap[task.id]?.autoExec;
      if (autoExec?.executionId) {
        // 验收执行单产物：服务端会同步把关联约定标为完成
        await patch(`/task-executions/${autoExec.executionId}`, {
          execution_status: "completed",
          user_feedback: { rating: 5, comment: "验收通过", rated_at: new Date().toISOString() },
        });
        showToast("已验收，约定已完成");
      } else {
        await patch(`/tasks/${task.id}`, { status: "completed" });
        showToast("已验收 · 交给心栈执行，结果会回流到约定");
      }
      setReviewTask(null);
      fetchData();
    } catch (err) {
      // handled globally
    }
  };

  // 有问题：只写反馈，不传 execution_status，约定保持待处理，执行单仍待验收
  const handleFeedback = async (task) => {
    try {
      const executionId = analysisMap[task.id]?.autoExec?.executionId;
      if (!executionId) {
        showToast("未找到执行单，无法记录反馈");
        return;
      }
      await patch(`/task-executions/${executionId}`, {
        user_feedback: { rating: 2, comment: "用户标记有问题", rated_at: new Date().toISOString() },
      });
      setReviewTask(null);
      showToast("已记录反馈，约定保留待处理");
      fetchData();
    } catch (err) {
      // handled globally
    }
  };

  // 让心栈先执行：手动委托智能执行，返回跳过原因时提示用户
  const handleDelegate = async (task) => {
    try {
      const res = await post("/functions/delegateTaskAutomation", { task_id: task.id });
      const data = isPlainObject(res) ? res : {};
      if (data.status === "started" || data.status === "existing") {
        showToast("心栈开始执行，完成后可验收");
        fetchData();
      } else {
        showToast(data.reason || "未识别到可自动执行的内容");
      }
    } catch (err) {
      // handled globally
    }
  };

  // 批准执行（待批准的执行单，如旧的邮件草稿）：跑 execute 阶段生成产物
  const handleExecRun = async (task, autoExec) => {
    try {
      if (!autoExec?.executionId) {
        showToast("未找到执行单");
        return;
      }
      await post("/functions/executeAutomation", { execution_id: autoExec.executionId, phase: "execute" });
      showToast("已开始执行，完成后可验收");
      fetchData();
    } catch (err) {
      // handled globally
    }
  };

  const handleShare = async (task) => {
    try {
      const share = await post(`/public/share/generate/task/${task.id}`);
      setPosterTask(task);
      setPosterToken(share.token || "");
    } catch (err) {
      Taro.showToast({ title: "分享生成失败", icon: "none" });
    }
  };

  const closePoster = () => {
    setPosterTask(null);
    setPosterToken("");
  };

  return (
    <View className="ss-page" style={{ background: theme.paper, minHeight: "100vh", padding: "24rpx", boxSizing: "border-box" }}>
      <ScrollView id="taskScroll" scrollY enhanced scrollTop={svScrollTop} style={{ height: "calc(100vh - 48rpx)" }}>
        {/* header */}
        <View
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "16rpx",
            paddingBottom: "24rpx",
            borderBottom: `1rpx solid ${theme.border}`,
          }}
        >
          <View style={{ display: "flex", alignItems: "baseline", gap: "16rpx" }}>
            <Text style={{ fontSize: "44rpx", fontWeight: 900, color: theme.primary, letterSpacing: "4rpx" }}>心栈</Text>
            <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, letterSpacing: "6rpx" }}>SOULSENTRY</Text>
          </View>
          <View style={{ display: "flex", alignItems: "center", gap: "20rpx" }}>
            <View style={{ display: "flex", alignItems: "center", gap: "8rpx" }}>
              <View style={{ width: "12rpx", height: "12rpx", borderRadius: "50%", background: theme.seal }} />
              <Text style={{ fontSize: "20rpx", color: theme.inkSecondary }}>哨兵守护中 · 一切安好</Text>
            </View>
            <Text style={{ fontSize: "20rpx", color: theme.inkTertiary }}>AI 点数 1,240</Text>
          </View>
        </View>

        {/* guest banner */}
        {isGuest && (
          <View
            onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}
            style={{
              marginTop: "24rpx",
              padding: "18rpx 24rpx",
              borderRadius: "12rpx",
              background: "#fff8e6",
              border: "1rpx solid #f5d78e",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <Text style={{ fontSize: "26rpx", color: "#8a6d3b" }}>游客模式 · 登录后管理你的约定</Text>
            <Text style={{ fontSize: "24rpx", color: theme.primary, fontWeight: 500 }}>去登录 →</Text>
          </View>
        )}

        {/* greeting + composer */}
        <View style={{ paddingTop: "40rpx" }}>
          <View>
            <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, letterSpacing: "4rpx" }}>{dateLabel}</Text>
          </View>
          <View style={{ marginTop: "16rpx" }}>
            <Text style={{ fontSize: "52rpx", fontWeight: 700, color: theme.primary, lineHeight: "72rpx" }}>
              {greeting()}。
            </Text>
          </View>
          <View style={{ marginTop: "24rpx" }}>
            <Text
              style={{
                fontSize: "40rpx",
                fontWeight: 500,
                color: theme.inkSecondary,
                lineHeight: "56rpx"
              }}
            >
              你的点滴，都是最重要的事。
            </Text>
          </View>

          <View
            style={{
              marginTop: "40rpx",
              padding: "28rpx",
              borderRadius: "16rpx",
              background: theme.card,
              border: `1rpx solid ${theme.border}`
            }}
          >
            <Composer isGuest={isGuest} />
          </View>
        </View>

        {/* groups */}
        <View style={{ marginTop: "48rpx" }}>
          <View
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12rpx",
              marginBottom: "24rpx"
            }}
          >
            <View style={{ width: "8rpx", height: "28rpx", background: theme.primary, borderRadius: "4rpx" }} />
            <Text style={{ fontSize: "32rpx", fontWeight: 700, color: theme.primary }}>我的约定</Text>
            <Text style={{ fontSize: "22rpx", color: theme.inkTertiary }}>{pendingItems.length} 个进行中</Text>
            <View style={{ flex: 1, height: "1rpx", background: theme.border }} />
          </View>

          {grouped.map((g) => (
            <View key={g.key} style={{ marginBottom: "48rpx" }}>
              <View style={{ display: "flex", alignItems: "baseline", gap: "16rpx", marginBottom: "24rpx", flexWrap: "wrap" }}>
                <Text style={{ fontSize: "34rpx", fontWeight: 700, color: theme.primary }}>{g.zh}</Text>
                {g.key === "suggested" && <AiBadge />}
                <Text style={{ fontSize: "22rpx", color: theme.inkTertiary }}>
                  {g.items.length}
                </Text>
                <View style={{ flex: 1, height: "1rpx", background: theme.border }} />
              </View>

              {g.items.length === 0 ? (
                <View
                  style={{
                    border: `1rpx dashed ${theme.border}`,
                    padding: "28rpx",
                    borderRadius: "8rpx",
                  }}
                >
                  <Text style={{ fontSize: "26rpx", color: theme.inkTertiary }}>暂无</Text>
                </View>
              ) : (
                <View style={{ position: "relative", paddingLeft: "20rpx" }}>
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "12rpx",
                      bottom: "12rpx",
                      width: 0,
                      borderLeft: `1rpx dashed ${theme.border}`,
                    }}
                  />
                  {g.items.map((task, i) => (
                    <View
                      key={task.id}
                      className={`promise-card-slot${collapsingIds.has(task.id) ? " collapsing" : ""}`}
                    >
                      {task.category === "checkin" ? (
                        <CheckinCard
                          task={task}
                          analysis={mergeAnalysis(task, analysisMap[task.id])}
                          subtasks={subtaskMap[task.id] || []}
                          subtaskTree={buildSubTree(task.id)}
                          checkinMeta={checkinMetaMap[task.id]}
                          onCheckin={handleCheckin}
                          onCheckinDoneToday={handleCheckinDoneToday}
                          onSnooze={setSnoozeTask}
                          onSubtaskToggle={handleSubtaskToggle}
                        />
                      ) : (
                        <PromiseCard
                          task={task}
                          analysis={mergeAnalysis(task, analysisMap[task.id])}
                          subtasks={subtaskMap[task.id] || []}
                          index={i}
                          onComplete={handleComplete}
                          onSnooze={setSnoozeTask}
                          onReview={setReviewTask}
                          onDelegate={handleDelegate}
                          onExecRun={handleExecRun}
                          onSubtaskToggle={handleSubtaskToggle}
                          onShare={handleShare}
                        />
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}

          {/* archive line */}
          {doneItems.length > 0 && (
            <View style={{ marginBottom: "40rpx" }}>
              <Text
                style={{
                  textAlign: "center",
                  fontSize: "20rpx",
                  color: theme.inkQuaternary,
                  letterSpacing: "4rpx",
                }}
              >
                —— 已完成的约定会盖印归档，成为你的兑现记录 ——
              </Text>
            </View>
          )}
        </View>

        {/* evolution rail */}
        <EvolutionRail
          evo={evo}
          onReview={() => setShowDailyReview(true)}
        />

        {/* 今日复盘 */}
        <DailyReviewSheet
          visible={showDailyReview}
          onClose={() => setShowDailyReview(false)}
          tasks={tasks}
          onSaved={fetchData}
        />

        {/* footer brand line */}
        <View style={{ padding: "48rpx 0" }}>
          <Text
            style={{
              textAlign: "center",
              fontSize: "20rpx",
              color: theme.inkQuaternary,
              letterSpacing: "6rpx",
            }}
          >
            坚定守护 · 适时轻唤 · 心栈 SOULSENTRY
          </Text>
        </View>

        <View
          style={{
            margin: "0 0 24rpx",
            padding: "18rpx 22rpx",
            borderRadius: "14rpx",
            background: "rgba(91,130,160,0.06)",
            border: "1rpx solid rgba(91,130,160,0.12)",
            display: "flex",
            alignItems: "center"
          }}
        >
          <View
            style={{
              width: "28rpx",
              height: "28rpx",
              borderRadius: "50%",
              background: theme.water,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "14rpx",
              flexShrink: 0
            }}
          >
            <Text style={{ fontSize: "16rpx", color: "#fff", fontWeight: 600 }}>AI</Text>
          </View>
          <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, lineHeight: "38rpx" }}>
            部分内容由 AI 生成，仅供参考。重要决策请结合自身判断。
          </Text>
        </View>

        <View style={{ height: "160rpx" }} />
      </ScrollView>

      {/* sheets */}
      {snoozeTask && (
        <SnoozeSheet task={snoozeTask} onClose={() => setSnoozeTask(null)} onConfirm={handleSnoozeConfirm} />
      )}
      {reviewTask && analysisMap[reviewTask.id]?.autoExec && (
        <ExecPreview
          task={reviewTask}
          analysis={mergeAnalysis(reviewTask, analysisMap[reviewTask.id])}
          onClose={() => setReviewTask(null)}
          onApprove={handleApprove}
          onFeedback={handleFeedback}
          onExecRun={handleExecRun}
        />
      )}

      {/* toast */}
      {toast && (
        <View
          style={{
            position: "fixed",
            bottom: "48rpx",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            background: theme.ink,
            padding: "16rpx 32rpx",
            borderRadius: "8rpx",
          }}
        >
          <Text style={{ fontSize: "26rpx", color: theme.paper }}>{toast}</Text>
        </View>
      )}

      {/* share poster（普通约定的分享海报；打卡约定走直接转发 + 封面图） */}
      <SharePoster
        visible={Boolean(posterTask)}
        onClose={closePoster}
        type="task"
        title={posterTask?.title}
        description={posterTask?.description}
        extra={posterTask?.end_time ? `截止时间：${formatDateTime(posterTask.end_time)}` : ""}
        subtasks={subtaskMap[posterTask?.id] || []}
        shareToken={posterToken}
        canvasId="taskShareCanvas"
      />
    </View>
  );
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
