// PDF 导出的预设排版风格。每个主题独立返回 <style> 内容和 hero/section 模板。
// 新增主题只需在这里追加一条记录,UI 和 buildPrintableHtml 会自动列出。

// 4 种风格 ——
// business : 深蓝商务封面 + 编号章节卡(默认,与首版一致)
// minimal  : 简约报告风(黑白细线条 + 衬线标题)
// journal  : 手账记录风(米黄底 + 手写感标题 + 圆角胶带)
// academic : 学术论文风(双栏感、衬线、紧凑行距)

const COMMON_RESET = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

const themes = {
  business: {
    label: "深蓝商务",
    desc: "渐变封面 + 编号卡片",
    css: `
${COMMON_RESET}
@page { size: A4 portrait; margin: 12mm; }
html, body { background: #f5f7fb; color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
body { padding: 18px 14px; font-size: 13px; line-height: 1.75; }
.rr-hero { position: relative; background: linear-gradient(135deg, #2b3a6b 0%, #3b4f8a 55%, #4a63a8 100%); border-radius: 18px; padding: 34px 32px 28px; color: #fff; margin-bottom: 22px; overflow: hidden; box-shadow: 0 8px 24px -10px rgba(43,58,107,.45); }
.rr-hero::before { content:""; position:absolute; right:-60px; top:-60px; width:220px; height:220px; background: radial-gradient(circle, rgba(255,255,255,.18) 0%, rgba(255,255,255,0) 70%); border-radius:50%; }
.rr-hero::after { content:""; position:absolute; left:-40px; bottom:-40px; width:160px; height:160px; background: radial-gradient(circle, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 70%); border-radius:50%; }
.rr-hero h1 { font-size: 24px; line-height: 1.35; margin: 0 0 12px; font-weight: 700; letter-spacing: .5px; color:#fff; position: relative; }
.rr-subtitle { font-size: 12.5px; line-height: 1.7; color: rgba(255,255,255,.82); margin-bottom: 18px; position: relative; }
.rr-meta { display: flex; flex-wrap: wrap; gap: 8px; position: relative; }
.rr-chip { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.22); color:#fff; padding: 5px 11px; border-radius: 999px; font-size: 11px; font-weight: 500; }
.rr-section { background:#fff; border-radius: 14px; padding: 22px 24px 20px; margin-bottom: 14px; border: 1px solid #eaeef5; box-shadow: 0 1px 2px rgba(15,23,42,.03); }
.rr-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; page-break-after: avoid; }
.rr-num { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; background:#eef2ff; color:#3b4f8a; font-weight: 700; font-size: 12px; }
.rr-section h2 { font-size: 16px; color:#1e293b; margin: 0; font-weight: 600; line-height: 1.4; }
.rr-body { color: #334155; }
.rr-body h2 { font-size: 15px; color: #1e293b; margin: 18px 0 8px; font-weight: 600; }
.rr-body h3 { font-size: 13.5px; color: #334155; margin: 14px 0 6px; font-weight: 600; }
.rr-body p { margin: 6px 0; }
.rr-body ul, .rr-body ol { margin: 6px 0 6px 22px; }
.rr-body li::marker { color: #3b4f8a; }
.rr-body strong { color: #0f172a; }
.rr-body img { max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; margin: 10px 0; }
.rr-body table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 12px 0; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.rr-body th, .rr-body td { border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 7px 10px; text-align: left; vertical-align: top; }
.rr-body th { background:#f1f5fa; font-weight: 600; color:#334155; }
.rr-body tr:nth-child(even) td { background:#fafbfd; }
.rr-body blockquote { border-left: 3px solid #3b4f8a; background:#f5f7fb; padding: 10px 14px; border-radius: 0 8px 8px 0; color:#475569; margin: 10px 0; }
`,
  },

  minimal: {
    label: "简约报告",
    desc: "黑白细线 + 衬线标题",
    css: `
${COMMON_RESET}
@page { size: A4 portrait; margin: 18mm; }
html, body { background: #fff; color: #1a1a1a; font-family: "Georgia", "Source Han Serif SC", "Songti SC", "PingFang SC", serif; }
body { padding: 0; font-size: 12.5px; line-height: 1.8; }
.rr-hero { padding: 20px 0 28px; margin-bottom: 28px; border-bottom: 1px solid #1a1a1a; }
.rr-hero h1 { font-size: 28px; font-weight: 700; margin: 0 0 14px; color: #1a1a1a; letter-spacing: 0.5px; line-height: 1.3; }
.rr-subtitle { font-size: 13px; line-height: 1.75; color: #555; margin-bottom: 16px; font-style: italic; }
.rr-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
.rr-chip { background: none; border: 0; padding: 0; border-radius: 0; }
.rr-chip + .rr-chip::before { content: "·"; margin-right: 14px; color: #bbb; }
.rr-section { background: none; border: 0; padding: 0; margin: 0 0 22px; box-shadow: none; }
.rr-section-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e5e5; page-break-after: avoid; }
.rr-num { font-size: 11px; color: #999; font-weight: 400; letter-spacing: 2px; min-width: 28px; }
.rr-section h2 { font-size: 17px; color: #1a1a1a; margin: 0; font-weight: 700; line-height: 1.4; }
.rr-body { color: #2a2a2a; }
.rr-body h2 { font-size: 14.5px; margin: 18px 0 6px; font-weight: 700; color:#1a1a1a; }
.rr-body h3 { font-size: 13px; margin: 14px 0 4px; font-weight: 700; color: #1a1a1a; }
.rr-body p { margin: 8px 0; text-indent: 0; }
.rr-body ul, .rr-body ol { margin: 6px 0 6px 22px; }
.rr-body li { margin: 3px 0; }
.rr-body li::marker { color: #999; }
.rr-body strong { color: #000; font-weight: 700; }
.rr-body img { max-width: 100%; border: 1px solid #ddd; margin: 12px 0; }
.rr-body hr { border: 0; border-top: 1px solid #ddd; margin: 18px 0; }
.rr-body table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11.5px; }
.rr-body th, .rr-body td { border-bottom: 1px solid #ddd; padding: 7px 4px; text-align: left; vertical-align: top; }
.rr-body th { border-bottom: 2px solid #1a1a1a; font-weight: 700; }
.rr-body blockquote { border-left: 2px solid #1a1a1a; padding: 4px 14px; color:#555; margin: 12px 0; font-style: italic; background: none; }
`,
  },

  journal: {
    label: "手账记录",
    desc: "米黄底 + 手写感",
    css: `
${COMMON_RESET}
@page { size: A4 portrait; margin: 14mm; }
html, body { background: #fbf6ec; color: #4a3b2a; font-family: "Marker Felt", "Comic Sans MS", "Yuanti SC", "PingFang SC", "STKaiti", "KaiTi", sans-serif; }
body { padding: 14px 10px; font-size: 13.5px; line-height: 1.85; }
.rr-hero { position: relative; background: linear-gradient(135deg, #f9e6c4 0%, #f4d4a3 100%); border: 2px dashed #c9a878; border-radius: 16px; padding: 26px 28px 22px; margin-bottom: 22px; transform: rotate(-0.3deg); box-shadow: 3px 3px 0 rgba(201, 168, 120, 0.3); }
.rr-hero::before { content: "📌"; position: absolute; top: -8px; left: 24px; font-size: 22px; transform: rotate(-15deg); }
.rr-hero h1 { font-size: 24px; font-weight: 700; margin: 0 0 10px; color: #6b4f2e; line-height: 1.35; letter-spacing: 1px; }
.rr-subtitle { font-size: 13px; line-height: 1.75; color: #8b6f4e; margin-bottom: 14px; }
.rr-meta { display: flex; flex-wrap: wrap; gap: 8px; }
.rr-chip { display: inline-block; background: #fff8e7; border: 1.5px solid #c9a878; color: #6b4f2e; padding: 4px 11px; border-radius: 999px; font-size: 11px; font-weight: 600; transform: rotate(-1deg); }
.rr-chip:nth-child(even) { transform: rotate(1deg); }
.rr-section { position: relative; background: #fffdf6; border: 1.5px solid #e8d5b0; border-radius: 12px; padding: 22px 26px 18px; margin-bottom: 18px; box-shadow: 2px 2px 0 rgba(232, 213, 176, 0.4); }
.rr-section::before { content: ""; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); width: 60px; height: 14px; background: linear-gradient(180deg, rgba(255, 220, 150, 0.7) 0%, rgba(255, 220, 150, 0.4) 100%); border-radius: 2px; }
.rr-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px dotted #d4b88a; page-break-after: avoid; }
.rr-num { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 8px; border-radius: 50%; background: #f4a261; color: #fff; font-weight: 700; font-size: 12px; box-shadow: 1px 1px 0 rgba(0,0,0,0.1); }
.rr-section h2 { font-size: 16.5px; color: #6b4f2e; margin: 0; font-weight: 700; line-height: 1.4; }
.rr-body { color: #5a4530; }
.rr-body h2 { font-size: 15px; color: #6b4f2e; margin: 16px 0 6px; font-weight: 700; }
.rr-body h2::before { content: "✿ "; color: #f4a261; }
.rr-body h3 { font-size: 13.5px; color: #6b4f2e; margin: 12px 0 4px; font-weight: 700; }
.rr-body h3::before { content: "▸ "; color: #c9a878; }
.rr-body p { margin: 6px 0; }
.rr-body ul, .rr-body ol { margin: 6px 0 6px 22px; }
.rr-body ul li::marker { content: "✦ "; color: #f4a261; }
.rr-body strong { color: #6b4f2e; background: linear-gradient(180deg, transparent 60%, #ffe9a8 60%); padding: 0 2px; }
.rr-body img { max-width: 100%; border-radius: 10px; border: 2px solid #e8d5b0; margin: 12px 0; box-shadow: 2px 2px 0 rgba(232, 213, 176, 0.5); }
.rr-body table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 12px 0; font-size: 12px; border: 1.5px solid #e8d5b0; border-radius: 10px; overflow: hidden; }
.rr-body th, .rr-body td { border-bottom: 1px solid #f0e2c5; padding: 7px 10px; text-align: left; vertical-align: top; }
.rr-body th { background: #f9e6c4; font-weight: 700; color: #6b4f2e; }
.rr-body tr:nth-child(even) td { background: #fdf8ec; }
.rr-body blockquote { border-left: 4px solid #f4a261; background: #fff8e7; padding: 10px 14px; border-radius: 0 10px 10px 0; color: #6b4f2e; margin: 10px 0; font-style: italic; }
`,
  },

  academic: {
    label: "学术论文",
    desc: "衬线字体 + 紧凑排版",
    css: `
${COMMON_RESET}
@page { size: A4 portrait; margin: 22mm 20mm; }
html, body { background:#fff; color:#1a1a1a; font-family: "Times New Roman", "Source Han Serif SC", "Songti SC", "STSong", "PingFang SC", serif; }
body { padding: 0; font-size: 12px; line-height: 1.65; }
.rr-hero { text-align: center; padding: 6px 0 22px; margin-bottom: 24px; border-bottom: 2px solid #1a1a1a; position: relative; }
.rr-hero::after { content: ""; display: block; width: 60%; height: 1px; background: #1a1a1a; margin: 4px auto 0; }
.rr-hero h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color:#1a1a1a; line-height: 1.4; letter-spacing: 0.5px; }
.rr-subtitle { font-size: 12px; line-height: 1.7; color: #444; margin: 0 auto 14px; max-width: 80%; font-style: italic; }
.rr-meta { display: flex; flex-wrap: wrap; gap: 0; justify-content: center; font-size: 10.5px; color: #666; }
.rr-chip { background: none; border: 0; padding: 0 10px; border-right: 1px solid #ccc; }
.rr-chip:last-child { border-right: 0; }
.rr-section { background: none; border: 0; padding: 0; margin: 0 0 18px; box-shadow: none; }
.rr-section-head { display: block; margin-bottom: 8px; page-break-after: avoid; text-align: left; }
.rr-num { display: inline; font-size: 14px; color:#1a1a1a; font-weight: 700; margin-right: 8px; }
.rr-num::after { content: "."; }
.rr-section h2 { display: inline; font-size: 14px; color:#1a1a1a; font-weight: 700; }
.rr-body { color: #1a1a1a; margin-top: 6px; text-align: justify; }
.rr-body h2 { font-size: 13px; margin: 14px 0 4px; font-weight: 700; }
.rr-body h3 { font-size: 12.5px; margin: 12px 0 3px; font-weight: 700; font-style: italic; }
.rr-body p { margin: 0; text-indent: 2em; }
.rr-body p + p { margin-top: 2px; }
.rr-body ul, .rr-body ol { margin: 6px 0 6px 24px; }
.rr-body li { margin: 2px 0; }
.rr-body strong { font-weight: 700; }
.rr-body img { display: block; max-width: 80%; margin: 12px auto; }
.rr-body table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
.rr-body th, .rr-body td { border-bottom: 1px solid #aaa; padding: 5px 8px; text-align: left; vertical-align: top; }
.rr-body th { border-top: 2px solid #1a1a1a; border-bottom: 1px solid #1a1a1a; font-weight: 700; background: none; }
.rr-body table tr:last-child td { border-bottom: 2px solid #1a1a1a; }
.rr-body blockquote { border-left: 0; padding: 4px 24px; color:#333; margin: 10px 24px; font-size: 11.5px; background: none; font-style: italic; }
`,
  },
};

export const PDF_THEMES = themes;

export const PDF_THEME_KEYS = Object.keys(themes);

export function getPdfTheme(key) {
  return themes[key] || themes.business;
}