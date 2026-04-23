import React from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Zap, Bell, Moon, AlertOctagon, MapPin, Clock, EyeOff } from "lucide-react";

/**
 * 哨兵等级徽标：一眼识别打断梯度
 */
const LEVEL_CONFIG = {
  critical: { label: "关键", icon: AlertOctagon, cls: "bg-red-50 text-red-600 border-red-200" },
  assertive: { label: "强提醒", icon: Zap, cls: "bg-orange-50 text-orange-600 border-orange-200" },
  standard: { label: "标准", icon: Bell, cls: "bg-blue-50 text-blue-600 border-blue-200" },
  ambient: { label: "环境", icon: Moon, cls: "bg-slate-50 text-slate-500 border-slate-200" },
  silent: { label: "静默", icon: EyeOff, cls: "bg-slate-50 text-slate-400 border-slate-200" },
};

export default function SentinelBadge({ level, score, className = "" }) {
  if (!level && score == null) return null;
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.standard;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${cfg.cls} ${className}`}>
      <Icon className="w-3 h-3" />
      哨兵·{cfg.label}
      {typeof score === "number" && <span className="opacity-70">· {Math.round(score)}</span>}
    </Badge>
  );
}

export { LEVEL_CONFIG };