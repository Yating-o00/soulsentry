import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function DayPlanAppendInput({ 
  value, 
  onChange, 
  onSubmit, 
  onCancel, 
  isAppending 
}) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
        <p className="text-xs text-slate-500 mb-2 font-medium">追加内容将被 AI 智能融入现有规划：</p>
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="例如：下午新增了一个重要会议，2点在会议室..."
          className="bg-white border-slate-200 rounded-xl resize-none text-sm min-h-[80px] focus-visible:ring-[#384877]/20"
          rows={3}
          autoFocus
        />
        <div className="flex gap-2 mt-3">
          <Button 
            onClick={onSubmit} 
            disabled={!value.trim() || isAppending} 
            className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl h-9 px-4 text-sm"
          >
            {isAppending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />融入中...</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 mr-1" />智能融入</>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-slate-400 h-9 rounded-xl">取消</Button>
        </div>
      </div>
    </motion.div>
  );
}