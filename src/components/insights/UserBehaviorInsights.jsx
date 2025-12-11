import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Lightbulb, Loader2, RotateCcw, Target, Trophy, ArrowRight, BrainCircuit, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

export default function UserBehaviorInsights() {
  const [activeTab, setActiveTab] = useState("insights");
  const [insights, setInsights] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [summary, setSummary] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Fetch data
  const { data: behaviors = [] } = useQuery({
    queryKey: ['userBehaviors'],
    queryFn: () => base44.entities.UserBehavior.list({ sort: { created_date: -1 }, limit: 50 }),
    initialData: [],
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-insights'],
    queryFn: () => base44.entities.Task.list(),
    initialData: [],
  });

  const generateInsights = async () => {
    if (!behaviors.length) return;
    setIsAnalyzing(true);
    try {
      const behaviorSummary = behaviors.map(b => ({
        type: b.event_type,
        time: `${b.day_of_week} ${b.hour_of_day}:00`,
        category: b.category,
        metadata: b.metadata
      }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `分析用户最近的任务管理行为，识别频繁调整的模式（如反复推迟、修改日期、特定时间段效率低等）。提供3条改进建议。
        
        行为数据: ${JSON.stringify(behaviorSummary)}
        
        返回JSON: { "suggestions": [{ "title": "...", "content": "...", "type": "optimization"|"habit"|"praise" }] }`,
        response_json_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                  type: { type: "string", enum: ["optimization", "habit", "praise"] }
                }
              }
            }
          }
        }
      });
      if (result?.suggestions) setInsights(result.suggestions);
    } catch (e) { console.error(e); } finally { setIsAnalyzing(false); }
  };

  const generateRecommendation = async () => {
    const pendingTasks = tasks.filter(t => t.status === 'pending' && !t.deleted_at);
    if (!pendingTasks.length) {
        toast.info("目前没有待办任务");
        return;
    }
    setIsAnalyzing(true);
    try {
      const taskSummary = pendingTasks.map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        deadline: t.reminder_time,
        category: t.category
      }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `基于截止日期和优先级，从以下任务中推荐1个最适合现在开始的任务。
        考虑：紧急程度、重要性。
        
        任务列表: ${JSON.stringify(taskSummary)}
        当前时间: ${new Date().toISOString()}
        
        返回JSON: { "taskId": "...", "reason": "...", "tips": "..." }`,
        response_json_schema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            reason: { type: "string" },
            tips: { type: "string" }
          },
          required: ["taskId", "reason"]
        }
      });
      
      if (result) {
          const task = tasks.find(t => t.id === result.taskId);
          setRecommendation({ task, ...result });
      }
    } catch (e) { console.error(e); } finally { setIsAnalyzing(false); }
  };

  const generateSummary = async () => {
    const completedTasks = tasks.filter(t => t.status === 'completed' && !t.deleted_at);
    if (!completedTasks.length) {
        toast.info("还没有完成的任务");
        return;
    }
    setIsAnalyzing(true);
    try {
      const taskSummary = completedTasks.map(t => ({
        title: t.title,
        completed_at: t.completed_at,
        category: t.category
      }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `总结用户本周/本月的完成情况，生成简报。
        亮点：完成的重要任务、效率提升等。
        
        完成任务: ${JSON.stringify(taskSummary)}
        
        返回JSON: { "highlights": ["..."], "summary": "...", "quote": "..." }`,
        response_json_schema: {
          type: "object",
          properties: {
            highlights: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
            quote: { type: "string" }
          }
        }
      });
      if (result) setSummary(result);
    } catch (e) { console.error(e); } finally { setIsAnalyzing(false); }
  };

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50/50 to-purple-50/50 overflow-hidden h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
            <div className="p-2 bg-white rounded-lg shadow-sm">
                <BrainCircuit className="w-4 h-4 text-indigo-600" />
            </div>
            <CardTitle className="text-base font-semibold text-indigo-900">AI 智能教练</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-white/50 p-1 mb-4 h-auto rounded-xl">
                <TabsTrigger value="recommend" className="text-xs py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">下一步</TabsTrigger>
                <TabsTrigger value="insights" className="text-xs py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">行为分析</TabsTrigger>
                <TabsTrigger value="summary" className="text-xs py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">周报</TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
                <TabsContent value="recommend" className="mt-0 min-h-[200px]">
                    {!recommendation ? (
                        <div className="text-center py-8">
                            <Target className="w-10 h-10 mx-auto text-indigo-200 mb-3" />
                            <p className="text-sm text-slate-500 mb-4">不知道做什么？让 AI 帮你选。</p>
                            <Button size="sm" onClick={generateRecommendation} disabled={isAnalyzing} className="bg-indigo-600 hover:bg-indigo-700">
                                {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Sparkles className="w-3 h-3 mr-2" />}
                                智能推荐
                            </Button>
                        </div>
                    ) : (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded">Best Choice</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRecommendation(null)}><RotateCcw className="w-3 h-3" /></Button>
                            </div>
                            <h3 className="font-bold text-lg text-slate-800 mb-2">{recommendation.task?.title}</h3>
                            <p className="text-sm text-slate-600 mb-3 leading-relaxed">{recommendation.reason}</p>
                            <div className="bg-orange-50 p-2 rounded-lg flex gap-2">
                                <Lightbulb className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-orange-700">{recommendation.tips}</p>
                            </div>
                        </motion.div>
                    )}
                </TabsContent>

                <TabsContent value="insights" className="mt-0 min-h-[200px]">
                    {!insights ? (
                        <div className="text-center py-8">
                            <Lightbulb className="w-10 h-10 mx-auto text-indigo-200 mb-3" />
                            <p className="text-sm text-slate-500 mb-4">发现你的效率模式与改进点。</p>
                            <Button size="sm" onClick={generateInsights} disabled={isAnalyzing} className="bg-indigo-600 hover:bg-indigo-700">
                                {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Sparkles className="w-3 h-3 mr-2" />}
                                分析模式
                            </Button>
                        </div>
                    ) : (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                            {insights.map((insight, idx) => (
                                <div key={idx} className="bg-white p-3 rounded-xl border border-indigo-50 shadow-sm">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${insight.type === 'optimization' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                        <h4 className="font-medium text-sm text-slate-800">{insight.title}</h4>
                                    </div>
                                    <p className="text-xs text-slate-600 pl-3.5">{insight.content}</p>
                                </div>
                            ))}
                            <Button variant="ghost" size="sm" onClick={generateInsights} className="w-full text-xs text-slate-400 h-8">刷新</Button>
                        </motion.div>
                    )}
                </TabsContent>

                <TabsContent value="summary" className="mt-0 min-h-[200px]">
                    {!summary ? (
                        <div className="text-center py-8">
                            <Trophy className="w-10 h-10 mx-auto text-indigo-200 mb-3" />
                            <p className="text-sm text-slate-500 mb-4">生成本周成就简报。</p>
                            <Button size="sm" onClick={generateSummary} disabled={isAnalyzing} className="bg-indigo-600 hover:bg-indigo-700">
                                {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Sparkles className="w-3 h-3 mr-2" />}
                                生成简报
                            </Button>
                        </div>
                    ) : (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100">
                            <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-yellow-500" /> 
                                阶段总结
                            </h3>
                            <p className="text-sm text-slate-600 mb-4">{summary.summary}</p>
                            <div className="space-y-2 mb-4">
                                {summary.highlights.map((h, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                                        <span>{h}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t pt-3 border-slate-100 italic text-xs text-slate-500 text-center">
                                "{summary.quote}"
                            </div>
                        </motion.div>
                    )}
                </TabsContent>
            </AnimatePresence>
        </Tabs>
      </CardContent>
    </Card>
  );
}