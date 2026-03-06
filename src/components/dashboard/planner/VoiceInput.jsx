import React, { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function VoiceInput({ onResult, disabled }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        } else {
          interimText += event.results[i][0].transcript;
        }
      }
      setTranscript(finalText + interimText);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current || disabled) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      if (transcript.trim()) {
        onResult(transcript.trim());
        setTranscript("");
      }
    } else {
      setTranscript("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleStop = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    if (transcript.trim()) {
      onResult(transcript.trim());
      setTranscript("");
    }
  };

  if (!supported) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Voice button */}
      <button
        type="button"
        onClick={isListening ? handleStop : toggleListening}
        disabled={disabled}
        className={cn(
          "relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300",
          isListening
            ? "bg-red-500 text-white shadow-lg shadow-red-500/30 scale-105"
            : "bg-[#384877] text-white shadow-lg shadow-[#384877]/30 hover:shadow-xl hover:scale-105",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
            <span className="absolute inset-[-4px] rounded-full border-2 border-red-300 animate-pulse" />
          </>
        )}
        {isListening ? <MicOff className="w-6 h-6 relative z-10" /> : <Mic className="w-6 h-6" />}
      </button>

      {/* Status text */}
      <p className={cn(
        "text-xs font-medium transition-colors",
        isListening ? "text-red-500" : "text-slate-400"
      )}>
        {isListening ? "正在聆听，点击停止…" : "点击开始语音输入"}
      </p>

      {/* Live transcript preview */}
      {isListening && transcript && (
        <div className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 leading-relaxed min-h-[48px]">
          <span className="text-slate-500 text-xs mr-1.5">识别中：</span>
          {transcript}
          <span className="inline-block w-0.5 h-4 bg-[#384877] ml-0.5 animate-pulse align-middle" />
        </div>
      )}
    </div>
  );
}