import fs from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { env } from "../config/env.js";
import { analyzeImage } from "./analyzeImage.js";

// Agent 读附件的统一入口：文件提文本（pdf/docx/xlsx/txt/html/csv 等），图片走视觉识别管线。
// 供心流对话、协同空间 Agent、自动执行等需要"读用户附件"的管道复用。

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ATTACHMENT_CHARS = 8000;

// /uploads/xxx 或 uploads/xxx → 磁盘绝对路径；防目录穿越，只允许纯文件名
export function resolveUploadPath(fileUrl) {
  let raw = String(fileUrl || "").trim();
  if (raw.startsWith("/")) raw = raw.slice(1);
  if (!raw.startsWith("uploads/")) return null;
  const name = decodeURIComponent(raw.slice("uploads/".length)).split("/")[0];
  if (!name || name.includes("..")) return null;
  return path.resolve(process.cwd(), env.UPLOAD_DIR, name);
}

/**
 * 提取文件文本内容，返回带【文件名】包装的字符串；失败/不支持时返回兜底说明而不抛错。
 * @param {string} fileUrl /uploads/ 形式的地址
 * @param {string} fileName 展示用文件名
 */
export async function extractFileText(fileUrl, fileName) {
  try {
    const displayName = fileName || "未知文件";
    const filePath = resolveUploadPath(fileUrl);
    if (!filePath || !fs.existsSync(filePath)) return null;

    const ext = path.extname(fileName || filePath).toLowerCase();
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return `【${displayName}】文件过大，仅作为背景参考`;
    }

    let text = "";
    if ([".txt", ".md", ".csv", ".json", ".js", ".jsx", ".ts", ".tsx", ".log"].includes(ext)) {
      text = fs.readFileSync(filePath, "utf8");
    } else if ([".html", ".htm"].includes(ext)) {
      text = fs.readFileSync(filePath, "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    } else if (ext === ".pdf") {
      const buffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(buffer);
      text = parsed.text || "";
    } else if (ext === ".docx") {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || "";
    } else if ([".xlsx", ".xls"].includes(ext)) {
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer, { type: "buffer" });
      text = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        return `【工作表：${name}】\n${XLSX.utils.sheet_to_csv(sheet)}`;
      }).join("\n\n");
    } else {
      return `【${displayName}】不支持的文件类型，仅作为背景参考`;
    }

    text = text.replace(/\s+/g, " ").trim();
    if (text.length > MAX_ATTACHMENT_CHARS) {
      text = text.slice(0, MAX_ATTACHMENT_CHARS) + `\n...（已截断，原文件共 ${stat.size} 字节）`;
    }
    if (!text) return `【${displayName}】文件内容为空，仅作为背景参考`;
    return `【${displayName}】\n${text}`;
  } catch (err) {
    console.error("[readAttachment] extractFileText error:", err?.message || err);
    return `【${fileName || "未知文件"}】文件内容提取失败，仅作为背景参考`;
  }
}

/**
 * 图片内容识别：复用 analyzeImage 视觉管线（OCR 转录 + 结构化摘要），失败返回 null。
 */
export async function extractImageText(fileUrl, fileName) {
  try {
    const r = await analyzeImage({ fileUrl });
    if (!r) return null;
    const suggestion = r.suggestion && typeof r.suggestion === "object"
      ? (r.suggestion.summary || r.suggestion.title || "")
      : "";
    const desc = [r.extracted_text, suggestion].filter(Boolean).join("；").trim();
    if (!desc) return null;
    return `【${fileName || "图片"}】\n${desc.slice(0, MAX_ATTACHMENT_CHARS)}`;
  } catch (err) {
    console.warn("[readAttachment] extractImageText failed:", err?.message || err);
    return null;
  }
}

/**
 * 统一入口：按附件类型分发到文件/图片提取。
 * @param {object} att { url, name, type, size }
 * @returns {Promise<string|null>} 带【文件名】包装的内容；无法读取返回 null
 */
export async function readAttachmentText(att) {
  const url = String(att?.url || att?.file_url || "");
  const name = String(att?.name || att?.file_name || "附件").slice(0, 120);
  const type = String(att?.type || att?.file_type || "");
  if (!url) return null;
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
    return extractImageText(url, name);
  }
  return extractFileText(url, name);
}
