import { useState, useEffect } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button, ScrollView } from "@tarojs/components";
import useAuth from "@/hooks/useAuth";
import { getToken, clearToken } from "@/utils/auth";
import theme from "@/components/tasks/theme";

const BADGES = [
  { key: "morning", label: "晨型人", icon: "☀", locked: false },
  { key: "selflove", label: "自爱心", icon: "♡", locked: false },
  { key: "persistent", label: "坚持者", icon: "✓", locked: false },
  { key: "night", label: "夜行者", icon: "☾", locked: true }
];

const PLATFORMS = [
  { key: "web_oversea", label: "海外版 Web", sub: "xinzhan-soulsentry.com", url: "https://www.xinzhan-soulsentry.com" },
  { key: "web_cn", label: "国内版 Web", sub: "xinzhan-soulsentry.cn", url: "https://www.xinzhan-soulsentry.cn" },
  { key: "miniprogram", label: "微信小程序", sub: "搜索「转眼科技" }
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDateLabel(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function lastNDays(n) {
  const list = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    list.push(formatDateLabel(d));
  }
  return list;
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

  useEffect(() => {
    if (!getToken() && !demoShown) {
      setDemoShown(true);
      setTimeout(() => showDemoToast(), 400);
    }
  }, [demoShown]);

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
              width: "120rpx",
              height: "120rpx",
              margin: "0 auto 32rpx",
              borderRadius: "24rpx",
              background: theme.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Text style={{ fontSize: "56rpx", color: "#fff" }}>♡</Text>
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
  const days = 128; // TODO: replace with real data
  const completionRate = 86;
  const focusHours = 42;
  const moodScore = 7.2;
  const labels = lastNDays(6);

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
              style={{
                width: "64rpx",
                height: "64rpx",
                borderRadius: "16rpx",
                background: theme.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Text style={{ fontSize: "32rpx", color: "#fff" }}>{initials}</Text>
            </View>
          </View>

          {/* account card */}
          <View style={{ display: "flex", alignItems: "center", gap: "24rpx", marginBottom: "32rpx" }}>
            <View
              style={{
                width: "112rpx",
                height: "112rpx",
                borderRadius: "24rpx",
                background: theme.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Text style={{ fontSize: "56rpx", color: "#fff" }}>{initials}</Text>
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
                <Text style={{ fontSize: "30rpx", fontWeight: 600, color: theme.ink }}>心境河流</Text>
                <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, marginTop: "4rpx" }}>过去14天的情绪波动</Text>
              </View>
              <View style={{ display: "flex", gap: "8rpx" }}>
                <View style={{ padding: "6rpx 14rpx", borderRadius: "8rpx", background: theme.primary }}>
                  <Text style={{ fontSize: "20rpx", color: "#fff" }}>14天</Text>
                </View>
                <View style={{ padding: "6rpx 14rpx", borderRadius: "8rpx", background: theme.paper, border: `1rpx solid ${theme.border}` }}>
                  <Text style={{ fontSize: "20rpx", color: theme.inkQuaternary }}>30天</Text>
                </View>
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
              <svg viewBox="0 0 640 180" style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.primary} stopOpacity="0.12" />
                    <stop offset="100%" stopColor={theme.primary} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,140 Q32,122 64,130 T128,106 T192,114 T256,88 T320,96 T384,68 T448,76 T512,56 T576,64 T640,52"
                  fill="none"
                  stroke={theme.primary}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M0,140 Q32,122 64,130 T128,106 T192,114 T256,88 T320,96 T384,68 T448,76 T512,56 T576,64 T640,52 L640,180 L0,180 Z"
                  fill="url(#moodGrad)"
                />
              </svg>
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
              <Text style={{ fontSize: "26rpx", color: theme.inkSecondary, lineHeight: "44rpx" }}>
                觉察提示：你的情绪在周末呈现明显上升趋势，建议保持当前的晨间冥想习惯。连续3天的心境评分超过7分。
              </Text>
            </View>
          </View>

          {/* platforms */}
          <View style={{ marginBottom: "48rpx" }}>
            <Text style={{ fontSize: "30rpx", fontWeight: 600, color: theme.ink, marginBottom: "4rpx" }}>多平台入口</Text>
            <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, marginBottom: "20rpx" }}>随时随地，与心栈相连</Text>
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
            <Text style={{ fontSize: "30rpx", fontWeight: 600, color: theme.ink, marginBottom: "20rpx" }}>心灵成就</Text>
            <View style={{ display: "flex", gap: "32rpx" }}>
              {BADGES.map((b) => (
                <View key={b.key} style={{ textAlign: "center" }}>
                  <View
                    style={{
                      width: "88rpx",
                      height: "88rpx",
                      margin: "0 auto 12rpx",
                      borderRadius: "20rpx",
                      background: b.locked ? theme.paper : theme.primaryMist,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Text style={{ fontSize: "40rpx", color: b.locked ? theme.inkQuaternary : theme.primary }}>{b.icon}</Text>
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
