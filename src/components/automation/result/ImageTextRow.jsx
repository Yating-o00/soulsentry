import React from "react";

// 左图右文的稳定分栏组件
// - 桌面端：左侧图（最多 240px 宽），右侧 bullets/段落
// - 移动端：自动堆叠（图在上、文在下）
export default function ImageTextRow({ image, caption, children }) {
  if (!image) {
    return <div className="text-[11.5px] text-slate-600 leading-relaxed">{children}</div>;
  }
  return (
    <div className="my-3 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="flex flex-col sm:flex-row">
        {/* 图片区 */}
        <div className="sm:w-[44%] sm:max-w-[260px] sm:flex-shrink-0 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-2">
          <figure className="m-0 w-full">
            <img
              src={image.url}
              alt={image.alt || caption || ""}
              loading="lazy"
              className="w-full h-auto rounded-lg"
              style={{ maxHeight: 280, objectFit: "contain", background: "#fff" }}
            />
            {(image.alt || caption) && (
              <figcaption className="mt-1.5 text-[10px] text-slate-500 italic text-center line-clamp-2">
                {image.alt || caption}
              </figcaption>
            )}
          </figure>
        </div>
        {/* 文字区 */}
        <div className="flex-1 min-w-0 p-3 sm:p-4 text-[12px] text-slate-700 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}