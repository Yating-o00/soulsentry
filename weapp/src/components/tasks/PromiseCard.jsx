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
  urgent: { color: "#db3356", label: "紧急" },
  high: { color: "#db3356", label: "高" },
  medium: { color: "#8fa893", label: "中" },
  low: { color: "#7b8277", label: "低" },
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
          border: "3rpx solid #db3356",
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
            border: "1rpx solid #db3356",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: "32rpx", color: "#db3356", fontWeight: 700, lineHeight: "40rpx" }}>
            如
          </Text>
          <Text style={{ fontSize: "32rpx", color: "#db3356", fontWeight: 700, lineHeight: "40rpx" }}>
            约
          </Text>
        </View>
      </View>
    </View>
  );
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

  return (
    <View
      style={{
        position: "relative",
        background: "#ffffff",
        border: `1rpx solid ${analysis?.overdue && !done ? "#db3356" : "rgba(19,23,18,0.15)"}`,
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
            border: `2rpx solid ${done ? "#db3356" : "#3a3f36"}`,
            background: done ? "#db3356" : "transparent",
            marginTop: "6rpx",
            marginRight: "24rpx",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {done && (
            <Text style={{ color: "#fdfdf9", fontSize: "24rpx" }}>✓</Text>
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
                color: "#131712",
                lineHeight: "44rpx",
                textDecoration: done ? "line-through" : "none",
              }}
            >
              {task.title}
            </Text>

            {analysis?.overdue && !done && (
              <View
                style={{
                  border: "1rpx solid #db3356",
                  padding: "2rpx 10rpx",
                }}
              >
                <Text style={{ fontSize: "20rpx", color: "#db3356", letterSpacing: "2rpx" }}>已逾期</Text>
              </View>
            )}

            {analysis?.recurring && (
              <View
                style={{
                  border: "1rpx solid rgba(19,23,18,0.3)",
                  padding: "4rpx 12rpx",
                  display: "flex",
                  alignItems: "center",
                  gap: "6rpx",
                }}
              >
                <IconRepeat size={18} />
                <Text style={{ fontSize: "20rpx", color: "#7b8277" }}>{analysis.recurring}</Text>
              </View>
            )}
          </View>

          {task.description ? (
            <Text
              style={{
                marginTop: "12rpx",
                fontSize: "26rpx",
                color: "#3a3f36",
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
              <IconClock size={22} />
              <Text style={{ fontSize: "24rpx", color: "#7b8277" }}>{analysis?.timeLabel || "未安排时间"}</Text>
            </View>
            <Text style={{ fontSize: "24rpx", color: "#7b8277", letterSpacing: "4rpx" }}>{categoryLabel}</Text>
            {analysis?.location ? (
              <View style={{ display: "flex", alignItems: "center", gap: "8rpx" }}>
                <IconMapPin size={22} />
                <Text style={{ fontSize: "24rpx", color: "#6e8a73" }}>{analysis.location}</Text>
              </View>
            ) : null}
          </View>

          {/* AI note */}
          {analysis?.aiNote && !done && (
            <View
              style={{
                marginTop: "20rpx",
                borderLeft: "3rpx dashed #6e8a73",
                paddingLeft: "20rpx",
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: "12rpx",
              }}
            >
              <IconSparkles size={22} />
              <Text style={{ flex: 1, fontSize: "25rpx", color: "#3a3f36", lineHeight: "38rpx" }}>
                {analysis.aiNote}
              </Text>
            </View>
          )}

          {/* sub promises */}
          {subtasks && subtasks.length > 0 && (
            <View
              style={{
                marginTop: "24rpx",
                borderTop: "1rpx dashed rgba(19,23,18,0.2)",
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
                        background: subDone ? "#db3356" : "transparent",
                        border: subDone ? "none" : "2rpx solid #7b8277",
                        flexShrink: 0,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: "26rpx",
                        color: subDone ? "#7b8277" : "#3a3f36",
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
                border: "1rpx dashed #6e8a73",
                background: "rgba(176,198,179,0.14)",
                padding: "20rpx",
                borderRadius: "8rpx",
              }}
            >
              <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16rpx" }}>
                <View style={{ display: "flex", alignItems: "center", gap: "12rpx" }}>
                  <IconBot size={28} />
                  <Text style={{ fontSize: "26rpx", color: "#131712", fontWeight: 500 }}>
                    自动执行 · {analysis.autoExec.label}
                  </Text>
                  <Text style={{ fontSize: "22rpx", color: "#7b8277", letterSpacing: "2rpx" }}>
                    {analysis.autoExec.state === "ready" && "已预执行，待验收"}
                    {analysis.autoExec.state === "running" && "执行中…"}
                    {analysis.autoExec.state === "done" && "已完成 ✓"}
                    {analysis.autoExec.state === "manual" && "已转人工"}
                  </Text>
                </View>
              </View>

              <View style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16rpx" }}>
                <Text style={{ fontSize: "22rpx", color: "#7b8277" }}>
                  信任度 {analysis.autoExec.trust}% · {analysis.autoExec.trustLevel}
                </Text>
                <View
                  onClick={handleReview}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6rpx",
                    border: "1rpx solid rgba(19,23,18,0.15)",
                    background: "#ffffff",
                    padding: "8rpx 16rpx",
                    borderRadius: "6rpx",
                  }}
                >
                  <Text style={{ fontSize: "24rpx", color: "#131712" }}>验收</Text>
                  <IconChevronRight size={20} />
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
            borderTop: "1rpx solid rgba(19,23,18,0.15)",
            padding: "16rpx 28rpx",
          }}
        >
          <Text style={{ fontSize: "20rpx", color: "#7b8277", letterSpacing: "4rpx" }}>约定 · PROMISE</Text>
          <View style={{ display: "flex", alignItems: "center", gap: "28rpx" }}>
            <Text
              onClick={handleShare}
              style={{ fontSize: "24rpx", color: "#7b8277" }}
            >
              分享
            </Text>
            {analysis?.overdue && (
              <Text
                onClick={handleDemote}
                style={{
                  fontSize: "24rpx",
                  color: "#6e8a73",
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
              style={{ fontSize: "24rpx", color: "#7b8277" }}
            >
              顺延
            </Text>
            <Text
              onClick={handleComplete}
              style={{ fontSize: "24rpx", color: "#db3356", letterSpacing: "2rpx" }}
            >
              完成约定 →
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
