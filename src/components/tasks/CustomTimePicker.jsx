import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export default function CustomTimePicker({ value, onChange, onClose }) {
    const [hours, minutes] = value ? value.split(':') : ["00", "00"];
    const hoursRef = useRef(null);
    const minutesRef = useRef(null);

    const hoursList = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutesList = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

    // Scroll to selected on mount
    useEffect(() => {
        if (hoursRef.current) {
            const el = hoursRef.current.querySelector(`[data-value="${hours}"]`);
            if (el) el.scrollIntoView({ block: "center" });
        }
        if (minutesRef.current) {
            const el = minutesRef.current.querySelector(`[data-value="${minutes}"]`);
            if (el) el.scrollIntoView({ block: "center" });
        }
    }, []); // Run once on mount

    return (
        <div className="flex h-64 w-48 bg-white text-slate-900 overflow-hidden rounded-md">
            <div ref={hoursRef} className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-r border-slate-100 snap-y snap-mandatory py-[calc(8rem-1rem)]">
                {hoursList.map(h => (
                    <div
                        key={h}
                        data-value={h}
                        className={cn(
                            "flex items-center justify-center h-8 w-full text-sm cursor-pointer transition-colors snap-center hover:bg-slate-50",
                            h === hours ? "bg-blue-600 text-white font-medium shadow-sm rounded-md" : "text-slate-700"
                        )}
                        onClick={() => onChange(`${h}:${minutes}`)}
                        onDoubleClick={() => {
                            onChange(`${h}:${minutes}`);
                            onClose?.();
                        }}
                    >
                        {h}
                    </div>
                ))}
            </div>
            <div ref={minutesRef} className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-y snap-mandatory py-[calc(8rem-1rem)]">
                {minutesList.map(m => (
                    <div
                        key={m}
                        data-value={m}
                        className={cn(
                            "flex items-center justify-center h-8 w-full text-sm cursor-pointer transition-colors snap-center hover:bg-slate-50",
                            m === minutes ? "bg-blue-600 text-white font-medium shadow-sm rounded-md" : "text-slate-700"
                        )}
                        onClick={() => onChange(`${hours}:${m}`)}
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