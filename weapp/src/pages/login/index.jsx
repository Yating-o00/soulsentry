import { useState, useEffect, useRef } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Button } from "@tarojs/components";
import { post } from "@/utils/api";
import { setToken } from "@/utils/auth";

export default function Login() {
  const [loginType, setLoginType] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [redirect, setRedirect] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {};
    if (params.redirect) {
      setRedirect(decodeURIComponent(params.redirect));
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);

  const goNext = () => {
    if (redirect) {
      let url = redirect;
      if (url.includes("/pages/share/index") && !url.includes("autoImport=")) {
        url += url.includes("?") ? "&autoImport=1" : "?autoImport=1";
      }
      Taro.redirectTo({ url });
    } else {
      Taro.switchTab({ url: "/pages/tasks/index" });
    }
  };

  const sendCode = async () => {
    if (!isPhoneValid) {
      Taro.showToast({ title: "请输入正确的手机号", icon: "none" });
      return;
    }
    if (countdown > 0) return;

    try {
      await post("/auth/sms/send", { phone, purpose: "login" });
      Taro.showToast({ title: "验证码已发送", icon: "success" });
      setCountdown(60);
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      // error already shown by api wrapper
    }
  };

  const submit = async () => {
    setLoading(true);
    try {
      let data;
      if (loginType === "phone") {
        if (!isPhoneValid) {
          Taro.showToast({ title: "请输入正确的手机号", icon: "none" });
          setLoading(false);
          return;
        }
        if (!/^\d{6}$/.test(code)) {
          Taro.showToast({ title: "请输入6位验证码", icon: "none" });
          setLoading(false);
          return;
        }
        data = await post("/auth/login", { type: "phone", phone, code });
      } else {
        if (!email.trim() || !password) {
          Taro.showToast({ title: "请输入邮箱和密码", icon: "none" });
          setLoading(false);
          return;
        }
        data = await post("/auth/login", { type: "email", email: email.trim(), password });
      }

      if (data.token) {
        setToken(data.token);
        Taro.showToast({ title: "登录成功", icon: "success" });
        setTimeout(() => {
          goNext();
        }, 500);
      }
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="ss-page">
      <View className="ss-card" style={{ marginTop: "40rpx" }}>
        <View className="ss-title">欢迎回来</View>
        <View className="ss-subtitle">
          {loginType === "phone" ? "请使用手机号验证码登录" : "请使用邮箱密码登录"}
        </View>

        <View
          style={{
            display: "flex",
            marginTop: "32rpx",
            marginBottom: "24rpx",
            background: "#f0f1f5",
            borderRadius: "12rpx",
            padding: "6rpx"
          }}
        >
          <View
            onClick={() => setLoginType("phone")}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "14rpx 0",
              borderRadius: "10rpx",
              background: loginType === "phone" ? "#ffffff" : "transparent",
              color: loginType === "phone" ? "#384877" : "#666666",
              fontSize: "28rpx",
              boxShadow: loginType === "phone" ? "0 2rpx 8rpx rgba(0,0,0,0.06)" : "none"
            }}
          >
            手机号
          </View>
          <View
            onClick={() => setLoginType("email")}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "14rpx 0",
              borderRadius: "10rpx",
              background: loginType === "email" ? "#ffffff" : "transparent",
              color: loginType === "email" ? "#384877" : "#666666",
              fontSize: "28rpx",
              boxShadow: loginType === "email" ? "0 2rpx 8rpx rgba(0,0,0,0.06)" : "none"
            }}
          >
            邮箱
          </View>
        </View>

        {loginType === "phone" ? (
          <>
            <View style={{ marginTop: "8rpx" }}>
              <View className="ss-label">手机号</View>
              <Input
                className="ss-input"
                type="number"
                placeholder="请输入手机号"
                maxlength={11}
                value={phone}
                onInput={(e) => setPhone(e.detail.value)}
              />
            </View>

            <View style={{ marginTop: "24rpx" }}>
              <View className="ss-label">验证码</View>
              <View style={{ display: "flex", alignItems: "center" }}>
                <Input
                  className="ss-input"
                  type="number"
                  placeholder="请输入6位验证码"
                  maxlength={6}
                  value={code}
                  onInput={(e) => setCode(e.detail.value)}
                  style={{ flex: 1, marginRight: "16rpx" }}
                />
                <Button
                  className={`ss-btn ss-btn-sm ${countdown > 0 ? "ss-btn-plain" : ""}`}
                  disabled={countdown > 0}
                  onClick={sendCode}
                >
                  {countdown > 0 ? `${countdown}s` : "获取验证码"}
                </Button>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={{ marginTop: "8rpx" }}>
              <View className="ss-label">邮箱</View>
              <Input
                className="ss-input"
                type="text"
                placeholder="请输入邮箱"
                value={email}
                onInput={(e) => setEmail(e.detail.value)}
              />
            </View>

            <View style={{ marginTop: "24rpx" }}>
              <View className="ss-label">密码</View>
              <Input
                className="ss-input"
                type="password"
                placeholder="请输入密码"
                value={password}
                onInput={(e) => setPassword(e.detail.value)}
              />
            </View>
          </>
        )}

        <Button className="ss-btn" loading={loading} disabled={loading} onClick={submit}>
          登录
        </Button>
      </View>
    </View>
  );
}
