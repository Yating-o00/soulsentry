import { useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import { useRef } from "react";

export const APP_SHARE_TITLE = "心栈 SoulSentry · 从容地记住每一声心动";
export const APP_SHARE_QUERY = "";

const normalizePath = (p) => {
  const s = String(p || "").trim().replace(/^\//, "");
  return s || "pages/index/index";
};

/**
 * 页面一键转发能力：
 * - 启用右上角「发送给朋友 / 分享到朋友圈」菜单
 * - 卡片内的 <Button openType="share"> 通过 data-* 传入 shareTitle / sharePath，实现按内容一键转发；
 *   也可传 buildShare(options) 从页面状态动态构造（如同步读取已预取的分享 token）
 * 注意：onShareAppMessage 必须同步返回，异步结果（如现取 token）请提前预取。
 */
export function useShare({ title = APP_SHARE_TITLE, path = "pages/index/index", buildShare } = {}) {
  const buildRef = useRef(buildShare);
  buildRef.current = buildShare;

  useShareAppMessage((options = {}) => {
    const custom = buildRef.current?.(options) || {};
    const ds = options.from === "button" ? options.target?.dataset || {} : {};
    return {
      title: String(ds.shareTitle || custom.title || title).slice(0, 60),
      path: normalizePath(ds.sharePath || custom.path || path),
      // 自定义转发封面（如打卡约定的品牌蓝分享图），未生成时走默认截图
      imageUrl: ds.shareImageUrl || custom.imageUrl
    };
  });

  useShareTimeline(() => ({
    title: String(title).slice(0, 60),
    query: APP_SHARE_QUERY
  }));
}
