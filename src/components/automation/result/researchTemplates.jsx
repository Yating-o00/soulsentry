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
  if (!raw) return { images: [], text: "" };
  const imgRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const images = [];
  let m;
  let stripped = String(raw);
  while ((m = imgRe.exec(raw)) !== null) {
    images.push({ alt: m[1] || "", url: m[2] });
  }
  // 删掉所有图片占位,保留纯文字
  stripped = stripped.replace(imgRe, "").replace(/\n{3,}/g, "\n\n").trim();
  return { images, text: stripped };
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