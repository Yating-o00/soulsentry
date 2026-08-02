import { useState } from "react";
import { standaloneClient } from "../api/standaloneClient";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [mode, setMode] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState("");

  const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);
  const isCodeValid = /^\d{6}$/.test(code);
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPasswordValid = password.length >= 8;

  function startCountdown(seconds) {
    setCountdown(seconds);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function sendCode(purpose) {
    if (!isPhoneValid) {
      setMessage("请输入正确的手机号");
      return;
    }
    try {
      setSending(true);
      setMessage("");
      const result = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose })
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data?.message || "验证码发送失败");
      setMessage(data?.message || "验证码已发送");
      startCountdown(data?.expiresIn || 60);
    } catch (error) {
      setMessage(error.message || "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function submitPhone(e) {
    e.preventDefault();
    if (!isPhoneValid || !isCodeValid) {
      setMessage("请填写正确的手机号和验证码");
      return;
    }
    try {
      setSubmitting(true);
      setMessage("");
      if (isRegister) {
        const result = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "phone",
            phone,
            code,
            displayName: displayName.trim() || undefined
          })
        });
        const data = await result.json();
        if (!result.ok) throw new Error(data?.message || "注册失败");
        localStorage.setItem("soulsentry_access_token", data.token);
        window.location.href = "/";
      } else {
        const result = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "phone", phone, code })
        });
        const data = await result.json();
        if (!result.ok) throw new Error(data?.message || "登录失败");
        localStorage.setItem("soulsentry_access_token", data.token);
        window.location.href = "/";
      }
    } catch (error) {
      setMessage(error.message || (isRegister ? "注册失败" : "登录失败"));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEmail(e) {
    e.preventDefault();
    if (!isEmailValid) {
      setMessage("请输入正确的邮箱地址");
      return;
    }
    if (!isPasswordValid) {
      setMessage("密码至少需要 8 位");
      return;
    }
    if (isRegister && password !== confirmPassword) {
      setMessage("两次输入的密码不一致");
      return;
    }
    try {
      setSubmitting(true);
      setMessage("");
      if (isRegister) {
        await standaloneClient.auth.register({
          email,
          password,
          displayName: displayName.trim() || undefined
        });
      } else {
        await standaloneClient.auth.login(email, password);
      }
      window.location.href = "/";
    } catch (error) {
      setMessage(error.message || (isRegister ? "注册失败" : "登录失败"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: 12,
    marginBottom: 12,
    borderRadius: 10,
    border: "1px solid #d0d5dd",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box"
  };

  const buttonStyle = {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "#3b5ccc",
    color: "#fff",
    fontSize: 15,
    cursor: "pointer"
  };

  const secondaryButtonStyle = {
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid #d0d5dd",
    background: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 14
  };

  const tabButtonStyle = (active) => ({
    flex: 1,
    padding: 10,
    borderRadius: 10,
    border: "1px solid #d0d5dd",
    background: active ? "#eef2ff" : "#fff",
    cursor: "pointer",
    fontSize: 14
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f7fb", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
        <h1 style={{ margin: 0, fontSize: 28, color: "#101828" }}>
          {isRegister ? "注册" : "登录"}
        </h1>
        <p style={{ color: "#667085", marginTop: 8, marginBottom: 20 }}>
          {isRegister ? "创建 SoulSentry 账号" : "登录 SoulSentry"}
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={() => setMode("phone")} style={tabButtonStyle(mode === "phone")}>
            手机号
          </button>
          <button onClick={() => setMode("email")} style={tabButtonStyle(mode === "email")}>
            邮箱
          </button>
        </div>

        {mode === "phone" ? (
          <form onSubmit={submitPhone}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="手机号"
              maxLength={11}
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="验证码"
                maxLength={6}
                style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
              />
              <button
                type="button"
                onClick={() => sendCode(isRegister ? "register" : "login")}
                disabled={sending || countdown > 0 || !isPhoneValid}
                style={{
                  ...secondaryButtonStyle,
                  opacity: sending || countdown > 0 || !isPhoneValid ? 0.6 : 1,
                  cursor: sending || countdown > 0 || !isPhoneValid ? "not-allowed" : "pointer"
                }}
              >
                {countdown > 0 ? `${countdown}s` : sending ? "发送中" : "获取验证码"}
              </button>
            </div>
            {isRegister && (
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="昵称（可选）"
                maxLength={50}
                style={inputStyle}
              />
            )}
            <button
              type="submit"
              disabled={submitting || !isPhoneValid || !isCodeValid}
              style={{
                ...buttonStyle,
                opacity: submitting || !isPhoneValid || !isCodeValid ? 0.7 : 1,
                cursor: submitting || !isPhoneValid || !isCodeValid ? "not-allowed" : "pointer"
              }}
            >
              {submitting ? (isRegister ? "注册中..." : "登录中...") : (isRegister ? "注册" : "登录")}
            </button>
          </form>
        ) : (
          <form onSubmit={submitEmail}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱"
              style={inputStyle}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              style={inputStyle}
            />
            {isRegister && (
              <>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="确认密码"
                  style={inputStyle}
                />
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="昵称（可选）"
                  maxLength={50}
                  style={inputStyle}
                />
              </>
            )}
            <button
              type="submit"
              disabled={submitting || !isEmailValid || !isPasswordValid || (isRegister && password !== confirmPassword)}
              style={{
                ...buttonStyle,
                opacity: submitting || !isEmailValid || !isPasswordValid || (isRegister && password !== confirmPassword) ? 0.7 : 1,
                cursor: submitting || !isEmailValid || !isPasswordValid || (isRegister && password !== confirmPassword) ? "not-allowed" : "pointer"
              }}
            >
              {submitting ? (isRegister ? "注册中..." : "登录中...") : (isRegister ? "注册" : "登录")}
            </button>
          </form>
        )}

        {message ? (
          <p style={{ marginTop: 12, color: message.includes("成功") || message.includes("已发送") ? "#027a48" : "#d92d20", fontSize: 14 }}>
            {message}
          </p>
        ) : null}

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 14, color: "#667085" }}>
          {isRegister ? "已有账号？" : "还没有账号？"}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setMessage("");
              setPassword("");
              setConfirmPassword("");
            }}
            style={{ marginLeft: 4, color: "#3b5ccc", background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}
          >
            {isRegister ? "立即登录" : "立即注册"}
          </button>
        </div>
      </div>
    </div>
  );
}
