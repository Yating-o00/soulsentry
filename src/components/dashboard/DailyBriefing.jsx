import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Sun, Compass, Coffee, RefreshCw, Moon, CloudSun } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function DailyBriefing() {
    const [briefing, setBriefing] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchBriefing = async (force = false) => {
        const today = new Date().toDateString();
        const cacheKey = `daily_briefing_${today}`;

        if (!force) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    setBriefing(JSON.parse(cached));
                    setLoading(false);
                    return;
                } catch (e) {
                    // Cache invalid
                }
            }
        }

        setLoading(true);
        try {
            const { data } = await base44.functions.invoke("generateDailyBriefing");
            setBriefing(data);
            localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (error) {
            console.error("Failed to fetch briefing", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBriefing();
    }, []);

    const getTimeIcon = () => {
        const hour = new Date().getHours();
        if (hour < 12) return Sun;
        if (hour < 18) return CloudSun;
        return Moon;
    };

    const TimeIcon = getTimeIcon();

    if (loading) {
        return (
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm mb-8">
                <div className="flex items-center gap-3 mb-4">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-6 w-48" />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            </div>
        );
    }

    if (!briefing) return null;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm mb-8 relative overflow-hidden group hover:shadow-md transition-shadow duration-500"
        >
            {/* Decorative Background */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-amber-100/10 to-orange-100/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-200 to-orange-300 flex items-center justify-center text-white shadow-lg shadow-orange-200/50">
                            <TimeIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 tracking-tight">{briefing.title || briefing.greeting}</h2>
                            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1 font-medium">
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                AI 每日简报
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => fetchBriefing(true)}
                        className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-[#384877] transition-all duration-300"
                        title="重新生成"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
                    {/* Short Term */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-blue-50 rounded-lg">
                                <Coffee className="w-4 h-4 text-[#384877]" />
                            </div>
                            <h3 className="font-bold text-sm text-[#384877] uppercase tracking-wider">今日专注 · Short-Term</h3>
                        </div>
                        <p className="text-slate-600 leading-relaxed text-[15px] font-normal">
                            {briefing.short_term_narrative}
                        </p>
                    </div>

                    {/* Long Term */}
                    <div className="space-y-4 md:border-l md:border-slate-100 md:pl-8 lg:pl-12">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-indigo-50 rounded-lg">
                                <Compass className="w-4 h-4 text-indigo-600" />
                            </div>
                            <h3 className="font-bold text-sm text-indigo-600 uppercase tracking-wider">远见与思考 · Long-Term</h3>
                        </div>
                        <p className="text-slate-600 leading-relaxed text-[15px] font-normal">
                            {briefing.long_term_narrative}
                        </p>
                    </div>
                </div>

                {briefing.mindful_tip && (
                    <div className="mt-8 pt-6 border-t border-slate-100/60 flex justify-center">
                        <div className="inline-flex items-center gap-2.5 text-slate-500 text-sm italic bg-white px-5 py-2.5 rounded-full border border-slate-100 shadow-sm">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            <span>"{briefing.mindful_tip}"</span>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}