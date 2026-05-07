import React, { useMemo, useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Clock, MapPin, FileText, Brain, ChevronDown, ChevronUp, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * TaskMemoryInheritance - 相关记忆
 * 在创建约定时，自动扫描历史数据匹配并填充：
 *  - 人物姓名 → 加入标签
 *  - 地理位置 → 启用 location_reminder
 *  - 关联文档 → 描述末尾追加引用
 * 同时展示已自动关联的"相关记忆"汇总，支持移除。
 * 时间偏好作为可选建议（不自动应用）。
 */
export default function TaskMemoryInheritance({ task, onApply }) {
  const [expanded, setExpanded] = useState(true);
  const text = `${task?.title || ""} ${task?.description || ""}`.toLowerCase().trim();
  const enabled = text.length >= 2;

  // 已自动应用的记忆（用于汇总展示和去重）
  const [appliedPeople, setAppliedPeople] = useState([]);
  const [appliedPlace, setAppliedPlace] = useState(null);
  const [appliedDocs, setAppliedDocs] = useState([]);
  const autoFilledKeyRef = useRef(""); // 防止重复填充同一文本

  const { data: relationships = [] } = useQuery({
    queryKey: ["mi-relationships"],
    queryFn: () => base44.entities.Relationship.list("-last_interaction_date", 100),
    enabled,
    staleTime: 60000
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["mi-locations"],
    queryFn: () => base44.entities.SavedLocation.list("-updated_date", 50),
    enabled,
    staleTime: 60000
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["mi-notes"],
    queryFn: () => base44.entities.Note.list("-updated_date", 80),
    enabled,
    staleTime: 60000
  });

  const { data: historyTasks = [] } = useQuery({
    queryKey: ["mi-history-tasks", task?.category],
    queryFn: () => base44.entities.Task.filter(
      { status: "completed", category: task?.category || "personal" },
      "-completed_at",
      80
    ),
    enabled: enabled && !!task?.category,
    staleTime: 60000
  });

  // ---- 匹配逻辑 ----
  const matches = useMemo(() => {
    if (!enabled) return { people: [], time: null, places: [], docs: [] };

    const people = (relationships || [])
      .filter((r) => {
        const n = (r.name || "").toLowerCase();
        const nk = (r.nickname || "").toLowerCase();
        return (n && text.includes(n)) || (nk && text.includes(nk));
      })
      .slice(0, 3);

    let timeSuggestion = null;
    if (historyTasks.length >= 3) {
      const hourCounts = {};
      historyTasks.forEach((t) => {
        if (t.completed_at) {
          const h = new Date(t.completed_at).getHours();
          hourCounts[h] = (hourCounts[h] || 0) + 1;
        }
      });
      const top = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) {
        const hour = parseInt(top[0]);
        timeSuggestion = {
          hour,
          time: `${String(hour).padStart(2, "0")}:00`,
          count: top[1]
        };
      }
    }

    const places = (locations || [])
      .filter((l) => {
        const n = (l.name || "").toLowerCase();
        const addr = (l.address || "").toLowerCase();
        return (n && text.includes(n)) || (addr && text.length > 3 && addr.includes(text.slice(0, 4)));
      })
      .slice(0, 2);

    const keywords = text.split(/\s+|，|,|。|;/).filter((w) => w.length >= 2).slice(0, 5);
    const docs = (notes || [])
      .map((n) => {
        const content = (n.plain_text || n.content || "").toLowerCase();
        const tags = (n.tags || []).map((t) => t.toLowerCase());
        let score = 0;
        keywords.forEach((kw) => {
          if (content.includes(kw)) score += 1;
          if (tags.some((t) => t.includes(kw))) score += 2;
        });
        return { note: n, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.note);

    return { people, time: timeSuggestion, places, docs };
  }, [enabled, text, relationships, locations, notes, historyTasks]);

  // ---- 自动填充：当匹配结果出现且文本变化时执行一次 ----
  useEffect(() => {
    if (!enabled) return;
    const key = text;
    if (autoFilledKeyRef.current === key) return;
    if (matches.people.length === 0 && matches.places.length === 0 && matches.docs.length === 0) return;

    const patch = {};

    // 人物 → 标签
    if (matches.people.length > 0) {
      const peopleNames = matches.people.map((p) => p.name);
      const existing = task.tags || [];
      const newTags = Array.from(new Set([...existing, ...peopleNames]));
      if (newTags.length !== existing.length) patch.tags = newTags;
      setAppliedPeople(matches.people);
    }

    // 地点 → location_reminder（仅在用户尚未启用时填充）
    if (matches.places.length > 0 && !task.location_reminder?.enabled) {
      const l = matches.places[0];
      patch.location_reminder = {
        enabled: true,
        latitude: l.latitude,
        longitude: l.longitude,
        radius: l.radius || 200,
        location_name: l.name,
        trigger_on: l.trigger_on || "enter"
      };
      setAppliedPlace(l);
    } else if (matches.places.length > 0) {
      setAppliedPlace(matches.places[0]);
    }

    // 文档 → 描述末尾追加引用
    if (matches.docs.length > 0) {
      const desc = task.description || "";
      const docLines = matches.docs
        .filter((n) => !desc.includes(`(id:${n.id})`))
        .map((n) => `📎 ${(n.plain_text || n.content || "笔记").slice(0, 30)}... (id:${n.id})`);
      if (docLines.length > 0) {
        patch.description = desc + (desc ? "\n\n" : "") + docLines.join("\n");
      }
      setAppliedDocs(matches.docs);
    }

    if (Object.keys(patch).length > 0) {
      onApply(patch);
    }
    autoFilledKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, text, matches]);

  // ---- 移除已应用的记忆 ----
  const removePerson = (p) => {
    setAppliedPeople((prev) => prev.filter((x) => x.id !== p.id));
    onApply({ tags: (task.tags || []).filter((t) => t !== p.name) });
  };

  const removePlace = () => {
    setAppliedPlace(null);
    onApply({ location_reminder: { enabled: false } });
  };

  const removeDoc = (n) => {
    setAppliedDocs((prev) => prev.filter((x) => x.id !== n.id));
    const desc = task.description || "";
    const newDesc = desc
      .split("\n")
      .filter((line) => !line.includes(`(id:${n.id})`))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    onApply({ description: newDesc });
  };

  const applyTime = (t) => onApply({ time: t.time });

  const totalApplied = appliedPeople.length + (appliedPlace ? 1 : 0) + appliedDocs.length;
  const hasTimeSuggestion = !!matches.time;

  if (!enabled || (totalApplied === 0 && !hasTimeSuggestion)) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#384877]/15 bg-gradient-to-br from-[#384877]/5 to-purple-50/40 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-sm">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-[#384877]">相关记忆</p>
            <p className="text-[11px] text-slate-500">
              {totalApplied > 0 ? `已自动关联 ${totalApplied} 项` : "找到时间偏好建议"}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-3 space-y-2.5"
          >
            {appliedPeople.length > 0 && (
              <Section icon={Users} color="text-rose-500" bg="bg-rose-50" label="人物" auto>
                {appliedPeople.map((p) => (
                  <AppliedChip key={p.id} onRemove={() => removePerson(p)}>
                    <span className="font-medium">{p.name}</span>
                    {p.relationship_type && <span className="text-slate-400 ml-1">· {p.relationship_type}</span>}
                  </AppliedChip>
                ))}
              </Section>
            )}

            {appliedPlace && (
              <Section icon={MapPin} color="text-emerald-500" bg="bg-emerald-50" label="地点" auto>
                <AppliedChip onRemove={removePlace}>
                  <span>{appliedPlace.icon || "📍"}</span>
                  <span className="font-medium ml-1">{appliedPlace.name}</span>
                  {appliedPlace.address && (
                    <span className="text-slate-400 ml-1">· {appliedPlace.address.slice(0, 12)}</span>
                  )}
                </AppliedChip>
              </Section>
            )}

            {appliedDocs.length > 0 && (
              <Section icon={FileText} color="text-amber-500" bg="bg-amber-50" label="关联文档" auto>
                {appliedDocs.map((n) => (
                  <AppliedChip key={n.id} onRemove={() => removeDoc(n)}>
                    <span className="font-medium truncate max-w-[200px] inline-block align-middle">
                      {(n.plain_text || n.content || "笔记").slice(0, 24)}
                    </span>
                  </AppliedChip>
                ))}
              </Section>
            )}

            {matches.time && (
              <Section icon={Clock} color="text-blue-500" bg="bg-blue-50" label="时间建议">
                <button
                  type="button"
                  onClick={() => applyTime(matches.time)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-dashed border-blue-300 hover:bg-blue-50 text-xs text-blue-700 transition-colors"
                >
                  <span className="font-medium">{matches.time.time}</span>
                  <span className="text-blue-400 ml-1">· 同类常在此时完成（{matches.time.count}次）</span>
                  <Check className="w-3 h-3 ml-1" />
                </button>
              </Section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Section({ icon: SectionIcon, color, bg, label, auto, children }) {
  return (
    <div className="flex items-start gap-2">
      <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5", bg)}>
        <SectionIcon className={cn("w-3.5 h-3.5", color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-[11px] font-medium text-slate-500">{label}</p>
          {auto && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
              已自动添加
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
    </div>
  );
}

function AppliedChip({ onRemove, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-700">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-slate-300 hover:text-rose-500 transition-colors"
        aria-label="移除"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}