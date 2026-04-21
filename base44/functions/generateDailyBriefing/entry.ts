import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const getShanghaiTime = () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
const getShanghaiDate = () => new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

function parseJSON(content) {
  const cleaned = content.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s !== -1 && e > s) return JSON.parse(content.slice(s, e + 1));
  throw new Error('Failed to parse JSON');
}

const PRIORITY_MAP = { urgent: '🔴紧急', high: '🟠高', medium: '🟡中', low: '🟢低' };
const CATEGORY_MAP = { work: '工作', personal: '个人', health: '健康', study: '学习', family: '家庭', shopping: '购物', finance: '财务', other: '其他' };
const STATUS_MAP = { pending: '待办', in_progress: '进行中', completed: '已完成', snoozed: '已推迟', blocked: '受阻' };

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        // Fetch more comprehensive data
        const [activeTasks, recentCompleted, notes, memories] = await Promise.all([
            base44.entities.Task.filter({ status: ['pending', 'in_progress', 'blocked'] }, '-priority', 30),
            base44.entities.Task.filter({ status: 'completed' }, '-completed_at', 5),
            base44.entities.Note.list('-created_date', 5),
            base44.entities.MemoryRecord.list('-created_date', 3).catch(() => []),
        ]);

        // Build detailed task summary with real data
        const todayStr = getShanghaiDate();
        const urgentTasks = activeTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
        const todayTasks = activeTasks.filter(t => {
            if (!t.reminder_time && !t.end_time) return false;
            const d = (t.reminder_time || t.end_time || '').substring(0, 10);
            return d === new Date().toISOString().substring(0, 10);
        });
        const overdueTasks = activeTasks.filter(t => {
            if (!t.end_time) return false;
            return new Date(t.end_time) < new Date() && t.status !== 'completed';
        });
        const blockedTasks = activeTasks.filter(t => t.status === 'blocked');

        const formatTask = (t) => {
            const parts = [`「${t.title}」`];
            parts.push(`优先级:${PRIORITY_MAP[t.priority] || t.priority}`);
            if (t.category) parts.push(`类别:${CATEGORY_MAP[t.category] || t.category}`);
            if (t.status) parts.push(`状态:${STATUS_MAP[t.status] || t.status}`);
            if (t.end_time) parts.push(`截止:${new Date(t.end_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
            if (t.description) parts.push(`描述:${t.description.substring(0, 80)}`);
            if (t.tags && t.tags.length > 0) parts.push(`标签:${t.tags.join(',')}`);
            return parts.join(' | ');
        };

        const taskDataBlock = `
## 用户当前任务数据（请严格基于以下数据生成简报，不要编造任务）

### 统计概览
- 活跃任务总数: ${activeTasks.length}
- 紧急/高优先级任务: ${urgentTasks.length}
- 今日到期任务: ${todayTasks.length}
- 已逾期任务: ${overdueTasks.length}
- 受阻任务: ${blockedTasks.length}
- 近期已完成: ${recentCompleted.length}

### 所有活跃任务详情
${activeTasks.length > 0 ? activeTasks.map((t, i) => `${i + 1}. ${formatTask(t)}`).join('\n') : '（暂无活跃任务）'}

### 今日到期任务
${todayTasks.length > 0 ? todayTasks.map(t => `- ${formatTask(t)}`).join('\n') : '（今日无到期任务）'}

### 已逾期任务
${overdueTasks.length > 0 ? overdueTasks.map(t => `- ${formatTask(t)}`).join('\n') : '（无逾期任务）'}

### 近期已完成
${recentCompleted.length > 0 ? recentCompleted.map(t => `- 「${t.title}」 完成于 ${t.completed_at ? new Date(t.completed_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '最近'}`).join('\n') : '（暂无近期完成）'}

### 最近心签/笔记
${notes.length > 0 ? notes.map(n => `- ${(n.plain_text || n.content || '').substring(0, 120)}`).join('\n') : '（暂无笔记）'}

### 最近记忆
${memories.length > 0 ? memories.map(m => `- [${m.memory_type}] ${m.title}: ${(m.content || '').substring(0, 80)}`).join('\n') : '（暂无记忆）'}
`;

        const systemPrompt = `你是"心栈"(SoulSentry)，一个温暖且专注的个人效率伴侣。

请基于以下用户真实数据生成「每日简报」。

**当前时间**: ${getShanghaiTime()}
**用户姓名**: ${user.full_name || '旅行者'}

${taskDataBlock}

## 生成要求（极其重要）

1. **必须基于真实数据**：简报中提到的每一个任务名称、截止日期、优先级都必须来自上面的数据，禁止编造不存在的任务。
2. **用「」引用任务名称**：提到具体任务时，用「任务名」的格式引用，让用户一眼就能对应到自己的任务。
3. **Short-Term（今日专注）**：
   - 聚焦今天最需要关注的任务（紧急的、今日到期的、已逾期的）
   - 明确指出哪些任务需要优先处理，给出具体的行动建议
   - 如果有逾期任务，温和地提醒
   - 语气温暖鼓励，但内容要具体实用
4. **Long-Term（远见与思考）**：
   - 基于用户的长期任务、笔记和记忆，给出战略性的思考
   - 关注那些不紧急但重要的任务
   - 如果笔记/记忆中有值得关注的长期目标，提及它们
5. **mindful_tip**：一句简短的正念小贴士（15-30字），与用户当前状态相关
6. **title**：格式为「{用户名}的{时段}心栈·{月}月{日}日」，时段根据当前时间选择（早安/午后/晚间）

返回严格JSON格式：
{"title":"string","short_term_narrative":"string","long_term_narrative":"string","mindful_tip":"string"}

语言：简体中文。语气：温暖、平静、有力量感，像一个可靠的朋友在旁边轻声提醒。`;

        const apiKey = Deno.env.get("MOONSHOT_API_KEY");
        if (!apiKey) {
            // Fallback with real data references
            const fallbackShort = activeTasks.length > 0
                ? `你目前有 ${activeTasks.length} 个待处理任务${urgentTasks.length > 0 ? `，其中 ${urgentTasks.length} 个为紧急/高优先级：${urgentTasks.slice(0, 3).map(t => `「${t.title}」`).join('、')}` : ''}。建议从优先级最高的任务开始。`
                : '今天暂时没有待办任务，可以利用空闲时间规划未来。';
            const fallbackLong = recentCompleted.length > 0
                ? `近期你完成了${recentCompleted.map(t => `「${t.title}」`).join('、')}，保持这个节奏！`
                : '花一些时间思考长期目标，让每一天的努力都有方向。';
            return Response.json({
                title: `${user.full_name || '旅行者'}的每日心栈`,
                short_term_narrative: fallbackShort,
                long_term_narrative: fallbackLong,
                mindful_tip: "深呼吸三次，专注于此刻最重要的那一件事。"
            });
        }

        try {
            const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
                body: JSON.stringify({
                    model: "kimi-k2-turbo-preview",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: "请根据我的真实任务数据生成今日简报。记住：只引用数据中真实存在的任务名称。" }
                    ],
                    temperature: 0.6,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error("Kimi API error:", response.status, errText);
                throw new Error(`Kimi error: ${response.status}`);
            }
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            const result = parseJSON(content);
            
            // Attach task stats for frontend reference
            result.task_stats = {
                active: activeTasks.length,
                urgent: urgentTasks.length,
                today_due: todayTasks.length,
                overdue: overdueTasks.length,
                blocked: blockedTasks.length,
                recent_completed: recentCompleted.length
            };
            
            return Response.json(result);
        } catch (e) {
            console.error("Kimi failed:", e);
            // Fallback with real data
            const shortNarrative = activeTasks.length > 0
                ? `你当前有 ${activeTasks.length} 个活跃任务。${urgentTasks.length > 0 ? `重点关注：${urgentTasks.slice(0, 3).map(t => `「${t.title}」`).join('、')}。` : ''}${overdueTasks.length > 0 ? `注意：${overdueTasks.length} 个任务已逾期。` : ''}`
                : '今日暂无待办任务，享受这份宁静。';
            return Response.json({
                title: `${user.full_name || '旅行者'}的每日心栈`,
                short_term_narrative: shortNarrative,
                long_term_narrative: '回顾你的笔记和记忆，找到长期目标的线索。',
                mindful_tip: "此刻最重要的事只有一件，找到它。",
                task_stats: {
                    active: activeTasks.length,
                    urgent: urgentTasks.length,
                    today_due: todayTasks.length,
                    overdue: overdueTasks.length,
                    blocked: blockedTasks.length,
                    recent_completed: recentCompleted.length
                }
            });
        }
    } catch (error) {
        console.error("Function error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});