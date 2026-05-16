import React from "react";
import { Globe, Download, ExternalLink, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
// 轻量 Markdown 渲染器：处理标题 / 加粗 / 图片 / 列表 / GFM 表格 / 段落，无需额外依赖
function renderInline(text, keyPrefix = "") {
  // 先把字面 <br> / &lt;br&gt; 转成换行，再在 ①②③ 等带圈数字前补换行（让 AI 输出的脏排版自动恢复）
  let normalized = String(text)
    .replace(/&lt;br\s*\/?&gt;/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // 合并被换行/空白拆散的 markdown 图片：![alt]\n(url) → ![alt](url)
    .replace(/(!\[[^\]]*\])\s+(\()/g, "$1$2")
    .replace(/(?!^)\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])/g, "\n$1");
  // 按 ![alt](url) 图片切分；图片切出后不再走加粗处理
  const imgRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const segments = [];
  let last = 0;
  let m;
  while ((m = imgRe.exec(normalized)) !== null) {
    if (m.index > last) segments.push({ type: "text", value: normalized.slice(last, m.index) });
    segments.push({ type: "img", alt: m[1] || "", url: m[2] });
    last = m.index + m[0].length;
  }
  if (last < normalized.length) segments.push({ type: "text", value: normalized.slice(last) });
  if (segments.length === 0) segments.push({ type: "text", value: normalized });

  return segments.map((seg, si) => {
    if (seg.type === "img") {
      return (
        <img
          key={`${keyPrefix}-img-${si}`}
          src={seg.url}
          alt={seg.alt}
          loading="lazy"
          className="inline-block max-w-full h-auto rounded-md border border-slate-200 my-1.5 align-middle"
          style={{ maxHeight: 260 }}
        />
      );
    }
    // 处理 **加粗**，并把 \n 渲染成 <br/>
    const parts = seg.value.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => {
      if (/^\*\*[^*]+\*\*$/.test(p)) {
        return <strong key={`${keyPrefix}-b-${si}-${i}`} className="font-semibold text-slate-800">{p.slice(2, -2)}</strong>;
      }
      const subLines = p.split("\n");
      return (
        <React.Fragment key={`${keyPrefix}-t-${si}-${i}`}>
          {subLines.map((ln, li) => (
            <React.Fragment key={li}>
              {ln}
              {li < subLines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </React.Fragment>
      );
    });
  });
}

// 判断一行是否是"独立成行的图片"（前后可能有空白）
function isStandaloneImageLine(s) {
  return /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.test(s);
}

// 把"单行塞满整张表"的脏数据还原成多行：在分隔行 ` | --- | --- | ` 处断行，并按列宽切分后续单元格
function normalizeInlineTables(raw) {
  let s = String(raw || "");
  // 在分隔片段（包含两个或更多 ---）前后强制换行
  s = s.replace(/\s*\|\s*(:?-{2,}:?\s*\|\s*){2,}:?-{2,}:?\s*\|?\s*/g, (m) => `\n${m.trim()}\n`);
  // 按行处理：若某行含分隔模式，则把其前一行（表头）和后续超长行按 `|` 数量切成多行
  const lines = s.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const sepMatch = /^\s*\|?\s*(:?-{2,}:?\s*\|\s*){1,}:?-{2,}:?\s*\|?\s*$/.test(cur);
    if (sepMatch) {
      const colCount = cur.split("|").filter(x => x.trim()).length;
      // 修正前一行：若它包含多于 colCount 列，截到 colCount
      if (out.length) {
        const prev = out[out.length - 1];
        const prevCells = prev.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
        if (prevCells.length > colCount) {
          out[out.length - 1] = "| " + prevCells.slice(0, colCount).map(c => c.trim()).join(" | ") + " |";
          // 把多出来的并入下一行待处理
          const overflow = prevCells.slice(colCount).map(c => c.trim()).join(" | ");
          if (overflow) lines.splice(i + 1, 0, "| " + overflow + " |");
        }
      }
      out.push(cur);
      // 处理后续行：按每 colCount 个单元格切一行
      let j = i + 1;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
        const cells = lines[j].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
        if (cells.length > colCount) {
          const chunks = [];
          for (let k = 0; k < cells.length; k += colCount) {
            chunks.push("| " + cells.slice(k, k + colCount).join(" | ") + " |");
          }
          lines.splice(j, 1, ...chunks);
        }
        // 跳过空单元格行
        if (cells.every(c => !c)) { lines.splice(j, 1); continue; }
        out.push(lines[j]);
        j++;
      }
      i = j - 1;
      continue;
    }
    out.push(cur);
  }
  return out.join("\n");
}

// 检测内容是否已经是原始 HTML（AI 经常直接吐 <div>/<h1>/<p>/<table> 等标签）
// 命中则直接用 HTML 渲染，避免被 Markdown 解析器当文本输出
function looksLikeHtml(s) {
  if (!s) return false;
  return /<(div|section|article|header|footer|h[1-6]|p|table|ul|ol|li|blockquote|figure|img|br|span|strong)(\s|>|\/)/i.test(s);
}

function MarkdownLite({ source }) {
  if (looksLikeHtml(source)) {
    return (
      <div
        className="md-html prose-sm max-w-none text-[11.5px] text-slate-600 leading-relaxed [&_h1]:text-[14px] [&_h1]:font-bold [&_h1]:text-slate-800 [&_h1]:my-2 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:my-1.5 [&_h3]:text-[12.5px] [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:my-1 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-slate-800 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2 [&_blockquote]:text-slate-500 [&_blockquote]:my-1 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_img]:border [&_img]:border-slate-200 [&_img]:my-1.5 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_table]:text-[11px] [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:text-left [&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-slate-200 [&_td]:align-top"
        dangerouslySetInnerHTML={{ __html: source }}
      />
    );
  }
  const text = normalizeInlineTables(source);
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (!line.trim()) { i++; continue; }

    // GFM 表格：当前行有 |，下一行是分隔行（---|---）
    const isTableSep = (s) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(s);
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const splitRow = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={`tbl-${blocks.length}`} className="overflow-x-auto my-2 rounded-md border border-slate-200">
          <table className="min-w-full text-[11.5px] border-collapse">
            <thead className="bg-slate-50">
              <tr>
                {header.map((h, hi) => (
                  <th key={hi} className="px-2.5 py-1.5 text-left font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    {renderInline(h, `th-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className="px-2.5 py-1.5 text-slate-600 border-b border-slate-100 align-top">
                      {renderInline(c, `td-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl <= 1 ? "text-[14px] font-bold text-slate-800 mt-2 mb-1.5"
                : lvl === 2 ? "text-[13px] font-bold text-slate-800 mt-2 mb-1"
                : "text-[12.5px] font-semibold text-slate-800 mt-1.5 mb-1";
      const Tag = `h${Math.min(lvl, 6)}`;
      blocks.push(<Tag key={`h-${blocks.length}`} className={cls}>{renderInline(h[2], `h-${blocks.length}`)}</Tag>);
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-2 border-slate-200" />);
      i++;
      continue;
    }

    // 独立成行的图片：收集相邻图片行；2~3 张并排展示，单张铺满
    if (isStandaloneImageLine(line)) {
      const imgs = [];
      let j = i;
      while (j < lines.length) {
        if (isStandaloneImageLine(lines[j])) {
          const m = lines[j].match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
          if (m) imgs.push({ alt: m[1] || "", url: m[2] });
          j++;
        } else if (!lines[j].trim()) {
          // 允许空行间隔
          if (isStandaloneImageLine(lines[j + 1] || "")) { j++; continue; }
          break;
        } else break;
      }
      if (imgs.length === 1) {
        blocks.push(
          <figure key={`img-${blocks.length}`} className="my-2">
            <img
              src={imgs[0].url}
              alt={imgs[0].alt}
              loading="lazy"
              className="w-full max-w-full h-auto rounded-lg border border-slate-200 shadow-sm"
              style={{ maxHeight: 420, objectFit: "contain", background: "#fff" }}
            />
            {imgs[0].alt && (
              <figcaption className="mt-1 text-[10.5px] text-slate-500 italic text-center">{imgs[0].alt}</figcaption>
            )}
          </figure>
        );
      } else {
        const cols = Math.min(imgs.length, 3);
        blocks.push(
          <div key={`imgs-${blocks.length}`} className="my-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {imgs.map((im, idx) => (
              <figure key={idx} className="m-0">
                <img
                  src={im.url}
                  alt={im.alt}
                  loading="lazy"
                  className="w-full h-auto rounded-lg border border-slate-200 shadow-sm"
                  style={{ aspectRatio: "4 / 3", objectFit: "cover", background: "#fff" }}
                />
                {im.alt && (
                  <figcaption className="mt-1 text-[10px] text-slate-500 italic text-center line-clamp-1">{im.alt}</figcaption>
                )}
              </figure>
            ))}
          </div>
        );
      }
      i = j;
      continue;
    }

    // 列表（- 或 数字.）
    const isUl = /^\s*[-*]\s+/.test(line);
    const isOl = /^\s*\d+\.\s+/.test(line);
    if (isUl || isOl) {
      const items = [];
      const re = isUl ? /^\s*[-*]\s+(.*)$/ : /^\s*\d+\.\s+(.*)$/;
      while (i < lines.length && (isUl ? /^\s*[-*]\s+/.test(lines[i]) : /^\s*\d+\.\s+/.test(lines[i]))) {
        const m = lines[i].match(re);
        items.push(m ? m[1] : lines[i]);
        i++;
      }
      const ListTag = isUl ? "ul" : "ol";
      blocks.push(
        <ListTag key={`l-${blocks.length}`} className={`${isUl ? "list-disc" : "list-decimal"} pl-5 my-1 space-y-0.5 text-[11.5px] text-slate-600`}>
          {items.map((it, idx) => <li key={idx} className="leading-relaxed">{renderInline(it, `li-${blocks.length}-${idx}`)}</li>)}
        </ListTag>
      );
      continue;
    }

    // 普通段落（合并相邻非空非块行）
    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^\s*---+\s*$/.test(lines[i])) {
      // 防止吞掉表格
      if (lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) break;
      // 防止吞掉独立成行的图片
      if (isStandaloneImageLine(lines[i])) break;
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-[11.5px] text-slate-600 leading-relaxed my-1">
          {renderInline(paraLines.join(" "), `p-${blocks.length}`)}
        </p>
      );
    }
  }

  return <div>{blocks}</div>;
}

// 调研类结果视图：标题/正文/章节均可编辑 + 下载按钮
export default function ResearchResultView({ data, preview, onChange, editable = true }) {
  const fileUrl = data?.file_url;
  const fileName = data?.file_name || "调研报告.md";
  const title = data?.topic || data?.title || data?.subject || "调研报告";
  const sections = Array.isArray(data?.sections) ? data.sections : null;
  const body = data?.executive_summary || data?.content || data?.summary || preview || "";

  const titleKey = data?.topic !== undefined ? "topic" : (data?.title !== undefined ? "title" : (data?.subject !== undefined ? "subject" : "title"));
  const bodyKey  = data?.executive_summary !== undefined ? "executive_summary" : (data?.content !== undefined ? "content" : (data?.summary !== undefined ? "summary" : "content"));

  const update = (patch) => {
    if (!onChange) return;
    onChange({ ...(data || {}), ...patch });
  };

  const updateSection = (idx, patch) => {
    if (!onChange || !sections) return;
    const next = sections.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ ...(data || {}), sections: next });
  };

  return (
    <div className="space-y-2.5">
      {/* 报告头 */}
      <div className="rounded-xl bg-gradient-to-br from-[#384877]/8 to-[#3b5aa2]/5 border border-[#384877]/15 p-3">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-3.5 h-3.5 text-[#384877]" />
          <span className="text-[10px] font-semibold text-[#384877] uppercase tracking-wider">调研报告</span>
        </div>
        {editable && onChange ? (
          <Input
            value={title}
            onChange={(e) => update({ [titleKey]: e.target.value })}
            className="text-[14px] font-bold text-slate-800 leading-snug bg-white/60 border-[#384877]/20 h-8"
          />
        ) : (
          <div className="text-[14px] font-bold text-slate-800 leading-snug">{title}</div>
        )}
      </div>

      {/* 章节卡 */}
      {sections && sections.length > 0 ? (
        <div className="space-y-2">
          {sections.map((s, i) => {
            const headingKey = s.heading !== undefined ? "heading" : "title";
            const contentKey = s.body !== undefined ? "body" : "content";
            const heading = s[headingKey] || `章节 ${i + 1}`;
            const content = s[contentKey] || "";
            return (
              <div key={i} className="rounded-lg bg-white border border-slate-200 p-3">
                {editable && onChange ? (
                  <>
                    <Input
                      value={heading}
                      onChange={(e) => updateSection(i, { [headingKey]: e.target.value })}
                      className="text-[12.5px] font-bold text-slate-800 mb-1.5 h-7 border-slate-200"
                    />
                    <Textarea
                      value={content}
                      onChange={(e) => updateSection(i, { [contentKey]: e.target.value })}
                      className="text-[11.5px] text-slate-600 leading-relaxed min-h-[80px] border-slate-200 font-sans"
                    />
                  </>
                ) : (
                  <>
                    <div className="text-[12.5px] font-bold text-slate-800 mb-1">{heading}</div>
                    {content && (
                      <div className="text-[11.5px] text-slate-600 leading-relaxed">
                        <MarkdownLite source={content} />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        editable && onChange ? (
          <Textarea
            value={body}
            onChange={(e) => update({ [bodyKey]: e.target.value })}
            className="text-[12px] text-slate-700 font-sans leading-relaxed min-h-[200px] bg-white border-slate-200"
            placeholder="报告内容..."
          />
        ) : (
          body && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 max-h-[28rem] overflow-y-auto">
              <MarkdownLite source={body} />
            </div>
          )
        )
      )}

      {/* 预览按钮（新标签打开，不触发下载） */}
      {fileUrl && (() => {
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        // 浏览器原生可预览：PDF/图片/HTML/纯文本/MD 直接打开
        const nativePreview = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'html', 'htm', 'txt', 'md'];
        const previewHref = nativePreview.includes(ext)
          ? fileUrl
          : `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=false`;
        return (
        <a
          href={previewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 hover:border-emerald-400 hover:shadow px-3 py-2.5 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-white border border-emerald-200 flex items-center justify-center group-hover:scale-110 transition-transform">
            <FileText className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-emerald-900 truncate">{fileName}</div>
            <div className="text-[10.5px] text-emerald-700 flex items-center gap-1">
              <ExternalLink className="w-2.5 h-2.5" /> 完整报告 · 点击在新标签预览
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
        </a>
        );
      })()}
    </div>
  );
}