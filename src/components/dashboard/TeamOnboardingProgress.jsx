import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Users, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ONBOARDING_CHECKLIST = [
  {
    id: "account_setup",
    title: "账户设置",
    items: [
      { id: "profile", label: "完善个人资料", completed: true },
      { id: "avatar", label: "上传头像", completed: true },
      { id: "preferences", label: "设置偏好", completed: false },
    ]
  },
  {
    id: "first_tasks",
    title: "创建首个任务",
    items: [
      { id: "create_task", label: "创建第一个约定", completed: true },
      { id: "set_reminder", label: "设置提醒", completed: false },
      { id: "complete_task", label: "完成一个约定", completed: false },
    ]
  },
  {
    id: "team_setup",
    title: "团队协作",
    items: [
      { id: "invite_member", label: "邀请团队成员", completed: false },
      { id: "share_task", label: "分享约定", completed: false },
      { id: "team_chat", label: "使用团队评论", completed: false },
    ]
  },
  {
    id: "advanced_features",
    title: "高级功能",
    items: [
      { id: "ai_assistant", label: "试用 AI 助手", completed: false },
      { id: "voice_input", label: "使用语音输入", completed: false },
      { id: "calendar_view", label: "探索日历视图", completed: false },
    ]
  }
];

export default function TeamOnboardingProgress() {
  const [expandedSection, setExpandedSection] = useState(null);

  // Calculate overall progress
  const totalItems = ONBOARDING_CHECKLIST.reduce((sum, section) => sum + section.items.length, 0);
  const completedItems = ONBOARDING_CHECKLIST.reduce(
    (sum, section) => sum + section.items.filter(item => item.completed).length, 
    0
  );
  const progressPercentage = Math.round((completedItems / totalItems) * 100);

  return (
    <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-slate-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">团队入职进度</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {completedItems} / {totalItems} 已完成
              </p>
            </div>
          </div>
          <Badge 
            className={`${
              progressPercentage === 100 
                ? "bg-green-100 text-green-700" 
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {progressPercentage}%
          </Badge>
        </div>
        
        <Progress value={progressPercentage} className="mt-4 h-2" />
      </CardHeader>

      <CardContent className="space-y-2">
        {ONBOARDING_CHECKLIST.map((section) => {
          const sectionCompleted = section.items.filter(item => item.completed).length;
          const sectionTotal = section.items.length;
          const isExpanded = expandedSection === section.id;

          return (
            <div key={section.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                className="w-full p-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    w-8 h-8 rounded-lg flex items-center justify-center
                    ${sectionCompleted === sectionTotal 
                      ? "bg-green-100 text-green-600" 
                      : "bg-slate-100 text-slate-600"
                    }
                  `}>
                    {sectionCompleted === sectionTotal ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-semibold">{sectionCompleted}/{sectionTotal}</span>
                    )}
                  </div>
                  <span className="font-medium text-sm text-slate-800">{section.title}</span>
                </div>
                <ChevronRight 
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="px-3 pb-3 space-y-1 border-t border-slate-100">
                      {section.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50"
                        >
                          {item.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                          )}
                          <span className={`text-sm ${
                            item.completed 
                              ? "text-slate-500 line-through" 
                              : "text-slate-700"
                          }`}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}