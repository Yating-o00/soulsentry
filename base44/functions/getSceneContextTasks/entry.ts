import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// 场景任务包：根据当前位置匹配 SavedLocation 场景，把该场景下最顺手的待办用 AI 重组为行动卡片
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { latitude, longitude } = await req.json();
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return Response.json({ error: 'Missing latitude/longitude' }, { status: 400 });
    }

    const distMeters = (lat1, lng1, lat2, lng2) => {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    // 1. 找到当前所在的场景（最近且在围栏半径内的 SavedLocation）
    const locations = await base44.entities.SavedLocation.filter({ is_active: true }, '-updated_date', 50);
    let scene = null, sceneDist = Infinity;
    for (const loc of locations) {
      if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') continue;
      const d = distMeters(latitude, longitude, loc.latitude, loc.longitude);
      if (d <= (loc.radius || 200) * 1.5 && d < sceneDist) { scene = loc; sceneDist = d; }
    }
    if (!scene) return Response.json({ scene: null, actions: [] });

    // 2. 收集该场景相关的待办：位置绑定命中 / 类别匹配 / 标签命中场景名
    const typeCategoryMap = {
      office: ['work'], home: ['family', 'personal'], gym: ['health'],
      shopping: ['shopping'], school: ['study'], hospital: ['health'],
    };
    const sceneCategories = typeCategoryMap[scene.location_type] || [];
    const pending = await base44.entities.Task.filter({ status: 'pending' }, '-reminder_time', 100);
    const candidates = pending.filter((t) => {
      if (t.deleted_at || t.parent_task_id) return false;
      const lr = t.location_reminder;
      if (lr?.enabled && typeof lr.latitude === 'number' &&
          distMeters(scene.latitude, scene.longitude, lr.latitude, lr.longitude) <= 1000) return true;
      if (sceneCategories.includes(t.category)) return true;
      if (Array.isArray(t.tags) && t.tags.some((tag) => tag && scene.name.includes(tag))) return true;
      return false;
    }).slice(0, 20);

    if (candidates.length === 0) return Response.json({ scene: { name: scene.name, type: scene.location_type }, actions: [] });

    // 3. Kimi 重组：按当前场景最顺手的顺序排列，并给出即刻可执行的第一步
    const apiKey = Deno.env.get('MOONSHOT_API_KEY');
    if (!apiKey) return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });

    const taskBrief = candidates.map((t) => ({
      id: t.id, title: t.title, priority: t.priority,
      reminder_time: t.reminder_time || null,
      overdue: t.reminder_time ? new Date(t.reminder_time) < new Date() : false,
      description: (t.description || '').slice(0, 100),
    }));

    const callKimi = async (messages) => {
      let lastErr = null;
      for (const model of ['kimi-k2-0905-preview', 'kimi-latest', 'moonshot-v1-auto']) {
        const r = await fetch('https://api.moonshot.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.trim()}` },
          body: JSON.stringify({ model, temperature: 0.5, response_format: { type: 'json_object' }, messages }),
        });
        if (r.ok) { const d = await r.json(); return d.choices?.[0]?.message?.content || '{}'; }
        lastErr = `Kimi API error: ${r.status}`;
        if (r.status !== 404 && r.status !== 403) break;
      }
      throw new Error(lastErr || 'Kimi API error');
    };

    const content = await callKimi([
      { role: 'system', content: `你是场景化行动编排助手。用户刚到达「${scene.name}」（类型: ${scene.location_type}），当前时间 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}。请从候选任务中挑选并排序当前场景下最顺手执行的任务（最多5个），每个给出一句"即刻第一步"行动建议和预估分钟数。输出 JSON: {"headline": "一句话开场（如: 到公司了，这30分钟最适合先处理这3件事）", "actions": [{"task_id": "...", "title": "...", "first_step": "即刻第一步建议", "minutes": 15}]}` },
      { role: 'user', content: JSON.stringify(taskBrief) },
    ]);
    let parsed = { headline: '', actions: [] };
    try { parsed = JSON.parse(content); } catch (_) { /* fallback below */ }

    const validIds = new Set(candidates.map((t) => t.id));
    const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
      .filter((a) => validIds.has(a.task_id)).slice(0, 5);

    return Response.json({
      scene: { name: scene.name, type: scene.location_type, icon: scene.icon || '📍' },
      headline: parsed.headline || `到达「${scene.name}」，有 ${candidates.length} 件相关事项`,
      actions: actions.length > 0 ? actions : taskBrief.slice(0, 3).map((t) => ({
        task_id: t.id, title: t.title, first_step: '打开看看，从最小一步开始', minutes: 15,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});