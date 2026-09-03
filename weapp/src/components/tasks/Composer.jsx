import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Input, Button } from "@tarojs/components";
import { IconMic, IconArrowUp } from "./icons";

const suggestions = [
  "明天下午3点和林总过方案",
  "每周五晚上给爸妈打电话",
  "下班顺路去加油站加油",
  "周五前给张总发跟进邮件",
];

export default function Composer() {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    Taro.navigateTo({
      url: `/pages/task-create/index?title=${encodeURIComponent(text)}`,
    });
  };

  const fakeVoice = () => {
    if (listening) {
      setListening(false);
      return;
    }
    setListening(true);
    const demo = "今晚8点提醒我给妈妈打电话";
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setValue(demo.slice(0, i));
      if (i >= demo.length) {
        clearInterval(t);
        setListening(false);
      }
    }, 90);
  };

  const fillSuggestion = (s) => {
    setValue(s);
  };

  return (
    <View>
      <View
        style={{
          border: "1rpx solid rgba(19,23,18,0.15)",
          background: "#ffffff",
          borderRadius: "12rpx",
          padding: "24rpx",
          display: "flex",
          alignItems: "center",
          gap: "16rpx",
        }}
      >
        <Text style={{ fontSize: "40rpx", color: "#7b8277", lineHeight: "44rpx" }}>＋</Text>
        <Input
          value={value}
          onInput={(e) => setValue(e.detail.value)}
          placeholder="说出一个约定，剩下的交给心栈…"
          placeholderStyle={{ color: "#7b8277" }}
          style={{
            flex: 1,
            fontSize: "32rpx",
            color: "#131712",
            height: "48rpx",
            lineHeight: "48rpx",
          }}
        />
        <View
          onClick={fakeVoice}
          style={{
            padding: "12rpx",
            border: listening ? "1rpx solid #db3356" : "1rpx solid transparent",
          }}
        >
          <IconMic size={36} color={listening ? "#db3356" : "#7b8277"} />
        </View>
        <Button
          onClick={submit}
          disabled={!value.trim()}
          style={{
            margin: 0,
            padding: "12rpx 28rpx",
            height: "auto",
            lineHeight: "40rpx",
            background: "#131712",
            color: "#fdfdf9",
            fontSize: "28rpx",
            letterSpacing: "4rpx",
            borderRadius: "8rpx",
            opacity: value.trim() ? 1 : 0.35,
          }}
        >
          <View style={{ display: "flex", alignItems: "center", gap: "8rpx" }}>
            <Text style={{ color: "#fdfdf9", fontSize: "28rpx" }}>约定</Text>
            <IconArrowUp size={24} />
          </View>
        </Button>
      </View>

      <View style={{ marginTop: "20rpx", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16rpx 24rpx" }}>
        <Text style={{ fontSize: "22rpx", color: "#7b8277", letterSpacing: "4rpx" }}>试一试</Text>
        {suggestions.map((s) => (
          <Text
            key={s}
            onClick={() => fillSuggestion(s)}
            style={{
              fontSize: "24rpx",
              color: "#3a3f36",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textDecorationColor: "rgba(19,23,18,0.35)",
            }}
          >
            {s}
          </Text>
        ))}
      </View>
    </View>
  );
}
