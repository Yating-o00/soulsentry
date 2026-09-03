import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { IconX, IconSend, IconPencil, IconUserCheck, IconCheck } from "./icons";

const snoozeReasons = ["精力不足", "时间被占用", "设备/条件未就绪", "外部阻塞", "忘记了", "范围变更"];
const times = ["今晚", "明天上午", "明天下午", "下周一", "自定义…"];

function toChinaIso(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00+08:00`;
}

function computeSnoozeTime(when) {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (when) {
    case "今晚":
      base.setHours(21, 0, 0, 0);
      break;
    case "明天上午":
      base.setDate(base.getDate() + 1);
      base.setHours(9, 0, 0, 0);
      break;
    case "明天下午":
      base.setDate(base.getDate() + 1);
      base.setHours(14, 0, 0, 0);
      break;
    case "下周一": {
      const day = base.getDay() || 7;
      base.setDate(base.getDate() + (8 - day));
      base.setHours(9, 0, 0, 0);
      break;
    }
    case "自定义…":
    default:
      base.setDate(base.getDate() + 1);
      base.setHours(9, 0, 0, 0);
  }
  return toChinaIso(base);
}

function Overlay({ children, onClose }) {
  return (
    <View
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(19,23,18,0.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      {children}
    </View>
  );
}

function SheetHeader({ title, sub, onClose }) {
  return (
    <View
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        borderBottom: "1rpx solid rgba(19,23,18,0.15)",
        padding: "28rpx",
      }}
    >
      <View style={{ flex: 1, paddingRight: "20rpx" }}>
        <Text style={{ fontSize: "34rpx", fontWeight: 700, color: "#131712" }}>{title}</Text>
        {sub && (
          <Text style={{ marginTop: "8rpx", fontSize: "24rpx", color: "#7b8277" }} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      <View onClick={onClose} style={{ padding: "8rpx" }}>
        <IconX size={36} />
      </View>
    </View>
  );
}

function Pill({ label, active, onClick, activeColor = "#131712" }) {
  return (
    <View
      onClick={onClick}
      style={{
        border: `1rpx solid ${active ? activeColor : "rgba(19,23,18,0.3)"}`,
        background: active ? activeColor : "transparent",
        padding: "12rpx 24rpx",
        marginRight: "16rpx",
        marginBottom: "16rpx",
      }}
    >
      <Text style={{ fontSize: "26rpx", color: active ? "#fdfdf9" : "#3a3f36" }}>{label}</Text>
    </View>
  );
}

export function SnoozeSheet({ task, onClose, onConfirm }) {
  const [reason, setReason] = useState(null);
  const [when, setWhen] = useState("明天上午");

  const handleConfirm = () => {
    if (!reason) return;
    const iso = computeSnoozeTime(when);
    onConfirm(task, { end_time: iso, reminder_time: iso, reason, when });
  };

  return (
    <Overlay onClose={onClose}>
      <View
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "85vh",
          background: "#ffffff",
          borderTopLeftRadius: "24rpx",
          borderTopRightRadius: "24rpx",
          overflow: "hidden",
        }}
      >
        <SheetHeader title="顺延这个约定" sub={task.title} onClose={onClose} />

        <View style={{ padding: "28rpx" }}>
          <Text style={{ fontSize: "22rpx", color: "#7b8277", letterSpacing: "4rpx" }}>顺延到</Text>
          <View style={{ display: "flex", flexWrap: "wrap", marginTop: "16rpx" }}>
            {times.map((t) => (
              <Pill key={t} label={t} active={when === t} onClick={() => setWhen(t)} />
            ))}
          </View>

          <Text style={{ marginTop: "12rpx", fontSize: "22rpx", color: "#7b8277", letterSpacing: "4rpx" }}>
            发生了什么？（会记入记忆，帮心栈下次排得更准）
          </Text>
          <View style={{ display: "flex", flexWrap: "wrap", marginTop: "16rpx" }}>
            {snoozeReasons.map((r) => (
              <Pill key={r} label={r} active={reason === r} onClick={() => setReason(r)} activeColor="#db3356" />
            ))}
          </View>

          <Button
            onClick={handleConfirm}
            disabled={!reason}
            style={{
              marginTop: "24rpx",
              width: "100%",
              height: "88rpx",
              lineHeight: "88rpx",
              background: reason ? "#131712" : "#131712",
              color: "#fdfdf9",
              fontSize: "30rpx",
              letterSpacing: "6rpx",
              borderRadius: "8rpx",
              opacity: reason ? 1 : 0.35,
            }}
          >
            顺延 · 并记入记忆
          </Button>

          <View style={{ marginTop: "20rpx" }}>
            <Text
              style={{
                textAlign: "center",
                fontSize: "22rpx",
                color: "#7b8277",
              }}
            >
              顺延不是失败 —— 心栈会据此校准你的时间估算
            </Text>
          </View>
        </View>
      </View>
    </Overlay>
  );
}

export function ExecPreview({ task, analysis, onClose, onApprove }) {
  const ax = analysis?.autoExec;
  const [sent, setSent] = useState(false);

  if (!ax) return null;

  const handleApprove = () => {
    setSent(true);
    setTimeout(() => {
      onApprove(task);
    }, 400);
  };

  return (
    <Overlay onClose={onClose}>
      <View
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "85vh",
          background: "#ffffff",
          borderTopLeftRadius: "24rpx",
          borderTopRightRadius: "24rpx",
          overflow: "hidden",
        }}
      >
        <SheetHeader
          title={ax.previewTitle}
          sub={`自动执行 · ${ax.label} · 信任度 ${ax.trust}%（${ax.trustLevel}）`}
          onClose={onClose}
        />

        <View style={{ padding: "28rpx" }}>
          <View
            style={{
              border: "1rpx dashed #6e8a73",
              background: "rgba(176,198,179,0.12)",
              padding: "24rpx",
              borderRadius: "8rpx",
            }}
          >
            {(ax.previewBody || []).map((line, i) => (
              <Text
                key={i}
                style={{
                  fontSize: line.startsWith("——") ? "22rpx" : "26rpx",
                  color: line.startsWith("——") ? "#7b8277" : "#3a3f36",
                  lineHeight: "40rpx",
                  marginTop: line.startsWith("——") ? "20rpx" : "0",
                }}
              >
                {line || "\u00A0"}
              </Text>
            ))}
          </View>

          {sent ? (
            <View
              style={{
                marginTop: "28rpx",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12rpx",
                border: "1rpx solid #db3356",
                padding: "24rpx",
              }}
            >
              <IconCheck size={24} color="#db3356" />
              <Text style={{ fontSize: "28rpx", color: "#db3356" }}>已确认，交给心栈执行</Text>
            </View>
          ) : (
            <View style={{ marginTop: "28rpx", display: "flex", gap: "16rpx" }}>
              <Button
                onClick={handleApprove}
                style={{
                  flex: 1,
                  height: "80rpx",
                  lineHeight: "80rpx",
                  background: "#131712",
                  color: "#fdfdf9",
                  fontSize: "26rpx",
                  borderRadius: "8rpx",
                  margin: 0,
                }}
              >
                <View style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8rpx" }}>
                  <IconSend size={22} />
                  <Text style={{ color: "#fdfdf9", fontSize: "26rpx" }}>验收并执行</Text>
                </View>
              </Button>
              <Button
                onClick={onClose}
                style={{
                  flex: 1,
                  height: "80rpx",
                  lineHeight: "80rpx",
                  background: "#ffffff",
                  color: "#3a3f36",
                  fontSize: "26rpx",
                  border: "1rpx solid rgba(19,23,18,0.3)",
                  borderRadius: "8rpx",
                  margin: 0,
                }}
              >
                <View style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8rpx" }}>
                  <IconPencil size={22} />
                  <Text style={{ color: "#3a3f36", fontSize: "26rpx" }}>修改</Text>
                </View>
              </Button>
              <Button
                onClick={onClose}
                style={{
                  flex: 1,
                  height: "80rpx",
                  lineHeight: "80rpx",
                  background: "#ffffff",
                  color: "#3a3f36",
                  fontSize: "26rpx",
                  border: "1rpx solid rgba(19,23,18,0.3)",
                  borderRadius: "8rpx",
                  margin: 0,
                }}
              >
                <View style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8rpx" }}>
                  <IconUserCheck size={22} />
                  <Text style={{ color: "#3a3f36", fontSize: "26rpx" }}>我来接管</Text>
                </View>
              </Button>
            </View>
          )}

          <View style={{ marginTop: "20rpx" }}>
            <Text
              style={{
                textAlign: "center",
                fontSize: "22rpx",
                color: "#7b8277",
              }}
            >
              好评会提升这类自动化的信任度，差评会让它更谨慎
            </Text>
          </View>
        </View>
      </View>
    </Overlay>
  );
}
