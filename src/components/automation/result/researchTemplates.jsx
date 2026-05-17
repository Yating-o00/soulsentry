// 调研/图文报告章节排版模板
// 每个模板会接收 { heading, content, images } —— images 是从 content 中抽取的 markdown 图片
// 返回的是一个无需依赖额外样式的 className 容器约定，由 ResearchResultView 渲染

export const TEMPLATES = {
  // 经典：标题 + 正文 + 图片下方居中（适合通用调研段落）
  classic: {
    name: "经典文档",
    description: "标题 + 段落 + 图片居中，适合长文叙述",
  },
  // 杂志：左文右图，文字与图片并排
  magazine: {
    name: "杂志双栏",
    description: "左文右图,适合产品/案例介绍",
  },
  // 画廊：图片置顶 2-3 列网格 + 下方说明文字
  gallery: {
    name: "图片画廊",
    description: "图片网格在上 + 文字说明在下,适合多图展示",
  },
  // 卡片:每段文字与图片配对成卡片,纵向堆叠
  card: {
    name: "卡片堆叠",
    description: "图文配对卡片,适合分点说明",
  },
  // 极简:无图或图片很小,纯文本可读性优先
  minimal: {
    name: "极简文本",
    description: "纯文字阅读,适合摘要/总结",
  },
};

// 从 markdown 文本中抽取所有 ![alt](url) 图片,并返回剥离图片后的纯文本
export function extractImagesAndText(raw) {
  if (!raw) return { images: [], text: "", segments: [] };
  const imgRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const images = [];
  // segments: 按图片在原文中出现的位置切片,得到 [{text, image?}, ...]
  // 用于卡片/杂志模式,确保图片与其紧邻的文字保持正确顺序
  const segments = [];
  const src = String(raw);
  let last = 0;
  let m;
  while ((m = imgRe.exec(src)) !== null) {
    const img = { alt: m[1] || "", url: m[2] };
    images.push(img);
    const before = src.slice(last, m.index).replace(/\n{3,}/g, "\n\n").trim();
    segments.push({ text: before, image: img });
    last = m.index + m[0].length;
  }
  const tail = src.slice(last).replace(/\n{3,}/g, "\n\n").trim();
  if (tail || segments.length === 0) segments.push({ text: tail, image: null });

  const stripped = src.replace(imgRe, "").replace(/\n{3,}/g, "\n\n").trim();
  return { images, text: stripped, segments };
}

// 根据内容特征自动推荐模板
export function autoPickTemplate(text, images) {
  const imgCount = images?.length || 0;
  const textLen = (text || "").length;
  if (imgCount === 0) return "minimal";
  if (imgCount >= 3) return "gallery";
  if (imgCount >= 1 && textLen > 400) return "magazine";
  if (imgCount === 1 && textLen < 200) return "card";
  return "classic";
}