import { Sparkles, LayoutDashboard, CalendarClock, Zap, ListTodo, StickyNote, Heart, Rocket } from "lucide-react";

export const TOUR_STEPS = [
  {
    icon: Sparkles,
    title: "欢迎来到心栈 SoulSentry",
    description: "用一句话记下约定，AI 会在对的时间、对的地点提醒你。接下来带你逛一圈核心功能，随时可跳过。",
  },
  {
    icon: LayoutDashboard,
    title: "今日总览",
    description: "今日待办、逾期约定、已完成进度一目了然。点击数字可以直接查看对应的约定清单。",
  },
  {
    icon: CalendarClock,
    title: "AI 日程规划",
    description: "把你一天的安排随口说给它听，AI 会自动生成完整的时间轴日程，并帮你避开冲突。",
    examples: ["上午写方案，下午3点开会，晚上健身"],
  },
  {
    icon: Zap,
    title: "自动执行清单",
    description: "描述一个场景，AI 拆解成可执行的动作（写邮件、整理文件、做研究…），你逐条授权，它来完成。",
  },
  {
    icon: ListTodo,
    title: "自然语言创建约定",
    description: "不用填表单，直接说出来即可，AI 自动解析时间、优先级和类别。试试这些说法：",
    examples: ["提醒我明天下午3点开会", "下班顺路去超市买牛奶", "每周五晚上给爸妈打电话"],
  },
  {
    icon: Heart,
    title: "心签笔记",
    description: "像给文件传输助手发消息一样随手记录，AI 自动提炼摘要、识别待办，还会给你温暖的回应。",
  },
  {
    icon: Rocket,
    title: "开始你的第一个约定",
    description: "回到首页，说出你的第一个约定，剩下的交给哨兵。注册账号可获得 200 AI 积分。",
  },
];
