import React, { useEffect, useState, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertCircle, StickyNote } from "lucide-react";
import { Link } from "react-router-dom";
import GuestNotePanel from "@/components/notes/GuestNotePanel";
import CollaborationFeed from "@/components/teams/CollaborationFeed";

// 心签分享页：未注册访客也能查看、修改、留言，动态实时回流给分享者
export default function ShareNote() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const editing = useRef(false);

  const load = useCallback(async () => {
    const res = await base44.functions.invoke("getSharedNote", { token });
    setData(res.data);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError("这个页面需要通过分享链接打开。请在心签的「分享」弹窗中点击「生成协作链接」，把生成的完整链接发给对方。");
      setLoading(false);
      return;
    }
    load()
      .catch((e) => setError(e?.response?.data?.error || "邀请链接无效或已过期"))
      .finally(() => setLoading(false));
  }, [token, load]);

  // 轮询：分享者那边的新动态会自动出现在访客页面上
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      if (!editing.current) load().catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, [token, load]);

  return (
    <div className="min-h-full bg-gradient-to-br from-[#f9fafb] to-[#eef2f7] p-4 md:p-10">
      <div className="max-w-lg mx-auto space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-24 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 正在打开心签…
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <p className="text-slate-700 font-medium">{error}</p>
            <Link to="/" className="text-sm text-[#384877] underline">返回首页</Link>
          </div>
        )}

        {!loading && data && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <StickyNote className="w-4 h-4 text-[#384877]" />
                <span>{data.invite.inviter_name} 与你分享了一条心签</span>
              </div>
              {data.invite.message && (
                <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{data.invite.message}</p>
              )}
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed selectable-text">
                {data.note.plain_text || "（这条心签还没有文字内容）"}
              </p>
            </div>

            <div onFocusCapture={() => { editing.current = true; }} onBlurCapture={() => { editing.current = false; }}>
              <GuestNotePanel token={token} onChanged={load} />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-800 mb-3">协作动态</p>
              <CollaborationFeed activities={data.activities || []} emptyText="还没有人参与，你可以第一个响应" />
            </div>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              你的留言会实时同步给分享者，无需注册。心签内容仅分享者可修改。
            </p>
          </>
        )}
      </div>
    </div>
  );
}