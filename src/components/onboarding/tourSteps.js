import { Sparkles, LayoutDashboard, CalendarClock, Zap, MapPin, ListTodo, Layers, StickyNote, Rocket } from "lucide-react";

// 跨页面新手引导：path 指定步骤所在页面，targetSelector 高亮真实功能模块（找不到时自动居中展示）
export const TOUR_STEPS = [
  {
    icon: Sparkles,
    path: "/",
    title: "欢迎来到心灵哨兵",
    description: "用一句话记下约定，AI 会在对的时间、对的地点提醒你。接下来带你逛一圈核心功能，随时可跳过。",
  },
  {
    icon: LayoutDashboard,
    path: "/",
    targetSelector: '[data-tour="dashboard-stats"]',
    title: "今日总览",
    description: "今日待办、逾期约定、已完成进度一目了然。点击数字可以直接查看对应的约定清单。",
  },
  {
    icon: CalendarClock,
    path: "/",
    targetSelector: '[data-tour="daily-planner"]',
    title: "AI 日程规划",
    description: "把你一天的安排随口说给它听，AI 会自动生成完整的时间轴日程，并帮你避开冲突。",
    examples: ["上午写方案，下午3点开会，晚上健身"],
  },
  {
    icon: Zap,
    path: "/",
    targetSelector: '[data-tour="auto-exec"]',
    title: "自动执行清单",
    description: "描述一个场景，AI 拆解成可执行的动作（写邮件、整理文件、做研究…），你逐条授权，它来完成。",
  },
  {
    icon: MapPin,
    path: "/",
    targetSelector: '[data-tour="geo-guard"]',
    title: "时空感知守护",
    description: "设置家、公司等常用地点后，到达附近时自动触发相关提醒，顺路的事不再忘记。",
  },
  {
    icon: ListTodo,
    path: "/Tasks",
    targetSelector: '[data-tour="task-create"]',
    title: "自然语言创建约定",
    description: "不用填表单，直接说出来即可，AI 自动解析时间、优先级和类别。试试这些说法：",
    examples: ["提醒我明天下午3点开会", "下班顺路去超市买牛奶", "每周五晚上给爸妈打电话"],
  },
  {
    icon: Layers,
    path: "/Tasks",
    targetSelector: '[data-tour="task-groups"]',
    title: "智能四分组",
    description: "约定自动归入「现在能做 / 即将截止 / 智能建议 / 固定安排」，打开页面就知道先做什么。",
  },
  {
    icon: StickyNote,
    path: "/Notes",
    targetSelector: '[data-tour="note-input"]',
    title: "心签笔记",
    description: "像给文件传输助手发消息一样随手记录，AI 自动提炼摘要、识别待办，还会给你温暖的回应。",
  },
  {
    icon: Rocket,
    path: "/",
    title: "开始你的第一个约定",
    description: "回到首页，说出你的第一个约定，剩下的交给哨兵。",
  },
];