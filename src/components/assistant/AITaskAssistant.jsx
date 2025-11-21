import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, 
  Mic, 
  MicOff, 
  Send, 
  Volume2, 
  VolumeX,
  Sparkles,
  Loader2,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export default function AITaskAssistant({ isOpen, onClose }) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthRef = useRef(null);

  useEffect(() => {
    if (isOpen && !conversationId) {
      initConversation();
    }
  }, [isOpen]);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        setIsRecording(false);
      };

      recognition.onerror = () => {
        setIsRecording(false);
        toast.error("语音识别失败");
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!conversationId) return;

    const unsubscribe = base44.agents.subscribeToConversation(conversationId, (data) => {
      setMessages(data.messages || []);
    });

    return () => unsubscribe();
  }, [conversationId]);

  const initConversation = async () => {
    try {
      const conversation = await base44.agents.createConversation({
        agent_name: "task_assistant",
        metadata: {
          name: "任务检查对话",
          type: "task_check"
        }
      });
      setConversationId(conversation.id);

      // 发送初始问候
      setTimeout(() => {
        sendMessage("嗨！我来帮你检查一下今天的任务进度吧 👋");
      }, 500);
    } catch (error) {
      console.error("Failed to create conversation:", error);
      toast.error("初始化对话失败");
    }
  };

  const sendMessage = async (text) => {
    if (!conversationId || !text.trim()) return;

    setIsLoading(true);
    try {
      const conversation = await base44.agents.getConversation(conversationId);
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: text
      });
      setInputText("");

      // 等待AI响应
      setTimeout(async () => {
        const updatedConversation = await base44.agents.getConversation(conversationId);
        const lastMessage = updatedConversation.messages[updatedConversation.messages.length - 1];
        
        if (lastMessage.role === "assistant" && voiceEnabled) {
          speakText(lastMessage.content);
        }
        setIsLoading(false);
      }, 1000);
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("发送消息失败");
      setIsLoading(false);
    }
  };

  const speakText = (text) => {
    if (!synthRef.current || !text) return;

    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    utterance.pitch = 1.1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  };

  const toggleVoice = () => {
    setVoiceEnabled(!voiceEnabled);
    if (isSpeaking) {
      synthRef.current?.cancel();
      setIsSpeaking(false);
    }
  };

  const startVoiceInput = () => {
    if (!recognitionRef.current) {
      toast.error("您的浏览器不支持语音识别");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
      toast.success("🎤 开始录音");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)]"
    >
      <Card className="shadow-2xl border-2 border-purple-200 bg-white overflow-hidden">
        {/* 头部 */}
        <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar className="h-10 w-10 bg-white">
                  <div className="h-full w-full flex items-center justify-center">
                    <Bot className="w-6 h-6 text-purple-600" />
                  </div>
                </Avatar>
                <motion.div
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  小助
                  <Sparkles className="w-4 h-4" />
                </h3>
                <p className="text-xs opacity-90">您的智能任务管家</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleVoice}
                className="h-8 w-8 text-white hover:bg-white/20"
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                className="h-8 w-8 text-white hover:bg-white/20"
              >
                ✕
              </Button>
            </div>
          </div>
        </div>

        {/* 消息区域 */}
        <div className="h-96 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-purple-50/30 to-blue-50/30">
          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => (
              <MessageBubble
                key={index}
                message={message}
                isSpeaking={isSpeaking && index === messages.length - 1}
              />
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-sm text-purple-600"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>小助正在思考...</span>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div className="border-t border-purple-100 p-4 bg-white">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="告诉小助你的想法..."
              className="flex-1 border-purple-200 focus-visible:ring-purple-500"
              disabled={isLoading}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={startVoiceInput}
              disabled={isLoading}
              className={`border-purple-200 ${isRecording ? 'bg-red-50 border-red-300' : 'hover:bg-purple-50'}`}
            >
              {isRecording ? <MicOff className="w-4 h-4 text-red-600" /> : <Mic className="w-4 h-4 text-purple-600" />}
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={!inputText.trim() || isLoading}
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </Card>
    </motion.div>
  );
}

function MessageBubble({ message, isSpeaking }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <Avatar className="h-8 w-8 bg-gradient-to-br from-purple-500 to-blue-500 flex-shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </Avatar>
      )}

      <div className={`max-w-[75%] ${isUser ? "order-first" : ""}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 ${
            isUser
              ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white"
              : "bg-white border-2 border-purple-200 text-slate-800"
          }`}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed">{message.content}</p>
          ) : (
            <div className="relative">
              <ReactMarkdown className="text-sm prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                {message.content}
              </ReactMarkdown>
              {isSpeaking && (
                <motion.div
                  className="absolute -right-2 -top-2"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <Volume2 className="w-4 h-4 text-purple-600" />
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* 工具调用显示 */}
        {message.tool_calls?.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.tool_calls.map((tool, idx) => (
              <ToolCallDisplay key={idx} toolCall={tool} />
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <Avatar className="h-8 w-8 bg-slate-200 flex-shrink-0">
          <div className="h-full w-full flex items-center justify-center text-slate-600 text-sm font-semibold">
            我
          </div>
        </Avatar>
      )}
    </motion.div>
  );
}

function ToolCallDisplay({ toolCall }) {
  const getIcon = () => {
    if (toolCall.name.includes("Task")) {
      if (toolCall.name.includes("create")) return <CheckCircle2 className="w-3 h-3" />;
      if (toolCall.name.includes("update")) return <Clock className="w-3 h-3" />;
      if (toolCall.name.includes("read")) return <Calendar className="w-3 h-3" />;
    }
    return <AlertCircle className="w-3 h-3" />;
  };

  const getLabel = () => {
    if (toolCall.name.includes("create")) return "创建任务";
    if (toolCall.name.includes("update")) return "更新任务";
    if (toolCall.name.includes("read")) return "查询任务";
    if (toolCall.name.includes("delete")) return "删除任务";
    return "执行操作";
  };

  return (
    <Badge
      variant="outline"
      className="text-xs bg-purple-50 text-purple-700 border-purple-300 gap-1"
    >
      {getIcon()}
      {getLabel()}
    </Badge>
  );
}