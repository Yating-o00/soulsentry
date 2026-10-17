import React from "react";
import { Link as LinkIcon, CheckSquare, Lightbulb, Smile } from "lucide-react";

const TEMPLATES = [
  { key: 'link', icon: LinkIcon, label: '链接', text: 'https://' },
  { key: 'todo', icon: CheckSquare, label: '待办', text: '【待办】' },
  { key: 'idea', icon: Lightbulb, label: '灵感', text: '【灵感】' },
  { key: 'mood', icon: Smile, label: '心情', text: '【心情】' },
];

export default function QuickTemplates({ onPick }) {
  return (
    <div className="flex items-center gap-1 bg-white rounded-full shadow-md border border-slate-200 px-3 py-1.5">
      {TEMPLATES.map(t => (
        <button
          key={t.key}
          onClick={() => onPick(t.text)}
          className="flex items-center gap-1 px-2.5 py-1 hover:bg-violet-50 hover:text-violet-600 rounded-full text-xs text-slate-600 transition"
        >
          <t.icon className="w-3 h-3" />
          {t.label}
        </button>
      ))}
    </div>
  );
}