import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 根据用户已有地点、地点类型、详细地址、历史行为，AI 推荐新建围栏的参数。
 * 如果用户填写了详细地址（address），会优先通过地理编码解析出 latitude/longitude。
 *
 * Input:
 *   - location_type: string
 *   - name?: string
 *   - address?: string       // 详细地址（用于地理编码）
 *   - latitude?: number
 *   - longitude?: number
 *
 * Output:
 *   { radius, quiet_minutes, reasoning, confidence,
 *     latitude?, longitude?, resolved_address?, geocode_source? }
 */

// 使用 OpenStreetMap Nominatim 进行地理编码（免费、无需 key）
async function geocodeAddress(address) {
  if (!address || !address.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(address.trim())}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'SoulSentry-Geofence/1.0',
        'Accept-Language': 'zh-CN,zh,en'
      },
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const hit = arr[0];
    const lat = parseFloat(hit.lat);
    const lon = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      display_name: hit.display_name || ''
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { location_type = 'other', name = '', address = '', latitude, longitude } = await req.json();

    // 0. 如果用户填写了详细地址，先尝试地理编码解析坐标
    let geocoded = null;
    if (address && address.trim()) {
      geocoded = await geocodeAddress(address);
    }
    // 地址解析出的坐标优先；若无，退回前端传来的坐标
    const finalLat = geocoded?.latitude ?? latitude;
    const finalLng = geocoded?.longitude ?? longitude;

    // 1. 拉取用户已有地点（同类型优先）+ 近期行为
    const [allLocations, behaviors] = await Promise.all([
      base44.entities.SavedLocation.list('-created_date', 100).catch(() => []),
      base44.entities.UserBehavior.list('-created_date', 200).catch(() => [])
    ]);

    const sameType = allLocations.filter((l) => l.location_type === location_type);

    // 2. 计算同类型地点的 radius/quiet_minutes 统计
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const sameTypeRadii = sameType.map((l) => l.radius).filter((v) => typeof v === 'number');
    const sameTypeQuiet = sameType.map((l) => l.quiet_minutes).filter((v) => typeof v === 'number');

    // 3. 基于规则的默认值（作为 LLM 参考 & 兜底）
    const DEFAULTS = {
      home:       { radius: 150, quiet_minutes: 60 },
      office:     { radius: 200, quiet_minutes: 45 },
      gym:        { radius: 100, quiet_minutes: 120 },
      school:     { radius: 250, quiet_minutes: 60 },
      shopping:   { radius: 300, quiet_minutes: 90 },
      hospital:   { radius: 200, quiet_minutes: 120 },
      restaurant: { radius: 100, quiet_minutes: 90 },
      other:      { radius: 200, quiet_minutes: 30 }
    };
    const baseline = DEFAULTS[location_type] || DEFAULTS.other;

    const geocodePart = geocoded
      ? {
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          resolved_address: geocoded.display_name,
          geocode_source: 'nominatim'
        }
      : {};

    // 4. 构造给 Kimi 的上下文
    const recentBehaviorSummary = behaviors.slice(0, 50).map((b) => ({
      type: b.event_type,
      hour: b.hour_of_day,
      category: b.category
    }));

    const apiKey = Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY");
    if (!apiKey) {
      // 没配 Kimi 也能返回兜底建议
      return Response.json({
        radius: baseline.radius,
        quiet_minutes: baseline.quiet_minutes,
        reasoning: geocoded
          ? `已根据地址解析出坐标；使用类型"${location_type}"默认参数。`
          : `使用类型"${location_type}"的默认推荐值（未启用 AI）。`,
        confidence: geocoded ? 'medium' : 'low',
        ...geocodePart
      });
    }

    const prompt = `你是地理围栏参数推荐助手。请根据以下信息，为用户新建的地点推荐合理的触发半径（radius，单位米）和静默期（quiet_minutes，单位分钟）。

【目标地点】
- 名称：${name || '（未填写）'}
- 类型：${location_type}
- 详细地址：${address || '（未填写）'}
- 坐标：${finalLat && finalLng ? `${finalLat}, ${finalLng}` : '（未定位）'}
${geocoded ? `- 地址已由 OpenStreetMap 解析为：${geocoded.display_name}` : ''}

【用户已有同类型地点的统计】
- 同类型地点数量：${sameType.length}
- 同类型平均半径：${avg(sameTypeRadii)?.toFixed(0) ?? '无数据'} 米
- 同类型平均静默期：${avg(sameTypeQuiet)?.toFixed(0) ?? '无数据'} 分钟

【所有已保存地点（共 ${allLocations.length} 个）】
${allLocations.slice(0, 15).map((l) => `- ${l.name}（${l.location_type}）半径 ${l.radius}m / 静默 ${l.quiet_minutes}分`).join('\n') || '无'}

【近期行为样本（最近 50 条）】
${recentBehaviorSummary.length ? JSON.stringify(recentBehaviorSummary).slice(0, 1500) : '无'}

【参考默认值】
类型 ${location_type}: 半径 ${baseline.radius}m, 静默 ${baseline.quiet_minutes}分钟

【推荐原则】
1. 家/餐厅/健身房等精确位置：半径 100-200m；
2. 公司/学校/医院等较大场所：半径 200-300m；
3. 商场等大型区域：半径 300-500m；
4. 用户已有同类型地点时，向平均值靠拢；
5. 用户触发/编辑行为频繁（行为样本多）说明对提醒敏感，可适度增大静默期避免打扰；
6. radius 在 50-1000 之间，quiet_minutes 在 10-240 之间。

请输出严格 JSON：
{ "radius": number, "quiet_minutes": number, "reasoning": "简短说明(不超过60字)", "confidence": "low" | "medium" | "high" }`;

    const body = {
      model: "kimi-k2-turbo-preview",
      messages: [
        { role: "system", content: "你是地理围栏参数推荐专家，只输出 JSON。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    };

    const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      return Response.json({
        radius: baseline.radius,
        quiet_minutes: baseline.quiet_minutes,
        reasoning: `AI 暂不可用，使用类型默认值。`,
        confidence: 'low',
        ...geocodePart
      });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    // 5. clamp 到安全范围
    const clamp = (v, min, max, fallback) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, Math.round(n)));
    };

    return Response.json({
      radius: clamp(parsed.radius, 50, 1000, baseline.radius),
      quiet_minutes: clamp(parsed.quiet_minutes, 10, 240, baseline.quiet_minutes),
      reasoning: parsed.reasoning || (geocoded
        ? `已根据地址解析坐标，并基于类型"${location_type}"和${sameType.length}个同类地点推荐。`
        : `基于类型"${location_type}"与${sameType.length}个同类地点推荐。`),
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'medium',
      ...geocodePart
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});