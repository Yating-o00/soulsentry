import { useState, useEffect } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Textarea, Button, Input } from "@tarojs/components";
import { post, get } from "@/utils/api";
import VoiceInput from "@/components/VoiceInput";
import theme from "@/components/tasks/theme";

// 前端敏感检测规则，与后端保持一致
const VAULT_PATTERNS = [
  /\b\d{17}[\dXx]\b/,
  /\b\d{15}\b/,
  /\b(?:\d{4}[ -]?){3,4}\d{1,4}\b/,
  /密码[:：]\s*\S+/i,
  /验证码[:：]\s*\S+/i,
  /密钥[:：]\s*\S+/i,
  /私钥|token|api\s*key|护照|驾照|驾驶证/i
];

function detectSensitive(text) {
  return VAULT_PATTERNS.some((re) => re.test(text));
}

export default function NoteCreate() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceErrorCount, setVoiceErrorCount] = useState(0);
  const [vaultMode, setVaultMode] = useState(false);
  const [vaultStep, setVaultStep] = useState("check"); // check | setup | unlock
  const [vaultPwd, setVaultPwd] = useState("");
  const [vaultNewPwd, setVaultNewPwd] = useState("");
  const [vaultConfirmPwd, setVaultConfirmPwd] = useState("");
  const [vaultLabel, setVaultLabel] = useState("");

  useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {};
    const preset = params.preset;
    if (preset) {
      setContent(decodeURIComponent(preset));
    }
  }, []);

  const checkVaultStatus = async () => {
    try {
      await get("/vault", {}, { silent: true });
      setVaultStep("unlock");
    } catch (err) {
      if (String(err?.message || "").includes("VAULT_NOT_SET")) {
        setVaultStep("setup");
      } else {
        setVaultStep("unlock");
      }
    }
  };

  const submit = async () => {
    const text = content.trim();
    if (!text) {
      Taro.showToast({ title: "请输入心签内容", icon: "none" });
      return;
    }

    if (detectSensitive(text)) {
      setVaultMode(true);
      setVaultLabel("敏感信息");
      await checkVaultStatus();
      return;
    }

    setLoading(true);
    try {
      const density = Taro.getStorageSync("heart_response_density") || "light";
      const note = await post("/notes", {
        content: text,
        plain_text: text,
        source_type: "emotion",
        metadata: { response_density: density }
      });

      try {
        await post("/functions/analyzeHeartSign", {
          note_id: note.id,
          note_data: { plain_text: text, content: text, metadata: { response_density: density } }
        }, { silent: true, timeout: 8000 });
      } catch (aiErr) {
        console.error("analyzeHeartSign failed", aiErr);
      }

      Taro.showToast({ title: "心签已保存", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 400);
    } catch (err) {
      Taro.showToast({ title: "保存失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  const saveToVault = async () => {
    const text = content.trim();
    if (!text) return;

    setLoading(true);
    try {
      const password = vaultStep === "setup" ? vaultNewPwd : vaultPwd;
      if (vaultStep === "setup") {
        if (vaultNewPwd.length < 4) {
          Taro.showToast({ title: "密码至少 4 位", icon: "none" });
          setLoading(false);
          return;
        }
        if (vaultNewPwd !== vaultConfirmPwd) {
          Taro.showToast({ title: "两次输入不一致", icon: "none" });
          setLoading(false);
          return;
        }
        await post("/vault/setup", { password: vaultNewPwd });
      }

      await post("/vault", {
        label: vaultLabel || "敏感信息",
        value: text,
        password
      });

      Taro.showToast({ title: "已加密存入保险柜", icon: "success" });
      setTimeout(() => Taro.navigateBack(), 600);
    } catch (err) {
      console.error("saveToVault failed", err);
      const msg = String(err?.message || "");
      Taro.showToast({ title: msg.includes("WRONG_PASSWORD") ? "密码错误" : "保存失败", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  const insertLink = () => {
    setContent((prev) => (prev ? prev + " https://" : "https://"));
  };

  const handleVoiceResult = (text) => {
    setContent((prev) => (prev ? prev + " " + text : text));
    setVoiceErrorCount(0);
  };

  const handleVoiceError = () => {
    setVoiceErrorCount((c) => c + 1);
    if (voiceErrorCount >= 1) {
      Taro.showModal({
        title: "语音输入提示",
        content: "当前语音服务不太稳定，建议直接输入文字。如果一直无法使用，请检查微信公众平台「WechatSI」插件是否已添加。",
        showCancel: false
      });
    }
  };

  return (
    <View style={{ minHeight: "100vh", background: theme.paper, display: "flex", flexDirection: "column" }}>
      <View
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24rpx 28rpx",
          borderBottom: `1rpx solid ${theme.border}`,
          background: theme.paper
        }}
      >
        <View onClick={() => Taro.navigateBack()}>
          <Text style={{ fontSize: "30rpx", color: theme.inkSecondary }}>✕</Text>
        </View>
        <Text style={{ fontSize: "32rpx", fontWeight: 700, color: theme.inkSecondary }}>心签</Text>
        <Button
          size="mini"
          loading={loading}
          disabled={!content.trim() || loading}
          onClick={submit}
          style={{
            margin: 0,
            padding: "0 24rpx",
            height: "56rpx",
            lineHeight: "56rpx",
            background: content.trim() && !loading ? theme.primary : theme.border,
            color: "#fff",
            borderRadius: "999rpx",
            fontSize: "26rpx"
          }}
        >
          发送
        </Button>
      </View>

      <View style={{ padding: "20rpx 28rpx" }}>
        <Text style={{ fontSize: "22rpx", color: theme.inkTertiary }}>发给自己 —— 什么都可以说……</Text>
      </View>

      <View style={{ flex: 1, padding: "0 28rpx" }}>
        <Textarea
          style={{
            width: "100%",
            minHeight: "480rpx",
            background: theme.card,
            borderRadius: "18rpx",
            padding: "28rpx",
            fontSize: "32rpx",
            color: theme.ink,
            lineHeight: "54rpx",
            boxSizing: "border-box",
            border: `1rpx solid ${theme.border}`
          }}
          placeholder="此刻的心情、刷到的好文章、怕忘的号码、想分享的瞬间……"
          value={content}
          maxlength={2000}
          autoHeight
          disableDefaultPadding
          showConfirmBar={false}
          onInput={(e) => setContent(e.detail.value)}
          onConfirm={submit}
        />
      </View>

      <View
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16rpx",
          padding: "20rpx 28rpx 48rpx",
          borderTop: `1rpx solid ${theme.border}`,
          background: theme.paper
        }}
      >
        <View
          onClick={insertLink}
          style={{
            width: "64rpx",
            height: "64rpx",
            borderRadius: "16rpx",
            background: theme.paper,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1rpx solid ${theme.border}`
          }}
        >
          <Text style={{ fontSize: "30rpx", color: theme.inkTertiary }}>🔗</Text>
        </View>
        <VoiceInput size={64} onResult={handleVoiceResult} onError={handleVoiceError} />
        <Text style={{ marginLeft: "auto", fontSize: "22rpx", color: theme.inkQuaternary }}>语音输入 · 链接 · 文字</Text>
      </View>

      {vaultMode && (
        <View
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40rpx"
          }}
          onClick={() => setVaultMode(false)}
        >
          <View
            style={{
              width: "100%",
              maxWidth: "600rpx",
              background: theme.card,
              borderRadius: "24rpx",
              padding: "40rpx",
              boxSizing: "border-box"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Text style={{ fontSize: "34rpx", fontWeight: 700, color: theme.inkSecondary, marginBottom: "16rpx" }}>
              检测到敏感信息
            </Text>
            <Text style={{ fontSize: "28rpx", color: theme.inkTertiary, lineHeight: "48rpx", marginBottom: "24rpx" }}>
              内容可能包含密码、证件号等敏感信息。存入加密保险柜后，不会进入 AI 分析管道，查看时需要输入保险柜密码。
            </Text>

            <Input
              style={{
                width: "100%",
                height: "88rpx",
                background: theme.paper,
                borderRadius: "12rpx",
                padding: "0 24rpx",
                fontSize: "30rpx",
                color: theme.ink,
                boxSizing: "border-box",
                marginBottom: "16rpx",
                border: `1rpx solid ${theme.border}`
              }}
              placeholder="标签，例如：Wi-Fi 密码"
              value={vaultLabel}
              onInput={(e) => setVaultLabel(e.detail.value)}
            />

            {vaultStep === "setup" && (
              <>
                <Input
                  style={{
                    width: "100%",
                    height: "88rpx",
                    background: theme.paper,
                    borderRadius: "12rpx",
                    padding: "0 24rpx",
                    fontSize: "30rpx",
                    color: theme.ink,
                    boxSizing: "border-box",
                    marginBottom: "16rpx",
                    border: `1rpx solid ${theme.border}`
                  }}
                  password
                  placeholder="设置保险柜密码（4 位以上）"
                  value={vaultNewPwd}
                  onInput={(e) => setVaultNewPwd(e.detail.value)}
                />
                <Input
                  style={{
                    width: "100%",
                    height: "88rpx",
                    background: theme.paper,
                    borderRadius: "12rpx",
                    padding: "0 24rpx",
                    fontSize: "30rpx",
                    color: theme.ink,
                    boxSizing: "border-box",
                    marginBottom: "24rpx",
                    border: `1rpx solid ${theme.border}`
                  }}
                  password
                  placeholder="再输入一次确认"
                  value={vaultConfirmPwd}
                  onInput={(e) => setVaultConfirmPwd(e.detail.value)}
                />
              </>
            )}

            {vaultStep === "unlock" && (
              <Input
                style={{
                  width: "100%",
                  height: "88rpx",
                  background: theme.paper,
                  borderRadius: "12rpx",
                  padding: "0 24rpx",
                  fontSize: "30rpx",
                  color: theme.ink,
                  boxSizing: "border-box",
                  marginBottom: "24rpx",
                  border: `1rpx solid ${theme.border}`
                }}
                password
                placeholder="输入保险柜密码"
                value={vaultPwd}
                onInput={(e) => setVaultPwd(e.detail.value)}
              />
            )}

            <View style={{ display: "flex", gap: "16rpx" }}>
              <Button
                size="mini"
                onClick={() => setVaultMode(false)}
                style={{
                  flex: 1,
                  height: "80rpx",
                  lineHeight: "80rpx",
                  background: theme.paper,
                  color: theme.inkSecondary,
                  borderRadius: "12rpx",
                  fontSize: "28rpx",
                  margin: 0,
                  border: `1rpx solid ${theme.border}`
                }}
              >
                取消
              </Button>
              <Button
                size="mini"
                loading={loading}
                disabled={loading}
                onClick={saveToVault}
                style={{
                  flex: 1,
                  height: "80rpx",
                  lineHeight: "80rpx",
                  background: theme.primary,
                  color: "#fff",
                  borderRadius: "12rpx",
                  fontSize: "28rpx",
                  margin: 0
                }}
              >
                存入保险柜
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
