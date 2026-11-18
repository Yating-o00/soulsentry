// 协同约定邀请落地页（小程序端）：与 Web InviteLanding 同一邀请码。
// 关键约束：接受邀请必须落在「本人的小程序账号」上——未登录/体验(demo)会话时先引导登录，
// 否则邀请会绑到共用的体验账号，接受后在自己的约定列表里看不到（本页正是为修复该问题而建）。
import { useState } from "react";
import Taro, { useLoad, useDidShow } from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { get, post } from "@/utils/api";
import { getToken, isDemoMode } from "@/utils/auth";
import { useShare } from "@/hooks/useShare";

const SCENARIO_LABELS = { couple: "情侣约定", friends: "朋友约定", colleagues: "同事约定", custom: "协同约定" };

export default function InviteLanding() {
  const [code, setCode] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [responding, setResponding] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  useShare({
    title: "心栈协同约定邀请",
    path: "pages/index/index",
    buildShare: () => (code ? { title: `邀请你加入协同约定「${String(data?.pact?.title || "").slice(0, 16)}」`, path: `pages/invite/index?code=${code}` } : {}),
  });

  const load = async (c) => {
    const d = await get(`/invite/${c}`, {}, { silent: true }).catch(() => null);
    if (d?.invite) {
      setData(d);
      setError("");
      setAccepted(Boolean(d.viewer?.is_member) && d.invite.status === "accepted");
    } else {
      setError("邀请不存在或已失效");
    }
  };

  useLoad((params) => {
    const c = String(params?.code || "");
    setCode(c);
    if (c) load(c);
    else setError("邀请链接缺少参数");
  });

  // 登录回跳后刷新：viewer.is_member 由后端按当前登录态返回
  useDidShow(() => {
    if (code) load(code);
    setNeedLogin(!getToken() || isDemoMode());
  });

  const gotoLogin = () => {
    Taro.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(`/pages/invite/index?code=${code}`)}` });
  };

  const respond = async () => {
    if (responding || !code) return;
    if (!getToken() || isDemoMode()) {
      Taro.showModal({
        title: "需登录",
        content: "请登录你自己的心栈账号后再接受。",
        confirmText: "去登录",
        success: (r) => { if (r.confirm) gotoLogin(); },
      });
      return;
    }
    setResponding(true);
    try {
      await post(`/invite/${code}/respond`, { action: "accept" });
      setAccepted(true);
      Taro.showToast({ title: "已接受邀请", icon: "success" });
    } catch (_err) {
      // handled globally
    } finally {
      setResponding(false);
    }
  };

  const gotoTasks = () => {
    Taro.switchTab({ url: "/pages/tasks/index" });
  };

  if (error) {
    return (
      <View className="ss-page">
        <View className="ss-empty">{error}</View>
      </View>
    );
  }
  if (!data) {
    return (
      <View className="ss-page">
        <View className="ss-empty">正在打开邀请…</View>
      </View>
    );
  }

  const { invite, pact, summary, todos = [], progressing = [], next_node: nextNode } = data;

  return (
    <View className="ss-page">
      <View style={{ padding: "24rpx" }}>
        {/* 约定概览 */}
        <View className="ss-card">
          <View style={{ background: "#384877", borderRadius: "6rpx", padding: "4rpx 14rpx", alignSelf: "flex-start", marginBottom: "16rpx" }}>
            <Text style={{ fontSize: "20rpx", color: "#fff" }}>{SCENARIO_LABELS[pact?.scenario] || "协同约定"}</Text>
          </View>
          <View className="ss-title" style={{ marginBottom: "8rpx" }}>{pact?.title}</View>
          {pact?.goal ? (
            <Text style={{ display: "block", fontSize: "26rpx", color: "#666", lineHeight: "40rpx" }}>{pact.goal}</Text>
          ) : null}
          <Text style={{ display: "block", marginTop: "16rpx", fontSize: "22rpx", color: "#9ca0a8" }}>
            {pact?.member_count || 1} 人
          </Text>
          {invite?.note ? (
            <Text style={{ display: "block", marginTop: "16rpx", fontSize: "26rpx", color: "#333", lineHeight: "40rpx" }}>
              {invite.note}
            </Text>
          ) : null}
        </View>

        {/* 邀请概况 */}
        {summary ? (
          <View className="ss-card">
            <View className="ss-section-title" style={{ marginTop: 0 }}>邀请概况</View>
            <Text style={{ display: "block", fontSize: "26rpx", color: "#57534d", lineHeight: "42rpx" }}>{summary}</Text>
          </View>
        ) : null}

        {/* 推进中 */}
        {(progressing.length > 0 || nextNode) && (
          <View className="ss-card">
            <View className="ss-section-title" style={{ marginTop: 0 }}>进展</View>
            {progressing.map((p) => (
              <Text key={p.id} style={{ display: "block", fontSize: "26rpx", color: "#333", lineHeight: "44rpx" }}>· {p.title}</Text>
            ))}
            {nextNode ? (
              <Text style={{ display: "block", marginTop: "12rpx", fontSize: "22rpx", color: "#384877" }}>下一节点：{nextNode.title}</Text>
            ) : null}
          </View>
        )}

        {/* 与我有关的待办 */}
        <View className="ss-card">
          <View className="ss-section-title" style={{ marginTop: 0 }}>相关待办 · {todos.length}</View>
          {todos.map((t) => (
            <View key={t.id} style={{ padding: "10rpx 0" }}>
              <Text style={{ fontSize: "26rpx", color: t.done ? "#9ca0a8" : "#333", textDecoration: t.done ? "line-through" : "none" }}>
                {t.title}
              </Text>
              {t.standard ? (
                <Text style={{ display: "block", marginTop: "4rpx", fontSize: "20rpx", color: "#9ca0a8" }}>{t.standard}</Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* 回应区 */}
        <View className="ss-card">
          {accepted ? (
            <View>
              <Text style={{ display: "block", fontSize: "26rpx", color: "#1f9d55", textAlign: "center", padding: "8rpx 0" }}>
                已加入协同
              </Text>
              <Button className="ss-btn" style={{ marginTop: "16rpx" }} onClick={gotoTasks}>
                查看约定
              </Button>
            </View>
          ) : (
            <View>
              <Button className="ss-btn" loading={responding} onClick={respond}>
                接受邀请{needLogin ? " · 需登录" : ""}
              </Button>
              {needLogin && (
                <Text style={{ display: "block", marginTop: "16rpx", fontSize: "20rpx", color: "#b07818", textAlign: "center" }}>
                  登录后再接受
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={{ height: "40rpx" }} />
      </View>
    </View>
  );
}
