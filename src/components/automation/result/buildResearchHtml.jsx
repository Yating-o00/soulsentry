// 把 ResearchResultView 当前编辑中的 title + sections 拼成一份独立的、带 A4 打印样式的 HTML
// —— 用于 PDF 预览/导出,让"修改后立即同步到 PDF"。
// 注意:这里不依赖外部 Markdown 库,做最常用的转换即可(标题/加粗/列表/图片/段落/换行)。

const esc = (s) => String(s || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

function looksLikeHtml(s) {
  if (!s) return false;
  const m = String(s).match(/<\/?(div|section|article|h[1-6]|p|table|tr|td|th|ul|ol|li|img|br|strong|span|blockquote)(\s|>|\/)/gi);
  return !!(m && m.length >= 2);
}

// 极简 Markdown -> HTML(够 PDF 排版用)
function mdToHtml(src) {
  if (!src) return "";
  if (looksLikeHtml(src)) return String(src);

  const lines = String(src).split(/\r?\n/);
  const out = [];
  let i = 0;
  const flushPara = (buf) => {
    if (!buf.length) return;
    let html = esc(buf.join(" "));
    // 加粗
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // 图片 ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) =>
      `<img src="${url}" alt="${alt}" />`);
    out.push(`<p>${html}</p>`);
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length, 6);
      let txt = esc(h[2]).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      out.push(`<h${lvl}>${txt}</h${lvl}>`);
      i++;
      continue;
    }

    // 独立图片行
    const img = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    if (img) {
      out.push(`<figure><img src="${img[2]}" alt="${img[1]}" />${img[1] ? `<figcaption>${esc(img[1])}</figcaption>` : ""}</figure>`);
      i++;
      continue;
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
        let txt = esc(m ? m[1] : lines[i]).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        items.push(`<li>${txt}</li>`);
        i++;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    // 普通段落:合并相邻非空行
    const buf = [];
    while (i < lines.length && lines[i].trim()
      && !/^#{1,6}\s+/.test(lines[i])
      && !/^\s*[-*]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
      && !/^\s*---+\s*$/.test(lines[i])
      && !/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    flushPara(buf);
  }
  return out.join("\n");
}

// 把 sections / title / 模板拼成完整 HTML(独立文档,可直接给 iframe srcDoc 使用)
export function buildResearchHtml({ title, sections, body }) {
  const safeTitle = esc(title || "调研报告");
  let inner = "";
  if (Array.isArray(sections) && sections.length > 0) {
    inner = sections.map((s) => {
      const heading = esc(s?.heading || s?.title || "");
      const content = mdToHtml(s?.body || s?.content || "");
      return `<section class="rs-section">
        ${heading ? `<h2>${heading}</h2>` : ""}
        <div class="rs-body">${content}</div>
      </section>`;
    }).join("\n");
  } else if (body) {
    inner = `<div class="rs-body">${mdToHtml(body)}</div>`;
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif;
    color: #1f2937;
    line-height: 1.7;
    font-size: 13px;
    margin: 0;
    padding: 24px 28px;
    background: #fff;
  }
  h1.rs-title {
    font-size: 22px; font-weight: 800; color: #0f172a;
    margin: 0 0 18px; padding-bottom: 10px;
    border-bottom: 2px solid #384877;
  }
  h2 { font-size: 16px; font-weight: 700; color: #0f172a; margin: 18px 0 8px; }
  h3 { font-size: 14px; font-weight: 700; color: #1e293b; margin: 14px 0 6px; }
  h4 { font-size: 13px; font-weight: 700; margin: 12px 0 6px; }
  p  { margin: 6px 0; }
  ul, ol { margin: 6px 0 6px 22px; padding: 0; }
  li { margin: 2px 0; }
  strong { color: #0f172a; }
  hr { border: 0; border-top: 1px solid #e2e8f0; margin: 14px 0; }
  img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #e2e8f0; margin: 6px 0; }
  figure { margin: 10px 0; text-align: center; }
  figcaption { font-size: 11px; color: #64748b; margin-top: 4px; font-style: italic; }
  .rs-section { margin-bottom: 16px; page-break-inside: avoid; }
  .rs-section h2 { page-break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; }
</style>
</head>
<body>
  <h1 class="rs-title">${safeTitle}</h1>
  ${inner}
</body>
</html>`;
}