// 协同约定「待办邀请」落地页（公开）：前情摘要 + 共识 + 推进中事项 + 与我有关的待办 + 三种回应
// 接受分工=加入成员并成为绑定子约定负责人；提出建议=留言进共同讨论；暂时无法参与=仅记录回应。
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock3,
  Flag,
  Loader2,
  MessageCircle,
  Sparkles,
  UserMinus,
  Users,
} from "lucide-react";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";

const SCENARIO_LABELS = { couple: "情侣", friends: "朋友", colleagues: "同事", custom: "协同" };
const STATUS_LABELS = { open: "待回应", accepted: "已接受分工", suggested: "已提出建议", declined: "暂时无法参与" };

export default function InviteLanding() {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestText, setSuggestText] = useState("");
  const [responding, setResponding] = useState(false);

  const load = async () => {
    try {
      const res = await httpRequest(`/api/invite/${code}`);
      setData(res);
      setError(null);
    } catch (e) {
      setError(e?.data?.message || e?.message || "邀请不存在或已失效");
    }
  };

  useEffect(() => {
    load();
    // 登录态探测（裸 fetch，避免 httpClient 对匿名 401 弹错误提示）
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${localStorage.getItem("soulsentry_access_token") || ""}` } })
      .then((r) => setLoggedIn(r.ok))
      .catch(() => setLoggedIn(false));
  }, [code]);

  const respond = async (action) => {
    if (responding) return;
    setResponding(true);
    try {
      const res = await httpRequest(`/api/invite/${code}/respond`, {
        method: "POST",
        body: { action, message: action === "suggest" ? suggestText.trim() : null },
      });
      toast.success(
        action === "accept" ? "已加入协同约定，待办已认领" : action === "suggest" ? "建议已进入共同讨论" : "已记录你的回应"
      );
      setSuggestOpen(false);
      setSuggestText("");
      setData((prev) => ({ ...prev, invite: res.invite, viewer: { ...(prev?.viewer || { is_member: action === "accept" }), responded: true, status: res.invite.status } }));
    } catch (e) {
      if (e?.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent(`/invite/${code}`)}`;
        return;
      }
      toast.error(e?.data?.message || e?.message || "回应失败，请稍后再试");
      if (e?.status === 409) load();
    } finally {
      setResponding(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6" style={{ backgroundColor: "#f1f0ec" }}>
        <p className="text-sm" style={{ color: "#77736c" }}>{error}</p>
        <a href="/" className="text-sm font-medium" style={{ color: "#384877" }}>回到心栈</a>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: "#f1f0ec" }}>
        <Loader2 className="w-5 h-5 animate-spin mr-2" style={{ color: "#77736c" }} />
        <span className="text-sm" style={{ color: "#77736c" }}>正在打开邀请…</span>
      </div>
    );
  }

  const { invite, pact, summary, consensus, progressing, next_node, todos, viewer } = data;
  const responded = viewer?.responded || invite.status !== "open";

  return (
    <div className="min-h-dvh pb-10" style={{ backgroundColor: "#f1f0ec", color: "#231f20" }}>
      {/* 顶部 */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3" style={{ backgroundColor: "#f7f6f2", borderColor: "#d5d3cc" }}>
        <a href="/" aria-label="回到心栈" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "#77736c" }}>
          <ArrowLeft className="h-4 w-4" />
        </a>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#384877" }}>心</span>
        <span className="text-sm font-semibold" style={{ color: "#35312f" }}>心栈 · 协同约定邀请</span>
        {responded && (
          <span className="ml-auto rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ backgroundColor: invite.status === "accepted" ? "#e5f1ec" : "#ecebe5", color: invite.status === "accepted" ? "#315c43" : "#77736c" }}>
            {STATUS_LABELS[invite.status]}
          </span>
        )}
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pt-5">
        {/* 约定概览 */}
        <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: "#8a867e" }}>Invitation</p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em]" style={{ color: "#302c2a" }}>{pact.title}</h1>
          {pact.goal && <p className="mt-1.5 text-[13px] leading-6" style={{ color: "#77736c" }}>{pact.goal}</p>}
          <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: "#8a867e" }}>
            <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "#eef2ff", color: "#384877" }}>{SCENARIO_LABELS[pact.scenario] || "协同"}</span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{pact.member_count} 人在协作</span>
          </div>
          <p className="mt-3 border-t pt-3 text-xs leading-5" style={{ borderColor: "#e5e4df", color: "#57534d" }}>
            <span className="font-semibold" style={{ color: "#35312f" }}>{invite.invitee_name}</span>，你好：
            {invite.note ? ` ${invite.note}。` : " 邀请你加入这个协同约定。"}
          </p>
        </section>

        {/* 30 秒前情摘要 */}
        <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ backgroundColor: "#231f20" }}>
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>Agent 的 30 秒前情摘要</h2>
          </div>
          <p className="mt-3 text-[13px] leading-6 whitespace-pre-wrap" style={{ color: "#57534d" }}>
            {summary || "摘要生成中……进入约定后 Agent 会基于讨论持续整理。"}
          </p>
        </section>

        {/* 共识 */}
        {consensus && (
          <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>已形成的共识</h2>
            <p className="mt-2.5 text-[13px] leading-6 whitespace-pre-wrap" style={{ color: "#57534d" }}>{consensus}</p>
          </section>
        )}

        {/* 推进中 + 下一节点 */}
        {(progressing.length > 0 || next_node) && (
          <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>正在推进</h2>
            <div className="mt-2.5 space-y-1.5">
              {progressing.map((p) => (
                <p key={p.id} className="flex items-center gap-2 text-[13px]" style={{ color: "#57534d" }}>
                  <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: "#384877" }} />{p.title}
                </p>
              ))}
            </div>
            {next_node && (
              <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs" style={{ borderColor: "#e5e4df", color: "#77736c" }}>
                <Flag className="h-3.5 w-3.5" style={{ color: "#384877" }} /> 下一节点：{next_node.title}
              </p>
            )}
          </section>
        )}

        {/* 与我有关的待办 */}
        <section className="rounded-2xl border p-5" style={{ borderColor: "#38487733", backgroundColor: "#fdfcf9" }}>
          <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>
            与 {invite.invitee_name} 有关的待办 · {todos.length}
          </h2>
          {todos.length === 0 ? (
            <p className="mt-2.5 text-xs" style={{ color: "#8a867e" }}>这份邀请没有绑定具体待办，加入后即可参与讨论与分工。</p>
          ) : (
            <div className="mt-2.5 space-y-2.5">
              {todos.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5">
                  {t.done
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#4b7256" }} />
                    : <Circle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#b8b4ab" }} />}
                  <div className="min-w-0">
                    <p className={`text-[13px] leading-5 ${t.done ? "line-through" : ""}`} style={{ color: t.done ? "#858179" : "#35312f" }}>{t.title}</p>
                    {t.standard && <p className="mt-0.5 text-[11px] leading-4" style={{ color: "#8a867e" }}>完成标准：{t.standard}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 回应区 */}
        <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
          {viewer?.is_member && invite.status === "accepted" ? (
            <p className="text-center text-[13px] py-1" style={{ color: "#315c43" }}>
              <CheckCircle2 className="inline h-4 w-4 mr-1 -mt-0.5" /> 你已是协同成员，待办已认领。去约定里继续推进吧～
            </p>
          ) : (
            <>
              <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>你的回应</h2>
              <p className="mt-1 text-[11px]" style={{ color: "#8a867e" }}>三种方式任选，随时可以改。</p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={responding}
                  onClick={() => respond("accept")}
                  className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "#384877" }}
                >
                  {responding ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  接受分工{loggedIn ? "" : "（需登录）"}
                </button>
                {!suggestOpen ? (
                  <button
                    type="button"
                    onClick={() => (loggedIn ? setSuggestOpen(true) : (window.location.href = `/login?redirect=${encodeURIComponent(`/invite/${code}`)}`))}
                    className="flex items-center justify-center gap-1.5 rounded-full border py-2.5 text-[13px] font-medium"
                    style={{ borderColor: "#cfcdc6", color: "#45413d" }}
                  >
                    <MessageCircle className="h-4 w-4" /> 提出建议，先不承诺
                  </button>
                ) : (
                  <div className="rounded-xl border p-3" style={{ borderColor: "#cfcdc6" }}>
                    <textarea
                      value={suggestText}
                      onChange={(e) => setSuggestText(e.target.value)}
                      placeholder="把你的想法写给协作伙伴，会进入共同讨论"
                      maxLength={500}
                      rows={3}
                      className="w-full resize-none rounded-lg bg-[#f7f6f2] p-2.5 text-[13px] outline-none"
                      style={{ border: "1px solid #cfcdc6" }}
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={responding || !suggestText.trim()}
                        onClick={() => respond("suggest")}
                        className="flex-1 rounded-full py-2 text-xs font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: "#384877" }}
                      >
                        {responding ? "发送中…" : "发送建议"}
                      </button>
                      <button type="button" onClick={() => setSuggestOpen(false)} className="flex-1 rounded-full border py-2 text-xs" style={{ borderColor: "#cfcdc6", color: "#5b5751" }}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  disabled={responding}
                  onClick={() => respond("decline")}
                  className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px]"
                  style={{ color: "#8a867e" }}
                >
                  <UserMinus className="h-4 w-4" /> 暂时无法参与
                </button>
              </div>
              {!loggedIn && (
                <p className="mt-3 flex items-center justify-center gap-1 text-[10px]" style={{ color: "#8a867e" }}>
                  <Clock3 className="h-3 w-3" /> 回应需要登录心栈账号，未登录只会先跳转到登录页
                </p>
              )}
            </>
          )}
        </section>

        <p className="pt-2 text-center font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: "#8a867e" }}>
          心栈 · 从容记录每一声心动
        </p>
      </main>
    </div>
  );
}
