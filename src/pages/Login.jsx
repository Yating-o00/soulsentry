import { useState } from "react";
import { standaloneClient } from "../api/standaloneClient";

export default function Login() {
  const [mode, setMode] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function sendCode() {
    try {
      setSending(true);
      setMessage("");
      const result = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "login" })
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data?.message || "验证码发送失败");
      setMessage(data?.message || "验证码已发送");
    } catch (error) {
      setMessage(error.message || "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function submitPhoneLogin(e) {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMessage("");
      const result = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "phone", phone, code })
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data?.message || "登录失败");
      localStorage.setItem("soulsentry_access_token", data.token);
      window.location.href = "/";
    } catch (error) {
      setMessage(error.message || "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEmailLogin(e) {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMessage("");
      await standaloneClient.auth.login(email, password);
      window.location.href = "/";
    } catch (error) {
      setMessage(error.message || "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f7fb" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>登录</h1>
        <p style={{ color: "#667085", marginTop: 8 }}>登录 SoulSentry</p>

        <div style={{ display: "flex", gap: 8, marginTop: 20, marginBottom: 20 }}>
          <button onClick={() => setMode("phone")} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #d0d5dd", background: mode === "phone" ? "#eef2ff" : "#fff" }}>
            手机号登录
          </button>
          <button onClick={() => setMode("email")} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #d0d5dd", background: mode === "email" ? "#eef2ff" : "#fff" }}>
            邮箱登录
          </button>
        </div>

        {mode === "phone" ? (
          <form onSubmit={submitPhoneLogin}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="手机号"
              style={{ width: "100%", padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid #d0d5dd" }}
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="验证码"
                style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #d0d5dd" }}
              />
              <button type="button" onClick={sendCode} disabled={sending || !phone} style={{ padding: "0 14px", borderRadius: 10, border: "1px solid #d0d5dd", background: "#fff" }}>
                {sending ? "发送中" : "获取验证码"}
              </button>
            </div>
            <button type="submit" disabled={submitting} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#3b5ccc", color: "#fff" }}>
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitEmailLogin}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱"
              style={{ width: "100%", padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid #d0d5dd" }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              style={{ width: "100%", padding: 12, marginBottom: 12, borderRadius: 10, border: "1px solid #d0d5dd" }}
            />
            <button type="submit" disabled={submitting} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#3b5ccc", color: "#fff" }}>
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>
        )}

        {message ? <p style={{ marginTop: 12, color: "#d92d20" }}>{message}</p> : null}
      </div>
    </div>
  );
}
