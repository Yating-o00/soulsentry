import { useMemo } from "react";
import { View, Text, ScrollView } from "@tarojs/components";

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

// 文本 + Markdown 表格混排渲染
// textStyle：普通文本段落样式（小程序 Text 不继承 View 字体，需直接作用于 Text）
export default function RichText({ text, textStyle, accent = "#384877", ink = "#1c1c1e" }) {
  const segments = useMemo(() => parseMarkdownSegments(text), [text]);
  if (!text) return null;

  const border = "rgba(56, 72, 119, 0.14)";
  const headerBg = "rgba(56, 72, 119, 0.06)";

  return (
    <View>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <Text key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", ...textStyle }}>
            {seg.text}
          </Text>
        ) : (
          <ScrollView key={i} scrollX showScrollbar={false} style={{ margin: "12rpx 0" }}>
            <View
              style={{
                display: "inline-block",
                border: `1rpx solid ${border}`,
                borderRadius: "12rpx",
                overflow: "hidden",
                background: "#fff"
              }}
            >
              {seg.rows.map((row, ri) => (
                <View
                  key={ri}
                  style={{
                    display: "flex",
                    borderTop: ri > 0 ? `1rpx solid ${border}` : "none",
                    background: ri === 0 ? headerBg : ri % 2 === 0 ? "rgba(56, 72, 119, 0.02)" : "#fff"
                  }}
                >
                  {row.map((cell, ci) => (
                    <View
                      key={ci}
                      style={{
                        padding: "14rpx 20rpx",
                        borderLeft: ci > 0 ? `1rpx solid ${border}` : "none",
                        maxWidth: "300rpx",
                        flexShrink: 0
                      }}
                    >
                      <Text
                        style={{
                          fontSize: "24rpx",
                          lineHeight: "36rpx",
                          color: ri === 0 ? accent : ink,
                          fontWeight: ri === 0 ? 600 : 400
                        }}
                      >
                        {cell}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        )
      )}
    </View>
  );
}
