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
    
    const ITEM_HEIGHT = 36; // Slightly larger for better touch target
    const VISIBLE_ITEMS = 5; // Show 5 items
    // Center is index 2 (0,1,2,3,4). PADDING = 2 * ITEM_HEIGHT
    const PADDING_Y = ITEM_HEIGHT * 2; 

    const scrollToValue = (container, val, smooth = false) => {
        const index = parseInt(val, 10);
        if (container) {
            container.scrollTo({
                top: index * ITEM_HEIGHT,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
    };

    // Initial scroll
    useEffect(() => {
        // Use timeout to ensure layout is ready
        setTimeout(() => {
            if (hoursRef.current) scrollToValue(hoursRef.current, hours);
            if (minutesRef.current) scrollToValue(minutesRef.current, minutes);
        }, 0);
    }, []);

    const handleScroll = (e, type) => {
        const container = e.target;
        if (!container) return;

        // Clear existing timeout
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

        // Set scrolling flag
        isScrolling.current = true;

        // Debounce value update
        scrollTimeout.current = setTimeout(() => {
            const scrollTop = container.scrollTop;
            const index = Math.round(scrollTop / ITEM_HEIGHT);
            
            const list = type === 'hours' ? hoursList : minutesList;
            const safeIndex = Math.min(Math.max(0, index), list.length - 1);
            const newValue = list[safeIndex];

            // Snap visually if needed (though CSS snap usually handles this, 
            // explicit snap ensures perfect alignment after momentum scroll)
            if (Math.abs(container.scrollTop - (safeIndex * ITEM_HEIGHT)) > 2) {
                container.scrollTo({
                    top: safeIndex * ITEM_HEIGHT,
                    behavior: 'smooth'
                });
            }

            const currentVal = type === 'hours' ? hours : minutes;
            if (newValue !== currentVal) {
                if (type === 'hours') onChange(`${newValue}:${minutes}`);
                else onChange(`${hours}:${newValue}`);
            }
            
            isScrolling.current = false;
        }, 100);
    };

    const handleItemClick = (val, type, ref) => {
        scrollToValue(ref.current, val, true);
        // Immediate update on click
        if (type === 'hours') onChange(`${val}:${minutes}`);
        else onChange(`${hours}:${val}`);
    };

    return (
        <div className="flex h-[180px] w-48 bg-white text-slate-900 overflow-hidden rounded-xl shadow-2xl border border-slate-100 select-none relative">
            {/* Selection Highlight / Lens */}
            <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-[36px] bg-[#384877]/5 pointer-events-none z-0 mx-2 rounded-lg" />
            
            {/* Hours */}
            <div 
                ref={hoursRef}
                className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-r border-slate-100/50 snap-y snap-mandatory relative z-10"
                style={{ paddingBlock: PADDING_Y }}
                onScroll={(e) => handleScroll(e, 'hours')}
            >
                {hoursList.map(h => (
                    <div
                        key={h}
                        className={cn(
                            "flex items-center justify-center h-[36px] w-full text-sm font-medium transition-all snap-center cursor-pointer",
                            h === hours 
                                ? "text-[#384877] font-bold text-lg scale-110" 
                                : "text-slate-400 hover:text-slate-600"
                        )}
                        onClick={() => handleItemClick(h, 'hours', hoursRef)}
                    >
                        {h}
                    </div>
                ))}
            </div>

            {/* Minutes */}
            <div 
                ref={minutesRef}
                className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-y snap-mandatory relative z-10"
                style={{ paddingBlock: PADDING_Y }}
                onScroll={(e) => handleScroll(e, 'minutes')}
            >
                {minutesList.map(m => (
                    <div
                        key={m}
                        className={cn(
                            "flex items-center justify-center h-[36px] w-full text-sm font-medium transition-all snap-center cursor-pointer",
                            m === minutes 
                                ? "text-[#384877] font-bold text-lg scale-110" 
                                : "text-slate-400 hover:text-slate-600"
                        )}
                        onClick={() => handleItemClick(m, 'minutes', minutesRef)}
                        onDoubleClick={() => onClose?.()}
                    >
                        {m}
                    </div>
                ))}
            </div>
        </div>
    );
}