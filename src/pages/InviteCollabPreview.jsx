// 受邀访客的协同约定只读预览：扫码 → 接受邀请 → 先看内容，参与操作时再注册/登录
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  Lock,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { httpRequest } from "@/api/httpClient";

const BUDDY_NAMES = { study: "学习搭子", travel: "旅游搭子", reading: "读书搭子", morning: "早起搭子", running: "跑步搭子" };
const SCENARIO_LABELS = { couple: "情侣", friends: "朋友", colleagues: "同事", custom: "协同" };

const fmtTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function InviteCollabPreview() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const acceptedFromLanding = Boolean(location.state?.accepted);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pacts");
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    httpRequest(`/api/invite/${code}`)
      .then((res) => {
        if (alive) {
          setData(res);
          setError("");
        }
      })
      .catch((err) => {
        if (alive) setError(err?.data?.message || err?.message || "邀请不存在或已失效");
      });
    return () => {
      alive = false;
    };
  }, [code]);

  const docs = data?.sediment?.docs || [];
  const pacts = data?.pacts || [];
  const discussion = data?.discussion || [];
  const progress = data?.progress || { done: 0, total: 0, percent: 0 };
  const tabs = useMemo(
    () => [
      { key: "pacts", label: `约定 ${pacts.length}` },
      { key: "discussion", label: "讨论" },
      { key: "knowledge", label: `沉淀 ${docs.length + (data?.sediment?.digest ? 1 : 0)}` },
    ],
    [pacts.length, discussion.length, docs.length, data?.sediment?.digest]
  );

  const isMember = !!data?.viewer?.is_member;
  const isLoggedIn = !!data?.viewer;

  const openCollab = () => {
    const taskId = data?.task_id || data?.pact?.task_id;
    if (!taskId) return;
    const params = new URLSearchParams({ taskId });
    if (data?.buddy_id) {
      params.set("from", "buddy");
      params.set("buddy", data.buddy_id);
      params.set("collab", taskId);
    }
    navigate(`/collabspace?${params.toString()}`);
  };

  const onParticipate = () => {
    if (isMember) openCollab();
    else setGateOpen(true);
  };

  const goAuth = () => {
    if (isLoggedIn) {
      navigate(`/invite/${code}`);
      return;
    }
    window.location.href = `/login?redirect=${encodeURIComponent(`/invite/${code}?auto=accept`)}`;
  };

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6" style={{ backgroundColor: "#f1f0ec" }}>
        <p className="text-sm" style={{ color: "#77736c" }}>{error}</p>
        <button type="button" onClick={() => navigate(`/invite/${code}`)} className="text-sm font-medium" style={{ color: "#384877" }}>
          返回邀请页
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ backgroundColor: "#f1f0ec" }}>
        <Loader2 className="mr-2 h-5 w-5 animate-spin" style={{ color: "#77736c" }} />
        <span className="text-sm" style={{ color: "#77736c" }}>正在打开协同约定…</span>
      </div>
    );
  }

  const buddyName = BUDDY_NAMES[data.buddy_id] || data.buddy_name || "";
  const pact = data.pact || {};

  return (
    <div className="min-h-dvh pb-10" style={{ backgroundColor: "#f1f0ec", color: "#231f20" }}>
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3" style={{ backgroundColor: "#f7f6f2", borderColor: "#d5d3cc" }}>
        <button type="button" aria-label="返回邀请页" onClick={() => navigate(`/invite/${code}`)} className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "#77736c" }}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: "#384877" }}>心</span>
        <span className="text-sm font-semibold" style={{ color: "#35312f" }}>协同约定</span>
        <span className="ml-auto rounded-full bg-[#ecebe5] px-2.5 py-1 text-[10px]" style={{ color: "#77736c" }}>只读预览</span>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pt-5">
        <section className="rounded-2xl border p-5" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
          <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "#8a867e" }}>
            {buddyName && <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "#eef2ff", color: "#384877" }}>{buddyName}</span>}
            <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "#f0ece2", color: "#6f6a61" }}>
              {SCENARIO_LABELS[pact.scenario] || "协同"}
            </span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{pact.member_count || 1} 人</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-[-0.02em]" style={{ color: "#302c2a" }}>{pact.title}</h1>
          {pact.goal && <p className="mt-1.5 text-[13px] leading-6" style={{ color: "#77736c" }}>{pact.goal}</p>}
          <div className="mt-4 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "#e5e4df" }}>
              <div className="h-full rounded-full" style={{ width: `${progress.percent}%`, backgroundColor: "#384877" }} />
            </div>
            <span className="text-[10px] tabular-nums" style={{ color: "#8a867e" }}>{progress.done}/{progress.total}</span>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: "#eef2ff80" }}>
            <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: "#384877" }} />
            <p className="text-[11px] leading-4" style={{ color: "#57534d" }}>
              {isMember
                ? "你已是协同成员，进入协同空间即可参与。"
                : acceptedFromLanding
                  ? "已接受邀请。注册后可参与讨论、确认约定与认领待办。"
                  : isLoggedIn
                    ? "接受邀请后即可参与讨论、确认约定与认领待办。"
                    : "预览模式。注册后可参与讨论、确认约定与认领待办。"}
            </p>
          </div>
          <button
            type="button"
            onClick={onParticipate}
            className="mt-3 w-full rounded-full py-2.5 text-[13px] font-medium text-white"
            style={{ backgroundColor: "#384877" }}
          >
            {isMember ? "进入协同空间" : isLoggedIn ? "接受邀请后参与协作" : "注册 / 登录后参与协作"}
          </button>
        </section>

        <div className="grid grid-cols-3 gap-1 rounded-full p-1" style={{ backgroundColor: "#e9e6dd" }} role="tablist" aria-label="协同内容">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className="min-h-[34px] rounded-full text-[12px] transition-colors"
              style={tab === item.key
                ? { backgroundColor: "#fdfcf9", color: "#302c2a", fontWeight: 600, boxShadow: "0 1px 2px rgba(36,36,36,0.06)" }
                : { color: "#77736c" }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "pacts" && (
          <section className="space-y-2.5">
            {data.summary && (
              <div className="rounded-2xl border p-4" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
                <p className="text-[11px] font-medium" style={{ color: "#384877" }}>邀请概况</p>
                <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5" style={{ color: "#57534d" }}>{data.summary}</p>
              </div>
            )}
            {pacts.length === 0 ? (
              <div className="rounded-2xl border p-6 text-center text-xs" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9", color: "#8a867e" }}>
                暂无约定
              </div>
            ) : (
              pacts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={onParticipate}
                  className="flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left"
                  style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}
                >
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ color: "#4b7256" }} />
                  ) : (
                    <Circle className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ color: item.draft ? "#b07818" : "#b8b4ab" }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={item.done ? "text-[13.5px] leading-5 line-through" : "text-[13.5px] font-medium leading-5"} style={{ color: item.done ? "#9a9488" : "#35312f" }}>
                        {item.title}
                      </span>
                      {item.draft && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700">待确认</span>}
                    </span>
                    {item.standard && <span className="mt-0.5 block text-[11px] leading-4" style={{ color: "#8a867e" }}>{item.standard}</span>}
                  </span>
                </button>
              ))
            )}
          </section>
        )}

        {tab === "discussion" && (
          <section className="rounded-2xl border" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
            <div className="max-h-[52vh] space-y-4 overflow-y-auto p-4">
              {discussion.length === 0 ? (
                <p className="py-8 text-center text-xs" style={{ color: "#8a867e" }}>暂无讨论</p>
              ) : (
                discussion.map((message) => (
                  <div key={message.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: message.agent ? "#384877" : "#8a867e" }}>
                      {message.agent ? <Sparkles className="h-3.5 w-3.5" /> : (message.author || "成").slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "#9a9488" }}>
                        <span className="font-medium" style={{ color: message.agent ? "#384877" : "#57534d" }}>{message.author || "成员"}</span>
                        {message.topic && <span className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: "#f0ece2", color: "#77736c" }}>{message.topic}</span>}
                        <span>{fmtTime(message.created_date)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-6" style={{ color: "#57534d" }}>{message.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={onParticipate}
              className="flex w-full items-center justify-center gap-1.5 border-t py-3 text-[12px] font-medium"
              style={{ borderColor: "#e5e4df", color: "#384877" }}
            >
              <Lock className="h-3.5 w-3.5" /> {isMember ? "进入协同空间参与讨论" : "注册后参与讨论"}
            </button>
          </section>
        )}

        {tab === "knowledge" && (
          <section className="space-y-2.5">
            {data.sediment?.digest && (
              <div className="rounded-2xl border p-4" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
                <p className="text-[11px] font-medium" style={{ color: "#384877" }}>执行概览</p>
                <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5" style={{ color: "#57534d" }}>{data.sediment.digest}</p>
              </div>
            )}
            {data.consensus && (
              <div className="rounded-2xl border p-4" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}>
                <p className="text-[11px] font-medium" style={{ color: "#384877" }}>共识</p>
                <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5" style={{ color: "#57534d" }}>{data.consensus}</p>
              </div>
            )}
            {docs.map((doc, index) => (
              <button
                key={`${doc.title}-${index}`}
                type="button"
                onClick={onParticipate}
                className="flex w-full items-start gap-2.5 rounded-2xl border p-3.5 text-left"
                style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9" }}
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#384877" }} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium" style={{ color: "#35312f" }}>{doc.title}</span>
                  {doc.excerpt && <span className="mt-0.5 block text-[11px] leading-4" style={{ color: "#8a867e" }}>{doc.excerpt}</span>}
                </span>
              </button>
            ))}
            {!data.sediment?.digest && !data.consensus && docs.length === 0 && (
              <div className="rounded-2xl border p-6 text-center text-xs" style={{ borderColor: "#dcdad3", backgroundColor: "#fdfcf9", color: "#8a867e" }}>
                暂无沉淀
              </div>
            )}
          </section>
        )}

        {data.next_node && (
          <p className="flex items-center gap-1.5 px-1 text-[11px]" style={{ color: "#77736c" }}>
            <Circle className="h-2 w-2" style={{ color: "#384877" }} /> 下一节点：{data.next_node.title}
          </p>
        )}
      </main>

      {gateOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#231f20]/45 p-4 sm:items-center" onClick={() => setGateOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "#eef2ff" }}>
                <Lock className="h-5 w-5" style={{ color: "#384877" }} />
              </div>
              <button type="button" aria-label="关闭" onClick={() => setGateOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "#9a9488" }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <h2 className="mt-3 text-lg font-semibold" style={{ color: "#302c2a" }}>
              {isLoggedIn ? "接受邀请后参与协作" : "登录后参与协作"}
            </h2>
            <p className="mt-1.5 text-[13px] leading-6" style={{ color: "#77736c" }}>
              {isLoggedIn
                ? "先接受这条协同邀请，即可参与讨论、确认约定和认领待办。"
                : "注册或登录后即可参与讨论、确认约定和认领待办。当前内容仍可继续浏览。"}
            </p>
            <button type="button" onClick={goAuth} className="mt-5 w-full rounded-full py-3 text-[14px] font-medium text-white" style={{ backgroundColor: "#384877" }}>
              {isLoggedIn ? "去接受邀请" : "去注册 / 登录"}
            </button>
            <button type="button" onClick={() => setGateOpen(false)} className="mt-2 w-full rounded-full py-2.5 text-[13px]" style={{ color: "#8a867e" }}>
              继续浏览
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
