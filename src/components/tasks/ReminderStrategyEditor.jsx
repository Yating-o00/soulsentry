import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { BrainCircuit, Plus, Trash2, Zap, Bell, Clock, AlertTriangle, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

const MESSAGE_TYPES = [
  { value: "default", label: "默认提醒", icon: "⏰" },
  { value: "urgent", label: "紧急警报", icon: "🚨" },
  { value: "summary", label: "状态摘要", icon: "📊" },
  { value: "encouraging", label: "鼓励加油", icon: "✨" },
];

export default function ReminderStrategyEditor({ task, onUpdate }) {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [strategy, setStrategy] = useState(task.reminder_strategy || {
    steps: [],
    dynamic_adjustment: false
  });
  
  // Fetch user behavior for context
  const { data: recentBehaviors = [] } = useQuery({
    queryKey: ['recentBehaviors'],
    queryFn: () => base44.entities.UserBehavior.list('-created_date', 50),
    staleTime: 60000,
  });

  const updateStrategy = (newStrategy) => {
    setStrategy(newStrategy);
    onUpdate({ reminder_strategy: newStrategy });
  };

  const handleToggleDynamic = (checked) => {
    updateStrategy({ ...strategy, dynamic_adjustment: checked });
  };

  const addStep = () => {
    const newSteps = [...(strategy.steps || []), {
      offset_minutes: 30,
      message_type: "default",
      custom_message: ""
    }];
    updateStrategy({ ...strategy, steps: newSteps });
  };

  const updateStep = (index, field, value) => {
    const newSteps = [...(strategy.steps || [])];
    newSteps[index] = { ...newSteps[index], [field]: value };
    updateStrategy({ ...strategy, steps: newSteps });
  };

  const removeStep = (index) => {
    const newSteps = (strategy.steps || []).filter((_, i) => i !== index);
    updateStrategy({ ...strategy, steps: newSteps });
  };

  const handleOptimize = async () => {
      setIsOptimizing(true);
      try {
          const behaviors = recentBehaviors.map(b => `${b.event_type} at ${b.hour_of_day}:00`).join('; ');
          const prompt = `Analyze this task and user behavior to suggest an optimal reminder strategy.
          
          Task: "${task.title}" (Priority: ${task.priority}, Category: ${task.category}, Due: ${task.reminder_time})
          User Behavior History: ${behaviors || "No recent data"}
          
          Goal: Create a multi-step reminder strategy that ensures completion without being annoying.
          - If high priority/urgent: use urgent alerts and more frequent steps.
          - If user active late night: adjust timings.
          - Suggest if persistent reminder is needed.
          
          Return JSON:
          {
            "steps": [{"offset_minutes": number, "message_type": "default"|"urgent"|"summary"|"encouraging", "custom_message": string}],
            "dynamic_adjustment": boolean,
            "persistent_reminder": boolean,
            "notification_interval": number (5-60)
          }`;

          const res = await base44.integrations.Core.InvokeLLM({
              prompt,
              response_json_schema: {
                  type: "object",
                  properties: {
                      steps: { type: "array", items: { type: "object", properties: { offset_minutes: { type: "number" }, message_type: { type: "string" }, custom_message: { type: "string" } } } },
                      dynamic_adjustment: { type: "boolean" },
                      persistent_reminder: { type: "boolean" },
                      notification_interval: { type: "number" }
                  },
                  required: ["steps", "dynamic_adjustment"]
              }
          });

          if (res) {
              const newStrategy = {
                  steps: res.steps,
                  dynamic_adjustment: res.dynamic_adjustment
              };
              setStrategy(newStrategy);
              
              // Update all fields including top-level ones
              onUpdate({
                  reminder_strategy: newStrategy,
                  persistent_reminder: res.persistent_reminder,
                  notification_interval: res.notification_interval
              });
              
              toast.success("AI 已优化提醒策略");
          }
      } catch (e) {
          console.error(e);
          toast.error("优化失败");
      } finally {
          setIsOptimizing(false);
      }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
              <BrainCircuit className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-indigo-900">AI 智能策略</h3>
              <p className="text-xs text-indigo-600/80">让 AI 根据任务优先级和您的习惯定制提醒</p>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={handleOptimize} 
            disabled={isOptimizing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            {isOptimizing ? (
                <>
                    <span className="animate-spin mr-2">⏳</span>
                    优化中...
                </>
            ) : (
                <>
                    <Sparkles className="w-3.5 h-3.5 mr-2" />
                    一键优化
                </>
            )}
          </Button>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-indigo-100/50">
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-indigo-800">允许动态调整</span>
                <span className="text-[10px] text-indigo-500">(基于实时行为推迟或提前)</span>
            </div>
            <Switch 
                checked={strategy.dynamic_adjustment}
                onCheckedChange={handleToggleDynamic}
                className="scale-90"
            />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-slate-800 flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-500" />
            持续强提醒
          </h4>
          <Switch 
            checked={task.persistent_reminder}
            onCheckedChange={(checked) => onUpdate({ persistent_reminder: checked })}
          />
        </div>
        
        {task.persistent_reminder && (
             <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="bg-red-50 p-3 rounded-lg border border-red-100"
             >
                <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <p className="text-xs text-red-600 flex-1">
                        任务过期后将持续发送通知，直到标记完成。
                    </p>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">每</span>
                        <Input 
                            type="number" 
                            value={task.notification_interval || 15}
                            onChange={(e) => onUpdate({ notification_interval: parseInt(e.target.value) || 15 })}
                            className="w-16 h-7 text-xs bg-white"
                        />
                        <span className="text-xs text-slate-600">分钟</span>
                    </div>
                </div>
             </motion.div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-slate-800 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            提醒节点序列
          </h4>
          <Button size="sm" variant="outline" onClick={addStep} className="h-8">
            <Plus className="w-3.5 h-3.5 mr-1" />
            添加节点
          </Button>
        </div>

        <div className="space-y-3">
          <AnimatePresence>
            {(strategy.steps || []).map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className="p-4 border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                      {index + 1}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 flex-1">
                            <span className="text-sm text-slate-500 whitespace-nowrap">提前</span>
                            <Input 
                                type="number" 
                                value={step.offset_minutes}
                                onChange={(e) => updateStep(index, 'offset_minutes', parseInt(e.target.value) || 0)}
                                className="w-20 h-8"
                            />
                            <span className="text-sm text-slate-500 whitespace-nowrap">分钟</span>
                        </div>
                        
                        <Select 
                            value={step.message_type} 
                            onValueChange={(val) => updateStep(index, 'message_type', val)}
                        >
                            <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {MESSAGE_TYPES.map(t => (
                                    <SelectItem key={t.value} value={t.value}>
                                        <span className="mr-2">{t.icon}</span>
                                        {t.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-slate-400 hover:text-red-500"
                            onClick={() => removeStep(index)}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <Input 
                        placeholder="自定义提醒文案 (可选)..."
                        value={step.custom_message || ""}
                        onChange={(e) => updateStep(index, 'custom_message', e.target.value)}
                        className="h-9 text-sm bg-slate-50 border-slate-100"
                      />
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {(strategy.steps || []).length === 0 && (
            <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
              <p className="text-sm text-slate-400">暂无自定义策略，将使用默认提醒</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}