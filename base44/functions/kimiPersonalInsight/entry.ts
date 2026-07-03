import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * 个人认知引擎 - 多维数据聚合 + Kimi 分析
 *
 * mode:
 *   - profile        生成结构化认知画像（并持久化到 UserPreference.cognition_profile）
 *   - realtime       基于已存画像+历史数据，针对当前意图给出主动建议
 *   - deferral_guess 任务顺延时，AI 主动猜测原因（反思式反馈）
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || body.scope || 'profile';
    const context = body.context || body.intent || '';
    const scene = body.scene || '';
    const task = body.task || null;

    // ---------- 多维认知数据采集 ----------
    const [dataPoints, deferrals, completions, executions, prefs] = await Promise.all([
      base44.entities.UserDataPoint.list('-occurred_at', 120),
      base44.entities.TaskDeferralLog.list('-created_date', 60),
      base44.entities.TaskCompletion.list('-created_date', 100),
      base44.entities.TaskExecution.list('-created_date', 60),
      base44.entities.UserPreference.list('-updated_date', 1),
    ]);

    const pref = prefs[0] || null;
    const savedProfile = pref?.cognition_profile || null;

    // 顺延原因统计（压力区识别）
    const deferralStats = {};
    for (const d of deferrals) {
      const k = d.reason_category || 'other';
      deferralStats[k] = (deferralStats[k] || 0) + 1;
    }

    // 完成时段分布（Asia/Shanghai，能量模式识别）
    const hourBuckets = {};
    const dayBuckets = {};
    for (const c of completions) {
      const t = c.completed_at || c.created_date;
      if (!t) continue;
      const dt = new Date(t);
      const h = (dt.getUTCHours() + 8) % 24;
      const day = (dt.getUTCDay() + (dt.getUTCHours() + 8 >= 24 ? 1 : 0)) % 7;
      hourBuckets[h] = (hourBuckets[h] || 0) + 1;
      dayBuckets[day] = (dayBuckets[day] || 0) + 1;
    }

    // 自动化评价统计（用户主动纠偏信号）
    const feedbackStats = {};
    for (const ex of executions) {
      const r = ex.user_feedback?.rating;
      if (!r) continue;
      const k = ex.automation_type || 'none';
      if (!feedbackStats[k]) feedbackStats[k] = { good: 0, bad: 0 };
      if (r >= 4) feedbackStats[k].good += 1;
      else feedbackStats[k].bad += 1;
    }

    // 高权重行为数据点（画像校准信号优先）
    const compact = dataPoints
      .sort((a, b) => (b.weight || 1) - (a.weight || 1))
      .slice(0, 80)
      .map((d) => ({
        t: d.data_type,
        k: d.subtype || '',
        s: (d.summary || '').slice(0, 80),
        c: d.category || '',
        w: d.weight || 1,
        h: d.hour_of_day,
        d: d.day_of_week,
      }));

    const recentDeferrals = deferrals.slice(0, 15).map((d) => ({
      title: (d.task_title || '').slice(0, 40),
      reason: d.reason_category,
      note: (d.reason_note || '').slice(0, 60),
      missing: d.missing_prerequisite || '',
      at: d.created_date,
    }));

    const dataDigest = JSON.stringify({
      行为数据点: compact,
      顺延原因统计: deferralStats,
      近期顺延明细: recentDeferrals,
      完成时段分布_小时: hourBuckets,
      完成分布_星期: dayBuckets,
      自动化评价: feedbackStats,
    });

    const apiKey = Deno.env.get('KIMI_API_KEY') || Deno.env.get('MOONSHOT_API_KEY');
    if (!apiKey) return Response.json({ error: 'KIMI_API_KEY missing' }, { status: 500 });

    const callKimi = async (sysPrompt, userPrompt, schema) => {
      const candidateModels = ['kimi-k2-0905-preview', 'kimi-latest', 'moonshot-v1-auto'];
      let resp = null;
      let lastErr = '';
      let lastStatus = 0;
      for (const model of candidateModels) {
        resp = await fetch('https://api.moonshot.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey.trim()}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.4,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: sysPrompt + `\n\n你的回复必须是符合以下 JSON Schema 的数据实例（注意：输出实际数据，绝不要输出 schema 定义本身）：\n${JSON.stringify(schema)}` },
              { role: 'user', content: userPrompt },
            ],
          }),
        });
        if (resp.ok) break;
        lastErr = await resp.text();
        lastStatus = resp.status;
        if (resp.status !== 404 && resp.status !== 403) break;
      }
      if (!resp || !resp.ok) {
        throw new Error(`Kimi ${lastStatus}: ${lastErr.slice(0, 200)}`);
      }
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      try {
        return JSON.parse(content);
      } catch {
        return {};
      }
    };

    // ---------- mode: deferral_guess 反思式反馈 ----------
    if (mode === 'deferral_guess') {
      if (!task) return Response.json({ error: 'task required' }, { status: 400 });
      const schema = {
        type: 'object',
        properties: {
          guessed_reason: {
            type: 'string',
            enum: ['device_not_ready', 'time_conflict', 'energy_low', 'external_blocker', 'forgot', 'other'],
          },
          confidence: { type: 'number' },
          message: { type: 'string' },
        },
        required: ['guessed_reason', 'confidence', 'message'],
      };
      const result = await callKimi(
        `你是用户的私人 AI 哨兵。一个任务没有按时完成，请基于用户的历史顺延模式、能量分布和认知画像，主动猜测最可能的原因。message 用一句共情且具体的中文说明你的推测依据（例如"这个时段你通常精力偏低"），不超过 40 字。confidence 为 0-1。输出示例：{"guessed_reason":"energy_low","confidence":0.7,"message":"下午两点你通常精力偏低，近期 3 次顺延都是这个原因"}`,
        `未按时完成的任务：${JSON.stringify(task)}\n当前认知画像：${JSON.stringify(savedProfile || {})}\n历史数据：${dataDigest}`,
        schema
      );
      return Response.json(result);
    }

    // ---------- mode: realtime 主动性建议 ----------
    if (mode === 'realtime') {
      const schema = {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                reason: { type: 'string' },
              },
            },
          },
        },
        required: ['suggestions'],
      };
      const result = await callKimi(
        `你是用户的私人 AI 策略顾问。基于其认知画像与真实历史数据（完成时段分布、顺延原因），针对用户当前意图给出 1-3 条精准、可执行、敢于挑战用户设定的建议。建议必须落到具体证据上（如"你周三下午的完成率偏低"），避免泛泛而谈。没有把握的建议不要输出，宁缺毋滥。场景：${scene || '通用'}`,
        `当前意图：${context}\n认知画像：${JSON.stringify(savedProfile || {})}\n历史数据：${dataDigest}`,
        schema
      );
      return Response.json({ ...result, data_count: dataPoints.length });
    }

    // ---------- mode: profile 结构化认知画像（默认） ----------
    if (!dataPoints.length && !completions.length && !deferrals.length) {
      return Response.json({
        insights: [],
        persona: '数据积累中，使用越多，画像越准。',
        suggestions: [],
        empty: true,
      });
    }

    const schema = {
      type: 'object',
      properties: {
        persona: { type: 'string', description: '一句话用户画像' },
        energy_pattern: { type: 'string', description: '能量模式总结，如"上午9-11点效率最高，周五下午偏好轻任务"' },
        pressure_zones: { type: 'array', items: { type: 'string' }, description: '压力区/软肋，基于顺延原因统计' },
        principles: { type: 'array', items: { type: 'string' }, description: '推断出的用户核心原则，如"周末不处理工作任务"' },
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              detail: { type: 'string' },
              weight: { type: 'number' },
            },
          },
        },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
      required: ['persona', 'energy_pattern', 'pressure_zones', 'principles', 'insights', 'suggestions'],
    };

    const parsed = await callKimi(
      `你是用户的私人 AI 画像分析师。基于多维历史数据（行为数据点、任务完成时段分布、顺延原因统计、自动化评价），提炼用户的操作习惯、能量模式、压力区和核心原则。所有结论必须有数据支撑，没有足够证据的维度返回空数组或保守表述。用中文。`,
      `历史数据：${dataDigest}`,
      schema
    );

    // 持久化认知画像，供实时建议/顺延猜测/自动化规划复用
    const profileToSave = {
      persona: parsed.persona || '',
      energy_pattern: parsed.energy_pattern || '',
      pressure_zones: parsed.pressure_zones || [],
      principles: parsed.principles || [],
      generated_at: new Date().toISOString(),
    };
    if (pref) {
      await base44.entities.UserPreference.update(pref.id, { cognition_profile: profileToSave });
    } else {
      await base44.entities.UserPreference.create({ cognition_profile: profileToSave });
    }

    return Response.json({ ...parsed, data_count: dataPoints.length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});