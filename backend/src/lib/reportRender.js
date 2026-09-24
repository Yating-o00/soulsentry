// 研究报告渲染器：针对守护记录自动执行中的报告/研究类约定，
// 按报告类别输出不同版式的高质量 HTML（移动端优先、打印友好）。
// 所有内容均转义后输出，杜绝注入。

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 行内 Markdown：加粗 / 斜体 / 行内代码 / 链接
function inlineMarkdown(s) {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // 裸 URL 自动成链接
  t = t.replace(/(?<!["'>=\]])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return t;
}

function isTableSeparatorLine(line) {
  return /^\|?[\s\-:|]+\|?$/.test(line) && line.includes("-");
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

// Markdown → HTML：标题 / 无序列表 / 表格 / 段落，行内样式见 inlineMarkdown
export function markdownToHtml(markdown) {
  const lines = String(markdown || "").split("\n");
  const out = [];
  let inList = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${paragraph.join(" ")}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    if (line.startsWith("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1].trim())) {
      flushParagraph();
      closeList();
      const header = splitTableRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[i].trim()));
        i += 1;
      }
      i -= 1;
      const thead = `<thead><tr>${header.map((h) => `<th>${inlineMarkdown(h)}</th>`).join("")}</tr></thead>`;
      const tbody = rows.length
        ? `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inlineMarkdown(c)}</td>`).join("")}</tr>`).join("")}</tbody>`
        : "";
      out.push(`<div class="table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    paragraph.push(inlineMarkdown(line));
  }

  flushParagraph();
  closeList();
  return out.join("\n");
}

// ===== 报告类别 =====

export const REPORT_CATEGORIES = {
  research: {
    label: "深度研究",
    accent: "#384877",
    accentSoft: "#eef0f5",
    findingsTitle: "核心发现",
    recoTitle: "建议与展望",
    summaryTitle: "摘要"
  },
  market: {
    label: "调研分析",
    accent: "#2f6f6a",
    accentSoft: "#e9f2f1",
    findingsTitle: "关键洞察",
    recoTitle: "行动建议",
    summaryTitle: "摘要"
  },
  comparison: {
    label: "对比评测",
    accent: "#8a5a2b",
    accentSoft: "#f5eee4",
    findingsTitle: "对比要点",
    recoTitle: "结论与建议",
    summaryTitle: "评测结论"
  },
  weekly: {
    label: "周期汇报",
    accent: "#a8875a",
    accentSoft: "#f7f1e6",
    findingsTitle: "本期亮点",
    recoTitle: "下一步计划",
    summaryTitle: "概览"
  },
  learning: {
    label: "学习研究",
    accent: "#6e8a73",
    accentSoft: "#edf2ee",
    findingsTitle: "核心要点",
    recoTitle: "实践与应用",
    summaryTitle: "导言"
  }
};

// 从约定内容识别报告类别，决定排版风格
export function detectReportCategory(input) {
  const t = String(input || "");
  if (/对比|比对|选型|评测|哪家好|哪家强|优劣|vs\b|VS\b|到底选/i.test(t)) return "comparison";
  if (/周报|月报|季报|季度报|季度总结|年终|年中|年度总结|述职|复盘报告|周期汇报/.test(t)) return "weekly";
  if (/读书|书籍|书单|论文|文献|课程|学习|学术|著作|读后感/.test(t)) return "learning";
  if (/调研|市场|竞品|竟品|尽调|用户研究|行业分析|商业分析|洞察|赛道|前景/.test(t)) return "market";
  return "research";
}

// 各类别的生成指引：给 Kimi 的结构建议 + 深度要求
export function categoryOutlineHint(category) {
  const hints = {
    research: "结构建议：背景与问题界定 → 现状梳理 → 关键议题逐一分析 → 趋势判断 → 结论。",
    market: "结构建议：市场概况与规模数据 → 玩家/竞品格局 → 用户需求与洞察 → 机会点与建议。多使用数据与表格。",
    comparison: "结构建议：设定对比维度 → 逐项对比（必须用 Markdown 表格）→ 各方优劣势总结 → 明确的选型/结论建议。",
    weekly: "结构建议：本期完成与亮点 → 关键数据 → 问题与风险 → 下一步计划。措辞务实、可执行。",
    learning: "结构建议：核心观点提炼 → 分章展开论述 → 批判性思考 → 如何应用到实际工作/生活。"
  };
  return hints[category] || hints.research;
}

const DEPTH_REQUIREMENTS = [
  "深度要求：每个章节正文不少于 150 字，必须有具体的论据、数据或例子支撑，先立论再展开。",
  "避免空话、套话和重复表述；各章节标题必须唯一且具体。",
  "涉及数据罗列、多维对比时必须使用 Markdown 表格。"
].join("");

export function researchSystemPrompt(category) {
  const cat = REPORT_CATEGORIES[category] || REPORT_CATEGORIES.research;
  return [
    `你是一名资深中文研究顾问，正在为 SoulSentry 用户撰写一份「${cat.label}」类别的研究报告。`,
    "输出必须是 JSON，顶层字段为英文：topic、executive_summary、key_findings、recommendations、sections、references、markdown。",
    "sections 每个元素包含 heading 和 body（body 为 Markdown 格式，含小标题、列表、表格）。",
    "references 为 URL 字符串数组。",
    "markdown 只给 200 字以内的全文概述（供导出用），完整论述放在 sections 里，不要逐章重复。",
    categoryOutlineHint(category),
    DEPTH_REQUIREMENTS
  ].join("\n");
}

// ===== 排版 =====

function renderFindings(findings, cat) {
  if (!Array.isArray(findings) || !findings.length) return "";
  const items = findings.filter(Boolean).slice(0, 8);
  return `
<section class="block">
  <h2 class="block-title"><span class="block-num">${cat.findingsTitle}</span></h2>
  <div class="findings">
    ${items.map((f, i) => `
    <div class="finding">
      <div class="finding-num">${String(i + 1).padStart(2, "0")}</div>
      <div class="finding-text">${inlineMarkdown(String(f).trim())}</div>
    </div>`).join("")}
  </div>
</section>`;
}

function renderRecommendations(recos, cat) {
  if (!Array.isArray(recos) || !recos.length) return "";
  const items = recos.filter(Boolean).slice(0, 8);
  return `
<section class="block">
  <h2 class="block-title"><span class="block-num">${cat.recoTitle}</span></h2>
  <ul class="reco-list">
    ${items.map((r) => `<li>${inlineMarkdown(String(r).trim())}</li>`).join("")}
  </ul>
</section>`;
}

function renderSections(sections) {
  if (!Array.isArray(sections) || !sections.length) return "";
  const items = sections
    .map((s) => ({ heading: String(s?.heading || "").trim(), body: String(s?.body || "").trim() }))
    .filter((s) => s.heading && s.body)
    .slice(0, 12);
  if (!items.length) return "";
  return `
<section class="block">
  <h2 class="block-title"><span class="block-num">正文</span></h2>
  ${items.map((s, i) => `
  <article class="chapter">
    <h3 class="chapter-title"><span class="chapter-index">${String(i + 1).padStart(2, "0")}</span>${escapeHtml(s.heading)}</h3>
    <div class="chapter-body">${markdownToHtml(s.body)}</div>
  </article>`).join("")}
</section>`;
}

function renderReferences(refs) {
  if (!Array.isArray(refs) || !refs.length) return "";
  const items = refs.map(String).filter(Boolean).slice(0, 20);
  if (!items.length) return "";
  return `
<section class="block refs">
  <h2 class="block-title"><span class="block-num">参考资料</span></h2>
  <ol>
    ${items.map((r) => {
      const url = (r.match(/https?:\/\/[^\s]+/) || [""])[0];
      const label = escapeHtml(url ? (r.replace(url, "").trim() || url) : r);
      return `<li>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${label}</a>` : label}</li>`;
    }).join("")}
  </ol>
</section>`;
}

function baseCss(cat) {
  return `
  :root { --accent: ${cat.accent}; --accent-soft: ${cat.accentSoft}; --ink: #1c2333; --ink-2: #3d4454; --muted: #7a8194; --line: #e6e9f0; --paper: #ffffff; --bg: #f4f5f8; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Segoe UI", Arial, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.85; -webkit-font-smoothing: antialiased; }
  .page { max-width: 880px; margin: 0 auto; background: var(--paper); min-height: 100vh; box-shadow: 0 0 48px rgba(28, 35, 51, 0.06); }
  .cover { padding: 56px 56px 40px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, var(--accent-soft) 0%, var(--paper) 100%); }
  .cover .cat-pill { display: inline-block; font-size: 13px; letter-spacing: 4px; color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 4px 14px 4px 18px; margin-bottom: 22px; }
  .cover h1 { font-family: "Songti SC", "STSong", "Noto Serif SC", "SimSun", serif; font-size: 32px; line-height: 1.45; font-weight: 700; color: var(--ink); margin-bottom: 18px; }
  .cover .meta { font-size: 13px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 8px 22px; }
  .content { padding: 40px 56px 64px; }
  .block { margin-bottom: 48px; }
  .block-title { display: flex; align-items: center; gap: 14px; font-size: 20px; font-weight: 700; color: var(--ink); margin-bottom: 24px; font-family: "Songti SC", "STSong", "Noto Serif SC", serif; }
  .block-title::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .summary-card { background: var(--accent-soft); border-left: 3px solid var(--accent); border-radius: 0 12px 12px 0; padding: 22px 26px; font-size: 15.5px; color: var(--ink-2); }
  .findings { display: grid; grid-template-columns: 1fr; gap: 14px; }
  .finding { display: flex; gap: 16px; align-items: flex-start; border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; background: #fcfcfe; }
  .finding-num { font-family: Georgia, "Times New Roman", serif; font-size: 22px; font-weight: 700; color: var(--accent); line-height: 1.4; min-width: 32px; }
  .finding-text { font-size: 15px; color: var(--ink-2); }
  .reco-list { list-style: none; counter-reset: reco; }
  .reco-list li { counter-increment: reco; position: relative; padding: 12px 0 12px 44px; border-bottom: 1px dashed var(--line); font-size: 15px; color: var(--ink-2); }
  .reco-list li::before { content: counter(reco); position: absolute; left: 0; top: 12px; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .reco-list li:last-child { border-bottom: none; }
  .chapter { margin-bottom: 36px; }
  .chapter-title { font-size: 19px; font-weight: 700; color: var(--ink); margin-bottom: 14px; display: flex; align-items: baseline; gap: 12px; font-family: "Songti SC", "STSong", "Noto Serif SC", serif; }
  .chapter-index { font-family: Georgia, serif; font-size: 15px; color: var(--accent); }
  .chapter-body p { font-size: 15px; color: var(--ink-2); margin-bottom: 14px; text-align: justify; }
  .chapter-body h4, .chapter-body h5 { font-size: 16px; color: var(--ink); margin: 20px 0 10px; }
  .chapter-body ul { padding-left: 22px; margin-bottom: 14px; }
  .chapter-body li { font-size: 15px; color: var(--ink-2); margin-bottom: 8px; }
  .chapter-body code { background: var(--accent-soft); border-radius: 4px; padding: 1px 6px; font-size: 13px; color: var(--accent); }
  .table-wrap { overflow-x: auto; margin: 18px 0 22px; border: 1px solid var(--line); border-radius: 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th { background: var(--accent-soft); color: var(--ink); font-weight: 600; text-align: left; padding: 11px 16px; border-bottom: 2px solid var(--accent); white-space: nowrap; }
  td { padding: 10px 16px; border-bottom: 1px solid var(--line); color: var(--ink-2); vertical-align: top; }
  tbody tr:nth-child(even) { background: #fafbfd; }
  tbody tr:last-child td { border-bottom: none; }
  .refs ol { padding-left: 20px; }
  .refs li { font-size: 13.5px; color: var(--muted); margin-bottom: 8px; }
  a { color: var(--accent); text-decoration: none; word-break: break-all; }
  .footer { padding: 24px 56px 40px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  @media (max-width: 640px) {
    .cover, .content, .footer { padding-left: 24px; padding-right: 24px; }
    .cover { padding-top: 40px; }
    .cover h1 { font-size: 26px; }
  }
  @media print {
    body { background: #fff; }
    .page { box-shadow: none; max-width: none; }
  }`;
}

/**
 * 渲染研究报告 HTML。
 * data: { title, summary, keyFindings, recommendations, sections, references, sourceInput, generatedAt }
 */
export function renderReportHtml(category, data) {
  const cat = REPORT_CATEGORIES[category] || REPORT_CATEGORIES.research;
  const title = String(data?.title || "研究报告").trim();
  const summary = String(data?.summary || "").trim();
  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false })
    : new Date().toLocaleString("zh-CN", { hour12: false });
  const source = String(data?.sourceInput || "").trim().slice(0, 80);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${baseCss(cat)}</style>
</head>
<body>
<div class="page">
  <header class="cover">
    <span class="cat-pill">${cat.label}</span>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <span>生成时间 · ${escapeHtml(generatedAt)}</span>
      ${source ? `<span>来源约定 · ${escapeHtml(source)}</span>` : ""}
    </div>
  </header>
  <main class="content">
    ${summary ? `
    <section class="block">
      <h2 class="block-title"><span class="block-num">${cat.summaryTitle}</span></h2>
      <div class="summary-card">${inlineMarkdown(summary)}</div>
    </section>` : ""}
    ${renderFindings(data?.keyFindings, cat)}
    ${renderSections(data?.sections)}
    ${renderRecommendations(data?.recommendations, cat)}
    ${renderReferences(data?.references)}
  </main>
  <footer class="footer">
    <span>由 SoulSentry 心栈生成 · 关键数据请再次核实</span>
    <span>${escapeHtml(cat.label)}</span>
  </footer>
</div>
</body>
</html>`;
}
