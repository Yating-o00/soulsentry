import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

      // 触发AI主动分析
      setTimeout(() => {
        triggerSmartAnalysis(conversation.id);
      }, 800);
    } catch (error) {
      console.error("Failed to create conversation:", error);
      toast.error("初始化对话失败");
    }
  };

  const triggerSmartAnalysis = async (convId) => {
    if (!convId) return;
    
    setIsLoading(true);
    try {
      const conversation = await base44.agents.getConversation(convId);
      
      const analysisPrompt = `你好！请主动帮我分析当前任务状况：

1. 查看我今天和近期（3天内）的待办任务
2. 分析我的历史完成模式（查询UserBehavior数据）
3. 识别哪些任务需要优先处理，并说明理由
4. 基于截止时间、任务类型、我的习惯等因素提供智能优先级建议
5. 用友好亲切的方式询问我目前的状态和需要的帮助

请像朋友一样关心我，直接展示分析结果和建议，不要只是打招呼。`;

      await base44.agents.addMessage(conversation, {
        role: "user",
        content: analysisPrompt
      });
    } catch (error) {
      console.error("Smart analysis failed:", error);
      setIsLoading(false);
      toast.error("分析失败，请重试");
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
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed bottom-20 right-6 z-50 w-80 max-w-[calc(100vw-3rem)]"
    >
      <Card className="shadow-2xl border border-purple-200 bg-white overflow-hidden">
        {/* 头部 - 精简版 */}
        <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-3 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-white flex items-center justify-center">
                <Bot className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  小助
                  <Sparkles className="w-3 h-3" />
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleVoice}
                className="h-7 w-7 text-white hover:bg-white/20"
              >
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                className="h-7 w-7 text-white hover:bg-white/20"
              >
                <span className="text-sm">✕</span>
              </Button>
            </div>
          </div>
        </div>

        {/* 消息区域 - 缩小版 */}
        <div className="h-64 overflow-y-auto p-3 space-y-3 bg-gradient-to-b from-purple-50/30 to-blue-50/30">
          {messages.length === 0 && isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mb-3 relative">
                <Sparkles className="w-6 h-6 text-purple-600" />
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-purple-400"
                  animate={{
                    scale: [1, 1.3],
                    opacity: [0.6, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                  }}
                />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1.5">
                小助正在分析中
              </h3>
              <p className="text-xs text-slate-600 mb-3">
                正在查看你的任务和习惯...
              </p>
              <div className="text-[10px] text-slate-500 space-y-0.5">
                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  ✓ 检查待办任务
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  ✓ 分析完成模式
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  ✓ 准备智能建议
                </motion.p>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="popLayout">
            {messages
              .filter(msg => !msg.content.includes("请主动帮我分析当前任务状况"))
              .map((message, index) => (
                <MessageBubble
                  key={index}
                  message={message}
                  isSpeaking={isSpeaking && index === messages.length - 1}
                />
              ))}
          </AnimatePresence>

          {messages.length > 0 && isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-xs text-purple-600"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>思考中...</span>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 - 精简版 */}
        <div className="border-t border-purple-100 p-2.5 bg-white">
          <form onSubmit={handleSubmit} className="flex gap-1.5">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="说说你的想法..."
              className="flex-1 text-sm h-9 border-purple-200 focus-visible:ring-purple-500"
              disabled={isLoading}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={startVoiceInput}
              disabled={isLoading}
              className={`h-9 w-9 border-purple-200 ${isRecording ? 'bg-red-50 border-red-300' : 'hover:bg-purple-50'}`}
            >
              {isRecording ? <MicOff className="w-3.5 h-3.5 text-red-600" /> : <Mic className="w-3.5 h-3.5 text-purple-600" />}
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={!inputText.trim() || isLoading}
              className="h-9 w-9 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
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
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex-shrink-0 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? "order-first" : ""}`}>
        <div
          className={`rounded-xl px-3 py-2 ${
            isUser
              ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white"
              : "bg-white border border-purple-200 text-slate-800"
          }`}
        >
          {isUser ? (
            <p className="text-xs leading-relaxed">{message.content}</p>
          ) : (
            <div className="relative">
              <ReactMarkdown className="text-xs prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                {message.content}
              </ReactMarkdown>
              {isSpeaking && (
                <motion.div
                  className="absolute -right-1.5 -top-1.5"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <Volume2 className="w-3 h-3 text-purple-600" />
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* 工具调用显示 */}
        {message.tool_calls?.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {message.tool_calls.map((tool, idx) => (
              <ToolCallDisplay key={idx} toolCall={tool} />
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="h-6 w-6 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-slate-600 text-[10px] font-semibold">
          我
        </div>
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
      className="text-[10px] bg-purple-50 text-purple-700 border-purple-300 gap-0.5 px-1.5 py-0.5"
    >
      {getIcon()}
      {getLabel()}
    </Badge>
  );
}