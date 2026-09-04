import { useState, useEffect } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Button } from "@tarojs/components";
import { get, post, del } from "@/utils/api";

export default function VaultSheet({ visible, onClose, theme }) {
  const [items, setItems] = useState([]);
  const [password, setPassword] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [status, setStatus] = useState("checking"); // checking | setup | unlock | open
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    checkStatus();
  }, [visible]);

  const checkStatus = async () => {
    setLoading(true);
    try {
      await get("/vault", {}, { silent: true });
      setStatus("unlock");
    } catch (err) {
      if (String(err?.message || "").includes("VAULT_NOT_SET")) {
        setStatus("setup");
      } else {
        setStatus("unlock");
      }
    } finally {
      setLoading(false);
    }
  };

  const setup = async () => {
    if (newPwd.length < 4) {
      Taro.showToast({ title: "密码至少 4 位", icon: "none" });
      return;
    }
    if (newPwd !== confirmPwd) {
      Taro.showToast({ title: "两次输入不一致", icon: "none" });
      return;
    }
    setLoading(true);
    try {
      await post("/vault/setup", { password: newPwd });
      Taro.showToast({ title: "密码已设置", icon: "success" });
      setStatus("unlock");
      setPassword(newPwd);
    } catch {
      Taro.showToast({ title: "设置失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  const unlock = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const data = await post("/vault/unlock", { password });
      setItems(data || []);
      setStatus("open");
    } catch (err) {
      Taro.showToast({ title: "密码错误", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (id) => {
    const res = await Taro.showModal({ title: "确认删除", content: "删除后无法恢复" });
    if (!res.confirm) return;
    try {
      await del(`/vault/${id}`);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch {
      Taro.showToast({ title: "删除失败", icon: "none" });
    }
  };

  if (!visible) return null;

  return (
    <View
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-end"
      }}
      onClick={onClose}
    >
      <View
        style={{
          width: "100%",
          maxHeight: "80vh",
          background: theme?.card || "#fffbf5",
          borderRadius: "24rpx 24rpx 0 0",
          padding: "32rpx",
          boxSizing: "border-box"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <View style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24rpx" }}>
          <Text style={{ fontSize: "34rpx", fontWeight: 700, color: theme?.inkStrong || "#3a352c" }}>保险柜</Text>
          <Text onClick={onClose} style={{ fontSize: "32rpx", color: theme?.muted || "#8a7d6b" }}>✕</Text>
        </View>

        {status === "checking" && (
          <Text style={{ fontSize: "28rpx", color: theme?.muted || "#8a7d6b", textAlign: "center", padding: "40rpx" }}>
            检查中…
          </Text>
        )}

        {status === "setup" && (
          <View>
            <Text style={{ fontSize: "28rpx", color: theme?.ink || "#4f483e", marginBottom: "16rpx", lineHeight: "48rpx" }}>
              第一次使用保险柜，请设置一个独立密码。密码仅用于加密你的敏感信息。
            </Text>
            <Input
              style={{
                width: "100%",
                height: "88rpx",
                background: theme?.surface || "#f4f0ea",
                borderRadius: "12rpx",
                padding: "0 24rpx",
                fontSize: "30rpx",
                color: theme?.inkStrong || "#3a352c",
                boxSizing: "border-box",
                marginBottom: "16rpx"
              }}
              password
              placeholder="设置密码（4 位以上）"
              value={newPwd}
              onInput={(e) => setNewPwd(e.detail.value)}
            />
            <Input
              style={{
                width: "100%",
                height: "88rpx",
                background: theme?.surface || "#f4f0ea",
                borderRadius: "12rpx",
                padding: "0 24rpx",
                fontSize: "30rpx",
                color: theme?.inkStrong || "#3a352c",
                boxSizing: "border-box",
                marginBottom: "24rpx"
              }}
              password
              placeholder="再输入一次确认"
              value={confirmPwd}
              onInput={(e) => setConfirmPwd(e.detail.value)}
            />
            <Button
              loading={loading}
              onClick={setup}
              style={{
                width: "100%",
                height: "88rpx",
                lineHeight: "88rpx",
                background: theme?.primary || "#384877",
                color: "#fff",
                borderRadius: "12rpx",
                fontSize: "30rpx",
                margin: 0
              }}
            >
              设置并进入
            </Button>
          </View>
        )}

        {(status === "unlock" || status === "open") && status !== "checking" && (
          <View>
            {status === "unlock" && (
              <View style={{ marginBottom: "24rpx" }}>
                <Input
                  style={{
                    width: "100%",
                    height: "88rpx",
                    background: theme?.surface || "#f4f0ea",
                    borderRadius: "12rpx",
                    padding: "0 24rpx",
                    fontSize: "30rpx",
                    color: theme?.inkStrong || "#3a352c",
                    boxSizing: "border-box",
                    marginBottom: "16rpx"
                  }}
                  password
                  placeholder="输入保险柜密码"
                  value={password}
                  onInput={(e) => setPassword(e.detail.value)}
                />
                <Button
                  loading={loading}
                  onClick={unlock}
                  style={{
                    width: "100%",
                    height: "88rpx",
                    lineHeight: "88rpx",
                    background: theme?.primary || "#384877",
                    color: "#fff",
                    borderRadius: "12rpx",
                    fontSize: "30rpx",
                    margin: 0
                  }}
                >
                  解锁
                </Button>
              </View>
            )}

            {status === "open" && items.length === 0 && (
              <Text style={{ fontSize: "28rpx", color: theme?.muted || "#8a7d6b", textAlign: "center", padding: "40rpx" }}>
                保险柜是空的。
              </Text>
            )}

            {status === "open" &&
              items.map((it) => (
                <View
                  key={it.id}
                  style={{
                    padding: "20rpx",
                    background: theme?.surface || "#f4f0ea",
                    borderRadius: "12rpx",
                    marginBottom: "16rpx"
                  }}
                >
                  <View style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: "28rpx", fontWeight: 600, color: theme?.inkStrong || "#3a352c" }}>{it.label}</Text>
                    <Text onClick={() => removeItem(it.id)} style={{ fontSize: "24rpx", color: "#c2446c" }}>
                      删除
                    </Text>
                  </View>
                  <Text style={{ fontSize: "26rpx", color: theme?.ink || "#4f483e", marginTop: "8rpx", wordBreak: "break-all" }}>
                    {it.value}
                  </Text>
                </View>
              ))}
          </View>
        )}
      </View>
    </View>
  );
}
