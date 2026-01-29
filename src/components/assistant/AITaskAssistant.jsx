import React, { useState, useEffect, useRef } from "react";
   import { base44 } from "@/api/base44Client";
   import { useQuery, useQueryClient } from "@tanstack/react-query";
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
     Clock,
     ChevronRight,
     Target,
     TrendingUp,
     BarChart3,
     Circle,
     Zap
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
     const [showSummary, setShowSummary] = useState(false);
     const [discussedTasks, setDiscussedTasks] = useState([]);
     const messagesEndRef = useRef(null);
     const recognitionRef = useRef(null);
     const synthRef = useRef(null);
     const queryClient = useQueryClient();
     const processedToolCallIds = useRef(new Set());
     const voiceEnabledRef = useRef(voiceEnabled);

     useEffect(() => {
       voiceEnabledRef.current = voiceEnabled;
     }, [voiceEnabled]);

     const { data: user } = useQuery({
       queryKey: ['currentUser'],
       queryFn: () => base44.auth.me(),
     });

     const assistantName = (() => {
       if (!user?.assistant_name || typeof user.assistant_name !== 'string') return "SoulSentry-小雅";
       const trimmed = user.assistant_name.trim();
       if (!trimmed) return "SoulSentry-小雅";
       const parts = (trimmed.includes(' ') ? trimmed.split(' ') : [trimmed]).filter(Boolean);
       return `SoulSentry-${(parts && parts.length > 0 && parts[0]) ? parts[0] : '小雅'}`;
     })();

     useEffect(() => {
       if (isOpen && !conversationId) {
         // 立即显示加载状态
         setIsLoading(true);
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

       let unsubscribe;
       try {
         unsubscribe = base44.agents.subscribeToConversation(conversationId, (data) => {
           const newMessages = data.messages || [];
           setMessages(newMessages);

         // Track discussed tasks for summary
             const tasksInConversation = [];
             newMessages.forEach(msg => {
                 if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
                     msg.tool_calls.forEach(tc => {
                         if (tc?.name?.includes('Task') && tc.results) {
                             try {
                                 let taskData = typeof tc.results === 'string' ? JSON.parse(tc.results) : tc.results;
                                 if (Array.isArray(taskData)) {
                                     taskData.forEach(task => {
                                         if (task?.id && !tasksInConversation.find(t => t.id === task.id)) {
                                             tasksInConversation.push(task);
                                         }
                                     });
                                 } else if (taskData && taskData.id) {
                                     if (!tasksInConversation.find(t => t.id === taskData.id)) {
                                         tasksInConversation.push(taskData);
                                     }
                                 }
                             } catch (e) {
                                 console.error('Failed to parse task data', e);
                             }
                         }
                     });
                 }
             });
             setDiscussedTasks(tasksInConversation);

             // Check for completed tool calls to invalidate queries
             newMessages.forEach(msg => {
                 if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
                     msg.tool_calls.forEach(tc => {
                         // If tool call is successful (or has results) and not processed yet
                         if (tc && (tc.status === 'success' || tc.results) && tc.id && !processedToolCallIds.current.has(tc.id)) {
                             processedToolCallIds.current.add(tc.id);
                             // Invalidate relevant queries based on entity
                             const toolName = tc.name || '';
                             if (toolName.includes('Task')) {
                                 queryClient.invalidateQueries({ queryKey: ['tasks'] });
                                 queryClient.invalidateQueries({ queryKey: ['subtasks'] });
                                 queryClient.invalidateQueries({ queryKey: ['task'] });
                             }
                             if (toolName.includes('HealthLog')) {
                                 queryClient.invalidateQueries({ queryKey: ['healthLogs'] });
                             }
                             if (toolName.includes('UserBehavior')) {
                                 queryClient.invalidateQueries({ queryKey: ['recentBehaviors'] });
                             }
                         }
                     });
                 }
             });

         // 智能判断加载状态：如果收到最新的助手消息，且该消息不是空的（正在生成中），则停止加载
         const lastMsg = newMessages[newMessages.length - 1];
         if (lastMsg && lastMsg.role === 'assistant') {
             setIsLoading(false);

             // 自动语音播报（如果是新消息）
             if (voiceEnabledRef.current && !isSpeaking && lastMsg.content) {
                 // 简单的去重播报逻辑，实际项目中可能需要更复杂的ID比对
                 speakText(lastMsg.content);
             }
         }
         });
         } catch (e) {
         console.error("Subscribe error:", e);
         }

         return () => {
         if (unsubscribe && typeof unsubscribe === 'function') {
           try {
             unsubscribe();
           } catch (e) {
             // Ignore websocket closing errors on unmount
             console.warn("Unsubscribe error:", e);
           }
         }
         };
         }, [conversationId]); // Removed voiceEnabled dependency to prevent websocket reconnection loops
   
     const initConversation = async () => {
       try {
         const conversation = await base44.agents.createConversation({
           agent_name: "task_assistant",
           metadata: {
             name: "约定检查对话",
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
       if (!convId) {
           console.error("No conversation ID provided for analysis");
           return;
       }

       // 立即显示加载动画
       setIsLoading(true);
       setMessages([{ 
         role: "assistant", 
         content: "正在分析您的约定..." 
       }]);

       try {
         const conversation = await base44.agents.getConversation(convId);
         if (!conversation || !conversation.id) {
            throw new Error("Invalid conversation object");
         }

         const analysisPrompt = `请启动后台推理程序，调用工具读取我的所有约定数据（以及HealthLog数据），并严格按照【建设】、【执行】、【检查】的第一性原理模型进行深度分析。

            要求：
            1. **必须先调用工具**获取最新约定列表和健康数据。
            2. **任务整理原则（重中之重）**：
               - **优先关注主任务**：首先梳理主任务的状态和优先级。
               - **查看子任务**：针对每个主任务，深入检查其子任务的完成情况和跟进状态，明确瓶颈所在。
               - **突出重点**：将重心放在未完成的关键主任务及其卡点的子任务上。
            3. **直击核心**：
               - 【建设】(Construction)：检查是否有模糊的大目标（主任务）需要拆解？是否有信息残缺的约定？
               - 【执行】(Execution)：基于截止时间，指出当前最该做的一件事。如果有关联的健康数据（如运动打卡），请一并展示。
               - 【检查】(Check)：列出过期约定。如果用户近期表现良好（约定完成度高），给予鼓励；如果偷懒（约定堆积），用“温柔的背后顶梁柱”语气给予提醒和陪伴（如“我陪你...”）。
            4. **零废话**：不要打招呼，直接输出分析结果。保持极简风格，用Markdown列表展示。语气要温暖且坚定。`;
   
         await base44.agents.addMessage(conversation, {
           role: "user",
           content: analysisPrompt
         });
         // 请求发送成功，保持 isLoading 为 true，等待订阅更新来关闭它
       } catch (error) {
         console.error("Smart analysis failed:", error);
         setIsLoading(false);
         toast.error("分析失败，请重试");
       }
     };
   
     const sendMessage = async (text) => {
       if (!conversationId) {
            console.error("No conversation ID available");
            return;
       }
       if (!text.trim()) return;

       // 立即显示用户消息，提供即时反馈
       const userMsg = { role: "user", content: text };
       setMessages(prev => [...prev, userMsg]);
       setInputText("");
       setIsLoading(true);

       try {
         const conversation = await base44.agents.getConversation(conversationId);
         if (!conversation || !conversation.id) {
            throw new Error("Invalid conversation object retrieved");
         }

         // 注入丰富的上下文信息，增强AI的理解能力
         const now = new Date();
         const contextInfo = `
     [Context Info]
     Current Time: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}
     Current Date: ${now.toISOString().split('T')[0]}
     Weekday: ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]}
     Language: zh-CN
     `;

         await base44.agents.addMessage(conversation, {
           role: "user",
           content: `${text}\n${contextInfo}` // 将上下文附加在消息后，AI可见但前端通过过滤或UI处理不显示这部分（Agent SDK返回的messages通常是处理后的，或者我们仅在发送时带上）
         });
         // 订阅会更新完整消息列表
       } catch (error) {
         console.error("Failed to send message:", error);
         toast.error("发送消息失败");
         setIsLoading(false);
         // 发送失败，移除刚添加的用户消息
         setMessages(prev => prev.filter(m => m !== userMsg));
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
         <Card className="shadow-2xl border border-[#222222] bg-white overflow-hidden">
           {/* 头部 - 精简版 */}
           <div className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] p-3 text-white">
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <div className="h-7 w-7 rounded-full bg-white flex items-center justify-center">
                   <Bot className="w-4 h-4 text-[#5a647d]" />
                 </div>
                 <div>
                   <h3 className="text-sm font-semibold flex items-center gap-1.5">
                     {assistantName}
                     <Sparkles className="w-3 h-3" />
                   </h3>
                 </div>
               </div>
               <div className="flex items-center gap-1">
                 {discussedTasks.length > 0 && (
                   <Button
                     size="icon"
                     variant="ghost"
                     onClick={() => setShowSummary(!showSummary)}
                     className="h-7 w-7 text-white hover:bg-white/20 relative"
                     title="对话摘要"
                   >
                     <BarChart3 className="w-3.5 h-3.5" />
                     <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-yellow-400 text-[8px] font-bold text-slate-800 rounded-full flex items-center justify-center">
                       {discussedTasks.length}
                     </span>
                   </Button>
                 )}
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
   
           {/* 对话摘要 */}
           <AnimatePresence>
             {showSummary && discussedTasks.length > 0 && (
               <ConversationSummary tasks={discussedTasks} onClose={() => setShowSummary(false)} />
             )}
           </AnimatePresence>

           {/* 消息区域 - 缩小版 */}
           <div className="h-64 overflow-y-auto p-3 space-y-3 bg-gradient-to-b from-[#f9fafb] to-white">
             {messages.length === 0 && isLoading && (
               <motion.div
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="flex flex-col items-center justify-center h-full text-center"
               >
                 <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#e5e9ef] to-[#dce3eb] flex items-center justify-center mb-3 relative">
                   <Sparkles className="w-6 h-6 text-[#5a647d]" />
                   <motion.div
                     className="absolute inset-0 rounded-full border-2 border-[#5a647d]"
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
                   {assistantName}正在分析中
                 </h3>
                 <p className="text-xs text-slate-600 mb-3">
                   正在查看你的约定和习惯...
                 </p>
                 <div className="text-[10px] text-slate-500 space-y-0.5">
                   <motion.p
                     initial={{ opacity: 0, x: -10 }}
                     animate={{ opacity: 1, x: 0 }}
                     transition={{ delay: 0.2 }}
                   >
                     ✓ 检查待办约定
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
                 .filter(msg => 
                   !msg.content.includes("请以“温柔的背后顶梁柱”的身份") && 
                   !msg.content.includes("请启动后台推理程序") &&
                   !msg.content.includes("调用工具读取我的所有约定数据")
                 )
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
                 className="flex items-center gap-2 text-xs text-[#5a647d]"
               >
                 <Loader2 className="w-3.5 h-3.5 animate-spin" />
                 <span>思考中...</span>
               </motion.div>
             )}
   
             <div ref={messagesEndRef} />
           </div>
   
           {/* 快捷建议芯片 */}
           {messages.length > 0 && !isLoading && (
             <div className="px-3 py-2 flex gap-2 overflow-x-auto scrollbar-hide bg-white/50 border-t border-slate-100">
               {[
                 { label: "📅 今日约定", text: "今天有哪些约定？" },
                 { label: "⚠️ 紧急事项", text: "列出紧急和过期的约定" },
                 { label: "🌟 核心事项", text: "请以列表形式列出我的核心事项（高优先级、紧急或重要的约定），重点关注主任务的完成情况" },
                 { label: "📊 进度分析", text: "分析当前约定状况并给出建议，请先关注主任务，再检查子任务" },
                 { label: "💡 解决痛点", text: "我感觉最近效率很低，事情做不完，帮我分析一下痛点并提供解决方案" },
               ].map((action) => (
                 <button
                   key={action.label}
                   onClick={() => sendMessage(action.text)}
                   className="flex-shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-[#f9fafb] text-[#d5495f] border border-[#e5e9ef] hover:bg-[#e0919e] hover:text-white transition-colors whitespace-nowrap"
                 >
                   {action.label}
                 </button>
               ))}
             </div>
           )}

           {/* 输入区域 - 精简版 */}
           <div className="border-t border-slate-100 p-2.5 bg-white">
             <form onSubmit={handleSubmit} className="flex gap-1.5">
               <Input
                 value={inputText}
                 onChange={(e) => setInputText(e.target.value)}
                 placeholder="输入约定（如：明天10点开会）或 询问进度..."
                 className="flex-1 text-sm h-9 border-[#dce4ed] focus-visible:ring-[#384877]"
                 disabled={isLoading}
               />
               <Button
                 type="button"
                 size="icon"
                 variant="outline"
                 onClick={startVoiceInput}
                 disabled={isLoading}
                 className={`h-9 w-9 border-slate-200 ${isRecording ? 'bg-[#384877]/10 border-[#384877]/20 text-[#384877] animate-pulse' : 'hover:bg-slate-50 text-[#384877]'}`}
               >
                 {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
               </Button>
               <Button
                 type="submit"
                 size="icon"
                 disabled={!inputText.trim() || isLoading}
                 className="h-9 w-9 bg-gradient-to-br from-[#3b5aa2] to-[#2c4480] hover:shadow-[#3b5aa2]/40 hover:scale-105 transition-all duration-300 rounded-xl shadow-lg shadow-[#3b5aa2]/25"
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

    // 清理可能存在的上下文信息，避免在UI中显示
    const cleanContent = message.content 
      ? message.content.replace(/\[Context Info\][\s\S]*$/, '').trim() 
      : '';

    if (!cleanContent && !message.tool_calls) return null;

    return (
       <motion.div
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         exit={{ opacity: 0, y: -10 }}
         className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
       >
         {!isUser && (
           <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex-shrink-0 flex items-center justify-center">
             <Bot className="w-3.5 h-3.5 text-white" />
           </div>
         )}
   
         <div className={`max-w-[80%] ${isUser ? "order-first" : ""}`}>
           <div
            className={`rounded-xl px-3 py-2 ${
              isUser
                ? "bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white"
                : "bg-white border border-[#e5e9ef] text-[#222222]"
            }`}
           >
            {isUser ? (
              <p className="text-xs leading-relaxed">{cleanContent}</p>
            ) : (
              <div className="relative">
                <ReactMarkdown className="text-xs prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                  {cleanContent}
                </ReactMarkdown>
                 {isSpeaking && (
                   <motion.div
                     className="absolute -right-1.5 -top-1.5"
                     animate={{ scale: [1, 1.2, 1] }}
                     transition={{ duration: 0.5, repeat: Infinity }}
                   >
                     <Volume2 className="w-3 h-3 text-[#5a647d]" />
                   </motion.div>
                 )}
               </div>
             )}
           </div>
   
           {/* 工具调用显示 */}
           {Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && (
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
     if (!toolCall || !toolCall.name) return null;

     const toolName = toolCall.name || "";

     const getIcon = () => {
       if (toolName.includes("create")) return <CheckCircle2 className="w-3 h-3" />;
       if (toolName.includes("update")) return <Clock className="w-3 h-3" />;
       if (toolName.includes("read") || toolName.includes("list")) return <Calendar className="w-3 h-3" />;
       if (toolName.includes("delete")) return <AlertCircle className="w-3 h-3" />;
       return <AlertCircle className="w-3 h-3" />;
     };

     const getLabel = () => {
       const isTask = toolName.includes("Task");
       const suffix = isTask ? "约定" : "数据";

       if (toolName.includes("create")) return `创建${suffix}`;
       if (toolName.includes("update")) return `更新${suffix}`;
       if (toolName.includes("read") || toolName.includes("list")) return `查询${suffix}`;
       if (toolName.includes("delete")) return `删除${suffix}`;
       return "执行操作";
     };

     const renderResults = () => {
       if (!toolCall.results) return null;
       // Only render tasks for now
       if (!toolName.includes("Task")) return null;

       try {
         // Handle potential stringified JSON
         let data = toolCall.results;
         if (typeof data === 'string') {
            try {
               data = JSON.parse(data);
            } catch (e) {
               // If parsing fails, it might be a plain string message or error
               return null; 
            }
         }

         if (!data) return null;

         // Handle array of tasks (list/filter)
         if (Array.isArray(data)) {
            if (data.length === 0) {
              return (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] text-slate-400 bg-slate-50 py-2 px-3 rounded-lg mt-2 text-center border border-slate-100"
                >
                  未找到相关约定
                </motion.div>
              );
            }

            return (
              <div className="mt-2 w-full">
                <TaskListSummary tasks={data} />
                <div className="flex flex-col gap-2 mt-2">
                  {data.slice(0, 4).map((task, idx) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <MiniTaskCard task={task} />
                    </motion.div>
                  ))}
                  {data.length > 4 && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[10px] text-center text-slate-500 bg-gradient-to-r from-slate-50 via-white to-slate-50 py-1.5 rounded-lg border border-dashed border-slate-200"
                    >
                      还有 {data.length - 4} 个约定...
                    </motion.div>
                  )}
                </div>
              </div>
            );
         }

         // Handle single task (create/update/get)
         if (typeof data === 'object' && data.id) {
            return (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-2 w-full"
              >
                <MiniTaskCard task={data} isHighlight={toolCall.name.includes("create")} />
              </motion.div>
            );
         }
       } catch (e) {
         console.error("Failed to parse tool results", e);
         return null;
       }
       return null;
     };

     return (
       <div className="flex flex-col items-start gap-1 w-full">
           <Badge
             variant="outline"
             className="text-[10px] bg-[#f9fafb] text-[#5a647d] border-[#dce4ed] gap-0.5 px-1.5 py-0.5"
           >
             {getIcon()}
             {getLabel()}
           </Badge>
           {renderResults()}
       </div>
     );
   }

   function TaskListSummary({ tasks }) {
     const completed = tasks.filter(t => t.status === 'completed').length;
     const pending = tasks.filter(t => t.status === 'pending').length;
     const overdue = tasks.filter(t => {
       const checkDate = t.end_time ? new Date(t.end_time) : new Date(t.reminder_time);
       return checkDate < new Date() && t.status !== 'completed';
     }).length;
     const urgent = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length;

     const completionRate = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

     return (
       <div className="bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] border border-slate-200/60 rounded-xl p-2.5 space-y-2">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-1.5">
             <BarChart3 className="w-3.5 h-3.5 text-[#384877]" />
             <span className="text-[11px] font-semibold text-slate-700">约定概览</span>
           </div>
           <span className="text-[10px] text-slate-500">共 {tasks.length} 项</span>
         </div>

         {/* Progress Bar */}
         <div className="space-y-1">
           <div className="flex justify-between text-[10px]">
             <span className="text-slate-600">完成率</span>
             <span className={`font-semibold ${completionRate >= 70 ? 'text-green-600' : completionRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
               {completionRate}%
             </span>
           </div>
           <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${completionRate}%` }}
               transition={{ duration: 0.8, ease: "easeOut" }}
               className={`h-full rounded-full ${
                 completionRate >= 70 ? 'bg-gradient-to-r from-green-400 to-green-500' :
                 completionRate >= 40 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                 'bg-gradient-to-r from-red-400 to-red-500'
               }`}
             />
           </div>
         </div>

         {/* Stats Grid */}
         <div className="grid grid-cols-4 gap-1.5">
           <div className="bg-white rounded-lg p-1.5 border border-slate-100 text-center">
             <div className="text-[10px] text-slate-500 mb-0.5">待办</div>
             <div className="text-sm font-bold text-[#384877]">{pending}</div>
           </div>
           <div className="bg-white rounded-lg p-1.5 border border-green-100 text-center">
             <div className="text-[10px] text-green-600 mb-0.5">完成</div>
             <div className="text-sm font-bold text-green-600">{completed}</div>
           </div>
           {overdue > 0 && (
             <div className="bg-red-50 rounded-lg p-1.5 border border-red-200 text-center">
               <div className="text-[10px] text-red-600 mb-0.5">过期</div>
               <div className="text-sm font-bold text-red-600">{overdue}</div>
             </div>
           )}
           {urgent > 0 && (
             <div className="bg-orange-50 rounded-lg p-1.5 border border-orange-200 text-center">
               <div className="text-[10px] text-orange-600 mb-0.5">紧急</div>
               <div className="text-sm font-bold text-orange-600">{urgent}</div>
             </div>
           )}
         </div>
       </div>
     );
   }

   function ConversationSummary({ tasks, onClose }) {
     const pending = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
     const completed = tasks.filter(t => t.status === 'completed').length;
     const urgent = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length;

     const priorityLabels = {
       low: "低",
       medium: "中", 
       high: "高",
       urgent: "紧急"
     };

     const statusLabels = {
       pending: "待办",
       in_progress: "进行中",
       completed: "已完成",
       cancelled: "已取消",
       snoozed: "已推迟",
       blocked: "阻塞中"
     };

     return (
       <motion.div
         initial={{ opacity: 0, y: -20 }}
         animate={{ opacity: 1, y: 0 }}
         exit={{ opacity: 0, y: -20 }}
         className="border-b border-slate-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-3 shadow-sm"
       >
         <div className="flex items-center justify-between mb-2">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-sm">
               <BarChart3 className="w-4 h-4 text-white" />
             </div>
             <div>
               <h3 className="text-xs font-bold text-slate-800">本次对话摘要</h3>
               <p className="text-[10px] text-slate-500">共讨论 {tasks.length} 个约定</p>
             </div>
           </div>
           <Button
             size="icon"
             variant="ghost"
             onClick={onClose}
             className="h-6 w-6 hover:bg-slate-100 rounded-lg"
           >
             <span className="text-xs">✕</span>
           </Button>
         </div>

         {/* Stats */}
         <div className="flex gap-2 mb-3">
           <div className="flex-1 bg-white rounded-lg p-2 border border-blue-100 text-center">
             <div className="text-[10px] text-slate-500 mb-0.5">待办</div>
             <div className="text-sm font-bold text-[#384877]">{pending}</div>
           </div>
           <div className="flex-1 bg-white rounded-lg p-2 border border-green-100 text-center">
             <div className="text-[10px] text-green-600 mb-0.5">完成</div>
             <div className="text-sm font-bold text-green-600">{completed}</div>
           </div>
           {urgent > 0 && (
             <div className="flex-1 bg-red-50 rounded-lg p-2 border border-red-200 text-center">
               <div className="text-[10px] text-red-600 mb-0.5">紧急</div>
               <div className="text-sm font-bold text-red-600">{urgent}</div>
             </div>
           )}
         </div>

         {/* Task List */}
         <div className="space-y-2 max-h-48 overflow-y-auto">
           {tasks.map((task, index) => {
             const isPast = (() => {
               const checkDate = task.end_time ? new Date(task.end_time) : new Date(task.reminder_time);
               return checkDate < new Date() && task.status !== 'completed';
             })();

             return (
               <motion.div
                 key={task.id}
                 initial={{ opacity: 0, x: -10 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: index * 0.05 }}
                 className="bg-white rounded-lg p-2 border border-slate-200 hover:border-slate-300 transition-all"
               >
                 <div className="flex items-start gap-2">
                   <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] font-bold text-slate-600 flex items-center justify-center">
                     {index + 1}
                   </span>
                   <div className="flex-1 min-w-0">
                     <h4 className={`text-xs font-semibold mb-1 ${task.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                       {task.title}
                     </h4>
                     <div className="flex flex-wrap gap-1.5 text-[10px]">
                       {task.reminder_time && (
                         <span className={`px-1.5 py-0.5 rounded ${isPast ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                           <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                           {format(new Date(task.reminder_time), "MM-dd HH:mm", { locale: zhCN })}
                         </span>
                       )}
                       <span className={`px-1.5 py-0.5 rounded font-medium ${
                         task.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                         task.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                         task.priority === 'medium' ? 'bg-blue-100 text-blue-600' :
                         'bg-slate-100 text-slate-600'
                       }`}>
                         优先级：{priorityLabels[task.priority] || task.priority}
                       </span>
                       <span className={`px-1.5 py-0.5 rounded font-medium ${
                         task.status === 'completed' ? 'bg-green-100 text-green-600' :
                         task.status === 'in_progress' ? 'bg-blue-100 text-blue-600' :
                         'bg-slate-100 text-slate-600'
                       }`}>
                         {statusLabels[task.status] || task.status}
                       </span>
                     </div>
                   </div>
                 </div>
               </motion.div>
             );
           })}
         </div>
       </motion.div>
     );
   }

   function MiniTaskCard({ task, isHighlight }) {
      const isCompleted = task.status === 'completed';
      const isPast = (() => {
        const checkDate = task.end_time ? new Date(task.end_time) : new Date(task.reminder_time);
        return checkDate < new Date() && !isCompleted;
      })();

      const priorityConfig = {
        low: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" },
        medium: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200", dot: "bg-blue-400" },
        high: { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200", dot: "bg-orange-400" },
        urgent: { bg: "bg-red-50", text: "text-red-600", border: "border-red-300", dot: "bg-red-500" }
      }[task.priority] || { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" };

      const categoryIcons = {
        work: "💼",
        personal: "👤",
        health: "❤️",
        study: "📚",
        family: "👨‍👩‍👧",
        shopping: "🛒",
        finance: "💰",
        other: "📌"
      };

      return (
        <div className={`
           group relative overflow-hidden rounded-xl border transition-all duration-200
           ${isHighlight ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300 shadow-md ring-2 ring-blue-200/50' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}
           ${isCompleted ? 'opacity-70' : ''}
           ${isPast ? 'border-l-4 border-l-red-500' : ''}
        `}>
            {/* Highlight indicator for new tasks */}
            {isHighlight && (
              <div className="absolute top-0 right-0">
                <div className="bg-gradient-to-bl from-blue-500 to-transparent w-12 h-12 opacity-20" />
                <Sparkles className="absolute top-1 right-1 w-3 h-3 text-blue-500" />
              </div>
            )}

            <div className="flex items-start gap-2.5 p-2.5">
               {/* Visual Status Indicator */}
               <div className="relative flex-shrink-0 mt-0.5">
                 {isCompleted ? (
                   <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center shadow-sm">
                     <CheckCircle2 className="w-3 h-3 text-white" />
                   </div>
                 ) : (
                   <div className={`w-5 h-5 rounded-full ${priorityConfig.bg} ${priorityConfig.border} border-2 flex items-center justify-center`}>
                     <div className={`w-2 h-2 rounded-full ${priorityConfig.dot}`} />
                   </div>
                 )}
                 {task.priority === 'urgent' && !isCompleted && (
                   <motion.div
                     animate={{ scale: [1, 1.2, 1] }}
                     transition={{ duration: 1.5, repeat: Infinity }}
                     className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full"
                   />
                 )}
               </div>

               <div className="flex-1 min-w-0">
                  {/* Title & Priority Badge */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                     <h4 className={`text-xs font-semibold leading-snug ${isCompleted ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                       {task.title}
                     </h4>
                     {!isCompleted && (
                       <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${priorityConfig.bg} ${priorityConfig.text} ${priorityConfig.border} border`}>
                         {task.priority === 'urgent' ? '🔥 紧急' : task.priority === 'high' ? '⚡ 高' : task.priority === 'medium' ? '📌 中' : '📋 低'}
                       </span>
                     )}
                  </div>

                  {/* Description snippet if available */}
                  {task.description && (
                    <p className="text-[10px] text-slate-500 mb-1.5 line-clamp-1">{task.description}</p>
                  )}

                  {/* Time & Category */}
                  <div className="flex items-center gap-2 flex-wrap">
                     {task.reminder_time && (
                       <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${isPast ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                          <Clock className="w-2.5 h-2.5" />
                          <span className="font-medium">{format(new Date(task.reminder_time), "MM-dd HH:mm", { locale: zhCN })}</span>
                       </div>
                     )}
                     {task.category && (
                       <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-gradient-to-r from-slate-50 to-slate-100 text-slate-600 rounded border border-slate-200">
                         <span>{categoryIcons[task.category] || '📌'}</span>
                         <span className="font-medium">{task.category}</span>
                       </div>
                     )}
                     {isCompleted && task.completed_at && (
                       <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                         <CheckCircle2 className="w-2.5 h-2.5" />
                         <span>{format(new Date(task.completed_at), "MM-dd 完成", { locale: zhCN })}</span>
                       </div>
                     )}
                  </div>

                  {/* Progress bar for tasks with subtasks */}
                  {task.progress !== undefined && task.progress > 0 && (
                    <div className="mt-2 space-y-0.5">
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>进度</span>
                        <span className="font-semibold">{task.progress}%</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
               </div>
            </div>

            {/* Hover indicator */}
            {!isHighlight && (
              <div className="absolute bottom-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="w-3 h-3 text-slate-400 mr-1 mb-1" />
              </div>
            )}
        </div>
      );
   }