import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// 流式行动输入：接收碎片化输入，AI 判断是"编织"进已有任务链（关联/追加），还是创建新约定
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { text } = await req.json();
    if (!text || !text.trim()) return Response.json({ error: 'Missing text' }, { status: 400 });

    const apiKey = Deno.env.get('MOONSHOT_API_KEY');
    if (!apiKey) return Response.json({ error: 'MOONSHOT_API_KEY not set' }, { status: 500 });

    // 1. 拉取现有活跃任务作为编织候选（含逾期/推迟）
    const all = await base44.entities.Task.list('-updated_date', 200);
    const now = new Date();
    const active = all.filter((t) =>
      !t.deleted_at && !t.parent_task_id && ['pending', 'snoozed', 'in_progress', 'blocked'].includes(t.status)
    ).slice(0, 60);
    const brief = active.map((t) => ({
      id: t.id, title: t.title, category: t.category, status: t.status,
      overdue: t.reminder_time ? new Date(t.reminder_time) < now : false,
      summary: (t.ai_context_summary || t.description || '').slice(0, 80),
    }));

    // 2. Kimi 增量式语义编织决策
    const nowShanghai = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
    const callKimi = async (messages) => {
      let lastErr = null;
      for (const model of ['kimi-k2-0905-preview', 'kimi-latest', 'moonshot-v1-auto']) {
        const r = await fetch('https://api.moonshot.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.trim()}` },
          body: JSON.stringify({ model, temperature: 0.3, response_format: { type: 'json_object' }, messages }),
        });
        if (r.ok) { const d = await r.json(); return d.choices?.[0]?.message?.content || '{}'; }
        lastErr = `Kimi API error: ${r.status}`;
        if (r.status !== 404 && r.status !== 403) break;
      }
      throw new Error(lastErr || 'Kimi API error');
    };
    const content = await callKimi([
          { role: 'system', content: `你是任务编织引擎。用户随手输入了一段碎片想法。当前时间: ${nowShanghai} (Asia/Shanghai, UTC+8)。请判断这个碎片是否与现有任务列表中的某一条强相关（同一件事的补充信息、进展、新想法、变更）：
- 强相关 → mode="link"，给出 task_id、note（把碎片整理为一句可追溯的补充记录）、updated_summary（合并旧摘要与新信息后的最新上下文摘要，50字内）
- 不相关 → mode="create"，给出 title（精炼动词开头）、description、category（work/personal/health/study/family/shopping/finance/other）、priority（low/medium/high/urgent）、reminder_time（若碎片含时间语义则输出 ISO 8601 带 +08:00 时区，否则 null）
输出 JSON: {"mode": "link"|"create", "task_id": "...", "note": "...", "updated_summary": "...", "title": "...", "description": "...", "category": "...", "priority": "...", "reminder_time": null, "message": "给用户的一句话反馈（说明关联到了哪条约定并更新了什么，或创建了什么）"}` },
          { role: 'user', content: JSON.stringify({ input: text.trim(), existing_tasks: brief }) },
    ]);
    const parsed = JSON.parse(content);

    // 3. 执行编织
    const target = parsed.mode === 'link' ? active.find((t) => t.id === parsed.task_id) : null;
    if (target) {
      const notes = Array.isArray(target.notes) ? target.notes : [];
      await base44.entities.Task.update(target.id, {
        notes: [...notes, { content: `🧵 ${parsed.note || text.trim()}`, created_at: new Date().toISOString() }],
        ...(parsed.updated_summary ? { ai_context_summary: parsed.updated_summary } : {}),
      });
      return Response.json({
        mode: 'linked', task_id: target.id, task_title: target.title,
        message: parsed.message || `已关联到「${target.title}」并更新了上下文`,
      });
    }

    const created = await base44.entities.Task.create({
      title: parsed.title || text.trim().slice(0, 50),
      description: parsed.description || text.trim(),
      category: parsed.category || 'personal',
      priority: parsed.priority || 'medium',
      ...(parsed.reminder_time ? { reminder_time: parsed.reminder_time } : {}),
      status: 'pending',
    });
    return Response.json({
      mode: 'created', task_id: created.id, task_title: created.title,
      message: parsed.message || `已创建新约定「${created.title}」`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});