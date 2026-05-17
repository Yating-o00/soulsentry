import React from "react";
import { TEMPLATES, extractImagesAndText } from "./researchTemplates";

// 检测内容是否已经是原始 HTML（命中即用 HTML 渲染，避免标签被当字面文本）
function looksLikeHtml(s) {
  if (!s) return false;
  const matches = String(s).match(/<\/?(div|section|article|header|footer|h[1-6]|p|table|tr|td|th|ul|ol|li|blockquote|figure|img|br|span|strong)(\s|>|\/)/gi);
  return !!(matches && matches.length >= 2);
}

// 从 HTML 字符串里抽出 <img> 列表,并返回剥掉 <img>/<figure> 后的"纯 HTML 文本"
function extractImagesFromHtml(html) {
  if (!html) return { images: [], cleanHtml: "" };
  const images = [];
  const imgRe = /<img\b[^>]*?src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?>/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    // 再扫一遍取 alt(因为上面那条正则在 src 之后才匹配 alt,顺序可能反)
    const tag = m[0];
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);
    images.push({ url: m[1], alt: altMatch ? altMatch[1] : "" });
  }
  // 去掉 <figure>...</figure> 整块(常包含 img + figcaption)和裸 <img>
  const cleanHtml = html
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "")
    .replace(/<img\b[^>]*?>/gi, "");
  return { images, cleanHtml };
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
  const { images, text, htmlText } = React.useMemo(() => {
    if (isHtml) {
      const { images: imgs, cleanHtml } = extractImagesFromHtml(content);
      return { images: imgs, text: "", htmlText: cleanHtml };
    }
    const ext = extractImagesAndText(content);
    return { images: ext.images, text: ext.text, htmlText: null };
  }, [content, isHtml]);

  const tpl = TEMPLATES[template] ? template : "classic";

  // 文字渲染器:HTML 模式用 HtmlBlock,Markdown 模式用 PlainText
  const TextRender = ({ src, size }) =>
    isHtml ? <HtmlBlock source={src ?? htmlText} /> : <PlainText source={src ?? text} size={size} />;

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

      {/* 杂志:左文右图(图片<=2张) */}
      {tpl === "magazine" && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-start">
          <div className="sm:col-span-3 min-w-0">
            <TextRender size="lg" />
          </div>
          <div className="sm:col-span-2 min-w-0 space-y-2">
            {images.slice(0, 2).map((im, i) => (
              <ImageBlock key={i} img={im} ratio="4/3" maxH={220} />
            ))}
          </div>
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

      {/* 卡片:图文配对成纵向卡片(每段配一张图) */}
      {tpl === "card" && (
        <div className="space-y-2.5">
          {(() => {
            // HTML 模式:把 cleanHtml 按 </p>/<br> 等大块切分,与 images 配对;Markdown 模式按段落切
            const paras = isHtml
              ? String(htmlText || "").split(/<\/p>|<\/h[1-6]>|<hr\s*\/?>/i).map(p => p.trim()).filter(Boolean).map(p => p + (/<p|<h[1-6]/i.test(p) ? "" : ""))
              : String(text).split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
            const rows = Math.max(paras.length, images.length);
            const out = [];
            for (let i = 0; i < rows; i++) {
              const p = paras[i];
              const im = images[i];
              out.push(
                <div key={i} className="rounded-md bg-slate-50/60 border border-slate-100 p-2.5 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-center">
                  {im ? (
                    <div className="sm:col-span-2 min-w-0">
                      <ImageBlock img={im} ratio="4/3" maxH={160} rounded="rounded-md" />
                    </div>
                  ) : null}
                  <div className={`min-w-0 ${im ? "sm:col-span-3" : "sm:col-span-5"}`}>
                    {isHtml
                      ? <HtmlBlock source={p || ""} />
                      : <PlainText source={p || ""} />}
                  </div>
                </div>
              );
            }
            return out;
          })()}
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