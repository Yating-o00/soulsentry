import React, { useEffect } from "react";
import { createPageUrl } from "@/utils";

// 心签页已并入「灵感心签」（Notes）：五类过滤 / 回应浓度 / 卡内对话 / 抽签回顾 / 保险柜
// 旧 /HeartSign 路由保留为重定向，避免收藏链接与小程序 web-view 失效
export default function HeartSign() {
  useEffect(() => {
    // 保留 query（签卡二维码带 ?noteId=），让 Notes 页能直接打开对应心签
    window.location.replace(createPageUrl("Notes") + window.location.search);
  }, []);
  return null;
}
