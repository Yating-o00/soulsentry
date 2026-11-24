import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudRain, Home, Loader2, MapPin, RefreshCw, Route, Sparkles, Utensils, Wallet } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { isTaskEffectivelyCompleted } from "@/lib/taskStatus";
import { useListSubtasks } from "@/components/buddy/useListSubtasks";
import { PanelCard, TintButton, useBuddyAgent, useBuddyState } from "./shared";
import BuddyChatPanel from "./BuddyChatPanel";

const TRAVEL_QUICK_ACTIONS = [
  {
    label: "下雨换行程",
    note: "下雨了，请把受影响的户外安排换成具体的雨天备选/室内安排，并保持其他天和字段尽量不变。",
  },
  {
    label: "今天想躺平",
    note: "今天想躺平，请减少当天的安排和步行，留出休息时间，其他天尽量不变。",
  },
  {
    label: "少走点路",
    note: "同行人不想多走路，请减少步行和爬坡，优先打车/索道/短距离安排，其他天尽量不变。",
  },
  {
    label: "省点预算",
    note: "预算再省一点，请把住宿/餐饮/交通换成更省的选择，保留核心体验，其他天尽量不变。",
  },
];

function resolveTravelDestination(profile, state) {
  const raw = String(state?.itinerary?.dest || profile?.answers?.dest || "").trim();
  const dayMatch = raw.match(/(\d+)\s*(天|日)/);
  const dest = raw.replace(/[\s·-]*\d+\s*(天|日)\s*$/, "").trim();
  return { raw, dest: dest && dest !== "目的地" ? dest : "", dayMatch };
}

function resolveTravelStyle(profile, state, note = "") {
  return (
    state?.itinerary?.style ||
    profile?.answers?.style ||
    (/(暴走|打卡)/.test(note) ? "暴走打卡" : /(人文|博物馆|历史)/.test(note) ? "深度人文" : "躺平度假")
  );
}

function splitLegacyActivities(note) {
  return String(note || "")
    .split(/[；;。]\s*/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ time: "", name: text, detail: "", type: "activity" }));
}

function normalizeActivities(list) {
  return (Array.isArray(list) ? list : [])
    .map((activity, activityIndex) => {
      if (typeof activity === "string") {
        return {
          time: "",
          name: activity.trim().slice(0, 40) || `安排 ${activityIndex + 1}`,
          detail: "",
          type: "activity",
        };
      }
      return {
        time: String(activity?.time || "").slice(0, 10),
        name: String(activity?.name || activity?.title || "").slice(0, 40) || `安排 ${activityIndex + 1}`,
        detail: String(activity?.detail || activity?.note || "").slice(0, 120),
        type: String(activity?.type || "activity"),
      };
    })
    .filter((activity) => activity.name);
}

function normalizeTravelDay(day, index) {
  const hasStructuredActivities = Array.isArray(day?.activities) && day.activities.length > 0;
  const activities = hasStructuredActivities
    ? normalizeActivities(day.activities)
    : splitLegacyActivities(day?.note);
  const rainActivities = normalizeActivities(day?.rain_activities);

  return {
    day: String(day?.day || `D${index + 1}`).slice(0, 10),
    title: String(day?.title || "当天安排").slice(0, 40),
    area: String(day?.area || "").slice(0, 30),
    pace: String(day?.pace || "").slice(0, 10),
    weather: String(day?.weather || "").slice(0, 20),
    rain_backup: String(day?.rain_backup || "").slice(0, 80),
    rain_activities: rainActivities,
    activities,
    food: String(day?.food || "").slice(0, 80),
    stay: String(day?.stay || "").slice(0, 80),
    transport: String(day?.transport || "").slice(0, 80),
    budget: String(day?.budget || "").slice(0, 40),
    // 新版用 tip 放避坑提示；旧版没有 activities，note 就是当天的安排，避免重复展示
    tip: String(day?.tip || (hasStructuredActivities ? day?.note || "" : "")).slice(0, 120),
  };
}

function normalizeTravelTrip(itinerary) {
  const days = (Array.isArray(itinerary?.days) ? itinerary.days : []).map(normalizeTravelDay);
  return {
    dest: String(itinerary?.dest || "").slice(0, 30),
    style: String(itinerary?.style || "").slice(0, 20),
    summary: String(itinerary?.summary || "").slice(0, 100),
    area: String(itinerary?.area || "").slice(0, 50),
    transport: String(itinerary?.transport || "").slice(0, 100),
    stay: String(itinerary?.stay || "").slice(0, 100),
    budget: String(itinerary?.budget || "").slice(0, 60),
    highlights: (Array.isArray(itinerary?.highlights) ? itinerary.highlights : [])
      .map((item) => String(item || "").slice(0, 30))
      .filter(Boolean)
      .slice(0, 4),
    booking: (Array.isArray(itinerary?.booking) ? itinerary.booking : [])
      .map((item) => String(item || "").slice(0, 60))
      .filter(Boolean)
      .slice(0, 4),
    changes: (Array.isArray(itinerary?.changes) ? itinerary.changes : [])
      .map((item) => String(item || "").slice(0, 60))
      .filter(Boolean)
      .slice(0, 4),
    weather_mode: itinerary?.weather_mode === "rain" ? "rain" : "clear",
    days,
  };
}

function travelDayIntensity(day) {
  const text = `${day?.title || ""}${(day?.activities || []).map((a) => `${a.name}${a.detail}`).join("")}${day?.tip || ""}`;
  if (/(登山|徒步|暴走|全天|长途|高强度|爬|骑行|赶路)/.test(text)) return 92;
  if (/(休息|自由|躺平|咖啡|发呆|慢|闲逛|温泉|酒店)/.test(text)) return 32;
  if (/(适中|充实)/.test(`${day?.pace || ""}`)) return 62;
  return 56;
}

function travelDaySummary(day) {
  const activities = (day.activities || [])
    .map((activity) => `${activity.time ? `${activity.time} ` : ""}${activity.name}${activity.detail ? `（${activity.detail}）` : ""}`)
    .join("；");
  return [
    activities,
    day.food ? `餐饮：${day.food}` : "",
    day.tip ? `提示：${day.tip}` : "",
  ]
    .filter(Boolean)
    .join("；")
    .slice(0, 300);
}

function serializeTravelTrip(trip) {
  const top = [
    trip.summary ? `概述：${trip.summary}` : "",
    trip.area ? `区域：${trip.area}` : "",
    trip.transport ? `交通：${trip.transport}` : "",
    trip.stay ? `住宿：${trip.stay}` : "",
    trip.budget ? `预算：${trip.budget}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const days = trip.days
    .map((day) => {
      const activities = (day.activities || [])
        .map((activity) => `${activity.time ? `${activity.time} ` : ""}${activity.name}${activity.detail ? `（${activity.detail}）` : ""}`)
        .join("；");
      return `${day.day} ${day.title}｜区域：${day.area}｜节奏：${day.pace}｜天气：${day.weather}｜安排：${activities}｜交通：${day.transport}｜住宿：${day.stay}｜餐饮：${day.food}｜预算：${day.budget}｜雨天备选：${day.rain_backup}｜提示：${day.tip}`;
    })
    .join("\n");
  return [top, days].filter(Boolean).join("\n").slice(0, 5000);
}

function classifyTravelAdjustment(text) {
  const t = String(text || "");
  if (/(下雨|雨天|天气)/.test(t)) {
    return "只改受天气影响的户外安排，用具体可执行的室内/雨天备选取代；其他天和字段尽量保持不变。";
  }
  if (/(高铁|动车|火车|飞机|航班|自驾|包车|租车|大巴|打车)/.test(t)) {
    return "只改交通方式及受影响的当天交通、时间安排；其他天和字段尽量保持不变。";
  }
  if (/(酒店|民宿|客栈|住|洱海|古城)/.test(t)) {
    return "只改住宿区域/酒店及受影响的每天住宿行；其他天和字段尽量保持不变。";
  }
  if (/(吃|美食|火锅|素食|清真|餐厅)/.test(t)) {
    return "只改餐饮推荐和受影响的用餐安排；其他天和字段尽量保持不变。";
  }
  if (/(预算|省钱|便宜|贵)/.test(t)) {
    return "只改与预算相关的住宿/餐饮/交通选择，保留核心体验；其他天和字段尽量保持不变。";
  }
  if (/(累|躺平|少走|轻松|老人|小孩|亲子|膝盖)/.test(t)) {
    return "只调节奏和体力相关安排：减少步行/爬坡，增加休息和打车；其他天和字段尽量保持不变。";
  }
  return "只改与新要求直接相关的行/天；其他安排尽量保持原样。";
}

function detectQuickTravelRow(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  // 问句交给聊天回答，不擅自改行程
  if (/[？?]|多久|怎么|几点|哪里|吗/.test(t)) return null;
  const mode = t.match(/(高铁|动车|火车|飞机|航班|自驾|包车|租车|大巴)/);
  if (mode && /(坐|改|换|选|要|走|定)/.test(t)) {
    return { transport: `${mode[1]}优先；当地交通按当天安排` };
  }
  const stay = t.match(/(?:住|住宿|酒店|民宿|客栈)(?:在|去|到|选|换到|换)?\s*([\u4e00-\u9fa5A-Za-z0-9·\s]{2,18})/);
  if (stay) {
    const value = stay[1].replace(/[吧呢啊哈。！!，,].*$/, "").trim();
    if (value) return { stay: value };
  }
  return null;
}

function ItineraryArtifact({
  itinerary,
  tint,
  generating,
  canSync,
  childByKey,
  missingCount,
  syncing,
  autoError,
  onRetrySync,
  onQuickAdjust,
  onToggleRain,
}) {
  const trip = useMemo(() => normalizeTravelTrip(itinerary), [itinerary]);
  const days = trip.days;
  const [selected, setSelected] = useState(0);
  const bodyRef = useRef(null);
  const dayPanelRef = useRef(null);
  const shouldScrollToDayRef = useRef(false);

  useEffect(() => {
    if (selected >= days.length) setSelected(0);
  }, [days.length, selected]);

  // 点日期后把当天的详细安排滚进卡片可视区，避免点了没反应
  useEffect(() => {
    if (!shouldScrollToDayRef.current) return;
    shouldScrollToDayRef.current = false;
    const body = bodyRef.current;
    const panel = dayPanelRef.current;
    if (!body || !panel) return;
    const top = panel.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 44;
    body.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [selected]);

  // 每次重排后把卡片滚回顶部，让「本次调整」和新的第一天先被看到
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [itinerary?.generated_at]);

  const selectDay = (index) => {
    shouldScrollToDayRef.current = true;
    setSelected(index);
  };

  const day = days[Math.min(selected, Math.max(0, days.length - 1))] || null;
  const child = day ? childByKey?.get(`day-${Math.min(selected, days.length - 1) + 1}`) : null;
  const rainMode = trip.weather_mode === "rain";
  const dayActivities = !day
    ? []
    : rainMode
      ? day.rain_activities.length > 0
        ? day.rain_activities
        : day.rain_backup
          ? [{ time: "", name: "雨天备选", detail: day.rain_backup, type: "rest" }]
          : day.activities
      : day.activities;
  const syncLabel = !canSync
    ? "已收进搭子空间"
    : autoError
      ? "同步约定失败"
      : syncing || missingCount > 0
        ? "正在同步到约定"
        : "已同步到约定";

  if (!day) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] tracking-widest text-stone-400">定制行程</span>
        {autoError && canSync && !generating ? (
          <button
            type="button"
            onClick={onRetrySync}
            className="text-[10px] text-amber-600 underline underline-offset-2"
          >
            {syncLabel} · 重试
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-stone-400">
            {generating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> 正在按你的要求调整
              </>
            ) : (
              syncLabel
            )}
          </span>
        )}
      </div>

      <div
        ref={bodyRef}
        className="mt-2 max-h-[min(290px,31dvh)] space-y-2 overflow-y-auto pr-1"
      >
        {trip.changes.length > 0 && (
          <div className="rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed" style={{ background: tint[0], color: tint[2] }}>
            本次调整：{trip.changes.slice(0, 3).join("；")}
          </div>
        )}

        {rainMode && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[10px] text-sky-700">
            <span>雨天模式：户外安排已换成室内/备选</span>
            <button type="button" onClick={() => onToggleRain(false)} className="shrink-0 underline">
              恢复原计划
            </button>
          </div>
        )}

        <div
          className="relative overflow-hidden rounded-xl px-3 py-2.5"
          style={{ background: `linear-gradient(135deg, ${tint[0]} 0%, #ffffff 78%)` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <h3 className="truncate text-[18px] font-semibold text-stone-900">{trip.dest || "目的地"}</h3>
                <span className="text-[11px] text-stone-500">
                  {days.length}天{trip.style ? ` · ${trip.style}` : ""}
                </span>
              </div>
              {trip.summary && <p className="mt-1 text-[11px] leading-relaxed text-stone-600">{trip.summary}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[9px] text-stone-500">
              {generating ? "调整中" : "实时更新"}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] leading-snug text-stone-500">
            {trip.area && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-2.5 w-2.5 shrink-0" /> {trip.area}
              </span>
            )}
            {trip.transport && (
              <span className="inline-flex items-center gap-0.5">
                <Route className="h-2.5 w-2.5 shrink-0" /> {trip.transport}
              </span>
            )}
            {trip.stay && (
              <span className="inline-flex items-center gap-0.5">
                <Home className="h-2.5 w-2.5 shrink-0" /> {trip.stay}
              </span>
            )}
            {trip.budget && (
              <span className="inline-flex items-center gap-0.5">
                <Wallet className="h-2.5 w-2.5 shrink-0" /> {trip.budget}
              </span>
            )}
          </div>

        </div>

        <div className="sticky top-0 z-10 -mx-1 flex gap-1.5 overflow-x-auto bg-white/95 px-1 py-1 backdrop-blur scrollbar-hide">
          {days.map((item, index) => {
            const active = index === selected;
            const intensity = travelDayIntensity(item);
            return (
              <button
                type="button"
                key={`${item.day}-${index}`}
                onClick={() => selectDay(index)}
                className={`min-w-[76px] shrink-0 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                  active ? "text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                }`}
                style={active ? { background: tint[2], borderColor: tint[2] } : undefined}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[9px] ${active ? "text-white/70" : "text-stone-400"}`}>{item.day}</span>
                  {item.pace && (
                    <span className={`text-[8px] ${active ? "text-white/70" : "text-stone-400"}`}>{item.pace}</span>
                  )}
                </div>
                <div className="mt-0.5 line-clamp-1 text-[10px] font-medium">{item.title}</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${intensity}%`, background: active ? "rgba(255,255,255,0.8)" : tint[2] }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        <div ref={dayPanelRef} className="rounded-xl border border-stone-100 bg-[#FAF9F7] p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <h4 className="text-[13px] font-semibold text-stone-900">{day.title}</h4>
                {day.area && <span className="text-[9px] text-stone-400">{day.area}</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                {day.pace && <span className="rounded-full bg-white px-1.5 py-0.5 text-stone-500">{day.pace}</span>}
                {day.weather && !rainMode && <span className="rounded-full bg-white px-1.5 py-0.5 text-stone-500">{day.weather}</span>}
                {rainMode && <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-sky-700">雨天模式</span>}
                {child && (
                  <span className="rounded-full px-1.5 py-0.5" style={{ background: tint[0], color: tint[2] }}>
                    {isTaskEffectivelyCompleted(child) ? "已完成" : "已列入约定"}
                  </span>
                )}
              </div>
            </div>
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{ background: tint[0], color: tint[2] }}
            >
              {day.day}
            </span>
          </div>

          {dayActivities.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {dayActivities.map((activity, activityIndex) => (
                <div key={`${activity.name}-${activityIndex}`} className="flex gap-2">
                  <span className="w-9 shrink-0 pt-0.5 text-[9px] tabular-nums text-stone-400">
                    {activity.time || "—"}
                  </span>
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint[2] }} />
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-medium text-stone-800">{activity.name}</span>
                    {activity.detail && (
                      <span className="ml-1 text-[10px] leading-relaxed text-stone-500">{activity.detail}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-stone-500">{day.tip || "当天以休息和自由活动为主。"}</p>
          )}

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {[
              { label: "交通", value: day.transport, Icon: Route },
              { label: "住宿", value: day.stay, Icon: Home },
              { label: "餐饮", value: day.food, Icon: Utensils },
              { label: "当天预算", value: day.budget, Icon: Wallet },
            ]
              .filter((item) => item.value)
              .map(({ label, value, Icon }) => (
                <div key={label} className="rounded-lg bg-white px-2 py-1.5">
                  <div className="flex items-center gap-1 text-[8px] text-stone-400">
                    <Icon className="h-2.5 w-2.5" /> {label}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-stone-600">{value}</div>
                </div>
              ))}
          </div>

          {!rainMode && day.rain_backup && (
            <p className="mt-1.5 rounded-lg bg-white px-2 py-1.5 text-[9px] leading-relaxed text-stone-500">
              <CloudRain className="mr-1 inline h-3 w-3" /> 雨天备选：{day.rain_backup}
            </p>
          )}
          {day.tip && dayActivities.length > 0 && (
            <p className="mt-1.5 rounded-lg bg-white px-2 py-1.5 text-[9px] leading-relaxed text-stone-500">
              <Sparkles className="mr-1 inline h-3 w-3" /> {day.tip}
            </p>
          )}
        </div>

        {trip.highlights.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {trip.highlights.slice(0, 4).map((highlight) => (
              <span key={highlight} className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[9px] text-stone-500">
                {highlight}
              </span>
            ))}
          </div>
        )}

        {trip.booking.length > 0 && (
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-2 py-1.5 text-[9px] leading-relaxed text-amber-700">
            预约提醒：{trip.booking.slice(0, 3).join("；")}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onToggleRain(!rainMode)}
          disabled={generating}
          className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] transition-colors disabled:opacity-50"
          style={{ borderColor: tint[1], color: tint[2] }}
        >
          {rainMode ? "恢复原计划" : "下雨换行程"}
        </button>
        {TRAVEL_QUICK_ACTIONS.filter((action) => action.label !== "下雨换行程").map((action) => (
          <button
            type="button"
            key={action.label}
            onClick={() => onQuickAdjust(action.note, action.label)}
            disabled={generating}
            className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] transition-colors disabled:opacity-50"
            style={{ borderColor: tint[1], color: tint[2] }}
          >
            {action.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[9px] leading-relaxed text-stone-400">
        上下滑动看完整安排；也可以直接说「坐高铁」「住洱海边」，相关行会实时调整。
      </p>
    </div>
  );
}

/**
 * 旅游搭子的第一栏：只保留一个聊天输入口。
 * 认领后自动把行程排进对话；之后每一句调整（累了/下雨/换交通/换住宿…）都直接触发重排，
 * 行程以专业行程板的形式留在聊天面板里：顶部是整体信息，中间按天切换，下面是可点的快捷调整。
 */
export function TravelChatPanel({ buddy, profile, tint, projectTask = null }) {
  const { call } = useBuddyAgent("travel");
  const { state, patch } = useBuddyState("travel");
  const [generating, setGenerating] = useState(false);
  const generatingRef = useRef(false);
  const autoTriedRef = useRef(false);

  const trip = useMemo(() => normalizeTravelTrip(state.itinerary), [state.itinerary]);
  const days = trip.days;
  const rainMode = state.itinerary?.weather_mode === "rain";
  const hasRainData = days.some((day) => day.rain_activities.length > 0 || day.rain_backup);
  const itineraryItems = useMemo(
    () =>
      days.map((day, index) => ({
        key: `day-${index + 1}`,
        title: `${day.day || `D${index + 1}`} · ${day.title}`,
        description: travelDaySummary(day),
      })),
    [days]
  );
  const { childByKey, missingCount, syncing, autoError, syncNow } = useListSubtasks(
    projectTask,
    itineraryItems,
    "travel_itinerary"
  );

  const generateItinerary = async (note, options = {}) => {
    if (generatingRef.current) {
      toast.info("上一版还在调整，等它出来再改这一句");
      return;
    }
    const { dest, dayMatch: destDayMatch } = resolveTravelDestination(profile, state);
    if (!dest) {
      toast.info("先告诉我目的地，我就能把行程排进对话里");
      return;
    }
    const existingDays = days.length;
    const textDayMatch = String(note || "").match(/(\d+)\s*(天|日)/);
    const totalDays = Math.max(2, Math.min(9, Number(textDayMatch?.[1] || existingDays || destDayMatch?.[1] || 5)));
    const style = resolveTravelStyle(profile, state, note);

    // 已有行程时把当前完整方案带进 prompt，让模型只改相关行，而不是推倒重来
    const currentPlan = existingDays > 0 ? serializeTravelTrip(trip) : "";
    const adjustmentHint = existingDays > 0 ? classifyTravelAdjustment(note) : "";
    const finalNote = currentPlan
      ? `当前行程：\n${currentPlan}\n\n用户的新要求：${String(note || "").trim() || "按当前方向优化"}\n调整范围：${adjustmentHint}\n请只改相关行/天，其他安排尽量保持原样；输出完整行程，并用 changes 列出实际改动。`
      : String(note || "").trim();

    generatingRef.current = true;
    setGenerating(true);
    try {
      const data = await call({
        mode: "itinerary",
        payload: { dest, style, days: totalDays, note: finalNote },
      });
      if (!Array.isArray(data?.days) || data.days.length === 0) throw new Error("empty");
      const modelChanges = (Array.isArray(data.changes) ? data.changes : [])
        .map((item) => String(item || "").slice(0, 60))
        .filter(Boolean)
        .slice(0, 4);
      const fallbackChange = options.label || (existingDays > 0 ? "已按你的要求调整" : "");
      patch({
        itinerary: {
          dest,
          style,
          summary: String(data.summary || "").slice(0, 120),
          area: String(data.area || "").slice(0, 60),
          transport: String(data.transport || "").slice(0, 120),
          stay: String(data.stay || "").slice(0, 120),
          budget: String(data.budget || "").slice(0, 80),
          highlights: (Array.isArray(data.highlights) ? data.highlights : [])
            .map((item) => String(item || "").slice(0, 30))
            .filter(Boolean)
            .slice(0, 4),
          booking: (Array.isArray(data.booking) ? data.booking : [])
            .map((item) => String(item || "").slice(0, 60))
            .filter(Boolean)
            .slice(0, 4),
          days: data.days.slice(0, totalDays).map((day, index) => ({
            ...day,
            day: String(day?.day || `D${index + 1}`).slice(0, 10),
            title: String(day?.title || "").trim() || `第 ${index + 1} 天`,
          })),
          changes: modelChanges.length > 0 ? modelChanges : fallbackChange ? [fallbackChange] : [],
          generated_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("[travel itinerary]", error);
      toast.error("行程暂时没排出来，在聊天框说「重新排一版」再试");
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const shouldGenerateFromChat = (text) => {
    const t = String(text || "").trim();
    if (!t) return false;
    const hasItinerary = days.length > 0;
    const explicit = /(重新规划|重新排|再排一版|生成行程|排一版|改行程|调整行程)/.test(t);
    const situational = /(累了|下雨|天气不好|天气变了|预算有限|预算不够|超预算|压低预算|预算紧张|老人|小孩|少走|多留|太赶|太满)/.test(t);
    const changeIntent = /(改|换|调整|选|坐|住|想吃|要住|要坐|不去|想去|提前|推迟|压缩)/.test(t);
    const travelTopic = /(高铁|动车|火车|飞机|航班|自驾|包车|租车|大巴|打车|酒店|民宿|客栈|住|洱海|古城|吃|美食|火锅|素食|清真|景点|博物馆|路线|行程|安排)/.test(t);
    const creation = /(行程|攻略|安排|规划|计划|路线|几天|\d+\s*[天日]|想去|去.{0,10}玩|帮我排)/.test(t);
    if (explicit || situational) return true;
    return hasItinerary ? changeIntent && travelTopic : creation;
  };

  const handleToggleRain = (next) => {
    if (next && !hasRainData) {
      // 旧行程没有结构化雨天备选时，才让 AI 补一版
      generateItinerary("下雨了，请把受影响的户外安排换成具体可执行的室内/雨天备选，并保持其他天和字段尽量不变。", {
        quick: true,
        label: "下雨换行程",
      });
      return;
    }
    patch({ itinerary: { weather_mode: next ? "rain" : "clear" } });
    toast.success(next ? "已切换为雨天备选，户外安排已替换" : "已恢复原计划");
  };

  const handleAfterSend = ({ text }) => {
    const t = String(text || "").trim();
    if (!t) return;

    // 下雨/雨停是本地即时切换，不需要等 AI，卡片立刻变成雨天安排
    if (/(雨停了|天气好了|恢复原计划)/.test(t)) {
      handleToggleRain(false);
      return;
    }
    if (/(下雨|雨天|天气不好|天气变了)/.test(t)) {
      if (!rainMode) {
        if (hasRainData) {
          handleToggleRain(true);
          return;
        }
        generateItinerary("用户说下雨了，请把受影响的户外安排换成具体可执行的室内/雨天备选，并保持其他天和字段尽量不变。");
        return;
      }
      return;
    }

    // 交通/住宿这类明确选择先本地改对应行，立刻可见；再让 AI 在后台细化每天安排
    const quickRow = detectQuickTravelRow(t);
    if (quickRow) {
      patch({ itinerary: quickRow });
      generateItinerary(`用户刚在对话里说：${text}`);
      return;
    }

    if (!shouldGenerateFromChat(t)) return;
    generateItinerary(`用户刚在对话里说：${text}`);
  };

  const handleQuickAdjust = (note, label) => {
    generateItinerary(note, { quick: true, label });
  };

  // 认领后第一次进入旅游搭子：按认领答案自动把行程排进聊天，不再需要单独的「生成行程」按钮
  useEffect(() => {
    if (autoTriedRef.current) return;
    if (!resolveTravelDestination(profile, state).dest || days.length) return;
    autoTriedRef.current = true;
    const timer = setTimeout(() => {
      generateItinerary("按我认领时说的目的地、天数和风格，先排一版专业、可执行的弹性行程");
    }, 700);
    return () => clearTimeout(timer);
  }, [profile?.answers?.dest, days.length]);

  const artifact = days.length ? (
    <ItineraryArtifact
      itinerary={state.itinerary}
      tint={tint}
      generating={generating}
      canSync={Boolean(projectTask)}
      childByKey={childByKey}
      missingCount={missingCount}
      syncing={syncing}
      autoError={autoError}
      onRetrySync={() => syncNow({ notify: true }).catch(() => {})}
      onQuickAdjust={handleQuickAdjust}
      onToggleRain={handleToggleRain}
    />
  ) : (
    <div className="rounded-2xl border border-dashed border-stone-200 bg-[#FAF9F7] px-3.5 py-3 text-[12px] leading-relaxed text-stone-500">
      {generating ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在按你说的排行程…
        </span>
      ) : resolveTravelDestination(profile, state).dest ? (
        "正在按你的目的地排一版专业行程，马上放进对话里。"
      ) : (
        "告诉我目的地、天数和想要的节奏，我直接在对话里把行程排出来。"
      )}
    </div>
  );

  return (
    <BuddyChatPanel
      buddy={buddy}
      profile={profile}
      tint={tint}
      projectTask={projectTask}
      artifacts={artifact}
      onAfterSend={handleAfterSend}
    />
  );
}

/** 当地灵感库：按认领目的地 LLM 生成（绝不串目的地）；一键「加进行前清单」 */
export function InspirationPanel({ buddy, profile, tint, projectTask = null }) {
  const { state, patch } = useBuddyState("travel");
  const { call } = useBuddyAgent("travel");
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const dest = String(profile?.answers?.dest || "").trim();
  const added = state.inspiration_added || [];
  // 只展示为本目的地生成的灵感；未认领目的地时展示示例（大理），并明确标注是示例
  const dynamicIdeas = dest && state.inspiration?.dest === dest ? state.inspiration.ideas : null;
  const staticIdeas = buddy.extras?.inspirations || [];
  const ideas = dynamicIdeas || (!dest ? staticIdeas : []);

  const generate = async () => {
    if (generating || !dest) return;
    setGenerating(true);
    try {
      const data = await call({ mode: "inspiration", payload: { dest } });
      if (!Array.isArray(data?.ideas) || data.ideas.length === 0) throw new Error("empty");
      patch({ inspiration: { dest, ideas: data.ideas, generated_at: new Date().toISOString() } });
    } catch (e) {
      toast.error(e?.message || "灵感没生成出来，再试一次");
    } finally {
      setGenerating(false);
    }
  };

  const add = (idea) => {
    if (added.includes(idea.name)) return;
    const title = `${idea.name}（灵感）`;
    patch({
      inspiration_added: [...added, idea.name],
      checklist_extra: [...(state.checklist_extra || []), title],
    });
    // 立刻落成子约定，不必等用户切到「清单」页再同步
    if (projectTask) {
      httpRequest("/api/tasks", {
        method: "POST",
        body: {
          title,
          description: "行前清单 · 来自旅游搭子",
          category: "personal",
          priority: "medium",
          parent_task_id: projectTask.id,
          buddy_list_source: "travel_checklist",
        },
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["tasks"] }))
        .catch(() => {});
    }
    toast.success(`已加进行前清单：${idea.name}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold text-stone-900">
          {dest ? `「${dest}」当地灵感` : "本地灵感"}
        </h2>
        {dest && dynamicIdeas && (
          <button
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} /> 换一批
          </button>
        )}
      </div>
      {dest && !dynamicIdeas ? (
        <PanelCard>
          <div className="py-4 text-center">
            <p className="text-sm text-stone-500">还没有「{dest}」的当地灵感。让搭子按目的地给你找真正值得去的？</p>
            <TintButton tint={tint} onClick={generate} disabled={generating} className="mt-4 w-full">
              {generating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `生成「${dest}」当地灵感`}
            </TintButton>
          </div>
        </PanelCard>
      ) : (
        <>
          {!dest && (
            <p className="px-1 text-xs text-stone-400">示例（大理）。认领时告诉搭子你的目的地，灵感会换成你要去的地方。</p>
          )}
          {ideas.map((idea) => {
            const isAdded = added.includes(idea.name);
            return (
              <PanelCard key={idea.name}>
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: tint[0], color: tint[2] }}>
                    {idea.kind}
                  </span>
                  <span className="text-[15px] font-medium text-stone-900">{idea.name}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">{idea.desc}</p>
                <TintButton tint={tint} outline={!isAdded} onClick={() => add(idea)} disabled={isAdded} className="mt-3 w-full">
                  {isAdded ? "已进行前清单" : "＋ 加入行前清单"}
                </TintButton>
              </PanelCard>
            );
          })}
        </>
      )}
    </div>
  );
}
