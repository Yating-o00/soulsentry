import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FIELD_LABELS = {
  title: '标题',
  description: '描述',
  status: '状态',
  priority: '优先级',
  category: '类别',
  reminder_time: '提醒时间',
  end_time: '结束时间',
  progress: '进度',
  repeat_rule: '重复规则',
  tags: '标签',
  notification_sound: '提醒音效',
  persistent_reminder: '持续提醒',
  dependencies: '依赖',
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
  if (value === null || value === undefined) return '空';
  if (field === 'status') return STATUS_LABELS[value] || value;
  if (field === 'priority') return PRIORITY_LABELS[value] || value;
  if (field === 'category') return CATEGORY_LABELS[value] || value;
  if (field === 'reminder_time' || field === 'end_time') {
    try { return new Date(value).toLocaleString('zh-CN'); } catch { return String(value); }
  }
  if (field === 'progress') return `${value}%`;
  if (field === 'persistent_reminder') return value ? '开启' : '关闭';
  if (Array.isArray(value)) return value.join(', ') || '空';
  if (typeof value === 'string' && value.length > 100) return value.substring(0, 100) + '...';
  return String(value);
}

// Fields we care about tracking
const TRACKED_FIELDS = ['title', 'description', 'status', 'priority', 'category', 'reminder_time', 'end_time', 'progress', 'repeat_rule', 'tags', 'notification_sound', 'persistent_reminder'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { event, data, old_data } = payload;

    if (!event || !data) {
      return Response.json({ ok: true, skipped: true });
    }

    const isSubtask = !!data.parent_task_id;
    const taskId = isSubtask ? data.parent_task_id : data.id;

    // Task created
    if (event.type === 'create') {
      if (isSubtask) {
        await base44.asServiceRole.entities.TaskHistory.create({
          task_id: taskId,
          change_type: 'subtask_created',
          summary: `添加了子约定「${data.title}」`,
          subtask_title: data.title,
        });
      }
      // We don't track main task creation since the task itself serves as the creation record
      return Response.json({ ok: true });
    }

    // Task deleted
    if (event.type === 'delete') {
      if (isSubtask) {
        await base44.asServiceRole.entities.TaskHistory.create({
          task_id: taskId,
          change_type: 'subtask_deleted',
          summary: `删除了子约定「${data.title || '未知'}」`,
          subtask_title: data.title || '',
        });
      }
      return Response.json({ ok: true });
    }

    // Task updated
    if (event.type === 'update' && old_data) {
      const histories = [];

      if (isSubtask) {
        // Track subtask status changes
        if (old_data.status !== data.status) {
          if (data.status === 'completed') {
            histories.push({
              task_id: taskId,
              change_type: 'subtask_completed',
              field_name: 'status',
              old_value: formatValue('status', old_data.status),
              new_value: formatValue('status', data.status),
              summary: `子约定「${data.title}」已完成 ✓`,
              subtask_title: data.title,
            });
          } else {
            histories.push({
              task_id: taskId,
              change_type: 'subtask_updated',
              field_name: 'status',
              old_value: formatValue('status', old_data.status),
              new_value: formatValue('status', data.status),
              summary: `子约定「${data.title}」状态变更为 ${formatValue('status', data.status)}`,
              subtask_title: data.title,
            });
          }
        }
        // Track subtask title changes
        if (old_data.title !== data.title) {
          histories.push({
            task_id: taskId,
            change_type: 'subtask_updated',
            field_name: 'title',
            old_value: old_data.title || '',
            new_value: data.title || '',
            summary: `子约定名称由「${old_data.title}」改为「${data.title}」`,
            subtask_title: data.title,
          });
        }
      } else {
        // Track main task field changes
        for (const field of TRACKED_FIELDS) {
          const oldVal = old_data[field];
          const newVal = data[field];

          // Skip if both are empty/null
          if ((oldVal === null || oldVal === undefined || oldVal === '') && 
              (newVal === null || newVal === undefined || newVal === '')) continue;
          
          // Compare stringified for arrays/objects
          const oldStr = JSON.stringify(oldVal);
          const newStr = JSON.stringify(newVal);
          if (oldStr === newStr) continue;

          const label = FIELD_LABELS[field] || field;

          if (field === 'status') {
            histories.push({
              task_id: taskId,
              change_type: 'status_changed',
              field_name: field,
              old_value: formatValue(field, oldVal),
              new_value: formatValue(field, newVal),
              summary: `状态从「${formatValue(field, oldVal)}」变更为「${formatValue(field, newVal)}」`,
            });
          } else {
            histories.push({
              task_id: taskId,
              change_type: 'updated',
              field_name: field,
              old_value: formatValue(field, oldVal),
              new_value: formatValue(field, newVal),
              summary: `${label}已更新`,
            });
          }
        }
      }

      // Batch create histories
      if (histories.length > 0) {
        await base44.asServiceRole.entities.TaskHistory.bulkCreate(histories);
      }
    }

    return Response.json({ ok: true, tracked: true });
  } catch (error) {
    console.error('Track task changes error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});