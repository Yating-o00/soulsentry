/**
 * 语义地点：理解人话里的"哪里"（v1）
 *
 * 设计原则（见地理守护方案·三）：用户不会说"北纬 39.9°"，会说「家附近的超市」「到阿哲家附近」。
 * 解析分三层：
 *   1) 确定性本地词典解析（零成本、可测试、覆盖设计中的全部例句）
 *   2) 锚点解析：home/office 走 SavedLocation.locationType；「爸妈家」「阿哲家」走名称模糊匹配
 *   3) POI 落点：v1 不接外部地图服务，POI 候选来自用户自己的地点库（类别 + 名称关键词 + 锚点距离）；
 *      落不了点就登记「语义观察」(watch)，等用户真的到场停留后问一次「这是你要守护的地点吗」——
 *      确认即学习，忽略两次自动降权（设计的「首次触发即确认学习」）。
 *
 * 明确不做（留给后续轮次）：通勤路径学习（「下班路上」只解析登记，不做触发）、联系人图谱、AI 兜底解析。
 */
import { prisma } from "../lib/prisma.js";
import { normalizeToGcj02 } from "../lib/geo.js";
import { patchGeoPreference } from "./contextReminder.js";

// 距离判定一律在 GCJ-02 坐标系下进行：上报点已归一化，存库坐标按各自 coordType 纠偏，
// 避免 wgs84 原始值对 GCJ-02 上报点的系统性几百米偏移（北京约 300-600m）
function withGcj(locations) {
  return locations.map((l) => ({
    ...l,
    _gcj: normalizeToGcj02(l.latitude, l.longitude, l.coordType) || { latitude: l.latitude, longitude: l.longitude }
  }));
}

function gcjOf(location) {
  return location?._gcj || normalizeToGcj02(location?.latitude, location?.longitude, location?.coordType)
    || { latitude: location?.latitude, longitude: location?.longitude };
}

// ===== 本地词典 =====

// POI 类别关键词 → SavedLocation.locationType（类型优先）+ 名称关键词兜底
const CATEGORY_KEYWORDS = [
  { keyword: "便利店", category: "shopping", poi_text: "便利店" },
  { keyword: "超市", category: "shopping", poi_text: "超市" },
  { keyword: "商场", category: "shopping", poi_text: "商场" },
  { keyword: "购物中心", category: "shopping", poi_text: "商场" },
  { keyword: "菜市场", category: "shopping", poi_text: "菜市场" },
  { keyword: "健身房", category: "gym", poi_text: "健身房" },
  { keyword: "瑜伽", category: "gym", poi_text: "瑜伽馆" },
  { keyword: "药店", category: "hospital", poi_text: "药店" },
  { keyword: "诊所", category: "hospital", poi_text: "诊所" },
  { keyword: "医院", category: "hospital", poi_text: "医院" },
  { keyword: "餐厅", category: "restaurant", poi_text: "餐厅" },
  { keyword: "餐馆", category: "restaurant", poi_text: "餐馆" },
  { keyword: "饭店", category: "restaurant", poi_text: "饭店" },
  { keyword: "幼儿园", category: "school", poi_text: "幼儿园" },
  { keyword: "学校", category: "school", poi_text: "学校" },
  { keyword: "快递", category: "other", poi_text: "快递" },
  { keyword: "驿站", category: "other", poi_text: "驿站" },
  { keyword: "银行", category: "other", poi_text: "银行" },
  { keyword: "加油站", category: "other", poi_text: "加油站" },
  { keyword: "花店", category: "other", poi_text: "花店" },
  { keyword: "蛋糕店", category: "other", poi_text: "蛋糕店" },
  { keyword: "咖啡店", category: "other", poi_text: "咖啡店" },
  { keyword: "奶茶店", category: "other", poi_text: "奶茶店" },
  { keyword: "打印店", category: "other", poi_text: "打印店" },
  { keyword: "干洗店", category: "other", poi_text: "干洗店" },
  { keyword: "地铁站", category: "other", poi_text: "地铁站" },
  { keyword: "停车场", category: "other", poi_text: "停车场" }
];

const NEAR_RE = /(附近|周边|旁边|周围|一带|左右|不远处)/;
const ON_THE_WAY_RE = /(顺路|通勤|下班路上|上班路上|回家路上|去的路上|回来的路上|路上)/;
const OFFICE_RE = /(公司|单位|上班|办公室|职场|工位)/;
const HOME_RE = /(回家|到家|家里|家中|家门口|家附近|家周边|家旁边|家周围)/;
// 「X家」：先匹配特殊亲属称谓，再按人名/地名处理（阿哲家 / 爸妈家 / 娘家）
const NAMED_HOME_RE = /([\u4e00-\u9fa5A-Za-z·]{1,8})家/;
const KIN_ANCHORS = ["爸妈", "父母", "娘家", "婆家", "岳父岳母", "爷爷奶奶", "外公外婆", "哥哥", "姐姐", "弟弟", "妹妹"];

export function parseSemanticText(input) {
  const text = String(input || "").trim().slice(0, 80);
  const parsed = { anchor_type: null, anchor_text: null, category: null, poi_text: null, relation: "at" };
  if (!text) return parsed;

  if (ON_THE_WAY_RE.test(text)) parsed.relation = "on_the_way";
  else if (NEAR_RE.test(text)) parsed.relation = "near";

  // 锚点：亲属/人名「X家」优先于裸「家」，裸「家」优先于公司
  const named = text.match(NAMED_HOME_RE);
  if (named && named[1]) {
    const name = named[1];
    if (KIN_ANCHORS.some((k) => name.includes(k))) {
      parsed.anchor_type = "named";
      parsed.anchor_text = KIN_ANCHORS.find((k) => name.includes(k));
    } else if (!/这|那|我|你|他|她|咱/.test(name)) {
      parsed.anchor_type = "named";
      parsed.anchor_text = name; // 如「阿哲」
    }
  }
  if (!parsed.anchor_type && HOME_RE.test(text)) {
    parsed.anchor_type = "home";
    parsed.anchor_text = "家";
  }
  if (!parsed.anchor_type && OFFICE_RE.test(text)) {
    parsed.anchor_type = "office";
    parsed.anchor_text = "公司";
  }

  // POI 类别：取文本中最长的命中词
  let best = null;
  for (const item of CATEGORY_KEYWORDS) {
    if (text.includes(item.keyword) && (!best || item.keyword.length > best.keyword.length)) best = item;
  }
  if (best) {
    parsed.category = best.category;
    parsed.poi_text = best.poi_text;
  }

  // 通勤型无显式锚点时按语境推断：下班/上班→公司，回家→家（通勤触发本身留待路径学习）
  if (parsed.relation === "on_the_way" && !parsed.anchor_type) {
    if (/(下班|上班|通勤|公司|单位)/.test(text)) {
      parsed.anchor_type = "office";
      parsed.anchor_text = "公司";
    } else if (/(回家)/.test(text)) {
      parsed.anchor_type = "home";
      parsed.anchor_text = "家";
    }
  }

  return parsed;
}

// ===== 锚点解析 =====

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 2 * R * Math.asin(Math.sqrt(x));
}

function matchAnchor(parsed, locations) {
  if (!parsed?.anchor_type) return null;
  if (parsed.anchor_type === "home") {
    const homes = locations.filter((l) => l.locationType === "home");
    return mostRecent(homes);
  }
  if (parsed.anchor_type === "office") {
    const offices = locations.filter((l) => l.locationType === "office");
    return mostRecent(offices);
  }
  // named：名称模糊匹配（「阿哲」匹配「阿哲家」「阿哲那儿」）
  const key = String(parsed.anchor_text || "");
  if (!key) return null;
  const named = locations.filter((l) => l.name.includes(key));
  if (named.length > 0) return mostRecent(named);
  // 亲属家延伸：「爸妈」也匹配「爸妈家」，反之亦然
  const kin = locations.filter((l) => {
    const base = l.name.replace(/家$/, "");
    return base.length >= 1 && (key.includes(base) || base.includes(key));
  });
  return mostRecent(kin);
}

// 多个候选锚点（如多个 office 类型地点）时，取最近进入的；都没有则取最近更新
function mostRecent(list) {
  if (!list.length) return null;
  return [...list].sort(
    (a, b) => new Date(b.lastEnteredAt || 0) - new Date(a.lastEnteredAt || 0)
  )[0];
}

function categoryMatches(parsed, location) {
  if (!parsed?.poi_text) return true; // 没有类别要求时任何地点都算候选
  if (parsed.category && parsed.category !== "other" && location.locationType === parsed.category) return true;
  return location.name.includes(parsed.poi_text);
}

// ===== 落点解析（一次判定：resolved / candidates / watch / unknown） =====

export function resolveSemanticPlace({ parsed, locations, currentCoords = null }) {
  const hasPoi = !!parsed?.poi_text;
  if (!parsed || (!parsed.anchor_type && !hasPoi)) {
    return { status: "unknown", message: "没听懂这个地点，可以先在地图上选点" };
  }

  const locs = withGcj(locations);
  const anchor = matchAnchor(parsed, locs);
  // 锚点说了但找不到（如没存「公司」）：不去猜别的地点，诚实登记等待补充
  if (parsed.anchor_type && !anchor) {
    return {
      status: "watch",
      reason: "anchor_unknown",
      message: `还不知道你的「${parsed.anchor_text || "地点"}」在哪里，先记下了`,
      anchor_location: null
    };
  }
  // 通勤型（「下班路上」）：路径学习属于后续轮次，先诚实登记
  if (parsed.relation === "on_the_way") {
    return {
      status: "watch",
      reason: "commute_path",
      message: anchor
        ? `「${parsed.anchor_text || ""}路上」需要学习你的通勤路径，先记下了`
        : "通勤路径学习需要先知道你的家和公司，先记下了",
      anchor_location: anchor || null
    };
  }
  // 无 POI 类别：「到爸妈家附近时」= 锚点本身，直接落锚点
  if (!hasPoi && anchor) {
    return { status: "resolved", place: toPlace(anchor), anchor_location: anchor };
  }

  // 候选过滤：类别匹配 + 锚点 1000m 内（无锚点时围绕当前位置 1000m），距离一律 GCJ-02 对齐
  const center = anchor ? gcjOf(anchor) : currentCoords;
  let candidates = locs.filter((l) => categoryMatches(parsed, l) && (!anchor || l.id !== anchor.id));
  if (center) candidates = candidates.filter((l) => haversineM(gcjOf(l), center) <= 1000);
  // 历史光顾频次排序（v1 用最近进入时间代理频次）
  candidates.sort((a, b) => new Date(b.lastEnteredAt || 0) - new Date(a.lastEnteredAt || 0));

  if (candidates.length === 1) {
    return { status: "resolved", place: toPlace(candidates[0]), anchor_location: anchor || null };
  }
  if (candidates.length > 1) {
    return { status: "candidates", candidates: candidates.slice(0, 3).map(toPlace), anchor_location: anchor || null };
  }
  return {
    status: "watch",
    reason: anchor ? "no_poi_near_anchor" : "no_anchor_or_poi",
    message: anchor
      ? `已记住「${parsed.poi_text || "这个地点"}」（以${anchor.name}为锚点），你到场后我会问你确认`
      : "先记下了，你到场停留后我会问你确认",
    anchor_location: anchor || null
  };
}

function toPlace(l) {
  return {
    location_id: l.id,
    name: l.name,
    address: l.address || null,
    latitude: l.latitude,
    longitude: l.longitude,
    coord_type: l.coordType || "wgs84",
    radius: l.radius || 200,
    location_type: l.locationType || "other"
  };
}

// ===== 语义观察（watch）存储：UserPreference.metadata._extraFields.geo_semantic_watches =====

const MAX_WATCHES = 20;
const REASK_INTERVAL_MS = 7 * 24 * 3600 * 1000; // 同一观察最多 7 天问一次

export function listWatches(prefsExtra) {
  const raw = prefsExtra?.geo_semantic_watches;
  return Array.isArray(raw) ? raw.filter((w) => w && typeof w === "object") : [];
}

export async function upsertSemanticWatch(userId, { raw, task_id, parsed }) {
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  const meta = prefs?.metadata && typeof prefs.metadata === "object" ? prefs.metadata : {};
  const extra = meta._extraFields && typeof meta._extraFields === "object" ? meta._extraFields : {};
  const watches = listWatches(extra);

  const existing = watches.find((w) => w.raw === raw && (w.status === "watching" || w.status === "resolved"));
  if (existing) {
    if (task_id && !existing.task_ids?.includes(task_id)) {
      existing.task_ids = [...(existing.task_ids || (existing.task_id ? [existing.task_id] : [])), task_id].slice(-5);
      delete existing.task_id;
    }
    await patchGeoPreference(userId, { geo_semantic_watches: watches });
    return existing;
  }

  const watch = {
    id: `sw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    raw,
    task_ids: task_id ? [task_id] : [],
    anchor_type: parsed?.anchor_type || null,
    anchor_text: parsed?.anchor_text || null,
    category: parsed?.category || null,
    poi_text: parsed?.poi_text || null,
    relation: parsed?.relation || "at",
    status: "watching",
    asked_count: 0,
    ignored_count: 0,
    last_asked_at: null,
    created_at: new Date().toISOString()
  };
  const next = [watch, ...watches]
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, MAX_WATCHES);
  await patchGeoPreference(userId, { geo_semantic_watches: next });
  return watch;
}

export async function getWatch(userId, watchId) {
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  const extra = prefs?.metadata?._extraFields && typeof prefs.metadata._extraFields === "object" ? prefs.metadata._extraFields : {};
  return listWatches(extra).find((w) => w.id === watchId) || null;
}

export async function updateWatches(userId, updater) {
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  const meta = prefs?.metadata && typeof prefs.metadata === "object" ? prefs.metadata : {};
  const extra = meta._extraFields && typeof meta._extraFields === "object" ? meta._extraFields : {};
  const watches = listWatches(extra);
  const next = updater(watches) || watches;
  await patchGeoPreference(userId, { geo_semantic_watches: next });
  return next;
}

// ===== 到场学习判定：dwell 确认后问一次「这是你要守护的地点吗」 =====

/**
 * 返回本次可发问的观察（每条含发问文案与确认所需的 location_id / new_place）。
 * 防骚扰：同一观察 7 天最多问一次；忽略两次自动降权（status=dropped）。
 */
export async function evaluateSemanticWatches({ userId, coords, locations, prefsExtra, dwellingNow }) {
  if (!dwellingNow || !coords) return [];
  const watches = listWatches(prefsExtra).filter((w) => w.status === "watching");
  const locs = withGcj(locations); // 距离判定与上报点同处 GCJ-02 坐标系
  const fires = [];

  for (const watch of watches) {
    if (watch.last_asked_at && Date.now() - new Date(watch.last_asked_at).getTime() < REASK_INTERVAL_MS) continue;
    if ((watch.ignored_count || 0) >= 2) continue;

    const parsed = {
      anchor_type: watch.anchor_type,
      anchor_text: watch.anchor_text,
      category: watch.category,
      poi_text: watch.poi_text
    };
    const anchor = matchAnchor(parsed, locs);

    // 分支 A：停在已存地点上，且该地点与观察匹配（类别/名称 + 锚点 1000m 内）
    const nearSaved = locs.find((l) => {
      if (haversineM(gcjOf(l), coords) > 300) return false;
      if (!categoryMatches(parsed, l)) return false;
      if (anchor && haversineM(gcjOf(l), gcjOf(anchor)) > 1000) return false;
      if (!anchor && watch.relation === "near") return false;
      return true;
    });
    if (nearSaved) {
      fires.push({
        watch,
        location_id: nearSaved.id,
        location_name: nearSaved.name,
        new_place: null,
        message: `检测到你在「${nearSaved.name}」停留——这是「${watch.raw}」要守护的地点吗？`
      });
      continue;
    }

    // 分支 B：锚点圈内停留、且不在任何已存地点 150m 内 → 问是否把这里记为新地点
    if (anchor && haversineM(coords, gcjOf(anchor)) <= 800) {
      const tooClose = locs.some((l) => haversineM(gcjOf(l), coords) <= 150);
      if (!tooClose) {
        fires.push({
          watch,
          location_id: null,
          location_name: watch.poi_text || watch.raw,
          new_place: { latitude: coords.latitude, longitude: coords.longitude, coord_type: "gcj02" },
          message: `检测到你停在${anchor.name}附近——把这里记为「${watch.poi_text || watch.raw}」吗？之后路过会提醒你。`
        });
      }
    }
  }

  // 记录发问时间（同一上报最多发一条，其余等下次）
  const fired = fires.slice(0, 1);
  if (fired.length) {
    await updateWatches(userId, (watches) =>
      watches.map((w) =>
        fired.some((f) => f.watch.id === w.id)
          ? { ...w, asked_count: (w.asked_count || 0) + 1, last_asked_at: new Date().toISOString() }
          : w
      )
    );
  }
  return fired;
}

// ===== 用户动作：确认 / 忽略 / 移除 =====

// 把观察兑现成具体围栏：确认来源（已存地点 / 当场新记）统一落成 place 后写回关联任务
export async function confirmWatch({ userId, watch, place }) {
  const location = {
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    coord_type: place.coord_type || "wgs84",
    radius: place.radius || 200,
    location_id: place.location_id || null
  };
  const reminderPatch = {
    enabled: true,
    latitude: location.latitude,
    longitude: location.longitude,
    coord_type: location.coord_type,
    radius: location.radius,
    location_name: location.name,
    trigger_on: watch.relation === "near" ? "passby" : "enter",
    semantic: { raw: watch.raw, watch_id: watch.id, status: "resolved" }
  };

  // watch.task_ids 里的任务全部写入具体 location_reminder（此后走正常围栏链路）
  const taskIds = watch.task_ids || [];
  for (const taskId of taskIds) {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, metadata: true } });
    if (!task) continue;
    const meta = task.metadata && typeof task.metadata === "object" ? task.metadata : {};
    const extra = meta._extraFields && typeof meta._extraFields === "object" ? meta._extraFields : {};
    await prisma.task.update({
      where: { id: taskId },
      data: { metadata: { ...meta, _extraFields: { ...extra, location_reminder: reminderPatch } } }
    });
  }

  await updateWatches(userId, (watches) =>
    watches.map((w) => (w.id === watch.id ? { ...w, status: "resolved", resolved_location_id: location.location_id } : w))
  );
  return { task_ids_updated: taskIds.length, location };
}

export async function ignoreWatch(userId, watch) {
  const ignored = (watch.ignored_count || 0) + 1;
  await updateWatches(userId, (watches) =>
    watches.map((w) =>
      w.id === watch.id
        ? { ...w, ignored_count: ignored, status: ignored >= 2 ? "dropped" : w.status, dropped_reason: ignored >= 2 ? "ignored_twice" : w.dropped_reason }
        : w
    )
  );
  return { ignored_count: ignored, dropped: ignored >= 2 };
}

export async function removeWatch(userId, watch) {
  await updateWatches(userId, (watches) => watches.map((w) => (w.id === watch.id ? { ...w, status: "dropped", dropped_reason: "removed" } : w)));
}
