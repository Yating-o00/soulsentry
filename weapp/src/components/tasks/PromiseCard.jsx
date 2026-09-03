import Taro from "@tarojs/taro";
import { View, Text } from "@tarojs/components";
import {
  IconClock,
  IconMapPin,
  IconRepeat,
  IconSparkles,
  IconBot,
  IconChevronRight,
} from "./icons";
import theme from "./theme";

const categoryMap = {
  work: "工作",
  personal: "个人",
  health: "健康",
  study: "学习",
  family: "家庭",
  shopping: "购物",
  finance: "财务",
  other: "其他",
};

const priorityMark = {
  urgent: { color: theme.seal, label: "紧急" },
  high: { color: theme.seal, label: "高" },
  medium: { color: theme.sage, label: "中" },
  low: { color: theme.inkQuaternary, label: "低" },
};

function Seal() {
  return (
    <View
      style={{
        position: "absolute",
        right: "12rpx",
        top: "-20rpx",
        zIndex: 10,
      }}
    >
      <View
        style={{
          width: "120rpx",
          height: "120rpx",
          borderRadius: "50%",
          border: `3rpx solid ${theme.seal}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: "96rpx",
            height: "96rpx",
            borderRadius: "50%",
            border: `1rpx solid ${theme.seal}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: "32rpx", color: theme.seal, fontWeight: 700, lineHeight: "40rpx" }}>
            如
          </Text>
          <Text style={{ fontSize: "32rpx", color: theme.seal, fontWeight: 700, lineHeight: "40rpx" }}>
            约
          </Text>
        </View>
      </View>
    </View>
  );
}

function makeAiNote(_task, analysis) {
  // 完全信任后端的个性化分析；后端已有 Kimi + 规则兜底
  return analysis?.aiNote || "";
}

export default function PromiseCard({
  task,
  analysis,
  subtasks,
  index,
  onComplete,
  onSnooze,
  onReview,
  onSubtaskToggle,
  onShare,
}) {
  const done = task.status === "completed" || task.status === "done" || task.status === "archived";
  const p = priorityMark[task.priority] || priorityMark.medium;
  const categoryLabel = categoryMap[task.category] || task.category || "其他";
  const aiNote = makeAiNote(task, analysis);

  const goDetail = () => {
    Taro.navigateTo({ url: `/pages/task-detail/index?id=${task.id}` });
  };

  const handleComplete = (e) => {
    e.stopPropagation();
    onComplete(task);
  };

  const handleSnooze = (e) => {
    e.stopPropagation();
    onSnooze(task);
  };

  const handleReview = (e) => {
    e.stopPropagation();
    onReview(task);
  };

  const handleSubToggle = (sub) => (e) => {
    e.stopPropagation();
    onSubtaskToggle(sub);
  };

  const handleDemote = (e) => {
    e.stopPropagation();
    Taro.showToast({ title: "已降级为微任务", icon: "none" });
  };

  const handleShare = (e) => {
    e.stopPropagation();
    onShare(task);
  };

  const handleFeedback = (e) => {
    e.stopPropagation();
    Taro.showToast({ title: "已反馈给心栈", icon: "none" });
  };

  return (
    <View
      style={{
        position: "relative",
        background: theme.card,
        border: `1rpx solid ${analysis?.overdue && !done ? theme.seal : theme.border}`,
        borderStyle: analysis?.overdue && !done ? "dashed" : "solid",
        borderRadius: "16rpx",
        marginBottom: "24rpx",
        overflow: "hidden",
        opacity: done ? 0.85 : 1,
      }}
      onClick={goDetail}
    >
      {done && <Seal />}

      <View style={{ display: "flex", flexDirection: "row", padding: "28rpx" }}>
        {/* check circle */}
        <View
          onClick={handleComplete}
          style={{
            width: "40rpx",
            height: "40rpx",
            borderRadius: "50%",
            border: `2rpx solid ${done ? theme.seal : theme.inkSecondary}`,
            background: done ? theme.seal : "transparent",
            marginTop: "6rpx",
            marginRight: "24rpx",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {done && (
            <Text style={{ color: theme.paper, fontSize: "24rpx" }}>✓</Text>
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          {/* title row */}
          <View style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12rpx" }}>
            <View
              style={{
                width: "8rpx",
                height: "28rpx",
                background: p.color,
                marginRight: "4rpx",
              }}
            />
            <Text
              style={{
                fontSize: "32rpx",
                fontWeight: 600,
                color: theme.ink,
                lineHeight: "44rpx",
                textDecoration: done ? "line-through" : "none",
              }}
            >
              {task.title}
            </Text>

            {analysis?.overdue && !done && (
              <View
                style={{
                  border: `1rpx solid ${theme.seal}`,
                  padding: "2rpx 10rpx",
                  borderRadius: "4rpx",
                }}
              >
                <Text style={{ fontSize: "20rpx", color: theme.seal, letterSpacing: "2rpx" }}>已逾期</Text>
              </View>
            )}

            {analysis?.recurring && (
              <View
                style={{
                  border: `1rpx solid ${theme.border}`,
                  padding: "4rpx 12rpx",
                  display: "flex",
                  alignItems: "center",
                  gap: "6rpx",
                  borderRadius: "4rpx",
                }}
              >
                <IconRepeat size={18} color={theme.inkQuaternary} />
                <Text style={{ fontSize: "20rpx", color: theme.inkTertiary }}>{analysis.recurring}</Text>
              </View>
            )}
          </View>

          {task.description ? (
            <Text
              style={{
                marginTop: "12rpx",
                fontSize: "26rpx",
                color: theme.inkSecondary,
                lineHeight: "38rpx",
              }}
            >
              {task.description.slice(0, 60)}
              {task.description.length > 60 ? "…" : ""}
            </Text>
          ) : null}

          {/* meta */}
          <View style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "24rpx", marginTop: "16rpx" }}>
            <View style={{ display: "flex", alignItems: "center", gap: "8rpx" }}>
              <IconClock size={22} color={theme.inkQuaternary} />
              <Text style={{ fontSize: "24rpx", color: theme.inkTertiary }}>{analysis?.timeLabel || "未安排时间"}</Text>
            </View>
            <Text style={{ fontSize: "24rpx", color: theme.inkTertiary, letterSpacing: "4rpx" }}>{categoryLabel}</Text>
            {analysis?.location ? (
              <View style={{ display: "flex", alignItems: "center", gap: "8rpx" }}>
                <IconMapPin size={22} color={theme.sage} />
                <Text style={{ fontSize: "24rpx", color: theme.sage }}>{analysis.location}</Text>
              </View>
            ) : null}
          </View>

          {/* AI note */}
          {!done && (
            <View
              style={{
                marginTop: "20rpx",
                borderLeft: `3rpx dashed ${theme.water}`,
                paddingLeft: "20rpx",
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: "12rpx",
              }}
            >
              <IconSparkles size={22} color={theme.water} />
              <Text style={{ flex: 1, fontSize: "25rpx", color: theme.inkSecondary, lineHeight: "38rpx" }}>
                {aiNote}
              </Text>
            </View>
          )}

          {/* sub promises */}
          {subtasks && subtasks.length > 0 && (
            <View
              style={{
                marginTop: "24rpx",
                borderTop: `1rpx dashed ${theme.border}`,
                paddingTop: "20rpx",
              }}
            >
              {subtasks.map((s) => {
                const subDone = s.status === "completed" || s.status === "done";
                return (
                  <View
                    key={s.id}
                    onClick={handleSubToggle(s)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16rpx",
                      marginBottom: "12rpx",
                    }}
                  >
                    <View
                      style={{
                        width: "14rpx",
                        height: "14rpx",
                        borderRadius: "50%",
                        background: subDone ? theme.seal : "transparent",
                        border: subDone ? "none" : `2rpx solid ${theme.inkQuaternary}`,
                        flexShrink: 0,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: "26rpx",
                        color: subDone ? theme.inkQuaternary : theme.inkSecondary,
                        textDecoration: subDone ? "line-through" : "none",
                      }}
                    >
                      {s.title}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* auto execution */}
          {analysis?.autoExec && !done && (
            <View
              style={{
                marginTop: "24rpx",
                border: `1rpx dashed ${theme.water}`,
                background: "rgba(91, 130, 160, 0.08)",
                padding: "20rpx",
                borderRadius: "8rpx",
              }}
            >
              <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16rpx" }}>
                <View style={{ display: "flex", alignItems: "center", gap: "12rpx" }}>
                  <IconBot size={28} color={theme.primary} />
                  <Text style={{ fontSize: "26rpx", color: theme.ink, fontWeight: 500 }}>
                    自动执行 · {analysis.autoExec.label}
                  </Text>
                  <Text style={{ fontSize: "22rpx", color: theme.inkTertiary, letterSpacing: "2rpx" }}>
                    {analysis.autoExec.state === "ready" && "已预执行，待验收"}
                    {analysis.autoExec.state === "running" && "执行中…"}
                    {analysis.autoExec.state === "done" && "已完成 ✓"}
                    {analysis.autoExec.state === "manual" && "已转人工"}
                  </Text>
                </View>
              </View>

              <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16rpx", flexWrap: "wrap", gap: "16rpx" }}>
                <Text style={{ fontSize: "22rpx", color: theme.inkTertiary }}>
                  信任度 {analysis.autoExec.trust}% · {analysis.autoExec.trustLevel}
                </Text>
                <View style={{ display: "flex", alignItems: "center", gap: "16rpx" }}>
                  <Text
                    onClick={handleFeedback}
                    style={{ fontSize: "24rpx", color: theme.water, letterSpacing: "2rpx" }}
                  >
                    调整
                  </Text>
                  <Text
                    onClick={handleFeedback}
                    style={{ fontSize: "24rpx", color: theme.water, letterSpacing: "2rpx" }}
                  >
                    我来接管
                  </Text>
                  <View
                    onClick={handleReview}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6rpx",
                      border: `1rpx solid ${theme.border}`,
                      background: theme.card,
                      padding: "8rpx 16rpx",
                      borderRadius: "6rpx",
                    }}
                  >
                    <Text style={{ fontSize: "24rpx", color: theme.ink }}>验收</Text>
                    <IconChevronRight size={20} color={theme.inkTertiary} />
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* footer actions */}
      {!done && (
        <View
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1rpx solid ${theme.border}`,
            padding: "16rpx 28rpx",
          }}
        >
          <Text style={{ fontSize: "20rpx", color: theme.inkQuaternary, letterSpacing: "4rpx" }}>约定 · PROMISE</Text>
          <View style={{ display: "flex", alignItems: "center", gap: "28rpx" }}>
            <Text
              onClick={handleShare}
              style={{ fontSize: "24rpx", color: theme.inkTertiary }}
            >
              分享
            </Text>
            {analysis?.overdue && (
              <Text
                onClick={handleDemote}
                style={{
                  fontSize: "24rpx",
                  color: theme.sage,
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  textUnderlineOffset: "4rpx",
                }}
              >
                降级为微任务
              </Text>
            )}
            <Text
              onClick={handleSnooze}
              style={{ fontSize: "24rpx", color: theme.inkTertiary }}
            >
              顺延
            </Text>
            <Text
              onClick={handleComplete}
              style={{ fontSize: "24rpx", color: theme.primary, letterSpacing: "2rpx", fontWeight: 600 }}
            >
              完成约定 →
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
