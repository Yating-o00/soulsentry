import { useState } from "react";
import { Heart } from "lucide-react";
import { standaloneClient } from "../api/standaloneClient";
import { createPageUrl } from "@/utils";

function getPostLoginRedirect() {
  if (typeof window === "undefined") return "/";
  try {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    if (redirect) {
      const url = new URL(redirect, window.location.origin);
      // 仅允许同站路径，避免开放重定向；也不允许跳回登录页
      if (
        url.origin === window.location.origin &&
        url.pathname !== "/login" &&
        url.pathname !== "/Login"
      ) {
        return url.pathname + url.search + url.hash;
      }
    }
  } catch (e) {
    // 忽略非法 redirect
  }
  return "/";
}

// 注册完成后的去向：有明确回跳目标（如邀请链接）时优先回跳，
// 否则保持原来的新手引导流程。
function getPostRegisterRedirect() {
  const redirect = getPostLoginRedirect();
  return redirect === "/" ? createPageUrl("Onboarding") : redirect;
}

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
        // 有邀请/回跳目标时优先回到目标页；没有才进入新手引导
        window.location.href = getPostRegisterRedirect();
      } else {
        const result = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "phone", phone, code })
        });
        const data = await result.json();
        if (!result.ok) throw new Error(data?.message || "登录失败");
        localStorage.setItem("soulsentry_access_token", data.token);
        window.location.href = getPostLoginRedirect();
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
        // 有邀请/回跳目标时优先回到目标页；没有才进入新手引导
        window.location.href = getPostRegisterRedirect();
        return;
      }
      await standaloneClient.auth.login(email, password);
      window.location.href = getPostLoginRedirect();
    } catch (error) {
      setMessage(error.message || (isRegister ? "注册失败" : "登录失败"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-3 mb-3 rounded-[10px] border border-stone-200 bg-white text-sm text-stone-900 outline-none box-border placeholder:text-stone-400 focus:border-[#384877] focus:ring-2 focus:ring-[#384877]/15";

  const primaryButtonClass =
    "w-full py-3 rounded-[10px] border-0 bg-[#384877] text-white text-[15px] font-medium cursor-pointer hover:bg-[#2E3A60] disabled:opacity-70 disabled:cursor-not-allowed";

  const secondaryButtonClass =
    "px-3.5 rounded-[10px] border border-stone-200 bg-white cursor-pointer whitespace-nowrap text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed";

  const tabButtonClass = (active) =>
    `flex-1 py-2.5 rounded-[10px] border text-sm font-medium cursor-pointer transition-colors ${
      active
        ? "border-stone-200 bg-stone-100 text-stone-900"
        : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
    }`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4 py-8">
      <div className="w-full max-w-[420px] bg-white border border-stone-200/60 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-7">
        {/* 扁平品牌标识 */}
        <div className="flex items-center gap-3 mb-7">
          <div className="h-11 w-11 rounded-xl bg-[#384877] flex items-center justify-center flex-shrink-0">
            <Heart className="h-6 w-6 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <p className="m-0 text-xl font-semibold tracking-tight text-stone-900">心栈 · SoulSentry</p>
            <p className="m-0 mt-0.5 text-sm text-stone-500">安心记住每一个约定</p>
          </div>
        </div>

        <h1 className="m-0 text-[28px] font-semibold tracking-tight text-stone-900">
          {isRegister ? "注册" : "登录"}
        </h1>
        <p className="text-stone-500 mt-2 mb-5">
          {isRegister ? "创建 SoulSentry 账号" : "登录 SoulSentry"}
        </p>

        <div className="flex gap-2 mb-5">
          <button type="button" onClick={() => setMode("phone")} className={tabButtonClass(mode === "phone")}>
            手机号
          </button>
          <button type="button" onClick={() => setMode("email")} className={tabButtonClass(mode === "email")}>
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
              className={inputClass}
            />
            <div className="flex gap-2 mb-3">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="验证码"
                maxLength={6}
                className={`${inputClass} flex-1 mb-0`}
              />
              <button
                type="button"
                onClick={() => sendCode(isRegister ? "register" : "login")}
                disabled={sending || countdown > 0 || !isPhoneValid}
                className={secondaryButtonClass}
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
                className={inputClass}
              />
            )}
            <button
              type="submit"
              disabled={submitting || !isPhoneValid || !isCodeValid}
              className={primaryButtonClass}
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
              className={inputClass}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              className={inputClass}
            />
            {isRegister && (
              <>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="确认密码"
                  className={inputClass}
                />
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="昵称（可选）"
                  maxLength={50}
                  className={inputClass}
                />
              </>
            )}
            <button
              type="submit"
              disabled={submitting || !isEmailValid || !isPasswordValid || (isRegister && password !== confirmPassword)}
              className={primaryButtonClass}
            >
              {submitting ? (isRegister ? "注册中..." : "登录中...") : (isRegister ? "注册" : "登录")}
            </button>
          </form>
        )}

        {message ? (
          <p className={`mt-3 text-sm ${message.includes("成功") || message.includes("已发送") ? "text-emerald-700" : "text-red-600"}`}>
            {message}
          </p>
        ) : null}

        <div className="mt-5 text-center text-sm text-stone-500">
          {isRegister ? "已有账号？" : "还没有账号？"}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setMessage("");
              setPassword("");
              setConfirmPassword("");
            }}
            className="ml-1 text-[#384877] bg-transparent border-0 cursor-pointer text-sm font-medium p-0"
          >
            {isRegister ? "立即登录" : "立即注册"}
          </button>
        </div>
      </div>
    </div>
  );
}
