import React from "react";
import { Link } from "react-router-dom";
import { Mail, MessageSquarePlus, Bell } from "lucide-react";

export default function Contact() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F7F4EF] to-white">
      <div className="max-w-3xl mx-auto px-5 py-12 md:py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-slate-900">心栈 SoulSentry</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">联系我们</h1>
        <p className="text-[15px] leading-relaxed text-slate-700 mb-8">
          无论是使用问题、功能建议还是合作洽谈，我们都很乐意听到你的声音，通常会在 1–2 个工作日内回复。
        </p>

        <div className="space-y-4">
          <a
            href="mailto:support@xinzhan-soulsentry.com"
            className="flex items-center gap-4 rounded-3xl bg-white border border-[#EAE5DD] p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#6B8E23]/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-[#6B8E23]" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">邮件联系</p>
              <p className="text-sm text-slate-600">support@xinzhan-soulsentry.com</p>
            </div>
          </a>

          <div className="flex items-center gap-4 rounded-3xl bg-white border border-[#EAE5DD] p-5 shadow-sm">
            <div className="w-11 h-11 rounded-2xl bg-[#384877]/10 flex items-center justify-center">
              <MessageSquarePlus className="w-5 h-5 text-[#384877]" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">应用内反馈</p>
              <p className="text-sm text-slate-600">登录后在左侧栏点击「反馈」，可直接提交建议与问题。</p>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap gap-5 text-sm">
          <Link to="/" className="text-[#384877] font-medium hover:underline">返回首页</Link>
          <Link to="/about" className="text-[#384877] font-medium hover:underline">关于我们</Link>
        </div>
      </div>
    </div>
  );
}