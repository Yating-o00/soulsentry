import { useState, useEffect, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Input, Button, ScrollView, Image, Textarea } from "@tarojs/components";
import { get, post, patch, del, absoluteUrl } from "@/utils/api";
import { useShare } from "@/hooks/useShare";
import { CHECKIN_MILESTONES, checkinEncourage, milestoneQuote } from "@/components/tasks/checkinMeta";
import { isEffectivelyDone } from "@/utils/recurrence";

const statusLabel = {
  pending: "待办",
  todo: "待办",
  in_progress: "进行中",
  completed: "已完成",
  done: "已完成",
  archived: "已归档"
};

export default function TaskDetail() {
  useShare({
    title: "心栈约定 · 和自己的一个约定",
    path: "pages/tasks/index",
    buildShare: () => (task
      ? { title: `约定 · ${String(task.title || "和自己的一个约定").slice(0, 18)}`, path: `pages/task-detail/index?id=${task.id}` }
      : {})
  });
  const [task, setTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [subtaskText, setSubtaskText] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(new Set());
  // 首次加载后默认展开所有带从属子约定的节点：从属子约定直接可见、可勾选，不用先点"+"
  const autoExpandRef = useRef(false);
  const [changeLogs, setChangeLogs] = useState([]);
  const [membersInfo, setMembersInfo] = useState(null);
  // 打卡约定：累计次数与赴约记录时间线
  const [checkinData, setCheckinData] = useState(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  // 单次打卡附言：打卡后补记 / 事后编辑（代表这一次赴约做到的事）
  const [noteSheet, setNoteSheet] = useState(null); // { checkinId, note, total }
  const [noteBusy, setNoteBusy] = useState(false);
  // 子约定折叠已完成（打卡/重复约定子项多的时候，待办一眼可见）
  const [hideDoneSubs, setHideDoneSubs] = useState(false);
  // 打卡赴约记录折叠：默认只露最近 3 条，长的历史收起来
  const [expandHistory, setExpandHistory] = useState(false);

  const taskId = Taro.getCurrentInstance().router.params.id;

  const fetchSubtasksRecursive = async (parentId) => {
    const subs = await get("/tasks", { parent_task_id: parentId, limit: 200 });
    let result = [];
    for (const sub of subs || []) {
      result.push(sub);
      const children = await fetchSubtasksRecursive(sub.id);
      result = result.concat(children);
    }
    return result;
  };

  const fetchAll = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const taskData = await get(`/tasks/${taskId}`);
      setTask(taskData);

      // 打卡约定：拉取累计次数与赴约记录（内容、鼓励的话、打卡情况同页呈现）
      if (taskData?.category === "checkin") {
        get(`/tasks/${taskId}/checkins`, { limit: 50 })
          .then((d) => setCheckinData(d))
          .catch(() => setCheckinData({ total: 0, first_at: null, items: [] }));
      } else {
        setCheckinData(null);
      }

      const allSubs = await fetchSubtasksRecursive(taskId);
      setSubtasks(allSubs);
      if (!autoExpandRef.current) {
        autoExpandRef.current = true;
        const parentIds = new Set(allSubs.map((s) => s.parent_task_id));
        setExpandedIds(new Set(allSubs.filter((s) => parentIds.has(s.id)).map((s) => s.id)));
      }

      const cmt = await get("/comments", { task_id: taskId, sort: "-created_date", limit: 100 });
      setComments(Array.isArray(cmt) ? cmt : []);

      // 变化记录与共有成员（后端对无权限/非共有场景静默降级，不影响主流程）
      try {
        const logs = await get("/task-change-logs", { task_id: taskId, sort: "-created_date", limit: 50 });
        setChangeLogs(Array.isArray(logs) ? logs : []);
      } catch (_e) {
        setChangeLogs([]);
      }
      try {
        const mi = await get(`/tasks/${taskId}/members`);
        setMembersInfo(mi && mi.owner ? mi : null);
      } catch (_e) {
        setMembersInfo(null);
      }
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    fetchAll();
  });

  useEffect(() => {
    fetchAll();
  }, [taskId]);

  // 子约定/状态变更后通知约定列表页定向刷新对应卡片，保证返回时数据同步
  const notifySubtasksChanged = () => {
    Taro.eventCenter.trigger("task:subtasks-changed", { taskId });
  };

  const toggleTaskStatus = async (targetId, nextStatus) => {
    try {
      await patch(`/tasks/${targetId}`, { status: nextStatus });
      fetchAll();
      notifySubtasksChanged();
    } catch (err) {
      // handled globally
    }
  };

  // 打卡：点 👣 = 一次赴约；成功后弹出附言输入（这次做到了什么，代表单次约定所做的事）
  const doCheckin = async () => {
    if (!taskId || checkinBusy) return;
    if (task?.done_today) {
      Taro.showToast({ title: "今日已赴约，明天再来", icon: "none" });
      return;
    }
    setCheckinBusy(true);
    try {
      const res = await post(`/tasks/${taskId}/checkins`, {});
      const total = res?.total ?? 0;
      setCheckinData((prev) => ({
        total,
        first_at: res?.first_at || prev?.first_at || null,
        items: prev?.items || [],
      }));
      setTask((prev) => (prev ? { ...prev, done_today: true } : prev));
      notifySubtasksChanged();
      Taro.showToast({
        title: CHECKIN_MILESTONES.includes(total) ? `第 ${total} 次赴约 · ${milestoneQuote(total)}` : `第 ${total} 次赴约`,
        icon: "none",
        duration: 2600,
      });
      // 弹出附言输入：可写一句话代表这次做到的事，也可以什么都不留
      setNoteSheet({ checkinId: res?.id, note: "", total });
    } catch (err) {
      // handled globally
    } finally {
      setCheckinBusy(false);
    }
  };

  // 保存附言：PATCH 到当次打卡记录，随后刷新列表呈现最新内容
  const saveCheckinNote = async () => {
    if (!noteSheet?.checkinId || noteBusy) return;
    const note = (noteSheet.note || "").trim();
    if (!note) {
      setNoteSheet(null);
      fetchAll();
      return;
    }
    setNoteBusy(true);
    try {
      await patch(`/tasks/${taskId}/checkins/${noteSheet.checkinId}`, { note });
      setNoteSheet(null);
      fetchAll();
    } catch (err) {
      // handled globally
    } finally {
      setNoteBusy(false);
    }
  };

  // 关闭附言弹层（不留内容也算一次有效打卡）
  const closeNoteSheet = () => {
    setNoteSheet(null);
    fetchAll();
  };

  // 约定允许不执行：内容沉淀进知识库（服务端留存含子约定树的完整快照），约定标记为完成
  const settleAsKnowledge = async () => {
    if (!task) return;
    const res = await Taro.showModal({
      title: "沉淀为知识",
      content: `「${task.title}」将不执行，内容（含子约定）沉淀进知识库并标记为完成。`,
      confirmText: "沉淀",
      cancelText: "取消"
    });
    if (!res.confirm) return;
    try {
      await post(`/tasks/${taskId}/settle-knowledge`, {});
      Taro.showToast({ title: "已沉淀到知识库", icon: "success" });
      fetchAll();
      notifySubtasksChanged();
    } catch (err) {
      Taro.showToast({ title: "沉淀失败", icon: "none" });
    }
  };

  const submitComment = async () => {
    if (!commentText.trim()) {
      Taro.showToast({ title: "请输入评论内容", icon: "none" });
      return;
    }
    try {
      await post("/comments", { task_id: taskId, content: commentText.trim() });
      setCommentText("");
      fetchAll();
    } catch (err) {
      // handled globally
    }
  };

  const addSubtask = async () => {
    if (!subtaskText.trim()) {
      Taro.showToast({ title: "请输入子约定内容", icon: "none" });
      return;
    }
    if (!taskId) {
      Taro.showToast({ title: "页面参数错误，请重新进入", icon: "none" });
      return;
    }
    try {
      const payload = {
        title: subtaskText.trim(),
        parent_task_id: taskId,
        priority: "medium",
        category: task?.category || "other"
      };
      await post("/tasks", payload);
      setSubtaskText("");
      Taro.showToast({ title: "子约定已添加", icon: "success" });
      fetchAll();
      notifySubtasksChanged();
    } catch (err) {
      console.error("add subtask failed", err);
      Taro.showToast({ title: "添加失败，请重试", icon: "none" });
    }
  };

  const addChildSubtask = async (parentId) => {
    if (!subtaskText.trim()) {
      Taro.showToast({ title: "请输入子约定内容", icon: "none" });
      return;
    }
    try {
      await post("/tasks", {
        title: subtaskText.trim(),
        parent_task_id: parentId,
        priority: "medium",
        category: task?.category || "other"
      });
      setSubtaskText("");
      setExpandedIds((prev) => new Set(prev).add(parentId));
      Taro.showToast({ title: "已添加", icon: "success" });
      fetchAll();
      notifySubtasksChanged();
    } catch (err) {
      console.error("add child subtask failed", err);
      Taro.showToast({ title: "添加失败", icon: "none" });
    }
  };

  const deleteSubtask = async (id) => {
    const res = await Taro.showModal({
      title: "确认删除",
      content: "删除该子约定？其下内容也会被删除。",
      confirmColor: "#e53935"
    });
    if (!res.confirm) return;
    try {
      await del(`/tasks/${id}`);
      Taro.showToast({ title: "已删除", icon: "success" });
      fetchAll();
      notifySubtasksChanged();
    } catch (err) {
      console.error("delete subtask failed", err);
    }
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 创建者移除共有成员
  const removeMember = async (member) => {
    const res = await Taro.showModal({
      title: "移除成员",
      content: `将 ${member.display_name} 移出共有约定？对方将不再看到这条约定。`,
      confirmColor: "#e53935"
    });
    if (!res.confirm) return;
    try {
      await del(`/tasks/${taskId}/members/${member.user_id}`);
      Taro.showToast({ title: "已移除", icon: "success" });
      fetchAll();
    } catch (err) {
      // handled globally
    }
  };

  // 成员退出共有
  const leaveShared = async () => {
    const self = (membersInfo?.members || []).find((m) => m.is_self);
    if (!self) return;
    const res = await Taro.showModal({
      title: "退出共有",
      content: "退出后将不再看到这条约定，创建者会收到通知。",
      confirmColor: "#e53935"
    });
    if (!res.confirm) return;
    try {
      await del(`/tasks/${taskId}/members/${self.user_id}`);
      Taro.showToast({ title: "已退出共有约定", icon: "success" });
      setTimeout(() => Taro.switchTab({ url: "/pages/tasks/index" }), 600);
    } catch (err) {
      // handled globally
    }
  };

  const CHANGE_TYPE_LABEL = {
    created: "新建了约定",
    subtask_created: "新建了子约定",
    updated: "更新了",
    subtask_updated: "更新了子约定",
    status_changed: "变更了状态",
    subtask_status_changed: "变更了子约定状态",
    deleted: "删除了",
    subtask_deleted: "删除了子约定"
  };

  const fmtCheckinTime = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const fmtCheckinDay = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  // 按北京时间（UTC+8）判断两个时间点是否同一天
  const isSameChinaDay = (isoA, tsB) => {
    const dayOf = (t) => new Date(new Date(t).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    return dayOf(isoA) === dayOf(tsB);
  };

  if (loading && !task) {
    return (
      <View className="ss-page">
        <View className="ss-empty">加载中...</View>
      </View>
    );
  }

  if (!task) {
    return (
      <View className="ss-page">
        <View className="ss-empty">约定不存在或已删除</View>
      </View>
    );
  }

  const isCompleted = isEffectivelyDone(task);

  return (
    <View className="ss-page">
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        <View className="ss-card">
          <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <View className="ss-title" style={{ flex: 1, marginRight: "16rpx" }}>{task.title}</View>
            <Text
              onClick={() => Taro.navigateTo({ url: `/pages/task-create/index?id=${task.id}&mode=edit` })}
              style={{ fontSize: "26rpx", color: "#384877", padding: "8rpx 16rpx", border: "1rpx solid #384877", borderRadius: "10rpx", flexShrink: 0 }}
            >
              编辑
            </Text>
          </View>
          <Text className="ss-tag ss-tag-primary">{statusLabel[task.status] || task.status}</Text>
          {task.description ? (
            <View style={{ marginTop: "20rpx" }}>
              <Text style={{ fontSize: "30rpx", color: "#333", lineHeight: "48rpx" }}>{task.description}</Text>
            </View>
          ) : null}

          <Button
            className={`ss-btn ${isCompleted ? "ss-btn-plain" : ""}`}
            onClick={() => toggleTaskStatus(task.id, isCompleted ? "pending" : "completed")}
          >
            {isCompleted ? "标记为未完成" : "标记为已完成"}
          </Button>
          {!isCompleted && (
            <Button className="ss-btn ss-btn-plain" style={{ marginTop: "16rpx" }} onClick={settleAsKnowledge}>
              沉淀为知识（不执行）
            </Button>
          )}
        </View>

        {task.category === "checkin" && checkinData && (() => {
          const total = checkinData.total ?? 0;
          const firstAt = checkinData.first_at;
          const items = checkinData.items || [];
          const doneToday = Boolean(task.done_today);
          const dayCount = firstAt
            ? Math.max(1, Math.floor((Date.now() - new Date(firstAt).getTime()) / 86400000) + 1)
            : 0;
          // 当日已完成的打卡单独列出（按北京时间），其余进历史时间线
          const todayItems = items.filter((c) => isSameChinaDay(c.created_at, Date.now()));
          const historyItems = todayItems.length > 0 ? items.filter((c) => !isSameChinaDay(c.created_at, Date.now())) : items;
          // 历史默认只露最近 3 条，长的折叠起来，点「展开全部」再看
          const visibleHistory = expandHistory ? historyItems : historyItems.slice(0, 3);
          return (
            <View className="ss-card" style={{ background: "linear-gradient(150deg, #f8faff 0%, #ffffff 55%)", border: "1rpx solid #c9d5ef" }}>
              <View style={{ display: "flex", alignItems: "center", gap: "24rpx" }}>
                <View
                  onClick={doCheckin}
                  style={{
                    width: "130rpx",
                    height: "130rpx",
                    borderRadius: "50%",
                    border: doneToday ? "none" : "2rpx solid #c9d5ef",
                    background: doneToday ? "linear-gradient(140deg, #3b5aa2, #384877)" : "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: doneToday ? "0 10rpx 30rpx rgba(56,72,119,0.3)" : "none",
                    opacity: checkinBusy ? 0.7 : 1,
                  }}
                >
                  {doneToday ? (
                    <Text style={{ color: "#ffffff", fontSize: "28rpx", fontWeight: 700, letterSpacing: "2rpx" }}>如约</Text>
                  ) : (
                    <Text style={{ fontSize: "60rpx", lineHeight: "70rpx" }}>👣</Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ display: "flex", alignItems: "baseline", gap: "12rpx", flexWrap: "wrap" }}>
                    <Text style={{ fontSize: "36rpx", fontWeight: 700, color: "#384877" }}>已打卡 {total} 次</Text>
                    {doneToday && (
                      <View style={{ background: "#e8f7ee", border: "1rpx solid #b7e4c7", padding: "2rpx 12rpx", borderRadius: "6rpx" }}>
                        <Text style={{ fontSize: "20rpx", color: "#1f9d55" }}>今日已打卡</Text>
                      </View>
                    )}
                  </View>
                  {firstAt ? (
                    <Text style={{ display: "block", fontSize: "22rpx", color: "#9ca0a8", marginTop: "8rpx" }}>
                      从 {fmtCheckinDay(firstAt)} 开始 · 第 {dayCount} 天
                    </Text>
                  ) : null}
                  <Text style={{ display: "block", fontSize: "22rpx", color: "#3b5aa2", marginTop: "10rpx", lineHeight: "32rpx" }}>
                    {checkinEncourage(total)}
                  </Text>
                </View>
              </View>

              {/* 今日已完成：当日打卡内容单独列出，一眼可见 */}
              {todayItems.length > 0 && (
                <View style={{ marginTop: "24rpx", background: "#f0f6ff", border: "1rpx solid #dbe3f7", borderRadius: "14rpx", padding: "20rpx 22rpx" }}>
                  <View style={{ display: "flex", alignItems: "center", gap: "10rpx", marginBottom: "12rpx" }}>
                    <View style={{ width: "12rpx", height: "12rpx", borderRadius: "50%", background: "#1f9d55" }} />
                    <Text style={{ fontSize: "24rpx", fontWeight: 600, color: "#384877" }}>今日已完成 · {todayItems.length} 次</Text>
                  </View>
                  {todayItems.map((c) => (
                    <View key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: "14rpx", padding: "8rpx 0" }}>
                      <Text style={{ fontSize: "22rpx", color: "#9ca0a8", flexShrink: 0, marginTop: "2rpx" }}>{fmtCheckinTime(c.created_at)}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12rpx" }}>
                          {c.note ? null : <Text style={{ fontSize: "24rpx", color: "#9ca0a8" }}>完成一次赴约</Text>}
                          <Text
                            onClick={() => setNoteSheet({ checkinId: c.id, note: c.note || "", total: null })}
                            style={{ fontSize: "22rpx", color: "#5b82a0", marginLeft: "auto", padding: "2rpx 8rpx" }}
                          >
                            {c.note ? "编辑" : "记一句"}
                          </Text>
                        </View>
                        {c.note ? (
                          <Text style={{ fontSize: "26rpx", color: "#3a3a3c", lineHeight: "38rpx", marginTop: "4rpx" }}>{c.note}</Text>
                        ) : null}
                        {c.photo_url ? (
                          <Image
                            src={absoluteUrl(c.photo_url)}
                            mode="aspectFill"
                            style={{ marginTop: "8rpx", width: "220rpx", height: "170rpx", borderRadius: "10rpx", background: "#f2f3f5" }}
                          />
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* 打卡情况：历史赴约时间线（当日的已在上方专区） */}
              <View style={{ marginTop: "28rpx", borderTop: `1rpx dashed ${todayItems.length > 0 ? "#dbe3f7" : "#e8ecef"}`, paddingTop: "24rpx" }}>
                <View className="ss-section-title" style={{ marginBottom: "8rpx" }}>
                  {todayItems.length > 0 ? "过往赴约记录" : "赴约记录"}
                </View>
                {historyItems.length === 0 ? (
                  <View className="ss-empty" style={{ padding: "20rpx 0" }}>
                    {todayItems.length > 0 ? "之前的记录会出现在这里" : "还没有记录，点上方小脚印开始第一次打卡"}
                  </View>
                ) : (
                  <View>
                  {visibleHistory.map((c) => (
                    <View key={c.id} style={{ display: "flex", gap: "18rpx", padding: "16rpx 0", borderBottom: "1rpx solid #eef0f3" }}>
                      <View style={{ width: "16rpx", display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: "10rpx" }}>
                        <View style={{ width: "14rpx", height: "14rpx", borderRadius: "50%", background: "#3b5aa2" }} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12rpx" }}>
                          <Text style={{ fontSize: "22rpx", color: "#9ca0a8" }}>{fmtCheckinTime(c.created_at)}</Text>
                          <Text
                            onClick={() => setNoteSheet({ checkinId: c.id, note: c.note || "", total: null })}
                            style={{ fontSize: "22rpx", color: "#5b82a0", padding: "2rpx 8rpx" }}
                          >
                            {c.note ? "编辑" : "记一句"}
                          </Text>
                        </View>
                        {c.note ? (
                          <View style={{ marginTop: "8rpx", background: "#ffffff", border: "1rpx solid #e8ecef", borderRadius: "12rpx", padding: "16rpx 20rpx" }}>
                            <Text style={{ fontSize: "27rpx", color: "#3a3a3c", lineHeight: "40rpx" }}>{c.note}</Text>
                          </View>
                        ) : null}
                        {c.photo_url ? (
                          <Image
                            src={absoluteUrl(c.photo_url)}
                            mode="aspectFill"
                            style={{ marginTop: c.note ? "12rpx" : "8rpx", width: "260rpx", height: "200rpx", borderRadius: "12rpx", background: "#f2f3f5" }}
                          />
                        ) : null}
                      </View>
                    </View>
                  ))}
                  {historyItems.length > 3 && (
                    <View
                      onClick={() => setExpandHistory((v) => !v)}
                      style={{ textAlign: "center", padding: "20rpx 0 6rpx" }}
                    >
                      <Text style={{ fontSize: "24rpx", color: "#5b82a0" }}>
                        {expandHistory ? "收起 ▴" : `展开全部 ${historyItems.length} 条 ▾`}
                      </Text>
                    </View>
                  )}
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        <View className="ss-card">
          <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <View className="ss-section-title" style={{ marginBottom: 0 }}>子约定</View>
            {(() => {
              const doneAny = subtasks.some((s) => s.status === "completed" || s.status === "done");
              if (!doneAny) return null;
              return (
                <Text
                  onClick={() => setHideDoneSubs((v) => !v)}
                  style={{ fontSize: "24rpx", color: "#5b82a0", padding: "4rpx 12rpx" }}
                >
                  {hideDoneSubs ? "展开已完成" : "折叠已完成"}
                </Text>
              );
            })()}
          </View>

          {(() => {
            const isSubDone = (s) => isEffectivelyDone(s);
            const tops = subtasks.filter((s) => s.parent_task_id === taskId);
            const visibleTops = hideDoneSubs ? tops.filter((s) => !isSubDone(s)) : tops;
            const childrenOf = (id) => {
              const kids = subtasks.filter((s) => s.parent_task_id === id);
              return hideDoneSubs ? kids.filter((s) => !isSubDone(s)) : kids;
            };

            const renderSub = (sub, depth = 0) => {
              const done = isEffectivelyDone(sub);
              const kids = childrenOf(sub.id);
              const hasKids = kids.length > 0;
              const expanded = expandedIds.has(sub.id);

              return (
                <View key={sub.id}>
                  {/* 整行点击 = 勾选/取消（与约定卡片上的口径一致），圈只做视觉指示 */}
                  <View
                    onClick={() => toggleTaskStatus(sub.id, done ? "pending" : "completed")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "18rpx 0",
                      paddingLeft: `${depth * 40}rpx`,
                      borderBottom: "1rpx solid #e5e6eb"
                    }}
                  >
                    <View
                      onClick={(e) => { e.stopPropagation(); toggleExpand(sub.id); }}
                      style={{
                        width: "44rpx",
                        height: "44rpx",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: "4rpx"
                      }}
                    >
                      <Text style={{ color: "#384877", fontSize: "28rpx", fontWeight: 300 }}>
                        {expanded ? "−" : "+"}
                      </Text>
                    </View>

                    <View
                      style={{
                        width: "40rpx",
                        height: "40rpx",
                        borderRadius: "50%",
                        border: "2rpx solid #384877",
                        background: done ? "#384877" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: "16rpx",
                        flexShrink: 0
                      }}
                    >
                      {done ? <Text style={{ color: "#fff", fontSize: "24rpx", lineHeight: "28rpx" }}>✓</Text> : null}
                    </View>

                    <Text
                      style={{
                        flex: 1,
                        fontSize: "30rpx",
                        color: done ? "#999" : "#333",
                        textDecoration: done ? "line-through" : "none"
                      }}
                    >
                      {sub.title}
                    </Text>

                    <View
                      onClick={(e) => { e.stopPropagation(); deleteSubtask(sub.id); }}
                      style={{
                        width: "48rpx",
                        height: "48rpx",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Text style={{ color: "#e53935", fontSize: "40rpx", lineHeight: "40rpx" }}>×</Text>
                    </View>
                  </View>

                  {expanded && (
                    <View>
                      {hasKids && kids.map((child) => renderSub(child, depth + 1))}
                      <View
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "12rpx 0",
                          paddingLeft: `${(depth + 1) * 40 + 44}rpx`,
                          borderBottom: "1rpx solid #e5e6eb"
                        }}
                      >
                        <Input
                          className="ss-input"
                          placeholder="添加二级子约定"
                          value={subtaskText}
                          onInput={(e) => setSubtaskText(e.detail.value)}
                          style={{ flex: 1, marginRight: "16rpx", height: "64rpx" }}
                        />
                        <Button className="ss-btn ss-btn-sm" onClick={() => addChildSubtask(sub.id)}>
                          添加
                        </Button>
                      </View>
                    </View>
                  )}
                </View>
              );
            };

            if (tops.length === 0) {
              return <View className="ss-empty" style={{ padding: "24rpx 0" }}>暂无子约定</View>;
            }
            if (visibleTops.length === 0) {
              return <View className="ss-empty" style={{ padding: "24rpx 0" }}>{tops.length} 条子约定已全部完成</View>;
            }

            return <View>{visibleTops.map((sub) => renderSub(sub, 0))}</View>;
          })()}

          <View style={{ marginTop: "24rpx", display: "flex", alignItems: "center" }}>
            <Input
              className="ss-input"
              placeholder="添加一个子约定"
              value={subtaskText}
              onInput={(e) => setSubtaskText(e.detail.value)}
              style={{ flex: 1, marginRight: "16rpx", height: "64rpx" }}
            />
            <Button className="ss-btn ss-btn-sm" onClick={addSubtask}>添加</Button>
          </View>
        </View>

        <View className="ss-card">
          <View className="ss-section-title">评论</View>
          {comments.length === 0 && <View className="ss-empty">暂无评论</View>}
          {comments.map((c) => (
            <View key={c.id} style={{ marginBottom: "20rpx", paddingBottom: "20rpx", borderBottom: "1rpx solid #e5e6eb" }}>
              <View style={{ display: "flex", justifyContent: "space-between", marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "28rpx", color: "#384877", fontWeight: 500 }}>{c.created_by || c.visitor_name || "访客"}</Text>
                <Text className="ss-muted">{new Date(c.created_date).toLocaleString("zh-CN")}</Text>
              </View>
              <Text style={{ fontSize: "30rpx", color: "#333" }}>{c.content}</Text>
            </View>
          ))}
        </View>

        <View className="ss-card">
          <View className="ss-section-title">发表评论</View>
          <Input
            className="ss-input"
            placeholder="写下你的评论"
            value={commentText}
            onInput={(e) => setCommentText(e.detail.value)}
          />
          <Button className="ss-btn" onClick={submitComment}>发送</Button>
        </View>

        {membersInfo && (membersInfo.members.length > 0 || membersInfo.my_role === "member") && (
          <View className="ss-card">
            <View className="ss-section-title">共有成员</View>
            <View style={{ display: "flex", alignItems: "center", padding: "14rpx 0", borderBottom: "1rpx solid #e5e6eb" }}>
              <Text style={{ flex: 1, fontSize: "30rpx", color: "#333" }}>
                {membersInfo.owner.display_name}
                {membersInfo.owner.is_self ? "（我）" : ""}
              </Text>
              <Text className="ss-tag ss-tag-primary">创建者</Text>
            </View>
            {membersInfo.members.map((m) => (
              <View key={m.user_id} style={{ display: "flex", alignItems: "center", padding: "14rpx 0", borderBottom: "1rpx solid #e5e6eb" }}>
                <Text style={{ flex: 1, fontSize: "30rpx", color: "#333" }}>
                  {m.display_name}
                  {m.is_self ? "（我）" : ""}
                </Text>
                {membersInfo.my_role === "owner" && !m.is_self && (
                  <Text
                    onClick={() => removeMember(m)}
                    style={{ fontSize: "26rpx", color: "#e53935", padding: "6rpx 16rpx", border: "1rpx solid #e53935", borderRadius: "10rpx" }}
                  >
                    移除
                  </Text>
                )}
              </View>
            ))}
            {membersInfo.my_role === "member" && (
              <Button className="ss-btn ss-btn-plain" style={{ marginTop: "20rpx" }} onClick={leaveShared}>
                退出共有
              </Button>
            )}
          </View>
        )}

        {changeLogs.length > 0 && (
          <View className="ss-card">
            <View className="ss-section-title">变化</View>
            {changeLogs.map((log) => (
              <View key={log.id} style={{ padding: "14rpx 0", borderBottom: "1rpx solid #e5e6eb" }}>
                <View style={{ display: "flex", justifyContent: "space-between", marginBottom: "6rpx" }}>
                  <Text style={{ fontSize: "28rpx", color: "#333" }}>
                    {log.actor_name || "我"}{CHANGE_TYPE_LABEL[log.change_type] || "更新了"}
                    {log.parent_task_id && log.task_title ? `「${log.task_title}」` : ""}
                  </Text>
                  <Text className="ss-muted">{new Date(log.created_date).toLocaleString("zh-CN")}</Text>
                </View>
                {(log.changes_detail || [])
                  .filter((d) => d && d.new_value !== undefined && d.old_value !== d.new_value)
                  .slice(0, 4)
                  .map((d, idx) => (
                    <Text key={idx} className="ss-muted" style={{ display: "block", fontSize: "24rpx", lineHeight: "36rpx" }}>
                      {d.field_label}：{d.old_value} → {d.new_value}
                    </Text>
                  ))}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: "40rpx" }} />
      </ScrollView>

      {/* 单次打卡附言：打卡后补记 / 事后编辑——代表这一次赴约做到的事 */}
      {noteSheet && (
        <View
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "48rpx"
          }}
          onClick={closeNoteSheet}
        >
          <View
            style={{ width: "100%", background: "#ffffff", borderRadius: "20rpx", padding: "32rpx" }}
            onClick={(e) => e.stopPropagation()}
          >
            {noteSheet.total ? (
              <View>
                <Text style={{ fontSize: "30rpx", fontWeight: 600, color: "#1c1c1e" }}>
                  这是第 <Text style={{ color: "#384877" }}>{noteSheet.total}</Text> 次赴约
                </Text>
                <Text style={{ display: "block", fontSize: "24rpx", color: "#9ca0a8", marginTop: "8rpx" }}>
                  这次做到了什么？留一句话代表这次赴约（也可以什么都不留）。
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: "30rpx", fontWeight: 600, color: "#1c1c1e" }}>编辑这次记录</Text>
            )}
            <Textarea
              value={noteSheet.note}
              onInput={(e) => setNoteSheet((prev) => ({ ...prev, note: e.detail.value }))}
              placeholder={"一句话就好，比如：跑了 3 公里，配速 6 分半"}
              maxlength={500}
              style={{
                width: "100%",
                minHeight: "160rpx",
                marginTop: "24rpx",
                background: "#f8f9fd",
                border: "1rpx solid #e8ecef",
                borderRadius: "14rpx",
                padding: "20rpx 24rpx",
                fontSize: "28rpx",
                color: "#3a3a3c",
                boxSizing: "border-box"
              }}
            />
            <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "28rpx" }}>
              <Text onClick={closeNoteSheet} style={{ fontSize: "26rpx", color: "#9ca0a8", padding: "12rpx 16rpx" }}>
                就这样吧 →
              </Text>
              <Button
                className="ss-btn"
                style={{ margin: 0, padding: "0 40rpx" }}
                loading={noteBusy}
                onClick={saveCheckinNote}
              >
                {noteSheet.note?.trim() ? "收下这句话" : "保存"}
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
