// AI功能点数消耗配置
export const AI_FEATURES = {
  smart_priority: {
    name: "智能优先级建议",
    cost: 30,
    description: "AI分析任务并推荐最佳优先级"
  },
  task_breakdown: {
    name: "任务智能分解",
    cost: 150,
    description: "AI将复杂任务分解为可执行的子任务"
  },
  note_summary: {
    name: "笔记智能摘要",
    cost: 50,
    description: "AI为笔记生成精炼摘要"
  },
  schedule_optimize: {
    name: "日程智能优化",
    cost: 100,
    description: "AI分析效率曲线，优化日程安排"
  },
  emotional_reminder: {
    name: "情感化提醒",
    cost: 30,
    description: "AI生成个性化激励提醒文案"
  },
  daily_briefing: {
    name: "每日智能简报",
    cost: 80,
    description: "AI生成每日任务简报与建议"
  },
  weekly_plan: {
    name: "周计划生成",
    cost: 200,
    description: "AI智能规划一周安排"
  },
  monthly_plan: {
    name: "月计划生成",
    cost: 300,
    description: "AI智能规划月度安排"
  },
  general_ai: {
    name: "AI对话",
    cost: 20,
    description: "通用AI助手对话"
  }
};

// 点数包配置
export const CREDIT_PACKS = [
  { id: "starter", name: "体验包", credits: 500, price: 5, priceDisplay: "¥5", tag: null },
  { id: "standard", name: "标准包", credits: 2000, price: 15, priceDisplay: "¥15", tag: "热门", savings: "25%" },
  { id: "premium", name: "专业包", credits: 5000, price: 30, priceDisplay: "¥30", tag: "超值", savings: "40%" },
  { id: "ultimate", name: "旗舰包", credits: 15000, price: 75, priceDisplay: "¥75", tag: "最划算", savings: "50%" },
];

// 订阅计划配置
export const SUBSCRIPTION_PLANS = {
  free: {
    name: "免费版",
    monthlyPrice: 0,
    monthlyBonus: 0,
    features: [
      "50个任务管理",
      "30个笔记记录",
      "基础提醒功能",
      "新用户赠送200AI点数"
    ]
  },
  pro: {
    name: "专业版",
    monthlyPrice: 19,
    monthlyBonus: 500,
    features: [
      "无限任务和笔记",
      "AI智能分析全部功能",
      "高级提醒策略",
      "每月赠送500AI点数",
      "多设备同步",
      "团队协作（5人）",
      "优先客服支持"
    ]
  },
  team: {
    name: "团队版",
    monthlyPrice: 99,
    monthlyBonus: 3000,
    features: [
      "专业版全部功能",
      "无限团队成员",
      "每月赠送3000AI点数",
      "高级数据分析",
      "自定义工作流",
      "专属客户经理"
    ]
  }
};