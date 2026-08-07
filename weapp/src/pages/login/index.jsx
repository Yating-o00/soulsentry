import { useState, useEffect, useRef } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Button } from "@tarojs/components";
import { post } from "@/utils/api";
import { setToken } from "@/utils/auth";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
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
    if (!isPhoneValid) {
      Taro.showToast({ title: "请输入正确的手机号", icon: "none" });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      Taro.showToast({ title: "请输入6位验证码", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      const data = await post("/auth/login", { type: "phone", phone, code });
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
        <View className="ss-subtitle">请使用手机号验证码登录</View>

        <View style={{ marginTop: "32rpx" }}>
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

        <Button className="ss-btn" loading={loading} disabled={loading} onClick={submit}>
          登录
        </Button>
      </View>
    </View>
  );
}
