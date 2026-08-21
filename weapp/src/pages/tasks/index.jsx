import { useState, useMemo, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Button, MovableArea, MovableView } from "@tarojs/components";
import { get, post, del, patch } from "@/utils/api";

const statusMap = {
  pending: { text: "待办", className: "ss-tag-warning" },
  todo: { text: "待办", className: "ss-tag-warning" },
  in_progress: { text: "进行中", className: "ss-tag-primary" },
  completed: { text: "已完成", className: "ss-tag-success" },
  done: { text: "已完成", className: "ss-tag-success" },
  archived: { text: "已归档", className: "ss-tag-danger" }
};

const priorityMap = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低"
};

const categoryMap = {
  work: "工作",
  personal: "个人",
  health: "健康",
  study: "学习",
  family: "家庭",
  shopping: "购物",
  finance: "财务",
  other: "其他"
};

function getActionWidthPx() {
  try {
    const sys = Taro.getSystemInfoSync();
    return Math.round((360 / 750) * sys.windowWidth);
  } catch (e) {
    return 180;
  }
}

function getScreenWidthPx() {
  try {
    return Taro.getSystemInfoSync().windowWidth;
  } catch (e) {
    return 375;
  }
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [subtaskMap, setSubtaskMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [offsets, setOffsets] = useState({});
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const moveXRef = useRef({});

  const ACTION_WIDTH = useMemo(() => getActionWidthPx(), []);
  const SCREEN_WIDTH = useMemo(() => getScreenWidthPx(), []);

  const fetchSubtasksForTasks = async (taskList) => {
    if (!Array.isArray(taskList) || taskList.length === 0) return;
    try {
      const results = await Promise.all(
        taskList.map((t) => get("/tasks", { parent_task_id: t.id, limit: 200 }).catch(() => []))
      );
      const map = {};
      taskList.forEach((t, i) => {
        map[t.id] = Array.isArray(results[i]) ? results[i] : [];
      });
      setSubtaskMap(map);
    } catch (err) {
      // ignore
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const data = await get("/tasks", { parent_task_id: "", sort: "-created_date", limit: 200 });
      const top = Array.isArray(data) ? data : [];
      setTasks(top);
      setExpandedTaskId(null);
      // 异步加载每个约定的子约定，避免 parent_task_id=all 兼容性问题导致列表空白
      fetchSubtasksForTasks(top);
    } catch (err) {
      setTasks([]);
      setSubtaskMap({});
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    fetchTasks();
  });

  const goCreate = () => {
    Taro.navigateTo({ url: "/pages/task-create/index" });
  };

  const goDetail = (id) => {
    Taro.navigateTo({ url: `/pages/task-detail/index?id=${id}` });
  };

  const goEdit = (id) => {
    Taro.navigateTo({ url: `/pages/task-create/index?id=${id}&mode=edit` });
  };

  const handleShare = async (task) => {
    try {
      const share = await post(`/public/share/generate/task/${task.id}`);
      Taro.navigateTo({ url: `/pages/share/index?token=${share.token}` });
    } catch (err) {
      Taro.showToast({ title: "分享生成失败", icon: "none" });
    }
  };

  const handleDelete = async (id) => {
    const res = await Taro.showModal({
      title: "确认删除",
      content: "删除后可在回收站找回，是否继续？"
    });
    if (!res.confirm) return;

    try {
      await del(`/tasks/${id}`);
      Taro.showToast({ title: "已删除", icon: "success" });
      fetchTasks();
    } catch (err) {
      // handled globally
    }
  };

  const handleQuickComplete = async (task) => {
    const nextStatus = task.status === "completed" || task.status === "done" ? "pending" : "completed";
    try {
      await patch(`/tasks/${task.id}`, { status: nextStatus });
      fetchTasks();
    } catch (err) {
      // handled globally
    }
  };

  const toggleExpand = (taskId) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const handleSubtaskToggle = async (sub) => {
    const nextStatus = sub.status === "completed" || sub.status === "done" ? "pending" : "completed";
    try {
      await patch(`/tasks/${sub.id}`, { status: nextStatus });
      setSubtaskMap((prev) => {
        const next = { ...prev };
        const list = next[sub.parent_task_id] || [];
        next[sub.parent_task_id] = list.map((s) =>
          s.id === sub.id ? { ...s, status: nextStatus } : s
        );
        return next;
      });
    } catch (err) {
      // handled globally
    }
  };

  const getSubtasks = (taskId) => subtaskMap[taskId] || [];

  const onChange = (taskId, e) => {
    moveXRef.current[taskId] = e.detail.x;
  };

  const resetOffset = (taskId, value) => {
    setOffsets((prev) => ({ ...prev, [taskId]: value + 0.001 }));
    setTimeout(() => {
      setOffsets((prev) => ({ ...prev, [taskId]: value }));
    }, 0);
  };

  const onTouchEnd = (taskId) => {
    const x = moveXRef.current[taskId] ?? -ACTION_WIDTH;
    const task = tasks.find((t) => t.id === taskId);
    const threshold = ACTION_WIDTH / 2;

    // 右滑超过一半 -> 直接完成
    if (x > -ACTION_WIDTH + threshold) {
      if (task) handleQuickComplete(task);
      resetOffset(taskId, -ACTION_WIDTH);
      return;
    }

    // 左滑超过一半 -> 展开操作按钮
    if (x < -ACTION_WIDTH - threshold) {
      resetOffset(taskId, -ACTION_WIDTH * 2);
      return;
    }

    // 回弹到中间
    resetOffset(taskId, -ACTION_WIDTH);
  };

  return (
    <View className="ss-page">
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        {loading && tasks.length === 0 && (
          <View className="ss-empty">加载中...</View>
        )}

        {!loading && tasks.length === 0 && (
          <View className="ss-empty">暂无约定，点击右下角添加</View>
        )}

        {tasks.map((task) => {
          const status = statusMap[task.status] || statusMap.pending;
          const done = task.status === "completed" || task.status === "done";
          const offset = offsets[task.id] ?? -ACTION_WIDTH;

          const taskSubs = getSubtasks(task.id);
          const isExpanded = expandedTaskId === task.id;

          return (
            <View key={task.id} style={{ marginBottom: "20rpx" }}>
              <MovableArea
                style={{
                  width: `${SCREEN_WIDTH}px`,
                  height: "200rpx",
                  overflow: "hidden",
                  borderRadius: "16rpx"
                }}
              >
                <MovableView
                  style={{
                    width: `${SCREEN_WIDTH + ACTION_WIDTH * 2}px`,
                    height: "100%",
                    display: "flex",
                    flexDirection: "row"
                  }}
                  direction="horizontal"
                  damping={50}
                  friction={4}
                  x={offset}
                  outOfBounds={false}
                  onChange={(e) => onChange(task.id, e)}
                  onTouchEnd={() => onTouchEnd(task.id)}
                >
                  {/* 左侧：右滑直接完成 */}
                  <View
                    style={{
                      width: `${ACTION_WIDTH}px`,
                      height: "100%",
                      background: done ? "#9e9e9e" : "#4caf50",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative"
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: "28rpx", fontWeight: 600 }}>
                      {done ? "取消完成" : "完成"}
                    </Text>
                    <View
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "20%",
                        bottom: "20%",
                        width: "2rpx",
                        background: "rgba(255,255,255,0.6)"
                      }}
                    />
                  </View>

                  {/* 中间：卡片内容 */}
                  <View
                    style={{
                      width: `${SCREEN_WIDTH}px`,
                      height: "100%",
                      background: "#fff",
                      padding: "24rpx",
                      boxSizing: "border-box",
                      boxShadow: "0 2rpx 12rpx rgba(0, 0, 0, 0.04)",
                      borderRadius: "16rpx"
                    }}
                    onClick={() => goEdit(task.id)}
                  >
                    <View className="ss-row">
                      <Text style={{ fontSize: "32rpx", fontWeight: 600, color: "#333", flex: 1, textDecoration: done ? "line-through" : "none" }}>
                        {task.title}
                      </Text>
                      <View style={{ display: "flex", alignItems: "center" }}>
                        <Text className={`ss-tag ${status.className}`} style={{ marginRight: "12rpx" }}>
                          {status.text}
                        </Text>
                        <View
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(task.id);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: "48rpx",
                            height: "36rpx",
                            padding: "0 12rpx",
                            background: "rgba(56,72,119,0.08)",
                            borderRadius: "18rpx"
                          }}
                        >
                          <Text style={{ color: "#384877", fontSize: "22rpx" }}>
                            {isExpanded ? "−" : taskSubs.length > 0 ? `+${taskSubs.length}` : "+"}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ marginTop: "12rpx" }}>
                      {task.priority && (
                        <Text className="ss-tag ss-tag-primary">优先级：{priorityMap[task.priority] || task.priority}</Text>
                      )}
                      {task.category && (
                        <Text className="ss-tag ss-tag-primary">{categoryMap[task.category] || task.category}</Text>
                      )}
                      {task.end_time && (
                        <Text className="ss-tag ss-tag-warning">截止 {formatDate(task.end_time)}</Text>
                      )}
                    </View>
                    {task.description ? (
                      <View style={{ marginTop: "12rpx" }}>
                        <Text className="ss-muted">{task.description.slice(0, 60)}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* 右侧：左滑出现的操作按钮 */}
                  <View
                    style={{
                      width: `${ACTION_WIDTH}px`,
                      height: "100%",
                      display: "flex",
                      flexDirection: "row"
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        background: "#4a5d8f",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: "28rpx"
                      }}
                      onClick={() => handleShare(task)}
                    >
                      分享
                    </View>
                    <View
                      style={{
                        flex: 1,
                        background: "#e53935",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: "28rpx"
                      }}
                      onClick={() => handleDelete(task.id)}
                    >
                      删除
                    </View>
                  </View>
                </MovableView>
              </MovableArea>

              {isExpanded && (
                <View
                  style={{
                    marginTop: "8rpx",
                    marginLeft: "36rpx",
                    marginRight: "36rpx"
                  }}
                >
                  {taskSubs.length === 0 ? (
                    <Text className="ss-muted" style={{ fontSize: "24rpx", padding: "8rpx 0" }}>暂无子约定</Text>
                  ) : (
                    taskSubs.map((sub, idx) => {
                      const subDone = sub.status === "completed" || sub.status === "done";
                      return (
                        <View
                          key={sub.id}
                          onClick={() => handleSubtaskToggle(sub)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "8rpx 0"
                          }}
                        >
                          <Text
                            style={{
                              width: "28rpx",
                              height: "28rpx",
                              borderRadius: "50%",
                              border: `2rpx solid ${subDone ? "#999" : "#384877"}`,
                              background: subDone ? "#999" : "transparent",
                              color: "#fff",
                              textAlign: "center",
                              lineHeight: "26rpx",
                              marginRight: "10rpx",
                              fontSize: "18rpx"
                            }}
                          >
                            {subDone ? "✓" : ""}
                          </Text>
                          <Text
                            style={{
                              flex: 1,
                              fontSize: "26rpx",
                              color: subDone ? "#999" : "#666",
                              textDecoration: subDone ? "line-through" : "none"
                            }}
                          >
                            {sub.title}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: "160rpx" }} />
      </ScrollView>

      <Button className="ss-fab" onClick={goCreate}>+</Button>
    </View>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
