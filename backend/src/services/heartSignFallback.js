/**
 * 心签 AI 分析的本地兜底服务。
 * 当 Kimi 超时或不可用时，用规则快速生成标题、分类、标签和回应。
 * 设计原则：
 *  1. 敏感信息不进 AI 管道，直接标记为 vault
 *  2. 危机词固定兜底话术
 *  3. 回应先接住再托举、简短、按浓度可调
 */

import crypto from "node:crypto";

// ========== 敏感信息 / 保险柜规则 ==========
const VAULT_PATTERNS = [
  { re: /\b\d{17}[\dXx]\b/, label: "身份证" },
  { re: /\b\d{15}\b/, label: "证件号" },
  { re: /\b(?:\d{4}[ -]?){3,4}\d{1,4}\b/, label: "银行卡/卡号" },
  { re: /密码[:：]\s*\S+/i, label: "密码" },
  { re: /验证码[:：]\s*\S+/i, label: "验证码" },
  { re: /密钥[:：]\s*\S+/i, label: "密钥" },
  { re: /私钥|token|api\s*key|护照|驾照|驾驶证/i, label: "敏感凭证" }
];

export function detectVault(text) {
  const t = String(text || "");
  for (const p of VAULT_PATTERNS) {
    if (p.re.test(t)) return p.label;
  }
  return null;
}

// ========== 危机兜底 ==========
const CRISIS_PATTERNS = [
  /想死|不想活|活着没意思|想自杀|自残|割腕|跳楼|吞药|结束生命|死了算了|没意义了|撑不下去|想结束自己/i
];

export function detectCrisis(text) {
  const t = String(text || "");
  return CRISIS_PATTERNS.some((re) => re.test(t));
}

// ========== 五类签规则 ==========
const TYPE_RULES = [
  {
    key: "material",
    label: "资料",
    keys: ["https://", "http://", "www.", "文章", "链接", "刷到", "读到", "视频", "播客", "收藏", "教程", "知乎", "公众号", "B站", "bilibili", "小红书", "豆瓣", "这篇", "那篇"],
    defaultTitle: "收藏了一条好内容",
    responses: {
      full: ["核心要点已收好，我帮你把关键信息留住了。", "需要延伸阅读、提取摘要或者转成约定时，随时叫我。"],
      light: ["核心要点已收好。需要延伸阅读或转成约定时叫我。"],
      mute: ["已收好。"]
    }
  },
  {
    key: "share",
    label: "分享",
    keys: ["分享", "发给", "朋友圈", "给大家", "晒一", "想让", "看到", "转发", "发出去"],
    defaultTitle: "想分享给你的话",
    responses: {
      full: ["这句话/这件事值得被更多人看到。", "点「签卡」，可以把它变成一张好看的卡片。"],
      light: ["这句话值得被更多人看到，可以生成签卡分享。"],
      mute: ["已收好。"]
    }
  },
  {
    key: "memo",
    label: "备忘",
    keys: ["记得", "别忘了", "号码", "尾号", "电话", "地址", "取件码", "约", "提醒我", "买", "带", "拿"],
    defaultTitle: "记一件小事",
    responses: {
      full: ["已收好，随时问我。"],
      light: ["已收好，随时问我。"],
      mute: ["已收好。"]
    }
  },
  {
    key: "inspiration",
    label: "灵感",
    keys: ["想到", "灵感", "点子", "如果", "能不能", "或许可以", "突然", "创意", "设想", "要不然"],
    defaultTitle: "一个突然的念头",
    responses: {
      full: ["这个念头我收好了。", "它最想解决的是哪一个瞬间？想落地的话，我可以帮你转成约定。"],
      light: ["这个念头我收好了。想落地的话，我可以帮你转成约定。"],
      mute: ["已收好。"]
    }
  },
  {
    key: "emotion",
    label: "情绪",
    keys: ["心情", "开心", "难过", "焦虑", "烦", "好累", "累", "委屈", "害怕", "孤独", "失落", "压力", "想哭", "哭了", "崩溃", "怀疑", "失眠", "沮丧", "愤怒", "治愈", "感动", "内耗", "emo", "挫败", "不安", "想念", "安心", "烦躁", "迷茫", "无助", "堵得慌", "空落落的"],
    defaultTitle: "此刻的心情",
    responses: {
      full: [], // 情绪签用 mirror + 托举动态生成
      light: [],
      mute: ["已收好。"]
    }
  }
];

// 情绪「接住」镜像
const EMOTION_CATCH = [
  { re: /(当众否定|被否定|批评|挫败|否定|被说)/, text: "被当众否定，换谁都会不好受" },
  { re: /(怀疑|不自信|配不上|我不行)/, text: "自我怀疑的感觉，真的很消耗人" },
  { re: /(焦虑|不安|心慌|忐忑|坐立不安)/, text: "心里悬着事的感觉，不好熬" },
  { re: /(累|疲惫|筋疲力尽|撑不住|喘不过气)/, text: "撑了这么久，辛苦你了" },
  { re: /(失眠|睡不着|半夜醒|整夜)/, text: "夜深了还睡不着，那种安静里的翻腾最磨人" },
  { re: /(孤独|一个人|没人懂|被抛弃)/, text: "孤独感袭来的时候，连房间都显得特别大" },
  { re: /(开心|高兴|治愈|感动|安心|踏实|暖)/, text: "听到这个消息，我也跟着暖了一下" },
  { re: /(难过|伤心|委屈|想哭|眼泪)/, text: "委屈和难过涌上来的时候，不需要假装没事" },
  { re: /(烦|烦躁|恼火|生气|火大|愤怒)/, text: "有些事确实让人火大，你不需要立刻平静" },
  { re: /(迷茫|不知道|怎么办|无助|无路可走)/, text: "不知道该往哪走的时候，先停下来也是对的" },
  { re: /(压力|喘不过气| Deadline|deadline)/, text: "压力堆在一起的时候，人会先喘不过气" }
];

const EMOTION_HOLD = [
  "这些感受都很真实，不需要急着解决，先让它们被看见。",
  "不管此刻是什么心情，它都值得被好好安放。",
  "我在这儿，你慢慢讲。",
  "能说出来，本身就是一种照顾。"
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function classify(text) {
  const t = String(text || "");
  for (const rule of TYPE_RULES) {
    if (rule.keys.some((k) => t.toLowerCase().includes(k.toLowerCase()))) {
      return rule.key;
    }
  }
  return "emotion";
}

function extractKeywords(text) {
  const t = String(text || "").replace(/https?:\/\/[^\s]+/g, "");
  const stopWords = new Set([
    "的", "了", "是", "我", "你", "在", "和", "就", "都", "要", "会", "能", "很", "也", "这", "那", "有", "个", "与", "及", "等",
    "一下", "一个", "一条", "一件", "一些", "今天", "现在", "有点", "感觉", "觉得", "但是", "因为", "所以", "如果", "然后", "只是",
    "什么", "怎么", "这么", "那么", "一种", "一下"
  ]);
  const freq = {};
  for (let i = 0; i < t.length - 1; i++) {
    for (let len = 6; len >= 2; len--) {
      const s = t.slice(i, i + len);
      if (stopWords.has(s)) continue;
      if (/^[\u4e00-\u9fa5]+$/.test(s) && !/^(.)(\1)+$/.test(s)) {
        freq[s] = (freq[s] || 0) + 1;
      }
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
}

function buildTitle(text, type) {
  const t = String(text || "").trim();
  const firstLine = t.split(/[。！？\n]/)[0].trim();
  if (firstLine.length >= 4 && firstLine.length <= 20) {
    return firstLine.replace(/^#+\s*/, "");
  }
  if (firstLine.length > 20) {
    return firstLine.slice(0, 18) + "…";
  }
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
  tags.push(...extractKeywords(text));
  return Array.from(new Set(tags)).slice(0, 6);
}

function buildEmotionResponse(text, density) {
  if (density === "mute") return "已收好。";
  let caught = "";
  for (const p of EMOTION_CATCH) {
    if (p.re.test(text)) {
      caught = p.text;
      break;
    }
  }
  const hold = pick(EMOTION_HOLD);
  if (density === "light") {
    return caught ? `${caught}。${hold}` : hold;
  }
  const lift = "先不急着找答案，把它放一会儿，我也会替你守着。";
  return caught ? `${caught}。${hold} ${lift}` : `${hold} ${lift}`;
}

function buildResponse(type, text, density = "light") {
  if (density === "mute") return "已收好。";
  if (type === "emotion") return buildEmotionResponse(text, density);
  const rule = TYPE_RULES.find((r) => r.key === type);
  const lines = rule?.responses?.[density] || rule?.responses?.light || ["已收好。"];
  return lines.join(" ");
}

// ========== 对外主入口 ==========
export function buildHeartSignFallback({ content, plainText, density = "light" }) {
  const text = String(plainText || content || "").trim();

  // 1. 危机兜底
  if (detectCrisis(text)) {
    return {
      title: "想先陪陪你",
      summary: "",
      key_points: [],
      tags: ["情绪"],
      category: "情绪",
      is_emotional: true,
      response_persona: "comforter",
      response_title: "来自另一个你的拥抱",
      emotional_response:
        "谢谢你愿意说出来。你现在可能很难受，这不是你一个人要扛的事。可以的话，给信任的人打个电话，或者拨打心理援助热线 24 小时 400-161-9995。我一直都在。",
      analyzed_at: new Date().toISOString(),
      source: "crisis_fallback",
      is_crisis: true
    };
  }

  // 2. 保险柜检测
  const vaultLabel = detectVault(text);
  if (vaultLabel) {
    return {
      title: `${vaultLabel}已加密存放`,
      summary: "",
      key_points: [],
      tags: ["保险柜"],
      category: "保险柜",
      is_emotional: false,
      response_persona: "",
      response_title: "",
      emotional_response: "",
      analyzed_at: new Date().toISOString(),
      source: "vault_fallback",
      is_vault: true,
      vault_label: vaultLabel
    };
  }

  // 3. 普通心签
  const type = classify(text);
  const title = buildTitle(text, type);
  const summary = buildSummary(text);
  const tags = buildTags(text, type);
  const response = buildResponse(type, text, density);

  const categoryMap = {
    material: "资料",
    share: "分享",
    memo: "备忘",
    inspiration: "灵感",
    emotion: "情绪"
  };

  return {
    title,
    summary,
    key_points: tags.slice(0, 3),
    tags,
    category: categoryMap[type] || "情绪",
    is_emotional: type === "emotion" || type === "inspiration" || type === "share",
    response_persona:
      type === "emotion" ? "comforter" : type === "material" ? "mentor" : type === "memo" ? "clerk" : "friend",
    response_title: type === "emotion" ? "来自另一个你的拥抱" : "另一个你说",
    emotional_response: response,
    analyzed_at: new Date().toISOString(),
    source: "local_fallback",
    note_type: type
  };
}

// 简易哈希，用于保险柜密码校验（非加密存储内容）
export function hashVaultPwd(pwd) {
  return crypto.createHash("sha256").update(String(pwd)).digest("hex");
}
