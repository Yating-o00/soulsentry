import React from "react";
import { TEMPLATES, extractImagesAndText } from "./researchTemplates";

// 检测内容是否已经是原始 HTML（命中即用 HTML 渲染，避免标签被当字面文本）
function looksLikeHtml(s) {
  if (!s) return false;
  const matches = String(s).match(/<\/?(div|section|article|header|footer|h[1-6]|p|table|tr|td|th|ul|ol|li|blockquote|figure|img|br|span|strong)(\s|>|\/)/gi);
  return !!(matches && matches.length >= 2);
}

// 从 HTML 字符串里抽出 <img> 列表,并返回剥掉 <img>/<figure> 后的"纯 HTML 文本"
// 同时返回 segments:按图片在原文出现的位置切片,确保图片与其紧邻文字保持顺序
function extractImagesFromHtml(html) {
  if (!html) return { images: [], cleanHtml: "", segments: [] };
  // 把 <figure>...</figure> 先归一化:抽出其中的 src/alt,替换为单一 <img> 标签,避免重复
  let normalized = String(html).replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (_, inner) => {
    const srcM = inner.match(/<img\b[^>]*?src=["']([^"']+)["'][^>]*?>/i);
    const altM = inner.match(/<img\b[^>]*?alt=["']([^"']*)["'][^>]*?>/i)
              || inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
    if (!srcM) return "";
    const alt = altM ? String(altM[1]).replace(/<[^>]+>/g, "").trim() : "";
    return `<img src="${srcM[1]}" alt="${alt.replace(/"/g, "&quot;")}">`;
  });

  const images = [];
  const segments = [];
  const imgRe = /<img\b[^>]*?>/gi;
  let last = 0;
  let m;
  while ((m = imgRe.exec(normalized)) !== null) {
    const tag = m[0];
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);
    if (!srcMatch) continue;
    const img = { url: srcMatch[1], alt: altMatch ? altMatch[1] : "" };
    images.push(img);
    const before = normalized.slice(last, m.index).trim();
    segments.push({ text: before, image: img });
    last = m.index + tag.length;
  }
  const tail = normalized.slice(last).trim();
  if (tail || segments.length === 0) segments.push({ text: tail, image: null });

  const cleanHtml = normalized.replace(imgRe, "");
  return { images, cleanHtml, segments };
}

// HTML 直渲染容器:让原始 HTML 标签正常显示,并约束图片/表格不溢出
function HtmlBlock({ source }) {
  return (
    <div
      className="md-html text-[11.5px] text-slate-600 leading-relaxed [&_h1]:text-[14px] [&_h1]:font-bold [&_h1]:text-slate-800 [&_h1]:my-2 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:my-1.5 [&_h3]:text-[12.5px] [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:my-1 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-slate-800 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2 [&_blockquote]:text-slate-500 [&_blockquote]:my-1 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md [&_img]:border [&_img]:border-slate-200 [&_img]:my-1.5 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_table]:text-[11px] [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:text-left [&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-slate-200 [&_td]:align-top overflow-x-auto break-words"
      dangerouslySetInnerHTML={{ __html: source }}
    />
  );
}

// 渲染纯文字部分(把已被剥离的纯文本按行渲染,保留段落和加粗)
function PlainText({ source, size = "sm" }) {
  if (!source) return null;
  const cls = size === "lg"
    ? "text-[12.5px] text-slate-700 leading-relaxed"
    : "text-[11.5px] text-slate-600 leading-relaxed";
  const paragraphs = String(source).split(/\n{2,}/).filter(p => p.trim());
  return (
    <>
      {paragraphs.map((p, pi) => {
        const lines = p.split("\n");
        return (
          <p key={pi} className={`${cls} my-1`}>
            {lines.map((ln, li) => {
              const parts = ln.split(/(\*\*[^*]+\*\*)/g);
              return (
                <React.Fragment key={li}>
                  {parts.map((seg, si) =>
                    /^\*\*[^*]+\*\*$/.test(seg)
                      ? <strong key={si} className="font-semibold text-slate-800">{seg.slice(2, -2)}</strong>
                      : <React.Fragment key={si}>{seg}</React.Fragment>
                  )}
                  {li < lines.length - 1 && <br />}
                </React.Fragment>
              );
            })}
          </p>
        );
      })}
    </>
  );
}

// 单张图片(适应容器,不溢出/不变形)
function ImageBlock({ img, ratio = "4/3", maxH = 320, rounded = "rounded-lg" }) {
  if (!img?.url) return null;
  return (
    <figure className="m-0">
      <img
        src={img.url}
        alt={img.alt || ""}
        loading="lazy"
        className={`w-full h-auto ${rounded} border border-slate-200 shadow-sm bg-white`}
        style={{ aspectRatio: ratio, objectFit: "cover", maxHeight: maxH }}
      />
      {img.alt && (
        <figcaption className="mt-1 text-[10px] text-slate-500 italic text-center line-clamp-2">
          {img.alt}
        </figcaption>
      )}
    </figure>
  );
}

// 主组件：按模板渲染一个章节(标题 + 内容 + 图片自动布局)
export default function TemplatedSection({ heading, content, template = "classic" }) {
  const isHtml = looksLikeHtml(content);
  // HTML 内容:抽出图片走模板,纯 HTML 文本(已剥图)替代 PlainText 渲染
  // Markdown 内容:走原有 extractImagesAndText
  const { images, text, htmlText, segments } = React.useMemo(() => {
    if (isHtml) {
      const { images: imgs, cleanHtml, segments: segs } = extractImagesFromHtml(content);
      return { images: imgs, text: "", htmlText: cleanHtml, segments: segs };
    }
    const ext = extractImagesAndText(content);
    return { images: ext.images, text: ext.text, htmlText: null, segments: ext.segments || [] };
  }, [content, isHtml]);

  // 渲染单段文本(根据 isHtml 自动选择)
  const renderText = (src, size) =>
    isHtml ? <HtmlBlock source={src || ""} /> : <PlainText source={src || ""} size={size} />;

  const tpl = TEMPLATES[template] ? template : "classic";

  // 文字渲染器:HTML 模式用 HtmlBlock,Markdown 模式用 PlainText
  const TextRender = ({ src, size }) =>
    isHtml ? <HtmlBlock source={src ?? htmlText} /> : <PlainText source={src ?? text} size={size} />;

  // 把 segments 合并成"文-图-文-图"块序列,用于杂志/卡片模式按出现顺序渲染
  const pairedBlocks = React.useMemo(() => {
    const segs = (segments && segments.length ? segments : [{ text: isHtml ? htmlText : text, image: null }]);
    return segs.filter(s => (s.text && s.text.replace(/<[^>]+>/g, "").trim()) || s.image);
  }, [segments, isHtml, htmlText, text]);

  return (
    <div className="rounded-lg bg-white border border-slate-200 p-3 overflow-hidden">
      {heading && (
        <div className="text-[12.5px] font-bold text-slate-800 mb-2 pb-1.5 border-b border-slate-100">
          {heading}
        </div>
      )}

      {/* 经典:文字在上,图片在下居中 */}
      {tpl === "classic" && (
        <div className="space-y-2">
          <TextRender />
          {images.length > 0 && (
            <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: `repeat(${Math.min(images.length, 2)}, minmax(0, 1fr))` }}>
              {images.map((im, i) => (
                <ImageBlock key={i} img={im} ratio="16/10" maxH={300} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 杂志:按段落顺序,图文交替,左图右文,保证图与紧邻文字一致 */}
      {tpl === "magazine" && (
        <div className="space-y-3">
          {pairedBlocks.map((seg, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-start">
              {seg.image ? (
                <div className="sm:col-span-2 min-w-0">
                  <ImageBlock img={seg.image} ratio="4/3" maxH={220} />
                </div>
              ) : null}
              <div className={`min-w-0 ${seg.image ? "sm:col-span-3" : "sm:col-span-5"}`}>
                {renderText(seg.text, "lg")}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 画廊:图片网格在上,文字说明在下 */}
      {tpl === "gallery" && (
        <div className="space-y-2.5">
          {images.length > 0 && (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, minmax(0, 1fr))` }}
            >
              {images.map((im, i) => (
                <ImageBlock key={i} img={im} ratio="1/1" maxH={180} />
              ))}
            </div>
          )}
          <TextRender />
        </div>
      )}

      {/* 卡片:每个 segment 单独成卡,图与紧邻文字成对 */}
      {tpl === "card" && (
        <div className="space-y-2.5">
          {pairedBlocks.map((seg, i) => (
            <div key={i} className="rounded-md bg-slate-50/60 border border-slate-100 p-2.5 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-center">
              {seg.image ? (
                <div className="sm:col-span-2 min-w-0">
                  <ImageBlock img={seg.image} ratio="4/3" maxH={160} rounded="rounded-md" />
                </div>
              ) : null}
              <div className={`min-w-0 ${seg.image ? "sm:col-span-3" : "sm:col-span-5"}`}>
                {renderText(seg.text)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 极简:纯文字 */}
      {tpl === "minimal" && (
        <div>
          <TextRender size="lg" />
          {images.length > 0 && (
            <div className="mt-2">
              <ImageBlock img={images[0]} ratio="16/9" maxH={240} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}