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
export function buildPrintableHtml({ title, sections, body }) {
  const safeTitle = escapeHtml(title || "调研报告");
  const sectionHtml = Array.isArray(sections) && sections.length > 0
    ? sections.map((s, idx) => {
        const headingKey = s.heading !== undefined ? "heading" : "title";
        const contentKey = s.body !== undefined ? "body" : "content";
        const heading = s[headingKey] || `章节 ${idx + 1}`;
        const content = s[contentKey] || "";
        return `<section class="rr-section">
  <h2>${escapeHtml(heading)}</h2>
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
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
  body { padding: 28px 36px; font-size: 13.5px; line-height: 1.7; }
  h1 { font-size: 24px; margin: 0 0 18px; padding-bottom: 12px; border-bottom: 2px solid #1f2937; color: #0f172a; }
  h2 { font-size: 17px; margin: 24px 0 10px; color: #1e293b; padding-left: 10px; border-left: 4px solid #3b82f6; }
  h3 { font-size: 14.5px; margin: 16px 0 6px; color: #334155; }
  p { margin: 8px 0; }
  ul, ol { margin: 6px 0 6px 22px; padding: 0; }
  li { margin: 3px 0; }
  strong { color: #0f172a; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 14px 0; }
  img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #e5e7eb; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12.5px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; }
  blockquote { border-left: 3px solid #cbd5e1; padding-left: 10px; color: #64748b; margin: 8px 0; }
  .rr-section { margin-bottom: 18px; page-break-inside: auto; }
  .rr-section h2 { page-break-after: avoid; }
  .rr-body { page-break-inside: auto; }
  figure { margin: 8px 0; }
</style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${sectionHtml}
</body>
</html>`;
}