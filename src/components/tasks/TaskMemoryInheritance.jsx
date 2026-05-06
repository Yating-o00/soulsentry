import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Users, Clock, MapPin, FileText, Plus, Brain, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";

/**
 * TaskMemoryInheritance
 * 在创建约定时，从用户的历史数据中自动匹配可继承的：
 *  - 人物 (Relationship)
 *  - 时间偏好 (历史完成时间)
 *  - 地点 (SavedLocation)
 *  - 相关文档 (Note)
 * 用户可一键应用到当前正在创建的约定。
 */
export default function TaskMemoryInheritance({ task, onApply }) {
  const [expanded, setExpanded] = useState(true);
  const text = `${task?.title || ""} ${task?.description || ""}`.toLowerCase().trim();
  const enabled = text.length >= 2;

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

    // 1) 人物：标题/描述包含 name 或 nickname
    const people = (relationships || [])
      .filter((r) => {
        const n = (r.name || "").toLowerCase();
        const nk = (r.nickname || "").toLowerCase();
        return (n && text.includes(n)) || (nk && text.includes(nk));
      })
      .slice(0, 3);

    // 2) 时间：同类已完成约定的高频小时
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
          count: top[1],
          label: `${task?.category === "work" ? "工作" : task?.category === "study" ? "学习" : "同类"}约定常在 ${hour}:00 完成`
        };
      }
    }

    // 3) 地点：location_name / address / 名称命中
    const places = (locations || [])
      .filter((l) => {
        const n = (l.name || "").toLowerCase();
        const addr = (l.address || "").toLowerCase();
        return (n && text.includes(n)) || (addr && text.length > 3 && addr.includes(text.slice(0, 4)));
      })
      .slice(0, 2);

    // 4) 相关文档：笔记 plain_text / tags 关键词命中
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

    return { people: people, time: timeSuggestion, places, docs };
  }, [enabled, text, relationships, locations, notes, historyTasks, task?.category]);

  const totalCount =
    matches.people.length + (matches.time ? 1 : 0) + matches.places.length + matches.docs.length;

  if (!enabled || totalCount === 0) return null;

  // ---- 应用动作 ----
  const applyPerson = (p) => {
    const tag = p.name;
    const newTags = Array.from(new Set([...(task.tags || []), tag]));
    onApply({ tags: newTags });
  };

  const applyTime = (t) => {
    onApply({ time: t.time });
  };

  const applyPlace = (l) => {
    onApply({
      location_reminder: {
        enabled: true,
        latitude: l.latitude,
        longitude: l.longitude,
        radius: l.radius || 200,
        location_name: l.name,
        trigger_on: l.trigger_on || "enter"
      }
    });
  };

  const applyDoc = (n) => {
    const link = `\n\n📎 相关笔记: ${n.plain_text?.slice(0, 30) || "笔记"}... (id:${n.id})`;
    onApply({ description: (task.description || "") + link });
  };

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
            <p className="text-sm font-semibold text-[#384877]">记忆继承</p>
            <p className="text-[11px] text-slate-500">从历史记录中找到 {totalCount} 项可继承</p>
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
            {/* 人物 */}
            {matches.people.length > 0 && (
              <Section icon={Users} color="text-rose-500" bg="bg-rose-50" label="关联人物">
                {matches.people.map((p) => (
                  <Chip key={p.id} onClick={() => applyPerson(p)}>
                    <span className="font-medium">{p.name}</span>
                    {p.relationship_type && <span className="text-slate-400 ml-1">· {p.relationship_type}</span>}
                    {p.last_interaction_date && (
                      <span className="text-slate-400 ml-1">
                        · {moment(p.last_interaction_date).fromNow()}
                      </span>
                    )}
                  </Chip>
                ))}
              </Section>
            )}

            {/* 时间 */}
            {matches.time && (
              <Section icon={Clock} color="text-blue-500" bg="bg-blue-50" label="时间偏好">
                <Chip onClick={() => applyTime(matches.time)}>
                  <span className="font-medium">{matches.time.time}</span>
                  <span className="text-slate-400 ml-1">· {matches.time.label}（{matches.time.count}次）</span>
                </Chip>
              </Section>
            )}

            {/* 地点 */}
            {matches.places.length > 0 && (
              <Section icon={MapPin} color="text-emerald-500" bg="bg-emerald-50" label="关联地点">
                {matches.places.map((l) => (
                  <Chip key={l.id} onClick={() => applyPlace(l)}>
                    <span>{l.icon || "📍"}</span>
                    <span className="font-medium ml-1">{l.name}</span>
                    {l.address && <span className="text-slate-400 ml-1 truncate">· {l.address.slice(0, 12)}</span>}
                  </Chip>
                ))}
              </Section>
            )}

            {/* 相关文档 */}
            {matches.docs.length > 0 && (
              <Section icon={FileText} color="text-amber-500" bg="bg-amber-50" label="相关文档">
                {matches.docs.map((n) => (
                  <Chip key={n.id} onClick={() => applyDoc(n)}>
                    <span className="font-medium truncate max-w-[200px] inline-block align-middle">
                      {(n.plain_text || n.content || "").slice(0, 24) || "笔记"}
                    </span>
                  </Chip>
                ))}
              </Section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Section({ icon: Icon, color, bg, label, children }) {
  return (
    <div className="flex items-start gap-2">
      <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5", bg)}>
        <Icon className={cn("w-3.5 h-3.5", color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-500 mb-1">{label}</p>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
    </div>
  );
}

function Chip({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-slate-200 hover:border-[#384877] hover:bg-[#384877]/5 text-xs text-slate-700 transition-colors group"
    >
      {children}
      <Plus className="w-3 h-3 text-slate-300 group-hover:text-[#384877] transition-colors" />
    </button>
  );
}