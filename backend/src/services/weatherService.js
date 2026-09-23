// 天气服务：基于 Open-Meteo（免费、无需 API Key）获取当前天气与今日预报，
// 进程内缓存 30 分钟，避免每分钟 cron / 多次请求打爆外部接口。
// 对外提供：天气摘要（看板小标注）、通用提示（notice）、针对户外类约定的温柔建议（task_advice）。

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_LIMIT = 500;
const FETCH_TIMEOUT_MS = 6000;

const weatherCache = new Map();

// WMO 天气代码 → 中文描述 + 图标
const WMO = {
  0: { text: "晴", icon: "☀️" },
  1: { text: "多云间晴", icon: "🌤️" },
  2: { text: "多云", icon: "⛅" },
  3: { text: "阴", icon: "☁️" },
  45: { text: "雾", icon: "🌫️" },
  48: { text: "雾", icon: "🌫️" },
  51: { text: "毛毛雨", icon: "🌦️" },
  53: { text: "毛毛雨", icon: "🌦️" },
  55: { text: "毛毛雨", icon: "🌦️" },
  56: { text: "冻雨", icon: "🌧️" },
  57: { text: "冻雨", icon: "🌧️" },
  61: { text: "小雨", icon: "🌧️" },
  63: { text: "中雨", icon: "🌧️" },
  65: { text: "大雨", icon: "🌧️" },
  66: { text: "冻雨", icon: "🌧️" },
  67: { text: "冻雨", icon: "🌧️" },
  71: { text: "小雪", icon: "❄️" },
  73: { text: "中雪", icon: "❄️" },
  75: { text: "大雪", icon: "❄️" },
  77: { text: "雪粒", icon: "❄️" },
  80: { text: "阵雨", icon: "🌦️" },
  81: { text: "阵雨", icon: "🌦️" },
  82: { text: "强阵雨", icon: "🌧️" },
  85: { text: "阵雪", icon: "🌨️" },
  86: { text: "强阵雪", icon: "🌨️" },
  95: { text: "雷阵雨", icon: "⛈️" },
  96: { text: "雷阵雨伴冰雹", icon: "⛈️" },
  99: { text: "雷阵雨伴冰雹", icon: "⛈️" }
};

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

// 户外类约定关键词：命中即认为受天气影响较大
const OUTDOOR_KEYWORDS = [
  "跑步", "晨跑", "夜跑", "慢跑", "跑操", "户外", "室外", "散步", "快走", "走路",
  "骑行", "骑车", "爬山", "登山", "徒步", "露营", "野餐", "打球", "篮球", "足球",
  "羽毛球", "网球", "排球", "乒乓球", "飞盘", "滑板", "遛弯", "逛公园", "晨走", "拉伸"
];

function wmoInfo(code) {
  return WMO[Number(code)] || { text: "天气多变", icon: "🌡️" };
}

function cacheKey(lat, lon) {
  // 保留两位小数（约 1km 精度），同一城市基本共享缓存
  return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
}

function normalizeWeather(raw) {
  const current = raw?.current || {};
  const daily = raw?.daily || {};
  const code = Number(current.weather_code ?? daily.weather_code?.[0] ?? -1);
  const todayCode = Number(daily.weather_code?.[0] ?? code);
  const info = wmoInfo(code);
  const todayInfo = wmoInfo(todayCode);

  const isRaining = RAIN_CODES.has(code);
  const isSnowing = SNOW_CODES.has(code);
  const willRain = RAIN_CODES.has(todayCode) || isRaining;
  const willSnow = SNOW_CODES.has(todayCode) || isSnowing;

  return {
    temp: typeof current.temperature_2m === "number" ? Math.round(current.temperature_2m) : null,
    code,
    text: info.text,
    icon: info.icon,
    is_raining: isRaining,
    is_snowing: isSnowing,
    today: {
      code: todayCode,
      text: todayInfo.text,
      icon: todayInfo.icon,
      temp_max: typeof daily.temperature_2m_max?.[0] === "number" ? Math.round(daily.temperature_2m_max[0]) : null,
      temp_min: typeof daily.temperature_2m_min?.[0] === "number" ? Math.round(daily.temperature_2m_min[0]) : null,
      precip_probability: typeof daily.precipitation_probability_max?.[0] === "number"
        ? Math.round(daily.precipitation_probability_max[0])
        : null,
      will_rain: willRain,
      will_snow: willSnow
    },
    fetched_at: new Date().toISOString()
  };
}

async function fetchWeather(lat, lon) {
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`
    + "&current=temperature_2m,weather_code"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    + "&timezone=Asia%2FShanghai&forecast_days=1";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const raw = await res.json();
    return normalizeWeather(raw);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取指定坐标的天气（带 30 分钟进程内缓存）。
 * 失败时返回 null，调用方静默降级（看板不显示天气标注即可）。
 */
export async function getWeatherForCoords(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const key = cacheKey(latitude, longitude);
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.weather;
  }

  try {
    const weather = await fetchWeather(latitude, longitude);
    if (weatherCache.size >= CACHE_LIMIT) weatherCache.clear();
    weatherCache.set(key, { at: Date.now(), weather });
    return weather;
  } catch (err) {
    console.warn("[weatherService] fetch failed:", err?.message || err);
    return cached?.weather || null; // 缓存过期但还有旧数据时，宁可展示旧数据
  }
}

/**
 * 判断一条约定是否属于「户外类」——天气对它的影响值得被提起。
 */
export function isOutdoorTask(task) {
  const haystack = `${task?.title || ""} ${task?.description || ""}`;
  return OUTDOOR_KEYWORDS.some((k) => haystack.includes(k));
}

function shortTitle(title) {
  const t = String(title || "这件事").trim();
  return t.length > 10 ? `${t.slice(0, 10)}…` : t;
}

/**
 * 看板通用提示：只在天气确实值得一提时返回一句话，否则返回 null（保持看板干净）。
 */
export function buildWeatherNotice(weather) {
  if (!weather) return null;
  const t = weather.today || {};
  if (weather.is_raining || (t.will_rain && (t.precip_probability ?? 0) >= 50)) {
    return `今天有${weather.text.includes("雨") ? weather.text : "雨"}，出门记得带伞 ☂️`;
  }
  if (weather.is_snowing || t.will_snow) return "今天有雪，路面可能有点滑，出门慢一点 ❄️";
  if (typeof t.temp_max === "number" && t.temp_max >= 35) return `今天最高 ${t.temp_max}°，天热注意防暑 🍃`;
  if (typeof t.temp_min === "number" && t.temp_min <= 0) return `今天最低 ${t.temp_min}°，出门多添一件 🧣`;
  return null;
}

/**
 * 针对单条约定的天气建议。非户外约定或天气平平时不给建议（返回 null），
 * 只在「天气真的会影响这条约定」时才温柔地提一句。
 */
export function buildWeatherAdviceForTask(weather, task) {
  if (!weather || !task) return null;
  const t = weather.today || {};
  const title = shortTitle(task.title);
  const outdoor = isOutdoorTask(task);

  if (outdoor && (weather.is_raining || (t.will_rain && (t.precip_probability ?? 0) >= 50))) {
    return `今天有雨，「${title}」可以换成室内的小版本，或等雨停了再出门，都不迟`;
  }
  if (outdoor && (weather.is_snowing || t.will_snow)) {
    return `今天有雪，「${title}」路滑，改成室内活动或推后一天会更稳妥`;
  }
  if (outdoor && typeof t.temp_max === "number" && t.temp_max >= 35) {
    return `今天最高 ${t.temp_max}°，「${title}」记得避开正午、多补水`;
  }
  if (outdoor && typeof t.temp_min === "number" && t.temp_min <= 0) {
    return `今天最低 ${t.temp_min}°，「${title}」前记得充分热身、注意保暖`;
  }
  if (outdoor && [0, 1].includes(weather.code) && !(t.will_rain || t.will_snow)) {
    return `今天${weather.text}，空气和光线都不错，正好适合「${title}」`;
  }
  return null;
}

/**
 * 提醒场景用：把天气压缩成一小段上下文，供 buildReminderCopy 织入文案。
 */
export function weatherContextForReminder(weather, task) {
  if (!weather) return null;
  const advice = buildWeatherAdviceForTask(weather, task);
  return {
    text: weather.text,
    is_raining: weather.is_raining,
    is_snowing: weather.is_snowing,
    advice
  };
}
