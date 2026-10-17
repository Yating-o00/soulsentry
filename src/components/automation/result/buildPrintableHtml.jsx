// 把编辑后的 sections + title 渲染成一份独立的、A4 友好的可打印 HTML
// 支持通过 styleId 切换排版预设(深蓝商务/简约报告/手账记录/学术论文/杂志风)
// 风格的 cover/section HTML 模板 + CSS 来自 pdfStyles.js,本文件只负责数据装配与公共骨架

import { getPdfStyle } from "./pdfStyles";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 简易 Markdown 渲染:支持标题 / 加粗 / 列表 / 图片 / 段落 / 表格
function renderInline(text) {
  let s = String(text || "")
    .replace(/&lt;br\s*\/?&gt;/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/(!\[[^\]]*\])\s+(\()/g, "$1$2");
  // 图片
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_m, alt, url) => `<img src="${url}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;border-radius:6px;border:1px solid #e5e7eb;margin:8px 0;" />`);
  // 加粗
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // 换行
  s = s.replace(/\n/g, "<br/>");
  return s;
}

function renderMarkdownBlock(src) {
  const text = String(src || "");
  const hasHtml = /<\/?(div|p|h[1-6]|table|tr|td|th|ul|ol|li|figure|img|blockquote|section|article)(\s|>|\/)/i.test(text);
  if (hasHtml) return text;

  const lines = text.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length, 6);
      out.push(`<h${lvl}>${renderInline(h[2])}</h${lvl}>`);
      i++; continue;
    }
    if (/^\s*---+\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }
    const isUl = /^\s*[-*]\s+/.test(line);
    const isOl = /^\s*\d+\.\s+/.test(line);
    if (isUl || isOl) {
      const tag = isUl ? "ul" : "ol";
      const re = isUl ? /^\s*[-*]\s+(.*)$/ : /^\s*\d+\.\s+(.*)$/;
      const items = [];
      while (i < lines.length && (isUl ? /^\s*[-*]\s+/.test(lines[i]) : /^\s*\d+\.\s+/.test(lines[i]))) {
        const m = lines[i].match(re);
        items.push(`<li>${renderInline(m ? m[1] : lines[i])}</li>`);
        i++;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^\s*---+\s*$/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      out.push(`<p>${renderInline(paraLines.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

// 公共基础样式(所有风格共用 — 重置、表格骨架、图片等)
const BASE_CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 18px 14px; font-size: 13px; line-height: 1.75; }
  h1, h2, h3, h4 { margin-top: 0; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0 6px 22px; padding: 0; }
  li { margin: 3px 0; }
  strong { color: #0f172a; }
  hr { border: 0; border-top: 1px dashed #e2e8f0; margin: 14px 0; }
  img { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e5e7eb; margin: 10px 0; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 12px 0; font-size: 12px; }
  th, td { border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 7px 10px; text-align: left; vertical-align: top; }
  th:last-child, td:last-child { border-right: 0; }
  tr:last-child td { border-bottom: 0; }
  blockquote p { margin: 4px 0; }
  .rr-section { page-break-inside: auto; }
`;

export function buildPrintableHtml({ title, sections, body, styleId }) {
  const style = getPdfStyle(styleId);
  const safeTitle = escapeHtml(title || "调研报告");
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
  const sectionCount = Array.isArray(sections) ? sections.length : 1;

  // 从首章节取一句话作副标题
  let subtitle = "";
  if (Array.isArray(sections) && sections.length > 0) {
    const firstBody = sections[0].body || sections[0].content || "";
    subtitle = String(firstBody)
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")             // 剥掉所有 HTML 标签,避免源码显示在封面副标题
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // 移除 markdown 图片
      .replace(/&nbsp;/gi, " ")
      .replace(/[#*`>_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90);
    if (subtitle.length === 90) subtitle += "…";
  }
  subtitle = escapeHtml(subtitle);

  const meta = { dateStr, chapterCount: sectionCount };

  const coverHtml = style.cover({ safeTitle, subtitle, meta });

  const sectionHtml = Array.isArray(sections) && sections.length > 0
    ? sections.map((s, idx) => {
        const headingKey = s.heading !== undefined ? "heading" : "title";
        const contentKey = s.body !== undefined ? "body" : "content";
        const heading = escapeHtml(s[headingKey] || `章节 ${idx + 1}`);
        const bodyHtml = renderMarkdownBlock(s[contentKey] || "");
        const num = String(idx + 1).padStart(2, "0");
        return style.section({ num, heading, body: bodyHtml });
      }).join("\n")
    : `<section class="rr-section"><div class="rr-body">${renderMarkdownBlock(body || "")}</div></section>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>${BASE_CSS}${style.css}</style>
</head>
<body>
  ${coverHtml}
  ${sectionHtml}
</body>
</html>`;
}