import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Mic, 
  MicOff, 
  Loader2, 
  Sparkles, 
  Volume2, 
  CheckCircle2,
  AlertCircle,
  Wand2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function VoiceTaskInput({ onTasksGenerated }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsedTasks, setParsedTasks] = useState([]);
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);
  const [browserSupported, setBrowserSupported] = useState(true);

  useEffect(() => {
    // 检查浏览器是否支持语音识别
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setBrowserSupported(false);
      return;
    }

    // 初始化语音识别
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN'; // 中文识别
    recognition.continuous = true; // 持续识别
    recognition.interimResults = true; // 显示临时结果

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      setTranscript(prev => prev + finalTranscript || interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError("请允许麦克风权限");
        toast.error("请允许麦克风权限");
      } else if (event.error === 'no-speech') {
        setError("未检测到语音，请重试");
      } else {
        setError("语音识别出错：" + event.error);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      if (isRecording) {
        // 如果还在录音状态，自动重启（因为continuous可能自动停止）
        recognition.start();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isRecording]);

  const startRecording = () => {
    setError("");
    setTranscript("");
    setParsedTasks([]);
    setIsRecording(true);
    
    try {
      recognitionRef.current?.start();
      toast.success("开始录音，请说出您的任务");
    } catch (err) {
      console.error("Start recording error:", err);
      setError("启动录音失败");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    recognitionRef.current?.stop();
    
    if (transcript.trim()) {
      parseTranscript();
    } else {
      toast.error("未检测到语音内容");
    }
  };

  const parseTranscript = async () => {
    if (!transcript.trim()) {
      toast.error("没有可解析的语音内容");
      return;
    }

    setIsProcessing(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个任务拆解专家。请从以下语音识别的文本中提取任务信息，并识别大任务与子任务的层级关系。

语音内容：
${transcript}

请分析文本并提取以下信息：
1. 识别主要任务（大任务）和子任务（小任务）的关系
   - 例如："准备晚餐"是主任务，"购买食材"、"炒菜"、"做汤"是子任务
   - 例如："完成项目报告"是主任务，"收集数据"、"分析数据"、"撰写报告"是子任务
2. 为每个任务提取：标题、描述、提醒时间、优先级、类别
3. 子任务的提醒时间应该早于或等于父任务的提醒时间
4. 如果文本中没有明确的层级关系，但任务可以拆解，请智能拆解
5. 为子任务添加序号标识（如：步骤1、步骤2等）

提醒时间规则：
- 如果提到具体时间，转换为ISO格式
- 相对时间（如"明天"、"下周"）计算具体日期
- 没有明确时间时，使用当前时间的第二天上午9点
- 子任务时间应该合理分布在父任务之前

优先级判断：
- urgent: 非常紧急，需要立即处理
- high: 重要且紧急
- medium: 正常优先级
- low: 不紧急

类别判断：
- work: 工作相关
- personal: 个人事务
- health: 健康相关
- study: 学习相关
- family: 家庭相关
- shopping: 购物相关
- finance: 财务相关
- other: 其他

当前时间：${new Date().toISOString()}`,
        response_json_schema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  reminder_time: { type: "string" },
                  priority: { 
                    type: "string",
                    enum: ["low", "medium", "high", "urgent"]
                  },
                  category: { 
                    type: "string",
                    enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"]
                  },
                  subtasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        reminder_time: { type: "string" },
                        priority: { 
                          type: "string",
                          enum: ["low", "medium", "high", "urgent"]
                        },
                        order: { type: "number", description: "子任务的顺序序号" }
                      },
                      required: ["title", "reminder_time"]
                    }
                  }
                },
                required: ["title", "reminder_time"]
              }
            }
          },
          required: ["tasks"]
        }
      });

      if (response.tasks && response.tasks.length > 0) {
        setParsedTasks(response.tasks);
        const totalSubtasks = response.tasks.reduce((sum, task) => 
          sum + (task.subtasks?.length || 0), 0
        );
        toast.success(`✨ 成功识别 ${response.tasks.length} 个任务${totalSubtasks > 0 ? `和 ${totalSubtasks} 个子任务` : ''}！`);
      } else {
        toast.error("未能从语音中提取到任务信息");
      }
    } catch (error) {
      console.error("Parse error:", error);
      toast.error("解析任务失败，请重试");
      setError("解析失败");
    }
    setIsProcessing(false);
  };

  const handleCreateTasks = () => {
    if (parsedTasks.length === 0) return;
    onTasksGenerated(parsedTasks);
    setParsedTasks([]);
    setTranscript("");
  };

  const handleRetry = () => {
    setParsedTasks([]);
    setTranscript("");
    setError("");
  };

  if (!browserSupported) {
    return (
      <Card className="border-0 shadow-xl bg-gradient-to-br from-slate-100 to-slate-200">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-slate-600">
            <AlertCircle className="w-5 h-5" />
            <div>
              <p className="font-semibold">浏览器不支持语音识别</p>
              <p className="text-sm">请使用 Chrome、Edge 或 Safari 浏览器</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 to-pink-50 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Volume2 className="w-5 h-5 text-purple-600" />
          语音创建任务
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          按住按钮说话，AI 将自动识别并创建任务
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 录音按钮 */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`relative h-24 w-24 rounded-full transition-all duration-300 ${
              isRecording
                ? 'bg-gradient-to-r from-red-500 to-pink-600 hover:shadow-2xl hover:shadow-red-500/50 scale-110'
                : 'bg-gradient-to-r from-purple-500 to-pink-600 hover:shadow-xl hover:shadow-purple-500/30'
            }`}
          >
            <AnimatePresence mode="wait">
              {isRecording ? (
                <motion.div
                  key="recording"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <MicOff className="w-10 h-10" />
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ scale: 0, rotate: 180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: -180 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Mic className="w-10 h-10" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* 录音动画波纹 */}
            {isRecording && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full bg-red-500"
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.5, 0, 0.5],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full bg-red-500"
                  animate={{
                    scale: [1, 1.8, 1],
                    opacity: [0.3, 0, 0.3],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.5,
                  }}
                />
              </>
            )}
          </Button>
        </div>

        {/* 状态提示 */}
        <div className="text-center">
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Badge className="bg-red-500 text-white">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-white mr-2"
                />
                正在录音...
              </Badge>
            </motion.div>
          )}
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Badge className="bg-purple-500 text-white">
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                AI 解析中...
              </Badge>
            </motion.div>
          )}
          {!isRecording && !isProcessing && transcript && (
            <Badge className="bg-green-500 text-white">
              <CheckCircle2 className="w-3 h-3 mr-2" />
              识别完成
            </Badge>
          )}
        </div>

        {/* 语音识别文本 */}
        <AnimatePresence>
          {transcript && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border-2 border-purple-200"
            >
              <div className="flex items-start gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0 mt-1" />
                <p className="text-sm font-semibold text-purple-800">识别内容</p>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">
                {transcript}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 解析结果 */}
        <AnimatePresence>
          {parsedTasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-slate-800">
                    识别到 {parsedTasks.length} 个任务
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {parsedTasks.map((task, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white rounded-lg p-3 border border-purple-200"
                  >
                    <p className="font-semibold text-slate-800 text-sm mb-1">
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-slate-600 mb-2">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-xs">
                        {task.category}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {task.priority}
                      </Badge>
                      {task.subtasks && task.subtasks.length > 0 && (
                        <Badge className="bg-purple-500 text-white text-xs">
                          {task.subtasks.length} 个子任务
                        </Badge>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleCreateTasks}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-lg rounded-xl"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  创建全部任务
                </Button>
                <Button
                  onClick={handleRetry}
                  variant="outline"
                  className="rounded-xl"
                >
                  重新识别
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-50 border border-red-200 rounded-xl p-3"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 使用提示 */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-3">
          <div className="flex gap-3">
            <Wand2 className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-purple-800 mb-1">使用提示</p>
              <ul className="text-xs text-purple-700 space-y-0.5">
                <li>• 点击麦克风开始录音，说出任务内容</li>
                <li>• 支持自然语言，如"明天下午3点开会"</li>
                <li>• AI 会自动拆解复杂任务为多个子任务</li>
                <li>• 再次点击麦克风结束录音并开始解析</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}