import React from "react";
import { Bookmark, Sparkles } from "lucide-react";
import { useBuddyState } from "./shared";
import BuddyChatPanel from "./BuddyChatPanel";

function CustomArtifact({ profile, buddy, state, tint }) {
  const captures = Array.isArray(state.captures) ? [...state.captures].reverse().slice(0, 4) : [];
  const planLines = Array.isArray(profile?.plan_lines) ? profile.plan_lines : [];
  const title = profile?.plan_title || buddy?.name || "搭子手记";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] tracking-widest text-stone-400">搭子手记</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-stone-400">
          <Sparkles className="h-3 w-3" /> 自动整理
        </span>
      </div>

      <div className="mt-2 max-h-[min(230px,29dvh)] space-y-2 overflow-y-auto pr-1">
        <div
          className="rounded-xl px-3 py-2.5"
          style={{ background: `linear-gradient(135deg, ${tint[0]} 0%, #ffffff 78%)` }}
        >
          <h3 className="text-[15px] font-semibold text-stone-900">{title}</h3>
          {planLines.length > 0 ? (
            <div className="mt-1 space-y-0.5">
              {planLines.slice(0, 3).map((line) => (
                <p key={line} className="text-[10px] leading-relaxed text-stone-600">
                  · {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[10px] leading-relaxed text-stone-600">
              聊两句，我会把关键信息整理在这里，下一次接着用。
            </p>
          )}
        </div>

        <div className="rounded-xl border border-stone-100 bg-[#FAF9F7] p-2.5">
          <div className="flex items-center justify-between text-[10px] text-stone-500">
            <span>最近手记</span>
            <span>{captures.length > 0 ? `${captures.length} 条` : "还没有"}</span>
          </div>
          {captures.length > 0 ? (
            <div className="mt-1.5 space-y-1.5">
              {captures.map((item, index) => (
                <div key={item.id || `${item.day}-${index}`} className="flex gap-2">
                  <Bookmark className="mt-0.5 h-3 w-3 shrink-0 text-stone-300" />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate text-[10px] font-medium text-stone-700">
                        {item.topic || item.text || "一条记录"}
                      </span>
                      {item.day && <span className="shrink-0 text-[8px] text-stone-400">{String(item.day).slice(5)}</span>}
                    </div>
                    {item.text && item.topic && (
                      <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-stone-500">{item.text}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-[10px] leading-relaxed text-stone-400">
              在下面聊天框说一句，手记会自动出现在这里。
            </p>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-[9px] leading-relaxed text-stone-400">
        只需要一个聊天框：说目标、记进度、调整节奏，都直接说。
      </p>
    </div>
  );
}

/**
 * 自定义搭子第一栏：聊天 + 聊天内的搭子手记。
 * 用户自定义的搭子没有固定表单，所有内容都通过对话生成，手记卡实时整理关键信息。
 */
export default function CustomChatPanel({ buddy, profile, tint, projectTask = null }) {
  const { state } = useBuddyState(buddy.id);
  return (
    <BuddyChatPanel
      buddy={buddy}
      profile={profile}
      tint={tint}
      projectTask={projectTask}
      artifacts={<CustomArtifact profile={profile} buddy={buddy} state={state} tint={tint} />}
    />
  );
}
