// PPT 版式 & 主题常量 —— 前端切换器使用，需与后端 renderPpt / executeAutomation 保持一致

export const PPT_THEMES = [
  { id: "business", label: "商务深蓝", desc: "深色背景 · 蓝紫渐变 · 适合商业汇报" },
  { id: "minimal",  label: "极简白底", desc: "白底黑字 · 红色点缀 · 适合内容主导" },
  { id: "tech",     label: "科技深空", desc: "黑底青绿 · 适合产品/技术发布" },
];

export const PPT_LAYOUTS = [
  { id: "cover",            label: "封面",       desc: "首页大标题 + 副标题" },
  { id: "agenda",           label: "目录",       desc: "章节列表" },
  { id: "section-divider",  label: "章节分隔",   desc: "大序号 + 章节大标题" },
  { id: "two-column",       label: "双栏文字",   desc: "纯文字两列布局" },
  { id: "image-left",       label: "左图右文",   desc: "图片在左,要点在右" },
  { id: "image-right",      label: "右图左文",   desc: "图片在右,要点在左" },
  { id: "image-full",       label: "整页大图",   desc: "全屏背景图 + 浮层文字" },
  { id: "quote",            label: "金句引用",   desc: "醒目大字 + 引号" },
  { id: "stats",            label: "数据大字",   desc: "3~4 个关键数字" },
  { id: "cards",            label: "卡片网格",   desc: "要点拆为带编号卡片" },
  { id: "timeline",         label: "时间线",     desc: "3~5 个步骤/节点" },
  { id: "comparison",       label: "AB 对比",    desc: "左右两列对照" },
  { id: "closing",          label: "致谢结束",   desc: "Thank you 致谢页" },
];