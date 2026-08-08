import { useState, useMemo } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Button, MovableArea, MovableView } from "@tarojs/components";
import { get, post, del } from "@/utils/api";

const statusMap = {
  active: { text: "正常", className: "ss-tag-primary" },
  archived: { text: "已归档", className: "ss-tag-warning" },
  deleted: { text: "已删除", className: "ss-tag-danger" }
};

function getActionWidthPx() {
  try {
    const sys = Taro.getSystemInfoSync();
    return Math.round((360 / 750) * sys.windowWidth);
  } catch (e) {
    return 180;
  }
}

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragX, setDragX] = useState({});

  const ACTION_WIDTH = useMemo(() => getActionWidthPx(), []);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const data = await get("/notes", { sort: "-created_date", limit: 200 });
      setNotes(Array.isArray(data) ? data : []);
    } catch (err) {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    fetchNotes();
  });

  const goCreate = () => {
    Taro.navigateTo({ url: "/pages/note-create/index" });
  };

  const goDetail = (id) => {
    if (openId) {
      setOpenId(null);
      return;
    }
    Taro.navigateTo({ url: `/pages/note-detail/index?id=${id}` });
  };

  const goEdit = (id, e) => {
    e?.stopPropagation?.();
    setOpenId(null);
    Taro.navigateTo({ url: `/pages/note-create/index?id=${id}&mode=edit` });
  };

  const handleShare = async (note, e) => {
    e?.stopPropagation?.();
    setOpenId(null);
    try {
      const share = await post(`/public/share/generate/note/${note.id}`);
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
      await del(`/notes/${id}`);
      Taro.showToast({ title: "已删除", icon: "success" });
      fetchNotes();
    } catch (err) {
      // handled globally
    }
  };

  const onMovableChange = (noteId, e) => {
    setDragX((prev) => ({ ...prev, [noteId]: e.detail.x }));
  };

  const onMovableEnd = (noteId, e) => {
    const x = e.detail.x;
    if (x < -ACTION_WIDTH / 2) {
      setOpenId(noteId);
      setDragX((prev) => ({ ...prev, [noteId]: -ACTION_WIDTH }));
    } else {
      setOpenId(null);
      setDragX((prev) => ({ ...prev, [noteId]: 0 }));
    }
    setDragId(null);
  };

  return (
    <View className="ss-page">
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        {loading && notes.length === 0 && <View className="ss-empty">加载中...</View>}
        {!loading && notes.length === 0 && <View className="ss-empty">暂无心签，点击右下角添加</View>}

        {notes.map((note) => {
          const status = statusMap[note.status] || statusMap.active;
          const text = note.plain_text || note.content || "";
          const targetX = dragId === note.id ? dragX[note.id] : openId === note.id ? -ACTION_WIDTH : 0;

          return (
            <MovableArea
              key={note.id}
              style={{
                width: "100%",
                height: "180rpx",
                marginBottom: "20rpx",
                position: "relative",
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
                  onClick={(e) => handleShare(note, e)}
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
                  onClick={(e) => goEdit(note.id, e)}
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
                  onClick={(e) => handleDelete(note.id, e)}
                >
                  删除
                </View>
              </View>

              {/* 可滑动卡片 */}
              <MovableView
                style={{
                  width: "100%",
                  height: "100%",
                  zIndex: 2,
                  background: "#fff"
                }}
                direction="horizontal"
                damping={40}
                friction={4}
                x={targetX}
                outOfBounds={false}
                onChange={(e) => onMovableChange(note.id, e)}
                onTouchEnd={(e) => onMovableEnd(note.id, e)}
                onTouchStart={() => setDragId(note.id)}
              >
                <View
                  className="ss-card"
                  style={{ marginBottom: 0, height: "100%", boxSizing: "border-box" }}
                  onClick={() => goDetail(note.id)}
                >
                  <View className="ss-row">
                    <Text style={{ fontSize: "32rpx", fontWeight: 600, color: "#333", flex: 1 }}>
                      {note.title || "未命名心签"}
                    </Text>
                    <Text className={`ss-tag ${status.className}`}>{status.text}</Text>
                  </View>
                  <View style={{ marginTop: "12rpx" }}>
                    <Text className="ss-muted">{text.slice(0, 120)}</Text>
                  </View>
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
