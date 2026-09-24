import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { get, post, patch } from "@/utils/api";
import { getToken, isDemoMode } from "@/utils/auth";
import { ensureDemoSession } from "@/utils/demo";
import SharePoster from "@/components/SharePoster";
import Composer from "@/components/tasks/Composer";
import PromiseCard from "@/components/tasks/PromiseCard";
import { SnoozeSheet, ExecPreview } from "@/components/tasks/Sheets";
import EvolutionRail, { computeEvolution } from "@/components/tasks/EvolutionRail";
import DailyReviewSheet from "@/components/tasks/DailyReviewSheet";
import theme from "@/components/tasks/theme";

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
      post("/functions/analyzeTasks", { tasks: topTasks, executions: execList, subtasks: subMap })
        .then((analysisResult) => {
          setAnalysisMap(isPlainObject(analysisResult) ? analysisResult : {});
        })
        .catch(() => {});
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

  const handleSnoozeConfirm = async (_task, payload) => {
    try {
      await patch(`/tasks/${_task.id}`, {
        end_time: payload.end_time,
        reminder_time: payload.reminder_time,
      });
      setSnoozeTask(null);
      showToast(`已顺延到${payload.when} · 「${payload.reason}」记入记忆`);
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

      {/* share poster */}
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
