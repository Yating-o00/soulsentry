import React from "react";
import { Navigation, MapPin, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function OnTheWayCard({ card, onDismiss, onSnooze }) {
  const navigate = useNavigate();
  if (!card) return null;

  return (
    <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
          <Navigation className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-slate-900">{card.title}</div>
          <div className="text-sm text-slate-500 mt-0.5">{card.subtitle}</div>
        </div>
        <button onClick={onDismiss} className="p-1 text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {card.meta && (
        <div className="inline-flex items-center gap-1.5 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg mb-4">
          <MapPin className="w-3.5 h-3.5" />
          {card.meta}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          className="flex-1 bg-slate-900 hover:bg-slate-800"
          onClick={() => navigate(card.cta_link || '/Tasks')}
        >
          记住了
        </Button>
        <Button variant="outline" onClick={onSnooze}>
          <Clock className="w-4 h-4 mr-1" /> 稍后
        </Button>
      </div>
    </div>
  );
}