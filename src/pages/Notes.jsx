import React, { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

// 心签已统一到 HeartSign 聊天式页面。Notes 路径保留为兼容入口，自动跳转。
export default function Notes() {
  const [searchParams] = useSearchParams();
  const noteId = searchParams.get("noteId");
  const target = noteId ? `/HeartSign?noteId=${encodeURIComponent(noteId)}` : "/HeartSign";

  useEffect(() => {
    // 触发统计/侧边栏高亮一次性事件（可选）
  }, []);

  return <Navigate to={target} replace />;
}