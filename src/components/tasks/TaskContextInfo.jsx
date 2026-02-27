import React from 'react';
import { 
  MapPin, 
  Clock, 
  Zap, 
  Lightbulb, 
  Navigation,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { cn } from "@/lib/utils";
import moment from 'moment';

export default function TaskContextInfo({ task, className }) {
  if (!task) return null;
  
  const { 
    context_type, 
    time_context, 
    location_context, 
    ai_suggested_trigger 
  } = task;

  const hasContext = context_type && context_type !== 'none';
  const hasAISuggestion = !!ai_suggested_trigger?.suggested_time || !!ai_suggested_trigger?.reasoning;

  if (!hasContext && !hasAISuggestion) return null;

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      
      {/* 1. Context Tags Line */}
      <div className="flex flex-wrap items-center gap-2">
        
        {/* Location Tag */}
        {(context_type === 'location' || context_type === 'complex') && location_context && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
            <MapPin className="w-3.5 h-3.5" />
            <span>{location_context.name || location_context.natural_language_phrase || '特定地点'}</span>
          </div>
        )}

        {/* Time Context Tag */}
        {(context_type === 'time' || context_type === 'complex') && time_context && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
            <Clock className="w-3.5 h-3.5" />
            <span>{time_context.natural_language_phrase || '特定时间'}</span>
          </div>
        )}

        {/* Trigger Condition Tag (e.g. "On Arrival", "Before Leaving") */}
        {location_context?.trigger_on && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
            <Navigation className="w-3.5 h-3.5" />
            <span>
              {location_context.trigger_on === 'enter' ? '到达触发' : 
               location_context.trigger_on === 'exit' ? '离开触发' : '附近触发'}
            </span>
          </div>
        )}
        
        {/* Custom "Smooth Way" / Convenience Tag */}
        {task.category === 'shopping' && context_type === 'complex' && (
          <div className="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
             <Zap className="w-3.5 h-3.5 fill-current" />
             <span>顺路</span>
          </div>
        )}
      </div>

      {/* 2. Smart Status / AI Trigger Line */}
      {(hasAISuggestion || location_context) && (
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100/60">
           <div className="relative flex items-center justify-center w-4 h-4">
              <span className="absolute w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
           </div>
           
           <p className="text-xs text-slate-500 font-medium">
             {/* If explicit AI reasoning exists, show it */}
             {ai_suggested_trigger?.reasoning ? (
               <span>{ai_suggested_trigger.reasoning}</span>
             ) : (
               /* Fallback to constructing a sentence from context */
               <span>
                 {location_context?.trigger_on === 'exit' ? '将在你离开' : '将在你到达'} 
                 <span className="text-slate-700 mx-1">{location_context?.name || '指定地点'}</span>
                 时提醒
               </span>
             )}
           </p>

           {/* AI Suggested Time if different from scheduled */}
           {ai_suggested_trigger?.suggested_time && (
              <span className="ml-auto text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                 <Lightbulb className="w-3 h-3" />
                 建议 {moment(ai_suggested_trigger.suggested_time).format('HH:mm')}
              </span>
           )}
        </div>
      )}
      
      {/* 3. AI Analysis/Suggestion Box (Bottom Prominent) */}
      {task.ai_analysis?.suggestions?.length > 0 && (
         <div className="mt-2 bg-purple-50/50 rounded-xl p-3 border border-purple-100 flex items-start gap-2.5">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
               <Lightbulb className="w-3 h-3 text-purple-600" />
            </div>
            <div>
               <p className="text-xs text-purple-700 leading-relaxed">
                  {task.ai_analysis.suggestions[0]}
               </p>
            </div>
         </div>
      )}

    </div>
  );
}