import { useState, useRef, useEffect, useCallback } from "react";
import Taro from "@tarojs/taro";
import { View, Text } from "@tarojs/components";

let recognitionManager = null;

function getRecognitionManager() {
  if (recognitionManager) return recognitionManager;
  try {
    const plugin = requirePlugin("WechatSI");
    if (plugin && plugin.getRecordRecognitionManager) {
      recognitionManager = plugin.getRecordRecognitionManager();
    }
  } catch (err) {
    console.warn("[VoiceInput] WechatSI plugin not available", err);
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
            console.warn("[VoiceInput] authorize record failed", err);
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

export default function VoiceInput({
  onResult,
  onError,
  onTouchStart: onTouchStartProp,
  size = 96,
  style = {}
}) {
  // idle | starting | recording | stopping
  const [phase, setPhase] = useState("idle");
  const [hint, setHint] = useState("");
  const interimRef = useRef("");
  const finalRef = useRef("");
  const timerRef = useRef(null);
  const initedRef = useRef(false);
  const managerRef = useRef(null);
  const touchLockRef = useRef(false);

  const reset = useCallback(() => {
    setPhase("idle");
    interimRef.current = "";
    finalRef.current = "";
    clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (initedRef.current) return;
    const manager = getRecognitionManager();
    if (!manager) {
      setHint("语音插件未配置");
      return;
    }
    managerRef.current = manager;
    initedRef.current = true;

    manager.onStart = (res) => {
      console.log("[VoiceInput] onStart", res);
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
      console.log("[VoiceInput] onStop", res);
      const text = (res?.result || finalRef.current || interimRef.current || "").trim();
      setHint(text ? "识别完成" : "未识别到语音");
      if (text) {
        onResult?.(text);
      }
      reset();
    };

    manager.onError = (res) => {
      console.error("[VoiceInput] recognition error", res);
      const code = String(res?.retcode || res?.code || "");
      const display = friendlyErrorMessage(res);

      // -30011 是中间状态，通常下一秒会自愈，不抛给业务层
      if (code === "-30011") {
        setHint("识别准备中，请稍候");
        setPhase("recording");
        return;
      }

      setHint(display);
      onError?.(display);
      reset();
    };

    return () => {
      clearTimeout(timerRef.current);
    };
  }, [onResult, onError, reset]);

  const startRecord = async () => {
    if (touchLockRef.current) return;
    if (phase !== "idle") {
      console.warn("[VoiceInput] startRecord ignored, phase:", phase);
      return;
    }

    const manager = managerRef.current || getRecognitionManager();
    if (!manager) {
      Taro.showToast({ title: "语音插件未配置", icon: "none" });
      onError?.("语音插件未配置");
      return;
    }
    managerRef.current = manager;

    const granted = await ensureRecordAuth();
    if (!granted) {
      setHint("需要录音权限");
      onError?.("需要录音权限");
      return;
    }

    touchLockRef.current = true;
    interimRef.current = "";
    finalRef.current = "";
    setPhase("starting");
    setHint("准备中…");

    try {
      manager.start({
        duration: 30000,
        lang: "zh_CN"
      });

      // 兜底：若插件没有触发 onStart，最多 600ms 后强制进入 recording
      timerRef.current = setTimeout(() => {
        setPhase((prev) => (prev === "starting" ? "recording" : prev));
      }, 600);

      // 30s 自动停止
      timerRef.current = setTimeout(() => {
        stopRecord();
      }, 30000);
    } catch (err) {
      console.error("[VoiceInput] start failed", err);
      setHint("启动失败");
      onError?.(err?.message || "启动失败");
      reset();
    } finally {
      setTimeout(() => {
        touchLockRef.current = false;
      }, 120);
    }
  };

  const stopRecord = useCallback(() => {
    if (phase === "idle" || phase === "stopping") return;

    const manager = managerRef.current || getRecognitionManager();
    if (!manager) {
      reset();
      return;
    }

    // 如果还在 starting，等一小会儿再 stop，避免 -30011
    if (phase === "starting") {
      setHint("识别准备中，请稍候");
      timerRef.current = setTimeout(() => stopRecord(), 220);
      return;
    }

    setPhase("stopping");
    setHint("识别中…");
    clearTimeout(timerRef.current);

    try {
      manager.stop();
    } catch (err) {
      console.error("[VoiceInput] stop failed", err);
      const msg = err?.message || "";
      if (msg.includes("30011")) {
        setHint("识别准备中，请稍候");
        setPhase("recording");
        return;
      }
      setHint("停止失败");
      onError?.(msg || "停止失败");
      reset();
    }
  }, [phase, onError, reset]);

  const onTouchStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onTouchStartProp?.();
    startRecord();
  };

  const onTouchEnd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    stopRecord();
  };

  const recording = phase === "recording" || phase === "starting";

  return (
    <View style={{ display: "flex", flexDirection: "column", alignItems: "center", ...style }}>
      <View
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          width: `${size}rpx`,
          height: `${size}rpx`,
          borderRadius: "50%",
          background: recording
            ? "linear-gradient(135deg, #e53935 0%, #ff6b6b 100%)"
            : "linear-gradient(135deg, #384877 0%, #4a5d8f 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: recording
            ? "0 0 0 12rpx rgba(229, 57, 53, 0.25)"
            : "0 8rpx 24rpx rgba(56, 72, 119, 0.25)",
          transition: "all 0.2s ease"
        }}
      >
        <Text style={{ fontSize: `${Math.round(size * 0.45)}rpx`, color: "#ffffff" }}>
          {recording ? "🎙️" : "🎤"}
        </Text>
      </View>
      {hint ? (
        <Text
          style={{
            marginTop: "16rpx",
            fontSize: "26rpx",
            color: recording ? "#e53935" : "#666666",
            textAlign: "center",
            maxWidth: "560rpx"
          }}
        >
          {hint}
        </Text>
      ) : (
        <Text style={{ marginTop: "16rpx", fontSize: "26rpx", color: "#999999" }}>
          按住说话
        </Text>
      )}
    </View>
  );
}
