// AI 功能动态计费配置 (v2)
// 计费模型：基于本次 AI 调用的真实 token 用量动态扣费
//   1 credit ≈ 200 tokens（输入+输出，比之前便宜一半）
//   不同功能有不同的复杂度倍率（最高 1.5x，在 functions/callAI 中应用）
//   每次调用预扣 5 点防并发超额，结算时多退少补
//   estimated 字段仅用于在「点数」页面展示参考估算
export const AI_FEATURES = {
  smart_priority: {
    name: "智能优先级建议",
    multiplier: 5.5,
    estimated: "约 50-150 点/次",
    description: "基于实际 token 用量动态计费"
  },
  task_breakdown: {
    name: "任务智能分解",
    multiplier: 7.0,
    estimated: "约 150-400 点/次",
    description: "基于实际 token 用量动态计费"
  },
  note_summary: {
    name: "笔记智能摘要",
    multiplier: 6.0,
    estimated: "约 100-300 点/次",
    description: "基于实际 token 用量动态计费"
  },
  schedule_optimize: {
    name: "日程智能优化",
    multiplier: 7.0,
    estimated: "约 150-400 点/次",
    description: "基于实际 token 用量动态计费"
  },
  emotional_reminder: {
    name: "情感化提醒",
    multiplier: 5.0,
    estimated: "约 50-100 点/次",
    description: "基于实际 token 用量动态计费"
  },
  daily_briefing: {
    name: "每日智能简报",
    multiplier: 6.5,
    estimated: "约 100-250 点/次",
    description: "基于实际 token 用量动态计费"
  },
  weekly_plan: {
    name: "周计划生成",
    multiplier: 7.5,
    estimated: "约 250-600 点/次",
    description: "基于实际 token 用量动态计费"
  },
  monthly_plan: {
    name: "月计划生成",
    multiplier: 7.5,
    estimated: "约 400-1000 点/次",
    description: "基于实际 token 用量动态计费"
  },
  general_ai: {
    name: "AI 对话",
    multiplier: 5.0,
    estimated: "约 50-100 点/次",
    description: "基于实际 token 用量动态计费"
  },
  automation_plan: {
    name: "自动执行 · 方案规划",
    multiplier: 0,
    estimated: "5 点/次",
    description: "固定计费：AI 解析指令并生成执行方案"
  },
  automation_email_draft: {
    name: "自动执行 · 邮件草稿",
    multiplier: 0,
    estimated: "15 点/次",
    description: "固定计费：AI 起草专业邮件"
  },
  automation_summary_note: {
    name: "自动执行 · 总结心签 / 复盘",
    multiplier: 0,
    estimated: "20 点/次",
    description: "固定计费：AI 生成总结/日终复盘"
  },
  automation_calendar_event: {
    name: "自动执行 · 日历事件",
    multiplier: 0,
    estimated: "20 点/次",
    description: "固定计费：AI 解析时间并创建日历事件"
  },
  automation_file_organize: {
    name: "自动执行 · 文件整理",
    multiplier: 0,
    estimated: "20 点/次",
    description: "固定计费：AI 整理文件并归档"
  },
  automation_office_doc: {
    name: "自动执行 · 办公文档",
    multiplier: 0,
    estimated: "50 点/次",
    description: "固定计费：AI 生成 Word/HTML 长文档"
  },
  automation_web_research: {
    name: "自动执行 · 联网调研",
    multiplier: 0,
    estimated: "60 点/次",
    description: "固定计费：联网搜索 + 深度调研报告"
  },
  automation_ppt_doc: {
    name: "自动执行 · 演示稿",
    multiplier: 0,
    estimated: "80 点/次",
    description: "固定计费：AI 生成多页 PPT（含视觉解析）"
  }
};

// 自动执行类型 → 固定扣费点数（执行成功后才扣，失败/取消不扣）
export const AUTOMATION_EXECUTE_COSTS = {
  plan: 5,
  email_draft: 15,
  summary_note: 20,
  calendar_event: 20,
  file_organize: 20,
  office_doc: 50,
  web_research: 60,
  ppt_doc: 80,
  default: 20,
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