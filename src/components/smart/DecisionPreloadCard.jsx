import React from "react";
import { ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function DecisionPreloadCard({ card }) {
  const navigate = useNavigate();
  if (!card) return null;

  return (
    <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-900">{card.title}</div>
            <div className="text-xs text-slate-500 mt-0.5">{card.subtitle}</div>
          </div>
        </div>
        <span className="text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
          智能辅助
        </span>
      </div>

      <div className="text-base font-semibold text-slate-900 mb-3">
        {card.headline}
      </div>

      <div
        onClick={() => navigate(card.cta_link || '/Tasks')}
        className="rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-green-300 transition-colors"
      >
        <div className="text-sm font-medium text-slate-800 mb-2">
          待办：{card.payload_title}
        </div>
        {card.suggestions?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {card.suggestions.map((s, i) => (
              <span key={i} className="px-2.5 py-1 text-xs rounded-lg bg-green-50 text-green-700 border border-green-100">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {card.context_note && (
        <div className="text-xs text-slate-500 mt-3">{card.context_note}</div>
      )}
    </div>
  );
}