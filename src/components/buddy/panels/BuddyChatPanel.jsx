import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Paperclip, Users2, X } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { BuddyMsg, useBuddyAgent, useBuddyState, todayKey } from "./shared";
import { PERSONAS, DEFAULT_PERSONA } from "@/lib/buddies";
import {
  activeInjuries,
  computeRunningStats,
  getRunningStatus,
  latestBody,
} from "@/lib/running";

/**
 * 问搭子（每颗搭子空间的专业对话）：不是模板——
 * 每日开场白由 AI 按用户当下真实状态生成（每天一条，不重样）；
 * 自由提问由搭子的人格 + 领域专业知识 + 领域档案 + 实时上下文回答。
 * 对话历史持久化在搭子板块状态里（本搭子可见，跨搭子隔离）。
 */
export default function BuddyChatPanel({ buddy, profile, tint, projectTask }) {
  const { call } = useBuddyAgent(buddy.id);
  const { state, patch } = useBuddyState(buddy.id);
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [switchingPersona, setSwitchingPersona] = useState(null);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const greetedRef = useRef(false);

  // 每颗搭子独立人格：未单独设置时用搭子类型的默认人格
  const activePersonaKey = profile?.persona || buddy.defaultPersona || DEFAULT_PERSONA;
  const activePersona = PERSONAS.find((p) => p.key === activePersonaKey) || PERSONAS[0];

  const chat = useMemo(() => (Array.isArray(state.chat) ? state.chat : []), [state.chat]);
  const today = todayKey();

  // 搭子此刻掌握的真实上下文（每日问候与回答都基于它，而不是套话）
  const context = useMemo(() => {
    const a = profile?.answers || {};
    const bits = [
      `今天是 ${today}`,
      profile?.plan_title ? `正在推进的项目：${profile.plan_title}` : null,
      Object.keys(a).length > 0 ? `认领时说的：${Object.values(a).join("；")}` : null,
      projectTask ? `项目约定「${projectTask.title}」今日状态：${projectTask.done_today || projectTask.status === "completed" ? "已完成" : "待赴约"}` : null,
    ];
    // 领域特有上下文
    if (buddy.id === "reading" && state.mins?.[today]) bits.push(`今日已读 ${state.mins[today]} 分钟`);
    if (buddy.id === "travel" && state.itinerary?.days) bits.push(`行程已排好 ${state.itinerary.days.length} 天`);
    if (buddy.id === "study" && state.weekly?.done_count != null) bits.push(`本周已打卡 ${state.weekly.done_count}/7 天`);
    if (buddy.id === "running") {
      const rs = getRunningStatus(profile?.answers || {}, profile, state);
      const stats = computeRunningStats(state);
      const injuries = activeInjuries(state);
      const body = latestBody(state);
      bits.push(
        `今天课表：${rs.todaySession.title}${rs.todaySession.km ? ` ${rs.todaySession.km} km` : ""}；本周完成 ${rs.doneDays.length}/${rs.runDays.length} 次，累计 ${Math.round(stats.totalKm)} km`
      );
      if (injuries.length > 0) bits.push(`在跟踪伤病：${injuries.map((i) => i.area).join("、")}`);
      if (body?.fatigue) bits.push(`最近疲劳 ${body.fatigue}/5，睡眠 ${body.sleep_h || "未记录"} 小时`);
    }
    return bits.filter(Boolean).join("；");
  }, [buddy.id, profile, projectTask, state, today]);

  // 每日开场白：AI 按上下文生成，每天一条
  useEffect(() => {
    if (greetedRef.current || !profile) return;
    greetedRef.current = true;
    if (state.greeting?.date === today && chat.length > 0) return; // 今天已问候过
    (async () => {
      try {
        const data = await call({ mode: "greeting", payload: { context } });
        const text = String(data?.text || "").trim();
        if (!text) return;
        const msg = { role: "buddy", content: text, at: new Date().toISOString() };
        patch({ greeting: { date: today, text }, chat: [...chat.slice(-39), msg] });
      } catch (_e) {
        // 问候失败不打扰，静态问候仍在页头
      }
    })();
  }, [profile]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [chat.length, sending]);

  const handleFiles = async (fileList) => {
    const room = 3 - attachments.length;
    if (room <= 0) {
      toast.info("最多随一条消息发送 3 个附件");
      return;
    }
    const files = Array.from(fileList || []).slice(0, room);
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`「${file.name}」超过 20MB，暂时不能上传`);
        continue;
      }
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await httpRequest("/api/uploads", { method: "POST", body: formData });
        setAttachments((cur) => [...cur, {
          url: res.file_url,
          name: res.file_name,
          type: res.file_type,
          size: res.file_size,
        }].slice(0, 3));
      } catch (error) {
        toast.error(error?.message || `「${file.name}」上传失败`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || sending || uploading) return;
    const sentAttachments = attachments;
    setInput("");
    setAttachments([]);
    setSending(true);
    const userMsg = {
      role: "user",
      content: text || (sentAttachments.some((a) => (a.type || "").startsWith("image/")) ? "（图片）" : "（文件）"),
      at: new Date().toISOString(),
      ...(sentAttachments.length > 0 ? { attachments: sentAttachments } : {}),
    };
    const base = [...chat, userMsg];
    patch({ chat: base.slice(-40) });
    try {
      const history = base.slice(-10).map((m) => ({ role: m.role === "user" ? "user" : "buddy", content: m.content }));
      const data = await call({
        mode: "chat",
        payload: {
          messages: history,
          context,
          ...(sentAttachments.length > 0 ? { attachments: sentAttachments } : {}),
        },
      });
      const reply = String(data?.reply || "").trim();
      if (reply) {
        const proposal = data?.proposal?.type === "create_collab" ? data.proposal : null;
        const replyMsg = {
          role: "buddy",
          content: reply,
          at: new Date().toISOString(),
          ...(proposal ? { proposal } : {}),
        };
        patch({ chat: [...base, replyMsg].slice(-40) });
      }
    } catch (_e) {
      patch({
        chat: [...base, { role: "buddy", content: "我走神了一下…再说一次好吗？", at: new Date().toISOString() }].slice(-40),
      });
    } finally {
      setSending(false);
    }
  };

  // 切换这颗搭子的陪伴人格：只影响本搭子，不动全局小助手人格
  const switchPersona = async (key) => {
    if (!key || key === activePersonaKey || switchingPersona) return;
    setSwitchingPersona(key);
    try {
      await httpRequest(`/api/buddies/${buddy.id}/persona`, { method: "POST", body: { persona: key } });
      queryClient.setQueryData(["buddies", "mine"], (old) => {
        if (!old?.buddies?.[buddy.id]) return old;
        return {
          ...old,
          buddies: { ...old.buddies, [buddy.id]: { ...old.buddies[buddy.id], persona: key } },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["buddies", "mine"] });
      const label = PERSONAS.find((p) => p.key === key)?.name || "新的陪伴方式";
      toast.success(`${buddy.name}已切换为${label}`);
    } catch (error) {
      toast.error(error?.message || "切换人格失败，再试一次");
    } finally {
      setSwitchingPersona(null);
    }
  };

  // 对话里的协同小组提案：确认后直接创建一场归属本搭子的协同约定
  const createGroup = async (proposal, index) => {
    if (!proposal || creatingProposal) return;
    setCreatingProposal(true);
    try {
      await httpRequest("/api/tasks", {
        method: "POST",
        body: {
          title: proposal.title,
          description: proposal.goal || "",
          category: "collab",
          status: "pending",
          priority: "medium",
          metadata: {
            collab: {
              scenario: proposal.scenario || "friends",
              goal: proposal.goal || "",
              agent: { enabled: true, paused: false },
              confirmRule: proposal.scenario === "couple" ? "all" : "owner",
            },
            _extraFields: { buddy_id: buddy.id },
          },
        },
      });
      const next = chat.map((m, i) =>
        i === index ? { ...m, proposal: { ...m.proposal, created: true } } : m
      );
      patch({ chat: next });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`协同小组「${proposal.title}」已创建，去协同页邀请伙伴`);
    } catch (error) {
      toast.error(error?.message || "创建失败，再试一次");
    } finally {
      setCreatingProposal(false);
    }
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[11px] tracking-widest text-stone-400">问{buddy.name}</span>
        <span className="text-[10px] text-stone-300">专业问题，随时问</span>
      </div>

      {/* 陪伴人格：对话前先设定，后续对话与协同都按它来 */}
      <div className="mt-2.5 rounded-xl bg-[#FAF9F7] px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[10px] tracking-widest text-stone-400">陪伴方式</span>
          {PERSONAS.map((p) => {
            const active = p.key === activePersonaKey;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => switchPersona(p.key)}
                disabled={!!switchingPersona}
                aria-pressed={active}
                title={p.desc}
                className={`inline-flex min-h-[28px] items-center gap-1 rounded-full px-2.5 text-[11px] transition-colors disabled:opacity-60 ${
                  active
                    ? "bg-[#384877] font-medium text-white"
                    : "border border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700"
                }`}
              >
                {switchingPersona === p.key && <Loader2 className="h-3 w-3 animate-spin" />}
                {p.short || p.name}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-stone-400">
          {activePersona.desc} · 只影响这颗搭子
        </p>
      </div>

      {chat.length > 0 && (
        <div ref={scrollRef} className="mt-3 max-h-[320px] space-y-3 overflow-y-auto pr-1">
          {chat.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#384877] px-3.5 py-2.5 text-[14px] leading-relaxed text-[#FAF9F7]">
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  {(m.attachments || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(m.attachments || []).map((att, ai) =>
                        (att.type || "").startsWith("image/") ? (
                          <a key={att.url || ai} href={att.url} target="_blank" rel="noreferrer" className="block" title="点击查看原图">
                            <img
                              src={att.url}
                              alt={att.name || "图片"}
                              className="max-h-60 w-auto max-w-full rounded-lg border border-white/20 bg-white/10 object-contain"
                            />
                          </a>
                        ) : (
                          <a
                            key={att.url || ai}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-[180px] items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[11px]"
                          >
                            <FileText className="h-3 w-3 shrink-0" />
                            <span className="truncate">{att.name || "文件"}</span>
                          </a>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div key={i}>
                <BuddyMsg tint={tint}>{m.content}</BuddyMsg>
                {m.proposal && (
                  <div className="ml-10 mt-2 rounded-2xl border border-[#c9d5ef] bg-[#eef2ff]/60 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#384877]">
                      <Users2 className="w-3.5 h-3.5" /> 协同小组提案
                    </div>
                    <p className="mt-1 text-sm font-semibold text-stone-800">{m.proposal.title}</p>
                    {m.proposal.goal && (
                      <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{m.proposal.goal}</p>
                    )}
                    {m.proposal.created ? (
                      <p className="mt-2 text-xs font-medium text-emerald-600">✓ 已创建，去「协同」页邀请伙伴</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => createGroup(m.proposal, i)}
                        disabled={creatingProposal}
                        className="mt-2 min-h-[36px] w-full rounded-full bg-[#384877] text-xs font-medium text-white disabled:opacity-50"
                      >
                        {creatingProposal ? "正在创建…" : "创建协同小组"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          )}
          {sending && (
            <div className="flex items-center gap-2 pl-10 text-xs text-stone-400">
              <Loader2 className="w-3 h-3 animate-spin" /> {buddy.name}正在看你的真实进度…
            </div>
          )}
        </div>
      )}

      {chat.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(QUICK_ASKS[buddy.id] || []).map((q) => (
            <button
              key={q}
              onClick={() => {
                setInput(q);
              }}
              className="min-h-[32px] rounded-full border border-stone-200 px-3 text-xs text-stone-500 transition-colors hover:border-stone-400"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {attachments.map((att, index) => (
            <div key={`${att.url}-${index}`} className="relative">
              {(att.type || "").startsWith("image/") ? (
                <a href={att.url} target="_blank" rel="noreferrer" className="block" title="点击查看原图">
                  <img
                    src={att.url}
                    alt={att.name || "图片"}
                    className="h-28 w-28 rounded-xl border border-stone-200 bg-[#FAF9F7] object-contain"
                  />
                </a>
              ) : (
                <span className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border border-stone-200 bg-[#FAF9F7] px-2.5 py-1.5 text-[11px] text-stone-600">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{att.name || "文件"}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setAttachments((cur) => cur.filter((_, i) => i !== index))}
                aria-label="移除附件"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-stone-700 text-white shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex min-h-[42px] flex-1 items-center gap-1 rounded-full border border-stone-200 bg-[#FAF9F7] pl-1.5 pr-3 focus-within:border-stone-400">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || attachments.length >= 3}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:text-stone-600 disabled:opacity-50"
            title="添加图片或文件"
            aria-label="添加图片或文件"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files || []);
              if (files.length > 0) {
                e.preventDefault();
                handleFiles(files);
              }
            }}
            placeholder={`问点专业的，也可以粘贴图片/文件，比如「${QUICK_ASKS[buddy.id]?.[0] || "怎么坚持下去"}」`}
            className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-stone-800 placeholder:text-stone-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={(!input.trim() && attachments.length === 0) || sending || uploading}
          className="min-h-[42px] rounded-full px-4 text-sm font-medium text-white transition-transform active:scale-95 disabled:opacity-50"
          style={{ background: tint[2] }}
        >
          发送
        </button>
      </form>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </section>
  );
}

const QUICK_ASKS = {
  study: ["这道题怎么入手？", "背了就忘怎么办？", "帮我拆一下这周的目标"],
  travel: ["当地有什么坑要避？", "帮我看看行程合理吗", "预算大概要多少？"],
  reading: ["这本书值不值得读？", "读不进去怎么办？", "给我抛个问题吧"],
  morning: ["总是赖床怎么办？", "几点睡才够？", "周末要不要补觉？"],
  running: ["今天状态一般，怎么调课？", "膝盖有点疼怎么办？", "帮我看看这周跑量合理吗"],
};
