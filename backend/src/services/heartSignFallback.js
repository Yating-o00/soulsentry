/**
 * 心签 AI 分析的本地兜底服务。
 * 当 Kimi 超时或不可用时，用规则快速生成标题、分类、标签和回应，
 * 确保前端 5 秒内一定能拿到结果。
 */

const TYPE_RULES = [
  {
    key: "material",
    label: "资料",
    keys: ["https://", "http://", "www.", "文章", "链接", "刷到", "读到", "视频", "播客", "收藏", "教程", "知乎", "公众号", "B站", "bilibili", "小红书", "豆瓣"],
    defaultTitle: "收藏了一条好内容",
    response: "已为你收好这条资料。需要的时候，我随时帮你调取、串联或者转成约定。"
  },
  {
    key: "share",
    label: "分享",
    keys: ["分享", "发给", "朋友圈", "给大家", "晒一", "想让", "看到", "转发"],
    defaultTitle: "想分享给你的话",
    response: "这句话/这件事值得被更多人看到。点「签卡」可以生成一张好看的卡片。"
  },
  {
    key: "memo",
    label: "备忘",
    keys: ["记得", "别忘了", "号码", "尾号", "电话", "地址", "取件码", "密码", "身份证号", "约", "提醒我"],
    defaultTitle: "记一件小事",
    response: "已收好，随时问我。"
  },
  {
    key: "emotion",
    label: "情绪",
    keys: ["心情", "开心", "难过", "焦虑", "烦", "好累", "累", "委屈", "害怕", "孤独", "失落", "压力", "想哭", "哭了", "崩溃", "怀疑", "失眠", "沮丧", "愤怒", "治愈", "感动", "内耗", "emo", "挫败", "不安", "想念", "安心", "烦躁", "迷茫", "无助"],
    defaultTitle: "此刻的心情",
    response: "我听到了。这些感受都很真实，不需要急着解决，先让它们被看见。"
  },
  {
    key: "inspiration",
    label: "灵感",
    keys: ["想到", "灵感", "点子", "如果", "能不能", "或许可以", "突然", "创意", "设想"],
    defaultTitle: "一个突然的念头",
    response: "这个念头我收好了。它最想解决的是哪一个瞬间？想落地的话，我可以帮你转成约定。"
  }
];

const EMOTION_MIRROR_PATTERNS = [
  { re: /(当众否定|被否定|批评|挫败|否定)/, text: "被当众否定，换谁都会不好受" },
  { re: /(怀疑|不自信|配不上)/, text: "自我怀疑的感觉，真的很消耗人" },
  { re: /(焦虑|不安|心慌|忐忑)/, text: "心里悬着事的感觉，不好熬" },
  { re: /(累|疲惫|筋疲力尽|撑不住)/, text: "撑了这么久，辛苦你了" },
  { re: /(失眠|睡不着|半夜醒)/, text: "夜深了还睡不着，那种安静里的翻腾最磨人" },
  { re: /(孤独|一个人|没人懂)/, text: "孤独感袭来的时候，连房间都显得特别大" },
  { re: /(开心|高兴|治愈|感动|安心|踏实)/, text: "听到这个消息，我也跟着暖了一下" },
  { re: /(难过|伤心|委屈|想哭)/, text: "委屈和难过涌上来的时候，不需要假装没事" },
  { re: /(烦|烦躁|恼火|生气)/, text: "有些事确实让人火大，你不需要立刻平静" },
  { re: /(迷茫|不知道|怎么办|无助)/, text: "不知道该往哪走的时候，先停下来也是对的" }
];

function classify(text) {
  const t = String(text || "");
  for (const rule of TYPE_RULES) {
    if (rule.keys.some((k) => t.toLowerCase().includes(k.toLowerCase()))) {
      return rule.key;
    }
  }
  return "emotion"; // 默认当作情绪签，符合产品调性
}

function extractKeywords(text) {
  const t = String(text || "").replace(/https?:\/\/[^\s]+/g, "");
  // 简单分词：去掉常见虚词后取前 3 个 2-6 字词块
  const stopWords = new Set([
    "的", "了", "是", "我", "你", "在", "和", "就", "都", "要", "会", "能", "很", "也", "这", "那", "有", "个", "与", "及", "等", "一下", "一个", "一条", "一件", "一些", "今天", "现在", "有点", "感觉", "觉得", "但是", "因为", "所以", "如果", "然后"
  ]);
  const candidates = [];
  for (let i = 0; i < t.length - 1; i++) {
    for (let len = 6; len >= 2; len--) {
      const s = t.slice(i, i + len);
      if (stopWords.has(s)) continue;
      if (/^[\u4e00-\u9fa5]+$/.test(s) && !/^(.)(\1)+$/.test(s)) {
        candidates.push(s);
      }
    }
  }
  // 按出现频次排序，取前 3
  const freq = {};
  candidates.forEach((c) => (freq[c] = (freq[c] || 0) + 1));
  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  return sorted;
}

function buildTitle(text, type) {
  const t = String(text || "").trim();
  // 1. 尝试取前 20 字内的第一句/第一行
  const firstLine = t.split(/[。！？\n]/)[0].trim();
  if (firstLine.length >= 4 && firstLine.length <= 20) {
    return firstLine.replace(/^#+\s*/, "");
  }
  // 2. 截取前 20 字
  if (firstLine.length > 20) {
    return firstLine.slice(0, 18) + "…";
  }
  // 3. 按类型返回默认标题
  const rule = TYPE_RULES.find((r) => r.key === type);
  return rule?.defaultTitle || "此刻的心签";
}

function buildSummary(text) {
  const t = String(text || "").trim();
  if (t.length <= 40) return t;
  return t.slice(0, 38) + "…";
}

function buildTags(text, type) {
  const tags = [];
  const rule = TYPE_RULES.find((r) => r.key === type);
  if (rule) tags.push(rule.label);
  const keywords = extractKeywords(text);
  tags.push(...keywords);
  return Array.from(new Set(tags)).slice(0, 6);
}

function buildResponse(type, text) {
  const t = String(text || "");
  if (type === "emotion") {
    for (const p of EMOTION_MIRROR_PATTERNS) {
      if (p.re.test(t)) {
        return `${p.text}。这些感受都很真实，不需要急着解决，先让它们被看见。`;
      }
    }
    return "我听到了。不管此刻是什么心情，它都值得被好好安放。";
  }
  const rule = TYPE_RULES.find((r) => r.key === type);
  return rule?.response || "已收好。需要的时候，我随时在。";
}

export function buildHeartSignFallback({ content, plainText }) {
  const text = String(plainText || content || "").trim();
  const type = classify(text);
  const title = buildTitle(text, type);
  const summary = buildSummary(text);
  const tags = buildTags(text, type);
  const response = buildResponse(type, text);

  return {
    title,
    summary,
    key_points: tags.slice(0, 3),
    tags,
    category: type === "material" ? "读书" : type === "memo" ? "生活" : type === "share" ? "生活" : type === "inspiration" ? "灵感" : "情绪",
    is_emotional: type === "emotion" || type === "inspiration" || type === "share",
    response_persona: type === "emotion" ? "comforter" : type === "inspiration" ? "friend" : "mentor",
    response_title: type === "emotion" ? "来自另一个你的拥抱" : "另一个你说",
    emotional_response: response,
    analyzed_at: new Date().toISOString(),
    source: "local_fallback"
  };
}
