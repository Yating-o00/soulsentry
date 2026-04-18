import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { 
  Users, AlertTriangle, Heart, Briefcase, User, 
  GraduationCap, Crown, Handshake, Gift, Clock
} from "lucide-react";
import moment from "moment";

const REL_TYPE_CONFIG = {
  family: { label: "家人", icon: Heart, color: "#9b59b6" },
  friend: { label: "朋友", icon: Users, color: "#e91e63" },
  colleague: { label: "同事", icon: Briefcase, color: "#3498db" },
  client: { label: "客户", icon: Handshake, color: "#e74c3c" },
  boss: { label: "上级", icon: Crown, color: "#2c3e50" },
  partner: { label: "合作伙伴", icon: Handshake, color: "#27ae60" },
  classmate: { label: "同学", icon: GraduationCap, color: "#f39c12" },
  other: { label: "其他", icon: User, color: "#95a5a6" },
};

function RelationshipCard({ rel, onSelect, isSelected }) {
  const config = REL_TYPE_CONFIG[rel.relationship_type] || REL_TYPE_CONFIG.other;
  const Icon = config.icon;
  const daysSinceContact = rel.last_interaction_date
    ? moment().diff(moment(rel.last_interaction_date), "days")
    : 999;
  const isOverdue = daysSinceContact > (rel.contact_frequency_days || 30);
  const initial = (rel.name || "?")[0];

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(rel)}
      className={`cursor-pointer rounded-2xl p-4 border transition-all ${
        isSelected ? "border-[#384877] bg-[#384877]/5 shadow-md" : "border-slate-100 bg-white hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
          style={{ backgroundColor: rel.avatar_color || config.color }}
        >
          {initial}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-slate-800 truncate">{rel.name}</h4>
            {rel.nickname && <span className="text-xs text-slate-400">({rel.nickname})</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge className="text-xs border-0" style={{ backgroundColor: config.color + "18", color: config.color }}>
              <Icon className="w-3 h-3 mr-0.5" /> {config.label}
            </Badge>
            <span className="text-xs text-slate-400">{rel.interaction_count || 0}次互动</span>
          </div>

          {/* Closeness bar */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">亲密度</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(rel.closeness || 5) * 10}%`,
                  backgroundColor: rel.avatar_color || config.color,
                }}
              />
            </div>
            <span className="text-xs font-medium text-slate-600">{rel.closeness || 5}</span>
          </div>

          {/* Overdue warning */}
          {isOverdue && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
              <AlertTriangle className="w-3 h-3" />
              <span>{daysSinceContact}天未联系，建议维护关系</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function FavorHistory({ favors }) {
  if (!favors || favors.length === 0) return null;
  return (
    <div className="space-y-2">
      <h5 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <Gift className="w-4 h-4 text-pink-500" /> 人情往来
      </h5>
      {favors.map((f, i) => (
        <div key={i} className={`flex items-center gap-2 text-sm p-2 rounded-lg ${
          f.type === "gave" ? "bg-blue-50" : "bg-pink-50"
        }`}>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            f.type === "gave" ? "bg-blue-100 text-blue-600" : "bg-pink-100 text-pink-600"
          }`}>
            {f.type === "gave" ? "付出" : "收到"}
          </span>
          <span className="flex-1 text-slate-700">{f.description}</span>
          {f.value_estimate > 0 && <span className="text-slate-400 text-xs">≈¥{f.value_estimate}</span>}
          {f.date && <span className="text-slate-400 text-xs">{moment(f.date).format("M/D")}</span>}
        </div>
      ))}
    </div>
  );
}

export default function RelationshipNetwork({ relationships }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 border border-slate-100 text-center">
          <div className="text-2xl font-bold text-[#384877]">{relationships.length}</div>
          <div className="text-xs text-slate-500">核心网络</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-100 text-center">
          <div className="text-2xl font-bold text-pink-500">
            {relationships.filter(r => {
              const days = r.last_interaction_date ? moment().diff(moment(r.last_interaction_date), "days") : 999;
              return days > (r.contact_frequency_days || 30);
            }).length}
          </div>
          <div className="text-xs text-slate-500">待维护</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-100 text-center">
          <div className="text-2xl font-bold text-emerald-500">
            {relationships.reduce((sum, r) => sum + (r.interaction_count || 0), 0)}
          </div>
          <div className="text-xs text-slate-500">总互动</div>
        </div>
      </div>

      {/* Relationship cards */}
      <div className="grid gap-3 md:grid-cols-2">
        {relationships.map((rel) => (
          <RelationshipCard
            key={rel.id}
            rel={rel}
            onSelect={setSelected}
            isSelected={selected?.id === rel.id}
          />
        ))}
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-lg text-slate-800">{selected.name} 详情</h4>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-sm">关闭</button>
            </div>
            {selected.notes && <p className="text-sm text-slate-600 mb-4">{selected.notes}</p>}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {selected.tags?.map((t, i) => (
                <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
              ))}
            </div>
            {selected.last_interaction_date && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-4">
                <Clock className="w-3.5 h-3.5" />
                最后互动: {moment(selected.last_interaction_date).format("YYYY年M月D日")}
              </div>
            )}
            <FavorHistory favors={selected.favors} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}