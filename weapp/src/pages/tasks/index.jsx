import { useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Button } from "@tarojs/components";
import { get } from "@/utils/api";

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
          return (
            <View
              key={task.id}
              className="ss-card"
              onClick={() => goDetail(task.id)}
            >
              <View className="ss-row">
                <Text style={{ fontSize: "32rpx", fontWeight: 600, color: "#333", flex: 1 }}>
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
              </View>
              {task.description ? (
                <View style={{ marginTop: "12rpx" }}>
                  <Text className="ss-muted">{task.description.slice(0, 80)}</Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={{ height: "160rpx" }} />
      </ScrollView>

      <Button className="ss-fab" onClick={goCreate}>+</Button>
    </View>
  );
}
