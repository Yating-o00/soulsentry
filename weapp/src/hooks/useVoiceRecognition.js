import { useState, useRef, useEffect, useCallback } from "react";
import Taro from "@tarojs/taro";

let recognitionManager = null;

function getRecognitionManager() {
  if (recognitionManager) return recognitionManager;
  try {
    const plugin = requirePlugin("WechatSI");
    if (plugin && plugin.getRecordRecognitionManager) {
      recognitionManager = plugin.getRecordRecognitionManager();
    }
  } catch (err) {
    console.warn("[useVoiceRecognition] WechatSI plugin not available", err);
  }
  return recognitionManager;
}

async function ensureRecordAuth() {
  return new Promise((resolve) => {
    Taro.getSetting({
      success: (res) => {
        const auth = res.authSetting["scope.record"];
        if (auth === true) {
          resolve(true);
          return;
        }
        if (auth === false) {
          Taro.showModal({
            title: "需要录音权限",
            content: "语音输入需要录音权限，请前往设置开启",
            confirmText: "去设置",
            success: (modalRes) => {
              if (modalRes.confirm) {
                Taro.openSetting();
              }
              resolve(false);
            }
          });
          return;
        }
        Taro.authorize({
          scope: "scope.record",
          success: () => resolve(true),
          fail: (err) => {
            console.warn("[useVoiceRecognition] authorize record failed", err);
            resolve(false);
          }
        });
      },
      fail: () => resolve(false)
    });
  });
}

// 将 WechatSI 错误码转友好提示
function friendlyErrorMessage(res) {
  const code = String(res?.retcode || res?.code || "");
  const msg = res?.msg || res?.message || "语音识别失败";
  switch (code) {
    case "-30001":
      return "语音插件启动失败，请检查微信公众平台是否已添加 WechatSI 插件";
    case "-30002":
      return "语音识别失败，请稍后再试";
    case "-30003":
      return "说话时间太短，请长按多说一会儿";
    case "-30008":
      return "未识别到语音，请重试";
    case "-30011":
      return "识别还在准备中，请稍候";
    case "-30012":
      return "语音服务繁忙，请稍后再试";
    default:
      return code ? `${msg} (${code})` : msg;
  }
}

/**
 * 微信语音识别（WechatSI 插件）的通用 hook：
 * 长按开始、松手结束，识别结果通过 onResult 回调（不自动发送，由业务方决定填入或提交）。
 * 返回 phase/hint/recording 供 UI 展示状态，start/stop 供触摸事件绑定。
 */
export function useVoiceRecognition({ onResult, onError } = {}) {
  // idle | starting | recording | stopping
  const [phase, setPhase] = useState("idle");
  const [hint, setHint] = useState("");
  const interimRef = useRef("");
  const finalRef = useRef("");
  const timerRef = useRef(null);
  const initedRef = useRef(false);
  const managerRef = useRef(null);
  const lockRef = useRef(false);
  const cbRef = useRef({ onResult, onError });
  cbRef.current = { onResult, onError };
  // 组件卸载后插件回调仍会触发，mountedRef 用来拦住发往已卸载实例的结果
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    interimRef.current = "";
    finalRef.current = "";
    clearTimeout(timerRef.current);
  }, []);

  // 管理器是微信全局单例，多个消费方（主输入栏/对话弹层）挂载时会互相覆盖回调。
  // 因此每次 start 都重新绑定本实例的回调，保证识别结果一定回到发起录音的那一方。
  const wireHandlers = useCallback((manager) => {
    manager.onStart = () => {
      setPhase("recording");
      setHint("正在听…");
    };

    manager.onRecognize = (res) => {
      if (typeof res?.result === "string") {
        interimRef.current = res.result;
        setHint(`识别中：${res.result}`);
      }
    };

    manager.onStop = (res) => {
      const text = (res?.result || finalRef.current || interimRef.current || "").trim();
      console.log("[useVoiceRecognition] onStop, text =", text ? `${text.slice(0, 20)}…` : "(empty)");
      setHint(text ? "识别完成" : "未识别到语音");
      if (text && mountedRef.current) {
        cbRef.current.onResult?.(text);
      }
      reset();
    };

    manager.onError = (res) => {
      console.error("[useVoiceRecognition] recognition error", res);
      const code = String(res?.retcode || res?.code || "");
      const display = friendlyErrorMessage(res);

      // -30011 是中间状态，通常下一秒会自愈，不抛给业务层
      if (code === "-30011") {
        setHint("识别准备中，请稍候");
        setPhase("recording");
        return;
      }

      setHint(display);
      if (mountedRef.current) {
        cbRef.current.onError?.(display);
      }
      reset();
    };
  }, [reset]);

  useEffect(() => {
    if (initedRef.current) return;
    const manager = getRecognitionManager();
    if (!manager) {
      setHint("语音插件未配置");
      return;
    }
    managerRef.current = manager;
    initedRef.current = true;

    return () => {
      clearTimeout(timerRef.current);
    };
  }, []);

  const start = useCallback(async () => {
    if (lockRef.current) return;
    if (phase !== "idle") {
      // 上次识别可能因插件回调异常卡在非 idle（如 -30011 后既无 onStop 也无 onError），
      // 此时静默 return 会让用户以为"语音只能开一次"。强制复位后重新开始。
      console.warn("[useVoiceRecognition] start while phase =", phase, ", force reset");
      try { managerRef.current?.stop?.(); } catch (_e) { /* 插件未在录音时 stop 会抛错，忽略 */ }
      reset();
    }

    const manager = managerRef.current || getRecognitionManager();
    if (!manager) {
      Taro.showToast({ title: "语音插件未配置", icon: "none" });
      cbRef.current.onError?.("语音插件未配置");
      return;
    }
    managerRef.current = manager;

    const granted = await ensureRecordAuth();
    if (!granted) {
      setHint("需要录音权限");
      cbRef.current.onError?.("需要录音权限");
      return;
    }

    wireHandlers(manager);

    lockRef.current = true;
    interimRef.current = "";
    finalRef.current = "";
    setPhase("starting");
    setHint("准备中…");

    try {
      console.log("[useVoiceRecognition] manager.start, phase =", phase);
      manager.start({ duration: 30000, lang: "zh_CN" });

      // 兜底：若插件没有触发 onStart，最多 600ms 后强制进入 recording
      timerRef.current = setTimeout(() => {
        setPhase((prev) => (prev === "starting" ? "recording" : prev));
      }, 600);

      // 30s 自动停止
      timerRef.current = setTimeout(() => {
        stopRef.current?.();
      }, 30000);
    } catch (err) {
      console.error("[useVoiceRecognition] start failed", err);
      setHint("启动失败");
      cbRef.current.onError?.(err?.message || "启动失败");
      reset();
    } finally {
      setTimeout(() => {
        lockRef.current = false;
      }, 120);
    }
  }, [phase, reset, wireHandlers]);

  const stopRef = useRef(null);
  const stop = useCallback(() => {
    if (phase === "idle" || phase === "stopping") return;

    const manager = managerRef.current || getRecognitionManager();
    if (!manager) {
      reset();
      return;
    }

    // 如果还在 starting，等一小会儿再 stop，避免 -30011
    if (phase === "starting") {
      setHint("识别准备中，请稍候");
      timerRef.current = setTimeout(() => stopRef.current?.(), 220);
      return;
    }

    setPhase("stopping");
    setHint("识别中…");
    clearTimeout(timerRef.current);

    try {
      manager.stop();
    } catch (err) {
      console.error("[useVoiceRecognition] stop failed", err);
      const msg = err?.message || "";
      if (msg.includes("30011")) {
        setHint("识别准备中，请稍候");
        setPhase("recording");
        return;
      }
      setHint("停止失败");
      cbRef.current.onError?.(msg || "停止失败");
      reset();
    }
  }, [phase, reset]);
  stopRef.current = stop;

  const recording = phase === "recording" || phase === "starting";

  return { phase, hint, recording, start, stop };
}
