import { useState } from "react";
import Taro from "@tarojs/taro";
import { View, Text } from "@tarojs/components";
import ShareButton from "@/components/ShareButton";
import {
  IconClock,
  IconRepeat,
  IconSparkles,
  IconChevronRight,
} from "./icons";
import theme from "./theme";
import { recurringBadgeText, nextOccurrenceOf, isEffectivelyDone } from "@/utils/recurrence";
import { checkinEncourage } from "./checkinMeta";

// 品牌蓝（与 Web 打卡卡一致的视觉口径）
const BRAND = "#384877";
const BRAND_LIGHT = "#3b5aa2";
const BRAND_TINT = "#EEF2FF";
const BRAND_BORDER = "#c9d5ef";

// 如约印章：品牌蓝双圈，斜置（与 Web 端打卡卡「如约」印章一致）
function RuyueSeal() {
  return (
    <View
      style={{
        position: "absolute",
        right: "16rpx",
        top: "-18rpx",
        zIndex: 10,
        transform: "rotate(-12deg)",
      }}
    >
      <View
        style={{
          width: "96rpx",
          height: "96rpx",
          borderRadius: "50%",
          border: `3rpx solid rgba(56,72,119,0.35)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: "76rpx",
            height: "76rpx",
            borderRadius: "50%",
            border: `1rpx solid rgba(56,72,119,0.35)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <Text style={{ fontSize: "24rpx", color: "rgba(56,72,119,0.5)", fontWeight: 700, lineHeight: "30rpx" }}>
            如
          </Text>
          <Text style={{ fontSize: "24rpx", color: "rgba(56,72,119,0.5)", fontWeight: 700, lineHeight: "30rpx" }}>
            约
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * 打卡约定卡片（category === "checkin"）：
 * 与 Web 端 LifeTaskCard 的打卡卡一致——唯一的圈就是打卡（👣），每做到一次点一次，
 * 累计「赴约」次数；今日已打卡则盖「如约」印。点卡片进详情看内容与打卡记录。
 */
export default function CheckinCard({
  task,
  analysis,
  subtasks,
  subtaskTree = [],
  checkinMeta,
  onCheckin,
  onCheckinDoneToday,
  onSnooze,
  onSubtaskToggle,
  onSharePrepare,
}) {
  // 子约定较多时默认折叠已完成，露出待办的；可手动展开
  const [hideDoneSubs, setHideDoneSubs] = useState(null);
  // 从属子约定逐级展开成带缩进的树（与 Web 端 subtaskTree 口径一致）
  const tree = subtaskTree.length > 0 ? subtaskTree : subtasks.map((s) => ({ ...s, depth: 0 }));
  const doneToday = Boolean(task.done_today);
  const total = checkinMeta?.total ?? 0;
  const cheerTotal = checkinMeta?.cheer_total ?? 0;
  const recurringText = task.repeat_rule && task.repeat_rule !== "none" ? recurringBadgeText(task) : null;
  const aiNote = analysis?.aiNote || "";
  const nextHm = (() => {
    const next = nextOccurrenceOf(task);
    if (!next) return null;
    return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
  })();

  const goDetail = () => {
    Taro.navigateTo({ url: `/pages/task-detail/index?id=${task.id}` });
  };

  const handleCheckin = (e) => {
    e.stopPropagation();
    if (doneToday) {
      if (onCheckinDoneToday) onCheckinDoneToday(task);
      return;
    }
    if (onCheckin) onCheckin(task);
  };

  const handleSnooze = (e) => {
    e.stopPropagation();
    onSnooze(task);
  };

  const handleSubToggle = (sub) => (e) => {
    e.stopPropagation();
    onSubtaskToggle(sub);
  };

  return (
    <View
      style={{
        position: "relative",
        background: "linear-gradient(150deg, #f8faff 0%, #ffffff 55%)",
        border: `1rpx solid ${BRAND_BORDER}`,
        borderRadius: "16rpx",
        marginBottom: "24rpx",
        overflow: "hidden",
      }}
      onClick={goDetail}
    >
      <RuyueSeal />

      <View style={{ display: "flex", flexDirection: "row", padding: "28rpx" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* title row */}
          <View style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12rpx" }}>
            <View
              style={{
                background: BRAND_TINT,
                border: `1rpx solid #dbe3f7`,
                padding: "4rpx 12rpx",
                borderRadius: "6rpx",
                display: "flex",
                alignItems: "center",
                gap: "6rpx",
              }}
            >
              <Text style={{ fontSize: "20rpx" }}>👣</Text>
              <Text style={{ fontSize: "20rpx", color: BRAND, fontWeight: 500 }}>打卡</Text>
            </View>

            {recurringText && (
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
                <Text style={{ fontSize: "20rpx", color: theme.inkTertiary }}>{recurringText}</Text>
              </View>
            )}

            {doneToday && (
              <View
                style={{
                  background: "#e8f7ee",
                  border: `1rpx solid #b7e4c7`,
                  padding: "4rpx 12rpx",
                  borderRadius: "6rpx",
                }}
              >
                <Text style={{ fontSize: "20rpx", color: "#1f9d55", fontWeight: 500 }}>今日已打卡</Text>
              </View>
            )}

            {task.shared_role === "member" && (
              <View
                style={{
                  border: `1rpx solid ${theme.sage}`,
                  padding: "4rpx 12rpx",
                  borderRadius: "4rpx",
                }}
              >
                <Text style={{ fontSize: "20rpx", color: theme.sage, letterSpacing: "2rpx" }}>
                  共有 · {task.owner_display_name || "对方"}
                </Text>
              </View>
            )}
          </View>

          <View style={{ marginTop: "12rpx" }}>
            <Text
              style={{
                fontSize: "32rpx",
                fontWeight: 600,
                color: theme.ink,
                lineHeight: "44rpx",
              }}
            >
              {task.title}
            </Text>
          </View>

          {task.description ? (
            <Text
              style={{
                marginTop: "10rpx",
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
          <View style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "24rpx", marginTop: "14rpx" }}>
            <View style={{ display: "flex", alignItems: "center", gap: "8rpx" }}>
              <IconClock size={22} color={theme.inkQuaternary} />
              <Text style={{ fontSize: "24rpx", color: theme.inkTertiary }}>
                {doneToday && nextHm ? `今天已打卡 · ${nextHm} 再提醒` : (recurringText || analysis?.timeLabel || "全天")}
              </Text>
            </View>
          </View>

          {/* AI note（鼓励/建议） */}
          {aiNote ? (
            <View
              style={{
                marginTop: "18rpx",
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
          ) : null}

          {/* 鼓励的话：下一里程碑进度 */}
          <Text style={{ marginTop: "14rpx", fontSize: "22rpx", color: BRAND_LIGHT, lineHeight: "32rpx" }}>
            {checkinEncourage(total)}
          </Text>

          {/* sub promises（含从属子约定，逐级缩进可勾选）：超过 4 条时默认折叠已完成 */}
          {tree.length > 0 && (() => {
            const isDone = (s) => isEffectivelyDone(s);
            const subDoneCount = tree.filter(isDone).length;
            const progress = Math.round((subDoneCount / tree.length) * 100);
            const hideDone = hideDoneSubs === null ? tree.length > 4 : hideDoneSubs;
            const visibleSubs = hideDone ? tree.filter((s) => !isDone(s)) : tree;
            return (
              <View
                style={{
                  marginTop: "22rpx",
                  borderTop: `1rpx dashed ${theme.border}`,
                  paddingTop: "20rpx",
                }}
              >
                <View style={{ display: "flex", alignItems: "center", gap: "16rpx", marginBottom: "16rpx" }}>
                  <IconChevronRight size={18} color={theme.primary} />
                  <Text style={{ fontSize: "24rpx", color: theme.inkSecondary, fontWeight: 500 }}>
                    子约定 {subDoneCount}/{tree.length}
                  </Text>
                  <View style={{ flex: 1, height: "8rpx", borderRadius: "4rpx", background: "rgba(91,130,160,0.15)", overflow: "hidden" }}>
                    <View style={{ width: `${progress}%`, height: "100%", borderRadius: "4rpx", background: theme.primary }} />
                  </View>
                  <Text style={{ fontSize: "22rpx", color: theme.inkTertiary }}>{progress}%</Text>
                </View>
                {visibleSubs.map((s) => {
                  const subDone = isDone(s);
                  return (
                    <View
                      key={s.id}
                      onClick={handleSubToggle(s)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16rpx",
                        marginBottom: "12rpx",
                        paddingLeft: `${(s.depth || 0) * 36}rpx`,
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
                {visibleSubs.length === 0 && (
                  <Text style={{ fontSize: "24rpx", color: theme.inkQuaternary, marginBottom: "12rpx" }}>
                    {tree.length} 条子约定已全部完成
                  </Text>
                )}
                {subDoneCount > 0 && (
                  <View
                    onClick={(e) => {
                      e.stopPropagation();
                      setHideDoneSubs(!hideDone);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: "6rpx", padding: "6rpx 0" }}
                  >
                    <Text style={{ fontSize: "22rpx", color: theme.water, letterSpacing: "1rpx" }}>
                      {hideDone ? `展开已完成 ${subDoneCount} 条` : "折叠已完成"}
                    </Text>
                    <Text style={{ fontSize: "20rpx", color: theme.water }}>{hideDone ? "▾" : "▴"}</Text>
                  </View>
                )}
              </View>
            );
          })()}
        </View>

        {/* 打卡按钮：本卡唯一的圈，点一下 = 一次赴约 */}
        <View
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginLeft: "20rpx",
            flexShrink: 0,
          }}
        >
          <View
            onClick={handleCheckin}
            style={{
              width: "88rpx",
              height: "88rpx",
              borderRadius: "50%",
              border: doneToday ? "none" : `2rpx solid ${BRAND_BORDER}`,
              background: doneToday ? `linear-gradient(140deg, ${BRAND_LIGHT}, ${BRAND})` : "#ffffff",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: doneToday ? "0 8rpx 24rpx rgba(56,72,119,0.3)" : "none",
            }}
          >
            {doneToday ? (
              <Text style={{ color: "#ffffff", fontSize: "22rpx", fontWeight: 700, letterSpacing: "2rpx" }}>
                如约
              </Text>
            ) : (
              <Text style={{ fontSize: "40rpx", lineHeight: "48rpx" }}>👣</Text>
            )}
          </View>
          {total > 0 && (
            <Text
              onClick={(e) => { e.stopPropagation(); goDetail(); }}
              style={{
                marginTop: "10rpx",
                fontSize: "20rpx",
                color: BRAND,
                textAlign: "center",
              }}
            >
              已打卡 {total} 次
            </Text>
          )}
          {cheerTotal > 0 && (
            <Text
              style={{
                marginTop: "6rpx",
                fontSize: "20rpx",
                color: BRAND,
                textAlign: "center",
              }}
            >
              ♥ 加油 {cheerTotal}
            </Text>
          )}
          <Text
            onClick={(e) => { e.stopPropagation(); goDetail(); }}
            style={{
              marginTop: "6rpx",
              fontSize: "20rpx",
              color: theme.inkQuaternary,
              textAlign: "center",
              textDecoration: "underline",
              textUnderlineOffset: "4rpx",
            }}
          >
            详情 ›
          </Text>
        </View>
      </View>

      {/* footer actions */}
      <View
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `1rpx solid ${BRAND_TINT}`,
          padding: "16rpx 28rpx",
        }}
      >
        <Text style={{ fontSize: "20rpx", color: theme.inkQuaternary, letterSpacing: "4rpx" }}>约定 · 打卡</Text>
        <View style={{ display: "flex", alignItems: "center", gap: "28rpx" }}>
          <ShareButton
            theme={theme}
            text="转发"
            style={{ padding: "4rpx 14rpx", fontSize: "20rpx" }}
            onClick={(e) => {
              e?.stopPropagation?.();
              onSharePrepare?.(task);
            }}
          />
          <Text
            onClick={handleSnooze}
            style={{ fontSize: "24rpx", color: theme.inkTertiary }}
          >
            顺延
          </Text>
          <Text
            onClick={handleCheckin}
            style={{ fontSize: "24rpx", color: BRAND, letterSpacing: "2rpx", fontWeight: 600 }}
          >
            {doneToday ? "今日已赴约" : "打卡 →"}
          </Text>
        </View>
      </View>
    </View>
  );
}
