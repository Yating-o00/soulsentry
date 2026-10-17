import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 关联规则推荐
 *
 * 基于用户历史完成记录，挖掘两类关联：
 *
 * 1) 任务序贯规则（sequential_rules）：
 *    - 从已完成任务中找出"完成A后通常接着完成B"的共现对
 *    - 以 confidence = P(B|A) 为置信度，support = 共现次数
 *    - 对最近一个完成的任务，推荐其高置信度后继任务的类别/标题建议
 *
 * 2) 地点情境推荐（location_patterns）：
 *    - 传入当前坐标，匹配历史上在同一地点附近完成过的任务
 *    - 统计该地点最常见的 category + 典型 title
 *    - 输出"在此地你通常会做 X"
 */

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const CATEGORY_LABEL = {
  work: '工作', personal: '个人', health: '健康', study: '学习',
  family: '家庭', shopping: '购物', finance: '财务', other: '其他'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let coords = null;
    try {
      const body = await req.json();
      if (body?.latitude && body?.longitude) {
        coords = { latitude: body.latitude, longitude: body.longitude };
      }
    } catch { /* no body */ }

    // 拉取最近 180 条已完成任务（按完成时间降序）
    const completedTasks = await base44.entities.Task.filter({
      created_by: user.email,
      status: 'completed'
    }, '-completed_at', 180);

    const completed = (completedTasks || [])
      .filter((t) => !t.deleted_at && t.completed_at);

    // ========== 1) 序贯规则挖掘 ==========
    // 时间升序：t0 -> t1 -> t2 ...
    const asc = [...completed].sort(
      (a, b) => new Date(a.completed_at) - new Date(b.completed_at)
    );

    // 构建 category 级共现矩阵：A 完成后 24h 内，至少出现一次 B 才记 1 次
    // 这样 support(A→B) ≤ count(A)，confidence 保证 ≤ 1
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const pairCount = new Map();   // "A|B" -> count（每个 A 事件最多+1）
    const aCount = new Map();      // "A" -> count

    for (let i = 0; i < asc.length; i++) {
      const a = asc[i];
      if (!a.category) continue;
      aCount.set(a.category, (aCount.get(a.category) || 0) + 1);
      const aT = new Date(a.completed_at).getTime();

      const seenBForThisA = new Set();
      for (let j = i + 1; j < asc.length; j++) {
        const b = asc[j];
        const bT = new Date(b.completed_at).getTime();
        if (bT - aT > WINDOW_MS) break;
        if (!b.category || b.category === a.category) continue;
        if (seenBForThisA.has(b.category)) continue;
        seenBForThisA.add(b.category);
        const key = `${a.category}|${b.category}`;
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }
    }

    // 汇总规则
    const allRules = [];
    for (const [key, support] of pairCount.entries()) {
      const [a, b] = key.split('|');
      const base = aCount.get(a) || 1;
      const confidence = support / base;
      if (support >= 2 && confidence >= 0.3) {
        allRules.push({
          from: a, to: b, support, confidence,
          from_label: CATEGORY_LABEL[a] || a,
          to_label: CATEGORY_LABEL[b] || b
        });
      }
    }
    allRules.sort((x, y) => (y.confidence - x.confidence) || (y.support - x.support));

    // 为"最近一次完成任务"生成序贯推荐
    let sequentialRecommendation = null;
    const lastDone = asc[asc.length - 1];
    if (lastDone?.category) {
      const candidateRules = allRules
        .filter((r) => r.from === lastDone.category)
        .slice(0, 2);

      if (candidateRules.length > 0) {
        // 找出每条规则 "to" 类别下当前仍 pending 的任务作为具体候选
        const pending = await base44.entities.Task.filter({
          created_by: user.email,
          status: { $in: ['pending', 'in_progress'] }
        }, '-priority', 40);

        const suggestions = candidateRules.map((rule) => {
          const matches = (pending || [])
            .filter((t) => !t.deleted_at && t.category === rule.to)
            .slice(0, 2)
            .map((t) => ({ id: t.id, title: t.title, priority: t.priority }));
          return {
            from_label: rule.from_label,
            to_label: rule.to_label,
            confidence: Math.round(rule.confidence * 100),
            support: rule.support,
            tasks: matches
          };
        }).filter((s) => s.tasks.length > 0);

        if (suggestions.length > 0) {
          sequentialRecommendation = {
            trigger_task: {
              id: lastDone.id,
              title: lastDone.title,
              category_label: CATEGORY_LABEL[lastDone.category] || lastDone.category,
              completed_at: lastDone.completed_at
            },
            suggestions
          };
        }
      }
    }

    // ========== 2) 地点情境推荐 ==========
    let locationPattern = null;

    if (coords) {
      // 查找保存的地点
      const locations = await base44.entities.SavedLocation.filter({
        created_by: user.email,
        is_active: true
      });

      let nearLocation = null;
      let nearDist = null;
      for (const loc of (locations || [])) {
        if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') continue;
        const d = haversine(coords.latitude, coords.longitude, loc.latitude, loc.longitude);
        const threshold = (loc.radius || 200) + 200;
        if (d <= threshold && (!nearLocation || d < nearDist)) {
          nearLocation = loc;
          nearDist = d;
        }
      }

      if (nearLocation) {
        // 历史上，带 location_reminder 且在该地点附近完成过的任务
        const histTasks = completed.filter((t) => {
          const lr = t.location_reminder;
          if (!lr?.enabled) return false;
          if (typeof lr.latitude !== 'number' || typeof lr.longitude !== 'number') return false;
          const d = haversine(
            nearLocation.latitude, nearLocation.longitude,
            lr.latitude, lr.longitude
          );
          return d <= (nearLocation.radius || 300) + 300;
        });

        // 没有带 geo 的历史数据时，降级用 category 匹配（基于地点类型）
        const CATEGORY_MAP = {
          office: 'work', home: 'personal', gym: 'health',
          school: 'study', shopping: 'shopping',
          hospital: 'health', restaurant: 'personal'
        };
        const fallbackCat = CATEGORY_MAP[nearLocation.location_type];
        const sample = histTasks.length > 0
          ? histTasks
          : (fallbackCat ? completed.filter((t) => t.category === fallbackCat) : []);

        if (sample.length >= 2) {
          // 统计 category + title 关键词频次
          const catCount = new Map();
          const titleFreq = new Map();
          for (const t of sample) {
            if (t.category) catCount.set(t.category, (catCount.get(t.category) || 0) + 1);
            if (t.title) titleFreq.set(t.title, (titleFreq.get(t.title) || 0) + 1);
          }
          const topCategories = [...catCount.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([cat, cnt]) => ({
              category: cat,
              label: CATEGORY_LABEL[cat] || cat,
              count: cnt
            }));
          const topTitles = [...titleFreq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([title, cnt]) => ({ title, count: cnt }));

          // 当前该地点可做的 pending 任务
          const pending = await base44.entities.Task.filter({
            created_by: user.email,
            status: { $in: ['pending', 'in_progress'] }
          }, '-priority', 30);

          const topCatSet = new Set(topCategories.map((c) => c.category));
          const suggestedTasks = (pending || [])
            .filter((t) => !t.deleted_at && topCatSet.has(t.category))
            .slice(0, 3)
            .map((t) => ({
              id: t.id,
              title: t.title,
              category_label: CATEGORY_LABEL[t.category] || t.category,
              priority: t.priority
            }));

          locationPattern = {
            location_id: nearLocation.id,
            location_name: nearLocation.name,
            icon: nearLocation.icon || '📍',
            distance: Math.round(nearDist),
            history_sample_size: sample.length,
            top_categories: topCategories,
            top_titles: topTitles,
            suggested_tasks: suggestedTasks
          };
        }
      }
    }

    return Response.json({
      success: true,
      sequential_recommendation: sequentialRecommendation,
      location_pattern: locationPattern,
      rules_count: allRules.length,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('getAssociationRecommendations error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});