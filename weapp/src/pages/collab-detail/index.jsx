// 协同约定详情（小程序端）：与 Web 端 CollabSpace 对齐的三个模块
// 【执行概览】目标/成员/进度 + 执行节点 + 沉淀文档 + 最近动态
// 【共同讨论】讨论消息流（与 Web 会话窗同一 /comments 数据）
// 【子约定】整棵树：草案勾选=确认、勾掉=否决；进行中勾选=完成
import { useState, useEffect, useMemo, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, Input, Button, ScrollView, Image } from "@tarojs/components";
import { get, post, patch, del, absoluteUrl } from "@/utils/api";
import { getToken } from "@/utils/auth";
import { useShare } from "@/hooks/useShare";
import { isEffectivelyDone } from "@/utils/recurrence";

const SCENARIO_LABELS = {
  couple: "情侣约定",
  friends: "朋友约定",
  colleagues: "同事约定",
  custom: "自定义约定",
};

const DOC_TYPE_LABELS = {
  consensus: "共识",
  dispute: "分歧",
  minutes: "纪要",
  decision: "决定",
  review: "复盘",
  digest: "摘要",
  file: "文件",
};

const NODE_TYPE_LABELS = {
  stage: "阶段",
  milestone: "里程碑",
};

const TABS = [
  { id: "overview", label: "执行概览" },
  { id: "discussion", label: "共同讨论" },
  { id: "subtasks", label: "子约定" },
];

// 子约定树展平（summary.subtasks 逐级嵌套）
const flattenTree = (nodes, depth = 0, out = []) => {
  (nodes || []).forEach((n) => {
    out.push({ node: n, depth });
    flattenTree(n.children, depth + 1, out);
  });
  return out;
};

const fmtTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function CollabDetail() {
  const taskId = Taro.getCurrentInstance().router.params.id;
  useShare({
    title: "心栈协同约定",
    path: "pages/tasks/index",
    buildShare: () => (summary?.task
      ? { title: `协同约定 · ${String(summary.task.title || "").slice(0, 18)}`, path: `pages/collab-detail/index?id=${taskId}` }
      : {}),
  });

  const [summary, setSummary] = useState(null);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("overview");

  // 共同讨论
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  // 主题窗口：每个主题是一间独立讨论；全部窗口汇总所有主题
  const [topicFilter, setTopicFilter] = useState("all");
  const [createdTopics, setCreatedTopics] = useState([]);
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [topicSaving, setTopicSaving] = useState(false);
  // 待发附件（与 Web 会话窗同字段 {url,name,type,size}，随消息一并提交）
  const [msgAttachments, setMsgAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  // 执行节点
  const [nodeText, setNodeText] = useState("");
  const [nodeBusy, setNodeBusy] = useState(false);

  // 子约定
  const [subText, setSubText] = useState("");
  const [subBusy, setSubBusy] = useState(false);
  const [busyId, setBusyId] = useState(""); // confirm/reject/toggle 中的子约定 id

  // 成员管理（仅发起人）
  const [memberBusy, setMemberBusy] = useState("");

  // 邀请伙伴：创建邀请后生成小程序内转发卡片（受邀者在小程序内同账号接受，避免绑到体验账号）
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteShare, setInviteShare] = useState(null); // { code, name }

  const meRequestedRef = useRef(false);

  const fetchSummary = async ({ silent = true } = {}) => {
    const d = await get(`/collab/${taskId}/summary`, {}, { silent: true }).catch((err) => {
      if (!silent) throw err;
      return null;
    });
    if (d) {
      setSummary(d);
      setLoadError("");
    }
    return d;
  };

  const fetchMessages = async () => {
    const list = await get("/comments", { task_id: taskId, sort: "created_date", limit: 300 }, { silent: true }).catch(() => null);
    if (Array.isArray(list)) setMessages(list);
  };

  const fetchAll = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const d = await get(`/collab/${taskId}/summary`);
      setSummary(d);
      setLoadError("");
      fetchMessages();
    } catch (err) {
      setLoadError(err?.message || "无法打开协同约定");
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    fetchAll();
  });

  useEffect(() => {
    fetchAll();
    if (!meRequestedRef.current) {
      meRequestedRef.current = true;
      get("/users/me", {}, { silent: true }).then(setMe).catch(() => {});
    }
  }, [taskId]);

  // 变更后通知约定列表页定向刷新对应卡片
  const notifyChanged = () => {
    Taro.eventCenter.trigger("task:subtasks-changed", { taskId });
  };

  const task = summary?.task;
  const collab = task?.metadata?.collab;
  const members = summary?.members || [];
  const isOwner = Boolean(me?.id && members.find((m) => m.role === "owner")?.user_id === me.id);
  const nodes = summary?.nodes || [];
  const docs = summary?.docs || [];
  const stats = summary?.stats || {};
  const flatSubs = useMemo(() => flattenTree(summary?.subtasks), [summary?.subtasks]);
  const subDoneCount = flatSubs.filter(({ node }) => isEffectivelyDone(node)).length;
  const nodesDoneCount = nodes.filter((n) => n.done_at).length;

  // 主题窗口：已保存的空主题 + 消息里出现过的主题
  const topics = useMemo(() => {
    const out = [];
    const add = (name) => {
      const value = typeof name === "string" ? name.trim() : "";
      if (value && !out.includes(value)) out.push(value);
    };
    (Array.isArray(collab?.topics) ? collab.topics : []).forEach(add);
    messages.forEach((m) => add(m.topic));
    createdTopics.forEach(add);
    return out;
  }, [collab?.topics, messages, createdTopics]);
  const filteredMessages = useMemo(
    () => (topicFilter === "all" ? messages : messages.filter((m) => m.topic === topicFilter)),
    [messages, topicFilter]
  );

  // ── 共同讨论 ──
  // 附件上传：与主输入栏同一 /uploads 接口，返回后映射为讨论附件字段 {url,name,type,size}
  const uploadToServer = async (filePath) => {
    const token = getToken();
    const rawApi = process.env.TARO_APP_API || "https://www.xinzhan-soulsentry.cn/api";
    const apiBase = rawApi.replace(/\/$/, "");
    const uploadUrl = apiBase.endsWith("/api") ? `${apiBase}/uploads` : `${apiBase}/api/uploads`;
    const uploadRes = await Taro.uploadFile({
      url: uploadUrl,
      filePath,
      name: "file",
      header: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 60000,
    });
    const data = JSON.parse(uploadRes.data || "{}");
    if (!(uploadRes.statusCode >= 200 && uploadRes.statusCode < 300 && data.file_url)) {
      throw new Error(data?.message || "上传失败");
    }
    return data;
  };

  const doUploadMsgAttachment = async (filePath, fallbackName, fallbackSize) => {
    if (msgAttachments.length >= 10) {
      Taro.showToast({ title: "一条消息最多带 10 个附件", icon: "none" });
      return;
    }
    setUploading(true);
    try {
      const data = await uploadToServer(filePath);
      setMsgAttachments((cur) => [...cur, {
        url: data.file_url,
        name: data.file_name || fallbackName || "附件",
        type: data.file_type || "",
        size: data.file_size || fallbackSize || 0,
      }]);
    } catch (err) {
      Taro.showToast({ title: err?.message || "上传失败，请重试", icon: "none" });
    } finally {
      setUploading(false);
    }
  };

  const pickMsgAttachment = () => {
    if (uploading || sending) return;
    Taro.showActionSheet({ itemList: ["从聊天选择文件", "拍照或从相册选择"] })
      .then(({ tapIndex }) => {
        if (tapIndex === 0) {
          Taro.chooseMessageFile({
            count: 1,
            type: "all",
            success: (r) => {
              const f = r.tempFiles?.[0];
              if (f) doUploadMsgAttachment(f.path, f.name, f.size);
            },
          });
        } else if (tapIndex === 1) {
          Taro.chooseMedia({
            count: 1,
            mediaType: ["image", "video"],
            success: (r) => {
              const f = r.tempFiles?.[0];
              if (f) doUploadMsgAttachment(f.tempFilePath, "", f.size);
            },
          });
        }
      })
      .catch(() => {});
  };

  const removeMsgAttachment = (idx) => {
    setMsgAttachments((cur) => cur.filter((_, i) => i !== idx));
  };

  const isImageAtt = (att) =>
    /^image\//.test(att?.type || "") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(att?.name || "");

  // 打开讨论附件：图片直接预览；其他类型下载后用系统能力打开
  const openMsgAttachment = (att) => {
    const url = absoluteUrl(att?.url);
    if (!url) return;
    if (isImageAtt(att)) {
      Taro.previewImage({ urls: [url], current: url });
      return;
    }
    Taro.showLoading({ title: "打开中…", mask: true });
    Taro.downloadFile({
      url,
      success: (res) => {
        Taro.hideLoading();
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          Taro.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            fail: () => Taro.showToast({ title: "暂不支持打开此类型文件", icon: "none" }),
          });
        } else {
          Taro.showToast({ title: "下载失败，请重试", icon: "none" });
        }
      },
      fail: () => {
        Taro.hideLoading();
        Taro.showToast({ title: "下载失败，请重试", icon: "none" });
      },
    });
  };

  const sendMessage = async () => {
    const content = msgText.trim();
    if ((!content && msgAttachments.length === 0) || sending || uploading) return;
    setSending(true);
    try {
      await post(`/collab/${taskId}/messages`, {
        content: content || "（分享附件）",
        topic: topicFilter === "all" ? undefined : topicFilter,
        attachments: msgAttachments.length > 0 ? msgAttachments : undefined,
      });
      setMsgText("");
      setMsgAttachments([]);
      fetchMessages();
    } catch (_err) {
      // handled globally
    } finally {
      setSending(false);
    }
  };

  const addTopic = async () => {
    const name = newTopicName.trim().replace(/\s+/g, " ").slice(0, 20);
    if (!name) {
      setAddingTopic(false);
      setNewTopicName("");
      return;
    }
    if (topicSaving) return;
    setTopicSaving(true);
    try {
      await post(`/collab/${taskId}/topics`, { name });
      setCreatedTopics((prev) => [...new Set([...prev, name])]);
      setTopicFilter(name);
      setNewTopicName("");
      setAddingTopic(false);
      fetchSummary();
    } catch (_err) {
      // handled globally
    } finally {
      setTopicSaving(false);
    }
  };

  // ── 执行节点 ──
  const toggleNode = async (node) => {
    if (busyId) return;
    setBusyId(node.id);
    try {
      await patch(`/collab/${taskId}/nodes/${node.id}`, {
        done_at: node.done_at ? null : new Date().toISOString(),
      });
      fetchSummary();
    } catch (_err) {
      // handled globally
    } finally {
      setBusyId("");
    }
  };

  const addNode = async () => {
    const title = nodeText.trim();
    if (!title || nodeBusy) return;
    setNodeBusy(true);
    try {
      await post(`/collab/${taskId}/nodes`, { title, node_type: "stage" });
      setNodeText("");
      fetchSummary();
    } catch (_err) {
      // handled globally
    } finally {
      setNodeBusy(false);
    }
  };

  // ── 子约定 ──
  const handleSubPress = async (sub) => {
    if (busyId) return;
    const subCollab = sub?.metadata?.collab;
    if (subCollab?.state === "draft") {
      // 草案：勾选 = 确认（与 Web 卡片一致）
      setBusyId(sub.id);
      try {
        const res = await post(`/collab/${taskId}/subtasks/${sub.id}/confirm`, {});
        Taro.showToast({
          title: res?.state === "active" ? "已确认生效" : `已确认，还差 ${res?.pending_confirm_users?.length ?? 0} 位成员`,
          icon: "none",
        });
        fetchSummary();
        notifyChanged();
      } catch (_err) {
        // handled globally
      } finally {
        setBusyId("");
      }
      return;
    }
    const done = isEffectivelyDone(sub);
    setBusyId(sub.id);
    try {
      const body = { status: done ? "pending" : "completed" };
      // 人工勾选覆盖「心栈确定完成」标记
      if (subCollab?.autoCompleted) {
        body.metadata = {
          ...(sub.metadata || {}),
          collab: { ...subCollab, autoCompleted: false, autoCompletedAt: null, autoCompletedReason: "" },
        };
      }
      await patch(`/tasks/${sub.id}`, body);
      fetchSummary();
      notifyChanged();
    } catch (_err) {
      // handled globally
    } finally {
      setBusyId("");
    }
  };

  // 勾掉草案 = 否决（再点勾选可撤回恢复）
  const handleSubReject = async (sub) => {
    if (busyId) return;
    setBusyId(sub.id);
    try {
      await post(`/collab/${taskId}/subtasks/${sub.id}/reject`, {});
      Taro.showToast({ title: "已勾掉，该草案不会生效", icon: "none" });
      fetchSummary();
    } catch (_err) {
      // handled globally
    } finally {
      setBusyId("");
    }
  };

  const addSubtask = async () => {
    const title = subText.trim();
    if (!title || subBusy) return;
    setSubBusy(true);
    try {
      await post("/tasks", {
        title,
        parent_task_id: taskId,
        status: "pending",
        priority: "medium",
        category: task?.category || "collab",
        metadata: {
          collab: {
            state: "active",
            standard: "",
            assignee: null,
            confirmedBy: me?.id ? [me.id] : [],
            sourceCommentId: null,
          },
        },
      });
      setSubText("");
      Taro.showToast({ title: "子约定已添加", icon: "success" });
      fetchSummary();
      notifyChanged();
    } catch (_err) {
      // handled globally
    } finally {
      setSubBusy(false);
    }
  };

  // ── 成员管理（仅发起人）──
  const removeMember = (m) => {
    if (!isOwner || memberBusy || !m?.user_id) return;
    Taro.showModal({
      title: "移除成员",
      content: `确定将「${m.display_name || "该成员"}」移出本协同约定吗？其负责的子约定会保留。`,
      confirmText: "移除",
      confirmColor: "#b3443c",
      success: async (r) => {
        if (!r.confirm) return;
        setMemberBusy(m.user_id);
        try {
          await del(`/collab/${taskId}/members/${m.user_id}`);
          Taro.showToast({ title: "已移除", icon: "success" });
          fetchSummary();
          notifyChanged();
        } catch (_err) {
          // handled globally
        } finally {
          setMemberBusy("");
        }
      },
    });
  };

  // ── 邀请伙伴：创建邀请 → 转发小程序卡片（受邀者在小程序落地页登录本人账号后接受）──
  const inviteMember = () => {
    if (inviteBusy) return;
    Taro.showModal({
      title: "邀请伙伴",
      editable: true,
      placeholderText: "对方的称呼，如：小李",
      success: async (r) => {
        const name = (r.content || "").trim();
        if (!r.confirm || !name) return;
        setInviteBusy(true);
        try {
          const res = await post(`/collab/${taskId}/invites`, { invitee_name: name, subtask_ids: [] });
          const code = res?.invite?.code;
          if (code) {
            setInviteShare({ code, name });
          } else {
            Taro.showToast({ title: "邀请创建失败，请重试", icon: "none" });
          }
        } catch (_err) {
          // handled globally
        } finally {
          setInviteBusy(false);
        }
      },
    });
  };

  // ── 子约定管理（仅发起人：修改标题 / 删除）──
  const manageSubtask = (sub) => {
    if (!isOwner || busyId) return;
    Taro.showActionSheet({ itemList: ["修改标题", "删除子约定"] })
      .then(({ tapIndex }) => {
        if (tapIndex === 0) {
          Taro.showModal({
            title: "修改子约定标题",
            editable: true,
            placeholderText: "输入新的标题",
            content: sub.title,
            success: async (r) => {
              const title = (r.content || "").trim();
              if (!r.confirm || !title || title === sub.title) return;
              setBusyId(sub.id);
              try {
                await patch(`/tasks/${sub.id}`, { title });
                Taro.showToast({ title: "已更新", icon: "success" });
                fetchSummary();
                notifyChanged();
              } catch (_err) {
                // handled globally
              } finally {
                setBusyId("");
              }
            },
          });
        } else if (tapIndex === 1) {
          Taro.showModal({
            title: "删除子约定",
            content: `确定删除「${sub.title}」吗？其从属子约定会一并删除。`,
            confirmText: "删除",
            confirmColor: "#b3443c",
            success: async (r) => {
              if (!r.confirm) return;
              setBusyId(sub.id);
              try {
                await del(`/tasks/${sub.id}`);
                Taro.showToast({ title: "已删除", icon: "success" });
                fetchSummary();
                notifyChanged();
              } catch (_err) {
                // handled globally
              } finally {
                setBusyId("");
              }
            },
          });
        }
      })
      .catch(() => {});
  };

  if (loading && !summary) {
    return (
      <View className="ss-page">
        <View className="ss-empty">加载中...</View>
      </View>
    );
  }

  if (!summary || !task) {
    return (
      <View className="ss-page">
        <View className="ss-empty">{loadError || "协同约定不存在或未开启协同"}</View>
      </View>
    );
  }

  const ownerMember = members.find((m) => m.role === "owner");

  const renderSubRow = ({ node: sub, depth }) => {
    const done = isEffectivelyDone(sub);
    const subCollab = sub?.metadata?.collab;
    const isDraft = subCollab?.state === "draft";
    const confirmedCount = Array.isArray(subCollab?.confirmedBy) ? subCollab.confirmedBy.length : 0;
    const rejectedBy = Array.isArray(subCollab?.rejectedBy) ? subCollab.rejectedBy : [];
    const rejected = isDraft && rejectedBy.length > 0;
    const iRejected = Boolean(me?.id && rejectedBy.includes(me.id));
    const iConfirmed = Boolean(me?.id && Array.isArray(subCollab?.confirmedBy) && subCollab.confirmedBy.includes(me.id));

    return (
      <View
        key={sub.id}
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: "16rpx",
          padding: "20rpx 0",
          paddingLeft: `${depth * 36}rpx`,
          borderBottom: "1rpx solid #eef0f3",
          opacity: busyId === sub.id ? 0.6 : 1,
        }}
      >
        {/* 勾选圈：草案=确认，进行中=完成/重开 */}
        <View
          onClick={() => handleSubPress(sub)}
          style={{
            width: "38rpx",
            height: "38rpx",
            borderRadius: "50%",
            border: `2rpx solid ${done ? "#384877" : isDraft ? "#f0c36d" : "#c6c9cf"}`,
            background: done ? "#384877" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: "4rpx",
          }}
        >
          {done && <Text style={{ color: "#fff", fontSize: "22rpx" }}>✓</Text>}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: "28rpx",
              color: done || rejected ? "#9ca0a8" : "#333",
              textDecoration: done || rejected ? "line-through" : "none",
              lineHeight: "40rpx",
            }}
          >
            {sub.title}
          </Text>
          <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "12rpx", marginTop: "8rpx" }}>
            {isDraft && (
              <View style={{ border: "1rpx solid #f0c36d", background: "#fdf3e0", borderRadius: "6rpx", padding: "2rpx 10rpx" }}>
                <Text style={{ fontSize: "20rpx", color: "#b07818" }}>
                  {rejected ? "已被勾掉" : iConfirmed ? "已确认" : "草案待确认"} · {confirmedCount}/{members.length || 1}
                </Text>
              </View>
            )}
            {!isDraft && !done && (
              <View style={{ border: "1rpx solid #c9d5ef", background: "#eef2fb", borderRadius: "6rpx", padding: "2rpx 10rpx" }}>
                <Text style={{ fontSize: "20rpx", color: "#384877" }}>进行中</Text>
              </View>
            )}
            {done && subCollab?.autoCompleted && (
              <Text style={{ fontSize: "20rpx", color: "#384877" }}>
                心栈确定完成{subCollab.autoCompletedReason ? ` · ${subCollab.autoCompletedReason}` : ""}
              </Text>
            )}
            {isDraft && !iRejected && (
              <Text
                onClick={(e) => { e.stopPropagation(); handleSubReject(sub); }}
                style={{ fontSize: "22rpx", color: "#b3443c", padding: "2rpx 8rpx" }}
              >
                勾掉
              </Text>
            )}
            {isDraft && iRejected && (
              <Text style={{ fontSize: "22rpx", color: "#384877" }}>已勾掉 · 点勾选恢复</Text>
            )}
          </View>
        </View>
        {isOwner && (
          <Text
            onClick={(e) => { e.stopPropagation(); manageSubtask(sub); }}
            style={{ fontSize: "22rpx", color: "#384877", flexShrink: 0, padding: "4rpx 8rpx", marginTop: "4rpx" }}
          >
            管理
          </Text>
        )}
      </View>
    );
  };

  return (
    <View className="ss-page" style={{ display: "flex", flexDirection: "column", height: "100vh", boxSizing: "border-box", padding: 0 }}>
      {/* 模块切换：执行概览 / 共同讨论 / 子约定 */}
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          background: "#ffffff",
          borderBottom: "1rpx solid #e5e6eb",
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => (
          <View
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24rpx 0",
              borderBottom: tab === t.id ? "4rpx solid #384877" : "4rpx solid transparent",
            }}
          >
            <Text
              style={{
                fontSize: "28rpx",
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? "#384877" : "#7b8277",
              }}
            >
              {t.label}
              {t.id === "subtasks" && flatSubs.length > 0 ? ` ${flatSubs.length}` : ""}
              {t.id === "discussion" && messages.length > 0 ? ` ${messages.length}` : ""}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView scrollY style={{ flex: 1, minHeight: 0 }}>
        <View style={{ padding: "24rpx" }}>
          {tab === "overview" && (
            <View>
              {/* 约定头卡：场景徽标 + 标题 + 共同目标 + 成员 */}
              <View className="ss-card">
                <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "12rpx", marginBottom: "16rpx" }}>
                  <View style={{ background: "#384877", borderRadius: "6rpx", padding: "4rpx 14rpx" }}>
                    <Text style={{ fontSize: "20rpx", color: "#fff" }}>
                      {SCENARIO_LABELS[collab?.scenario] || SCENARIO_LABELS.custom}
                    </Text>
                  </View>
                  <View style={{ border: "1rpx solid #b7e4c7", background: "#e8f7ee", borderRadius: "6rpx", padding: "4rpx 14rpx", display: "flex", flexDirection: "row", alignItems: "center", gap: "8rpx" }}>
                    <View style={{ width: "10rpx", height: "10rpx", borderRadius: "50%", background: "#1f9d55" }} />
                    <Text style={{ fontSize: "20rpx", color: "#1f9d55" }}>协作中</Text>
                  </View>
                </View>
                <View className="ss-title" style={{ marginBottom: "8rpx" }}>{task.title}</View>
                {collab?.goal ? (
                  <Text style={{ display: "block", fontSize: "26rpx", color: "#666", lineHeight: "40rpx" }}>{collab.goal}</Text>
                ) : null}
                <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "16rpx", marginTop: "20rpx" }}>
                  <View style={{ display: "flex", flexDirection: "row", paddingLeft: "8rpx" }}>
                    {members.slice(0, 5).map((m) => (
                      <View
                        key={m.user_id || m.id || m.display_name}
                        style={{
                          width: "44rpx",
                          height: "44rpx",
                          borderRadius: "50%",
                          background: m.role === "owner" ? "#384877" : "#4a5d8f",
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
                  <Text style={{ fontSize: "22rpx", color: "#9ca0a8" }}>
                    {members.length || 1} 人在协作{ownerMember ? ` · ${ownerMember.display_name} 发起` : ""}
                  </Text>
                </View>
              </View>

              {/* 成员：发起人可移除成员；任何成员可邀请伙伴 */}
              <View className="ss-card">
                <View style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View className="ss-section-title" style={{ marginTop: 0 }}>
                    成员 · {members.length || 1}{isOwner ? "（你是发起人，可管理成员与子约定）" : ""}
                  </View>
                  <Text
                    onClick={inviteMember}
                    style={{ fontSize: "22rpx", color: "#384877", padding: "4rpx 8rpx", opacity: inviteBusy ? 0.5 : 1 }}
                  >
                    ＋ 邀请伙伴
                  </Text>
                </View>
                {inviteShare && (
                  <View style={{ background: "#eef2fb", border: "1rpx solid #c9d5ef", borderRadius: "12rpx", padding: "16rpx 20rpx", marginBottom: "12rpx" }}>
                    <Text style={{ display: "block", fontSize: "24rpx", color: "#384877", lineHeight: "36rpx" }}>
                      给「{inviteShare.name}」的邀请已创建。转发小程序卡片给 TA，TA 在小程序里登录本人账号后接受，约定就会出现在 TA 的列表里。
                    </Text>
                    <View style={{ display: "flex", flexDirection: "row", gap: "16rpx", marginTop: "12rpx" }}>
                      <Button
                        className="ss-btn ss-btn-sm"
                        openType="share"
                        data-share-title={`邀请你加入协同约定「${String(task.title || "").slice(0, 16)}」`}
                        data-share-path={`pages/invite/index?code=${inviteShare.code}`}
                        style={{ flex: 1 }}
                      >
                        转发邀请卡片
                      </Button>
                      <Button className="ss-btn ss-btn-sm ss-btn-plain" style={{ flex: 1 }} onClick={() => setInviteShare(null)}>
                        完成
                      </Button>
                    </View>
                  </View>
                )}
                {members.map((m) => {
                  const isSelf = Boolean(me?.id && m.user_id === me.id);
                  const removable = isOwner && m.role !== "owner" && !isSelf;
                  return (
                    <View
                      key={m.user_id || m.id || m.display_name}
                      style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "16rpx", padding: "14rpx 0", borderBottom: "1rpx solid #eef0f3", opacity: memberBusy === m.user_id ? 0.6 : 1 }}
                    >
                      <View
                        style={{
                          width: "48rpx",
                          height: "48rpx",
                          borderRadius: "50%",
                          background: m.role === "owner" ? "#384877" : "#4a5d8f",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Text style={{ fontSize: "20rpx", color: "#fff" }}>
                          {(m.display_name || "?").trim().slice(0, 1)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: "26rpx", color: "#333" }}>
                          {m.display_name || "成员"}{isSelf ? "（我）" : ""}
                        </Text>
                      </View>
                      <Text style={{ fontSize: "20rpx", color: "#9ca0a8", flexShrink: 0 }}>
                        {m.role === "owner" ? "发起人" : "成员"}
                      </Text>
                      {removable && (
                        <Text
                          onClick={() => removeMember(m)}
                          style={{ fontSize: "22rpx", color: "#b3443c", flexShrink: 0, padding: "4rpx 8rpx" }}
                        >
                          移除
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* 进度概览 */}
              <View className="ss-card">
                <View className="ss-section-title" style={{ marginTop: 0 }}>进度</View>
                <View style={{ display: "flex", flexDirection: "row", gap: "16rpx" }}>
                  <View style={{ flex: 1, background: "#f5f6fa", borderRadius: "12rpx", padding: "20rpx", alignItems: "center", display: "flex", flexDirection: "column" }}>
                    <Text style={{ fontSize: "36rpx", fontWeight: 700, color: "#384877" }}>{Math.round(stats.progress ?? 0)}%</Text>
                    <Text style={{ fontSize: "20rpx", color: "#9ca0a8", marginTop: "4rpx" }}>整体进度</Text>
                  </View>
                  <View style={{ flex: 1, background: "#f5f6fa", borderRadius: "12rpx", padding: "20rpx", alignItems: "center", display: "flex", flexDirection: "column" }}>
                    <Text style={{ fontSize: "36rpx", fontWeight: 700, color: "#384877" }}>{subDoneCount}/{flatSubs.length}</Text>
                    <Text style={{ fontSize: "20rpx", color: "#9ca0a8", marginTop: "4rpx" }}>子约定</Text>
                  </View>
                  <View style={{ flex: 1, background: "#f5f6fa", borderRadius: "12rpx", padding: "20rpx", alignItems: "center", display: "flex", flexDirection: "column" }}>
                    <Text style={{ fontSize: "36rpx", fontWeight: 700, color: stats.pending_confirms > 0 ? "#b07818" : "#384877" }}>{stats.pending_confirms ?? 0}</Text>
                    <Text style={{ fontSize: "20rpx", color: "#9ca0a8", marginTop: "4rpx" }}>待确认草案</Text>
                  </View>
                </View>
                {stats.next_node ? (
                  <View style={{ marginTop: "20rpx", background: "#eef2fb", border: "1rpx solid #c9d5ef", borderRadius: "12rpx", padding: "16rpx 20rpx", display: "flex", flexDirection: "row", alignItems: "center", gap: "12rpx" }}>
                    <Text style={{ fontSize: "22rpx", color: "#384877", fontWeight: 600 }}>下一节点</Text>
                    <Text style={{ fontSize: "24rpx", color: "#333", flex: 1 }}>{stats.next_node.title}</Text>
                    {stats.next_node.due_at ? (
                      <Text style={{ fontSize: "20rpx", color: "#9ca0a8" }}>{fmtTime(stats.next_node.due_at)}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* 执行节点 */}
              <View className="ss-card">
                <View className="ss-section-title" style={{ marginTop: 0 }}>
                  执行节点{nodes.length > 0 ? ` · ${nodesDoneCount}/${nodes.length}` : ""}
                </View>
                {nodes.length === 0 && (
                  <View className="ss-empty" style={{ padding: "24rpx 0" }}>还没有执行节点</View>
                )}
                {nodes.map((n) => {
                  const nDone = Boolean(n.done_at);
                  return (
                    <View
                      key={n.id}
                      onClick={() => toggleNode(n)}
                      style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "16rpx", padding: "18rpx 0", borderBottom: "1rpx solid #eef0f3", opacity: busyId === n.id ? 0.6 : 1 }}
                    >
                      <View
                        style={{
                          width: "36rpx",
                          height: "36rpx",
                          borderRadius: "50%",
                          border: `2rpx solid ${nDone ? "#384877" : "#c6c9cf"}`,
                          background: nDone ? "#384877" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {nDone && <Text style={{ color: "#fff", fontSize: "20rpx" }}>✓</Text>}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: "28rpx", color: nDone ? "#9ca0a8" : "#333", textDecoration: nDone ? "line-through" : "none" }}>
                          {n.title}
                        </Text>
                      </View>
                      <Text style={{ fontSize: "20rpx", color: "#9ca0a8", flexShrink: 0 }}>
                        {NODE_TYPE_LABELS[n.node_type] || n.node_type || "阶段"}
                        {n.due_at ? ` · ${fmtTime(n.due_at)}` : ""}
                      </Text>
                    </View>
                  );
                })}
                <View style={{ marginTop: "20rpx", display: "flex", flexDirection: "row", alignItems: "center" }}>
                  <Input
                    className="ss-input"
                    placeholder="添加一个执行节点"
                    value={nodeText}
                    onInput={(e) => setNodeText(e.detail.value)}
                    style={{ flex: 1, marginRight: "16rpx", height: "64rpx" }}
                  />
                  <Button className="ss-btn ss-btn-sm" loading={nodeBusy} onClick={addNode}>添加</Button>
                </View>
              </View>

              {/* 沉淀文档：共识 / 分歧 / 纪要等 */}
              {docs.length > 0 && (
                <View className="ss-card">
                  <View className="ss-section-title" style={{ marginTop: 0 }}>沉淀</View>
                  {docs.map((d) => (
                    <View key={d.id} style={{ padding: "18rpx 0", borderBottom: "1rpx solid #eef0f3" }}>
                      <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "12rpx" }}>
                        <View
                          style={{
                            border: `1rpx solid ${d.doc_type === "dispute" ? "#f0c36d" : "#b7e4c7"}`,
                            background: d.doc_type === "dispute" ? "#fdf3e0" : "#e8f7ee",
                            borderRadius: "6rpx",
                            padding: "2rpx 10rpx",
                            flexShrink: 0,
                          }}
                        >
                          <Text style={{ fontSize: "20rpx", color: d.doc_type === "dispute" ? "#b07818" : "#1f9d55" }}>
                            {DOC_TYPE_LABELS[d.doc_type] || "文件"}
                          </Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: "26rpx", color: "#333", fontWeight: 500 }}>{d.title}</Text>
                        {d.status === "confirmed" && (
                          <Text style={{ fontSize: "20rpx", color: "#1f9d55", flexShrink: 0 }}>已确认</Text>
                        )}
                      </View>
                      {d.content ? (
                        <Text style={{ display: "block", marginTop: "10rpx", fontSize: "24rpx", color: "#666", lineHeight: "36rpx" }}>
                          {String(d.content).slice(0, 120)}{String(d.content).length > 120 ? "…" : ""}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}

              {/* 最近动态 */}
              {(stats.recent_activity || []).length > 0 && (
                <View className="ss-card">
                  <View className="ss-section-title" style={{ marginTop: 0 }}>最近动态</View>
                  {stats.recent_activity.map((log) => (
                    <View key={log.id} style={{ padding: "14rpx 0", borderBottom: "1rpx solid #eef0f3" }}>
                      <View style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", gap: "12rpx" }}>
                        <Text style={{ flex: 1, fontSize: "24rpx", color: "#333" }}>
                          {log.display_name || "成员"}{(log.changes_detail || [])[0]?.field_label ? ` 更新了${(log.changes_detail || [])[0].field_label}` : " 有更新"}
                          {log.task_title ? `「${log.task_title}」` : ""}
                        </Text>
                        <Text className="ss-muted" style={{ flexShrink: 0 }}>{fmtTime(log.created_date)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {tab === "discussion" && (
            <View>
              <View className="ss-card">
                <View className="ss-section-title" style={{ marginTop: 0 }}>共同讨论</View>
                {/* 主题窗口：每个主题独立讨论，全部窗口汇总 */}
                <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: "12rpx", marginBottom: "20rpx" }}>
                  <View
                    onClick={() => setTopicFilter("all")}
                    style={{
                      padding: "8rpx 20rpx",
                      borderRadius: "999rpx",
                      background: topicFilter === "all" ? "#384877" : "#f5f6fa",
                      border: topicFilter === "all" ? "1rpx solid #384877" : "1rpx solid #e5e6eb",
                    }}
                  >
                    <Text style={{ fontSize: "22rpx", color: topicFilter === "all" ? "#ffffff" : "#666" }}>全部</Text>
                  </View>
                  {topics.map((name) => (
                    <View
                      key={name}
                      onClick={() => setTopicFilter(name)}
                      style={{
                        padding: "8rpx 20rpx",
                        borderRadius: "999rpx",
                        background: topicFilter === name ? "#384877" : "#f5f6fa",
                        border: topicFilter === name ? "1rpx solid #384877" : "1rpx solid #e5e6eb",
                      }}
                    >
                      <Text style={{ fontSize: "22rpx", color: topicFilter === name ? "#ffffff" : "#666" }}>{name}</Text>
                    </View>
                  ))}
                  {addingTopic ? (
                    <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "8rpx" }}>
                      <Input
                        value={newTopicName}
                        onInput={(e) => setNewTopicName(e.detail.value)}
                        onConfirm={addTopic}
                        confirmType="done"
                        placeholder="主题"
                        style={{
                          width: "180rpx",
                          height: "52rpx",
                          padding: "0 16rpx",
                          borderRadius: "999rpx",
                          background: "#f5f6fa",
                          border: "1rpx solid #e5e6eb",
                          fontSize: "22rpx",
                        }}
                      />
                      <Text onClick={addTopic} style={{ fontSize: "22rpx", color: "#384877" }}>{topicSaving ? "…" : "建"}</Text>
                      <Text
                        onClick={() => {
                          setAddingTopic(false);
                          setNewTopicName("");
                        }}
                        style={{ fontSize: "26rpx", color: "#9ca0a8" }}
                      >
                        ×
                      </Text>
                    </View>
                  ) : (
                    <View
                      onClick={() => setAddingTopic(true)}
                      style={{ padding: "8rpx 20rpx", borderRadius: "999rpx", border: "1rpx dashed #e5e6eb", background: "#ffffff" }}
                    >
                      <Text style={{ fontSize: "22rpx", color: "#8a867e" }}>＋ 主题</Text>
                    </View>
                  )}
                </View>
                {filteredMessages.length === 0 && (
                  <View className="ss-empty" style={{ padding: "40rpx 0" }}>
                    {topicFilter === "all" ? "还没有讨论，说点什么让大家对齐吧" : `「${topicFilter}」里还没有讨论`}
                  </View>
                )}
                {filteredMessages.map((m) => {
                  const mine = Boolean(me?.id && m.user_id === me.id);
                  return (
                    <View
                      key={m.id}
                      style={{
                        marginBottom: "20rpx",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: mine ? "flex-end" : "flex-start",
                      }}
                    >
                      <View style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10rpx", marginBottom: "6rpx" }}>
                        <Text style={{ fontSize: "22rpx", color: m.agent ? "#384877" : "#9ca0a8" }}>
                          {m.agent ? "心栈 Agent" : (m.created_by || m.visitor_name || "成员")}
                          {mine ? "（我）" : ""}
                        </Text>
                        <Text style={{ fontSize: "20rpx", color: "#c6c9cf" }}>{fmtTime(m.created_date)}</Text>
                      </View>
                      <View
                        style={{
                          maxWidth: "86%",
                          background: m.agent ? "#eef2fb" : mine ? "#384877" : "#f5f6fa",
                          border: m.agent ? "1rpx solid #c9d5ef" : "none",
                          borderRadius: "14rpx",
                          padding: "16rpx 20rpx",
                        }}
                      >
                        {m.topic ? (
                          <Text style={{ display: "block", fontSize: "20rpx", color: mine ? "#c9d5ef" : "#384877", marginBottom: "6rpx" }}>{m.topic}</Text>
                        ) : null}
                        <Text style={{ fontSize: "27rpx", color: mine ? "#ffffff" : "#333", lineHeight: "40rpx" }}>{m.content}</Text>
                        {m.mark ? (
                          <Text style={{ display: "block", fontSize: "20rpx", marginTop: "8rpx", color: m.mark === "dispute" ? "#b07818" : "#1f9d55" }}>
                            {m.mark === "dispute" ? "⚠ 标记为分歧" : m.mark === "consensus" ? "✦ 标记为共识" : "… 待定"}
                          </Text>
                        ) : null}
                        {/* 讨论附件：图片直接出图，其他类型给文件行，点按打开 */}
                        {(m.attachments || []).length > 0 && (
                          <View style={{ marginTop: "10rpx" }}>
                            {(m.attachments || []).map((att, ai) =>
                              isImageAtt(att) ? (
                                <Image
                                  key={att.url || ai}
                                  src={absoluteUrl(att.url)}
                                  mode="aspectFill"
                                  onClick={() => openMsgAttachment(att)}
                                  style={{ width: "260rpx", height: "200rpx", borderRadius: "10rpx", background: "rgba(0,0,0,0.06)", marginTop: ai > 0 ? "10rpx" : 0 }}
                                />
                              ) : (
                                <View
                                  key={att.url || ai}
                                  onClick={() => openMsgAttachment(att)}
                                  style={{
                                    display: "flex",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: "10rpx",
                                    marginTop: ai > 0 ? "10rpx" : 0,
                                    padding: "12rpx 16rpx",
                                    borderRadius: "10rpx",
                                    background: mine ? "rgba(255,255,255,0.16)" : "#ffffff",
                                    border: mine ? "none" : "1rpx solid #e5e6eb",
                                  }}
                                >
                                  <Text style={{ fontSize: "26rpx", flexShrink: 0 }}>📎</Text>
                                  <Text
                                    style={{
                                      fontSize: "24rpx",
                                      color: mine ? "#ffffff" : "#384877",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      maxWidth: "360rpx",
                                    }}
                                  >
                                    {att.name || "附件"}
                                  </Text>
                                </View>
                              )
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
              <View className="ss-card">
                {/* 待发附件：上传完成即列入，随消息一并发送，可单独移除 */}
                {msgAttachments.length > 0 && (
                  <View style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: "12rpx", marginBottom: "16rpx" }}>
                    {msgAttachments.map((att, ai) => (
                      <View
                        key={`${att.url}-${ai}`}
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: "8rpx",
                          background: "#f5f6fa",
                          border: "1rpx solid #e5e6eb",
                          borderRadius: "10rpx",
                          padding: "8rpx 14rpx",
                        }}
                      >
                        <Text style={{ fontSize: "22rpx" }}>{isImageAtt(att) ? "🖼" : "📎"}</Text>
                        <Text
                          style={{
                            fontSize: "22rpx",
                            color: "#333",
                            maxWidth: "280rpx",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {att.name || "附件"}
                        </Text>
                        <Text
                          onClick={() => removeMsgAttachment(ai)}
                          style={{ fontSize: "26rpx", color: "#9ca0a8", lineHeight: "26rpx", padding: "0 4rpx" }}
                        >
                          ×
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
                  <View
                    onClick={pickMsgAttachment}
                    style={{
                      width: "72rpx",
                      height: "72rpx",
                      borderRadius: "12rpx",
                      border: "1rpx solid #e5e6eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: "16rpx",
                      flexShrink: 0,
                      opacity: uploading ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ fontSize: "36rpx", color: "#384877", lineHeight: "40rpx" }}>{uploading ? "…" : "＋"}</Text>
                  </View>
                  <Input
                    className="ss-input"
                    placeholder={topicFilter === "all" ? "参与讨论，@心栈 可让 Agent 协助" : `在「${topicFilter}」里说…`}
                    value={msgText}
                    onInput={(e) => setMsgText(e.detail.value)}
                    confirmType="send"
                    onConfirm={sendMessage}
                    style={{ flex: 1, marginRight: "16rpx", height: "72rpx" }}
                  />
                  <Button className="ss-btn ss-btn-sm" loading={sending} disabled={uploading} onClick={sendMessage}>发送</Button>
                </View>
                <Text style={{ display: "block", marginTop: "12rpx", fontSize: "20rpx", color: "#c6c9cf" }}>
                  点 ＋ 可带文件/图片；内容含 @心栈 或 @Agent 时，协同 Agent 会参与回应并自动整理空间
                </Text>
              </View>
            </View>
          )}

          {tab === "subtasks" && (
            <View>
              <View className="ss-card">
                <View className="ss-section-title" style={{ marginTop: 0 }}>
                  子约定 · {flatSubs.length}{flatSubs.length > 0 ? `（${subDoneCount} 已完成）` : ""}
                </View>
                {flatSubs.length === 0 && (
                  <View className="ss-empty" style={{ padding: "24rpx 0" }}>
                    还没有子约定，可在讨论中「转为子约定」或在下方添加
                  </View>
                )}
                {flatSubs.map(renderSubRow)}
                <View style={{ marginTop: "24rpx", display: "flex", flexDirection: "row", alignItems: "center" }}>
                  <Input
                    className="ss-input"
                    placeholder="添加一个子约定"
                    value={subText}
                    onInput={(e) => setSubText(e.detail.value)}
                    style={{ flex: 1, marginRight: "16rpx", height: "64rpx" }}
                  />
                  <Button className="ss-btn ss-btn-sm" loading={subBusy} onClick={addSubtask}>添加</Button>
                </View>
                {stats.pending_confirms > 0 && (
                  <Text style={{ display: "block", marginTop: "16rpx", fontSize: "22rpx", color: "#b07818" }}>
                    有 {stats.pending_confirms} 条草案待确认：点左侧圆圈即确认，点「勾掉」表达不同意
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={{ height: "40rpx" }} />
        </View>
      </ScrollView>
    </View>
  );
}
