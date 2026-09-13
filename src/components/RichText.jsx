import React, { useMemo } from "react";

// 解析文本中的 Markdown 表格（| 表头 | + |---| 分隔行 + 数据行），其余内容按普通文本段落返回
// 返回 [{ type: "text", text } | { type: "table", rows: string[][] }]
export function parseMarkdownSegments(text) {
  const lines = String(text || "").split("\n");
  const segments = [];
  let textBuf = [];

  const flushText = () => {
    if (textBuf.length) {
      const t = textBuf.join("\n");
      if (t.trim()) segments.push({ type: "text", text: t });
      textBuf = [];
    }
  };

  const isSeparator = (l) => /^\|?[\s\-:|]+\|?$/.test(l) && l.includes("-");
  const splitRow = (l) =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("|") && i + 1 < lines.length && isSeparator(lines[i + 1].trim())) {
      const rows = [splitRow(line)];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i].trim()));
        i += 1;
      }
      i -= 1;
      flushText();
      segments.push({ type: "table", rows });
    } else {
      textBuf.push(lines[i]);
    }
  }
  flushText();
  return segments;
}

export function hasMarkdownTable(text) {
  return parseMarkdownSegments(text).some((s) => s.type === "table");
}

// 文本 + Markdown 表格混排渲染：表格为品牌蓝主题横滑表格，超出宽度可横向滚动
export default function RichText({ text, className = "", textClassName = "" }) {
  const segments = useMemo(() => parseMarkdownSegments(text), [text]);
  if (!text) return null;

  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i} className={`whitespace-pre-wrap break-words ${textClassName}`}>
            {seg.text}
          </span>
        ) : (
          <div key={i} className="overflow-x-auto my-2 -mx-0.5">
            <table className="border-collapse text-[12.5px] leading-relaxed bg-white rounded-xl overflow-hidden" style={{ border: "1px solid rgba(56,72,119,0.14)" }}>
              <thead>
                <tr>
                  {seg.rows[0].map((h, ci) => (
                    <th
                      key={ci}
                      className="text-left font-semibold text-[#384877] px-3 py-2 whitespace-nowrap"
                      style={{ background: "rgba(56,72,119,0.06)", borderLeft: ci > 0 ? "1px solid rgba(56,72,119,0.14)" : "none" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              {seg.rows.length > 1 && (
                <tbody>
                  {seg.rows.slice(1).map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 === 1 ? "rgba(56,72,119,0.02)" : "#fff" }}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="text-slate-700 px-3 py-2 align-top"
                          style={{ borderLeft: ci > 0 ? "1px solid rgba(56,72,119,0.14)" : "none", borderTop: "1px solid rgba(56,72,119,0.14)" }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        )
      )}
    </div>
  );
}
