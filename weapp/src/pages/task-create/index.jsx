import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Textarea, Picker, Button } from "@tarojs/components";
import { post } from "@/utils/api";

const priorities = [
  { value: "urgent", label: "紧急" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" }
];

const categories = [
  { value: "work", label: "工作" },
  { value: "personal", label: "个人" },
  { value: "health", label: "健康" },
  { value: "study", label: "学习" },
  { value: "family", label: "家庭" },
  { value: "shopping", label: "购物" },
  { value: "finance", label: "财务" },
  { value: "other", label: "其他" }
];

export default function TaskCreate() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [priorityIndex, setPriorityIndex] = useState(2);
  const [categoryIndex, setCategoryIndex] = useState(7);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: "请输入标题", icon: "none" });
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority: priorities[priorityIndex].value,
      category: categories[categoryIndex].value
    };

    if (reminderTime.trim()) {
      payload.reminder_time = reminderTime.trim();
    }
    if (endTime.trim()) {
      payload.end_time = endTime.trim();
    }

    setLoading(true);
    try {
      await post("/tasks", payload);
      Taro.showToast({ title: "创建成功", icon: "success" });
      setTimeout(() => {
        Taro.navigateBack();
      }, 500);
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="ss-page">
      <View className="ss-card">
        <View className="ss-title">新建约定</View>

        <View style={{ marginTop: "24rpx" }}>
          <View className="ss-label">标题 *</View>
          <Input
            className="ss-input"
            placeholder="例如：周五前完成报告"
            value={title}
            onInput={(e) => setTitle(e.detail.value)}
          />
        </View>

        <View style={{ marginTop: "24rpx" }}>
          <View className="ss-label">描述</View>
          <Textarea
            className="ss-textarea"
            placeholder="补充说明（可选）"
            value={description}
            onInput={(e) => setDescription(e.detail.value)}
          />
        </View>

        <View style={{ marginTop: "24rpx" }}>
          <View className="ss-label">优先级</View>
          <Picker
            mode="selector"
            range={priorities.map((p) => p.label)}
            value={priorityIndex}
            onChange={(e) => setPriorityIndex(Number(e.detail.value))}
          >
            <View className="ss-input" style={{ display: "flex", alignItems: "center" }}>
              <Text>{priorities[priorityIndex].label}</Text>
            </View>
          </Picker>
        </View>

        <View style={{ marginTop: "24rpx" }}>
          <View className="ss-label">分类</View>
          <Picker
            mode="selector"
            range={categories.map((c) => c.label)}
            value={categoryIndex}
            onChange={(e) => setCategoryIndex(Number(e.detail.value))}
          >
            <View className="ss-input" style={{ display: "flex", alignItems: "center" }}>
              <Text>{categories[categoryIndex].label}</Text>
            </View>
          </Picker>
        </View>

        <View style={{ marginTop: "24rpx" }}>
          <View className="ss-label">提醒时间（ISO 格式，可选）</View>
          <Input
            className="ss-input"
            placeholder="2026-08-07T09:00:00"
            value={reminderTime}
            onInput={(e) => setReminderTime(e.detail.value)}
          />
        </View>

        <View style={{ marginTop: "24rpx" }}>
          <View className="ss-label">结束时间（ISO 格式，可选）</View>
          <Input
            className="ss-input"
            placeholder="2026-08-07T18:00:00"
            value={endTime}
            onInput={(e) => setEndTime(e.detail.value)}
          />
        </View>

        <Button className="ss-btn" loading={loading} disabled={loading} onClick={submit}>
          创建
        </Button>
      </View>
    </View>
  );
}
