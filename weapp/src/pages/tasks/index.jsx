import { useState, useMemo, useCallback } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView } from "@tarojs/components";
import { get, post, patch } from "@/utils/api";
import { getToken } from "@/utils/auth";
import SharePoster from "@/components/SharePoster";
import Composer from "@/components/tasks/Composer";
import PromiseCard from "@/components/tasks/PromiseCard";
import { SnoozeSheet, ExecPreview } from "@/components/tasks/Sheets";
import EvolutionRail, { computeEvolution } from "@/components/tasks/EvolutionRail";
import theme from "@/components/tasks/theme";

const groups = [
  { key: "now", zh: "现在能做", en: "NOW", hint: "长期计划里当下可推进的" },
  { key: "due", zh: "即将截止", en: "DUE", hint: "24 小时内到期或已逾期" },
  { key: "suggested", zh: "哨兵建议", en: "SUGGESTED", hint: "AI 已选好最佳时机" },
  { key: "fixed", zh: "固定安排", en: "FIXED", hint: "周期与长期约定" },
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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, execData] = await Promise.all([
        get("/tasks", { parent_task_id: "", sort: "-created_date", limit: 200 }),
        get("/task-executions", { limit: 100 }),
      ]);
      const topTasks = Array.isArray(taskData) ? taskData : [];
      const execList = Array.isArray(execData) ? execData : [];

      const subResults = await Promise.all(
        topTasks.map((t) => get("/tasks", { parent_task_id: t.id, limit: 200 }).catch(() => []))
      );
      const subMap = {};
      topTasks.forEach((t, i) => {
        subMap[t.id] = Array.isArray(subResults[i]) ? subResults[i] : [];
      });

      const analysisPayload = {
        tasks: topTasks,
        executions: execList,
        subtasks: subMap,
      };
      const analysisResult = await post("/functions/analyzeTasks", analysisPayload).catch(() => ({}));

      setTasks(topTasks);
      setExecutions(execList);
      setSubtaskMap(subMap);
      setAnalysisMap(isPlainObject(analysisResult) ? analysisResult : {});
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
    const guest = !getToken();
    setIsGuest(guest);
    if (!guest) fetchData();
  });

  const grouped = useMemo(() => {
    return groups.map((g) => ({
      ...g,
      items: tasks.filter((t) => {
        if (isTaskDone(t)) return false;
        const analysis = analysisMap[t.id] || {};
        return (analysis.group || "suggested") === g.key;
      }),
    }));
  }, [tasks, analysisMap]);

  const doneItems = useMemo(() => tasks.filter((t) => isTaskDone(t)), [tasks]);
  const pendingItems = useMemo(() => tasks.filter((t) => !isTaskDone(t)), [tasks]);

  const evo = useMemo(() => computeEvolution(tasks, executions), [tasks, executions]);

  const handleComplete = async (task) => {
    const nextStatus = isTaskDone(task) ? "pending" : "completed";
    try {
      await patch(`/tasks/${task.id}`, { status: nextStatus });
      showToast(nextStatus === "completed" ? "已盖章 · 如约而至" : "已取消完成");
      fetchData();
    } catch (err) {
      // handled globally
    }
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
      await patch(`/tasks/${task.id}`, { status: "completed" });
      setReviewTask(null);
      showToast("已验收 · 交给心栈执行，结果会回流到约定");
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
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
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
              <View style={{ display: "flex", alignItems: "baseline", gap: "16rpx", marginBottom: "24rpx" }}>
                <Text style={{ fontSize: "20rpx", color: theme.inkQuaternary, letterSpacing: "8rpx" }}>{g.en}</Text>
                <Text style={{ fontSize: "34rpx", fontWeight: 700, color: theme.primary }}>{g.zh}</Text>
                <Text style={{ fontSize: "22rpx", color: theme.inkTertiary }}>
                  {g.items.length} 个约定 · {g.hint}
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
                  <Text style={{ fontSize: "26rpx", color: theme.inkTertiary }}>暂无 —— 有约定到达这个阶段时会出现在这里</Text>
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
                    <PromiseCard
                      key={task.id}
                      task={task}
                      analysis={mergeAnalysis(task, analysisMap[task.id])}
                      subtasks={subtaskMap[task.id] || []}
                      index={i}
                      onComplete={handleComplete}
                      onSnooze={setSnoozeTask}
                      onReview={setReviewTask}
                      onSubtaskToggle={handleSubtaskToggle}
                      onShare={handleShare}
                    />
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
          onReview={() => showToast("晚间复盘功能即将上线")}
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
