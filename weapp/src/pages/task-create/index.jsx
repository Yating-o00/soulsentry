import { useState, useEffect, useRef } from "react";
import Taro, { useShareAppMessage } from "@tarojs/taro";
import { View, Text, Input, Textarea, Picker, Button, ScrollView, Canvas } from "@tarojs/components";
import { get, post, patch, del } from "@/utils/api";
import createQRCode from "@/lib/qrcode";
import VoiceInput from "@/components/VoiceInput";

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

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toISODate(date, time) {
  if (!date) return "";
  const t = time || "00:00";
  // 后端 zod .datetime() 要求带 Z 的 ISO 8601，这里按 Asia/Shanghai 时区转成 UTC 返回
  return new Date(`${date}T${t}:00+08:00`).toISOString();
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildFallbackAutomations(timeline, devices) {
  const list = [];
  if (Array.isArray(timeline) && timeline.length > 0) {
    const first = timeline[0];
    list.push({
      title: "关键节点提醒",
      desc: `在 ${first.date || ""} ${first.time || ""} 提醒「${first.title}」`,
      status: "ready",
      device_id: "phone"
    });
  }
  if (devices?.phone?.strategies?.length) {
    list.push({
      title: "手机协同推送",
      desc: "通过手机推送保持约定进度同步",
      status: "active",
      device_id: "phone"
    });
  }
  if (devices?.watch?.strategies?.length) {
    list.push({
      title: "手表轻提醒",
      desc: "在手表上发送轻量提醒，避免打扰",
      status: "ready",
      device_id: "watch"
    });
  }
  if (list.length === 0) {
    list.push({
      title: "到期前提醒",
      desc: "在约定截止前自动发送提醒",
      status: "ready",
      device_id: "phone"
    });
  }
  return list;
}

export default function TaskCreate() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("23:59");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("09:00");
  const [priorityIndex, setPriorityIndex] = useState(2);
  const [categoryIndex, setCategoryIndex] = useState(7);
  const [analysis, setAnalysis] = useState(null);
  const [shareToken, setShareToken] = useState("");
  const [step, setStep] = useState("form");
  const [parsedHint, setParsedHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdTask, setCreatedTask] = useState(null);
  const [posterUrl, setPosterUrl] = useState("");
  const [posterSize, setPosterSize] = useState(() => {
    try {
      const sys = Taro.getSystemInfoSync();
      const winWidth = sys.windowWidth || 375;
      const width = Math.round(winWidth * 0.9);
      const height = Math.round(width * 840 / 600);
      return { width, height };
    } catch {
      return { width: 600, height: 840 };
    }
  });
  const [editId, setEditId] = useState("");
  const [isEdit, setIsEdit] = useState(false);

  const [subtaskList, setSubtaskList] = useState([]);
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [newChildText, setNewChildText] = useState({});
  const [expandedIds, setExpandedIds] = useState(new Set());

  // 微信小程序订阅消息模板 ID（与后端 .env 保持一致）
  const wechatTmplIds = ["o0Xzec1QIL9CF9C2E4wspUEmfWX04vpBVwXkThQRWHc", "Sq9pF3iv5eiiVL99-odo8oG62XixtDojRMDCWKwchhY"];

  const isFormValid = title.trim().length > 0;

  useEffect(() => {
    const params = Taro.getCurrentInstance().router.params || {};
    const id = params.id;
    const mode = params.mode;
    if (id && mode === "edit") {
      setEditId(id);
      setIsEdit(true);
      loadTask(id);
    }
  }, []);

  const loadSubtasksRecursive = async (parentId) => {
    const subs = await get("/tasks", { parent_task_id: parentId, limit: 200 });
    let result = [];
    for (const sub of subs || []) {
      result.push({ ...sub, _isNew: false, _isDeleted: false, _isModified: false });
      const children = await loadSubtasksRecursive(sub.id);
      result = result.concat(children);
    }
    return result;
  };

  const loadTask = async (id) => {
    setLoading(true);
    try {
      const task = await get(`/tasks/${id}`);
      setTitle(task.title || "");
      setDescription(task.description || "");
      setPriorityIndex(Math.max(0, priorities.findIndex((p) => p.value === task.priority)));
      setCategoryIndex(Math.max(0, categories.findIndex((c) => c.value === task.category)));

      if (task.end_time) {
        const d = new Date(task.end_time);
        if (!isNaN(d.getTime())) {
          setEndDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
          setEndTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
      }
      if (task.reminder_time) {
        const d = new Date(task.reminder_time);
        if (!isNaN(d.getTime())) {
          setReminderDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
          setReminderTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
      }

      const allSubs = await loadSubtasksRecursive(id);
      setSubtaskList(allSubs);
      setExpandedIds(new Set());
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };

  const topSubtasks = () => subtaskList.filter((s) => s.parent_task_id === editId && !s._isDeleted);
  const childSubtasks = (parentId) => subtaskList.filter((s) => s.parent_task_id === parentId && !s._isDeleted);

  const updateSubtask = (id, nextTitle) => {
    setSubtaskList((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: nextTitle, _isModified: !s._isNew } : s))
    );
  };

  const deleteSubtask = (id) => {
    setSubtaskList((prev) =>
      prev.map((s) => {
        if (s.id === id) return { ...s, _isDeleted: true };
        // 删除父约定时，同步删除其下所有二级子约定
        if (s.parent_task_id === id) return { ...s, _isDeleted: true };
        return s;
      })
    );
  };

  const restoreSubtask = (id) => {
    setSubtaskList((prev) =>
      prev.map((s) => {
        if (s.id === id) return { ...s, _isDeleted: false };
        if (s.parent_task_id === id) return { ...s, _isDeleted: false };
        return s;
      })
    );
  };

  const addSubtask = () => {
    const text = newSubtaskText.trim();
    if (!text) return;
    const tempId = `new-${Date.now()}`;
    setSubtaskList((prev) => [
      ...prev,
      {
        id: tempId,
        title: text,
        parent_task_id: editId,
        priority: priorities[priorityIndex].value,
        category: categories[categoryIndex].value,
        status: "pending",
        _isNew: true,
        _isDeleted: false,
        _isModified: false
      }
    ]);
    setNewSubtaskText("");
  };

  const addChildSubtask = (parentId) => {
    const text = (newChildText[parentId] || "").trim();
    if (!text) return;
    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setSubtaskList((prev) => [
      ...prev,
      {
        id: tempId,
        title: text,
        parent_task_id: parentId,
        priority: priorities[priorityIndex].value,
        category: categories[categoryIndex].value,
        status: "pending",
        _isNew: true,
        _isDeleted: false,
        _isModified: false
      }
    ]);
    setNewChildText((prev) => ({ ...prev, [parentId]: "" }));
    setExpandedIds((prev) => new Set(prev).add(parentId));
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveSubtasks = async () => {
    for (const s of subtaskList) {
      if (s._isDeleted) {
        if (!s._isNew) {
          await del(`/tasks/${s.id}`);
        }
        continue;
      }
      if (s._isNew) {
        await post("/tasks", {
          title: s.title.trim(),
          parent_task_id: s.parent_task_id,
          priority: s.priority,
          category: s.category,
          status: s.status
        });
        continue;
      }
      if (s._isModified) {
        await patch(`/tasks/${s.id}`, { title: s.title.trim() });
      }
    }
  };

  const buildLocalAnalysis = () => {
    const input = [title, description].filter(Boolean).join("\n");
    const steps = [
      { text: "梳理约定目标与关键交付物" },
      { text: "拆解可执行的步骤与检查点" },
      { text: "设置提醒，确保按时推进" }
    ];
    const timeline = [
      { time: "09:00", date: endDate || todayStr(), title: "开始处理", description: input.slice(0, 40) }
    ];
    if (endDate) {
      timeline.push({ time: endTime || "23:59", date: endDate, title: "截止交付", description: "完成并检查约定" });
    }
    return {
      resolved_date: endDate || todayStr(),
      steps,
      timeline,
      devices: {
        phone: { name: "手机", strategies: [{ time: "到期前", content: "发送提醒推送" }] }
      },
      automations: buildFallbackAutomations(timeline, { phone: { strategies: [] } }),
      parsed: { times: endDate ? [endDate] : [], intents: [title], locations: [] }
    };
  };

  const analyze = async (voiceText) => {
    const inputText = voiceText || [title, description].filter(Boolean).join("\n");
    if (!inputText.trim()) {
      Taro.showToast({ title: "请先输入约定内容", icon: "none" });
      return;
    }

    setLoading(true);
    let timeoutId = null;
    try {
      const requestPromise = post("/functions/analyzeIntent", {
        input: inputText,
        date: endDate || new Date().toISOString().slice(0, 10)
      });

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("AI 分析超时")), 25000);
      });

      const data = await Promise.race([requestPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      // 兜底：如果后端未返回 automations，根据时间线和设备生成默认建议
      if (!Array.isArray(data.automations) || data.automations.length === 0) {
        data.automations = buildFallbackAutomations(data.timeline, data.devices);
      }

      setAnalysis(data);
      setStep("analysis");
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("analyze failed", err);
      // 超时或失败时使用本地兜底分析
      setAnalysis(buildLocalAnalysis());
      setStep("analysis");
      Taro.showToast({ title: "AI 分析响应较慢，已展示基础建议", icon: "none", duration: 2500 });
    } finally {
      setLoading(false);
    }
  };

  const requestReminderSubscribeSync = () => {
    if (process.env.TARO_ENV !== "weapp" || wechatTmplIds.length === 0) return;
    // 必须在用户点击按钮的同步调用栈内发起，否则微信会拒绝
    wx.requestSubscribeMessage({
      tmplIds: wechatTmplIds,
      success: (res) => {
        console.log("[task-create] subscribe result", res);
      },
      fail: (err) => {
        // 用户拒绝、未配置模板或环境不支持，不影响保存
        console.log("[task-create] subscribe request failed/ignored", err);
      }
    });
  };

  const saveTask = async () => {
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

    const reminderISO = toISODate(reminderDate, reminderTime);
    const endISO = toISODate(endDate, endTime);

    if (reminderISO) payload.reminder_time = reminderISO;
    if (endISO) payload.end_time = endISO;

    setLoading(true);
    try {
      if (isEdit && editId) {
        await patch(`/tasks/${editId}`, payload);
        if (subtaskList.length > 0) {
          await saveSubtasks();
        }
        Taro.showToast({ title: "更新成功", icon: "success" });
        setTimeout(() => Taro.navigateBack(), 500);
        return;
      }

      const task = await post("/tasks", payload);
      setCreatedTask(task);

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

  const drawQRCode = (ctx, text, x, y, size) => {
    try {
      const qr = createQRCode(0, "M");
      qr.addData(text);
      qr.make();
      const count = qr.getModuleCount();
      const cell = size / count;
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          if (qr.isDark(row, col)) {
            ctx.setFillStyle("#1f2937");
            ctx.fillRect(x + col * cell, y + row * cell, cell, cell);
          }
        }
      }
    } catch (err) {
      console.error("QR draw failed", err);
    }
  };

  const generatePoster = () => {
    if (!shareToken) {
      Taro.showToast({ title: "分享链接未生成", icon: "none" });
      return;
    }

    try {
      const { width, height } = posterSize;
      const ctx = Taro.createCanvasContext("shareCanvas");
      const scale = width / 600;

      // 整体缩放，使 600x840 的内容适配到当前屏幕宽度的 90%
      ctx.scale(scale, scale);

      // 背景
      const grd = ctx.createLinearGradient(0, 0, 0, 840);
      grd.addColorStop(0, "#384877");
      grd.addColorStop(1, "#4a5d8f");
      ctx.setFillStyle(grd);
      ctx.fillRect(0, 0, 600, 840);

      // 顶部品牌
      ctx.setFillStyle("#ffffff");
      ctx.setFontSize(28);
      ctx.fillText("SoulSentry", 40, 60);

      // 标题
      ctx.setFontSize(40);
      const displayTitle = title.length > 14 ? title.slice(0, 14) + "…" : title;
      ctx.fillText(displayTitle, 40, 140);

      // 描述
      ctx.setFontSize(26);
      const desc = description || "与你一起守护这个约定";
      const displayDesc = desc.length > 60 ? desc.slice(0, 60) + "…" : desc;
      ctx.fillText(displayDesc, 40, 200);

      // 时间
      const endISO = toISODate(endDate, endTime);
      if (endISO) {
        ctx.setFontSize(24);
        ctx.fillText(`截止时间：${formatDateTime(endISO)}`, 40, 270);
      }

      // 白色内容区
      ctx.setFillStyle("#ffffff");
      ctx.fillRect(40, 320, 520, 360);

      // 内容区文字
      ctx.setFillStyle("#384877");
      ctx.setFontSize(28);
      ctx.fillText("扫码参与约定", 70, 360);

      ctx.setFillStyle("#666666");
      ctx.setFontSize(22);
      ctx.fillText("对方可匿名勾选进度、留言", 70, 650);

      // 二维码
      const link = `https://www.xinzhan-soulsentry.cn/share/${shareToken}`;
      const qrSize = 200;
      const qrX = (600 - qrSize) / 2;
      const qrY = 400;
      ctx.setFillStyle("#ffffff");
      ctx.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
      drawQRCode(ctx, link, qrX, qrY, qrSize);

      // 底部提示
      ctx.setFillStyle("rgba(255,255,255,0.8)");
      ctx.setFontSize(22);
      ctx.fillText("长按识别 · 共同守护", 40, 780);

      ctx.draw(false, () => {
        Taro.canvasToTempFilePath({
          canvasId: "shareCanvas",
          x: 0,
          y: 0,
          width,
          height,
          destWidth: width * 2,
          destHeight: height * 2,
          success: (res) => {
            setPosterUrl(res.tempFilePath);
            Taro.showToast({ title: "卡片已生成", icon: "success" });
          },
          fail: (err) => {
            console.error("canvasToTempFilePath failed", err);
            Taro.showToast({ title: "卡片生成失败", icon: "none" });
          }
        });
      });
    } catch (err) {
      console.error("generate poster failed", err);
      Taro.showToast({ title: "卡片生成失败", icon: "none" });
    }
  };

  const savePoster = () => {
    if (!posterUrl) {
      generatePoster();
      return;
    }
    Taro.saveImageToPhotosAlbum({
      filePath: posterUrl,
      success: () => Taro.showToast({ title: "已保存到相册", icon: "success" }),
      fail: (err) => {
        if (err.errMsg?.includes("auth deny")) {
          Taro.showModal({
            title: "需要授权",
            content: "请允许保存图片到相册",
            showCancel: false
          });
        }
      }
    });
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

  useShareAppMessage(() => {
    if (!shareToken) return { title: "SoulSentry 约定" };
    return {
      title: `邀你一起守护：${title}`,
      path: `/pages/share/index?token=${shareToken}`
    };
  });

  useEffect(() => {
    if (step === "created" && shareToken && !posterUrl) {
      // 延迟生成，确保 canvas 已渲染
      const timer = setTimeout(generatePoster, 300);
      return () => clearTimeout(timer);
    }
  }, [step, shareToken, posterUrl]);

  const renderSubtaskEditor = () => {
    if (!isEdit) return null;

    const renderItem = (sub, depth = 0) => {
      const isDeleted = sub._isDeleted;
      const children = childSubtasks(sub.id);
      const isExpanded = expandedIds.has(sub.id);

      return (
        <View key={sub.id} style={{ marginBottom: "12rpx" }}>
          <View style={{ display: "flex", alignItems: "center", paddingLeft: `${depth * 36}rpx` }}>
            <View
              onClick={() => toggleExpand(sub.id)}
              style={{
                width: "36rpx",
                height: "36rpx",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Text style={{ color: "#384877", fontSize: "26rpx" }}>{isExpanded ? "−" : "+"}</Text>
            </View>
            <Input
              className="ss-input"
              style={{
                flex: 1,
                height: "68rpx",
                marginRight: "12rpx",
                textDecoration: isDeleted ? "line-through" : "none",
                color: isDeleted ? "#999" : "#333",
                background: isDeleted ? "#f0f0f0" : "#f8f9fb"
              }}
              value={sub.title}
              disabled={isDeleted}
              onInput={(e) => updateSubtask(sub.id, e.detail.value)}
            />
            {isDeleted ? (
              <Text
                onClick={() => restoreSubtask(sub.id)}
                style={{ color: "#384877", fontSize: "24rpx", padding: "0 8rpx" }}
              >
                恢复
              </Text>
            ) : (
              <View
                onClick={() => deleteSubtask(sub.id)}
                style={{
                  width: "44rpx",
                  height: "44rpx",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Text style={{ color: "#e53935", fontSize: "36rpx", lineHeight: "36rpx" }}>×</Text>
              </View>
            )}
          </View>

          {isExpanded && (
            <View style={{ marginTop: "8rpx", paddingLeft: `${(depth + 1) * 36}rpx` }}>
              {children.map((child) => renderItem(child, depth + 1))}
              <View style={{ display: "flex", alignItems: "center", marginTop: "8rpx" }}>
                <Input
                  className="ss-input"
                  style={{ flex: 1, height: "60rpx", marginRight: "12rpx" }}
                  placeholder="二级子约定"
                  value={newChildText[sub.id] || ""}
                  onInput={(e) => setNewChildText((prev) => ({ ...prev, [sub.id]: e.detail.value }))}
                />
                <Button className="ss-btn ss-btn-sm" style={{ height: "56rpx", lineHeight: "56rpx" }} onClick={() => addChildSubtask(sub.id)}>
                  添加
                </Button>
              </View>
            </View>
          )}
        </View>
      );
    };

    return (
      <View style={{ marginTop: "32rpx" }}>
        <View className="ss-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Text>子约定</Text>
          <Text className="ss-muted" style={{ fontSize: "22rpx" }}>{topSubtasks().length} 个</Text>
        </View>
        {topSubtasks().length === 0 && (
          <View className="ss-empty" style={{ padding: "16rpx 0" }}>暂无子约定</View>
        )}
        {topSubtasks().map((sub) => renderItem(sub, 0))}

        <View style={{ display: "flex", alignItems: "center", marginTop: "16rpx" }}>
          <Input
            className="ss-input"
            style={{ flex: 1, height: "68rpx", marginRight: "12rpx" }}
            placeholder="添加一个子约定"
            value={newSubtaskText}
            onInput={(e) => setNewSubtaskText(e.detail.value)}
          />
          <Button className="ss-btn ss-btn-sm" style={{ height: "56rpx", lineHeight: "56rpx" }} onClick={addSubtask}>
            添加
          </Button>
        </View>
      </View>
    );
  };

  const createTaskFromVoice = async (parsed) => {
    setLoading(true);
    try {
      const payload = {
        title: parsed.title?.trim(),
        description: parsed.description?.trim() || undefined,
        priority: parsed.priority || "medium",
        category: parsed.category || "other"
      };
      if (parsed.reminder_time) payload.reminder_time = parsed.reminder_time;
      if (parsed.end_time) payload.end_time = parsed.end_time;

      const task = await post("/tasks", payload);
      setCreatedTask(task);

      try {
        const share = await post(`/public/share/generate/task/${task.id}`);
        setShareToken(share.token || "");
      } catch (shareErr) {
        console.error("generate share failed", shareErr);
      }

      Taro.showToast({ title: "约定已创建", icon: "success" });
      setStep("created");
    } catch (err) {
      // handled globally
    } finally {
      setLoading(false);
    }
  };



  const setDateTimeFromISO = (iso, setDate, setTime) => {
    if (!iso) return;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    }
  };

  const applyParsedFields = (parsed, opts = {}) => {
    if (!parsed) return;

    // 标题/描述：如果是语音失败兜底或用户没输入，才覆盖
    if (opts.forceTitle || !title.trim()) {
      setTitle(parsed.title || "");
    }
    if (opts.forceDescription || !description.trim()) {
      setDescription(parsed.description || "");
    }

    // 优先级/分类：只在当前为默认值或为空时覆盖
    const priorityIdx = priorities.findIndex((p) => p.value === parsed.priority);
    const categoryIdx = categories.findIndex((c) => c.value === parsed.category);
    if (priorityIdx >= 0 && (priorityIndex === 2 || opts.forcePriority)) {
      setPriorityIndex(priorityIdx);
    }
    if (categoryIdx >= 0 && (categoryIndex === 7 || opts.forceCategory)) {
      setCategoryIndex(categoryIdx);
    }

    // 时间：只在未设置时回填，避免覆盖用户手动选择
    if (!reminderDate || opts.forceTime) {
      setDateTimeFromISO(parsed.reminder_time, setReminderDate, setReminderTime);
    }
    if (!endDate || opts.forceTime) {
      setDateTimeFromISO(parsed.end_time, setEndDate, setEndTime);
    }

    // 提示
    const hints = [];
    if (parsed.location) hints.push(`地点：${parsed.location}`);
    if (parsed.event_type) hints.push(`类型：${parsed.event_type}`);
    if (parsed.time_source === "common_sense") hints.push("已按生活常识填充时间");
    else if (parsed.time_source === "now") hints.push("未识别到时间，已设为当前时间");
    if (hints.length > 0) setParsedHint(hints.join(" · "));
  };

  const parseInput = async (text, opts = {}) => {
    const inputText = String(text || title).trim();
    if (!inputText) return;

    setLoading(true);
    try {
      const parsed = await post("/functions/parseTaskInput", { input: inputText, date: todayStr() });
      applyParsedFields(parsed, opts);
    } catch (err) {
      console.error("parseTaskInput failed", err);
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceResult = async (text) => {
    if (!text.trim()) return;
    await parseInput(text, { forceTitle: true, forceDescription: true, forceTime: true, forcePriority: true, forceCategory: true });
    Taro.showToast({ title: "已填入语音内容，请确认后创建", icon: "none", duration: 2000 });
  };

  const handleInputBlur = () => {
    // 仅在新建模式、标题非空、提醒日期未手动设置时自动解析
    if (isEdit || !title.trim() || reminderDate) return;
    parseInput();
  };

  const handleVoiceTouchStart = () => {
    // 在用户主动按下语音按钮的同步调用栈内请求订阅授权
    requestReminderSubscribeSync();
  };

  const renderForm = () => (
    <View className="ss-card">
      <View className="ss-title">{isEdit ? "编辑约定" : "新建约定"}</View>
      <View className="ss-subtitle">{isEdit ? "修改约定信息" : "输入约定后，可先让 SoulSentry 帮你分析时间线与执行策略。"}</View>

      {!isEdit && (
        <View style={{ marginTop: "32rpx", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <VoiceInput
            onResult={handleVoiceResult}
            onTouchStart={handleVoiceTouchStart}
            onError={(err) => Taro.showToast({ title: err, icon: "none" })}
          />
        </View>
      )}

      {parsedHint ? (
        <View
          style={{
            marginTop: "24rpx",
            padding: "14rpx 18rpx",
            borderRadius: "12rpx",
            background: "#f0f5fa",
            border: "1rpx solid #d4e4f0"
          }}
        >
          <Text style={{ fontSize: "24rpx", color: "#5b82a0" }}>🪄 {parsedHint}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: "24rpx" }}>
        <View className="ss-label">标题 *</View>
        <Input
          className="ss-input"
          placeholder="例如：周五前完成报告 / 明天下午3点开会 / 记得吃早餐"
          value={title}
          onInput={(e) => setTitle(e.detail.value)}
          onBlur={handleInputBlur}
        />
      </View>

      <View style={{ marginTop: "24rpx" }}>
        <View className="ss-label">描述</View>
        <Textarea
          className="ss-textarea"
          placeholder="补充说明（可选），也可在这里补充时间、地点"
          value={description}
          onInput={(e) => setDescription(e.detail.value)}
          onBlur={handleInputBlur}
        />
      </View>

      {!isEdit && (
        <Button
          className="ss-btn ss-btn-plain"
          loading={loading}
          disabled={loading || !title.trim()}
          onClick={() => parseInput(undefined, { forceTime: true })}
        >
          🪄 智能识别时间地点
        </Button>
      )}

      {isEdit && renderSubtaskEditor()}

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
        <View className="ss-label">截止时间</View>
        <View style={{ display: "flex" }}>
          <Picker mode="date" value={endDate || todayStr()} onChange={(e) => setEndDate(e.detail.value)}>
            <View className="ss-input" style={{ display: "flex", alignItems: "center", marginRight: "16rpx" }}>
              <Text>{endDate || "选择日期"}</Text>
            </View>
          </Picker>
          <Picker mode="time" value={endTime} onChange={(e) => setEndTime(e.detail.value)}>
            <View className="ss-input" style={{ display: "flex", alignItems: "center" }}>
              <Text>{endTime}</Text>
            </View>
          </Picker>
        </View>
      </View>

      <View style={{ marginTop: "24rpx" }}>
        <View className="ss-label">提醒时间</View>
        <View style={{ display: "flex" }}>
          <Picker mode="date" value={reminderDate || todayStr()} onChange={(e) => setReminderDate(e.detail.value)}>
            <View className="ss-input" style={{ display: "flex", alignItems: "center", marginRight: "16rpx" }}>
              <Text>{reminderDate || "选择日期"}</Text>
            </View>
          </Picker>
          <Picker mode="time" value={reminderTime} onChange={(e) => setReminderTime(e.detail.value)}>
            <View className="ss-input" style={{ display: "flex", alignItems: "center" }}>
              <Text>{reminderTime}</Text>
            </View>
          </Picker>
        </View>
      </View>

      {!isEdit && (
        <Button className="ss-btn ss-btn-plain" loading={loading} disabled={loading || !isFormValid} onClick={analyze}>
          🤖 AI 分析并预览
        </Button>
      )}
      <Button
        className="ss-btn"
        loading={loading}
        disabled={loading || !isFormValid}
        onClick={() => {
          if (toISODate(reminderDate, reminderTime)) requestReminderSubscribeSync();
          saveTask();
        }}
      >
        {isEdit ? "保存修改" : "直接创建"}
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
        <Button
          className="ss-btn"
          loading={loading}
          disabled={loading}
          onClick={() => {
            if (toISODate(reminderDate, reminderTime)) requestReminderSubscribeSync();
            saveTask();
          }}
        >
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
        <View className="ss-title">分享卡片</View>
        <Text className="ss-subtitle">生成分享卡片，保存到相册或转发给伙伴。</Text>

        {shareToken ? (
          <View>
            <Canvas
              canvasId="shareCanvas"
              style={{
                width: `${posterSize.width}px`,
                height: `${posterSize.height}px`,
                margin: "24rpx auto",
                borderRadius: "16rpx",
                boxShadow: "0 4rpx 20rpx rgba(0,0,0,0.1)"
              }}
            />
            <Button className="ss-btn" onClick={savePoster}>保存分享卡片</Button>
            <Button className="ss-btn ss-btn-plain" openType="share">微信转发</Button>
            <Button className="ss-btn ss-btn-plain" onClick={copyShareLink}>复制链接</Button>
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
