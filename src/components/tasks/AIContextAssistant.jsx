import React, { useState, useEffect } from 'react';
import { Sparkles, Briefcase, Clock, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AIContextAssistant() {
  const [context, setContext] = useState({
    location: '公司',
    timeRemaining: '3小时',
    suggestion: '下班前买一桶油回家'
  });

  return (
    <motion.section 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-green-100/30 to-transparent rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        
        <div className="flex items-start gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E8D5C4] to-[#D4C5B9] shadow-[0_4px_20px_rgba(232,213,196,0.4)] flex items-center justify-center flex-shrink-0 animate-[pulse_3s_ease-in-out_infinite]">
            <Sparkles className="w-7 h-7 text-stone-700" />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-stone-500">情境感知助手</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                正在感知
              </span>
            </div>
            <div className="text-lg text-stone-800 leading-relaxed font-serif">
              检测到你在{context.location}，距离下班还有{context.timeRemaining}。记得<span className="text-green-700 font-medium">{context.suggestion}</span>吗？我会适时提醒你。
            </div>
            
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full flex items-center gap-1 transition-transform hover:scale-105 cursor-default">
                <Briefcase className="w-3 h-3" />
                工作地点
              </span>
              <span className="px-3 py-1 bg-amber-50 text-amber-700 text-xs rounded-full flex items-center gap-1 transition-transform hover:scale-105 cursor-default">
                <Clock className="w-3 h-3" />
                下班前触发
              </span>
              <span className="px-3 py-1 bg-green-50 text-green-700 text-xs rounded-full flex items-center gap-1 transition-transform hover:scale-105 cursor-default">
                <Navigation className="w-3 h-3" />
                顺路提醒
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}