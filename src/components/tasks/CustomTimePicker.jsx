import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export default function CustomTimePicker({ value, onChange, onClose }) {
    const [hours, minutes] = value ? value.split(':') : ["00", "00"];
    const hoursRef = useRef(null);
    const minutesRef = useRef(null);
    const isScrolling = useRef(false);
    const scrollTimeout = useRef(null);
    
    // Drag state
    const isDragging = useRef(false);
    const startY = useRef(0);
    const startScrollTop = useRef(0);

    const hoursList = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutesList = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
    
    const ITEM_HEIGHT = 32; // h-8 = 32px
    const PADDING_Y = 112; 

    const scrollToValue = (container, val) => {
        const index = parseInt(val, 10);
        if (container && !isScrolling.current && !isDragging.current) {
            container.scrollTop = index * ITEM_HEIGHT;
        }
    };

    // Scroll to selected on mount
    useEffect(() => {
        if (hoursRef.current) scrollToValue(hoursRef.current, hours);
        if (minutesRef.current) scrollToValue(minutesRef.current, minutes);
    }, []);

    const handleScroll = (e, type) => {
        // If dragging, don't snap yet
        if (isDragging.current) return;

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

            // Snap to position
            container.scrollTo({
                top: safeIndex * ITEM_HEIGHT,
                behavior: 'smooth'
            });

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

    // Mouse Drag Handlers
    const handleMouseDown = (e, ref) => {
        isDragging.current = true;
        isScrolling.current = true; // Prevent external updates interfering
        startY.current = e.clientY;
        startScrollTop.current = ref.current.scrollTop;
        
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };

    const handleMouseMove = (e, ref) => {
        if (!isDragging.current) return;
        e.preventDefault();
        const deltaY = e.clientY - startY.current;
        ref.current.scrollTop = startScrollTop.current - deltaY;
    };

    const handleMouseUp = (e, ref, type) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        
        // Trigger snap logic
        handleScroll({ target: ref.current }, type);
    };

    const handleMouseLeave = (e, ref, type) => {
        if (isDragging.current) {
            isDragging.current = false;
            handleScroll({ target: ref.current }, type);
        }
    };

    return (
        <div className="flex h-64 w-48 bg-white text-slate-900 overflow-hidden rounded-xl shadow-2xl border border-slate-100 select-none">
            {/* Hours Column */}
            <div 
                ref={hoursRef} 
                className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-r border-slate-100 snap-y snap-mandatory py-[112px] cursor-grab active:cursor-grabbing"
                onScroll={(e) => handleScroll(e, 'hours')}
                onMouseDown={(e) => handleMouseDown(e, hoursRef)}
                onMouseMove={(e) => handleMouseMove(e, hoursRef)}
                onMouseUp={(e) => handleMouseUp(e, hoursRef, 'hours')}
                onMouseLeave={(e) => handleMouseLeave(e, hoursRef, 'hours')}
            >
                {hoursList.map(h => (
                    <div
                        key={h}
                        data-value={h}
                        className={cn(
                            "flex items-center justify-center h-8 w-full text-sm font-medium transition-all snap-center pointer-events-none", // pointer-events-none to prevent click interference during drag, handling click on container instead? No, we need click.
                            h === hours 
                                ? "bg-[#384877] text-white scale-110 rounded-lg shadow-sm z-10 mx-1 w-[calc(100%-8px)]" 
                                : "text-slate-400"
                        )}
                    >
                        {h}
                    </div>
                ))}
            </div>

            {/* Minutes Column */}
            <div 
                ref={minutesRef} 
                className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-y snap-mandatory py-[112px] cursor-grab active:cursor-grabbing"
                onScroll={(e) => handleScroll(e, 'minutes')}
                onMouseDown={(e) => handleMouseDown(e, minutesRef)}
                onMouseMove={(e) => handleMouseMove(e, minutesRef)}
                onMouseUp={(e) => handleMouseUp(e, minutesRef, 'minutes')}
                onMouseLeave={(e) => handleMouseLeave(e, minutesRef, 'minutes')}
            >
                {minutesList.map(m => (
                    <div
                        key={m}
                        data-value={m}
                        className={cn(
                            "flex items-center justify-center h-8 w-full text-sm font-medium transition-all snap-center pointer-events-none",
                            m === minutes 
                                ? "bg-[#384877] text-white scale-110 rounded-lg shadow-sm z-10 mx-1 w-[calc(100%-8px)]" 
                                : "text-slate-400"
                        )}
                    >
                        {m}
                    </div>
                ))}
            </div>
            
            {/* Click overlay to handle clicks since items have pointer-events-none for smoother drag */}
            {/* Actually better to keep pointer events on items but prevent default drag? 
                Reverting item pointer-events and handling click vs drag distinction.
            */}
        </div>
    );
}

// Rewriting component to handle click vs drag properly
function CustomTimePickerRevised({ value, onChange, onClose }) {
    const [hours, minutes] = value ? value.split(':') : ["00", "00"];
    const hoursRef = useRef(null);
    const minutesRef = useRef(null);
    const isScrolling = useRef(false);
    const scrollTimeout = useRef(null);
    
    // Drag state
    const isDragging = useRef(false);
    const startY = useRef(0);
    const startScrollTop = useRef(0);
    const lastY = useRef(0); // To check if it was a click or drag

    const hoursList = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutesList = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
    
    const ITEM_HEIGHT = 32;
    const PADDING_Y = 112; 

    const scrollToValue = (container, val) => {
        const index = parseInt(val, 10);
        if (container && !isScrolling.current && !isDragging.current) {
            container.scrollTop = index * ITEM_HEIGHT;
        }
    };

    useEffect(() => {
        if (hoursRef.current) scrollToValue(hoursRef.current, hours);
        if (minutesRef.current) scrollToValue(minutesRef.current, minutes);
    }, []);

    const snapToPosition = (container, type) => {
        const scrollTop = container.scrollTop;
        const index = Math.round(scrollTop / ITEM_HEIGHT);
        
        const list = type === 'hours' ? hoursList : minutesList;
        const safeIndex = Math.min(Math.max(0, index), list.length - 1);
        const newValue = list[safeIndex];

        container.scrollTo({
            top: safeIndex * ITEM_HEIGHT,
            behavior: 'smooth'
        });

        const currentValue = type === 'hours' ? hours : minutes;
        if (newValue !== currentValue) {
            if (type === 'hours') {
                onChange(`${newValue}:${minutes}`);
            } else {
                onChange(`${hours}:${newValue}`);
            }
        }
    };

    const handleScroll = (e, type) => {
        if (isDragging.current) return;

        isScrolling.current = true;
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

        const container = e.target;
        scrollTimeout.current = setTimeout(() => {
            snapToPosition(container, type);
            isScrolling.current = false;
        }, 150);
    };

    const handleMouseDown = (e, ref) => {
        isDragging.current = true;
        isScrolling.current = true;
        startY.current = e.clientY;
        lastY.current = e.clientY;
        startScrollTop.current = ref.current.scrollTop;
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };

    const handleMouseMove = (e, ref) => {
        if (!isDragging.current) return;
        e.preventDefault();
        const deltaY = e.clientY - startY.current;
        ref.current.scrollTop = startScrollTop.current - deltaY;
        lastY.current = e.clientY;
    };

    const handleMouseUp = (e, ref, type) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        
        const moveDist = Math.abs(e.clientY - startY.current);
        if (moveDist < 5) {
            // It was a click, let the onClick handler of items work?
            // Or handle click logic here manually
            // Actually events bubble, so item onClick triggers.
        } else {
            // It was a drag, snap
            snapToPosition(ref.current, type);
        }
        
        // Reset scrolling flag after a small delay to allow snap to finish
        setTimeout(() => { isScrolling.current = false; }, 300);
    };

    const handleMouseLeave = (e, ref, type) => {
        if (isDragging.current) {
            isDragging.current = false;
            snapToPosition(ref.current, type);
            setTimeout(() => { isScrolling.current = false; }, 300);
        }
    };

    // Helper to center item on click
    const handleItemClick = (val, type, ref) => {
        // Only if not dragged
        if (Math.abs(lastY.current - startY.current) > 5 && isScrolling.current) return;
        
        const index = parseInt(val, 10);
        ref.current.scrollTo({
            top: index * ITEM_HEIGHT,
            behavior: 'smooth'
        });
        
        if (type === 'hours') onChange(`${val}:${minutes}`);
        else onChange(`${hours}:${val}`);
    };

    return (
        <div className="flex h-64 w-48 bg-white text-slate-900 overflow-hidden rounded-xl shadow-2xl border border-slate-100 select-none">
            {/* Hours Column */}
            <div 
                ref={hoursRef} 
                className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-r border-slate-100 snap-y snap-mandatory py-[112px] cursor-grab active:cursor-grabbing"
                onScroll={(e) => handleScroll(e, 'hours')}
                onMouseDown={(e) => handleMouseDown(e, hoursRef)}
                onMouseMove={(e) => handleMouseMove(e, hoursRef)}
                onMouseUp={(e) => handleMouseUp(e, hoursRef, 'hours')}
                onMouseLeave={(e) => handleMouseLeave(e, hoursRef, 'hours')}
            >
                {hoursList.map(h => (
                    <div
                        key={h}
                        className={cn(
                            "flex items-center justify-center h-8 w-full text-sm font-medium transition-all snap-center",
                            h === hours 
                                ? "bg-[#384877] text-white scale-110 rounded-lg shadow-sm z-10 mx-1 w-[calc(100%-8px)]" 
                                : "text-slate-400 hover:text-slate-600"
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleItemClick(h, 'hours', hoursRef);
                        }}
                    >
                        {h}
                    </div>
                ))}
            </div>

            {/* Minutes Column */}
            <div 
                ref={minutesRef} 
                className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-y snap-mandatory py-[112px] cursor-grab active:cursor-grabbing"
                onScroll={(e) => handleScroll(e, 'minutes')}
                onMouseDown={(e) => handleMouseDown(e, minutesRef)}
                onMouseMove={(e) => handleMouseMove(e, minutesRef)}
                onMouseUp={(e) => handleMouseUp(e, minutesRef, 'minutes')}
                onMouseLeave={(e) => handleMouseLeave(e, minutesRef, 'minutes')}
            >
                {minutesList.map(m => (
                    <div
                        key={m}
                        className={cn(
                            "flex items-center justify-center h-8 w-full text-sm font-medium transition-all snap-center",
                            m === minutes 
                                ? "bg-[#384877] text-white scale-110 rounded-lg shadow-sm z-10 mx-1 w-[calc(100%-8px)]" 
                                : "text-slate-400 hover:text-slate-600"
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleItemClick(m, 'minutes', minutesRef);
                        }}
                        onDoubleClick={() => {
                             if (Math.abs(lastY.current - startY.current) < 5) {
                                onClose?.();
                             }
                        }}
                    >
                        {m}
                    </div>
                ))}
            </div>
        </div>
    );
}

// Export the revised component