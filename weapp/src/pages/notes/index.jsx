import { useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { View, Text, ScrollView, Button } from "@tarojs/components";
import { get } from "@/utils/api";

const statusMap = {
  active: { text: "正常", className: "ss-tag-primary" },
  archived: { text: "已归档", className: "ss-tag-warning" },
  deleted: { text: "已删除", className: "ss-tag-danger" }
};

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);

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
    Taro.navigateTo({ url: `/pages/note-detail/index?id=${id}` });
  };

  return (
    <View className="ss-page">
      <ScrollView scrollY style={{ height: "calc(100vh - 48rpx)" }}>
        {loading && notes.length === 0 && <View className="ss-empty">加载中...</View>}
        {!loading && notes.length === 0 && <View className="ss-empty">暂无心签，点击右下角添加</View>}

        {notes.map((note) => {
          const status = statusMap[note.status] || statusMap.active;
          const text = note.plain_text || note.content || "";
          return (
            <View key={note.id} className="ss-card" onClick={() => goDetail(note.id)}>
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
          );
        })}

        <View style={{ height: "160rpx" }} />
      </ScrollView>

      <Button className="ss-fab" onClick={goCreate}>+</Button>
    </View>
  );
}
