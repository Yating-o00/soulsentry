import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// 用 Kimi 从待办标题/描述中提取"需要顺路办的事"（如：买花、买油、取快递）
async function extractErrandsWithKimi(tasks) {
  const apiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
  if (!apiKey || !tasks.length) return [];

  const taskList = tasks.map((t, i) => `${i + 1}. ${t.title}${t.description ? ' - ' + t.description.slice(0, 50) : ''}`).join('\n');

  const prompt = `从以下待办中找出可以"顺路完成的购物/取件/办事"，提取关键词。
待办：
${taskList}

严格按 JSON 返回：{"errands":[{"task_index":1,"keyword":"花店","query":"florist","action":"买一束花回家"}]}
说明：
- task_index 从1开始，仅返回真正涉及外出办事的任务（购物/取件/取车/加油/取药等）
- query 用于地图搜索的英文/拼音关键词（如 florist, supermarket, gas station, pharmacy, convenience store）
- action 是给用户的简短行动提示（10字内）
- 不涉及外出办事的任务（如开会、写代码）请忽略`;

  try {
    const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: "kimi-k2-turbo-preview",
        messages: [
          { role: "system", content: "你是用户的贴心生活助手，擅长把待办事项映射到顺路可执行的地点。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return parsed.errands || [];
  } catch {
    return [];
  }
}

// 用 OpenStreetMap Overpass API 搜索附近的商家
async function findNearbyPlaces(lat, lon, query, radiusM = 800) {
  // 关键词到 OSM amenity/shop 标签的映射
  const tagMap = {
    'florist': 'shop=florist',
    'supermarket': 'shop=supermarket',
    'convenience': 'shop=convenience',
    'convenience store': 'shop=convenience',
    'gas station': 'amenity=fuel',
    'fuel': 'amenity=fuel',
    'pharmacy': 'amenity=pharmacy',
    'bakery': 'shop=bakery',
    'atm': 'amenity=atm',
    'restaurant': 'amenity=restaurant',
    'cafe': 'amenity=cafe',
    'post': 'amenity=post_office',
    'parcel_locker': 'amenity=parcel_locker',
  };

  const key = (query || '').toLowerCase().trim();
  const tag = tagMap[key] || `shop=${key}`;
  const [k, v] = tag.split('=');

  const overpassQuery = `[out:json][timeout:8];(node[${k}="${v}"](around:${radiusM},${lat},${lon});way[${k}="${v}"](around:${radiusM},${lat},${lon}););out center 5;`;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.elements || []).slice(0, 5).map((el) => {
      const plat = el.lat || el.center?.lat;
      const plon = el.lon || el.center?.lon;
      const distance = haversine(lat, lon, plat, plon);
      return {
        name: el.tags?.name || el.tags?.['name:zh'] || '附近的店',
        latitude: plat,
        longitude: plon,
        distance: Math.round(distance),
        walking_minutes: Math.max(1, Math.round(distance / 80)),
      };
    }).sort((a, b) => a.distance - b.distance);
  } catch {
    return [];
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { latitude, longitude } = await req.json();
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    // 拉取待处理任务
    const allTasks = await base44.entities.Task.filter({
      created_by: user.email,
      status: 'pending'
    }, '-reminder_time', 30);
    const activeTasks = allTasks.filter((t) => !t.deleted_at).slice(0, 15);

    if (activeTasks.length === 0) {
      return Response.json({ success: true, matches: [] });
    }

    // Kimi 提取"顺路办事"
    const errands = await extractErrandsWithKimi(activeTasks);
    if (!errands.length) return Response.json({ success: true, matches: [] });

    // 对每个 errand 搜索附近地点
    const matches = [];
    for (const errand of errands.slice(0, 3)) {
      const task = activeTasks[errand.task_index - 1];
      if (!task) continue;
      const places = await findNearbyPlaces(latitude, longitude, errand.query, 800);
      if (!places.length) continue;
      const nearest = places[0];
      matches.push({
        task_id: task.id,
        task_title: task.title,
        action: errand.action || task.title,
        place_name: nearest.name,
        place_keyword: errand.keyword,
        distance_m: nearest.distance,
        walking_minutes: nearest.walking_minutes,
        latitude: nearest.latitude,
        longitude: nearest.longitude,
        title: errand.action || task.title,
        subtitle: `附近 ${nearest.name}，顺路就能办`,
      });
    }

    return Response.json({ success: true, matches });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});