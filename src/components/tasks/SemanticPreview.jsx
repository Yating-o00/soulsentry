import React from "react";
import { cn } from "@/lib/utils";
import { 
  Clock, Users, MapPin, Sparkles, CalendarCheck, ListTodo, 
  Star, StickyNote, Bell, UserPlus, Lightbulb, Package, 
  CloudRain, Loader2, Wand2, ChevronRight
} from "lucide-react";

const INTENT_ICONS = {
  schedule: CalendarCheck,
  task: ListTodo,
  wish: Star,
  note: StickyNote,
  reminder: Bell,
  meeting: UserPlus,
};

const INTENT_COLORS = {
  schedule: "bg-blue-50 text-blue-700 border-blue-200",
  task: "bg-emerald-50 text-emerald-700 border-emerald-200",
  wish: "bg-amber-50 text-amber-700 border-amber-200",
  note: "bg-purple-50 text-purple-700 border-purple-200",
  reminder: "bg-red-50 text-red-700 border-red-200",
  meeting: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const INTENT_LABELS = {
  schedule: "日程", task: "待办", wish: "愿望", 
  note: "随记", reminder: "提醒", meeting: "约见",
};

const SUGGESTION_ICONS = {
  add_time: Clock, add_location: MapPin, add_person: Users,
  clarify_intent: Lightbulb, split_task: ListTodo, convert_to_action: Sparkles,
};

export default function SemanticPreview({ analysis, isLoading, onSuggestionAccept }) {
  if (isLoading) {
    return (
      <div className="px-4 pb-3">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-[#384877] animate-spin" />
          <span className="text-xs text-slate-500 font-medium">深度语义解析中...</span>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const intent = analysis.primary_intent;
  const IntentIcon = INTENT_ICONS[intent] || Sparkles;
  const intentColor = INTENT_COLORS[intent] || "bg-slate-50 text-slate-700 border-slate-200";
  const intentLabel = INTENT_LABELS[intent] || "智能";

  return (
    <div className="px-4 pb-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Intent + Confidence row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border", intentColor)}>
          <IntentIcon className="w-3 h-3" />
          {intentLabel}
          {analysis.intent_confidence >= 0.8 && <span className="opacity-60">✓</span>}
        </span>

        {analysis.intent_reasoning && (
          <span className="text-[11px] text-slate-400 italic">{analysis.intent_reasoning}</span>
        )}
      </div>

      {/* Extracted entities row */}
      <div className="flex flex-wrap gap-1.5">
        {/* Time entities */}
        {analysis.time_entities?.filter(t => t.original_text).map((t, i) => (
          <span key={"t" + i} className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full",
            t.time_confidence === "high" ? "bg-blue-50 text-blue-600" :
            t.time_confidence === "medium" ? "bg-amber-50 text-amber-600" :
            "bg-slate-50 text-slate-500"
          )}>
            <Clock className="w-2.5 h-2.5" />
            {t.original_text}
            {t.resolved_datetime && (
              <span className="opacity-60 ml-0.5">→ {formatResolvedTime(t.resolved_datetime)}</span>
            )}
            {t.is_recurring && <span className="ml-0.5">🔁</span>}
          </span>
        ))}

        {/* People */}
        {analysis.people?.map((p, i) => (
          <span key={"p" + i} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-indigo-50 text-indigo-600">
            <Users className="w-2.5 h-2.5" />
            {p.name}
            {p.role && <span className="opacity-50">({p.role})</span>}
          </span>
        ))}

        {/* Locations */}
        {analysis.locations?.map((l, i) => (
          <span key={"l" + i} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-green-50 text-green-600">
            <MapPin className="w-2.5 h-2.5" />
            {l.name}
          </span>
        ))}

        {/* Objects */}
        {analysis.objects?.map((o, i) => (
          <span key={"o" + i} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-stone-50 text-stone-500">
            <Package className="w-2.5 h-2.5" />
            {o}
          </span>
        ))}

        {/* Conditions */}
        {analysis.conditions?.map((c, i) => (
          <span key={"c" + i} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full bg-orange-50 text-orange-600">
            <CloudRain className="w-2.5 h-2.5" />
            {c}
          </span>
        ))}
      </div>

      {/* Smart suggestions */}
      {analysis.smart_suggestions?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {analysis.smart_suggestions.map((s, i) => {
            const SIcon = SUGGESTION_ICONS[s.type] || Lightbulb;
            return (
              <button
                key={i}
                onClick={() => onSuggestionAccept && onSuggestionAccept(s)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-[#384877]/5 text-[#384877] hover:bg-[#384877]/10 transition-colors border border-[#384877]/10 cursor-pointer"
              >
                <SIcon className="w-3 h-3" />
                {s.text}
                <ChevronRight className="w-2.5 h-2.5 opacity-50" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatResolvedTime(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    
    const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    
    if (isToday) return `今天 ${timeStr}`;
    if (isTomorrow) return `明天 ${timeStr}`;
    return `${d.getMonth()+1}/${d.getDate()} ${timeStr}`;
  } catch {
    return isoStr;
  }
}