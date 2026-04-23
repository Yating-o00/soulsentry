import React from "react";
import { Check, Loader2, Circle, AlertCircle, ChevronRight, Clock, Zap } from "lucide-react";

const statusConfig = {
  completed: { icon: Check, color: "text-emerald-500 bg-emerald-50 border-emerald-300" },
  running: { icon: Loader2, color: "text-[#384877] bg-[#384877]/10 border-[#384877]/40", spin: true },
  failed: { icon: AlertCircle, color: "text-red-500 bg-red-50 border-red-300" },
  pending: { icon: Circle, color: "text-slate-300 bg-slate-50 border-slate-200" },
  todo: { icon: Circle, color: "text-[#384877] bg-white border-[#384877]/30" },
};

export default function ExecutionStepFlow({ steps = [], onStepToggle }) {
  if (!steps || steps.length === 0) return null;

  // 判断是否为「事项链路」模式：AI 生成的现实事项链路
  const isRealityChain = steps.length > 0 && steps.every((s) => s.status === "todo" || s.status === "completed" || !!s.when_hint);

  const handleToggle = (e, i) => {
    if (!onStepToggle) return;
    e.stopPropagation();
    onStepToggle(i);
  };

  if (isRealityChain) {
    // 横向事项链路：卡片 + 箭头连接，视觉与主题深蓝统一
    return (
      <div className="relative -mx-0.5">
        <div className="flex items-stretch gap-0 overflow-x-auto pb-1 px-0.5 scrollbar-hide">
          {steps.map((step, i) => {
            const isAuto = !!step.is_automation;
            const isDone = step.status === "completed";
            const clickable = !!onStepToggle;
            return (
              <React.Fragment key={i}>
                <div
                  className={`flex-shrink-0 w-[132px] group ${clickable ? "cursor-pointer" : ""}`}
                  title={clickable ? (isDone ? "点击标记为未完成" : "点击标记完成") : (step.detail || step.step_name)}
                  onClick={(e) => handleToggle(e, i)}
                >
                  <div
                    className={`relative h-full rounded-xl p-2.5 border transition-all ${
                      isDone
                        ? "bg-emerald-50 border-emerald-300 shadow-sm"
                        : isAuto
                        ? "bg-gradient-to-br from-[#384877] to-[#3b5aa2] border-[#384877] text-white shadow-md shadow-[#384877]/20"
                        : "bg-white border-[#384877]/15 hover:border-[#384877]/40 hover:shadow-sm"
                    }`}
                  >
                    {/* 序号 / 图标 */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                          isDone
                            ? "bg-emerald-500 text-white"
                            : isAuto
                            ? "bg-white/20 text-white"
                            : "bg-[#384877]/10 text-[#384877]"
                        }`}
                      >
                        {isDone ? <Check className="w-3 h-3" /> : isAuto ? <Zap className="w-2.5 h-2.5" /> : i + 1}
                      </div>
                      {isDone ? (
                        <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-medium">
                          完成
                        </span>
                      ) : isAuto ? (
                        <span className="text-[9px] bg-white/25 text-white px-1.5 py-0.5 rounded font-medium">
                          自动
                        </span>
                      ) : null}
                    </div>

                    {/* 事项名 */}
                    <div
                      className={`text-[12px] font-semibold leading-snug line-clamp-2 mb-1 ${
                        isDone
                          ? "text-emerald-700 line-through decoration-emerald-400/60"
                          : isAuto
                          ? "text-white"
                          : "text-slate-800"
                      }`}
                    >
                      {step.step_name}
                    </div>

                    {/* 详情 */}
                    {step.detail && (
                      <p
                        className={`text-[10px] leading-tight line-clamp-2 mb-1.5 ${
                          isDone ? "text-emerald-600/80" : isAuto ? "text-white/75" : "text-slate-500"
                        }`}
                      >
                        {step.detail}
                      </p>
                    )}

                    {/* 时间提示 */}
                    {step.when_hint && (
                      <div
                        className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded ${
                          isDone
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : isAuto
                            ? "bg-white/20 text-white/90"
                            : "bg-[#384877]/8 text-[#384877]/80 border border-[#384877]/10"
                        }`}
                      >
                        <Clock className="w-2.5 h-2.5" />
                        {step.when_hint}
                      </div>
                    )}
                  </div>
                </div>

                {/* 连接箭头 */}
                {i < steps.length - 1 && (
                  <div className="flex items-center flex-shrink-0 px-1">
                    <ChevronRight className="w-4 h-4 text-[#384877]/35" strokeWidth={2.5} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  // 产品内流程模式（fallback）：横向步骤条
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto pb-1 scrollbar-hide">
      {steps.map((step, i) => {
        const cfg = statusConfig[step.status] || statusConfig.pending;
        const Icon = cfg.icon;
        const clickable = !!onStepToggle;
        return (
          <React.Fragment key={i}>
            <div
              className={`flex flex-col items-center gap-1 flex-shrink-0 min-w-[60px] ${clickable ? "cursor-pointer" : ""}`}
              title={clickable ? (step.status === "completed" ? "点击标记为未完成" : "点击标记完成") : (step.detail || step.step_name)}
              onClick={(e) => handleToggle(e, i)}
            >
              <div className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-all ${cfg.color} ${step.status === "running" ? "shadow-md shadow-[#384877]/20" : ""}`}>
                <Icon className={`w-4 h-4 ${cfg.spin ? "animate-spin" : ""}`} />
              </div>
              <span className={`text-[10px] text-center leading-tight max-w-[64px] truncate ${step.status === "completed" ? "text-emerald-600 line-through" : "text-slate-500"}`}>
                {step.step_name}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center flex-shrink-0 -mt-4">
                <div className={`w-5 h-0.5 ${step.status === "completed" ? "bg-emerald-300" : step.status === "running" ? "bg-[#384877]/30 animate-pulse" : "bg-slate-200"}`} />
                <ChevronRight className={`w-3 h-3 -mx-0.5 ${step.status === "completed" ? "text-emerald-400" : step.status === "running" ? "text-[#384877]/60" : "text-slate-300"}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}