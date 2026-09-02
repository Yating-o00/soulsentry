import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// 记忆注入：创建约定时把「画像 + 估算校准 + 贴身模板」一次性取回。
// 纯统计 + 关键词匹配，不调用 AI，保证创建面板即时响应。

function tokenize(text) {
  const s = String(text || '').toLowerCase();
  const words = s.match(/[\u4e00-\u9fa5]{2,}|[a-z]{3,}/g) || [];
  return words;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const draft = String(body.draft || '').trim();

    const [prefs, templates, tasks] = await Promise.all([
      base44.entities.UserPreference.list('-updated_date', 1),
      base44.entities.PersonalTemplate.filter({ is_active: true }, '-use_count', 20),
      base44.entities.Task.filter({ status: 'completed' }, '-completed_at', 150),
    ]);

    const profile = prefs[0]?.cognition_profile || null;

    // ---- 估算校准：按分类统计「实际完成时间 vs 计划时间」的平均偏差 ----
    const byCategory = {};
    for (const t of tasks) {
      if (!t.reminder_time || !t.completed_at) continue;
      const planned = new Date(t.reminder_time).getTime();
      const done = new Date(t.completed_at).getTime();
      if (!planned || !done) continue;
      const diffMin = Math.round((done - planned) / 60000);
      if (Math.abs(diffMin) > 60 * 24 * 7) continue; // 排除极端离群值
      const key = t.category || 'other';
      if (!byCategory[key]) byCategory[key] = [];
      byCategory[key].push(diffMin);
    }
    const calibrations = {};
    for (const [key, arr] of Object.entries(byCategory)) {
      if (arr.length < 3) continue;
      const avg = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
      calibrations[key] = { average_offset_minutes: avg, sample_count: arr.length };
    }

    // ---- 贴身模板匹配：关键词命中打分 ----
    const draftTokens = tokenize(draft);
    const scored = (templates || []).map((tpl) => {
      const keys = (tpl.trigger_keywords || []).map((k) => String(k).toLowerCase());
      let score = 0;
      for (const k of keys) {
        if (!k) continue;
        if (draft.toLowerCase().includes(k)) score += 2;
        else if (draftTokens.some((t) => t.includes(k) || k.includes(t))) score += 1;
      }
      return { tpl, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

    const bestTemplate = scored[0]?.tpl || null;

    // ---- 校准提示语：优先用最匹配模板的分类，否则用整体偏差最大的分类 ----
    let calibration = null;
    const cat = bestTemplate?.category;
    if (cat && calibrations[cat]) {
      calibration = { category: cat, ...calibrations[cat] };
    } else {
      const entries = Object.entries(calibrations).sort((a, b) => Math.abs(b[1].average_offset_minutes) - Math.abs(a[1].average_offset_minutes));
      if (entries.length > 0 && Math.abs(entries[0][1].average_offset_minutes) >= 15) {
        calibration = { category: entries[0][0], ...entries[0][1] };
      }
    }

    return Response.json({
      profile: profile ? {
        persona: profile.persona || '',
        energy_pattern: profile.energy_pattern || '',
        pressure_zones: profile.pressure_zones || [],
        principles: profile.principles || [],
      } : null,
      calibration,
      calibrations,
      template: bestTemplate ? {
        id: bestTemplate.id,
        name: bestTemplate.name,
        evidence: bestTemplate.evidence || '',
        sample_count: bestTemplate.sample_count || 0,
        steps: bestTemplate.steps || [],
      } : null,
      template_count: (templates || []).length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});