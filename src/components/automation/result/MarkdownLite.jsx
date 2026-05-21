import React from "react";

// 轻量 Markdown 渲染器：处理标题 / 加粗 / 图片 / 列表 / GFM 表格 / 段落，无需额外依赖
function renderInline(text, keyPrefix = "") {
  let normalized = String(text)
    .replace(/&lt;br\s*\/?&gt;/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/(!\[[^\]]*\])\s+(\()/g, "$1$2")
    .replace(/(?!^)\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])/g, "\n$1");
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

function isStandaloneImageLine(s) {
  return /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.test(s);
}

// 把"单行塞满整张表"的脏数据还原成多行
function normalizeInlineTables(raw) {
  let s = String(raw || "");
  s = s.replace(/\s*\|\s*(:?-{2,}:?\s*\|\s*){2,}:?-{2,}:?\s*\|?\s*/g, (m) => `\n${m.trim()}\n`);
  const lines = s.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const sepMatch = /^\s*\|?\s*(:?-{2,}:?\s*\|\s*){1,}:?-{2,}:?\s*\|?\s*$/.test(cur);
    if (sepMatch) {
      const colCount = cur.split("|").filter(x => x.trim()).length;
      if (out.length) {
        const prev = out[out.length - 1];
        const prevCells = prev.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
        if (prevCells.length > colCount) {
          out[out.length - 1] = "| " + prevCells.slice(0, colCount).map(c => c.trim()).join(" | ") + " |";
          const overflow = prevCells.slice(colCount).map(c => c.trim()).join(" | ");
          if (overflow) lines.splice(i + 1, 0, "| " + overflow + " |");
        }
      }
      out.push(cur);
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

export function looksLikeHtml(s) {
  if (!s) return false;
  const matches = String(s).match(/<\/?(div|section|article|header|footer|h[1-6]|p|table|tr|td|th|ul|ol|li|blockquote|figure|img|br|span|strong)(\s|>|\/)/gi);
  return !!(matches && matches.length >= 2);
}

// 检测是否包含 Markdown 表格（含 | --- | 分隔行）
export function hasMarkdownTable(s) {
  if (!s) return false;
  const text = normalizeInlineTables(s);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes("|") && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      return true;
    }
  }
  return false;
}

export default function MarkdownLite({ source }) {
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
    if (!line.trim()) { i++; continue; }

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
                <tr key={ri} className="even:bg-slate-50/40">
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

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-2 border-slate-200" />);
      i++;
      continue;
    }

    if (isStandaloneImageLine(line)) {
      const imgs = [];
      let j = i;
      while (j < lines.length) {
        if (isStandaloneImageLine(lines[j])) {
          const m = lines[j].match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
          if (m) imgs.push({ alt: m[1] || "", url: m[2] });
          j++;
        } else if (!lines[j].trim()) {
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

    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^\s*---+\s*$/.test(lines[i])) {
      if (lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) break;
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