// 协同约定邀请落地页（公开）：邀请概况 + 进展 + 共识 + 待办 + 三种回应
// 接受邀请=加入成员并认领待办；提出建议=留言进共同讨论；暂不参与=仅记录回应。
// 文案原则：没有内容时只留标题，有内容时只呈现内容本身，不铺解释。
import React, { useEffect, useRef, useState } from "react";
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
const STATUS_LABELS = { open: "待回应", accepted: "已接受邀请", suggested: "已建议", declined: "暂不参与" };

export default function InviteLanding() {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [accountLabel, setAccountLabel] = useState("");
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

  // 未登录点「接受/无法参与」→ 带 auto 意图跳登录页；登录回跳后自动完成该回应
  const autoAction = new URLSearchParams(window.location.search).get("auto");
  const autoFiredRef = useRef(false);

  const clearAutoParam = () => {
    window.history.replaceState(null, "", `/invite/${code}`);
  };

  const loginRedirect = (action) =>
    `/login?redirect=${encodeURIComponent(`/invite/${code}${action ? `?auto=${action}` : ""}`)}`;

  useEffect(() => {
    load();
    // 登录态探测（裸 fetch，避免 httpClient 对匿名 401 弹错误提示）
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${localStorage.getItem("soulsentry_access_token") || ""}` } })
      .then(async (r) => {
        setLoggedIn(r.ok);
        if (r.ok) {
          const u = await r.json().catch(() => null);
          const user = u?.user || u;
          setAccountLabel(user?.display_name || user?.email || user?.phone || "");
        }
      })
      .catch(() => setLoggedIn(false));
  }, [code]);

  // 登录回跳后自动完成回应：仅 accept/decline 可自动（suggest 需要填写文本，回来手动再发）
  useEffect(() => {
    if (!data || !loggedIn || autoFiredRef.current) return;
    if (autoAction !== "accept" && autoAction !== "decline") return;
    // 已是成员 / 已回应 / 邀请已关闭：清掉 auto 参数即可，不重复回应
    if (data.viewer?.is_member || data.viewer?.responded || data.invite?.status !== "open") {
      clearAutoParam();
      return;
    }
    autoFiredRef.current = true;
    respond(autoAction);
  }, [data, loggedIn]);

  const respond = async (action) => {
    if (responding) return;
    setResponding(true);
    try {
      const res = await httpRequest(`/api/invite/${code}/respond`, {
        method: "POST",
        body: { action, message: action === "suggest" ? suggestText.trim() : null },
      });
      toast.success(action === "accept" ? "已接受邀请" : action === "suggest" ? "建议已提交" : "已记录");
      setSuggestOpen(false);
      setSuggestText("");
      if (autoAction) clearAutoParam();
      setData((prev) => ({ ...prev, invite: res.invite, viewer: { ...(prev?.viewer || { is_member: action === "accept" }), responded: true, status: res.invite.status } }));
    } catch (e) {
      if (e?.status === 401) {
        // 未登录：带上本次意图跳登录页，登录回跳后由 auto 逻辑自动完成
        window.location.href = loginRedirect(action === "suggest" ? "" : action);
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

  const {
    invite,
    pact,
    summary,
    consensus,
    progressing,
    next_node,
    todos,
    viewer,
    progress = { done: 0, total: 0, percent: 0 },
    sediment = { digest: "", docs: [] },
  } = data;
  const responded = viewer?.responded || invite.status !== "open";

  return (
    <div className="min-h-dvh pb-10" style={{ backgroundColor: "#f1f0ec", color: "#231f20" }}>
      {/* 顶部 */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3" style={{ backgroundColor: "#f7f6f2", borderColor: "#d5d3cc" }}>
        <a href="/" aria-label="回到心栈" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "#77736c" }}>
          <ArrowLeft className="h-4 w-4" />
        </a>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#384877" }}>心</span>
        <span className="text-sm font-semibold" style={{ color: "#35312f" }}>协同邀请</span>
        {responded && (
          <span className="ml-auto rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ backgroundColor: invite.status === "accepted" ? "#e5f1ec" : "#ecebe5", color: invite.status === "accepted" ? "#315c43" : "#77736c" }}>
            {STATUS_LABELS[invite.status]}
          </span>
        )}
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pt-5">
        {/* 约定概览 */}
        <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
          <p className="text-[11px]" style={{ color: "#8a867e" }}>来自 {invite.inviter_name || "邀请人"}</p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-[-0.02em]" style={{ color: "#302c2a" }}>{pact.title}</h1>
          {pact.goal && <p className="mt-1.5 text-[13px] leading-6" style={{ color: "#77736c" }}>{pact.goal}</p>}
          <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: "#8a867e" }}>
            <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "#eef2ff", color: "#384877" }}>{SCENARIO_LABELS[pact.scenario] || "协同"}</span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{pact.member_count} 人</span>
          </div>
          {invite.note && (
            <div className="mt-4 rounded-xl border p-3.5" style={{ borderColor: "#dbe3f2", backgroundColor: "#eef2ff80" }}>
              <p className="text-[13px] leading-6" style={{ color: "#35312f" }}>{invite.note}</p>
            </div>
          )}
        </section>

        {/* AI 邀请概况 */}
        <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ backgroundColor: "#384877" }}>
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>邀请概况</h2>
          </div>
          {summary && (
            <p className="mt-3 text-[13px] leading-6 whitespace-pre-wrap" style={{ color: "#57534d" }}>{summary}</p>
          )}
        </section>

        {/* 当前进展：子约定 + 下一节点 */}
        <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>当前进展</h2>
            <span className="text-[11px]" style={{ color: "#8a867e" }}>{progress.done}/{progress.total} 项子约定</span>
          </div>
          {progress.total > 0 && (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "#e5e4df" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progress.percent}%`, backgroundColor: "#384877" }} />
            </div>
          )}
          {progressing.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {progressing.map((p) => (
                <p key={p.id} className="flex items-center gap-2 text-[13px]" style={{ color: "#57534d" }}>
                  <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: "#384877" }} />{p.title}
                </p>
              ))}
            </div>
          )}
          {next_node && (
            <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs" style={{ borderColor: "#e5e4df", color: "#77736c" }}>
              <Flag className="h-3.5 w-3.5" style={{ color: "#384877" }} /> 下一节点：{next_node.title}
            </p>
          )}
        </section>

        {/* 已沉淀：执行概览 + 最近文件 */}
        {(sediment.digest || (sediment.docs && sediment.docs.length > 0)) && (
          <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>沉淀</h2>
            {sediment.digest && (
              <p className="mt-2.5 text-[13px] leading-6 whitespace-pre-wrap" style={{ color: "#57534d" }}>{sediment.digest}</p>
            )}
            {sediment.docs?.length > 0 && (
              <div className="mt-3 space-y-2">
                {sediment.docs.map((doc, index) => (
                  <div key={`${doc.title}-${index}`} className="rounded-lg px-3 py-2" style={{ backgroundColor: "#f4f2ec" }}>
                    <p className="text-[12px] font-medium" style={{ color: "#35312f" }}>{doc.title}</p>
                    {doc.excerpt && <p className="mt-0.5 text-[11px] leading-4" style={{ color: "#77736c" }}>{doc.excerpt}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 共识 */}
        {consensus && (
          <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>共识</h2>
            <p className="mt-2.5 text-[13px] leading-6 whitespace-pre-wrap" style={{ color: "#57534d" }}>{consensus}</p>
          </section>
        )}

        {/* 与我有关的待办 */}
        <section className="rounded-2xl border p-5" style={{ borderColor: "#38487733", backgroundColor: "#fdfcf9" }}>
          <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>相关待办 · {todos.length}</h2>
          {todos.length > 0 && (
            <div className="mt-2.5 space-y-2.5">
              {todos.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5">
                  {t.done
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#4b7256" }} />
                    : <Circle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#b8b4ab" }} />}
                  <div className="min-w-0">
                    <p className={`text-[13px] leading-5 ${t.done ? "line-through" : ""}`} style={{ color: t.done ? "#858179" : "#35312f" }}>{t.title}</p>
                    {t.standard && <p className="mt-0.5 text-[11px] leading-4" style={{ color: "#8a867e" }}>{t.standard}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 回应区 */}
        <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
          {viewer?.is_member && invite.status === "accepted" ? (
            <div className="py-1 text-center">
              <p className="inline-flex items-center gap-1 text-[13px]" style={{ color: "#315c43" }}>
                <CheckCircle2 className="h-4 w-4" /> 已加入协同
              </p>
              {accountLabel && (
                <p className="mt-1 text-[10px]" style={{ color: "#8a867e" }}>当前账号：{accountLabel}</p>
              )}
            </div>
          ) : (
            <>
              <h2 className="text-sm font-semibold" style={{ color: "#302c2a" }}>你的回应</h2>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={responding}
                  onClick={() => respond("accept")}
                  className="flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "#384877" }}
                >
                  {responding ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  接受邀请{loggedIn ? "" : " · 需登录"}
                </button>
                {!suggestOpen ? (
                  <button
                    type="button"
                    onClick={() => (loggedIn ? setSuggestOpen(true) : (window.location.href = loginRedirect("")))}
                    className="flex items-center justify-center gap-1.5 rounded-full border py-2.5 text-[13px] font-medium"
                    style={{ borderColor: "#cfcdc6", color: "#45413d" }}
                  >
                    <MessageCircle className="h-4 w-4" /> 提出建议
                  </button>
                ) : (
                  <div className="rounded-xl border p-3" style={{ borderColor: "#cfcdc6" }}>
                    <textarea
                      value={suggestText}
                      onChange={(e) => setSuggestText(e.target.value)}
                      placeholder="写下你的建议"
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
                        {responding ? "发送中…" : "发送"}
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
                  <UserMinus className="h-4 w-4" /> 暂不参与
                </button>
              </div>
              {!loggedIn && (
                <p className="mt-3 flex items-center justify-center gap-1 text-[10px]" style={{ color: "#8a867e" }}>
                  <Clock3 className="h-3 w-3" /> 回应需登录
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
