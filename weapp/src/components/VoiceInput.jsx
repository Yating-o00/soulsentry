import { useState, useRef, useEffect } from "react";
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
          // 曾经被拒绝，需要引导去设置页
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
        // 未请求过，直接授权
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

export default function VoiceInput({ onResult, onError, onTouchStart: onTouchStartProp, size = 96, style = {} }) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState("");
  const interimRef = useRef("");
  const finalRef = useRef("");
  const timerRef = useRef(null);
  const initedRef = useRef(false);

  useEffect(() => {
    if (initedRef.current) return;
    const manager = getRecognitionManager();
    if (!manager) {
      setHint("语音插件未配置");
      return;
    }
    initedRef.current = true;

    manager.onRecognize = (res) => {
      if (typeof res?.result === "string") {
        interimRef.current = res.result;
        setHint(`识别中：${res.result}`);
      }
    };

    manager.onStop = (res) => {
      setRecording(false);
      const text = (res?.result || finalRef.current || interimRef.current || "").trim();
      setHint(text ? `识别完成` : "未识别到语音");
      if (text) {
        onResult?.(text);
      }
      interimRef.current = "";
      finalRef.current = "";
      clearTimeout(timerRef.current);
    };

    manager.onError = (res) => {
      setRecording(false);
      const code = res?.retcode || res?.code || "";
      const msg = res?.msg || res?.message || "语音识别失败";
      const display = code ? `${msg} (${code})` : msg;
      setHint(display);
      console.error("[VoiceInput] recognition error", res);
      onError?.(display);
      interimRef.current = "";
      finalRef.current = "";
      clearTimeout(timerRef.current);
    };

    return () => {
      clearTimeout(timerRef.current);
    };
  }, [onResult, onError]);

  const startRecord = async () => {
    const manager = getRecognitionManager();
    if (!manager) {
      Taro.showToast({ title: "语音插件未配置", icon: "none" });
      onError?.("语音插件未配置");
      return;
    }

    const granted = await ensureRecordAuth();
    if (!granted) {
      setHint("需要录音权限");
      onError?.("需要录音权限");
      return;
    }

    interimRef.current = "";
    finalRef.current = "";
    setRecording(true);
    setHint("正在听…");

    try {
      manager.start({
        duration: 30000,
        lang: "zh_CN"
      });

      timerRef.current = setTimeout(() => {
        stopRecord();
      }, 30000);
    } catch (err) {
      setRecording(false);
      setHint("启动失败");
      console.error("[VoiceInput] start failed", err);
      onError?.(err?.message || "启动失败");
    }
  };

  const stopRecord = () => {
    const manager = getRecognitionManager();
    if (!manager) return;
    clearTimeout(timerRef.current);
    try {
      manager.stop();
    } catch (err) {
      setRecording(false);
      console.error("[VoiceInput] stop failed", err);
      onError?.(err?.message || "停止失败");
    }
  };

  const onTouchStart = (e) => {
    e.preventDefault();
    onTouchStartProp?.();
    startRecord();
  };

  const onTouchEnd = (e) => {
    e.preventDefault();
    stopRecord();
  };

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
