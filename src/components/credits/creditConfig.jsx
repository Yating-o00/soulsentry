// AI 功能动态计费配置 (v2)
// 计费模型：基于本次 AI 调用的真实 token 用量动态扣费
//   1 credit ≈ 200 tokens（输入+输出，比之前便宜一半）
//   不同功能有不同的复杂度倍率（最高 1.5x，在 functions/callAI 中应用）
//   每次调用预扣 5 点防并发超额，结算时多退少补
//   estimated 字段仅用于在「点数」页面展示参考估算
export const AI_FEATURES = {
  smart_priority: {
    name: "智能优先级建议",
    multiplier: 1.1,
    estimated: "约 5-15 点/次",
    description: "基于实际 token 用量动态计费"
  },
  task_breakdown: {
    name: "任务智能分解",
    multiplier: 1.4,
    estimated: "约 15-40 点/次",
    description: "基于实际 token 用量动态计费"
  },
  note_summary: {
    name: "笔记智能摘要",
    multiplier: 1.2,
    estimated: "约 10-30 点/次",
    description: "基于实际 token 用量动态计费"
  },
  schedule_optimize: {
    name: "日程智能优化",
    multiplier: 1.4,
    estimated: "约 15-40 点/次",
    description: "基于实际 token 用量动态计费"
  },
  emotional_reminder: {
    name: "情感化提醒",
    multiplier: 1.0,
    estimated: "约 5-10 点/次",
    description: "基于实际 token 用量动态计费"
  },
  daily_briefing: {
    name: "每日智能简报",
    multiplier: 1.3,
    estimated: "约 10-25 点/次",
    description: "基于实际 token 用量动态计费"
  },
  weekly_plan: {
    name: "周计划生成",
    multiplier: 1.5,
    estimated: "约 25-60 点/次",
    description: "基于实际 token 用量动态计费"
  },
  monthly_plan: {
    name: "月计划生成",
    multiplier: 1.5,
    estimated: "约 40-100 点/次",
    description: "基于实际 token 用量动态计费"
  },
  general_ai: {
    name: "AI 对话",
    multiplier: 1.0,
    estimated: "约 5-10 点/次",
    description: "基于实际 token 用量动态计费"
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