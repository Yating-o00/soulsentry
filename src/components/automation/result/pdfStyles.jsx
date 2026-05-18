// PDF 排版风格预设集中表
// 每个风格定义:封面卡 HTML 模板 + 章节 HTML 模板 + 全套 CSS
// buildPrintableHtml 根据 styleId 选择对应风格来渲染

const HERO_CHIPS = (meta) => `
  <span class="rr-chip">📅 ${meta.dateStr}</span>
  ${meta.chapterCount ? `<span class="rr-chip">📑 ${meta.chapterCount} 个章节</span>` : ""}
  <span class="rr-chip">心栈 SoulSentry</span>
`;

export const PDF_STYLES = {
  // 1. 深蓝商务(默认,原图样式)
  business: {
    id: "business",
    name: "深蓝商务",
    desc: "渐变封面 + 编号章节卡片",
    icon: "💼",
    cover: ({ safeTitle, subtitle, meta }) => `
      <div class="rr-hero">
        <h1>${safeTitle}</h1>
        ${subtitle ? `<div class="rr-subtitle">${subtitle}</div>` : ""}
        <div class="rr-meta">${HERO_CHIPS(meta)}</div>
      </div>`,
    section: ({ num, heading, body }) => `
      <section class="rr-section">
        <div class="rr-section-head">
          <span class="rr-num">${num}</span>
          <h2>${heading}</h2>
        </div>
        <div class="rr-body">${body}</div>
      </section>`,
    css: `
      html, body { background: #f5f7fb; }
      .rr-hero {
        position: relative;
        background: linear-gradient(135deg, #2b3a6b 0%, #3b4f8a 55%, #4a63a8 100%);
        border-radius: 18px; padding: 34px 32px 28px; color: #fff;
        margin-bottom: 22px; overflow: hidden;
        box-shadow: 0 8px 24px -10px rgba(43, 58, 107, 0.45);
      }
      .rr-hero::before { content: ""; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px; background: radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%); border-radius: 50%; }
      .rr-hero::after { content: ""; position: absolute; left: -40px; bottom: -40px; width: 160px; height: 160px; background: radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 70%); border-radius: 50%; }
      .rr-hero h1 { font-size: 24px; line-height: 1.35; margin: 0 0 12px; font-weight: 700; letter-spacing: 0.5px; color: #fff; border: 0; padding: 0; position: relative; }
      .rr-subtitle { font-size: 12.5px; line-height: 1.7; color: rgba(255,255,255,0.82); margin-bottom: 18px; position: relative; }
      .rr-meta { display: flex; flex-wrap: wrap; gap: 8px; position: relative; }
      .rr-chip { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.22); color: #fff; padding: 5px 11px; border-radius: 999px; font-size: 11px; font-weight: 500; }
      .rr-section { background: #fff; border-radius: 14px; padding: 22px 24px 20px; margin-bottom: 14px; border: 1px solid #eaeef5; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03); }
      .rr-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; page-break-after: avoid; }
      .rr-num { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; background: #eef2ff; color: #3b4f8a; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; flex-shrink: 0; }
      .rr-section h2 { font-size: 16px; color: #1e293b; margin: 0; padding: 0; border: 0; font-weight: 600; line-height: 1.4; }
      .rr-body { color: #334155; }
      .rr-body h2 { font-size: 15px; margin: 18px 0 8px; color: #1e293b; padding: 0; border: 0; font-weight: 600; }
      .rr-body h3 { font-size: 13.5px; color: #334155; margin: 14px 0 6px; font-weight: 600; }
      .rr-body blockquote { border-left: 3px solid #3b4f8a; background: #f5f7fb; padding: 10px 14px; border-radius: 0 8px 8px 0; color: #475569; margin: 10px 0; }
      .rr-body table { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
      .rr-body th { background: #f1f5fa; color: #334155; }
    `,
  },

  // 2. 简约报告风 —— 黑白线条,极简专业
  minimal: {
    id: "minimal",
    name: "简约报告",
    desc: "黑白线条,极简专业",
    icon: "📄",
    cover: ({ safeTitle, subtitle, meta }) => `
      <div class="rr-hero">
        <div class="rr-eyebrow">REPORT · ${meta.dateStr}</div>
        <h1>${safeTitle}</h1>
        ${subtitle ? `<div class="rr-subtitle">${subtitle}</div>` : ""}
        <div class="rr-divider"></div>
        <div class="rr-meta">
          <span>共 ${meta.chapterCount || 1} 个章节</span>
          <span>·</span>
          <span>SoulSentry</span>
        </div>
      </div>`,
    section: ({ num, heading, body }) => `
      <section class="rr-section">
        <div class="rr-section-head">
          <span class="rr-num">${num}</span>
          <h2>${heading}</h2>
        </div>
        <div class="rr-body">${body}</div>
      </section>`,
    css: `
      html, body { background: #fff; font-family: "Georgia", "Times New Roman", -apple-system, "PingFang SC", serif; }
      body { color: #1a1a1a; }
      .rr-hero { padding: 20px 0 30px; margin-bottom: 30px; border-bottom: 2px solid #1a1a1a; }
      .rr-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 3px; color: #6b7280; margin-bottom: 14px; text-transform: uppercase; font-family: -apple-system, sans-serif; }
      .rr-hero h1 { font-size: 30px; line-height: 1.25; margin: 0 0 14px; font-weight: 700; color: #0a0a0a; border: 0; padding: 0; letter-spacing: -0.5px; }
      .rr-subtitle { font-size: 13px; line-height: 1.7; color: #4b5563; margin-bottom: 16px; font-style: italic; }
      .rr-divider { width: 50px; height: 2px; background: #1a1a1a; margin: 16px 0; }
      .rr-meta { display: flex; gap: 8px; font-size: 10.5px; color: #6b7280; letter-spacing: 1px; font-family: -apple-system, sans-serif; }
      .rr-section { padding: 0 0 14px; margin-bottom: 18px; border-bottom: 1px solid #e5e7eb; }
      .rr-section:last-child { border-bottom: 0; }
      .rr-section-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 12px; page-break-after: avoid; }
      .rr-num { font-size: 28px; font-weight: 300; color: #d1d5db; line-height: 1; flex-shrink: 0; font-family: "Georgia", serif; }
      .rr-section h2 { font-size: 18px; color: #0a0a0a; margin: 0; padding: 0; border: 0; font-weight: 700; line-height: 1.3; letter-spacing: -0.3px; }
      .rr-body { color: #1f2937; font-size: 13.5px; line-height: 1.8; }
      .rr-body h2 { font-size: 14.5px; margin: 18px 0 8px; color: #0a0a0a; padding: 0; border: 0; font-weight: 700; }
      .rr-body h3 { font-size: 13.5px; color: #1a1a1a; margin: 14px 0 6px; font-weight: 700; }
      .rr-body blockquote { border-left: 2px solid #0a0a0a; padding: 4px 16px; color: #4b5563; margin: 12px 0; background: transparent; font-style: italic; }
      .rr-body table { border-top: 1.5px solid #1a1a1a; border-bottom: 1.5px solid #1a1a1a; border-radius: 0; }
      .rr-body th, .rr-body td { border-left: 0; border-right: 0; border-color: #e5e7eb; }
      .rr-body th { background: transparent; border-bottom: 1px solid #1a1a1a; font-weight: 700; color: #0a0a0a; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
      .rr-body tr:nth-child(even) td { background: transparent; }
    `,
  },

  // 3. 手账记录风 —— 米黄纸 + 手写感
  journal: {
    id: "journal",
    name: "手账记录",
    desc: "米黄纸张 + 温柔手写感",
    icon: "📓",
    cover: ({ safeTitle, subtitle, meta }) => `
      <div class="rr-hero">
        <div class="rr-tape rr-tape-l"></div>
        <div class="rr-tape rr-tape-r"></div>
        <div class="rr-stamp">${meta.dateStr}</div>
        <h1>${safeTitle}</h1>
        ${subtitle ? `<div class="rr-subtitle">"${subtitle}"</div>` : ""}
        <div class="rr-meta">
          <span class="rr-chip">✿ ${meta.chapterCount || 1} 篇</span>
          <span class="rr-chip">· 心栈手账 ·</span>
        </div>
      </div>`,
    section: ({ num, heading, body }) => `
      <section class="rr-section">
        <div class="rr-section-head">
          <span class="rr-num">No.${num}</span>
          <h2>${heading}</h2>
        </div>
        <div class="rr-body">${body}</div>
      </section>`,
    css: `
      html, body { background: #fdf6e3; font-family: "Kaiti SC", "STKaiti", "楷体", "Georgia", -apple-system, "PingFang SC", serif; }
      body { color: #5c4a3a; background: repeating-linear-gradient(transparent, transparent 27px, rgba(180, 140, 100, 0.12) 27px, rgba(180, 140, 100, 0.12) 28px); }
      .rr-hero { position: relative; background: #fffaf0; border: 1px dashed #c9a97a; border-radius: 4px; padding: 36px 30px 26px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(120, 80, 40, 0.08); text-align: center; }
      .rr-tape { position: absolute; top: -8px; width: 70px; height: 22px; background: rgba(236, 168, 109, 0.55); transform: rotate(-3deg); }
      .rr-tape-l { left: 24px; }
      .rr-tape-r { right: 24px; transform: rotate(3deg); background: rgba(196, 156, 200, 0.55); }
      .rr-stamp { position: absolute; top: 18px; right: 26px; border: 1.5px solid #b85c4c; color: #b85c4c; padding: 3px 10px; border-radius: 4px; font-size: 10.5px; font-weight: 600; transform: rotate(4deg); letter-spacing: 1px; font-family: -apple-system, sans-serif; }
      .rr-hero h1 { font-size: 26px; line-height: 1.4; margin: 14px 0 12px; font-weight: 600; color: #4a3520; border: 0; padding: 0; }
      .rr-subtitle { font-size: 13.5px; line-height: 1.8; color: #8b6f4e; margin-bottom: 16px; font-style: italic; }
      .rr-meta { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; }
      .rr-chip { display: inline-flex; align-items: center; gap: 4px; color: #a07854; padding: 3px 10px; font-size: 11.5px; font-weight: 500; background: transparent; border: 0; }
      .rr-section { background: #fffaf0; border: 1px solid #e8d5b4; border-radius: 4px; padding: 20px 24px 18px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(120, 80, 40, 0.06); position: relative; }
      .rr-section::before { content: ""; position: absolute; left: 22px; top: 0; bottom: 0; width: 1px; background: rgba(184, 92, 76, 0.25); }
      .rr-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-left: 14px; page-break-after: avoid; }
      .rr-num { color: #b85c4c; font-weight: 700; font-size: 12.5px; letter-spacing: 0.5px; flex-shrink: 0; font-family: "Georgia", serif; }
      .rr-section h2 { font-size: 17px; color: #4a3520; margin: 0; padding: 0; border: 0; font-weight: 600; line-height: 1.4; }
      .rr-body { color: #5c4a3a; font-size: 13.5px; line-height: 1.9; padding-left: 14px; }
      .rr-body h2 { font-size: 15px; margin: 16px 0 8px; color: #4a3520; padding: 0; border: 0; font-weight: 600; }
      .rr-body h3 { font-size: 14px; color: #6b5440; margin: 14px 0 6px; font-weight: 600; }
      .rr-body strong { color: #b85c4c; }
      .rr-body blockquote { border-left: 3px solid #d4a574; background: rgba(212, 165, 116, 0.1); padding: 10px 14px; border-radius: 0 6px 6px 0; color: #6b5440; margin: 10px 0; font-style: italic; }
      .rr-body ul li::marker { content: "✿ "; color: #b85c4c; }
      .rr-body ol li::marker { color: #b85c4c; font-weight: 600; }
      .rr-body hr { border: 0; border-top: 1px dashed #c9a97a; margin: 14px 0; }
      .rr-body img { border-radius: 4px; border: 1px solid #c9a97a; box-shadow: 0 2px 6px rgba(120, 80, 40, 0.12); }
      .rr-body table { border-color: #c9a97a; }
      .rr-body th { background: rgba(212, 165, 116, 0.2); color: #4a3520; }
    `,
  },

  // 4. 学术论文风 —— 严肃排版
  academic: {
    id: "academic",
    name: "学术论文",
    desc: "严肃排版,适合长篇正文",
    icon: "🎓",
    cover: ({ safeTitle, subtitle, meta }) => `
      <div class="rr-hero">
        <h1>${safeTitle}</h1>
        ${subtitle ? `<div class="rr-subtitle">${subtitle}</div>` : ""}
        <div class="rr-meta">
          <span>${meta.dateStr}</span>
          <span>·</span>
          <span>${meta.chapterCount || 1} sections</span>
          <span>·</span>
          <span>SoulSentry</span>
        </div>
        <div class="rr-divider-double"></div>
      </div>`,
    section: ({ num, heading, body }) => `
      <section class="rr-section">
        <div class="rr-section-head">
          <span class="rr-num">§ ${num}</span>
          <h2>${heading}</h2>
        </div>
        <div class="rr-body">${body}</div>
      </section>`,
    css: `
      html, body { background: #fff; font-family: "Times New Roman", "Songti SC", "宋体", serif; }
      body { color: #1a1a1a; }
      .rr-hero { text-align: center; padding: 30px 20px 20px; margin-bottom: 28px; }
      .rr-hero h1 { font-size: 26px; line-height: 1.35; margin: 0 0 14px; font-weight: 700; color: #0a0a0a; border: 0; padding: 0; letter-spacing: 0.5px; }
      .rr-subtitle { font-size: 13px; line-height: 1.75; color: #4b5563; margin: 0 auto 16px; max-width: 80%; font-style: italic; }
      .rr-meta { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; font-size: 11.5px; color: #6b7280; font-family: -apple-system, sans-serif; }
      .rr-divider-double { width: 100px; height: 4px; margin: 18px auto 0; border-top: 1px solid #1a1a1a; border-bottom: 1px solid #1a1a1a; }
      .rr-section { padding: 0; margin-bottom: 22px; }
      .rr-section-head { margin-bottom: 10px; text-align: left; page-break-after: avoid; }
      .rr-num { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: 2px; display: block; margin-bottom: 4px; font-family: -apple-system, sans-serif; text-transform: uppercase; }
      .rr-section h2 { font-size: 17px; color: #0a0a0a; margin: 0; padding: 0; border: 0; font-weight: 700; line-height: 1.35; }
      .rr-body { color: #1a1a1a; font-size: 13px; line-height: 1.85; text-align: justify; text-indent: 2em; }
      .rr-body h2, .rr-body h3, .rr-body h4, .rr-body p:first-child, .rr-body ul, .rr-body ol, .rr-body blockquote, .rr-body table, .rr-body img, .rr-body hr { text-indent: 0; }
      .rr-body h2 { font-size: 14.5px; margin: 16px 0 8px; color: #0a0a0a; padding: 0; border: 0; font-weight: 700; }
      .rr-body h3 { font-size: 13.5px; color: #1a1a1a; margin: 12px 0 6px; font-weight: 700; }
      .rr-body ul, .rr-body ol { text-indent: 0; padding-left: 28px; }
      .rr-body blockquote { border-left: 3px solid #1a1a1a; background: #f9fafb; padding: 8px 14px; color: #374151; margin: 12px 2em; font-size: 12.5px; }
      .rr-body table { font-family: -apple-system, sans-serif; }
      .rr-body th { background: #f3f4f6; color: #0a0a0a; font-weight: 700; }
    `,
  },

  // 5. 杂志风 —— 大标题 + 引文,视觉冲击
  magazine: {
    id: "magazine",
    name: "杂志风",
    desc: "大标题 + 引文,视觉冲击",
    icon: "📰",
    cover: ({ safeTitle, subtitle, meta }) => `
      <div class="rr-hero">
        <div class="rr-eyebrow">ISSUE · ${meta.dateStr}</div>
        <h1>${safeTitle}</h1>
        ${subtitle ? `<div class="rr-subtitle">${subtitle}</div>` : ""}
        <div class="rr-meta">
          <span class="rr-chip">${meta.chapterCount || 1} FEATURES</span>
          <span class="rr-chip">SOULSENTRY</span>
        </div>
      </div>`,
    section: ({ num, heading, body }) => `
      <section class="rr-section">
        <div class="rr-section-head">
          <div class="rr-num">${num}</div>
          <h2>${heading}</h2>
        </div>
        <div class="rr-body">${body}</div>
      </section>`,
    css: `
      html, body { background: #faf8f5; font-family: "Helvetica Neue", -apple-system, "PingFang SC", sans-serif; }
      body { color: #1a1a1a; }
      .rr-hero { background: #1a1a1a; color: #fff; padding: 40px 32px 32px; margin-bottom: 24px; border-radius: 0; position: relative; overflow: hidden; }
      .rr-hero::before { content: ""; position: absolute; right: 0; top: 0; width: 120px; height: 120px; background: #ff6b35; border-radius: 50%; transform: translate(50%, -50%); opacity: 0.85; }
      .rr-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 4px; color: #ff6b35; margin-bottom: 16px; position: relative; }
      .rr-hero h1 { font-size: 36px; line-height: 1.1; margin: 0 0 16px; font-weight: 900; color: #fff; border: 0; padding: 0; letter-spacing: -1px; position: relative; }
      .rr-subtitle { font-size: 14px; line-height: 1.65; color: rgba(255,255,255,0.78); margin-bottom: 20px; max-width: 80%; position: relative; font-weight: 300; }
      .rr-meta { display: flex; flex-wrap: wrap; gap: 8px; position: relative; }
      .rr-chip { display: inline-block; background: transparent; border: 1px solid rgba(255,255,255,0.4); color: #fff; padding: 4px 11px; border-radius: 0; font-size: 10.5px; font-weight: 700; letter-spacing: 1.5px; }
      .rr-section { background: #fff; padding: 24px 28px 20px; margin-bottom: 14px; border-left: 4px solid #ff6b35; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
      .rr-section-head { margin-bottom: 14px; page-break-after: avoid; }
      .rr-num { font-size: 38px; font-weight: 900; color: #ff6b35; line-height: 1; margin-bottom: 6px; letter-spacing: -1.5px; }
      .rr-section h2 { font-size: 22px; color: #0a0a0a; margin: 0; padding: 0; border: 0; font-weight: 900; line-height: 1.2; letter-spacing: -0.5px; }
      .rr-body { color: #2a2a2a; font-size: 13.5px; line-height: 1.75; }
      .rr-body h2 { font-size: 15px; margin: 18px 0 8px; color: #0a0a0a; padding: 0; border: 0; font-weight: 800; letter-spacing: -0.3px; }
      .rr-body h3 { font-size: 13.5px; color: #1a1a1a; margin: 14px 0 6px; font-weight: 800; }
      .rr-body strong { color: #ff6b35; }
      .rr-body blockquote { border: 0; border-top: 2px solid #1a1a1a; border-bottom: 2px solid #1a1a1a; background: transparent; padding: 14px 0; color: #1a1a1a; margin: 16px 0; font-size: 17px; font-weight: 300; font-style: italic; line-height: 1.5; text-align: center; }
      .rr-body table { border: 0; }
      .rr-body th { background: #1a1a1a; color: #fff; text-transform: uppercase; font-size: 11px; letter-spacing: 1.5px; }
    `,
  },
};

export const PDF_STYLE_LIST = [
  PDF_STYLES.business,
  PDF_STYLES.minimal,
  PDF_STYLES.journal,
  PDF_STYLES.academic,
  PDF_STYLES.magazine,
];

export const DEFAULT_PDF_STYLE = "business";

export function getPdfStyle(id) {
  return PDF_STYLES[id] || PDF_STYLES[DEFAULT_PDF_STYLE];
}