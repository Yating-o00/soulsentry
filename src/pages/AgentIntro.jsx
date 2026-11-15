import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import Orb from "@/components/buddy/Orb";
import { PERSONAS, DEFAULT_PERSONA } from "@/lib/buddies";

// 注册完成 → 通用 Agent 介绍页：个性化摘要 + 说/记/办/找 四能力卡 + 两个出口
const CAPS = [
  { icon: "说", title: "说事", desc: "立约定、做计划、拉人建协同约定" },
  { icon: "记", title: "记事", desc: "心签、协同沉淀、自动生成的简报" },
  { icon: "办", title: "办事", desc: "浏览器小助手替你查信息、办网页上的事" },
  { icon: "找", title: "找搭子", desc: "学习 / 旅游 / 读书 / 早起，专业搭子长期陪跑" },
];

export default function AgentIntro() {
  const navigate = useNavigate();
  const { data: mine } = useQuery({
    queryKey: ["buddies", "mine"],
    queryFn: () => httpRequest("/api/buddies/mine"),
  });
  const profile = mine?.id_profile;
  const personaName =
    PERSONAS.find((p) => p.key === (mine?.persona || DEFAULT_PERSONA))?.name || "温柔陪伴型";

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col items-center px-7 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center w-full max-w-md text-center">
        <Orb size={88} />
        <h1 className="mt-5 text-xl font-semibold text-[#1c1917]">我是心栈，你的通用 Agent</h1>
        {profile && (
          <p className="mt-2.5 text-[13px] leading-relaxed text-[#57534e]">
            {profile.age} · 喜欢{(profile.likes || []).slice(0, 3).join("、") || "很多事"} ·
            想要「{(profile.wants || [])[0] ?? "陪伴"}」——
            <br />
            我会用{personaName}的方式陪你。
          </p>
        )}
        <p className="mt-2 text-[13px] leading-relaxed text-[#a8a29e]">
          不用先认领搭子，直接跟我说事就行。
        </p>

        <div className="mt-6 w-full space-y-2">
          {CAPS.map((c) => (
            <div
              key={c.title}
              className="flex items-center gap-3 rounded-2xl bg-[#FFFFFF] p-3.5 text-left shadow-[0_1px_2px_rgba(36,36,36,0.06)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#384877] text-sm text-[#FAF9F7]">
                {c.icon}
              </span>
              <div>
                <span className="text-[14px] font-medium text-[#1c1917]">{c.title}</span>
                <span className="ml-2 text-[12px] text-[#a8a29e]">{c.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md space-y-2.5">
        <button
          onClick={() => navigate(createPageUrl("Dashboard"))}
          className="min-h-[50px] w-full rounded-full bg-[#384877] text-[15px] font-medium text-[#FAF9F7] transition-transform active:scale-[0.98]"
        >
          直接和心栈聊聊
        </button>
        <button
          onClick={() => navigate(createPageUrl("BuddyStore"))}
          className="min-h-[50px] w-full rounded-full border border-[#e7e5e4] text-[15px] font-medium text-[#57534e] transition-colors hover:border-[#384877] hover:text-[#384877] active:scale-[0.98]"
        >
          去搭子Store挑一颗
        </button>
      </div>
    </div>
  );
}
