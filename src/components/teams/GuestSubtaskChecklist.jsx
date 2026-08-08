import React from "react";
import { CheckCircle2, Circle, Loader2, CornerDownRight } from "lucide-react";

// 根据协作动态判断每条子约定最近是被谁勾选的，用不同颜色保留各参与者的操作
const buildCheckerMap = (activities = []) => {
  const map = {};
  for (const a of activities) {
    if (!a.subtask_id) continue;
    if (a.activity_type !== "subtask_check" && a.activity_type !== "subtask_uncheck") continue;
    if (map[a.subtask_id]) continue; // activities 按时间倒序，取最新一条
    map[a.subtask_id] = a;
  }
  return map;
};

const styleFor = (s, checker, myGuestKey, viewerId) => {
  if (s.status !== "completed") {
    return { icon: "text-slate-300", row: "border-slate-200 hover:bg-slate-50", text: "text-slate-700", tag: null };
  }
  const byMe = checker && ((checker.guest_key && checker.guest_key === myGuestKey) || (checker.actor_id && checker.actor_id === viewerId));
  if (byMe) {
    return { icon: "text-sky-600", row: "border-sky-200 bg-sky-50/70", text: "line-through text-sky-700", tag: { label: "你", cls: "bg-sky-100 text-sky-700" } };
  }
  if (checker && checker.activity_type === "subtask_check") {
    return { icon: "text-violet-500", row: "border-violet-200 bg-violet-50/70", text: "line-through text-violet-600", tag: { label: checker.actor_name, cls: "bg-violet-100 text-violet-700" } };
  }
  // 发起人在应用内完成
  return { icon: "text-green-500", row: "border-green-200 bg-green-50/50", text: "line-through text-slate-400", tag: null };
};

function Row({ s, level, checker, myGuestKey, viewerId, busy, onToggle }) {
  const st = styleFor(s, checker, myGuestKey, viewerId);
  return (
    <button
      onClick={() => onToggle(s)}
      disabled={!!busy}
      className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl border transition-colors ${st.row} ${level > 0 ? "ml-5 w-[calc(100%-1.25rem)]" : ""}`}
    >
      {level > 0 && <CornerDownRight className="w-3 h-3 text-slate-300 shrink-0" />}
      {busy === s.id
        ? <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
        : s.status === "completed"
          ? <CheckCircle2 className={`w-4 h-4 shrink-0 ${st.icon}`} />
          : <Circle className={`w-4 h-4 shrink-0 ${st.icon}`} />}
      <span className={`text-sm flex-1 min-w-0 ${st.text}`}>{s.title}</span>
      {st.tag && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${st.tag.cls}`}>
          {st.tag.label} ✓
        </span>
      )}
    </button>
  );
}

// 两级子约定清单：内容只呈现一次，点击即勾选，不同颜色标记不同参与者的操作
export default function GuestSubtaskChecklist({ subtasks = [], activities = [], myGuestKey, viewerId, busy, onToggle }) {
  const checkers = buildCheckerMap(activities);
  return (
    <div className="space-y-1.5">
      {subtasks.map((s) => (
        <React.Fragment key={s.id}>
          <Row s={s} level={0} checker={checkers[s.id]} myGuestKey={myGuestKey} viewerId={viewerId} busy={busy} onToggle={onToggle} />
          {(s.children || []).map((c) => (
            <Row key={c.id} s={c} level={1} checker={checkers[c.id]} myGuestKey={myGuestKey} viewerId={viewerId} busy={busy} onToggle={onToggle} />
          ))}
        </React.Fragment>
      ))}
      <p className="text-[11px] text-slate-400 pt-1">
        <span className="text-sky-600">蓝色</span>是你勾选的，<span className="text-violet-500">紫色</span>是其他伙伴勾选的，<span className="text-green-600">绿色</span>是发起人完成的。
      </p>
    </div>
  );
}