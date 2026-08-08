import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Textarea, Picker, Button, ScrollView } from "@tarojs/components";
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

const DEVICE_ICONS = {
  phone: "📱",
  watch: "⌚",
  glasses: "🕶️",
  car: "🚗",
  home: "🏠",
  pc: "💻"
};

const STATUS_LABEL = {
  active: "进行中",
  ready: "已就绪",
  monitoring: "监控中",
  pending: "待触发"
};

export default function TaskCreate() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [priorityIndex, setPriorityIndex] = useState(2);
  const [categoryIndex, setCategoryIndex] = useState(7);
  const [analysis, setAnalysis] = useState(null);
  const [shareToken, setShareToken] = useState("");
  const [step, setStep] = useState("form");
  const [loading, setLoading] = useState(false);
  const [createdTask, setCreatedTask] = useState(null);

  const isFormValid = title.trim().length > 0;

  const analyze = async () => {
    if (!isFormValid) {
      Taro.showToast({ title: "请先输入约定内容", icon: "none" });
      return;
    }

    setLoading(true);
    try {
      const input = [title, description].filter(Boolean).join("\n");
      const data = await post("/functions/analyzeIntent", {
        input,
        date: new Date().toISOString().slice(0, 10)
      });
      setAnalysis(data);
      setStep("analysis");
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  const createTask = async () => {
    if (!isFormValid) {
      Taro.showToast({ title: "请输入标题", icon: "none" });
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority: priorities[priorityIndex].value,
      category: categories[categoryIndex].value
    };

    if (reminderTime.trim()) payload.reminder_time = reminderTime.trim();
    if (endTime.trim()) payload.end_time = endTime.trim();

    setLoading(true);
    try {
      const task = await post("/tasks", payload);
      setCreatedTask(task);

      // 生成分享 token
      try {
        const share = await post(`/public/share/generate/task/${task.id}`);
        setShareToken(share.token || "");
      } catch (shareErr) {
        console.error("generate share failed", shareErr);
      }

      setStep("created");
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  const copyShareLink = () => {
    if (!shareToken) return;
    const link = `https://www.xinzhan-soulsentry.cn/share/${shareToken}`;
    Taro.setClipboardData({
      data: link,
      success: () => Taro.showToast({ title: "分享链接已复制", icon: "success" })
    });
  };

  const goBack = () => {
    Taro.navigateBack();
  };

  const renderForm = () => (
    <View className="ss-card">
      <View className="ss-title">新建约定</View>
      <View className="ss-subtitle">输入约定后，可先让 SoulSentry 帮你分析时间线与执行策略。</View>

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

      <Button className="ss-btn ss-btn-plain" loading={loading} disabled={loading || !isFormValid} onClick={analyze}>
        🤖 AI 分析并预览
      </Button>
      <Button className="ss-btn" loading={loading} disabled={loading || !isFormValid} onClick={createTask}>
        直接创建
      </Button>
    </View>
  );

  const renderAnalysis = () => (
    <View>
      <View className="ss-card">
        <View className="ss-title">AI 分析结果</View>
        <Text className="ss-subtitle">基于你的约定，SoulSentry 给出的执行建议</Text>

        {analysis?.resolved_date && (
          <View style={{ marginTop: "16rpx" }}>
            <Text className="ss-tag ss-tag-primary">预计完成日期：{analysis.resolved_date}</Text>
          </View>
        )}
      </View>

      {Array.isArray(analysis?.steps) && analysis.steps.length > 0 && (
        <View className="ss-card">
          <View className="ss-section-title">建议步骤</View>
          {analysis.steps.map((step, idx) => (
            <View key={idx} style={{ display: "flex", marginBottom: "16rpx", alignItems: "flex-start" }}>
              <Text style={{ color: "#384877", fontWeight: 600, marginRight: "12rpx", fontSize: "30rpx" }}>{idx + 1}.</Text>
              <Text style={{ fontSize: "30rpx", color: "#333", lineHeight: "48rpx", flex: 1 }}>{step.text || step}</Text>
            </View>
          ))}
        </View>
      )}

      {Array.isArray(analysis?.timeline) && analysis.timeline.length > 0 && (
        <View className="ss-card">
          <View className="ss-section-title">时间线</View>
          {analysis.timeline.map((item, idx) => (
            <View key={idx} style={{ marginBottom: "20rpx", paddingBottom: "20rpx", borderBottom: "1rpx solid #e5e6eb" }}>
              <View style={{ display: "flex", justifyContent: "space-between", marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "30rpx", color: "#384877", fontWeight: 500 }}>{item.title}</Text>
                <Text className="ss-muted">{item.time}</Text>
              </View>
              {item.description && <Text className="ss-muted">{item.description}</Text>}
            </View>
          ))}
        </View>
      )}

      {analysis?.devices && Object.keys(analysis.devices).length > 0 && (
        <View className="ss-card">
          <View className="ss-section-title">多设备协同</View>
          {Object.entries(analysis.devices).map(([key, device]) => {
            if (!device?.strategies?.length) return null;
            return (
              <View key={key} style={{ marginBottom: "20rpx" }}>
                <View style={{ display: "flex", alignItems: "center", marginBottom: "12rpx" }}>
                  <Text style={{ fontSize: "32rpx", marginRight: "12rpx" }}>{DEVICE_ICONS[key] || "🔹"}</Text>
                  <Text style={{ fontSize: "30rpx", fontWeight: 600, color: "#333" }}>{device.name || key}</Text>
                </View>
                {device.strategies.map((s, i) => (
                  <View key={i} style={{ marginLeft: "44rpx", marginBottom: "8rpx" }}>
                    <Text style={{ fontSize: "28rpx", color: "#666" }}>• {s.time ? `${s.time} · ` : ""}{s.content || s.method || JSON.stringify(s)}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}

      {Array.isArray(analysis?.automations) && analysis.automations.length > 0 && (
        <View className="ss-card">
          <View className="ss-section-title">自动化建议</View>
          {analysis.automations.map((item, idx) => (
            <View key={idx} style={{ marginBottom: "16rpx", padding: "16rpx", background: "#f8f9fb", borderRadius: "12rpx" }}>
              <View style={{ display: "flex", justifyContent: "space-between", marginBottom: "8rpx" }}>
                <Text style={{ fontSize: "30rpx", fontWeight: 600, color: "#333" }}>{item.title}</Text>
                <Text className={`ss-tag ${item.status === "active" ? "ss-tag-success" : "ss-tag-warning"}`}>
                  {STATUS_LABEL[item.status] || item.status}
                </Text>
              </View>
              <Text className="ss-muted">{item.desc}</Text>
            </View>
          ))}
        </View>
      )}

      <View className="ss-card">
        <Button className="ss-btn" loading={loading} disabled={loading} onClick={createTask}>
          创建约定
        </Button>
        <Button className="ss-btn ss-btn-plain" onClick={() => setStep("form")}>
          返回修改
        </Button>
      </View>
    </View>
  );

  const renderCreated = () => (
    <View>
      <View className="ss-card" style={{ textAlign: "center", padding: "48rpx 24rpx" }}>
        <View style={{ fontSize: "64rpx", marginBottom: "16rpx" }}>✅</View>
        <View className="ss-title">约定已创建</View>
        <Text className="ss-muted">{createdTask?.title}</Text>
      </View>

      <View className="ss-card">
        <View className="ss-title">分享给伙伴</View>
        <Text className="ss-subtitle">把约定分享给朋友，对方可以匿名勾选进度、留言。</Text>

        {shareToken ? (
          <View>
            <View
              style={{
                background: "#f8f9fb",
                borderRadius: "12rpx",
                padding: "20rpx",
                marginTop: "24rpx",
                wordBreak: "break-all"
              }}
            >
              <Text style={{ fontSize: "28rpx", color: "#384877" }}>
                https://www.xinzhan-soulsentry.cn/share/{shareToken}
              </Text>
            </View>
            <Button className="ss-btn" onClick={copyShareLink}>复制分享链接</Button>
          </View>
        ) : (
          <Text className="ss-muted" style={{ marginTop: "24rpx" }}>分享链接生成失败，可在约定详情页重试。</Text>
        )}
      </View>

      <Button className="ss-btn ss-btn-plain" onClick={goBack}>完成</Button>
    </View>
  );

  return (
    <View className="ss-page">
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        {step === "form" && renderForm()}
        {step === "analysis" && renderAnalysis()}
        {step === "created" && renderCreated()}
        <View style={{ height: "40rpx" }} />
      </ScrollView>
    </View>
  );
}
