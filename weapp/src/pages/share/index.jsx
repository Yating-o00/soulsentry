import { useState, useEffect, useRef } from "react";
import Taro, { useShareAppMessage } from "@tarojs/taro";
import { View, Text, Input, Button, ScrollView } from "@tarojs/components";
import { get, post } from "@/utils/api";
import { isLoggedIn } from "@/utils/auth";

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
    return {
      title: item.title ? `邀你一起守护：${item.title}` : "SoulSentry 分享",
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
  const isCompleted = item.status === "completed" || item.status === "done";

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
              className={`ss-btn ${isCompleted ? "ss-btn-plain" : ""}`}
              onClick={() => handleToggle(!isCompleted)}
            >
              {isCompleted ? "标记为未完成" : "标记为已完成"}
            </Button>
          )}
        </View>

        {isTask && subtasks.length > 0 && (
          <View className="ss-card">
            <View className="ss-section-title">子约定</View>
            {subtasks.map((sub) => {
              const done = sub.status === "completed" || sub.status === "done";
              return (
                <View key={sub.id} style={{ display: "flex", alignItems: "center", padding: "16rpx 0", borderBottom: "1rpx solid #e5e6eb" }}>
                  <Text
                    style={{
                      width: "40rpx",
                      height: "40rpx",
                      borderRadius: "50%",
                      border: "2rpx solid #384877",
                      background: done ? "#384877" : "#fff",
                      color: "#fff",
                      textAlign: "center",
                      lineHeight: "40rpx",
                      marginRight: "16rpx",
                      fontSize: "24rpx"
                    }}
                    onClick={() => handleToggle(!done, sub.id)}
                  >
                    {done ? "✓" : ""}
                  </Text>
                  <Text style={{ flex: 1, fontSize: "30rpx", color: done ? "#999" : "#333", textDecoration: done ? "line-through" : "none" }}>
                    {sub.title}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View className="ss-card">
          <View className="ss-section-title">参与操作</View>
          <View style={{ display: "flex", flexWrap: "wrap" }}>
            <Button className="ss-btn ss-btn-sm ss-btn-plain" style={{ marginRight: "16rpx", marginBottom: "16rpx" }} openType="share">微信转发</Button>
            <Button className="ss-btn ss-btn-sm ss-btn-plain" style={{ marginRight: "16rpx", marginBottom: "16rpx" }} onClick={handleSubscribe}>订阅更新</Button>
            <Button className="ss-btn ss-btn-sm ss-btn-plain" style={{ marginRight: "16rpx", marginBottom: "16rpx" }} onClick={handleCalendar}>添加到日历</Button>
            <Button className="ss-btn ss-btn-sm" style={{ marginBottom: "16rpx" }} onClick={handleImport}>导入到我的列表</Button>
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
