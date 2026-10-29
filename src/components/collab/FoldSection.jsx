import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function FoldSection({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-slate-100 py-5">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <span className="text-[15px] font-semibold text-slate-800">{title} <span className="text-slate-400 font-normal text-sm">{count}</span></span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}