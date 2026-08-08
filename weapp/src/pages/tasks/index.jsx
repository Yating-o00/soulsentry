import { useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Button, MovableArea, MovableView } from "@tarojs/components";
import { get, del, patch } from "@/utils/api";

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

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const data = await get("/tasks", { sort: "-created_date", limit: 200 });
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      setTasks([]);
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
          return (
            <MovableArea
              key={task.id}
              style={{ width: "100%", height: "200rpx", marginBottom: "20rpx" }}
            >
              <View
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  display: "flex",
                  flexDirection: "row",
                  zIndex: 1
                }}
              >
                <View
                  style={{
                    width: "120rpx",
                    background: "#384877",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "28rpx"
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    goEdit(task.id);
                  }}
                >
                  编辑
                </View>
                <View
                  style={{
                    width: "120rpx",
                    background: "#e53935",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "28rpx"
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(task.id);
                  }}
                >
                  删除
                </View>
              </View>

              <MovableView
                style={{ width: "100%", height: "100%", zIndex: 2, background: "#fff" }}
                direction="horizontal"
                damping={40}
                friction={4}
                x={0}
                outOfBounds={false}
              >
                <View
                  className="ss-card"
                  style={{ marginBottom: 0, height: "100%", boxSizing: "border-box" }}
                  onClick={() => goDetail(task.id)}
                >
                  <View className="ss-row">
                    <Text style={{ fontSize: "32rpx", fontWeight: 600, color: "#333", flex: 1, textDecoration: done ? "line-through" : "none" }}>
                      {task.title}
                    </Text>
                    <Text className={`ss-tag ${status.className}`}>{status.text}</Text>
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
              </MovableView>
            </MovableArea>
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
