// 由 Task 实体自动化（create/update）触发：
// 根据 Task.reminder_time 与 advance_reminders，在云端创建/更新一次性定时自动化。
// 旧的调度会在更新/删除时先被清理，保证不会重复或错时发送。
//
// Base44 内部通过 HTTP API 管理 automations（ListAutomations / CreateAutomation / DeleteAutomation）。
// 这里用 base44.asServiceRole 间接管理：通过我们自定义的命名约定 tag 出每个 task 的调度。

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NAME_PREFIX = 'TaskReminder__';

function buildAutomationName(taskId, suffix) {
  return `${NAME_PREFIX}${taskId}__${suffix}`;
}

// 把 ISO 字符串规整成 "YYYY-MM-DDTHH:mm" 格式（自动化 one_time_date 需要这个格式）
function toOneTimeDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // 保留到分钟
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  return `${y}-${m}-${day}T${h}:${min}:00Z`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));

    // 实体自动化 payload：{ event: { type, entity_name, entity_id }, data, old_data }
    const event = payload.event || {};
    const eventType = event.type; // create / update / delete
    const taskId = event.entity_id || payload.taskId;
    let task = payload.data;

    if (!taskId) {
      return Response.json({ error: 'taskId missing' }, { status: 400 });
    }

    // 处理 payload 过大的情况：主动拉取
    if (!task || payload.payload_too_large) {
      try {
        task = await base44.asServiceRole.entities.Task.get(taskId);
      } catch (_) {
        task = null;
      }
    }

    // --- 通过内部 HTTP API 管理 automations ---
    // Base44 平台暴露的 automations REST 端点（与 create_automation 工具同源）
    const apiBase = Deno.env.get('BASE44_API_URL') || 'https://app.base44.com/api';
    const appId = Deno.env.get('BASE44_APP_ID');
    const serviceToken = Deno.env.get('BASE44_SERVICE_ROLE_KEY') || Deno.env.get('BASE44_SERVICE_TOKEN');

    const authHeaders = {
      'Content-Type': 'application/json',
      ...(serviceToken ? { 'api_key': serviceToken } : {}),
      ...(appId ? { 'x-base44-app-id': appId } : {}),
    };

    // 列出现有该 task 的所有 automations（名字以 NAME_PREFIX + taskId 打头）
    const listUrl = `${apiBase}/apps/${appId}/automations`;
    let existing = [];
    try {
      const listRes = await fetch(listUrl, { headers: authHeaders });
      if (listRes.ok) {
        const listJson = await listRes.json();
        const all = listJson.automations || listJson.data || listJson || [];
        existing = all.filter((a) => (a.name || '').startsWith(buildAutomationName(taskId, '')));
      }
    } catch (e) {
      console.warn('list automations failed:', e.message);
    }

    // 删除旧的调度（无论是 update 还是 delete，都先清理）
    for (const a of existing) {
      try {
        await fetch(`${apiBase}/apps/${appId}/automations/${a.id}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
      } catch (e) {
        console.warn(`delete automation ${a.id} failed:`, e.message);
      }
    }

    // 如果是删除事件 / 任务已完成 / 没有提醒时间 -> 清理完就返回
    if (
      eventType === 'delete' ||
      !task ||
      task.deleted_at ||
      ['completed', 'cancelled'].includes(task.status) ||
      !task.reminder_time
    ) {
      return Response.json({ ok: true, cleared: existing.length });
    }

    // 不为已是过去时间的任务建调度
    const mainTime = new Date(task.reminder_time);
    const now = new Date();
    const createdAutomations = [];

    // 主提醒
    if (mainTime.getTime() > now.getTime() + 60 * 1000) {
      const oneTime = toOneTimeDate(mainTime.toISOString());
      const createRes = await fetch(listUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: buildAutomationName(taskId, 'main'),
          automation_type: 'scheduled',
          schedule_mode: 'one-time',
          one_time_date: oneTime,
          function_name: 'sendActualNotification',
          function_args: {
            taskId,
            userEmail: task.created_by,
            isAdvance: false,
          },
          is_active: true,
        }),
      });
      if (createRes.ok) {
        const j = await createRes.json().catch(() => ({}));
        createdAutomations.push({ type: 'main', id: j.id, at: oneTime });
      } else {
        const err = await createRes.text();
        console.warn('create main automation failed:', err);
      }
    }

    // 提前提醒
    const advances = Array.isArray(task.advance_reminders) ? task.advance_reminders : [];
    for (const minutes of advances) {
      if (typeof minutes !== 'number' || minutes <= 0) continue;
      const advTime = new Date(mainTime.getTime() - minutes * 60 * 1000);
      if (advTime.getTime() <= now.getTime() + 60 * 1000) continue;
      const oneTime = toOneTimeDate(advTime.toISOString());
      const createRes = await fetch(listUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: buildAutomationName(taskId, `adv_${minutes}`),
          automation_type: 'scheduled',
          schedule_mode: 'one-time',
          one_time_date: oneTime,
          function_name: 'sendActualNotification',
          function_args: {
            taskId,
            userEmail: task.created_by,
            isAdvance: true,
            advanceMinutes: minutes,
          },
          is_active: true,
        }),
      });
      if (createRes.ok) {
        const j = await createRes.json().catch(() => ({}));
        createdAutomations.push({ type: 'advance', minutes, id: j.id, at: oneTime });
      }
    }

    return Response.json({
      ok: true,
      taskId,
      cleared: existing.length,
      created: createdAutomations,
    });
  } catch (error) {
    console.error('handleTaskNotificationScheduling error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});