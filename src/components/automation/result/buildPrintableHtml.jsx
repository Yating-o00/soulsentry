// 把编辑后的 sections + title 渲染成一份独立的、A4 友好的可打印 HTML
// 用于 PdfExportPreviewDialog 的 inlineHtml 参数,保证用户在 ResearchResultView 里
// 编辑/切换模板的内容能"所见即所得"地导出为 PDF,而不是导出后端生成的旧 file_url。

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 简易 Markdown 渲染:支持标题 / 加粗 / 列表 / 图片 / 段落 / 表格
// 与 ResearchResultView 的 MarkdownLite 大致对齐,但输出独立 HTML,不依赖 React。
function renderInline(text) {
  let s = String(text || "")
    .replace(/&lt;br\s*\/?&gt;/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/(!\[[^\]]*\])\s+(\()/g, "$1$2");
  // 图片
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_m, alt, url) => `<img src="${url}" alt="${escapeHtml(alt)}" style="max-width:100%;height:auto;border-radius:6px;border:1px solid #e5e7eb;margin:8px 0;" />`);
  // 把 ![alt](url) 已替换后,剩余文本里的 < > 不在我们生成的标签内 — 但 AI 可能直接给出原生 HTML 标签(<table>/<h1>...)
  // 这里保留原样,不再二次转义,避免把 AI 输出的合法标签变成字面字符。
  // 加粗
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // 换行
  s = s.replace(/\n/g, "<br/>");
  return s;
}

function renderMarkdownBlock(src) {
  const text = String(src || "");
  // 已经像 HTML 就直接返回(AI 偶尔直接给 <div>/<table>)
  const hasHtml = /<\/?(div|p|h[1-6]|table|tr|td|th|ul|ol|li|figure|img|blockquote|section|article)(\s|>|\/)/i.test(text);
  if (hasHtml) return text;

  const lines = text.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length, 6);
      out.push(`<h${lvl}>${renderInline(h[2])}</h${lvl}>`);
      i++; continue;
    }
    // 分隔线
    if (/^\s*---+\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }
    // 列表
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
    // 普通段落:合并相邻非块行
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

// 主入口:把 ResearchResultView 当前展示的 title + sections(或 body)拼成 A4 友好的 HTML 文档
// 设计:深蓝渐变标题卡(Hero) + 编号章节卡片(每节带 01/02 角标)+ 柔和的提示框 / 表格 / 引用样式
export function buildPrintableHtml({ title, sections, body }) {
  const safeTitle = escapeHtml(title || "调研报告");
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
  const sectionCount = Array.isArray(sections) ? sections.length : 1;

  // 从首章节取一句话作副标题(去 markdown 标记,截断)
  let subtitle = "";
  if (Array.isArray(sections) && sections.length > 0) {
    const firstBody = sections[0].body || sections[0].content || "";
    subtitle = String(firstBody)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/[#*`>_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90);
    if (subtitle.length === 90) subtitle += "…";
  }

  const sectionHtml = Array.isArray(sections) && sections.length > 0
    ? sections.map((s, idx) => {
        const headingKey = s.heading !== undefined ? "heading" : "title";
        const contentKey = s.body !== undefined ? "body" : "content";
        const heading = s[headingKey] || `章节 ${idx + 1}`;
        const content = s[contentKey] || "";
        const num = String(idx + 1).padStart(2, "0");
        return `<section class="rr-section">
  <div class="rr-section-head">
    <span class="rr-num">${num}</span>
    <h2>${escapeHtml(heading)}</h2>
  </div>
  <div class="rr-body">${renderMarkdownBlock(content)}</div>
</section>`;
      }).join("\n")
    : `<section class="rr-section"><div class="rr-body">${renderMarkdownBlock(body || "")}</div></section>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f5f7fb; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { padding: 18px 14px; font-size: 13px; line-height: 1.75; }

  /* Hero 标题卡 —— 深蓝渐变 */
  .rr-hero {
    position: relative;
    background: linear-gradient(135deg, #2b3a6b 0%, #3b4f8a 55%, #4a63a8 100%);
    border-radius: 18px;
    padding: 34px 32px 28px;
    color: #fff;
    margin-bottom: 22px;
    overflow: hidden;
    box-shadow: 0 8px 24px -10px rgba(43, 58, 107, 0.45);
  }
  .rr-hero::before {
    content: "";
    position: absolute; right: -60px; top: -60px;
    width: 220px; height: 220px;
    background: radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%);
    border-radius: 50%;
  }
  .rr-hero::after {
    content: "";
    position: absolute; left: -40px; bottom: -40px;
    width: 160px; height: 160px;
    background: radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 70%);
    border-radius: 50%;
  }
  .rr-hero h1 {
    font-size: 24px;
    line-height: 1.35;
    margin: 0 0 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #fff;
    border: 0;
    padding: 0;
    position: relative;
  }
  .rr-hero .rr-subtitle {
    font-size: 12.5px;
    line-height: 1.7;
    color: rgba(255,255,255,0.82);
    margin-bottom: 18px;
    position: relative;
  }
  .rr-hero .rr-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    position: relative;
  }
  .rr-hero .rr-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(255,255,255,0.16);
    border: 1px solid rgba(255,255,255,0.22);
    color: #fff;
    padding: 5px 11px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    backdrop-filter: blur(4px);
  }

  /* 章节卡片 */
  .rr-section {
    background: #fff;
    border-radius: 14px;
    padding: 22px 24px 20px;
    margin-bottom: 14px;
    border: 1px solid #eaeef5;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    page-break-inside: auto;
  }
  .rr-section-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 0;
    page-break-after: avoid;
  }
  .rr-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px; height: 30px;
    border-radius: 8px;
    background: #eef2ff;
    color: #3b4f8a;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }
  .rr-section h2 {
    font-size: 16px;
    color: #1e293b;
    margin: 0;
    padding: 0;
    border: 0;
    font-weight: 600;
    line-height: 1.4;
  }
  .rr-body { color: #334155; }
  .rr-body h2 {
    font-size: 15px;
    color: #1e293b;
    margin: 18px 0 8px;
    padding: 0;
    border: 0;
    font-weight: 600;
  }
  .rr-body h3 {
    font-size: 13.5px;
    color: #334155;
    margin: 14px 0 6px;
    font-weight: 600;
  }
  .rr-body h4 {
    font-size: 13px;
    color: #475569;
    margin: 10px 0 4px;
    font-weight: 600;
  }
  .rr-body p { margin: 6px 0; }
  .rr-body ul, .rr-body ol { margin: 6px 0 6px 22px; padding: 0; }
  .rr-body li { margin: 3px 0; }
  .rr-body li::marker { color: #3b4f8a; }
  .rr-body strong { color: #0f172a; }
  .rr-body hr { border: 0; border-top: 1px dashed #e2e8f0; margin: 14px 0; }
  .rr-body img { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e5e7eb; margin: 10px 0; }

  /* 表格 */
  .rr-body table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 12px 0;
    font-size: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
  }
  .rr-body th, .rr-body td {
    border-bottom: 1px solid #e2e8f0;
    border-right: 1px solid #e2e8f0;
    padding: 7px 10px;
    text-align: left;
    vertical-align: top;
  }
  .rr-body th:last-child, .rr-body td:last-child { border-right: 0; }
  .rr-body tr:last-child td { border-bottom: 0; }
  .rr-body th {
    background: #f1f5fa;
    font-weight: 600;
    color: #334155;
  }
  .rr-body tr:nth-child(even) td { background: #fafbfd; }

  /* 引用 / 提示框 —— 左侧蓝色竖条 + 浅灰背景 */
  .rr-body blockquote {
    border-left: 3px solid #3b4f8a;
    background: #f5f7fb;
    padding: 10px 14px;
    border-radius: 0 8px 8px 0;
    color: #475569;
    margin: 10px 0;
  }
  .rr-body blockquote p { margin: 4px 0; }
</style>
</head>
<body>
  <div class="rr-hero">
    <h1>${safeTitle}</h1>
    ${subtitle ? `<div class="rr-subtitle">${escapeHtml(subtitle)}</div>` : ""}
    <div class="rr-meta">
      <span class="rr-chip">📅 ${dateStr}</span>
      <span class="rr-chip">📑 ${sectionCount} 个章节</span>
      <span class="rr-chip">心栈 SoulSentry</span>
    </div>
  </div>
  ${sectionHtml}
</body>
</html>`;
}