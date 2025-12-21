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
     const queryClient = useQueryClient();
     const processedToolCallIds = useRef(new Set());

     const { data: user } = useQuery({
       queryKey: ['currentUser'],
       queryFn: () => base44.auth.me(),
     });

     const assistantName = `SoulSentry-${user?.assistant_name || "小雅"}`;

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
         const newMessages = data.messages || [];
         setMessages(newMessages);

         // Check for completed tool calls to invalidate queries
         newMessages.forEach(msg => {
             if (msg.role === 'assistant' && msg.tool_calls) {
                 msg.tool_calls.forEach(tc => {
                     // If tool call is successful (or has results) and not processed yet
                     if ((tc.status === 'success' || tc.results) && !processedToolCallIds.current.has(tc.id)) {
                         processedToolCallIds.current.add(tc.id);
                         // Invalidate relevant queries based on entity
                         if (tc.name.includes('Task')) {
                             queryClient.invalidateQueries({ queryKey: ['tasks'] });
                             queryClient.invalidateQueries({ queryKey: ['subtasks'] });
                             queryClient.invalidateQueries({ queryKey: ['task'] });
                         }
                         if (tc.name.includes('HealthLog')) {
                             queryClient.invalidateQueries({ queryKey: ['healthLogs'] });
                         }
                         if (tc.name.includes('UserBehavior')) {
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
             if (voiceEnabled && !isSpeaking && lastMsg.content) {
                 // 简单的去重播报逻辑，实际项目中可能需要更复杂的ID比对
                 speakText(lastMsg.content);
             }
         }
       });
   
       return () => unsubscribe();
     }, [conversationId, voiceEnabled]);
   
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
       if (!convId) return;
       
       setIsLoading(true);
       try {
         const conversation = await base44.agents.getConversation(convId);
         
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
       if (!conversationId || !text.trim()) return;
   
       setIsLoading(true);
       try {
         const conversation = await base44.agents.getConversation(conversationId);
         await base44.agents.addMessage(conversation, {
           role: "user",
           content: text
         });
         setInputText("");
         // 不再使用 setTimeout，完全依赖 subscribeToConversation 更新状态
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
                     <Volume2 className="w-3 h-3 text-[#5a647d]" />
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
       if (toolCall.name.includes("create")) return <CheckCircle2 className="w-3 h-3" />;
       if (toolCall.name.includes("update")) return <Clock className="w-3 h-3" />;
       if (toolCall.name.includes("read") || toolCall.name.includes("list")) return <Calendar className="w-3 h-3" />;
       if (toolCall.name.includes("delete")) return <AlertCircle className="w-3 h-3" />;
       return <AlertCircle className="w-3 h-3" />;
     };

     const getLabel = () => {
       const isTask = toolCall.name.includes("Task");
       const suffix = isTask ? "约定" : "数据";

       if (toolCall.name.includes("create")) return `创建${suffix}`;
       if (toolCall.name.includes("update")) return `更新${suffix}`;
       if (toolCall.name.includes("read") || toolCall.name.includes("list")) return `查询${suffix}`;
       if (toolCall.name.includes("delete")) return `删除${suffix}`;
       return "执行操作";
     };

     const renderResults = () => {
       if (!toolCall.results) return null;
       if (!toolCall.name.includes("Task")) return null;

       try {
         const data = typeof toolCall.results === 'string' ? JSON.parse(toolCall.results) : toolCall.results;
         if (!data) return null;

         // Handle array of tasks (list/filter)
         if (Array.isArray(data)) {
            if (data.length === 0) return <div className="text-[10px] text-slate-400 pl-1">未找到相关约定</div>;
            return (
              <div className="flex flex-col gap-2 mt-2 w-full">
                {data.slice(0, 3).map(task => <MiniTaskCard key={task.id} task={task} />)}
                {data.length > 3 && (
                  <div className="text-[10px] text-center text-slate-400 bg-slate-50 py-1 rounded-lg">
                    还有 {data.length - 3} 个约定...
                  </div>
                )}
              </div>
            );
         }

         // Handle single task (create/update/get)
         if (typeof data === 'object' && data.id) {
            return (
              <div className="mt-2 w-full">
                <MiniTaskCard task={data} isHighlight={toolCall.name.includes("create")} />
              </div>
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

   function MiniTaskCard({ task, isHighlight }) {
      const isCompleted = task.status === 'completed';
      const priorityColor = {
        low: "bg-slate-200",
        medium: "bg-blue-200",
        high: "bg-orange-200",
        urgent: "bg-red-400"
      }[task.priority] || "bg-slate-200";

      return (
        <div className={`
           flex items-start gap-2 p-2.5 rounded-xl border w-full text-left transition-all
           ${isHighlight ? 'bg-[#f0f9ff] border-blue-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'}
           ${isCompleted ? 'opacity-60 grayscale-[0.5]' : ''}
        `}>
            {/* Status Indicator */}
            <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${isCompleted ? 'bg-green-400' : priorityColor}`} />

            <div className="flex-1 min-w-0">
               <div className="flex items-center justify-between gap-2">
                  <h4 className={`text-xs font-medium truncate ${isCompleted ? 'line-through text-slate-500' : 'text-slate-700'}`}>
                    {task.title}
                  </h4>
                  {task.priority === 'urgent' && !isCompleted && (
                    <span className="text-[9px] px-1 py-0.5 bg-red-50 text-red-500 rounded flex-shrink-0">紧急</span>
                  )}
               </div>

               <div className="flex items-center gap-2 mt-1">
                  {task.reminder_time && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                       <Clock className="w-2.5 h-2.5" />
                       <span>{format(new Date(task.reminder_time), "MM-dd HH:mm", { locale: zhCN })}</span>
                    </div>
                  )}
                  {task.category && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded border border-slate-100">
                      {task.category}
                    </span>
                  )}
               </div>
            </div>
        </div>
      );
   }