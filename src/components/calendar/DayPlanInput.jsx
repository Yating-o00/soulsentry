import React, { useState } from "react";
import { motion } from "framer-motion";
import { format, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ArrowRight, Mic, Image as ImageIcon, ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const QUICK_TEMPLATES = [
  { text: '今晚8点给妈妈打电话，聊聊最近身体情况', label: '📞 给妈妈打电话' },
  { text: '下午完成Q4报告初稿，晚上提醒我检查', label: '📊 季度报告' },
  { text: '明天早上7点飞深圳，提前一晚提醒收拾行李', label: '✈️ 出差准备' },
  { text: '上午专注开发2小时，下午开产品评审会', label: '🎯 深度工作日' }
];

export default function DayPlanInput({ 
  currentDate, 
  userInput, 
  onInputChange, 
  onSubmit, 
  isProcessing 
}) {
  const [showTemplates, setShowTemplates] = useState(false);
  const dayStr = format(currentDate, 'M月d日 EEEE', { locale: zhCN });
  const today = isToday(currentDate);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 flex flex-col justify-center items-center text-center space-y-8 py-12"
    >
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm">
          <span className="w-2 h-2 bg-[#384877] rounded-full animate-pulse"></span>
          <span className="text-xs font-medium text-slate-600">AI Day Planner</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
          {today ? '规划今天，' : `规划${dayStr}，`}<br />
          <span className="text-[#384877]">从容且坚定</span>
        </h1>
        <p className="text-base text-slate-500 max-w-lg mx-auto leading-relaxed">
          告诉我今天的重要安排，心栈将为你生成全情境协同方案。
        </p>
      </div>

      <div className="w-full max-w-2xl relative group">
        <div className="relative bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-2 transition-shadow duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
          <div className="bg-white rounded-2xl flex flex-col">
            <Textarea
              value={userInput}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="例如：上午10点和设计团队开会讨论新版UI，下午3点客户电话会议，晚上7点健身..."
              className="w-full bg-transparent border-none outline-none text-lg text-slate-800 placeholder:text-slate-400 resize-none px-6 py-5 font-light min-h-[140px] focus-visible:ring-0 leading-relaxed"
              onKeyDown={(e) => {
                const composing = e.nativeEvent && e.nativeEvent.isComposing;
                if (!composing && e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />
            <div className="flex items-center justify-between px-4 pb-4 pt-2 border-t border-slate-50">
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-[#384877] hover:bg-slate-50">
                  <Mic className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-[#384877] hover:bg-slate-50">
                  <ImageIcon className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="text-xs text-slate-500 hover:text-[#384877] hover:bg-slate-50 gap-1"
                >
                  快速模板 <ChevronDown className="w-3 h-3" />
                </Button>
              </div>
              <Button
                onClick={onSubmit}
                disabled={!userInput.trim() || isProcessing}
                className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl px-6 h-10 shadow-lg shadow-[#384877]/20 transition-all duration-300"
              >
                {isProcessing ? '规划中...' : '生成规划'} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showTemplates && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap justify-center gap-3 max-w-2xl"
        >
          {QUICK_TEMPLATES.map((tpl, idx) => (
            <button
              key={idx}
              onClick={() => {
                onInputChange(tpl.text);
                setShowTemplates(false);
              }}
              className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:border-[#384877] hover:text-[#384877] transition-all shadow-sm"
            >
              {tpl.label}
            </button>
          ))}
        </motion.div>
      )}
    </motion.section>
  );
}