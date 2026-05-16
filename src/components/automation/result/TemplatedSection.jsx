import React from "react";
import { TEMPLATES, extractImagesAndText } from "./researchTemplates";

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
  const { images, text } = extractImagesAndText(content);
  const tpl = TEMPLATES[template] ? template : "classic";

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
          <PlainText source={text} />
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
            <PlainText source={text} size="lg" />
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
          <PlainText source={text} />
        </div>
      )}

      {/* 卡片:图文配对成纵向卡片(每段配一张图) */}
      {tpl === "card" && (
        <div className="space-y-2.5">
          {(() => {
            // 把 text 按段落切分,与 images 一一配对
            const paras = String(text).split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
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
                    <PlainText source={p || ""} />
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
          <PlainText source={text || ""} size="lg" />
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