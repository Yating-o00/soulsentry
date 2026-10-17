import React from "react";
import { motion } from "framer-motion";
import { Lightbulb, ListChecks, Brain } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Displays AI-parsed structured insights in three distinct cards:
 * - 核心结论 (Core Conclusion)
 * - 行动步骤 (Action Steps)
 * - 相关记忆 (Related Memories)
 */
export default function StructuredCard({ data }) {
  if (!data) return null;

  const sections = [
    {
      key: "core_conclusion",
      title: "核心结论",
      icon: Lightbulb,
      gradient: "from-amber-50 to-orange-50",
      border: "border-amber-200/60",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      content: data.core_conclusion,
      type: "text",
    },
    {
      key: "action_steps",
      title: "行动步骤",
      icon: ListChecks,
      gradient: "from-blue-50 to-indigo-50",
      border: "border-blue-200/60",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      content: data.action_steps,
      type: "list",
    },
    {
      key: "related_memories",
      title: "相关记忆",
      icon: Brain,
      gradient: "from-purple-50 to-pink-50",
      border: "border-purple-200/60",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
      content: data.related_memories,
      type: "list",
    },
  ];

  return (
    <div className="space-y-4">
      {sections.map((section, idx) => {
        const Icon = section.icon;
        const isEmpty =
          section.type === "list"
            ? !Array.isArray(section.content) || section.content.length === 0
            : !section.content;

        if (isEmpty) return null;

        return (
          <motion.div
            key={section.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card
              className={`bg-gradient-to-br ${section.gradient} ${section.border} border p-5 rounded-2xl shadow-sm`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${section.iconBg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${section.iconColor}`} />
                </div>
                <h3 className="font-semibold text-slate-800 text-base">{section.title}</h3>
              </div>

              {section.type === "text" ? (
                <p className="text-slate-700 leading-relaxed text-sm whitespace-pre-wrap">
                  {section.content}
                </p>
              ) : (
                <ul className="space-y-2">
                  {section.content.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <span
                        className={`flex-shrink-0 w-5 h-5 rounded-full ${section.iconBg} ${section.iconColor} flex items-center justify-center text-xs font-semibold mt-0.5`}
                      >
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}