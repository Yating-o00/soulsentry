import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FIELD_LABELS = {
  title: '标题',
  description: '描述',
  status: '状态',
  priority: '优先级',
  category: '类别',
  reminder_time: '提醒时间',
  end_time: '结束时间',
  repeat_rule: '重复规则',
  progress: '进度',
  tags: '标签',
  is_all_day: '全天任务',
  notification_sound: '提醒音效',
  persistent_reminder: '持续提醒',
  advance_reminders: '提前提醒',
  dependencies: '依赖',
  assigned_to: '分配',
  team_visibility: '可见性',
};

const STATUS_LABELS = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  snoozed: '已推迟',
  blocked: '已阻塞',
};

const PRIORITY_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
};

const CATEGORY_LABELS = {
  work: '工作',
  personal: '个人',
  health: '健康',
  study: '学习',
  family: '家庭',
  shopping: '购物',
  finance: '财务',
  other: '其他',
};

function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return '(空)';
  if (field === 'status') return STATUS_LABELS[value] || value;
  if (field === 'priority') return PRIORITY_LABELS[value] || value;
  if (field === 'category') return CATEGORY_LABELS[value] || value;
  if (field === 'reminder_time' || field === 'end_time') {
    try { return new Date(value).toLocaleString('zh-CN'); } catch { return String(value); }
  }
  if (field === 'progress') return `${value}%`;
  if (field === 'is_all_day' || field === 'persistent_reminder') return value ? '是' : '否';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '(空)';
  return String(value);
}

// Fields we care about tracking
const TRACKED_FIELDS = Object.keys(FIELD_LABELS);

// Fields to skip (internal/system fields)
const SKIP_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'deleted_at',
  'ai_analysis', 'optimal_reminder_time', 'reminder_sent', 'snooze_until', 'snooze_count',
  'google_calendar_event_id', 'gcal_sync_enabled', 'completed_at', 'reminder_strategy',
  'custom_recurrence', 'email_reminder', 'location_reminder', 'notification_channels',
  'notification_interval', 'attachments', 'notes', 'parent_task_id', 'is_shared'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { event, data, old_data } = body;
    
    if (!event || !data) {
      return Response.json({ ok: true, skipped: 'no event data' });
    }

    const taskId = event.entity_id;
    const eventType = event.type; // create, update, delete
    const isSubtask = !!data.parent_task_id;

    // For create events
    if (eventType === 'create') {
      const changeType = isSubtask ? 'subtask_created' : 'created';
      const parentId = isSubtask ? data.parent_task_id : null;
      const logTaskId = isSubtask ? data.parent_task_id : taskId;

      await base44.asServiceRole.entities.TaskChangeLog.create({
        task_id: logTaskId,
        parent_task_id: parentId,
        change_type: changeType,
        task_title: data.title || '未命名',
        changed_fields: [],
        changes_detail: [{
          field: 'title',
          field_label: isSubtask ? '新子约定' : '新约定',
          old_value: '',
          new_value: data.title || '未命名'
        }]
      });

      return Response.json({ ok: true, logged: changeType });
    }

    // For delete events
    if (eventType === 'delete') {
      const changeType = isSubtask ? 'subtask_deleted' : 'deleted';
      const logTaskId = isSubtask ? (data.parent_task_id || taskId) : taskId;

      await base44.asServiceRole.entities.TaskChangeLog.create({
        task_id: logTaskId,
        change_type: changeType,
        task_title: data.title || '未命名',
        changed_fields: [],
        changes_detail: [{
          field: 'title',
          field_label: isSubtask ? '删除子约定' : '删除约定',
          old_value: data.title || '',
          new_value: ''
        }]
      });

      return Response.json({ ok: true, logged: changeType });
    }

    // For update events
    if (eventType === 'update' && old_data) {
      const changedFields = [];
      const changesDetail = [];

      for (const field of TRACKED_FIELDS) {
        const oldVal = old_data[field];
        const newVal = data[field];

        // Compare values
        const oldStr = JSON.stringify(oldVal ?? null);
        const newStr = JSON.stringify(newVal ?? null);

        if (oldStr !== newStr) {
          changedFields.push(field);
          changesDetail.push({
            field,
            field_label: FIELD_LABELS[field] || field,
            old_value: formatValue(field, oldVal),
            new_value: formatValue(field, newVal)
          });
        }
      }

      if (changedFields.length === 0) {
        return Response.json({ ok: true, skipped: 'no tracked changes' });
      }

      // Determine change type
      let changeType = isSubtask ? 'subtask_updated' : 'updated';
      if (changedFields.includes('status')) {
        changeType = isSubtask ? 'subtask_status_changed' : 'status_changed';
      }

      const logTaskId = isSubtask ? (data.parent_task_id || taskId) : taskId;

      await base44.asServiceRole.entities.TaskChangeLog.create({
        task_id: logTaskId,
        parent_task_id: isSubtask ? data.parent_task_id : null,
        change_type: changeType,
        task_title: data.title || old_data.title || '未命名',
        changed_fields: changedFields,
        changes_detail: changesDetail
      });

      return Response.json({ ok: true, logged: changeType, fields: changedFields });
    }

    return Response.json({ ok: true, skipped: 'unhandled event type' });
  } catch (error) {
    console.error('logTaskChange error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});