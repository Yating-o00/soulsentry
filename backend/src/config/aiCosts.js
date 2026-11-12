// 各 AI 功能的固定扣费点数（与前端 creditConfig 的参考表一致；对话/通用调用按 token 用量动态结算）
// 供 functions.js 及协同约定相关服务/路由共同引用，保持同一扣费口径
export const AI_CALL_COSTS = {
  kimi_web_browse: 2,
  analyze_intent: 1,
  analyze_image: 3,
  task_parse: 2,
  task_split: 2,
  memory_insight: 1,
  daily_briefing: 2,
  mood_river: 1,
  week_plan: 3,
  month_plan: 4,
  analyze_task: 1,
  collab_agent: 2
};
