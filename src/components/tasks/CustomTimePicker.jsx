import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export default function CustomTimePicker({ value, onChange, onClose }) {
    const [hours, minutes] = value ? value.split(':') : ["00", "00"];
    const hoursRef = useRef(null);
    const minutesRef = useRef(null);
    const isScrolling = useRef(false);
    const scrollTimeout = useRef(null);

    const hoursList = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutesList = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
    
    const ITEM_HEIGHT = 32; // h-8 = 32px
    // Container height 16rem = 256px. 
    // Center is at 128px. Item is 32px. Top of center item is 128 - 16 = 112px.
    // Padding top should be 112px.
    const PADDING_Y = 112; 

    const scrollToValue = (container, val) => {
        const index = parseInt(val, 10);
        if (container && !isScrolling.current) {
            container.scrollTop = index * ITEM_HEIGHT;
        }
    };

    // Scroll to selected on mount
    useEffect(() => {
        if (hoursRef.current) scrollToValue(hoursRef.current, hours);
        if (minutesRef.current) scrollToValue(minutesRef.current, minutes);
    }, []);

    const handleScroll = (e, type) => {
        isScrolling.current = true;
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

        const container = e.target;
        
        scrollTimeout.current = setTimeout(() => {
            const scrollTop = container.scrollTop;
            const index = Math.round(scrollTop / ITEM_HEIGHT);
            
            // Calculate new value based on snap index
            const list = type === 'hours' ? hoursList : minutesList;
            const safeIndex = Math.min(Math.max(0, index), list.length - 1);
            const newValue = list[safeIndex];

            // Only trigger change if different
            const currentValue = type === 'hours' ? hours : minutes;
            if (newValue !== currentValue) {
                if (type === 'hours') {
                    onChange(`${newValue}:${minutes}`);
                } else {
                    onChange(`${hours}:${newValue}`);
                }
            }
            isScrolling.current = false;
        }, 150); // Debounce scroll end
    };

    return (
        <div className="flex h-64 w-48 bg-white text-slate-900 overflow-hidden rounded-xl shadow-2xl border border-slate-100">
            {/* Hours Column */}
            <div 
                ref={hoursRef} 
                className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-r border-slate-100 snap-y snap-mandatory py-[112px]"
                onScroll={(e) => handleScroll(e, 'hours')}
            >
                {hoursList.map(h => (
                    <div
                        key={h}
                        data-value={h}
                        className={cn(
                            "flex items-center justify-center h-8 w-full text-sm font-medium cursor-pointer transition-all snap-center select-none",
                            h === hours 
                                ? "bg-[#384877] text-white scale-110 rounded-lg shadow-sm z-10 mx-1 w-[calc(100%-8px)]" 
                                : "text-slate-400 hover:text-slate-600"
                        )}
                        onClick={() => {
                            isScrolling.current = false; // Override scroll lock
                            onChange(`${h}:${minutes}`);
                            // Manual scroll to center clicked item
                            if (hoursRef.current) hoursRef.current.scrollTop = parseInt(h, 10) * ITEM_HEIGHT;
                        }}
                    >
                        {h}
                    </div>
                ))}
            </div>

            {/* Minutes Column */}
            <div 
                ref={minutesRef} 
                className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-y snap-mandatory py-[112px]"
                onScroll={(e) => handleScroll(e, 'minutes')}
            >
                {minutesList.map(m => (
                    <div
                        key={m}
                        data-value={m}
                        className={cn(
                            "flex items-center justify-center h-8 w-full text-sm font-medium cursor-pointer transition-all snap-center select-none",
                            m === minutes 
                                ? "bg-[#384877] text-white scale-110 rounded-lg shadow-sm z-10 mx-1 w-[calc(100%-8px)]" 
                                : "text-slate-400 hover:text-slate-600"
                        )}
                        onClick={() => {
                            isScrolling.current = false; // Override scroll lock
                            onChange(`${hours}:${m}`);
                            // Manual scroll to center clicked item
                            if (minutesRef.current) minutesRef.current.scrollTop = parseInt(m, 10) * ITEM_HEIGHT;
                        }}
                        onDoubleClick={() => {
                            onChange(`${hours}:${m}`);
                            onClose?.();
                        }}
                    >
                        {m}
                    </div>
                ))}
            </div>
        </div>
    );
}