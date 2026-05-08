import React, { useEffect, useRef, useState } from "react";
import { useGeolocation } from "@/components/hooks/useGeolocation";
import { base44 } from "@/api/base44Client";
import OnTheWayReminderCard from "./OnTheWayReminderCard";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分钟检查一次顺路提醒
const MIN_MOVE_METERS = 200; // 移动超过 200m 才重新检查
const SNOOZED_KEY = "on_the_way_snoozed_v1";

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 2 * R * Math.asin(Math.sqrt(x));
}

function getSnoozedMap() {
  try {
    return JSON.parse(localStorage.getItem(SNOOZED_KEY) || "{}");
  } catch {
    return {};
  }
}

function setSnoozed(taskId, minutes = 60) {
  const map = getSnoozedMap();
  map[taskId] = Date.now() + minutes * 60 * 1000;
  localStorage.setItem(SNOOZED_KEY, JSON.stringify(map));
}

function isSnoozed(taskId) {
  const map = getSnoozedMap();
  return map[taskId] && map[taskId] > Date.now();
}

/**
 * 全局顺路提醒宿主：
 * - 监听位置变化
 * - 周期性调用 nearbyTaskMatcher（Kimi + OSM 匹配）
 * - 弹出底部浮层卡片
 */
export default function OnTheWayReminderHost() {
  const { position, permission } = useGeolocation({ enabled: true, intervalMs: 120000 });
  const [activeMatch, setActiveMatch] = useState(null);
  const lastCheckedRef = useRef({ pos: null, time: 0 });

  useEffect(() => {
    if (!position || permission === "denied") return;

    const now = Date.now();
    const moved = distanceMeters(lastCheckedRef.current.pos, position);
    const elapsed = now - lastCheckedRef.current.time;

    // 移动超过阈值 或 距上次检查超过周期 才触发
    if (moved < MIN_MOVE_METERS && elapsed < CHECK_INTERVAL_MS) return;

    lastCheckedRef.current = { pos: position, time: now };

    base44.functions.invoke("nearbyTaskMatcher", {
      latitude: position.latitude,
      longitude: position.longitude,
    }).then((res) => {
      const matches = res?.data?.matches || [];
      // 找一个未被 snooze 的匹配
      const next = matches.find((m) => !isSnoozed(m.task_id));
      if (next) setActiveMatch(next);
    }).catch((e) => {
      console.warn("[OnTheWay] match failed:", e?.message);
    });
  }, [position, permission]);

  if (!activeMatch) return null;

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 z-[60] flex justify-center md:justify-end pointer-events-none">
      <div className="pointer-events-auto w-full md:w-auto">
        <OnTheWayReminderCard
          match={activeMatch}
          onConfirm={() => {
            setSnoozed(activeMatch.task_id, 60 * 6); // 确认后 6 小时内不再弹同一条
            setActiveMatch(null);
          }}
          onSnooze={() => {
            setSnoozed(activeMatch.task_id, 60); // 稍后 = 1 小时静默
            setActiveMatch(null);
          }}
          onDismiss={() => {
            setSnoozed(activeMatch.task_id, 60 * 3);
            setActiveMatch(null);
          }}
        />
      </div>
    </div>
  );
}