import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ModuleDrawer({ id, title, defaultOpen = false, forceOpen = false, children }) {
  const storageKey = `ss_module_open_${id}`;
  const [open, setOpen] = useState(() => {
    if (forceOpen) return true;
    const saved = localStorage.getItem(storageKey);
    return saved === null ? defaultOpen : saved === "1";
  });

  const toggle = () => {
    setOpen((v) => {
      localStorage.setItem(storageKey, v ? "0" : "1");
      return !v;
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2.5 py-2 group select-none"
      >
        <span
          className={`text-xs font-medium tracking-wide transition-colors ${
            open ? "text-slate-600" : "text-slate-400"
          } group-hover:text-slate-700`}
        >
          {title}
        </span>
        <div className="flex-1 h-px bg-slate-200/70" />
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pb-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}