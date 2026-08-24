import { useState, useMemo, useRef } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Button, MovableArea, MovableView } from "@tarojs/components";
import { get, post, del } from "@/utils/api";
import SharePoster from "@/components/SharePoster";

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

function getScreenWidthPx() {
  try {
    return Taro.getSystemInfoSync().windowWidth;
  } catch (e) {
    return 375;
  }
}

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [offsets, setOffsets] = useState({});
  const [posterNote, setPosterNote] = useState(null);
  const [posterToken, setPosterToken] = useState("");

  const ACTION_WIDTH = useMemo(() => getActionWidthPx(), []);
  const SCREEN_WIDTH = useMemo(() => getScreenWidthPx(), []);

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

  const goEdit = (id) => {
    if (openId) {
      setOpenId(null);
      resetOffset(openId, 0);
      return;
    }
    Taro.navigateTo({ url: `/pages/note-create/index?mode=edit&id=${id}` });
  };

  const handleShare = async (note, e) => {
    e?.stopPropagation?.();
    setOpenId(null);
    resetOffset(note.id, 0);
    try {
      const share = await post(`/public/share/generate/note/${note.id}`);
      setPosterNote(note);
      setPosterToken(share.token || "");
    } catch (err) {
      Taro.showToast({ title: "分享生成失败", icon: "none" });
    }
  };

  const closePoster = () => {
    setPosterNote(null);
    setPosterToken("");
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation?.();
    setOpenId(null);
    resetOffset(id, 0);
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

  const moveXRef = useRef({});

  const onMovableChange = (noteId, e) => {
    moveXRef.current[noteId] = e.detail.x;
  };

  const resetOffset = (noteId, value) => {
    setOffsets((prev) => ({ ...prev, [noteId]: value + 0.001 }));
    setTimeout(() => {
      setOffsets((prev) => ({ ...prev, [noteId]: value }));
    }, 0);
  };

  const onMovableEnd = (noteId) => {
    const x = moveXRef.current[noteId] ?? 0;
    const threshold = ACTION_WIDTH / 2;

    if (x < -threshold) {
      setOpenId(noteId);
      resetOffset(noteId, -ACTION_WIDTH);
    } else {
      setOpenId(null);
      resetOffset(noteId, 0);
    }
  };

  return (
    <View className="ss-page">
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        {loading && notes.length === 0 && <View className="ss-empty">加载中...</View>}
        {!loading && notes.length === 0 && <View className="ss-empty">暂无心签，点击右下角添加</View>}

        {notes.map((note) => {
          const status = statusMap[note.status] || statusMap.active;
          const text = note.plain_text || note.content || "";
          const offset = offsets[note.id] ?? 0;

          return (
            <MovableArea
              key={note.id}
              style={{
                width: `${SCREEN_WIDTH}px`,
                height: "180rpx",
                marginBottom: "20rpx",
                overflow: "hidden",
                borderRadius: "16rpx"
              }}
            >
              <MovableView
                style={{
                  width: `${SCREEN_WIDTH + ACTION_WIDTH}px`,
                  height: "100%",
                  display: "flex",
                  flexDirection: "row"
                }}
                direction="horizontal"
                damping={50}
                friction={4}
                x={offset}
                outOfBounds={false}
                onChange={(e) => onMovableChange(note.id, e)}
                onTouchEnd={() => onMovableEnd(note.id)}
              >
                {/* 卡片内容 */}
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
                  onClick={() => goEdit(note.id)}
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

                {/* 左滑出现的操作按钮 */}
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
                    onClick={(e) => handleShare(note, e)}
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
                    onClick={(e) => handleDelete(note.id, e)}
                  >
                    删除
                  </View>
                </View>
              </MovableView>
            </MovableArea>
          );
        })}

        <View style={{ height: "160rpx" }} />
      </ScrollView>

      <Button className="ss-fab" onClick={goCreate}>+</Button>

      <SharePoster
        visible={Boolean(posterNote)}
        onClose={closePoster}
        type="note"
        title={posterNote?.title || "心签"}
        description={posterNote?.plain_text || posterNote?.content}
        shareToken={posterToken}
        canvasId="noteShareCanvas"
      />
    </View>
  );
}
