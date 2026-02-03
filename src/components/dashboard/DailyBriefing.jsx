import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Sun, Compass, Coffee, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function DailyBriefing() {
    const [briefing, setBriefing] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchBriefing = async () => {
        setLoading(true);
        try {
            const { data } = await base44.functions.invoke("generateDailyBriefing");
            setBriefing(data);
            // Cache in local storage for the day to avoid re-generating too often? 
            // For now, let's keep it fresh.
        } catch (error) {
            console.error("Failed to fetch briefing", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBriefing();
    }, []);

    if (loading) {
        return (
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mb-8">
                <div className="flex items-center gap-3 mb-4">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-6 w-48" />
                </div>
                <Skeleton className="h-20 w-full mb-4" />
                <Skeleton className="h-20 w-full" />
            </div>
        );
    }

    if (!briefing) return null;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-white to-slate-50 rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm mb-8 relative overflow-hidden group"
        >
            {/* Decorative Background */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-100/20 to-orange-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-200 to-orange-300 flex items-center justify-center text-white shadow-sm">
                            <Sun className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">{briefing.greeting}</h2>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                每日晨报 · AI 生成
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={fetchBriefing}
                        className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        title="重新生成"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Short Term */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[#384877]">
                            <Coffee className="w-4 h-4" />
                            <h3 className="font-semibold text-sm uppercase tracking-wider">今日专注 (Short-Term)</h3>
                        </div>
                        <p className="text-slate-600 leading-relaxed text-sm md:text-base">
                            {briefing.short_term_narrative}
                        </p>
                    </div>

                    {/* Long Term */}
                    <div className="space-y-3 md:border-l md:border-slate-100 md:pl-8">
                        <div className="flex items-center gap-2 text-indigo-600">
                            <Compass className="w-4 h-4" />
                            <h3 className="font-semibold text-sm uppercase tracking-wider">远见与思考 (Long-Term)</h3>
                        </div>
                        <p className="text-slate-600 leading-relaxed text-sm md:text-base">
                            {briefing.long_term_narrative}
                        </p>
                    </div>
                </div>

                {briefing.mindful_tip && (
                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <div className="flex items-center justify-center gap-2 text-slate-500 text-sm italic bg-white/50 py-2 px-4 rounded-full w-fit mx-auto border border-slate-100">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            "{briefing.mindful_tip}"
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}