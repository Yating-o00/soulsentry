import React, { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { insertTextIntoElement, isEditableTarget } from "./voiceInsert";

/**
 * 全局语音输入：任何输入框/文本域/富文本获得焦点时，
 * 在其右下角浮出麦克风按钮，语音识别结果插入光标处。
 */
export default function GlobalVoiceInput() {
  const [anchor, setAnchor] = useState(null); // { top, left }
  const targetRef = useRef(null);

  const { isListening, toggle, stop, supported } = useVoiceInput((text) => {
    if (targetRef.current) insertTextIntoElement(targetRef.current, text);
  });
  const listeningRef = useRef(false);
  listeningRef.current = isListening;

  const updatePosition = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return setAnchor(null);
    setAnchor({
      top: Math.min(rect.bottom, window.innerHeight - 12) - 34,
      left: Math.min(rect.right, window.innerWidth - 12) - 34,
    });
  };

  useEffect(() => {
    if (!supported) return;

    const onFocusIn = (e) => {
      const el = e.target;
      if (!isEditableTarget(el)) return;
      targetRef.current = el;
      updatePosition(el);
    };

    const onFocusOut = (e) => {
      // 点击麦克风按钮本身不隐藏；正在听写时保持显示
      const next = e.relatedTarget;
      if (next && next.closest && next.closest("[data-voice-mic]")) return;
      if (listeningRef.current) return;
      setTimeout(() => {
        if (listeningRef.current) return;
        const active = document.activeElement;
        if (!isEditableTarget(active)) {
          targetRef.current = null;
          setAnchor(null);
        }
      }, 150);
    };

    const onReposition = () => {
      if (targetRef.current && document.contains(targetRef.current)) {
        updatePosition(targetRef.current);
      } else if (targetRef.current) {
        stopAndHide();
      }
    };

    const stopAndHide = () => {
      stop();
      targetRef.current = null;
      setAnchor(null);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  if (!supported || !anchor) return null;

  return (
    <button
      type="button"
      data-voice-mic
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      title={isListening ? "停止语音输入" : "语音输入"}
      aria-label="语音输入"
      className={`no-min-size fixed z-[9999] w-7 h-7 rounded-full flex items-center justify-center shadow-md border transition-all duration-200 ${
        isListening
          ? "bg-red-500 border-red-400 text-white animate-pulse scale-110"
          : "bg-white/95 border-slate-200 text-slate-500 hover:text-[#384877] hover:border-[#384877]/40 hover:scale-105"
      }`}
      style={{ top: anchor.top, left: anchor.left }}
    >
      <Mic className="w-3.5 h-3.5" />
    </button>
  );
}