import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { HeartHandshake, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import CollaborationSnapshot from "@/components/teams/CollaborationSnapshot";
import GuestParticipationPanel from "@/components/teams/GuestParticipationPanel";
import CollaborationFeed from "@/components/teams/CollaborationFeed";

export default function Collaborate() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const load = React.useCallback(async () => {
    const res = await base44.functions.invoke("getCollaborationSnapshot", { token });
    setData(res.data);
    setJoined(!!res.data?.viewer?.already_joined);
  }, [token]);

  useEffect(() => {
    if (!token) { setError("链接缺少邀请码"); setLoading(false); return; }
    load()
      .catch((e) => setError(e?.response?.data?.error || "邀请链接无效或已过期"))
      .finally(() => setLoading(false));
  }, [token, load]);

  const bumpCloseness = async (inviterName) => {
    const existing = await base44.entities.Relationship.filter({ name: inviterName }).catch(() => []);
    if (existing && existing.length > 0) {
      const r = existing[0];
      await base44.entities.Relationship.update(r.id, {
        closeness: Math.min(10, (r.closeness || 5) + 1),
        interaction_count: (r.interaction_count || 0) + 1,
        last_interaction_date: new Date().toISOString(),
      });
    } else {
      await base44.entities.Relationship.create({
        name: inviterName,
        relationship_type: "friend",
        closeness: 6,
        interaction_count: 1,
        last_interaction_date: new Date().toISOString(),
        notes: "通过共同约定建立的羁绊",
      });
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    try {
      const res = await base44.functions.invoke("joinCollaboration", { token });
      await bumpCloseness(res.data.inviter_name).catch(() => {});
      setJoined(true);
      toast.success("已加入协作，这个约定会同步出现在你的列表中");
    } catch (e) {
      toast.error(e?.response?.data?.error || "加入失败，请稍后重试");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-[#f9fafb] to-[#eef2f7] p-4 md:p-10">
      <div className="max-w-lg mx-auto space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-24 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 正在打开协作快照…
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
            <CollaborationSnapshot
              task={data.task}
              subtasks={data.subtasks}
              inviterName={data.invite.inviter_name}
              message={data.invite.message}
            />

            <GuestParticipationPanel
              token={token}
              task={data.task}
              subtasks={data.subtasks}
              viewer={data.viewer}
              onChanged={load}
            />

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-800 mb-3">协作动态</p>
              <CollaborationFeed activities={data.activities || []} emptyText="还没有人参与，你可以第一个响应" />
            </div>

            {joined ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center space-y-3">
                <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto" />
                <p className="text-sm text-green-800 font-medium">你已加入这个共同约定</p>
                <Link to="/Teams">
                  <Button variant="outline" className="gap-2">去团队页查看进度</Button>
                </Link>
              </div>
            ) : (
              <Button
                onClick={handleJoin}
                disabled={joining}
                className="w-full h-12 bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white gap-2 rounded-xl"
              >
                {joining
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> 加入中…</>
                  : <><HeartHandshake className="w-4 h-4" /> 加入这个共同约定</>}
              </Button>
            )}

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              加入后，双方对进度、留言与附件的修改会同步显示在彼此的约定中。
            </p>
          </>
        )}
      </div>
    </div>
  );
}