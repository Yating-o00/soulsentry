import { useState, useEffect } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Input, Button, ScrollView } from "@tarojs/components";
import { get, post, patch, del } from "@/utils/api";

const statusLabel = {
  pending: "待办",
  todo: "待办",
  in_progress: "进行中",
  completed: "已完成",
  done: "已完成",
  archived: "已归档"
};

export default function TaskDetail() {
  const [task, setTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [subtaskText, setSubtaskText] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [changeLogs, setChangeLogs] = useState([]);
  const [membersInfo, setMembersInfo] = useState(null);

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

      const allSubs = await fetchSubtasksRecursive(taskId);
      setSubtasks(allSubs);

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

  const isCompleted = task.status === "completed" || task.status === "done";

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
        </View>

        <View className="ss-card">
          <View className="ss-section-title">子约定</View>

          {(() => {
            const tops = subtasks.filter((s) => s.parent_task_id === taskId);
            const childrenOf = (id) => subtasks.filter((s) => s.parent_task_id === id);

            const renderSub = (sub, depth = 0) => {
              const done = sub.status === "completed" || sub.status === "done";
              const kids = childrenOf(sub.id);
              const hasKids = kids.length > 0;
              const expanded = expandedIds.has(sub.id);

              return (
                <View key={sub.id}>
                  <View
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "16rpx 0",
                      paddingLeft: `${depth * 40}rpx`,
                      borderBottom: "1rpx solid #e5e6eb"
                    }}
                  >
                    <View
                      onClick={() => toggleExpand(sub.id)}
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

                    <Text
                      style={{
                        width: "40rpx",
                        height: "40rpx",
                        borderRadius: "50%",
                        border: "2rpx solid #384877",
                        background: done ? "#384877" : "#fff",
                        color: "#fff",
                        textAlign: "center",
                        lineHeight: "40rpx",
                        marginRight: "16rpx",
                        fontSize: "24rpx"
                      }}
                      onClick={() => toggleTaskStatus(sub.id, done ? "pending" : "completed")}
                    >
                      {done ? "✓" : ""}
                    </Text>

                    <Text
                      style={{
                        flex: 1,
                        fontSize: "30rpx",
                        color: done ? "#999" : "#333",
                        textDecoration: done ? "line-through" : "none"
                      }}
                      onClick={() => toggleExpand(sub.id)}
                    >
                      {sub.title}
                    </Text>

                    <View
                      onClick={() => deleteSubtask(sub.id)}
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

            return <View>{tops.map((sub) => renderSub(sub, 0))}</View>;
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
    </View>
  );
}
