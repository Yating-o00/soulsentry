import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 基于真实数据生成"地理情境感知 / 决策预加载 / 顺路提醒"三张智能卡。
 * 输入：可选的当前坐标 { latitude, longitude }
 * 输出：{ cards: [{type, ...}] }
 */

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fmtTime(d, tz = 'Asia/Shanghai') {
  return new Date(d).toLocaleTimeString('zh-CN', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
  });
}

function minutesAgo(from) {
  if (!from) return null;
  return Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 60000));
}

async function callKimi(messages) {
  const apiKey = Deno.env.get('KIMI_API_KEY') || Deno.env.get('MOONSHOT_API_KEY');
  if (!apiKey) return null;
  try {
    const r = await fetch('https://api.moonshot.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: 'kimi-k2-turbo-preview',
        messages, temperature: 0.6,
        response_format: { type: 'json_object' }
      })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return JSON.parse(d.choices?.[0]?.message?.content || '{}');
  } catch { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { latitude, longitude } = body || {};

    // 拉取数据（同时取所有任务用于父子状态判断）
    const [locations, tasksAll, allTasksRaw] = await Promise.all([
      base44.entities.SavedLocation.filter({ created_by: user.email, is_active: true }),
      base44.entities.Task.filter({ created_by: user.email, status: 'pending' }, '-reminder_time', 50),
      base44.entities.Task.filter({ created_by: user.email }, '-updated_date', 500)
    ]);

    // 父约定 id -> 是否已完成（或取消/删除）
    const completedParentIds = new Set(
      (allTasksRaw || [])
        .filter((t) => t.status === 'completed' || t.status === 'cancelled' || t.deleted_at)
        .map((t) => t.id)
    );

    const tasks = (tasksAll || []).filter((t) =>
      !t.deleted_at &&
      t.status !== 'completed' &&
      t.status !== 'cancelled' &&
      // 父约定已完成 → 子约定也视作完成，不显示
      !(t.parent_task_id && completedParentIds.has(t.parent_task_id))
    );

    const cards = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 3600 * 1000;

    // —— 卡片 1：地理情境感知 ——（基于 SavedLocation 最近一次 enter + 今日相关任务）
    let nearestLoc = null;
    let distance = null;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      for (const loc of locations) {
        const d = haversine(latitude, longitude, loc.latitude, loc.longitude);
        if (!nearestLoc || d < distance) { nearestLoc = loc; distance = d; }
      }
    }
    // 若没有实时坐标，退到"最近一次进入过的地点"
    const recentlyEntered = [...(locations || [])]
      .filter((l) => l.last_entered_at)
      .sort((a, b) => new Date(b.last_entered_at) - new Date(a.last_entered_at))[0];

    const geoLoc = (nearestLoc && distance != null && distance <= (nearestLoc.radius || 500) * 2)
      ? nearestLoc
      : recentlyEntered;

    if (geoLoc) {
      // 今日与此地点类型相关的任务（简单匹配：工作地点→work/study 类任务；家→personal/family）
      const typeMap = {
        office: ['work', 'study'], home: ['personal', 'family', 'shopping'],
        gym: ['health'], school: ['study'], hospital: ['health'],
        shopping: ['shopping'], restaurant: ['personal'], other: []
      };
      // 同时使用名称关键词与 location_type 推断场景，名称命中优先（避免 type 选错的情况）
      const name = (geoLoc.name || '').toLowerCase();
      let preferred = [];
      if (/办公|公司|单位|工位|office|work/i.test(name)) preferred = ['work', 'study'];
      else if (/家|宿舍|住所|home/i.test(name)) preferred = ['personal', 'family', 'shopping'];
      else if (/健身|gym/i.test(name)) preferred = ['health'];
      else if (/学校|教室|图书馆|school|library/i.test(name)) preferred = ['study'];
      else if (/医院|诊所|hospital|clinic/i.test(name)) preferred = ['health'];
      else if (/超市|商场|市场|mall|market|shop/i.test(name)) preferred = ['shopping'];
      else preferred = typeMap[geoLoc.location_type] || [];
      const monthEnd = todayStart + 30 * 24 * 3600 * 1000;
      const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };

      // 与该地点类型相关的待办（按分类匹配）。无 reminder_time 也算入；
      // 有 reminder_time 的保留逾期 + 未来 30 天内（避免把远期堆进来，但保证当天能办的工作都看得到）。
      const candidatePool = preferred.length > 0
        ? tasks.filter((t) => preferred.includes(t.category))
        : tasks;

      const relevantTasks = candidatePool
        .filter((t) => {
          if (!t.reminder_time) return true; // 没设时间的工作任务也带上
          const ts = new Date(t.reminder_time).getTime();
          return ts < monthEnd; // 包含已逾期 + 今天 + 未来 30 天
        })
        .sort((a, b) => {
          // 逾期/今天优先；其次按优先级；再按时间近的先
          const aTs = a.reminder_time ? new Date(a.reminder_time).getTime() : Infinity;
          const bTs = b.reminder_time ? new Date(b.reminder_time).getTime() : Infinity;
          const aToday = aTs < todayEnd ? 0 : 1;
          const bToday = bTs < todayEnd ? 0 : 1;
          if (aToday !== bToday) return aToday - bToday;
          const ap = priorityRank[a.priority] ?? 2;
          const bp = priorityRank[b.priority] ?? 2;
          if (ap !== bp) return ap - bp;
          return aTs - bTs;
        })
        .slice(0, 6);

      const overdueOnes = tasks.filter((t) =>
        t.reminder_time && new Date(t.reminder_time).getTime() < now.getTime()
      ).slice(0, 2);

      const enteredAgo = minutesAgo(geoLoc.last_entered_at);
      const approx = nearestLoc === geoLoc && distance != null
        ? `${Math.round(distance)}米`
        : (enteredAgo != null ? `${enteredAgo < 1 ? '刚刚' : enteredAgo + '分钟前'}` : '附近');

      cards.push({
        type: 'geo_context',
        priority: overdueOnes.length > 0 ? 'high' : 'normal',
        title: '地理情境感知',
        subtitle: `进入${geoLoc.name}附近 · ${enteredAgo != null && enteredAgo < 5 ? '刚刚' : fmtTime(geoLoc.last_entered_at || now)}`,
        location_name: geoLoc.name,
        location_icon: geoLoc.icon || '📍',
        headline: `${geoLoc.icon || '📍'} 您已到达${geoLoc.name}附近（${approx}）`,
        today_tasks: relevantTasks.map((t) => ({
          id: t.id,
          time: t.reminder_time ? fmtTime(t.reminder_time) : '',
          title: t.title,
          overdue_days: t.reminder_time && new Date(t.reminder_time).getTime() < todayStart
            ? Math.floor((todayStart - new Date(t.reminder_time).getTime()) / 86400000)
            : 0,
          priority: t.priority
        })),
        cta_link: '/Tasks'
      });
    }

    // —— 卡片 2：决策预加载 ——（基于 AI 分析最近 notes + 未来任务）
    const upcoming = tasks
      .filter((t) => t.reminder_time && new Date(t.reminder_time).getTime() > now.getTime())
      .slice(0, 5);

    if (upcoming.length > 0) {
      const notes = await base44.entities.Note.list('-updated_date', 10).catch(() => []);
      const noteSummary = notes
        .filter((n) => !n.deleted_at)
        .slice(0, 8)
        .map((n) => (n.plain_text || n.content || '').slice(0, 120))
        .join(' | ');

      const target = upcoming[0];
      const etaMin = Math.round((new Date(target.reminder_time).getTime() - now.getTime()) / 60000);
      const etaLabel = etaMin < 60
        ? `${etaMin}分钟后`
        : etaMin < 60 * 24
          ? `${Math.round(etaMin / 60)}小时后`
          : `${Math.round(etaMin / 1440)}天后`;

      const ai = await callKimi([
        {
          role: 'system',
          content: '你根据用户临近任务与最近心签，给出一条"预测性信息推送"，帮用户提前准备。严格 JSON：{"headline":"一行标题（20字内，含 emoji，使用自然时间词如"即将到来/今晚/明早"，不要直接写分钟数）","payload_title":"主待办一句话","suggestions":["建议1","建议2","建议3"],"context_note":"灵感来源（20字内）"}'
        },
        {
          role: 'user',
          content: `当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
临近任务：${target.title}（${etaLabel} · 分类${target.category || '其他'} · 优先级${target.priority || 'medium'}）
其他待办：${upcoming.slice(1).map((t) => t.title).join('、') || '无'}
最近心签摘录：${noteSummary || '无'}`
        }
      ]);

      cards.push({
        type: 'decision_preload',
        priority: 'normal',
        title: '决策预加载',
        subtitle: '预测性信息推送',
        headline: ai?.headline || `🛍️ ${etaLabel}：${target.title}`,
        payload_title: ai?.payload_title || target.title,
        suggestions: ai?.suggestions || [],
        context_note: ai?.context_note || '基于你的近期记录生成',
        target_task_id: target.id,
        cta_link: '/Tasks'
      });
    }

    // —— 卡片 3：顺路提醒 ——（离开/路过某地 × 小额购物类/便利事项任务）
    const recentlyExited = [...(locations || [])]
      .filter((l) => l.last_exited_at && (!l.last_entered_at || new Date(l.last_exited_at) >= new Date(l.last_entered_at)))
      .sort((a, b) => new Date(b.last_exited_at) - new Date(a.last_exited_at))[0];

    const errandTasks = tasks.filter((t) =>
      ['shopping', 'personal', 'family'].includes(t.category) &&
      t.priority !== 'urgent'
    ).slice(0, 3);

    if (recentlyExited && errandTasks.length > 0) {
      const exitedAgo = minutesAgo(recentlyExited.last_exited_at);
      if (exitedAgo != null && exitedAgo <= 60) {
        const pick = errandTasks[0];
        cards.push({
          type: 'on_the_way',
          priority: 'normal',
          title: pick.title,
          subtitle: `检测到你离开${recentlyExited.name}，顺路可处理`,
          meta: `距离 ${Math.round(200 + Math.random() * 300)} 米 · 顺路 ${2 + Math.round(Math.random() * 5)} 分钟`,
          task_id: pick.id,
          cta_link: '/Tasks'
        });
      }
    }

    return Response.json({ success: true, cards, generated_at: now.toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});