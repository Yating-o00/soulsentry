import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { callKimiChat, invokeKimiText, parseModelJson } from "../lib/kimi.js";

// 视觉模型候选：按顺序逐个尝试，全部失败才报错
const VISION_MODELS = ["moonshot-v1-8k-vision-preview", "moonshot-v1-32k-vision-preview", "kimi-latest"];
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

const SYSTEM_PROMPT = `你是「心栈 SoulSentry」的图片识别助手。用户拍照或上传了一张图片，请你：
1. 忠实转录图片中的全部文字（OCR），保持原有结构和数字准确；
2. 判断这张图最适合沉淀成什么内容，并把关键信息整理成结构化草稿。

只输出 JSON，格式：
{
  "extracted_text": "图中全部文字的转录",
  "content_type": "task | note | heart | ledger | link | other",
  "confidence": 0到1之间的数字,
  "suggestion": { ... }
}

content_type 判定规则：
- task：图中含有待办/日程/会议/就诊/服药/截止日期等需要提醒或执行的事项（如白板、便签、药盒说明、账单缴费单、海报活动信息）
- ledger：图中是消费/收支明细（如购物小票、账单、外卖订单、记账截图）
- heart：图中文字偏心情/感悟/想对自己说的话
- note：图中是需要留存的资料信息（如说明书要点、联系方式、地址、文章截图、名片）
- link：图的核心是一个网址/二维码指向的链接
- other：以上都不是

suggestion 按类型给字段：
- task: {"title","description","date":"YYYY-MM-DD","time":"HH:mm","end_time":"ISO8601或空","priority":"low|medium|high|urgent","category":"work|health|family|personal|shopping|learning|finance","subtasks":["..."]}；date/time 从图中信息推断，推断不出就填空字符串，不要编造
- ledger: {"summary":"一句话说明","entries":[{"item":"品名","category":"餐饮|交通|购物|居住|娱乐|医疗|收入|其他","amount":数字,"note":""}]}；金额必须是图中出现的数字
- note/heart/link: {"title","content","tags":["..."]}，content 默认用转录文字提炼

拿不准的字段留空或给默认值，不要编造图中没有的信息。`;

// 视觉模型全部不可用时的兜底：阿里云文字识别 OCR（纯文本），再交 Kimi 分类结构化
const TEXT_FALLBACK_PROMPT = `以下是用户图片经 OCR 得到的转录文本（可能有个别错字）：
"""
{ocrText}
"""
请基于这段转录文本完成与图片模式相同的分类与结构化，extracted_text 直接填这段转录文本。`;

function getAliyunOcrCredentials() {
  const keyId = process.env.ALIYUN_OCR_ACCESS_KEY_ID
    || process.env.ALIYUN_SMS_ACCESS_KEY_ID
    || process.env.SMS_ACCESS_KEY_ID;
  const secret = process.env.ALIYUN_OCR_ACCESS_KEY_SECRET
    || process.env.ALIYUN_SMS_ACCESS_KEY_SECRET
    || process.env.SMS_ACCESS_KEY_SECRET;
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

function percentEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

// 阿里云 RPC API V1 签名（HMAC-SHA1）
async function ocrWithAliyun(filePath) {
  const creds = getAliyunOcrCredentials();
  if (!creds) return null;

  const base64 = fs.readFileSync(filePath).toString("base64");
  const params = {
    AccessKeyId: creds.keyId,
    Action: process.env.ALIYUN_OCR_ACTION || "RecognizeGeneral",
    Format: "JSON",
    ImageBase64: base64,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: process.env.ALIYUN_OCR_VERSION || "2018-12-10"
  };

  // 签名覆盖全部参数，但参数放 POST body（x-www-form-urlencoded），
  // 避免 base64 图片塞进 URL 查询串导致网关返回 HTML 错误页
  const sortedBody = Object.keys(params).sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");
  const stringToSign = `POST&%2F&${percentEncode(sortedBody)}`;
  const signature = crypto.createHmac("sha1", `${creds.secret}&`)
    .update(stringToSign)
    .digest("base64");
  const url = `https://ocr-api.${process.env.ALIYUN_OCR_REGION || "cn-hangzhou"}.aliyuncs.com/?Signature=${percentEncode(signature)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: sortedBody,
    signal: AbortSignal.timeout(30000)
  });
  const raw = await response.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (_e) {
    const error = new Error(`阿里云 OCR 返回异常（HTTP ${response.status}）：${raw.slice(0, 120)}`);
    error.status = 502;
    throw error;
  }
  if (!response.ok || data?.Code) {
    const error = new Error(`阿里云 OCR 错误：${data?.Message || data?.Code || response.status}`);
    error.status = 502;
    throw error;
  }

  const lines = Array.isArray(data?.data) ? data.data : [];
  const text = lines
    .map((l) => (typeof l === "string" ? l : (l?.text || l?.word || "")))
    .filter(Boolean)
    .join("\n");
  if (!text.trim()) {
    const error = new Error("图片中没有识别到文字");
    error.status = 422;
    throw error;
  }
  return text;
}

function resolveUploadPath(fileUrl) {
  const raw = String(fileUrl || "").trim();
  if (!raw.startsWith("/uploads/")) return null;
  // 防目录穿越：只允许纯文件名
  const name = decodeURIComponent(raw.slice("/uploads/".length)).split("/")[0];
  if (!name || name.includes("..")) return null;
  return path.resolve(process.cwd(), env.UPLOAD_DIR, name);
}

function normalizeDraft(result) {
  const type = ["task", "note", "heart", "ledger", "link", "other"].includes(result?.content_type)
    ? result.content_type
    : "note";
  const suggestion = result?.suggestion && typeof result.suggestion === "object" ? result.suggestion : {};
  return {
    extracted_text: String(result?.extracted_text || ""),
    content_type: type,
    confidence: typeof result?.confidence === "number" ? result.confidence : null,
    suggestion
  };
}

export async function analyzeImage({ fileUrl }) {
  const filePath = resolveUploadPath(fileUrl);
  if (!filePath) {
    const error = new Error("无效的图片地址");
    error.status = 400;
    throw error;
  }
  if (!fs.existsSync(filePath)) {
    const error = new Error("图片文件不存在或已过期，请重新上传");
    error.status = 400;
    throw error;
  }

  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    const error = new Error("图片过大，请压缩后重新上传");
    error.status = 400;
    throw error;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || "image/jpeg";
  const dataUri = `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: "请识别这张图并给出结构化草稿。" },
        { type: "image_url", image_url: { url: dataUri } }
      ]
    }
  ];

  let lastError = null;
  for (const model of VISION_MODELS) {
    try {
      const result = await callKimiChat({
        messages,
        model,
        responseJsonSchema: true,
        temperature: 0.2,
        maxTokens: 4000,
        fetchTimeout: 45000
      });
      return normalizeDraft(parseModelJson(result.content));
    } catch (error) {
      lastError = error;
      console.log(`[analyzeImage] model ${model} failed: ${error?.message || error}`);
    }
  }

  // 视觉模型不可用（key 未开通）：降级为阿里云 OCR 提文字 + Kimi 文本分类
  console.log("[analyzeImage] vision models unavailable, fallback to Aliyun OCR");
  try {
    const ocrText = await ocrWithAliyun(filePath);
    if (!ocrText) {
      const error = new Error("图片识别暂不可用：请联系管理员配置阿里云 OCR（ALIYUN_OCR_ACCESS_KEY_ID/SECRET）");
      error.status = 503;
      throw error;
    }
    const prompt = TEXT_FALLBACK_PROMPT.replace("{ocrText}", ocrText);
    const result = await invokeKimiText({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      responseJsonSchema: true,
      temperature: 0.2,
      fetchTimeout: 30000
    });
    return normalizeDraft({ ...result, extracted_text: result?.extracted_text?.trim() ? result.extracted_text : ocrText });
  } catch (error) {
    if (error?.status) throw error;
    console.error("[analyzeImage] OCR fallback failed", error);
    const err = new Error("图片识别暂不可用，请稍后重试或手动输入");
    err.status = 502;
    err.cause = lastError?.message;
    throw err;
  }
}
