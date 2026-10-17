// 根据事件类型和标题/描述智能匹配 emoji 图标
// 优先级：AI 返回的 icon > 关键词匹配 > type 默认图标

const TYPE_ICONS = {
  meeting: '🤝',
  focus: '🎯',
  personal: '🌿',
  rest: '😴',
};

// 关键词 → emoji 映射（按优先级顺序，先匹配的优先）
const KEYWORD_ICONS = [
  // 出行交通
  { keys: ['飞机', '航班', '机场', '登机', '飞'], icon: '✈️' },
  { keys: ['高铁', '火车', '地铁'], icon: '🚄' },
  { keys: ['开车', '驾车', '出发', '路上', '通勤', '车程'], icon: '🚗' },
  { keys: ['打车', '滴滴'], icon: '🚕' },
  // 通讯
  { keys: ['电话', '致电', '打给', '来电'], icon: '📞' },
  { keys: ['视频', '视频会议', '连线'], icon: '📹' },
  { keys: ['邮件', '发邮件', '回邮件'], icon: '📧' },
  { keys: ['微信', '消息', '回复'], icon: '💬' },
  // 会议工作
  { keys: ['会议', '会面', '见面', '开会', '评审', '汇报'], icon: '🤝' },
  { keys: ['报告', '文档', '撰写', '写作', '方案'], icon: '📝' },
  { keys: ['演示', 'presentation', '展示', 'ppt', '路演'], icon: '📊' },
  { keys: ['代码', '编程', '开发', 'coding', 'bug'], icon: '💻' },
  { keys: ['设计', '原型', '画图'], icon: '🎨' },
  // 生活
  { keys: ['吃饭', '午饭', '晚饭', '早餐', '用餐', '聚餐'], icon: '🍽️' },
  { keys: ['咖啡', '喝茶', '下午茶'], icon: '☕' },
  { keys: ['购物', '买', '超市'], icon: '🛒' },
  { keys: ['快递', '包裹', '取件'], icon: '📦' },
  // 健康
  { keys: ['运动', '健身', '跑步', '锻炼', '瑜伽'], icon: '🏃' },
  { keys: ['医院', '看病', '体检', '就医'], icon: '🏥' },
  { keys: ['吃药', '服药', '药物'], icon: '💊' },
  { keys: ['睡觉', '睡眠', '休息', '小憩'], icon: '😴' },
  // 家庭关系
  { keys: ['妈妈', '爸爸', '家人', '父母', '孩子', '家里'], icon: '👨‍👩‍👧' },
  { keys: ['生日', '纪念日'], icon: '🎂' },
  { keys: ['礼物'], icon: '🎁' },
  // 学习
  { keys: ['学习', '读书', '看书', '阅读'], icon: '📚' },
  { keys: ['考试', '测验'], icon: '📖' },
  { keys: ['课程', '上课', '培训'], icon: '🎓' },
  // 财务
  { keys: ['付款', '转账', '缴费', '账单', '工资'], icon: '💰' },
  // 提醒
  { keys: ['提醒', '备忘'], icon: '🔔' },
  { keys: ['出门', '出发'], icon: '🚪' },
  { keys: ['回家'], icon: '🏠' },
];

export function getEventIcon(event) {
  if (!event) return '📌';
  // 1. AI 明确给了 icon，直接使用
  if (event.icon && typeof event.icon === 'string' && event.icon.trim()) {
    return event.icon;
  }

  // 2. 按关键词匹配 title + desc
  const text = `${event.title || ''} ${event.desc || event.description || ''}`.toLowerCase();
  for (const rule of KEYWORD_ICONS) {
    if (rule.keys.some((k) => text.includes(k.toLowerCase()))) {
      return rule.icon;
    }
  }

  // 3. 回退到 type 默认
  if (event.type && TYPE_ICONS[event.type]) {
    return TYPE_ICONS[event.type];
  }

  // 4. 最终兜底
  return '📌';
}