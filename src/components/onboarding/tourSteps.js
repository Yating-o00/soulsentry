import { Sparkles, MessagesSquare, ListTodo, Heart, ShieldCheck, Rocket, Coins, BookOpen } from "lucide-react";

// 新手操作指引：与产品当前形态保持一致
// 今日页对话式记录 / 约定智能解析 / 心签六类+账本+保险柜 / 时空感知守护 / 浏览器小助手执行 / AI 点数
export const TOUR_STEPS = [
  {
    icon: Sparkles,
    title: "欢迎来到心栈 SoulSentry",
    description: "用说话的方式记约定、写心签、交办事情——AI 在对的时间、对的地点回应你。带你花一分钟逛一圈现在的样子。",
  },
  {
    icon: MessagesSquare,
    title: "今日 · 像聊天一样记录",
    description: "首页输入框就是对话框：说出想记的，AI 会理解意图并给出确认卡片。带 ⚡ 的事可以直接交办——浏览器小助手真的替你去办：",
    examples: ["帮我订明天北京飞旧金山的机票", "明天晚上帮我给闺蜜订个蛋糕", "帮我回复明天给王总的邮件"],
  },
  {
    icon: ListTodo,
    title: "约定 · 说出来就建好",
    description: "长按还能语音输入。AI 会解析时间、地点、优先级并拟好子约定，你改动确认后生成约定卡片。重复类约定（如每天吃药）会按人性化解拍提醒，不催不扰。",
    examples: ["提醒我明早9点交周报", "每天晚上8点提醒我吃药"],
  },
  {
    icon: Heart,
    title: "心签 · 随手记，都被接住",
    description: "情绪、灵感、资料、备忘、分享、账本六类自动分类，每类都有量身定做的回应。拍照就能记账生成账本签；密码等敏感内容会提醒你存入保险柜，本地密码、全程打码。",
  },
  {
    icon: ShieldCheck,
    title: "时空感知守护",
    description: "到了相关地点，自动提醒你可顺手处理的约定（路过超市提醒买东西、回家提醒取快递）；沉睡了很久的约定，会被轻轻捞起。首页守护卡片里点「查看约定」即可处理。",
  },
  {
    icon: Rocket,
    title: "守护记录 · 办事过程看得见",
    description: "小助手执行的每一步都在守护记录里：进展、结果、需要你拍板时的提问。随时可打开实时窗口接管，或把能力范围内的事放心交给它。",
  },
  {
    icon: Coins,
    title: "AI 点数 · 用多少算多少",
    description: "注册即送 200 AI 点数。对话、约定解析、心签分析、图片识别、小助手执行都会按次自动扣点，消费明细在「我的 → AI 点数」里随时可查，用完可随时充值。",
  },
  {
    icon: BookOpen,
    title: "约定还能沉淀成知识",
    description: "有些约定不需要执行——它值得被记住。点「沉淀为知识」，内容进入你的知识库，约定安然完成。现在，去首页说出你的第一句吧。",
  },
];
