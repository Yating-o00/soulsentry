import { useState, useEffect, useRef } from "react";
import Taro, { useShareAppMessage } from "@tarojs/taro";
import { View, Text, Input, Button, ScrollView, Image } from "@tarojs/components";
import { get, post, absoluteUrl } from "@/utils/api";
import { isLoggedIn } from "@/utils/auth";
import { milestoneQuote } from "@/components/tasks/checkinMeta";

const BASE_API = process.env.TARO_APP_API || "https://www.xinzhan-soulsentry.cn/api";
const VISITOR_NAME_KEY = "ss_visitor_name";
const VISITOR_TOKEN_KEY = "ss_visitor_token";

export default function Share() {
  const [token, setToken] = useState("");
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visitorName, setVisitorName] = useState("");
  const [visitorToken, setVisitorToken] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [autoImport, setAutoImport] = useState(false);
  const [joinState, setJoinState] = useState("idle"); // idle | loading | joined
  // 子约定较多时折叠已完成，待办一眼可见
  const [hideDoneSubs, setHideDoneSubs] = useState(false);

  const nameRef = useRef("");
  const tokenRef = useRef("");

  useEffect(() => {
    nameRef.current = visitorName;
  }, [visitorName]);

  useEffect(() => {
    tokenRef.current = visitorToken;
  }, [visitorToken]);

  useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {};
    const t = params.token || "";
    const taskId = params.taskId || "";
    setToken(t);
    setAutoImport(params.autoImport === "1");

    const storedName = Taro.getStorageSync(VISITOR_NAME_KEY) || "";
    const storedToken = Taro.getStorageSync(VISITOR_TOKEN_KEY) || "";
    setVisitorName(storedName);
    nameRef.current = storedName;
    setVisitorToken(storedToken);
    tokenRef.current = storedToken;

    if (t) {
      loadShare(t, storedToken);
    } else if (taskId) {
      generateShareFromTask(taskId, storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const generateShareFromTask = async (taskId, vToken) => {
    setLoading(true);
    try {
      const shareData = await post(`/public/share/generate/task/${taskId}`);
      if (shareData.token) {
        setToken(shareData.token);
        loadShare(shareData.token, vToken);
      } else {
        setShare(null);
        setLoading(false);
      }
    } catch (err) {
      setShare(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && share && autoImport && isLoggedIn()) {
      handleImport();
    }
  }, [loading, share, autoImport]);

  useShareAppMessage(() => {
    const item = share?.item || {};
    const total = share?.checkins?.total;
    // 打卡约定：转发卡片标题直接带上累计赴约次数
    const title = item.category === "checkin" && total
      ? `「${String(item.title || "打卡约定").slice(0, 14)}」已赴约 ${total} 次`
      : (item.title ? `邀你一起守护：${item.title}` : "SoulSentry 分享");
    return {
      title,
      path: `/pages/share/index?token=${token}`
    };
  });

  const loadShare = async (t, vToken) => {
    setLoading(true);
    try {
      const options = vToken ? { header: { "x-visitor-token": vToken } } : {};
      const data = await get(`/public/share/${t}`, {}, options);
      setShare(data);
      if (data.visitor_token && !tokenRef.current) {
        setVisitorToken(data.visitor_token);
        tokenRef.current = data.visitor_token;
        Taro.setStorageSync(VISITOR_TOKEN_KEY, data.visitor_token);
      }
    } catch (err) {
      setShare(null);
    } finally {
      setLoading(false);
    }
  };

  const currentVisitorName = () => nameRef.current.trim() || "访客";
  const currentVisitorToken = () => tokenRef.current;

  const ensureVisitorName = (action) => {
    if (!nameRef.current.trim()) {
      setPendingAction(() => action);
      setShowNameModal(true);
      return false;
    }
    return true;
  };

  const saveVisitorName = () => {
    const name = visitorName.trim() || "访客";
    Taro.setStorageSync(VISITOR_NAME_KEY, name);
    setVisitorName(name);
    nameRef.current = name;
    setShowNameModal(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const updateVisitorToken = (nextToken) => {
    if (nextToken) {
      setVisitorToken(nextToken);
      tokenRef.current = nextToken;
      Taro.setStorageSync(VISITOR_TOKEN_KEY, nextToken);
    }
  };

  const buildVisitorPayload = () => {
    const payload = { visitor_name: currentVisitorName() };
    const vToken = currentVisitorToken();
    if (vToken) payload.visitor_token = vToken;
    return payload;
  };

  const handleToggle = async (checked, subtaskId) => {
    if (!ensureVisitorName(() => handleToggle(checked, subtaskId))) return;

    try {
      const data = await post(`/public/share/${token}/toggle`, {
        checked,
        subtask_id: subtaskId || null,
        ...buildVisitorPayload()
      });
      updateVisitorToken(data.visitor_token);
      loadShare(token, currentVisitorToken());
    } catch (err) {
      // handled globally
    }
  };

  const handleCheer = async () => {
    if (!ensureVisitorName(() => handleCheer())) return;

    try {
      const data = await post(`/public/share/${token}/cheer`, buildVisitorPayload());
      updateVisitorToken(data.visitor_token);
      Taro.showToast({ title: `已加油 · 累计 ${data.cheer_total} 次`, icon: "none" });
      loadShare(token, currentVisitorToken());
    } catch (err) {
      // handled globally
    }
  };

  const submitComment = async () => {
    if (!commentText.trim()) {
      Taro.showToast({ title: "请输入评论", icon: "none" });
      return;
    }
    if (!ensureVisitorName(() => submitComment())) return;

    try {
      const data = await post(`/public/share/${token}/comments`, {
        content: commentText.trim(),
        ...buildVisitorPayload()
      });
      updateVisitorToken(data.visitor_token);
      setCommentText("");
      loadShare(token, currentVisitorToken());
    } catch (err) {
      // handled globally
    }
  };

  const handleSubscribe = async () => {
    if (!ensureVisitorName(() => handleSubscribe())) return;

    try {
      await post(`/public/share/${token}/subscribe`, {
        ...buildVisitorPayload()
      });
      Taro.showToast({ title: "订阅成功", icon: "success" });
    } catch (err) {
      // handled globally
    }
  };

  const handleCalendar = () => {
    const url = `${BASE_API}/public/share/${token}/ics`;
    Taro.setClipboardData({
      data: url,
      success: () => {
        Taro.showModal({
          title: "添加到日历",
          content: "已复制 .ics 链接，请在手机浏览器中打开以导入系统日历。",
          showCancel: false
        });
      }
    });
  };

  const handleImport = async () => {
    if (!isLoggedIn()) {
      const redirect = encodeURIComponent(`/pages/share/index?token=${token}`);
      Taro.navigateTo({ url: `/pages/login/index?redirect=${redirect}` });
      return;
    }

    const confirmed = await Taro.showModal({
      title: "确认导入",
      content: "登录后可将此内容导入到你的个人列表，是否继续？"
    });
    if (!confirmed.confirm) return;

    try {
      await post(`/public/share/${token}/import`);
      Taro.showToast({ title: "导入成功", icon: "success" });
    } catch (err) {
      // handled globally
    }
  };

  // 加入共有约定：双方实时共享同一条约定（区别于导入副本）
  const handleJoin = async () => {
    if (!isLoggedIn()) {
      const redirect = encodeURIComponent(`/pages/share/index?token=${token}`);
      Taro.navigateTo({ url: `/pages/login/index?redirect=${redirect}` });
      return;
    }
    if (joinState === "loading") return;
    setJoinState("loading");
    try {
      await post(`/public/share/${token}/join`);
      setJoinState("joined");
      Taro.showToast({ title: "已加入共有约定", icon: "success" });
    } catch (err) {
      setJoinState("idle");
      // 错误已全局提示（如「这是你自己的约定」）
    }
  };

  const gotoTasks = () => {
    Taro.switchTab({ url: "/pages/tasks/index" });
  };

  if (loading && !share) {
    return (
      <View className="ss-page">
        <View className="ss-empty">加载中...</View>
      </View>
    );
  }

  if (!share) {
    return (
      <View className="ss-page">
        <View className="ss-empty">分享链接不存在或已失效</View>
      </View>
    );
  }

  const isTask = share.type === "task";
  const item = share.item || {};
  const subtasks = share.subtasks || [];
  const comments = share.comments || [];
  const checkins = share.checkins || null;
  const isCompleted = item.status === "completed" || item.status === "done";
  const isCheckinTask = isTask && item.category === "checkin";

  return (
    <View className="ss-page">
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        <View className="ss-card">
          <View className="ss-title">{item.title || "未命名"}</View>
          <Text className="ss-muted">分享者：{share.owner_name || "未知"}</Text>
          {item.description || item.content ? (
            <View style={{ marginTop: "20rpx" }}>
              <Text style={{ fontSize: "30rpx", color: "#333", lineHeight: "48rpx" }}>{item.description || item.content}</Text>
            </View>
          ) : null}

          {isTask && (
            <Button
              className={`ss-btn ${isCheckinTask ? "" : (isCompleted ? "ss-btn-plain" : "")}`}
              onClick={() => (isCheckinTask && !share.is_owner ? handleCheer() : handleToggle(!isCompleted))}
            >
              {isCheckinTask
                ? (share.is_owner
                    ? (item.done_today ? "今日已打卡 · 再记一次" : "打卡")
                    : "为 TA 加油 ♥")
                : (isCompleted ? "标记为未完成" : "标记为已完成")}
            </Button>
          )}
          {isCheckinTask && !share.is_owner && (
            <Text className="ss-muted" style={{ display: "block", marginTop: "12rpx", fontSize: "24rpx" }}>
              点一次就是一声加油，会计入 TA 约定卡片的鼓励数据
            </Text>
          )}
        </View>

        {/* 打卡约定：直接呈现打卡内容——累计次数、最近赴约（附言/照片）与鼓励的话 */}
        {isCheckinTask && checkins && (() => {
          const total = checkins.total ?? 0;
          const firstAt = checkins.first_at;
          const items = checkins.items || [];
          const dayCount = firstAt
            ? Math.max(1, Math.floor((Date.now() - new Date(firstAt).getTime()) / 86400000) + 1)
            : 0;
          // 当日动态（按北京时间）：今日完成的子约定打勾呈现，今日新增的子约定带「新」标出
          const dayOf = (t) => new Date(new Date(t).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
          const today = dayOf(Date.now());
          const isSubDone = (s) => s.status === "completed" || s.status === "done";
          const flatSubs = [];
          const walkSubs = (nodes) => (nodes || []).forEach((n) => { flatSubs.push(n); walkSubs(n.children); });
          walkSubs(subtasks);
          const todayDoneSubs = flatSubs.filter((s) => isSubDone(s) && s.completed_at && dayOf(s.completed_at) === today);
          const todayDoneIds = new Set(todayDoneSubs.map((s) => s.id));
          const todayNewSubs = flatSubs.filter((s) => s.created_date && dayOf(s.created_date) === today && !todayDoneIds.has(s.id));
          return (
            <View className="ss-card" style={{ background: "linear-gradient(150deg, #f8faff 0%, #ffffff 55%)", border: "1rpx solid #c9d5ef" }}>
              <View style={{ display: "flex", alignItems: "baseline", gap: "12rpx" }}>
                <Text style={{ fontSize: "64rpx", fontWeight: 800, color: "#384877", lineHeight: "76rpx" }}>{total}</Text>
                <Text style={{ fontSize: "26rpx", color: "#384877", letterSpacing: "6rpx" }}>次 赴 约</Text>
                {item.done_today && (
                  <View style={{ marginLeft: "auto", background: "#e8f7ee", border: "1rpx solid #b7e4c7", padding: "4rpx 14rpx", borderRadius: "8rpx" }}>
                    <Text style={{ fontSize: "20rpx", color: "#1f9d55" }}>今日已打卡</Text>
                  </View>
                )}
              </View>
              <Text style={{ display: "block", fontSize: "22rpx", color: "#9ca0a8", marginTop: "6rpx" }}>
                {firstAt ? `从 ${new Date(firstAt).getFullYear()}年${new Date(firstAt).getMonth() + 1}月${new Date(firstAt).getDate()}日 起 · 第 ${dayCount} 天` : "刚刚开始"}
              </Text>

              {/* 鼓励数据：访客"为 TA 加油"的累计与最近加油的人 */}
              {share.cheers && (share.cheers.total ?? 0) > 0 && (() => {
                const names = (share.cheers.items || []).map((c) => c.name).slice(0, 5);
                return (
                  <View style={{ marginTop: "16rpx", background: "#EEF2FF", border: "1rpx solid #dbe3f7", borderRadius: "14rpx", padding: "16rpx 22rpx" }}>
                    <Text style={{ fontSize: "24rpx", color: "#384877", fontWeight: 600 }}>
                      ♥ 已被加油 {share.cheers.total} 次
                    </Text>
                    {names.length > 0 && (
                      <Text style={{ display: "block", fontSize: "22rpx", color: "#9ca0a8", marginTop: "6rpx" }}>
                        {names.join("、")} 为 TA 加油
                      </Text>
                    )}
                  </View>
                );
              })()}

              {/* 今日动态：今日完成的子约定（打勾）+ 今日新增的子约定（新） */}
              {(todayDoneSubs.length > 0 || todayNewSubs.length > 0) && (
                <View style={{ marginTop: "20rpx", background: "#f0f6ff", border: "1rpx solid #dbe3f7", borderRadius: "14rpx", padding: "18rpx 22rpx" }}>
                  <View style={{ display: "flex", alignItems: "center", gap: "10rpx", marginBottom: "10rpx" }}>
                    <View style={{ width: "12rpx", height: "12rpx", borderRadius: "50%", background: "#3b5aa2" }} />
                    <Text style={{ fontSize: "24rpx", fontWeight: 600, color: "#384877" }}>今日动态</Text>
                  </View>
                  {todayDoneSubs.map((s) => {
                    const dt = s.completed_at ? new Date(s.completed_at) : null;
                    const hm = dt && !isNaN(dt.getTime()) ? `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}` : "";
                    return (
                      <View key={s.id} style={{ display: "flex", alignItems: "center", gap: "12rpx", padding: "6rpx 0" }}>
                        <View style={{ width: "30rpx", height: "30rpx", borderRadius: "50%", background: "#1f9d55", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Text style={{ color: "#fff", fontSize: "18rpx", lineHeight: "22rpx" }}>✓</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: "26rpx", color: "#3a3a3c", textDecoration: "line-through", textDecorationColor: "#c9ced6" }}>{s.title}</Text>
                        {hm ? <Text style={{ fontSize: "20rpx", color: "#9ca0a8" }}>{hm}</Text> : null}
                      </View>
                    );
                  })}
                  {todayNewSubs.map((s) => (
                    <View key={s.id} style={{ display: "flex", alignItems: "center", gap: "12rpx", padding: "6rpx 0" }}>
                      <View style={{ background: "#EEF2FF", border: "1rpx solid #c9d5ef", padding: "0 8rpx", borderRadius: "6rpx", flexShrink: 0 }}>
                        <Text style={{ fontSize: "18rpx", color: "#384877" }}>新</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: "26rpx", color: "#3a3a3c" }}>{s.title}</Text>
                    </View>
                  ))}
                </View>
              )}

              {items.length > 0 && (
                <View style={{ marginTop: "20rpx", borderTop: "1rpx dashed #e8ecef", paddingTop: "20rpx" }}>
                  {items.map((c) => {
                    const d = new Date(c.created_at);
                    const timeStr = isNaN(d.getTime())
                      ? ""
                      : `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                    const isToday = !isNaN(d.getTime())
                      && new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
                        === new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
                    return (
                      <View key={c.id} style={{ display: "flex", gap: "18rpx", padding: "14rpx 0", borderBottom: "1rpx solid #eef0f3" }}>
                        <View style={{ width: "14rpx", height: "14rpx", borderRadius: "50%", background: isToday ? "#1f9d55" : "#3b5aa2", marginTop: "12rpx", flexShrink: 0 }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ display: "flex", alignItems: "center", gap: "10rpx" }}>
                            <Text style={{ fontSize: "22rpx", color: "#9ca0a8" }}>{timeStr}</Text>
                            {isToday && (
                              <View style={{ background: "#e8f7ee", border: "1rpx solid #b7e4c7", padding: "0 8rpx", borderRadius: "6rpx" }}>
                                <Text style={{ fontSize: "18rpx", color: "#1f9d55" }}>今日</Text>
                              </View>
                            )}
                          </View>
                          {c.note ? (
                            <View style={{ marginTop: "8rpx", background: "#ffffff", border: "1rpx solid #e8ecef", borderRadius: "12rpx", padding: "14rpx 18rpx" }}>
                              <Text style={{ fontSize: "27rpx", color: "#3a3a3c", lineHeight: "40rpx" }}>{c.note}</Text>
                            </View>
                          ) : null}
                          {c.photo_url ? (
                            <Image
                              src={absoluteUrl(c.photo_url)}
                              mode="aspectFill"
                              style={{ marginTop: c.note ? "12rpx" : "8rpx", width: "240rpx", height: "180rpx", borderRadius: "12rpx", background: "#f2f3f5" }}
                            />
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <Text style={{ display: "block", marginTop: "20rpx", fontSize: "24rpx", color: "#384877", fontWeight: 500 }}>
                ——心栈记 · {milestoneQuote(total)}
              </Text>
            </View>
          );
        })()}

        {isTask && subtasks.length > 0 && (() => {
          const isSubDone = (s) => s.status === "completed" || s.status === "done";
          const doneCount = subtasks.filter(isSubDone).length;
          const visibleSubs = hideDoneSubs ? subtasks.filter((s) => !isSubDone(s)) : subtasks;
          return (
            <View className="ss-card">
              <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <View className="ss-section-title" style={{ marginBottom: 0 }}>子约定</View>
                {doneCount > 0 && (
                  <Text
                    onClick={() => setHideDoneSubs((v) => !v)}
                    style={{ fontSize: "24rpx", color: "#5b82a0", padding: "4rpx 12rpx" }}
                  >
                    {hideDoneSubs ? `展开已完成 ${doneCount} 条` : "折叠已完成"}
                  </Text>
                )}
              </View>
              {visibleSubs.map((sub) => {
                const done = isSubDone(sub);
                return (
                  <View key={sub.id} style={{ display: "flex", alignItems: "center", padding: "16rpx 0", borderBottom: "1rpx solid #e5e6eb" }}>
                    <View
                      onClick={() => handleToggle(!done, sub.id)}
                      style={{
                        width: "40rpx",
                        height: "40rpx",
                        borderRadius: "50%",
                        border: "2rpx solid #384877",
                        background: done ? "#384877" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: "16rpx",
                        flexShrink: 0
                      }}
                    >
                      {done ? <Text style={{ color: "#fff", fontSize: "24rpx", lineHeight: "28rpx" }}>✓</Text> : null}
                    </View>
                    <Text style={{ flex: 1, fontSize: "30rpx", color: done ? "#999" : "#333", textDecoration: done ? "line-through" : "none" }}>
                      {sub.title}
                    </Text>
                  </View>
                );
              })}
              {visibleSubs.length === 0 && (
                <View className="ss-empty" style={{ padding: "20rpx 0" }}>{subtasks.length} 条子约定已全部完成</View>
              )}
            </View>
          );
        })()}

        <View className="ss-card">
          <View className="ss-section-title">参与操作</View>
          {isTask && isLoggedIn() && joinState !== "joined" && (
            <Button className="ss-btn" onClick={handleJoin} loading={joinState === "loading"}>
              加入共有约定
            </Button>
          )}
          {isTask && isLoggedIn() && joinState === "joined" && (
            <Button className="ss-btn" onClick={gotoTasks}>已加入 · 前往约定列表</Button>
          )}
          {isTask && isLoggedIn() && (
            <Text className="ss-muted" style={{ display: "block", margin: "12rpx 0 20rpx" }}>
              加入后，双方将实时共享这条约定的内容、提醒、子约定、评论与变化记录
            </Text>
          )}
          <View style={{ display: "flex", flexWrap: "wrap" }}>
            <Button className="ss-btn ss-btn-sm ss-btn-plain" style={{ marginRight: "16rpx", marginBottom: "16rpx" }} openType="share">微信转发</Button>
            <Button className="ss-btn ss-btn-sm ss-btn-plain" style={{ marginRight: "16rpx", marginBottom: "16rpx" }} onClick={handleSubscribe}>订阅更新</Button>
            <Button className="ss-btn ss-btn-sm ss-btn-plain" style={{ marginRight: "16rpx", marginBottom: "16rpx" }} onClick={handleCalendar}>添加到日历</Button>
            <Button className="ss-btn ss-btn-sm ss-btn-plain" style={{ marginBottom: "16rpx" }} onClick={handleImport}>保存副本到列表</Button>
          </View>
        </View>

        <View className="ss-card">
          <View className="ss-section-title">评论</View>
          {comments.length === 0 && <View className="ss-empty">暂无评论</View>}
          {comments.map((c) => (
            <View key={c.id} style={{ marginBottom: "20rpx", paddingBottom: "20rpx", borderBottom: "1rpx solid #e5e6eb" }}>
              <View style={{ display: "flex", justifyContent: "space-between", marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "28rpx", color: "#384877", fontWeight: 500 }}>{c.created_by || c.visitor_name || "访客"}</Text>
                <Text className="ss-muted">{new Date(c.created_date).toLocaleString("zh-CN")}</Text>
              </View>
              <Text style={{ fontSize: "30rpx", color: "#333" }}>{c.content}</Text>
            </View>
          ))}
        </View>

        <View className="ss-card">
          <View className="ss-section-title">发表评论</View>
          <Input
            className="ss-input"
            placeholder="写下你的评论"
            value={commentText}
            onInput={(e) => setCommentText(e.detail.value)}
          />
          <Button className="ss-btn" onClick={submitComment}>发送</Button>
        </View>

        <View style={{ height: "40rpx" }} />
      </ScrollView>

      {showNameModal && (
        <View
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
        >
          <View style={{ width: "600rpx", background: "#fff", borderRadius: "16rpx", padding: "32rpx" }}>
            <View style={{ fontSize: "34rpx", fontWeight: 600, marginBottom: "16rpx" }}>怎么称呼你？</View>
            <Input
              className="ss-input"
              placeholder="请输入你的称呼"
              value={visitorName}
              onInput={(e) => setVisitorName(e.detail.value)}
            />
            <Button className="ss-btn" onClick={saveVisitorName}>确定</Button>
          </View>
        </View>
      )}
    </View>
  );
}
