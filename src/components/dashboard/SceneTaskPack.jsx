import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { MapPin, ArrowRight, X, Timer, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CACHE_KEY = "ss_scene_pack_v1";
const CACHE_TTL = 30 * 60 * 1000; // 同一会话 30 分钟内不重复请求

// 场景任务包：到达关键地点后，AI 把该场景下最顺手的任务重组为行动卡片
export default function SceneTaskPack({ onTaskClick }) {
  const [pack, setPack] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.at < CACHE_TTL) {
        if (cached.pack?.actions?.length > 0) setPack(cached.pack);
        return;
      }
    } catch {}
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await base44.functions.invoke("getSceneContextTasks", {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          const data = res.data || {};
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), pack: data })); } catch {}
          if (data.scene && data.actions?.length > 0) setPack(data);
        } catch (e) {
          console.warn("[SceneTaskPack]", e?.message);
        }
      },
      () => {},
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  if (!pack || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        className="bg-gradient-to-br from-[#384877] to-[#3b5aa2] rounded-2xl p-4 md:p-5 text-white shadow-lg relative overflow-hidden"
      >
        <div className="absolute -right-4 -top-4 opacity-10">
          <MapPin className="w-28 h-28" />
        </div>
        <div className="flex items-start justify-between gap-2 relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{pack.scene.icon}</span>
            <div>
              <div className="text-[11px] text-blue-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />场景任务包 · {pack.scene.name}
              </div>
              <h3 className="font-semibold text-sm md:text-base">{pack.headline}</h3>
            </div>
          </div>
          <button onClick={() => setDismissed(true)} className="text-blue-200 hover:text-white no-min-size shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 relative z-10">
          {pack.actions.map((a) => (
            <button
              key={a.task_id}
              onClick={() => onTaskClick?.(a.task_id)}
              className="w-full text-left bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl px-3 py-2.5 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{a.title}</span>
                <span className="flex items-center gap-1 text-[10px] text-blue-200 shrink-0">
                  <Timer className="w-3 h-3" />{a.minutes}min
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
              <p className="text-xs text-blue-100/90 mt-0.5 truncate">▸ {a.first_step}</p>
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}