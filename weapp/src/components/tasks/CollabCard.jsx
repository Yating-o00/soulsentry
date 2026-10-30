// 协同约定卡片（小程序端）：与 Web 端 CollabTaskCard 对齐的呈现
// 勾选完成→归入「已完成」折叠区；右下角置顶/删除（创建者）/退出（成员）/转发
import { useState, useEffect, useMemo } from "react";
import Taro from "@tarojs/taro";
import { View, Text } from "@tarojs/components";
import { get, post, patch, del } from "@/utils/api";
import ShareButton from "@/components/ShareButton";
import theme from "./theme";
import { isEffectivelyDone } from "@/utils/recurrence";

const SCENARIO_LABELS = {
  couple: "情侣约定",
  friends: "朋友约定",
  colleagues: "同事约定",
  custom: "自定义约定",
};

// 子约定树展平（summary.subtasks 是逐级嵌套的）
const flattenTree = (nodes, out = []) => {
  (nodes || []).forEach((n) => {
    out.push(n);
    flattenTree(n.children, out);
  });
  return out;
};

// 文档摘要：取前几条非空行
const docBullets = (content, max = 2) =>
  String(content || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, max);

export default function CollabCard({ task, onComplete, onChanged, onSharePrepare }) {
  const collab = task?.metadata?.collab;
  const done = task.status === "completed" || task.status === "done" || task.status === "archived";
  const [summary, setSummary] = useState(null);
  const [me, setMe] = useState(null);
  const [subExpanded, setSubExpanded] = useState(false);
  const [busy, setBusy] = useState(""); // pin | delete | leave

  useEffect(() => {
    if (!task?.id || !collab) return undefined;
    let cancelled = false;
    get(`/collab/${task.id}/summary`, {}, { silent: true })
      .then((d) => { if (!cancelled) setSummary(d); })
      .catch(() => {});
    get("/users/me", {}, { silent: true })
      .then((d) => { if (!cancelled) setMe(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [task?.id]);

  const members = summary?.members || [];
  const ownerMember = members.find((m) => m.role === "owner");
  const isOwner = Boolean(me?.id && ownerMember?.user_id === me.id);
  const amMember = Boolean(me?.id && members.some((m) => m.user_id === me.id));
  const flatSubs = useMemo(() => flattenTree(summary?.subtasks), [summary?.subtasks]);
  const subDoneCount = flatSubs.filter(isEffectivelyDone).length;
  const docs = summary?.docs || [];
  const consensusBullets = docBullets(docs.find((d) => d.doc_type === "consensus")?.content);
  const disputeBullets = docBullets(docs.find((d) => d.doc_type === "dispute")?.content);

  const refreshSummary = async () => {
    const d = await get(`/collab/${task.id}/summary`, {}, { silent: true }).catch(() => null);
    if (d) setSummary(d);
  };

  const goDetail = () => {
    Taro.navigateTo({ url: `/pages/task-detail/index?id=${task.id}` });
  };

  const handleComplete = (e) => {
    e.stopPropagation();
    onComplete?.(task);
  };

  const handleSubPress = (sub) => async (e) => {
    e.stopPropagation();
    if (sub?.metadata?.collab?.state === "draft") {
      // 草案子约定：点击=确认（与 Web 卡片一致）
      try {
        const res = await post(`/collab/${task.id}/subtasks/${sub.id}/confirm`, {}, { silent: true });
        Taro.showToast({
          title: res?.state === "active" ? "已确认生效" : `已确认，还差 ${res?.pending_confirm_users?.length ?? 0} 位成员`,
          icon: "none",
        });
        refreshSummary();
      } catch (_err) {
        // handled globally
      }
      return;
    }
    const markingDone = !isEffectivelyDone(sub);
    try {
      await patch(`/tasks/${sub.id}`, { status: markingDone ? "completed" : "pending" });
      refreshSummary();
    } catch (_err) {
      // handled globally
    }
  };

  const handlePin = async (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy("pin");
    const pinned = Boolean(task.pinned_at);
    try {
      await patch(`/tasks/${task.id}`, { pinned_at: pinned ? null : new Date().toISOString() });
      Taro.showToast({ title: pinned ? "已取消置顶" : "已置顶", icon: "none" });
      onChanged?.();
    } catch (_err) {
      // handled globally
    } finally {
      setBusy("");
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (busy || !isOwner) return;
    Taro.showModal({
      title: "删除协同约定",
      content: `删除后所有成员都将看不到「${task.title}」；之后可以在垃圾箱中恢复。`,
      confirmText: "删除",
      confirmColor: "#db3356",
      success: async (res) => {
        if (!res.confirm) return;
        setBusy("delete");
        try {
          await patch(`/tasks/${task.id}`, { deleted_at: new Date().toISOString() });
          Taro.showToast({ title: "已删除", icon: "none" });
          onChanged?.();
        } catch (_err) {
          // handled globally
        } finally {
          setBusy("");
        }
      },
    });
  };

  const handleLeave = (e) => {
    e.stopPropagation();
    if (busy || !amMember || isOwner) return;
    Taro.showModal({
      title: "退出协同约定",
      content: `退出后「${task.title}」将不再出现在你的列表中。`,
      confirmText: "退出",
      success: async (res) => {
        if (!res.confirm) return;
        setBusy("leave");
        try {
          await del(`/tasks/${task.id}/members/${me.id}`);
          Taro.showToast({ title: "已退出", icon: "none" });
          onChanged?.();
        } catch (_err) {
          // handled globally
        } finally {
          setBusy("");
        }
      },
    });
  };

  if (!collab) return null;

  return (
    <View
      style={{
        position: "relative",
        background: theme.card,
        border: `1rpx solid ${task.pinned_at ? "#c9d5ef" : theme.border}`,
        borderRadius: "16rpx",
        marginBottom: "24rpx",
        overflow: "hidden",
        opacity: done ? 0.85 : 1,
      }}
      onClick={goDetail}
    >
      <View style={{ padding: "28rpx" }}>
        {/* 徽标行：场景 + 共创中 */}
        <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "12rpx", marginBottom: "16rpx" }}>
          <View style={{ background: theme.primary, borderRadius: "6rpx", padding: "4rpx 14rpx" }}>
            <Text style={{ fontSize: "20rpx", color: "#fff" }}>
              {SCENARIO_LABELS[collab.scenario] || SCENARIO_LABELS.custom}
            </Text>
          </View>
          <View style={{ border: "1rpx solid #b7e4c7", background: "#e8f7ee", borderRadius: "6rpx", padding: "4rpx 14rpx", flexDirection: "row", alignItems: "center", gap: "8rpx", display: "flex" }}>
            <View style={{ width: "10rpx", height: "10rpx", borderRadius: "50%", background: "#1f9d55" }} />
            <Text style={{ fontSize: "20rpx", color: "#1f9d55" }}>共创中</Text>
          </View>
        </View>

        {/* 标题行：与 Web 端一致，约定前方勾选圆圈 */}
        <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "20rpx" }}>
          <View
            onClick={handleComplete}
            style={{
              width: "40rpx",
              height: "40rpx",
              borderRadius: "50%",
              border: `2rpx solid ${done ? theme.primary : theme.inkQuaternary}`,
              background: done ? theme.primary : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {done && <Text style={{ color: "#fff", fontSize: "24rpx" }}>✓</Text>}
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: "32rpx",
              fontWeight: 600,
              color: done ? theme.inkQuaternary : theme.ink,
              lineHeight: "44rpx",
              textDecoration: done ? "line-through" : "none",
            }}
          >
            {task.title}
          </Text>
        </View>

        {/* 共同目标 */}
        {collab.goal ? (
          <Text style={{ marginTop: "12rpx", fontSize: "26rpx", color: theme.inkSecondary, lineHeight: "38rpx" }}>
            {collab.goal}
          </Text>
        ) : null}

        {/* 成员行 */}
        <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "16rpx", marginTop: "16rpx" }}>
          <View style={{ display: "flex", flexDirection: "row", paddingLeft: "8rpx" }}>
            {members.slice(0, 5).map((m) => (
              <View
                key={m.user_id || m.id || m.display_name}
                style={{
                  width: "44rpx",
                  height: "44rpx",
                  borderRadius: "50%",
                  background: theme.primary,
                  opacity: 0.9,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2rpx solid #fff",
                  marginLeft: "-8rpx",
                }}
              >
                <Text style={{ fontSize: "18rpx", color: "#fff" }}>
                  {(m.display_name || "?").trim().slice(0, 1)}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: "22rpx", color: theme.inkTertiary }}>
            {members.length || 1} 人共同构建
          </Text>
        </View>

        {/* 子约定：预览 5 条，超出折叠；草案点击=确认 */}
        {flatSubs.length > 0 && (
          <View style={{ marginTop: "24rpx", borderTop: `1rpx dashed ${theme.border}`, paddingTop: "20rpx" }}>
            <View style={{ display: "flex", flexDirection: "row", alignItems: "center", marginBottom: "16rpx" }}>
              <Text style={{ fontSize: "22rpx", fontWeight: 600, color: theme.inkTertiary, letterSpacing: "2rpx" }}>
                Agreements 子约定 · {flatSubs.length}（{subDoneCount} 已完成）
              </Text>
            </View>
            {(subExpanded ? flatSubs : flatSubs.slice(0, 5)).map((s) => {
              const sDone = isEffectivelyDone(s);
              const isDraft = s?.metadata?.collab?.state === "draft";
              return (
                <View
                  key={s.id}
                  onClick={handleSubPress(s)}
                  style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "16rpx", marginBottom: "14rpx" }}
                >
                  <View
                    style={{
                      width: "30rpx",
                      height: "30rpx",
                      borderRadius: "50%",
                      border: `2rpx solid ${sDone ? theme.primary : theme.inkQuaternary}`,
                      background: sDone ? theme.primary : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {sDone && <Text style={{ color: "#fff", fontSize: "18rpx" }}>✓</Text>}
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: "26rpx",
                      color: sDone ? theme.inkQuaternary : theme.inkSecondary,
                      textDecoration: sDone ? "line-through" : "none",
                    }}
                  >
                    {s.title}
                  </Text>
                  {isDraft && (
                    <View style={{ border: "1rpx solid #f0c36d", background: "#fdf3e0", borderRadius: "6rpx", padding: "2rpx 10rpx" }}>
                      <Text style={{ fontSize: "18rpx", color: "#b07818" }}>待确认</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {flatSubs.length > 5 && (
              <View
                onClick={(e) => { e.stopPropagation(); setSubExpanded(!subExpanded); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8rpx 0" }}
              >
                <Text style={{ fontSize: "24rpx", color: theme.primary }}>
                  {subExpanded ? "收起 ▴" : `展开全部 ${flatSubs.length} 条 ▾`}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* 共识 / 分歧摘要 */}
        {(consensusBullets.length > 0 || disputeBullets.length > 0) && (
          <View style={{ marginTop: "20rpx", display: "flex", flexDirection: "row", gap: "16rpx" }}>
            {consensusBullets.length > 0 && (
              <View style={{ flex: 1, background: "rgba(232,247,238,0.6)", border: "1rpx solid #b7e4c7", borderRadius: "12rpx", padding: "16rpx" }}>
                <Text style={{ fontSize: "20rpx", color: "#1f9d55", fontWeight: 600, marginBottom: "8rpx" }}>✦ 已达成共识</Text>
                {consensusBullets.map((b, i) => (
                  <Text key={i} style={{ fontSize: "20rpx", color: "#14532d", lineHeight: "30rpx" }}>· {b}</Text>
                ))}
              </View>
            )}
            {disputeBullets.length > 0 && (
              <View style={{ flex: 1, background: "rgba(253,243,224,0.6)", border: "1rpx solid #f0c36d", borderRadius: "12rpx", padding: "16rpx" }}>
                <Text style={{ fontSize: "20rpx", color: "#b07818", fontWeight: 600, marginBottom: "8rpx" }}>! 仍待确认</Text>
                {disputeBullets.map((b, i) => (
                  <Text key={i} style={{ fontSize: "20rpx", color: "#78350f", lineHeight: "30rpx" }}>· {b}</Text>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* 右下角操作：置顶 / 删除（创建者）/ 退出（成员）/ 转发 */}
      <View style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: "28rpx", borderTop: `1rpx solid ${theme.border}`, padding: "16rpx 28rpx" }}>
        <Text
          onClick={handlePin}
          style={{ fontSize: "24rpx", color: task.pinned_at ? theme.primary : theme.inkTertiary, fontWeight: task.pinned_at ? 600 : 400 }}
        >
          {task.pinned_at ? "取消置顶" : "置顶"}
        </Text>
        {isOwner ? (
          <Text onClick={handleDelete} style={{ fontSize: "24rpx", color: theme.seal }}>删除</Text>
        ) : amMember ? (
          <Text onClick={handleLeave} style={{ fontSize: "24rpx", color: theme.inkTertiary }}>退出</Text>
        ) : null}
        <ShareButton
          theme={theme}
          style={{ padding: "4rpx 14rpx", fontSize: "20rpx" }}
          onClick={(e) => {
            e?.stopPropagation?.();
            onSharePrepare?.(task);
          }}
        />
      </View>
    </View>
  );
}
