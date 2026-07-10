import { Sparkles, ListTodo, StickyNote, MapPin, Rocket } from "lucide-react";

// 新手引导步骤：有 targetSelector 的步骤会在桌面端高亮真实 UI 元素，找不到时自动居中展示
export const TOUR_STEPS = [
  {
    icon: Sparkles,
    title: "欢迎来到心灵哨兵",
    description: "用一句话记下约定，AI 会在对的时间、对的地点提醒你。接下来 1 分钟，带你认识 3 个核心能力。",
  },
  {
    icon: ListTodo,
    targetSelector: 'a[href="/Tasks"]',
    title: "自然语言创建约定",
    description: "不用填表单，直接说出来即可，AI 会自动解析时间、优先级和类别。试试这些说法：",
    examples: ["提醒我明天下午3点开会", "下班顺路去超市买牛奶", "每周五晚上给爸妈打电话"],
  },
  {
    icon: StickyNote,
    targetSelector: 'a[href="/Notes"]',
    title: "心签笔记",
    description: "随手记录灵感和心情，AI 自动提炼摘要、识别待办，还会给你温暖的回应。",
  },
  {
    icon: MapPin,
    targetSelector: 'a[href="/Notifications"]',
    title: "情境守护",
    description: "设置家、公司等常用地点后，到达附近时自动触发相关提醒；免打扰时段与聚合通知，让提醒贴心不打扰。",
  },
  {
    icon: Rocket,
    title: "开始你的第一个约定",
    description: "在首页的智能输入框里说出你的第一个约定，剩下的交给哨兵。",
  },
];