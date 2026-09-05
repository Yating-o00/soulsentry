import { useState, useEffect, useMemo, useCallback } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, ScrollView, Canvas } from "@tarojs/components";
import useAuth from "@/hooks/useAuth";
import { getToken, clearToken } from "@/utils/auth";
import { get, patch } from "@/utils/api";
import theme from "@/components/tasks/theme";

const BADGE_TEMPLATES = [
  { key: "morning", label: "晨型人", icon: "☀", color: "#d97706", condition: (data) => data.morningTasks >= 3 },
  { key: "night", label: "夜行者", icon: "☾", color: "#5b82a0", condition: (data) => data.nightTasks >= 3 },
  { key: "selflove", label: "自爱心", icon: "♡", color: "#c97b8a", condition: (data) => data.selfCareNotes >= 3 },
  { key: "persistent", label: "坚持者", icon: "✓", color: "#6e8a73", condition: (data) => data.activeStreak >= 3 },
  { key: "organizer", label: "整理师", icon: "☰", color: "#384877", condition: (data) => data.completedTasks >= 5 },
  { key: "dreamcatcher", label: "灵感捕手", icon: "✦", color: "#d97706", condition: (data) => data.inspirationNotes >= 3 },
  { key: "observer", label: "情绪观察家", icon: "◉", color: "#c97b8a", condition: (data) => data.emotionNotes >= 5 },
  { key: "collector", label: "知识收藏家", icon: "◈", color: "#5b82a0", condition: (data) => data.materialNotes >= 3 },
  { key: "sharer", label: "分享者", icon: "⇧", color: "#6e8a73", condition: (data) => data.shareNotes >= 2 },
  { key: "doer", label: "行动派", icon: "➤", color: "#384877", condition: (data) => data.completionRate >= 0.6 && data.totalTasks >= 5 }
];

const BADGE_FALLBACKS = [
  { key: "wanderer", label: "漫游者", icon: "◎", color: theme.inkQuaternary },
  { key: "seed", label: "萌芽者", icon: "✦", color: theme.inkQuaternary },
  { key: "listener", label: "倾听者", icon: "♫", color: theme.inkQuaternary },
  { key: "recorder", label: "记录者", icon: "✎", color: theme.inkQuaternary },
  { key: "curious", label: "好奇者", icon: "?", color: theme.inkQuaternary }
];

const PLATFORMS = [
  { key: "web_oversea", label: "海外版", sub: "https://www.xinzhan-soulsentry.com", url: "https://www.xinzhan-soulsentry.com" },
  { key: "web_cn", label: "国内版", sub: "https://www.xinzhan-soulsentry.cn", url: "https://www.xinzhan-soulsentry.cn" },
  { key: "miniprogram", label: "小程序", sub: "搜索「转眼科技」" }
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDateLabel(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function toYmd(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function lastNDays(n) {
  const list = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    list.push({ date: d, label: formatDateLabel(d), ymd: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` });
  }
  return list;
}

function isSameDay(iso, ymd) {
  return toYmd(iso) === ymd;
}

function computeMoodSeries(notes, tasks, executions, days) {
  const daysMeta = lastNDays(days);
  const positiveWords = /开心|高兴|满足|幸福|暖|安心|踏实|治愈|感动|希望|轻松|顺利|完成|达成|谢谢|感恩|喜欢|享受|平静|宁静/i;
  const negativeWords = /难过|焦虑|烦|累|委屈|害怕|孤独|失落|压力|想哭|崩溃|怀疑|失眠|沮丧|愤怒|内耗|emo|挫败|不安|迷茫|无助/i;

  const series = daysMeta.map(({ ymd, label }) => {
    let score = 5;
    const dayNotes = notes.filter((n) => isSameDay(n.created_date, ymd));
    const dayTasksCreated = tasks.filter((t) => isSameDay(t.created_date, ymd));
    const dayTasksCompleted = tasks.filter((t) => t.completed_at && isSameDay(t.completed_at, ymd));
    const dayOverdue = tasks.filter((t) => {
      if (!t.end_time || ["completed", "done", "archived"].includes(t.status)) return false;
      return toYmd(t.end_time) < ymd;
    });
    const dayExec = (executions || []).filter((e) => isSameDay(e.created_date || e.executed_at, ymd));

    score += dayNotes.length * 0.4;
    score += dayTasksCreated.length * 0.25;
    score += dayTasksCompleted.length * 0.9;
    score += dayExec.length * 0.5;
    score -= dayOverdue.length * 1.2;

    dayNotes.forEach((n) => {
      const text = `${n.plain_text || n.content || ""} ${JSON.stringify(n.metadata || {})}`;
      if (positiveWords.test(text)) score += 1.1;
      if (negativeWords.test(text)) score -= 1.1;
    });

    score = Math.max(1, Math.min(10, score));
    return { ymd, label, score: Number(score.toFixed(1)) };
  });

  const scores = series.map((d) => d.score);
  const allSame = scores.every((s) => s === scores[0]);
  if (allSame && scores[0] === 5 && (notes.length || tasks.length || executions.length)) {
    return series.map((d, i) => ({
      ...d,
      score: Number((5 + Math.sin((i / Math.max(1, series.length - 1)) * Math.PI) * 0.5).toFixed(1))
    }));
  }

  return series;
}

function generateInsight(series, notes, tasks) {
  if (!series.length) return "开始记录吧，心栈会陪你看见自己的流动。";
  const avg = series.reduce((s, d) => s + d.score, 0) / series.length;
  const latest = series[series.length - 1]?.score || avg;
  const trend = latest - series[0].score;
  const emotionNotes = notes.filter((n) => n.source_type === "emotion" || n.metadata?.ai_analysis?.category === "情绪").length;
  const completedTasks = tasks.filter((t) => ["completed", "done", "archived"].includes(t.status)).length;

  let insight = "";
  if (trend > 1.2) insight = "近期流动呈上升趋势，你的状态在回暖。";
  else if (trend < -1.2) insight = "近期流动有些波动，给自己多一点耐心。";
  else insight = "近期流动相对平稳，这是扎实前行的节奏。";

  if (emotionNotes >= 3) insight += ` 你已经记录了 ${emotionNotes} 次情绪，觉察本身就是一种照顾。`;
  if (completedTasks >= 3) insight += ` 还有 ${completedTasks} 个约定已被兑现，每一步都算数。`;

  return insight;
}

function generateBadges(notes, tasks, executions) {
  const emotionNotes = notes.filter((n) => n.source_type === "emotion" || n.metadata?.ai_analysis?.category === "情绪").length;
  const inspirationNotes = notes.filter((n) => n.source_type === "inspiration" || n.metadata?.ai_analysis?.category === "灵感").length;
  const materialNotes = notes.filter((n) => n.source_type === "material" || n.metadata?.ai_analysis?.category === "资料").length;
  const shareNotes = notes.filter((n) => n.source_type === "share" || n.metadata?.ai_analysis?.category === "分享").length;
  const completedTasks = tasks.filter((t) => ["completed", "done", "archived"].includes(t.status)).length;
  const totalTasks = tasks.length;
  const morningTasks = tasks.filter((t) => {
    const h = new Date(t.reminder_time || t.end_time || t.created_date).getHours();
    return h >= 5 && h < 10;
  }).length;
  const nightTasks = tasks.filter((t) => {
    const h = new Date(t.reminder_time || t.end_time || t.created_date).getHours();
    return h >= 21 || h < 2;
  }).length;

  const ymds = new Set();
  [...notes, ...tasks, ...(executions || [])].forEach((item) => {
    const iso = item.created_date || item.executed_at || item.completed_at;
    if (iso) ymds.add(toYmd(iso));
  });
  const sorted = Array.from(ymds).sort();
  let activeStreak = 0;
  let currentStreak = 0;
  const today = toYmd(new Date());
  if (sorted.includes(today)) currentStreak = 1;

  const selfCareNotes = notes.filter((n) => {
    const text = n.plain_text || n.content || "";
    return /睡觉|休息|冥想|运动|跑步|吃饭|喝水|散步|放松|照顾自己|对自己好/i.test(text);
  }).length;

  const data = {
    emotionNotes,
    inspirationNotes,
    materialNotes,
    shareNotes,
    completedTasks,
    totalTasks,
    completionRate: totalTasks > 0 ? completedTasks / totalTasks : 0,
    morningTasks,
    nightTasks,
    selfCareNotes,
    activeStreak: Math.max(currentStreak, sorted.length > 0 ? 1 : 0)
  };

  const unlocked = BADGE_TEMPLATES.filter((b) => b.condition(data)).map((b) => ({ ...b, locked: false }));
  const lockedCount = Math.max(0, 10 - unlocked.length);
  const locked = BADGE_TEMPLATES.filter((b) => !b.condition(data)).slice(0, lockedCount).map((b) => ({ ...b, locked: true }));
  const all = [...unlocked, ...locked];

  if (all.length < 10) {
    const need = 10 - all.length;
    const extras = BADGE_FALLBACKS.slice(0, need).map((b) => ({ ...b, locked: true }));
    all.push(...extras);
  }

  return all.slice(0, 10);
}

function computeMoodPoints(series, width, height) {
  if (!series.length) return [];
  const maxScore = 10;
  const minScore = 0;
  const stepX = width / (series.length - 1 || 1);
  return series.map((d, i) => {
    const x = i * stepX;
    const y = height - ((d.score - minScore) / (maxScore - minScore)) * (height - 20) - 10;
    return { x, y, score: d.score };
  });
}

function drawMoodCurve(ctx, points, width, height, color) {
  if (!points.length) return;

  // Fill gradient
  ctx.save();
  ctx.beginPath();
  if (points.length === 1) {
    ctx.moveTo(0, points[0].y);
    ctx.lineTo(width, points[0].y);
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.x + (curr.x - prev.x) / 2;
      const cpy1 = prev.y;
      const cpx2 = prev.x + (curr.x - prev.x) / 2;
      const cpy2 = curr.y;
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, curr.x, curr.y);
    }
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `${color}1F`); // 12% alpha
  gradient.addColorStop(1, `${color}00`); // 0% alpha
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  // Line
  ctx.save();
  ctx.beginPath();
  if (points.length === 1) {
    ctx.moveTo(0, points[0].y);
    ctx.lineTo(width, points[0].y);
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.x + (curr.x - prev.x) / 2;
      const cpy1 = prev.y;
      const cpx2 = prev.x + (curr.x - prev.x) / 2;
      const cpy2 = curr.y;
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, curr.x, curr.y);
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();

  // Dots
  ctx.save();
  points.forEach((p, idx) => {
    const isLast = idx === points.length - 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isLast ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = isLast ? color : "#fff";
    ctx.fill();
    if (!isLast) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  });
  ctx.restore();
}

function showDemoToast() {
  Taro.showModal({
    title: "Demo 账号体验中",
    content: "当前为游客模式，数据不会保存。登录后即可拥有你的心栈专属空间。",
    confirmText: "去登录",
    cancelText: "先逛逛",
    success: (res) => {
      if (res.confirm) Taro.navigateTo({ url: "/pages/login/index" });
    }
  });
}

export default function Account() {
  const { user, logout, loading } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [demoShown, setDemoShown] = useState(false);
  const [period, setPeriod] = useState(14);
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [moodData, setMoodData] = useState(null);
  const [canvasFailed, setCanvasFailed] = useState(false);

  const loadData = useCallback(async () => {
    if (!getToken()) return;
    setDataLoading(true);
    try {
      const [notesRes, tasksRes, execRes, notiRes] = await Promise.allSettled([
        get("/notes", { sort: "-created_date", limit: 200 }, { silent: true }),
        get("/tasks", { parent_task_id: "", sort: "-created_date", limit: 200 }, { silent: true }),
        get("/task-executions", { limit: 200 }, { silent: true }),
        get("/notifications", { limit: 50 }, { silent: true })
      ]);
      setNotes(notesRes.status === "fulfilled" && Array.isArray(notesRes.value) ? notesRes.value : []);
      setTasks(tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value) ? tasksRes.value : []);
      setExecutions(execRes.status === "fulfilled" && Array.isArray(execRes.value) ? execRes.value : []);
      setNotifications(notiRes.status === "fulfilled" && Array.isArray(notiRes.value) ? notiRes.value : []);
    } catch (err) {
      console.error("account loadData failed", err);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const loadMoodRiver = useCallback(async (p) => {
    if (!getToken()) return;
    setMoodData(null);
    try {
      const res = await post("/functions/moodRiver", { period: p }, { silent: true });
      if (res && Array.isArray(res.series) && res.series.length > 0) {
        setMoodData({ series: res.series, insight: res.insight || "" });
      } else {
        setMoodData(null);
      }
    } catch (err) {
      console.error("loadMoodRiver failed", err);
      setMoodData(null);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadMoodRiver(period);
  }, [period, loadMoodRiver]);

  useEffect(() => {
    if (!getToken() && !demoShown) {
      setDemoShown(true);
      setTimeout(() => showDemoToast(), 400);
    }
  }, [demoShown]);

  useEffect(() => {
    if (!series.length) return;
    setCanvasFailed(false);

    let attempts = 0;
    const maxAttempts = 10;
    const tryDraw = () => {
      attempts += 1;
      const query = Taro.createSelectorQuery();
      query
        .select("#moodCanvas")
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            if (attempts < maxAttempts) {
              setTimeout(tryDraw, 100);
            } else {
              setCanvasFailed(true);
            }
            return;
          }
          const canvas = res[0].node;
          const { width, height } = res[0];
          if (!width || !height) {
            if (attempts < maxAttempts) {
              setTimeout(tryDraw, 100);
            } else {
              setCanvasFailed(true);
            }
            return;
          }
          const dpr = Taro.getSystemInfoSync().pixelRatio || 1;
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            if (attempts < maxAttempts) {
              setTimeout(tryDraw, 100);
            } else {
              setCanvasFailed(true);
            }
            return;
          }
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, width, height);
          const points = computeMoodPoints(series, width, height);
          drawMoodCurve(ctx, points, width, height, theme.primary);
        });
    };

    // 延迟一帧，确保 Canvas 已完成布局
    const timer = setTimeout(tryDraw, 50);
    return () => clearTimeout(timer);
  }, [series]);

  const localSeries = useMemo(() => computeMoodSeries(notes, tasks, executions, period), [notes, tasks, executions, period]);
  const localInsight = useMemo(() => generateInsight(localSeries, notes, tasks), [localSeries, notes, tasks]);
  const series = moodData?.series || localSeries;
  const insight = moodData?.insight || localInsight;
  const errorHint = moodData?.errorHint || "";
  const rawSource = moodData?.source || "local";
  const moodSourceLabel = {
    ai: "AI 生成",
    "local-empty": "本地规则",
    local: "本地规则",
    "local-fallback": "本地规则",
    "local-no-key": "未配 AI Key",
    "local-timeout": "AI 超时",
    "local-parse-error": "AI 解析失败"
  }[rawSource] || "本地规则";
  const moodSourceColor = rawSource === "ai" ? theme.sage : theme.inkQuaternary;
  const hasRealData = notes.length > 0 || tasks.length > 0 || executions.length > 0;
  const isMoodEmpty = !hasRealData;
  const badges = useMemo(() => generateBadges(notes, tasks, executions), [notes, tasks, executions]);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const markRead = async (id) => {
    try {
      await patch(`/notifications/${id}`, { is_read: true }, { silent: true });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await Promise.all(notifications.filter((n) => !n.is_read).map((n) => patch(`/notifications/${n.id}`, { is_read: true }, { silent: true })));
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  if (loading) {
    return (
      <View style={{ minHeight: "100vh", background: theme.paper, padding: "120rpx 40rpx", textAlign: "center" }}>
        <Text style={{ fontSize: "28rpx", color: theme.inkTertiary }}>加载中...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ minHeight: "100vh", background: theme.paper, padding: "80rpx 40rpx" }}>
        <View style={{ textAlign: "center", marginBottom: "80rpx" }}>
          <View
            style={{
              width: "128rpx",
              height: "128rpx",
              margin: "0 auto 32rpx",
              borderRadius: "64rpx",
              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.water} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 8rpx 24rpx ${theme.primary}33`
            }}
          >
            <Text style={{ fontSize: "52rpx", color: "#fff", fontWeight: 300, letterSpacing: "4rpx" }}>栈</Text>
          </View>
          <Text style={{ fontSize: "36rpx", fontWeight: 600, color: theme.ink, marginBottom: "16rpx" }}>游客模式</Text>
          <Text style={{ fontSize: "28rpx", color: theme.inkTertiary, lineHeight: "48rpx" }}>这是 Demo 账号体验版</Text>
          <Text style={{ fontSize: "26rpx", color: theme.inkQuaternary, lineHeight: "44rpx" }}>登录后即可保存你的心签、约定与成长数据</Text>
        </View>

        <Button
          className="ss-btn"
          style={{ width: "100%", marginBottom: "24rpx" }}
          onClick={() => Taro.navigateTo({ url: "/pages/login/index" })}
        >
          登录 / 注册
        </Button>
        <Button
          className="ss-btn ss-btn-plain"
          style={{ width: "100%" }}
          onClick={() => Taro.switchTab({ url: "/pages/flow/index" })}
        >
          先逛逛
        </Button>
      </View>
    );
  }

  const displayName = user.display_name || user.full_name || "我";
  const initials = displayName.charAt(0);
  const days = 128;
  const completionRate = tasks.length ? Math.round((tasks.filter((t) => ["completed", "done", "archived"].includes(t.status)).length / tasks.length) * 100) : 0;
  const focusHours = Math.round((executions || []).length * 0.5) || 42;
  const moodScore = series.length ? (series.reduce((s, d) => s + d.score, 0) / series.length).toFixed(1) : "7.2";
  const labels = lastNDays(period).filter((_, i) => i % Math.ceil(period / 5) === 0 || i === period - 1).map((d) => d.label);

  const handleLogout = () => {
    clearToken();
    setShowLogoutConfirm(false);
    Taro.reLaunch({ url: "/pages/index/index" });
  };

  return (
    <View style={{ minHeight: "100vh", background: theme.paper }}>
      <ScrollView scrollY style={{ height: "100vh" }}>
        <View style={{ padding: "40rpx 32rpx 160rpx" }}>
          {/* header */}
          <View
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "40rpx"
            }}
          >
            <View style={{ display: "flex", alignItems: "center", gap: "12rpx" }}>
              <View
                style={{
                  width: "48rpx",
                  height: "48rpx",
                  borderRadius: "12rpx",
                  background: theme.primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Text style={{ fontSize: "24rpx", color: "#fff" }}>♡</Text>
              </View>
              <View>
                <Text style={{ fontSize: "28rpx", fontWeight: 600, color: theme.ink }}>心栈</Text>
              </View>
            </View>
            <View
              onClick={() => setShowNotifications(true)}
              style={{
                width: "64rpx",
                height: "64rpx",
                borderRadius: "16rpx",
                background: theme.paper,
                border: `1rpx solid ${theme.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative"
              }}
            >
              <View style={{ position: "relative", width: "28rpx", height: "28rpx", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <View
                  style={{
                    width: "22rpx",
                    height: "20rpx",
                    borderRadius: "12rpx 12rpx 4rpx 4rpx",
                    border: `2rpx solid ${theme.inkSecondary}`,
                    borderBottomWidth: 0,
                    background: "transparent"
                  }}
                />
                <View
                  style={{
                    position: "absolute",
                    bottom: "0rpx",
                    left: "50%",
                    width: "6rpx",
                    height: "6rpx",
                    marginLeft: "-3rpx",
                    borderRadius: "50%",
                    background: theme.inkSecondary
                  }}
                />
                {unreadCount > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: "-6rpx",
                      right: "-6rpx",
                      minWidth: "18rpx",
                      height: "18rpx",
                      borderRadius: "9rpx",
                      background: theme.seal,
                      padding: "0 4rpx",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Text style={{ fontSize: "16rpx", color: "#fff" }}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* account card */}
          <View style={{ display: "flex", alignItems: "center", gap: "24rpx", marginBottom: "32rpx" }}>
            <View
              style={{
                width: "112rpx",
                height: "112rpx",
                borderRadius: "56rpx",
                background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.waterLight} 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 6rpx 20rpx ${theme.primary}33`,
                border: `2rpx solid rgba(255,255,255,0.25)`
              }}
            >
              <Text style={{ fontSize: "48rpx", color: "#fff", fontWeight: 300 }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ display: "flex", alignItems: "center", gap: "12rpx", marginBottom: "6rpx" }}>
                <Text style={{ fontSize: "36rpx", fontWeight: 600, color: theme.ink }}>{displayName}</Text>
                <View
                  style={{
                    padding: "2rpx 10rpx",
                    borderRadius: "6rpx",
                    background: theme.primary
                  }}
                >
                  <Text style={{ fontSize: "18rpx", color: "#fff", fontWeight: 500 }}>PRO</Text>
                </View>
              </View>
              <Text style={{ fontSize: "24rpx", color: theme.inkTertiary }}>
                与心栈相伴的第 <Text style={{ color: theme.inkSecondary, fontWeight: 500 }}>{days}</Text> 天
              </Text>
            </View>
          </View>

          {/* stats grid */}
          <View
            style={{
              display: "flex",
              borderRadius: "18rpx",
              overflow: "hidden",
              background: theme.card,
              border: `1rpx solid ${theme.border}`,
              marginBottom: "48rpx"
            }}
          >
            {[
              { value: completionRate, unit: "%", label: "日程完成率" },
              { value: focusHours, unit: "h", label: "专注时长" },
              { value: moodScore, unit: "/10", label: "平均心境" }
            ].map((s, idx) => (
              <View
                key={s.label}
                style={{
                  flex: 1,
                  padding: "32rpx 0",
                  textAlign: "center",
                  borderRight: idx < 2 ? `1rpx solid ${theme.border}` : "none"
                }}
              >
                <Text style={{ fontSize: "40rpx", fontWeight: 600, color: theme.ink }}>
                  {s.value}
                  <Text style={{ fontSize: "24rpx", color: theme.inkQuaternary, fontWeight: 400 }}>{s.unit}</Text>
                </Text>
                <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, marginTop: "6rpx" }}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* mood river */}
          <View style={{ marginBottom: "48rpx" }}>
            <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20rpx" }}>
              <View>
                <View style={{ display: "flex", alignItems: "center", gap: "12rpx" }}>
                  <Text style={{ fontSize: "30rpx", fontWeight: 600, color: theme.ink }}>近期流动</Text>
                  {!isMoodEmpty && (
                    <View
                      style={{
                        padding: "2rpx 10rpx",
                        borderRadius: "6rpx",
                        background: rawSource === "ai" ? `${theme.sage}18` : theme.paper,
                        border: `1rpx solid ${rawSource === "ai" ? theme.sage : theme.border}`
                      }}
                    >
                      <Text style={{ fontSize: "18rpx", color: moodSourceColor }}>
                        {moodSourceLabel}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, marginTop: "4rpx" }}>由你的心签、约定与执行记录汇聚而成</Text>
              </View>
              <View style={{ display: "flex", gap: "8rpx" }}>
                {[14, 30].map((p) => (
                  <View
                    key={p}
                    onClick={() => setPeriod(p)}
                    style={{
                      padding: "6rpx 14rpx",
                      borderRadius: "8rpx",
                      background: period === p ? theme.primary : theme.paper,
                      border: `1rpx solid ${period === p ? theme.primary : theme.border}`
                    }}
                  >
                    <Text style={{ fontSize: "20rpx", color: period === p ? "#fff" : theme.inkQuaternary }}>{p}天</Text>
                  </View>
                ))}
              </View>
            </View>
            <View
              style={{
                height: "200rpx",
                background: theme.card,
                borderRadius: "18rpx",
                border: `1rpx solid ${theme.border}`,
                padding: "20rpx"
              }}
            >
              {dataLoading || !series.length ? (
                <View style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: "26rpx", color: theme.inkTertiary }}>
                    {!series.length ? "暂无数据" : "河流汇聚中…"}
                  </Text>
                </View>
              ) : isMoodEmpty ? (
                <View style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <View
                    style={{
                      width: "96rpx",
                      height: "4rpx",
                      borderRadius: "2rpx",
                      background: theme.border,
                      marginBottom: "16rpx"
                    }}
                  />
                  <Text style={{ fontSize: "26rpx", color: theme.inkTertiary, marginBottom: "8rpx" }}>还没有足够的数据</Text>
                  <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary }}>记录心签或完成约定后，河流会在这里出现</Text>
                </View>
              ) : (
                <View style={{ width: "100%", height: "100%", position: "relative" }}>
                  <Canvas type="2d" id="moodCanvas" style={{ width: "100%", height: "100%", opacity: canvasFailed ? 0 : 1 }} />
                  {canvasFailed && (
                    <View style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingVertical: "10rpx" }}>
                      {series.map((d, i) => {
                        const h = Math.max(4, ((d.score || 5) / 10) * 100);
                        return (
                          <View
                            key={d.date || i}
                            style={{
                              flex: 1,
                              marginHorizontal: "2rpx",
                              height: `${h}%`,
                              borderRadius: "4rpx",
                              background: i === series.length - 1 ? theme.primary : `${theme.primary}66`,
                              minWidth: "4rpx"
                            }}
                          />
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
            <View style={{ display: "flex", justifyContent: "space-between", marginTop: "10rpx", padding: "0 8rpx" }}>
              {labels.map((l) => (
                <Text key={l} style={{ fontSize: "20rpx", color: theme.inkQuaternary }}>
                  {l}
                </Text>
              ))}
            </View>
            <View
              style={{
                marginTop: "20rpx",
                padding: "20rpx",
                borderRadius: "14rpx",
                background: theme.paper,
                border: `1rpx solid ${theme.border}`
              }}
            >
              <Text style={{ fontSize: "26rpx", color: theme.inkSecondary, lineHeight: "44rpx" }}>{insight}</Text>
              {errorHint && rawSource !== "ai" && rawSource !== "local-empty" && (
                <Text style={{ fontSize: "20rpx", color: theme.inkQuaternary, marginTop: "10rpx" }}>
                  诊断：{errorHint}
                </Text>
              )}
            </View>
          </View>

          {/* platforms */}
          <View style={{ marginBottom: "48rpx" }}>
            <Text style={{ fontSize: "30rpx", fontWeight: 600, color: theme.ink, marginBottom: "4rpx" }}>多方位沉淀</Text>
            <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, marginBottom: "20rpx" }}>数据可在多平台同步查看</Text>
            <View
              style={{
                background: theme.card,
                borderRadius: "18rpx",
                border: `1rpx solid ${theme.border}`,
                overflow: "hidden"
              }}
            >
              {PLATFORMS.map((p, idx) => (
                <View
                  key={p.key}
                  onClick={() => {
                    if (p.url) Taro.setClipboardData({ data: p.url });
                    else Taro.showToast({ title: "搜索「转眼科技」", icon: "none" });
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "20rpx",
                    padding: "28rpx 24rpx",
                    borderBottom: idx < PLATFORMS.length - 1 ? `1rpx solid ${theme.border}` : "none"
                  }}
                >
                  <View
                    style={{
                      width: "56rpx",
                      height: "56rpx",
                      borderRadius: "14rpx",
                      background: theme.primary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    <Text style={{ fontSize: "28rpx", color: "#fff" }}>⎋</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: "28rpx", color: theme.ink, fontWeight: 500 }}>{p.label}</Text>
                    <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, marginTop: "2rpx" }}>{p.sub}</Text>
                  </View>
                  <Text style={{ fontSize: "28rpx", color: theme.inkQuaternary }}>→</Text>
                </View>
              ))}
            </View>
          </View>

          {/* badges */}
          <View style={{ marginBottom: "48rpx" }}>
            <Text style={{ fontSize: "30rpx", fontWeight: 600, color: theme.ink, marginBottom: "4rpx" }}>心灵成就</Text>
            <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, marginBottom: "20rpx" }}>AI 根据你的数据生成的正能量人格</Text>
            <View style={{ display: "flex", flexWrap: "wrap", gap: "24rpx" }}>
              {badges.map((b) => (
                <View key={b.key} style={{ textAlign: "center", width: "104rpx" }}>
                  <View
                    style={{
                      width: "88rpx",
                      height: "88rpx",
                      margin: "0 auto 12rpx",
                      borderRadius: "20rpx",
                      background: b.locked ? theme.paper : `${b.color}18`,
                      border: `1rpx solid ${b.locked ? theme.border : b.color}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Text style={{ fontSize: "40rpx", color: b.locked ? theme.inkQuaternary : b.color }}>{b.icon}</Text>
                  </View>
                  <Text style={{ fontSize: "22rpx", color: b.locked ? theme.inkQuaternary : theme.inkTertiary }}>
                    {b.locked ? "未解锁" : b.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* account actions */}
          <View>
            <Text style={{ fontSize: "30rpx", fontWeight: 600, color: theme.ink, marginBottom: "20rpx" }}>账户操作</Text>
            <View
              style={{
                background: theme.card,
                borderRadius: "18rpx",
                border: `1rpx solid ${theme.border}`,
                overflow: "hidden"
              }}
            >
              <View
                onClick={() => Taro.showToast({ title: "切换账户功能即将上线", icon: "none" })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "20rpx",
                  padding: "28rpx 24rpx",
                  borderBottom: `1rpx solid ${theme.border}`
                }}
              >
                <Text style={{ fontSize: "32rpx", color: theme.inkQuaternary }}>⇄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: "28rpx", color: theme.ink, fontWeight: 500 }}>切换账户</Text>
                  <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, marginTop: "2rpx" }}>在当前设备上登录其他账户</Text>
                </View>
                <Text style={{ fontSize: "28rpx", color: theme.inkQuaternary }}>›</Text>
              </View>
              <View
                onClick={() => setShowLogoutConfirm(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "20rpx",
                  padding: "28rpx 24rpx"
                }}
              >
                <Text style={{ fontSize: "32rpx", color: theme.seal }}>⎋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: "28rpx", color: theme.ink, fontWeight: 500 }}>退出账户</Text>
                  <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, marginTop: "2rpx" }}>安全退出当前登录状态</Text>
                </View>
                <Text style={{ fontSize: "28rpx", color: theme.inkQuaternary }}>›</Text>
              </View>
            </View>
          </View>

          <View style={{ textAlign: "center", padding: "48rpx 0 20rpx" }}>
            <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, letterSpacing: "2rpx" }}>
              SoulSentry 心栈 · 观照自己，觉察当下
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* notification panel */}
      {showNotifications && (
        <View
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end"
          }}
          onClick={() => setShowNotifications(false)}
        >
          <View
            onClick={(e) => e.stopPropagation()}
            style={{
              maxHeight: "70vh",
              background: theme.card,
              borderRadius: "28rpx 28rpx 0 0",
              padding: "32rpx 28rpx 48rpx",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24rpx" }}>
              <Text style={{ fontSize: "34rpx", fontWeight: 600, color: theme.ink }}>通知</Text>
              <View style={{ display: "flex", alignItems: "center", gap: "20rpx" }}>
                {unreadCount > 0 && (
                  <Text onClick={markAllRead} style={{ fontSize: "24rpx", color: theme.primary }}>
                    全部已读
                  </Text>
                )}
                <Text onClick={() => setShowNotifications(false)} style={{ fontSize: "30rpx", color: theme.inkQuaternary, padding: "8rpx" }}>
                  ✕
                </Text>
              </View>
            </View>
            <ScrollView scrollY style={{ maxHeight: "52vh" }}>
              {notifications.length === 0 ? (
                <View style={{ textAlign: "center", padding: "60rpx 20rpx" }}>
                  <Text style={{ fontSize: "28rpx", color: theme.inkTertiary }}>暂无通知</Text>
                </View>
              ) : (
                notifications.map((n) => (
                  <View
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    style={{
                      padding: "24rpx 20rpx",
                      borderBottom: `1rpx solid ${theme.border}`,
                      background: n.is_read ? theme.card : theme.paper
                    }}
                  >
                    <View style={{ display: "flex", alignItems: "center", gap: "12rpx", marginBottom: "8rpx" }}>
                      {!n.is_read && <View style={{ width: "12rpx", height: "12rpx", borderRadius: "50%", background: theme.seal }} />}
                      <Text style={{ fontSize: "28rpx", fontWeight: 500, color: theme.ink }}>{n.title}</Text>
                    </View>
                    <Text style={{ fontSize: "24rpx", color: theme.inkTertiary, lineHeight: "40rpx" }}>{n.content}</Text>
                    <Text style={{ fontSize: "20rpx", color: theme.inkQuaternary, marginTop: "8rpx" }}>
                      {new Date(n.created_date).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* logout confirm modal */}
      {showLogoutConfirm && (
        <View
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40rpx"
          }}
          onClick={() => setShowLogoutConfirm(false)}
        >
          <View
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "560rpx",
              background: theme.card,
              borderRadius: "24rpx",
              padding: "40rpx"
            }}
          >
            <Text style={{ fontSize: "34rpx", fontWeight: 600, color: theme.ink, textAlign: "center", marginBottom: "16rpx" }}>
              确认退出账户？
            </Text>
            <Text style={{ fontSize: "26rpx", color: theme.inkTertiary, textAlign: "center", marginBottom: "40rpx" }}>
              退出后需要重新登录才能访问你的心栈数据
            </Text>
            <View style={{ display: "flex", gap: "20rpx" }}>
              <Button
                size="mini"
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1,
                  height: "80rpx",
                  lineHeight: "80rpx",
                  background: theme.paper,
                  color: theme.inkSecondary,
                  borderRadius: "12rpx",
                  fontSize: "28rpx",
                  margin: 0,
                  border: `1rpx solid ${theme.border}`
                }}
              >
                取消
              </Button>
              <Button
                size="mini"
                onClick={handleLogout}
                style={{
                  flex: 1,
                  height: "80rpx",
                  lineHeight: "80rpx",
                  background: theme.primary,
                  color: "#fff",
                  borderRadius: "12rpx",
                  fontSize: "28rpx",
                  margin: 0
                }}
              >
                确认退出
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
