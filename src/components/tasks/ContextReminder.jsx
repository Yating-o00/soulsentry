import React, { useState, useEffect } from "react";
import { 
  MapPin, 
  Navigation, 
  X,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ContextReminder({ 
  onDismiss, 
  onSnooze 
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Simulate context detection delay
    const timer = setTimeout(() => {
      setVisible(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-96 bg-white rounded-2xl shadow-2xl border border-green-100 p-5 z-50 animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0 animate-pulse">
          <Navigation className="w-6 h-6 text-green-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-stone-800 mb-1">该买油回家啦</h4>
            <button 
              onClick={() => setVisible(false)} 
              className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-stone-500 mb-3">检测到你现在离开公司，顺路经过便利店</p>
          
          <div className="flex items-center gap-2 text-xs text-green-600 mb-3 font-medium bg-green-50 px-2 py-1 rounded-lg w-fit">
            <MapPin className="w-3 h-3" />
            <span>距离 200 米 · 顺路 3 分钟</span>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => {
                onDismiss();
                setVisible(false);
              }}
              className="flex-1 py-2 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-700 transition-colors shadow-sm"
            >
              记住了
            </button>
            <button 
              onClick={() => {
                onSnooze();
                setVisible(false);
              }}
              className="px-3 py-2 border border-stone-200 text-stone-600 text-sm rounded-lg hover:bg-stone-50 transition-colors flex items-center gap-1"
            >
              <Clock className="w-3.5 h-3.5" />
              稍后
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}