import React from "react";
import { Link } from "react-router-dom";
import { Heart, Bell, Sparkles, ShieldCheck } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F7F4EF] to-white">
      <div className="max-w-3xl mx-auto px-5 py-12 md:py-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-slate-900">心栈 SoulSentry</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
          关于心栈 SoulSentry
        </h1>

        <div className="space-y-5 text-[15px] leading-relaxed text-slate-700">
          <p>
            心栈（SoulSentry）是一款以「AI 第二外脑」为核心的智能日程与心灵文件管理应用。它把你脑子里零散的念头、承诺、待办与灵感，用一句自然语言就收进来，再由 AI 自动解析出时间、优先级与情境，替你安排提醒、拆解步骤，并在合适的时间、合适的设备上把它送到你眼前。你不需要学习复杂的项目管理方法，只需要像跟朋友说话一样把事情说出来。
          </p>
          <p>
            除了日程与约定，心栈还提供「心签」——一个安放心情、灵感、会议记录与转发内容的心灵文件存放站。AI 会为偏感性的记录写下一封温暖的回应，也会把资料类内容整理成可检索的知识；随着使用时间变长，它会归纳出属于你的重复套路与个人模板，越用越懂你。自动执行模块还能替你预先生成邮件草稿、调研长文、演示文稿与账目整理，你只需要验收。
          </p>
          <p>
            心栈适合被琐事切碎注意力的知识工作者、需要跨手机与电脑协同的自由职业者、习惯用文字记录生活的写作者，也适合任何希望有人在背后温柔提醒自己的人。你还可以把一条约定或心签分享给伙伴，对方无需注册即可查看进度、勾选子约定与留言，让协作变得毫无门槛。
          </p>
          <p>
            心栈由一支专注于个人效率与 AI 记忆系统的独立产品团队打造，我们坚持数据归属用户本人、提醒不打扰、AI 只在被需要时出现。产品持续迭代，欢迎你把想法告诉我们。
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          {[
            { icon: Sparkles, title: "AI 智能解析", desc: "一句话生成约定、时间与提醒策略" },
            { icon: Heart, title: "心签陪伴", desc: "记录心情与灵感，收到温暖回应" },
            { icon: ShieldCheck, title: "隐私优先", desc: "数据归你所有，提醒不打扰" },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl bg-white border border-[#EAE5DD] p-5 shadow-sm">
              <f.icon className="w-5 h-5 text-[#6B8E23] mb-3" />
              <p className="font-semibold text-slate-900 mb-1">{f.title}</p>
              <p className="text-sm text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-5 text-sm">
          <Link to="/" className="text-[#384877] font-medium hover:underline">返回首页</Link>
          <Link to="/contact" className="text-[#384877] font-medium hover:underline">联系我们</Link>
        </div>
      </div>
    </div>
  );
}