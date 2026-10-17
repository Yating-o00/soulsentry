import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text, Button } from "@tarojs/components";
import { IconX, IconSend, IconPencil, IconUserCheck, IconCheck } from "./icons";
import theme from "./theme";

const snoozeReasons = ["精力不足", "时间被占用", "设备/条件未就绪", "外部阻塞", "忘记了", "范围变更"];
const times = ["5分钟后", "30分钟后", "今晚", "明天上午", "明天下午", "下周一", "自定义…"];

function toChinaIso(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00+08:00`;
}

// previewBody 由 AI 生成，元素可能是对象（如 {title, detail}），统一归一化成文本，避免 [object Object]
function previewLineText(item) {
  if (item == null) return "";
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  if (typeof item === "object") {
    const o = item;
    const title = o.title || o.name || o.label || o.heading || o.step || "";
    const detail = o.detail || o.text || o.content || o.body || o.desc || o.description || o.summary || "";
    if (title && detail) return `${title}：${detail}`;
    if (title || detail) return String(title || detail);
    return Object.values(o).map(previewLineText).filter(Boolean).join(" · ");
  }
  return String(item);
}

function computeSnoozeTime(when) {
  const now = new Date();
  // 短延后：以当前时刻为基准（5分钟/30分钟后再提醒，捕捉"马上有空"的窗口）
  if (when === "5分钟后") return toChinaIso(new Date(now.getTime() + 5 * 60 * 1000));
  if (when === "30分钟后") return toChinaIso(new Date(now.getTime() + 30 * 60 * 1000));
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
        background: "rgba(28, 28, 30, 0.45)",
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
        borderBottom: `1rpx solid ${theme.border}`,
        padding: "28rpx",
      }}
    >
      <View style={{ flex: 1, paddingRight: "20rpx" }}>
        <Text style={{ fontSize: "34rpx", fontWeight: 700, color: theme.ink }}>{title}</Text>
        {sub && (
          <Text style={{ marginTop: "8rpx", fontSize: "24rpx", color: theme.inkTertiary }} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      <View onClick={onClose} style={{ padding: "8rpx" }}>
        <IconX size={36} color={theme.inkQuaternary} />
      </View>
    </View>
  );
}

function Pill({ label, active, onClick, activeColor = theme.primary }) {
  return (
    <View
      onClick={onClick}
      style={{
        border: `1rpx solid ${active ? activeColor : theme.border}`,
        background: active ? activeColor : "transparent",
        padding: "12rpx 24rpx",
        marginRight: "16rpx",
        marginBottom: "16rpx",
        borderRadius: "8rpx",
      }}
    >
      <Text style={{ fontSize: "26rpx", color: active ? theme.paper : theme.inkSecondary }}>{label}</Text>
    </View>
  );
}

export function SnoozeSheet({ task, onClose, onConfirm }) {
  const recurring = task?.repeat_rule && task.repeat_rule !== "none";
  // 重复约定只给当次短延选项：顺延的是"这一次提醒"，不是整个系列
  const options = recurring ? ["5分钟后", "30分钟后", "今晚"] : times;
  const [reason, setReason] = useState(null);
  const [when, setWhen] = useState("30分钟后");

  const handleConfirm = () => {
    if (!reason) return;
    const iso = computeSnoozeTime(when);
    // 顺延只推迟提醒，不抹掉原截止时间；snooze_until/原因进元数据供短延后序列与策略学习。
    // 重复约定的 reminder_time 后端会忽略（保护系列锚点），这里照传不影响。
    onConfirm(task, { reminder_time: iso, snooze_until: iso, reason, when });
  };

  return (
    <Overlay onClose={onClose}>
      <View
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "85vh",
          background: theme.card,
          borderTopLeftRadius: "24rpx",
          borderTopRightRadius: "24rpx",
          overflow: "hidden",
        }}
      >
        <SheetHeader title="顺延这个约定" sub={task.title} onClose={onClose} />

        <View style={{ padding: "28rpx" }}>
          <Text style={{ fontSize: "22rpx", color: theme.inkQuaternary, letterSpacing: "4rpx" }}>顺延到</Text>
          <View style={{ display: "flex", flexWrap: "wrap", marginTop: "16rpx" }}>
            {options.map((t) => (
              <Pill key={t} label={t} active={when === t} onClick={() => setWhen(t)} />
            ))}
          </View>
          {recurring && (
            <Text style={{ marginTop: "12rpx", fontSize: "22rpx", color: theme.inkQuaternary }}>
              只推迟这一次，下一次提醒会照常来
            </Text>
          )}

          <Text style={{ marginTop: "12rpx", fontSize: "22rpx", color: theme.inkQuaternary, letterSpacing: "4rpx" }}>
            发生了什么？（会记入记忆，帮心栈下次排得更准）
          </Text>
          <View style={{ display: "flex", flexWrap: "wrap", marginTop: "16rpx" }}>
            {snoozeReasons.map((r) => (
              <Pill key={r} label={r} active={reason === r} onClick={() => setReason(r)} activeColor={theme.water} />
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
              background: theme.primary,
              color: theme.paper,
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
                color: theme.inkTertiary,
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

export function ExecPreview({ task, analysis, onClose, onApprove, onFeedback, onExecRun }) {
  const ax = analysis?.autoExec;
  const [sent, setSent] = useState(false);

  if (!ax) return null;

  const handleApprove = () => {
    setSent(true);
    setTimeout(() => {
      onApprove(task);
    }, 400);
  };

  const handleFeedback = () => {
    onFeedback(task);
  };

  // 待批准 / 转人工：直接跑 execute 阶段
  const handleExecRun = () => {
    onExecRun?.(task, ax);
  };

  return (
    <Overlay onClose={onClose}>
      <View
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "85vh",
          background: theme.card,
          borderTopLeftRadius: "24rpx",
          borderTopRightRadius: "24rpx",
          overflow: "hidden",
        }}
      >
        <SheetHeader
          title={ax.previewTitle}
          sub={`智能执行 · ${ax.label} · 信任度 ${ax.trust}%（${ax.trustLevel}）`}
          onClose={onClose}
        />

        <View style={{ padding: "28rpx" }}>
          {/* 执行进展：规划 → 执行 → 验收 → 完成 */}
          {(() => {
            const stages = ["规划", "执行", "验收", "完成"];
            const flow = {
              confirm: { done: 1, active: 1, note: "方案已生成，批准后开始执行" },
              running: { done: 1, active: 1, note: "心栈正在执行，完成后可验收" },
              ready: { done: 2, active: 2, note: "已执行完毕，请验收成果" },
              done: { done: 4, note: "已完成" },
              manual: { done: 1, active: 1, failed: true, note: "信任度不足，已转人工，可重试或接管" },
            };
            const f = flow[ax.state] || { done: 0, active: 0, note: "" };
            return (
              <View style={{ marginBottom: "24rpx" }}>
                <View style={{ display: "flex", alignItems: "flex-start" }}>
                  {stages.map((label, i) => {
                    const isDone = i < f.done;
                    const isActive = i === f.active && !isDone;
                    const dotBg = isDone ? theme.sage : isActive ? (f.failed ? theme.seal : theme.primary) : "rgba(91,130,160,0.18)";
                    return (
                      <View key={label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                        {i > 0 && (
                          <View style={{ flex: 1, height: "2rpx", background: isDone ? theme.sage : "rgba(91,130,160,0.18)", marginTop: "13rpx" }} />
                        )}
                        <View style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6rpx", flexShrink: 0 }}>
                          <View style={{ width: "28rpx", height: "28rpx", borderRadius: "14rpx", background: dotBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {isDone ? (
                              <IconCheck size={16} color="#ffffff" />
                            ) : (
                              <Text style={{ fontSize: "18rpx", color: isActive ? "#ffffff" : theme.inkQuaternary, fontWeight: 600 }}>{i + 1}</Text>
                            )}
                          </View>
                          <Text style={{ fontSize: "20rpx", color: isDone || isActive ? theme.inkSecondary : theme.inkQuaternary }}>{label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                {f.note ? (
                  <Text style={{ fontSize: "22rpx", color: f.failed ? theme.seal : theme.inkTertiary, marginTop: "12rpx" }}>{f.note}</Text>
                ) : null}
              </View>
            );
          })()}

          <View
            style={{
              border: `1rpx dashed ${theme.water}`,
              background: "rgba(91, 130, 160, 0.08)",
              padding: "24rpx",
              borderRadius: "8rpx",
            }}
          >
            {(ax.previewBody || []).map((raw, i) => {
              const line = previewLineText(raw);
              return (
                <Text
                  key={i}
                  style={{
                    fontSize: line.startsWith("——") ? "22rpx" : "26rpx",
                    color: line.startsWith("——") ? theme.inkTertiary : theme.inkSecondary,
                    lineHeight: "40rpx",
                    marginTop: line.startsWith("——") ? "20rpx" : "0",
                  }}
                >
                  {line || "\u00A0"}
                </Text>
              );
            })}
          </View>

          {sent ? (
            <View
              style={{
                marginTop: "28rpx",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12rpx",
                border: `1rpx solid ${theme.seal}`,
                padding: "24rpx",
                borderRadius: "8rpx",
              }}
            >
              <IconCheck size={24} color={theme.seal} />
              <Text style={{ fontSize: "28rpx", color: theme.seal }}>已验收，约定已完成</Text>
            </View>
          ) : ax.state === "running" ? (
            <View style={{ marginTop: "28rpx", alignItems: "center", padding: "12rpx 0" }}>
              <Text style={{ fontSize: "24rpx", color: theme.inkTertiary }}>心栈正在执行，完成后会提醒你验收</Text>
            </View>
          ) : (
            <View style={{ marginTop: "28rpx", display: "flex", gap: "16rpx" }}>
              {ax.state === "confirm" || ax.state === "manual" ? (
                <Button
                  onClick={handleExecRun}
                  style={{
                    flex: 1,
                    height: "80rpx",
                    lineHeight: "80rpx",
                    background: theme.primary,
                    color: theme.paper,
                    fontSize: "26rpx",
                    borderRadius: "8rpx",
                    margin: 0,
                  }}
                >
                  <View style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8rpx" }}>
                    <IconSend size={22} color={theme.paper} />
                    <Text style={{ color: theme.paper, fontSize: "26rpx" }}>{ax.state === "confirm" ? "批准执行" : "重试"}</Text>
                  </View>
                </Button>
              ) : (
                <Button
                  onClick={handleApprove}
                  style={{
                    flex: 1,
                    height: "80rpx",
                    lineHeight: "80rpx",
                    background: theme.primary,
                    color: theme.paper,
                    fontSize: "26rpx",
                    borderRadius: "8rpx",
                    margin: 0,
                  }}
                >
                  <View style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8rpx" }}>
                    <IconSend size={22} color={theme.paper} />
                    <Text style={{ color: theme.paper, fontSize: "26rpx" }}>验收，没问题</Text>
                  </View>
                </Button>
              )}
              {ax.state !== "manual" && (
                <Button
                  onClick={handleFeedback}
                  style={{
                    flex: 1,
                    height: "80rpx",
                    lineHeight: "80rpx",
                    background: theme.paper,
                    color: theme.inkSecondary,
                    fontSize: "26rpx",
                    border: `1rpx solid ${theme.border}`,
                    borderRadius: "8rpx",
                    margin: 0,
                  }}
                >
                  <View style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8rpx" }}>
                    <IconPencil size={22} color={theme.inkSecondary} />
                    <Text style={{ color: theme.inkSecondary, fontSize: "26rpx" }}>有问题</Text>
                  </View>
                </Button>
              )}
              <Button
                onClick={onClose}
                style={{
                  flex: 1,
                  height: "80rpx",
                  lineHeight: "80rpx",
                  background: theme.paper,
                  color: theme.inkSecondary,
                  fontSize: "26rpx",
                  border: `1rpx solid ${theme.border}`,
                  borderRadius: "8rpx",
                  margin: 0,
                }}
              >
                <View style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8rpx" }}>
                  <IconUserCheck size={22} color={theme.inkSecondary} />
                  <Text style={{ color: theme.inkSecondary, fontSize: "26rpx" }}>我来接管</Text>
                </View>
              </Button>
            </View>
          )}

          <View style={{ marginTop: "20rpx" }}>
            <Text
              style={{
                textAlign: "center",
                fontSize: "22rpx",
                color: theme.inkTertiary,
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
