import { Router } from "express";
import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { getNlsToken } from "../services/nlsToken.js";

export const voiceRouter = Router();

const NLS_GATEWAY = "https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr";
const ALLOWED_FORMATS = new Set(["pcm", "wav", "opus", "speex", "amr", "mp3", "aac"]);
const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 一句话识别上限 1 分钟音频，2MB 足够

// 移动端 Web Speech API 在国内网络不可用的兜底：
// 前端 MediaRecorder 录音（ogg/opus 或 mp4/aac）→ 后端转交阿里云一句话识别
voiceRouter.post("/transcribe", requireAuth, express.raw({ type: "*/*", limit: MAX_AUDIO_BYTES }), async (req, res) => {
  const appkey = process.env.ALIYUN_NLS_APPKEY;
  if (!appkey) {
    return res.status(501).json({ error: "VOICE_NOT_CONFIGURED", message: "语音服务未开通" });
  }

  const format = ALLOWED_FORMATS.has(req.query.format) ? req.query.format : "opus";
  const sampleRate = req.query.sample_rate === "8000" ? "8000" : "16000";
  const audio = req.body;
  if (!Buffer.isBuffer(audio) || audio.length < 200) {
    return res.status(400).json({ error: "INVALID_AUDIO", message: "音频数据为空或过短" });
  }

  try {
    const token = await getNlsToken();
    const query = new URLSearchParams({
      appkey,
      format,
      sample_rate: sampleRate,
      enable_punctuation_prediction: "true",
      enable_inverse_text_normalization: "true",
      disfluency: "true"
    });
    const resp = await fetch(`${NLS_GATEWAY}?${query}`, {
      method: "POST",
      headers: {
        "X-NLS-Token": token,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(audio.length)
      },
      body: audio,
      signal: AbortSignal.timeout(30000)
    });
    const data = await resp.json().catch(() => ({}));
    if (data.status === 20000000) {
      return res.json({ text: data.result || "" });
    }
    console.error("[voice/transcribe] NLS error:", data.status, data.message, "task:", data.task_id);
    return res.status(502).json({
      error: "RECOGNIZE_FAILED",
      message: data.message || "语音识别失败",
      task_id: data.task_id
    });
  } catch (e) {
    console.error("[voice/transcribe] failed:", e?.message || e);
    return res.status(502).json({ error: "RECOGNIZE_FAILED", message: "语音识别服务暂不可用" });
  }
});
