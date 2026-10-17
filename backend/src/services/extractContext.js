/**
 * 时空上下文提取服务
 * 从用户自然语言输入中提取：时间、地点、事件类型。
 * 当缺少时间/地点时，使用当前输入时刻和当前位置作为兜底。
 */

const LOCATION_KEYWORDS = [
  { keys: ["公司", "办公室", "单位", "工位", "写字楼", "园区"], type: "office", name: "公司" },
  { keys: ["家", "家里", "家中", "住宅", "小区"], type: "home", name: "家" },
  { keys: ["医院", "诊所", "牙科", "口腔", "眼科", "复诊", "就医"], type: "hospital", name: "医院" },
  { keys: ["学校", "教室", "图书馆", "实验室", "课堂", "上课"], type: "school", name: "学校" },
  { keys: ["健身房", "瑜伽馆", "游泳馆", "球场", "跑道"], type: "gym", name: "健身房" },
  { keys: ["超市", "菜市场", "商场", "便利店", "购物", "买菜", "买牛奶"], type: "shopping", name: "购物场所" },
  { keys: ["餐厅", "饭店", "食堂", "咖啡馆", "奶茶店", "聚餐", "约会"], type: "restaurant", name: "餐厅" },
  { keys: ["机场", "火车站", "地铁站", "公交站", "打车", "开车", "航班", "飞机"], type: "transit", name: "交通枢纽" }
];

const EVENT_TYPE_KEYWORDS = [
  { keys: ["开会", "会议", "zoom", "对齐", "评审", "汇报", "立项", "过会"], type: "会议" },
  { keys: ["早餐", "午餐", "晚餐", "中饭", "晚饭", "吃饭", "用餐", "聚餐", "请客"], type: "用餐" },
  { keys: ["医院", "看病", "就医", "复诊", "牙科", "拔牙", "吃药", "服药", "维生素", "胶囊"], type: "就医" },
  { keys: ["航班", "飞机", "登机", "赶飞机", "高铁", "火车", "打车", "开车", "出门", "出行"], type: "出行" },
  { keys: ["买菜", "超市", "购物", "快递", "取快递", "拿快递", "缴费", "交费", "还款"], type: "生活" },
  { keys: ["工作", "方案", "文档", "ppt", "报告", "邮件", "code", "写代码"], type: "工作" },
  { keys: ["学习", "看书", "阅读", "复习", "考试", "备考", "课程"], type: "学习" },
  { keys: ["锻炼", "健身", "跑步", "瑜伽", "运动", "游泳"], type: "运动" },
  { keys: ["约会", "聚餐", "见面", "请客", "吃饭", "看电影"], type: "社交" }
];

function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2
    + Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude));
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * 从文本中提取地点信息
 * @param {string} text
 * @param {Array} savedLocations - 用户的 SavedLocation 列表
 * @returns {{ name: string|null, location_type: string|null, matched_saved_location_id: string|null }}
 */
export function extractLocation(text, savedLocations = []) {
  const t = String(text || "");
  if (!t) return { name: null, location_type: null, matched_saved_location_id: null };

  // 1. 关键词匹配
  for (const rule of LOCATION_KEYWORDS) {
    if (rule.keys.some((k) => t.includes(k))) {
      // 2. 若有关键词，再尝试在已保存地点中找同类型/同名最近地点
      let best = null;
      let bestScore = 0;
      for (const loc of savedLocations) {
        if (!loc || typeof loc !== "object") continue;
        let score = 0;
        if (loc.locationType === rule.type) score += 2;
        if (loc.name && t.includes(loc.name)) score += 3;
        if (score > bestScore) {
          bestScore = score;
          best = loc;
        }
      }
      return {
        name: best?.name || rule.name,
        location_type: rule.type,
        matched_saved_location_id: best?.id || null
      };
    }
  }

  // 3. 无关键词时，尝试直接匹配已保存地点名称
  for (const loc of savedLocations) {
    if (loc?.name && t.includes(loc.name)) {
      return {
        name: loc.name,
        location_type: loc.locationType || "other",
        matched_saved_location_id: loc.id || null
      };
    }
  }

  return { name: null, location_type: null, matched_saved_location_id: null };
}

/**
 * 从文本中提取事件类型
 * @param {string} text
 * @returns {string|null}
 */
export function extractEventType(text) {
  const t = String(text || "");
  for (const rule of EVENT_TYPE_KEYWORDS) {
    if (rule.keys.some((k) => t.includes(k))) {
      return rule.type;
    }
  }
  return null;
}

/**
 * 根据当前坐标匹配最近的已保存地点
 * @param {{latitude:number, longitude:number}} coords
 * @param {Array} savedLocations
 * @returns {object|null}
 */
export function matchNearestSavedLocation(coords, savedLocations = []) {
  if (!coords || typeof coords.latitude !== "number" || typeof coords.longitude !== "number") return null;
  let best = null;
  let bestDist = Infinity;
  for (const loc of savedLocations) {
    if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number") continue;
    const dist = haversineMeters(coords, { latitude: loc.latitude, longitude: loc.longitude });
    const radius = loc.radius || 200;
    if (dist <= radius && dist < bestDist) {
      best = loc;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * 综合解析时空上下文
 * @param {Object} params
 * @param {string} params.text - 用户输入
 * @param {Array} params.savedLocations - 已保存地点
 * @param {{latitude:number, longitude:number}} params.currentCoords - 当前坐标（可选）
 * @param {Date} params.currentTime - 当前时间（可选，默认 new Date()）
 * @returns {{
 *   location: {name, location_type, matched_saved_location_id},
 *   event_type: string|null,
 *   context_at_creation: object
 * }}
 */
export function resolveSpatiotemporalContext({
  text,
  savedLocations = [],
  currentCoords = null,
  currentTime = new Date()
}) {
  const location = extractLocation(text, savedLocations);
  const eventType = extractEventType(text);

  const contextAtCreation = {
    created_at: currentTime.toISOString(),
    input: text.slice(0, 500)
  };

  if (currentCoords) {
    contextAtCreation.coords = {
      latitude: currentCoords.latitude,
      longitude: currentCoords.longitude
    };
    const nearest = matchNearestSavedLocation(currentCoords, savedLocations);
    if (nearest) {
      contextAtCreation.nearest_location = {
        id: nearest.id,
        name: nearest.name,
        location_type: nearest.locationType,
        distance_meters: Math.round(haversineMeters(currentCoords, {
          latitude: nearest.latitude,
          longitude: nearest.longitude
        }))
      };
    }
  }

  // 如果文本没有提取出地点，但当前坐标能匹配到已保存地点，用当前位置兜底
  const fallbackLocation = !location.location_type && contextAtCreation.nearest_location
    ? {
        name: contextAtCreation.nearest_location.name,
        location_type: contextAtCreation.nearest_location.location_type,
        matched_saved_location_id: contextAtCreation.nearest_location.id
      }
    : location;

  return {
    location: fallbackLocation,
    event_type: eventType,
    context_at_creation: contextAtCreation
  };
}
