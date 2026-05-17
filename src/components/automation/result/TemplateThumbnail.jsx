import React from "react";

/**
 * 排版方案的迷你示意图 —— 用纯 div 几何块表示每种版式的视觉结构
 * 在选择器中替代单纯文字标签，让不同方案的差异一眼可辨。
 *
 * 颜色含义：
 *   - slate 实色块 = 标题/正文文字
 *   - indigo 浅块 = 图片
 */
export default function TemplateThumbnail({ template, active }) {
  const textBar = active ? "bg-white/80" : "bg-slate-400";
  const textBarLight = active ? "bg-white/50" : "bg-slate-300";
  const imgBlock = active ? "bg-white/40 border-white/60" : "bg-indigo-100 border-indigo-200";

  const Frame = ({ children }) => (
    <div className={`w-9 h-7 rounded-[3px] border p-[3px] flex gap-[2px] ${
      active ? "border-white/40 bg-white/10" : "border-slate-200 bg-white"
    }`}>
      {children}
    </div>
  );

  switch (template) {
    case "classic":
      // 上图下文（横向通栏）
      return (
        <Frame>
          <div className="flex flex-col gap-[2px] w-full">
            <div className={`h-[10px] rounded-[1.5px] border ${imgBlock}`} />
            <div className={`h-[1.5px] w-3/4 rounded-full ${textBar}`} />
            <div className={`h-[1.5px] w-full rounded-full ${textBarLight}`} />
            <div className={`h-[1.5px] w-2/3 rounded-full ${textBarLight}`} />
          </div>
        </Frame>
      );

    case "magazine":
      // 左图右文
      return (
        <Frame>
          <div className={`w-[14px] rounded-[1.5px] border ${imgBlock}`} />
          <div className="flex flex-col gap-[2px] flex-1 justify-center">
            <div className={`h-[1.5px] w-full rounded-full ${textBar}`} />
            <div className={`h-[1.5px] w-3/4 rounded-full ${textBarLight}`} />
            <div className={`h-[1.5px] w-5/6 rounded-full ${textBarLight}`} />
            <div className={`h-[1.5px] w-1/2 rounded-full ${textBarLight}`} />
          </div>
        </Frame>
      );

    case "gallery":
      // 2x2 图片网格
      return (
        <Frame>
          <div className="grid grid-cols-2 gap-[1.5px] w-full">
            <div className={`rounded-[1px] border ${imgBlock}`} />
            <div className={`rounded-[1px] border ${imgBlock}`} />
            <div className={`rounded-[1px] border ${imgBlock}`} />
            <div className={`rounded-[1px] border ${imgBlock}`} />
          </div>
        </Frame>
      );

    case "card":
      // 卡片堆叠：每张卡有小图 + 文字
      return (
        <Frame>
          <div className="flex flex-col gap-[2px] w-full">
            <div className={`flex gap-[2px] items-center rounded-[1px] border px-[1.5px] py-[1px] ${
              active ? "border-white/30 bg-white/10" : "border-slate-200 bg-slate-50"
            }`}>
              <div className={`w-[5px] h-[5px] rounded-[1px] ${imgBlock} border-0`} />
              <div className={`h-[1.5px] flex-1 rounded-full ${textBar}`} />
            </div>
            <div className={`flex gap-[2px] items-center rounded-[1px] border px-[1.5px] py-[1px] ${
              active ? "border-white/30 bg-white/10" : "border-slate-200 bg-slate-50"
            }`}>
              <div className={`w-[5px] h-[5px] rounded-[1px] ${imgBlock} border-0`} />
              <div className={`h-[1.5px] flex-1 rounded-full ${textBar}`} />
            </div>
            <div className={`flex gap-[2px] items-center rounded-[1px] border px-[1.5px] py-[1px] ${
              active ? "border-white/30 bg-white/10" : "border-slate-200 bg-slate-50"
            }`}>
              <div className={`w-[5px] h-[5px] rounded-[1px] ${imgBlock} border-0`} />
              <div className={`h-[1.5px] flex-1 rounded-full ${textBar}`} />
            </div>
          </div>
        </Frame>
      );

    case "minimal":
      // 纯文字、无图，行距更松
      return (
        <Frame>
          <div className="flex flex-col gap-[3px] w-full justify-center">
            <div className={`h-[1.5px] w-1/2 rounded-full ${textBar}`} />
            <div className={`h-[1.5px] w-full rounded-full ${textBarLight}`} />
            <div className={`h-[1.5px] w-5/6 rounded-full ${textBarLight}`} />
            <div className={`h-[1.5px] w-3/4 rounded-full ${textBarLight}`} />
          </div>
        </Frame>
      );

    default:
      return (
        <Frame>
          <div className="flex flex-col gap-[2px] w-full">
            <div className={`h-[1.5px] w-3/4 rounded-full ${textBar}`} />
            <div className={`h-[1.5px] w-full rounded-full ${textBarLight}`} />
          </div>
        </Frame>
      );
  }
}