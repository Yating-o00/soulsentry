import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, UserRound, PenSquare, LogOut } from "lucide-react";
import MailInsight from "./MailInsight";
import MailComposer from "./MailComposer";

const CONNECTOR_ID = "6aca1ec554d6e4702c734ca7";

export default function MailboxPanel({ onStatus }) {
  const [state, setState] = useState(null);
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [composing, setComposing] = useState(false);

  const load = async () => {
    const res = await base44.functions.invoke("userMailbox", { action: "list" }).catch((e) => ({
      data: { connected: false, error: /insufficient|403/i.test(e?.response?.data?.error || "") ? "已授权，但缺少读取/发送邮件的权限。请重新连接，并在 Google 授权页勾选所有 Gmail 权限。" : "邮箱暂时无法读取，请稍后重试。" },
    }));
    setState(res.data);
    onStatus?.(!!res.data.connected);
  };

  useEffect(() => {
    load();
    base44.auth.me().then((u) => setProfile(u.mail_profile || null));
  }, []);

  const connect = async () => {
    const url = await base44.connectors.connectAppUser(CONNECTOR_ID);
    const popup = window.open(url, "_blank");
    const t = setInterval(() => { if (!popup || popup.closed) { clearInterval(t); load(); } }, 500);
  };
  const disconnect = async () => {
    await base44.connectors.disconnectAppUser(CONNECTOR_ID);
    setState({ connected: false }); onStatus?.(false);
  };
  const buildProfile = async () => {
    setBusy(true);
    const res = await base44.functions.invoke("userMailbox", { action: "profile" });
    setProfile(res.data.profile); setBusy(false);
  };

  if (!state) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  if (!state.connected) return (
    <div className="text-center py-10 space-y-3">
      <Mail className="w-10 h-10 text-[#384877] mx-auto" />
      <p className="font-semibold text-slate-800">授权心栈连接你的邮箱</p>
      <p className="text-sm text-slate-500 max-w-md mx-auto">心栈会读取邮件以了解你的沟通习惯，帮你分析来信、给出建议，并按你的风格起草邮件；每封邮件都需你确认后才会发出。</p>
      {state.error && <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-2 max-w-md mx-auto">{state.error}</p>}
      <Button onClick={connect} className="bg-[#384877] hover:bg-[#2d3a60]">{state.error ? "重新连接 Gmail" : "连接 Gmail"}</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">已连接 <span className="font-medium">{state.email}</span></p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setComposing(true); setSelected(null); }}><PenSquare className="w-4 h-4 mr-1" />写邮件</Button>
          <Button size="sm" variant="ghost" onClick={disconnect}><LogOut className="w-4 h-4 mr-1" />断开</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 p-4 bg-white">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold flex items-center gap-1"><UserRound className="w-4 h-4" />我的邮件画像</p>
          <Button size="sm" variant="outline" onClick={buildProfile} disabled={busy}>{busy && <Loader2 className="w-3 h-3 animate-spin mr-1" />}{profile ? "重新分析" : "生成画像"}</Button>
        </div>
        {profile ? <p className="text-sm text-slate-600">{profile.summary}（风格：{profile.style}；语气：{profile.tone}）</p> : <p className="text-xs text-slate-400">分析你已发送的邮件，让建议和代写更像你。</p>}
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white divide-y max-h-[520px] overflow-auto">
          {state.messages.length === 0 && <p className="p-4 text-sm text-slate-400">收件箱暂无邮件</p>}
          {state.messages.map((m) => (
            <button key={m.id} onClick={() => { setSelected(m.id); setComposing(false); }} className={`w-full text-left p-3 hover:bg-slate-50 ${selected === m.id ? "bg-[#384877]/5" : ""}`}>
              <p className={`text-sm truncate ${m.unread ? "font-semibold" : ""}`}>{m.subject || "(无主题)"}</p>
              <p className="text-xs text-slate-500 truncate">{m.from}</p>
              <p className="text-xs text-slate-400 truncate">{m.snippet}</p>
            </button>
          ))}
        </div>
        <div className="md:col-span-3 rounded-2xl border border-slate-200 bg-white p-4">
          {composing ? <MailComposer onSent={() => setComposing(false)} />
            : selected ? <MailInsight messageId={selected} onSent={load} />
            : <p className="text-sm text-slate-400 py-10 text-center">选择一封邮件，心栈会给出建议</p>}
        </div>
      </div>
    </div>
  );
}