import { useState, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Button } from "@tarojs/components";
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

const ACTION_WIDTH = 360; // rpx

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const currentOffset = useRef(0);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      // 只查询顶层约定，不返回子约定
      const data = await get("/tasks", { parent_task_id: "", sort: "-created_date", limit: 200 });
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
    if (openId) {
      setOpenId(null);
      return;
    }
    Taro.navigateTo({ url: `/pages/task-detail/index?id=${id}` });
  };

  const goEdit = (id, e) => {
    e?.stopPropagation?.();
    setOpenId(null);
    Taro.navigateTo({ url: `/pages/task-create/index?id=${id}&mode=edit` });
  };

  const handleShare = async (task, e) => {
    e?.stopPropagation?.();
    setOpenId(null);
    try {
      const share = await post(`/public/share/generate/task/${task.id}`);
      const link = `https://www.xinzhan-soulsentry.cn/share/${share.token}`;
      Taro.setClipboardData({
        data: link,
        success: () => Taro.showToast({ title: "分享链接已复制", icon: "success" })
      });
    } catch (err) {
      Taro.showToast({ title: "分享生成失败", icon: "none" });
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation?.();
    setOpenId(null);
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

  const handleQuickComplete = async (task, e) => {
    e?.stopPropagation?.();
    const nextStatus = task.status === "completed" || task.status === "done" ? "pending" : "completed";
    try {
      await patch(`/tasks/${task.id}`, { status: nextStatus });
      fetchTasks();
    } catch (err) {
      // handled globally
    }
  };

  const onTouchStart = (taskId, e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    currentOffset.current = openId === taskId ? -ACTION_WIDTH : 0;
  };

  const onTouchMove = (taskId, e) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // 如果纵向滑动占优，不处理横向滑动
    if (Math.abs(dy) > Math.abs(dx)) return;

    // 阻止默认滚动
    // e.preventDefault?.(); // 小程序中可能无效

    let offset = currentOffset.current + dx;
    if (offset > 0) offset = 0;
    if (offset < -ACTION_WIDTH) offset = -ACTION_WIDTH;

    const el = e.currentTarget;
    if (el) {
      el.style.transform = `translateX(${offset}rpx)`;
      el.style.transition = "none";
    }
  };

  const onTouchEnd = (taskId, e) => {
    const el = e.currentTarget;
    if (!el) return;

    const transform = el.style.transform || "";
    const match = transform.match(/translateX\(([-\d.]+)rpx\)/);
    const offset = match ? Number(match[1]) : 0;

    const shouldOpen = offset < -ACTION_WIDTH / 2;

    if (shouldOpen) {
      setOpenId(taskId);
      el.style.transform = `translateX(${-ACTION_WIDTH}rpx)`;
    } else {
      setOpenId(null);
      el.style.transform = "translateX(0rpx)";
    }
    el.style.transition = "transform 0.2s ease";
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
            <View
              key={task.id}
              style={{
                position: "relative",
                marginBottom: "20rpx",
                overflow: "hidden",
                borderRadius: "16rpx"
              }}
            >
              {/* 背景操作按钮 */}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  display: "flex",
                  flexDirection: "row",
                  zIndex: 1
                }}
              >
                <View
                  style={{
                    width: "120rpx",
                    background: "#4a5d8f",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "28rpx"
                  }}
                  onClick={(e) => handleShare(task, e)}
                >
                  分享
                </View>
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
                  onClick={(e) => goEdit(task.id, e)}
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
                  onClick={(e) => handleDelete(task.id, e)}
                >
                  删除
                </View>
              </View>

              {/* 前景卡片 */}
              <View
                className="ss-card"
                style={{
                  marginBottom: 0,
                  position: "relative",
                  zIndex: 2,
                  transform: openId === task.id ? `translateX(${-ACTION_WIDTH}rpx)` : "translateX(0rpx)",
                  transition: "transform 0.2s ease"
                }}
                onClick={() => goDetail(task.id)}
                onTouchStart={(e) => onTouchStart(task.id, e)}
                onTouchMove={(e) => onTouchMove(task.id, e)}
                onTouchEnd={(e) => onTouchEnd(task.id, e)}
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
