// 心签转发封面（服务端生成）：Node 侧完成排版（折行/布局），
// 交给 backend/scripts/noteCover.py（Pillow + 文泉驿正黑）渲染 1280×1024 PNG。
// 客户端离屏 canvas 在部分设备上不生效（转发缩略图一直落到默认图），
// 封面改由服务器确定性生成，微信分享直接拉取本站 URL，任何设备都必然成功。
import { Router } from "express";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/prisma.js";

const W = 1280;
const H = 1024;
const INK = "#2f3a55";
const INK_SOFT = "rgba(47,58,85,0.66)";
const INK_FAINT = "rgba(47,58,85,0.45)";
const SEAL_RED = "#c0453a";
const RENDERER = fileURLToPath(new URL("../../scripts/noteCover.py", import.meta.url));

const TYPE_META = {
  emotion: { label: "情绪", color: "#c97b8a" },
  inspiration: { label: "灵感", color: "#d97706" },
  material: { label: "资料", color: "#5b82a0" },
  memo: { label: "备忘", color: "#8a7d6b" },
  share: { label: "分享", color: "#6e8a73" },
  ledger: { label: "账本", color: "#a08452" }
};

function getNoteType(note) {
  const st = note.sourceType;
  if (TYPE_META[st]) return st;
  const cat = note.metadata?.ai_analysis?.category;
  const map = { 情绪: "emotion", 灵感: "inspiration", 资料: "material", 备忘: "memo", 分享: "share", 账本: "ledger" };
  if (map[cat]) return map[cat];
  return "emotion";
}

// 显示宽度估算：CJK 记 1，ASCII 记 0.56（服务端无 canvas measureText）
const dispWidth = (s) => Array.from(s).reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 1 : 0.56), 0);

function wrapText(text, fontSize, maxWidth, maxLines) {
  const maxUnits = maxWidth / fontSize;
  const chars = Array.from(String(text || "").trim());
  const lines = [];
  let line = "";
  let overflow = false;
  for (const ch of chars) {
    if (dispWidth(line + ch) > maxUnits && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) {
        overflow = true;
        break;
      }
    } else {
      line += ch;
    }
  }
  if (!overflow && line) lines.push(line);
  if (overflow) {
    let last = lines[maxLines - 1] || "";
    while (last && dispWidth(`${last}…`) > maxUnits) last = Array.from(last).slice(0, -1).join("");
    lines[maxLines - 1] = `${last}…`;
  }
  return lines.slice(0, maxLines);
}

// 白色底极简装帧（与小程序端签卡封面同一版式语言，明暗两套）
function noteCoverElements({ typeLabel, typeColor, dateStr, content, response }) {
  const pad = 96;
  const els = [
    { t: "rect", xy: [28, 28, W - 56, H - 56], outline: "rgba(47,58,85,0.28)", width: 2 },
    { t: "rect", xy: [44, 44, W - 88, H - 88], outline: "rgba(47,58,85,0.12)", width: 1 },
    { t: "text", x: pad, y: 124, size: 28, fill: INK_SOFT, text: "心栈 · SOULSENTRY" },
    // 朱砂「心签」印章（右上）
    { t: "circle", cx: W - 104, cy: 112, r: 44, outline: SEAL_RED, width: 3 },
    { t: "circle", cx: W - 104, cy: 112, r: 34, outline: SEAL_RED, width: 1 },
    { t: "textCenter", x: W - 104, y: 104, size: 20, fill: SEAL_RED, text: "心" },
    { t: "textCenter", x: W - 104, y: 128, size: 20, fill: SEAL_RED, text: "签" },
    { t: "text", x: pad, y: 224, size: 28, fill: typeColor, text: typeLabel },
    { t: "text", x: pad + dispWidth(typeLabel) * 28 + 12, y: 224, size: 28, fill: INK_FAINT, text: dateStr ? ` · ${dateStr}` : "" }
  ];

  // 签的正文（主角）：大字报式，缩略图尺度可辨；有回应时限 2 行，无回应 3 行
  const lines = wrapText(content, 64, W - pad * 2, response ? 2 : 3);
  let y = 316;
  lines.forEach((line) => {
    els.push({ t: "text", x: pad, y, size: 64, fill: INK, text: line, stroke: 1 });
    y += 100;
  });

  if (response) {
    const ruleY = y + 8;
    els.push({ t: "line", x1: pad, y1: ruleY, x2: W - pad, y2: ruleY, fill: "rgba(47,58,85,0.16)", width: 1 });
    els.push({ t: "text", x: pad, y: ruleY + 42, size: 24, fill: INK_FAINT, text: "—— 心栈回应" });
    const respLines = wrapText(response, 34, W - pad * 2, 2);
    let ry = ruleY + 92;
    respLines.forEach((line) => {
      els.push({ t: "text", x: pad, y: ry, size: 34, fill: INK_SOFT, text: line });
      ry += 56;
    });
  }

  els.push({ t: "text", x: pad, y: 932, size: 28, fill: INK_FAINT, text: "—— 心栈 · 从容地记住每一声心动" });
  return els;
}

function renderCover(payload) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "python3",
      [RENDERER],
      { maxBuffer: 16 * 1024 * 1024, timeout: 15000 },
      (err, stdout, stderr) => {
        if (err) return reject(err);
        if (!stdout || stdout.length < 100) return reject(new Error(`empty render output: ${stderr || ""}`));
        resolve(stdout);
      }
    );
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

// noteId → { updatedAt, buffer }，按 note.updatedAt 失效
const coverCache = new Map();
const CACHE_MAX = 500;

export const shareCoverRouter = Router();

// GET /api/public/share/cover/note/:id.png —— 微信分享封面图（需签已开启分享）
shareCoverRouter.get("/cover/note/:id.png", async (req, res) => {
  try {
    const note = await prisma.note.findFirst({
      where: { id: String(req.params.id || ""), deletedAt: null, shareEnabled: true }
    });
    if (!note) return res.status(404).end();
    const updatedAt = note.updatedAt?.getTime?.() || 0;
    const cached = coverCache.get(note.id);
    if (cached && cached.updatedAt === updatedAt && cached.buffer) {
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(cached.buffer);
    }

    const meta = TYPE_META[getNoteType(note)] || { label: "心签", color: "#c97b8a" };
    const raw = (note.plainText || (note.content || "").replace(/<[^>]+>/g, "") || note.title || "").trim();
    const text = raw.replace(/\s+/g, " ");
    if (!text) return res.status(404).end(); // 纯图签：客户端会用配图
    const d = note.createdAt;
    const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    const buffer = await renderCover({
      w: W,
      h: H,
      bg: "#fbfaf7",
      elements: noteCoverElements({
        typeLabel: `${meta.label}签`,
        typeColor: meta.color,
        dateStr,
        content: text,
        response: note.metadata?.ai_analysis?.emotional_response || ""
      })
    });
    coverCache.set(note.id, { updatedAt, buffer });
    if (coverCache.size > CACHE_MAX) coverCache.delete(coverCache.keys().next().value);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(buffer);
  } catch (e) {
    console.error("[shareCover] render failed:", e?.message || e);
    return res.status(503).end();
  }
});
