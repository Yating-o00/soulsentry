import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Lightbulb, Loader2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function UserBehaviorInsights() {
  const [insights, setInsights] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Fetch recent behaviors
  const { data: behaviors } = useQuery({
    queryKey: ['userBehaviors'],
    queryFn: () => base44.entities.UserBehavior.list({
        sort: { created_date: -1 },
        limit: 50
    }),
    initialData: [],
  });

  const generateInsights = async () => {
    if (!behaviors || behaviors.length === 0) return;
    
    setIsAnalyzing(true);
    try {
      // Prepare data summary for AI
      const behaviorSummary = behaviors.map(b => ({
        type: b.event_type,
        time: `${b.day_of_week} ${b.hour_of_day}:00`,
        category: b.category
      }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze the following user task management behaviors and provide 3 personalized insights or suggestions to improve their productivity or app usage.
        
        Behaviors (Last 50):
        ${JSON.stringify(behaviorSummary)}
        
        Output format: JSON with a "suggestions" array, each containing "title" (short string), "content" (string), and "type" (enum: "optimization", "habit", "praise").
        `,
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

      if (result && result.suggestions) {
        setInsights(result.suggestions);
      }
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50/50 to-purple-50/50 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
                <CardTitle className="text-base font-semibold text-indigo-900">AI 行为洞察</CardTitle>
            </div>
            {!insights && (
                 <Button 
                    size="sm" 
                    onClick={generateInsights} 
                    disabled={isAnalyzing || !behaviors?.length}
                    className="h-8 bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-100 shadow-sm"
                >
                    {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Lightbulb className="w-3.5 h-3.5 mr-2" />}
                    {isAnalyzing ? "分析中..." : "生成建议"}
                </Button>
            )}
        </div>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
            {!insights ? (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="text-center py-6 text-slate-500 text-sm"
                >
                    <p>记录了 {behaviors?.length || 0} 条行为数据。</p>
                    <p className="text-xs opacity-70 mt-1">点击上方按钮，让 AI 发现你的效率模式。</p>
                </motion.div>
            ) : (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                >
                    {insights.map((insight, idx) => (
                        <div key={idx} className="bg-white/80 p-3 rounded-xl border border-indigo-100/50 shadow-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                    insight.type === 'optimization' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                    insight.type === 'habit' ? 'bg-green-50 text-green-600 border-green-100' :
                                    'bg-orange-50 text-orange-600 border-orange-100'
                                }`}>
                                    {insight.type === 'optimization' ? '建议优化' : insight.type === 'habit' ? '习惯养成' : '值得保持'}
                                </span>
                                <h4 className="font-medium text-sm text-slate-800">{insight.title}</h4>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed pl-1">
                                {insight.content}
                            </p>
                        </div>
                    ))}
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={generateInsights}
                        className="w-full text-xs text-indigo-400 hover:text-indigo-600 h-6 mt-2"
                    >
                        <RotateCcw className="w-3 h-3 mr-1" /> 刷新洞察
                    </Button>
                </motion.div>
            )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}