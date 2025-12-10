import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { BrainCircuit, Plus, Trash2, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const MESSAGE_TYPES = [
  { value: "default", label: "默认提醒", icon: "⏰" },
  { value: "urgent", label: "紧急警报", icon: "🚨" },
  { value: "summary", label: "状态摘要", icon: "📊" },
  { value: "encouraging", label: "鼓励加油", icon: "✨" },
];

export default function ReminderStrategyEditor({ task, onUpdate }) {
  const [strategy, setStrategy] = useState(task.reminder_strategy || {
    steps: [],
    dynamic_adjustment: false
  });

  const handleToggleDynamic = (checked) => {
    const newStrategy = { ...strategy, dynamic_adjustment: checked };
    setStrategy(newStrategy);
    onUpdate(newStrategy);
  };

  const addStep = () => {
    const newSteps = [...(strategy.steps || []), {
      offset_minutes: 30,
      message_type: "default",
      custom_message: ""
    }];
    const newStrategy = { ...strategy, steps: newSteps };
    setStrategy(newStrategy);
    onUpdate(newStrategy);
  };

  const updateStep = (index, field, value) => {
    const newSteps = [...(strategy.steps || [])];
    newSteps[index] = { ...newSteps[index], [field]: value };
    const newStrategy = { ...strategy, steps: newSteps };
    setStrategy(newStrategy);
    onUpdate(newStrategy);
  };

  const removeStep = (index) => {
    const newSteps = (strategy.steps || []).filter((_, i) => i !== index);
    const newStrategy = { ...strategy, steps: newSteps };
    setStrategy(newStrategy);
    onUpdate(newStrategy);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
              <BrainCircuit className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-indigo-900">AI 动态调整</h3>
              <p className="text-xs text-indigo-600/80">根据您的行为习惯自动优化提醒时间</p>
            </div>
          </div>
          <Switch 
            checked={strategy.dynamic_adjustment}
            onCheckedChange={handleToggleDynamic}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-slate-800 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            高级提醒策略
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