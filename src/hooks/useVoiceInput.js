import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * 通用语音输入 hook（Web Speech API）。
 * @param {(transcript: string) => void} onTranscript - 每段最终识别结果回调（增量文本）
 * @returns {{ isListening: boolean, toggle: () => void, stop: () => void, supported: boolean }}
 */
export function useVoiceInput(onTranscript) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const SpeechRecognitionAPI =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
  const supported = !!SpeechRecognitionAPI;

  const stop = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const start = () => {
    if (!SpeechRecognitionAPI) {
      toast.error("您的浏览器不支持语音输入");
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i] && e.results[i][0] && e.results[i].isFinal) {
          finalText += e.results[i][0].transcript;
        }
      }
      if (finalText && onTranscript) onTranscript(finalText);
    };

    try {
      recognition.start();
    } catch (_) {
      toast.error("语音输入初始化失败");
    }
  };

  const toggle = () => {
    if (isListening) stop();
    else start();
  };

  return { isListening, toggle, stop, supported };
}