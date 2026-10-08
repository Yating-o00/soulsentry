import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { httpRequest } from '@/api/httpClient';
import { toast } from 'sonner';
import { MapPin, AlertTriangle, Bell, Check, Clock, X } from 'lucide-react';

/**
 * SentinelGeoWatcher
 * 基于 HTML5 Geolocation 的"任务级"地理围栏监听器（地理守护触发核心）。
 *
 * 常态：每 10 分钟定位一次，移动 ≥80m 才上报（429 防护的既有调优）。
 * 停留确认（dwell）：后端返回 enter_candidate（进了围栏但还没确认停留）后，
 * 切换 30s 高频采样，连续 3 个采样点速度 <5km/h（≈90 秒）即确认停留并上报，
 * 5 分钟未确认自动回常态——宁漏不错，路过不打扰。
 *
 * 呈现：守护动态卡片（现在做 / 稍后提醒 / 不了=7天静默），而非一次性弹窗。
 */
const MIN_MOVE_M = 80;                       // 常态：移动 80m 以内视为静止，不上报
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;   // 常态 10 分钟轮询
const DWELL_INTERVAL_MS = 30 * 1000;          // dwell 确认：30 秒高频采样
const DWELL_LOW_SPEED_SAMPLES = 3;            // 连续 3 个低速采样 ≈ 90s 停留确认
const DWELL_MAX_SPEED_KMH = 5;
const DWELL_TIMEOUT_MS = 5 * 60 * 1000;       // 5 分钟未确认回常态
const STARTUP_DELAY_MS = 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000; // 命中 429 后暂停 30 分钟

function distance(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2
    + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 2 * R * Math.asin(Math.sqrt(x));
}

function speedKmh(movedM, elapsedMs) {
  if (movedM == null || !elapsedMs || elapsedMs <= 0) return null;
  return (movedM / 1000) / (elapsedMs / 3600000);
}

const LEVEL_STYLES = {
  critical: { icon: AlertTriangle, className: 'text-rose-500', duration: 15000 },
  assertive: { icon: Bell, className: 'text-amber-500', duration: 12000 },
  standard: { icon: MapPin, className: 'text-blue-500', duration: 8000 },
  ambient: { icon: MapPin, className: 'text-slate-400', duration: 5000 },
  silent: null
};

const EVENT_LABELS = {
  enter: '到达',
  arrival: '到达',
  passby: '路过',
  exit: '离开',
  commute: '路上',
  semantic_confirm: '确认地点'
};

// 守护动态卡片：此刻情境 + 三个出口（现在做 / 稍后提醒 / 不了）
function GeoToastCard({ r, onClose }) {
  const [busy, setBusy] = useState(false);
  const taskId = r.task_id;
  const locKey = r.loc_key || (r.task_id ? `task:${r.task_id}` : null);

  const run = async (fn, okMsg) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
    } catch {
      toast.error('操作失败，请稍后再试');
    } finally {
      setBusy(false);
      onClose();
    }
  };

  const doComplete = () => run(
    () => httpRequest(`/api/tasks/${taskId}`, { method: 'PATCH', body: { data: { status: 'completed' } } }),
    '已完成，做得好'
  );

  const doSnooze = () => run(async () => {
    // 再约定出口：挪到 10 分钟后（骑车/拎东西时此刻做不到，比重复弹窗科学）
    const until = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await httpRequest(`/api/tasks/${taskId}`, { method: 'PATCH', body: { data: { snooze_until: until } } });
  }, '好，10 分钟后再提醒你');

  const doSilence = () => run(async () => {
    // 通勤卡：「不了」= 忽略这条路上观察（两次自动降权）；其余卡：地点 7 天静默
    if (r.event === 'commute' && r.watch_id) {
      await base44.functions.invoke('sentinelSemanticAction', { action: 'ignore', watch_id: r.watch_id });
      return;
    }
    if (locKey) {
      await base44.functions.invoke('sentinelGeoAction', { action: 'silence', loc_key: locKey });
    }
  }, r.event === 'commute' ? '好，这条路上先不提醒' : '该地点 7 天内不再提醒');

  // 语义地点学习卡：到场停留后问「这是你要守护的地点吗」——确认即学习，不是则记一次忽略
  if (r.event === 'semantic_confirm') {
    const doConfirm = () => run(async () => {
      if (r.location_id) {
        await base44.functions.invoke('sentinelSemanticAction', {
          action: 'confirm', watch_id: r.watch_id, location_id: r.location_id
        });
      } else if (r.new_place) {
        await base44.functions.invoke('sentinelSemanticAction', {
          action: 'new_place',
          watch_id: r.watch_id,
          name: r.location_name,
          latitude: r.new_place.latitude,
          longitude: r.new_place.longitude,
          coord_type: r.new_place.coord_type || 'gcj02'
        });
      }
    }, r.location_id ? '已设为守护地点，之后路过会提醒你' : '已记下这个地点');
    const doIgnore = () => run(
      () => base44.functions.invoke('sentinelSemanticAction', { action: 'ignore', watch_id: r.watch_id }),
      '好，不再问这个地点'
    );
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[13px] leading-relaxed text-slate-600">{r.context_summary}</div>
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={doConfirm}
            className="inline-flex items-center gap-1 rounded-full bg-[#384877] px-2.5 py-1 text-[11px] text-white disabled:opacity-50"
          >
            <Check className="w-3 h-3" /> {r.location_id ? '设为守护地点' : '把这里记下来'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={doIgnore}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 disabled:opacity-50"
          >
            <X className="w-3 h-3" /> 不是这里
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] leading-relaxed text-slate-600">
        {Array.isArray(r.top_tasks) && r.top_tasks.length
          ? r.top_tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')
          : (r.context_summary || r.task_title)}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-0.5">
        {taskId && (
          <button
            type="button"
            disabled={busy}
            onClick={doComplete}
            className="inline-flex items-center gap-1 rounded-full bg-[#384877] px-2.5 py-1 text-[11px] text-white disabled:opacity-50"
          >
            <Check className="w-3 h-3" /> 现在做
          </button>
        )}
        {taskId && (
          <button
            type="button"
            disabled={busy}
            onClick={doSnooze}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 disabled:opacity-50"
          >
            <Clock className="w-3 h-3" /> 稍后提醒
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={doSilence}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-400 disabled:opacity-50"
        >
          <X className="w-3 h-3" /> 不了
        </button>
      </div>
    </div>
  );
}

export default function SentinelGeoWatcher({ intervalMs = DEFAULT_INTERVAL_MS }) {
  const lastSentRef = useRef(null);   // { latitude, longitude, at }
  const timerRef = useRef(null);
  const inflightRef = useRef(false);
  const cooldownUntilRef = useRef(0); // 429 退避截止时间戳
  const modeRef = useRef('normal');   // normal | dwelling
  const dwellLowRef = useRef(0);      // 连续低速采样计数
  const dwellSinceRef = useRef(0);

  useEffect(() => {
    if (!navigator?.geolocation) return;

    const exitDwell = () => {
      modeRef.current = 'normal';
      dwellLowRef.current = 0;
      dwellSinceRef.current = 0;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };

    const tick = () => {
      // 命中过 429？暂停到冷却结束
      if (Date.now() < cooldownUntilRef.current) return;
      if (inflightRef.current) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
          const now = Date.now();
          const prev = lastSentRef.current;
          const moved = distance(prev, coords);
          const spd = speedKmh(moved, prev ? now - prev.at : null);
          const dwelling = modeRef.current === 'dwelling';

          // 常态：移动不足阈值不上报；dwell 高频模式：静止也上报（停留确认需要）
          if (!dwelling && prev && moved < MIN_MOVE_M) return;

          // dwell 采样计数：连续 3 点 <5km/h ⇒ 确认停留
          let dwellConfirm = false;
          if (dwelling) {
            if (spd !== null && spd < DWELL_MAX_SPEED_KMH) {
              dwellLowRef.current += 1;
              if (dwellLowRef.current >= DWELL_LOW_SPEED_SAMPLES) dwellConfirm = true;
            } else {
              dwellLowRef.current = 0;
            }
          }

          inflightRef.current = true;
          try {
            const res = await base44.functions.invoke('sentinelGeofenceTrigger', {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: coords.accuracy,
              // web/Leaflet 使用 WGS-84 坐标，携带上次位置供服务端做顺路方向判定
              coord_type: 'wgs84',
              prev_latitude: prev?.latitude,
              prev_longitude: prev?.longitude,
              // 运动学数据：服务端 dwell 三重确认（进入+停留+方向）的输入
              speed_kmh: spd,
              dwell_confirmed: dwellConfirm
            });
            lastSentRef.current = { ...coords, at: now };
            const results = res?.data?.results || [];

            if (dwellConfirm) exitDwell(); // 已确认停留，回常态

            if (dwelling) {
              // 圈外或超时 → 回常态（宁漏不错）
              const stillCandidate = results.some((r) => r.event === 'enter_candidate' || r.dwell_confirmed);
              if (!stillCandidate || now - dwellSinceRef.current > DWELL_TIMEOUT_MS) exitDwell();
            } else if (results.some((r) => r.event === 'enter_candidate')) {
              // 进入候选圈：切高频采样做停留确认
              modeRef.current = 'dwelling';
              dwellLowRef.current = 0;
              dwellSinceRef.current = now;
              timerRef.current = setInterval(tick, DWELL_INTERVAL_MS);
            }

            // 守护动态（enter_candidate 不打扰——正在确认你是否停留）
            results.filter((r) => r.event !== 'enter_candidate').forEach((r) => {
              const style = LEVEL_STYLES[r.level] || LEVEL_STYLES.standard;
              if (!style) return; // silent
              const Icon = style.icon;
              const eventLabel = EVENT_LABELS[r.event] || '附近';
              const wayLabel = r.event === 'passby' ? '' : (r.on_the_way ? '顺路 · ' : '');
              const toastId = toast(
                <GeoToastCard r={r} onClose={() => toast.dismiss(toastId)} />,
                {
                  title: `📍 ${wayLabel}${eventLabel}「${r.location_name}」`,
                  icon: <Icon className={`w-4 h-4 ${style.className}`} />,
                  duration: style.duration * 2 // 守护动态需要读完的时间
                }
              );
            });
          } catch (e) {
            // 命中限流则进入冷却，避免持续打 base44
            const status = e?.status || e?.response?.status;
            const code = e?.data?.error;
            if (status === 429 || /rate limit/i.test(e?.message || '')) {
              cooldownUntilRef.current = Date.now() + RATE_LIMIT_COOLDOWN_MS;
              exitDwell();
              console.warn('[SentinelGeoWatcher] 命中限流，暂停 30 分钟');
            } else if (status === 404 || code === "NOT_FOUND") {
              // 独立后端未启用地理围栏函数时静默跳过，避免持续刷屏。
            } else {
              console.warn('[SentinelGeoWatcher] trigger failed:', e?.message);
            }
          } finally {
            inflightRef.current = false;
          }
        },
        (err) => {
          console.warn('[SentinelGeoWatcher] geolocation error:', err?.message);
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    };

    // 启动后先延迟一段时间再跑首次，避免与页面初始加载的并发请求堆叠
    const startup = setTimeout(tick, STARTUP_DELAY_MS);
    timerRef.current = setInterval(tick, intervalMs);

    // 关键：页面/PWA 从后台切回前台时立刻补跑一次
    // —— 这是浏览器允许的"用户回来那一刻补一次位置匹配"的最佳时机
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);

    return () => {
      clearTimeout(startup);
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);

  return null;
}
