import { isHistoricalMemory } from "./memoryLearning.js";

// Shared by live retrieval and the offline pilot. Semantic aliases augment, rather
// than replace, surface matches for names, times, and quantities.
const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
const stopWords = new Set(["帮我", "给我", "我想", "可以", "时候", "什么", "怎么", "一般", "平常", "现在", "以前", "每次", "一次", "多少", "复习", "安排", "记住", "每周", "一周"]);
const domains = {
  vocabulary: /词汇|单词|生词|新词|词卡|背词|词组/,
  podcast: /播客|podcast/i,
  exam: /考试|考期|考场|应试|考证|exam/i,
  training: /健身|锻炼|锻练|锻炼计划|健身房|练背|训练|运动|哑铃|弹力带|抗阻|器械|workout/i,
  commute: /通勤|上班|下班|去公司|到公司|往返公司|上下班|commute/i,
  calendar: /可用时段|有空|没空|空闲|什么时候方便|可安排|工作日|周末|星期[一二三四五六日天]|礼拜[一二三四五六日天]/,
};
const aliasGroups = [
  /骑行|骑车|自行车|单车/,
  /哑铃|手持配重|自由重量/,
  /弹力带|阻力带/,
  /周六|星期六|礼拜六/,
  /周日|星期天|星期日|礼拜日|礼拜天/,
  /早上|上午|早晨|清晨/,
  /晚上|夜里|晚间/,
];
const ownerNames = /妹妹|姐姐|哥哥|弟弟|伴侣|朋友|同事|父亲|母亲|爸爸|妈妈|孩子|女儿|儿子/;
const selfOwner = /(?:^|[，。；])我(?:自己|目前|现在|通常|在|只|用|复习|背|上班|一直|这学期|听|常|习惯)/;
const dateValue = /(?:\d{1,2}|[一二三四五六七八九十]{1,3})月(?:\d{1,2}|[一二三四五六七八九十]{1,3})[日号]|\d{4}-\d{2}-\d{2}/;
const durationValue = /(?:\d{1,3}|[一二两三四五六七八九十]{1,4})\s*(?:分钟|小时)|半小时/;
const experience = /新手|初学|零基础|有经验|刚开始|练过|经验|老手/;
const formatValue = /(?:纸质|纸卡|单词卡|词卡|闪卡|flashcards|听写|手写|跟读|自测|错题本|重复阅读)/i;
const equipmentValue = /哑铃|手持配重|弹力带|阻力带|杠铃|徒手|器械|壶铃|(?:健身房|家庭)设备/;
const transportValue = /自行车|骑车|单车|地铁|公交|打车|开车|步行|电动车|骑行/;

function terms(text) {
  return new Set(Array.from(segmenter.segment(text), ({ segment, isWordLike }) => (
    isWordLike && segment.length >= 2 && !stopWords.has(segment) ? segment.toLowerCase() : ""
  )).filter(Boolean));
}

function fetchScope(text) {
  const owner = text.match(ownerNames)?.[0];
  return owner && !selfOwner.test(text) ? owner : "self";
}

function attributes(text, record = false) {
  const types = new Set();
  if (record) {
    if (durationValue.test(text)) types.add("duration");
    if (formatValue.test(text)) types.add("format");
    if (equipmentValue.test(text)) types.add("equipment");
    if (/健身房|健身馆/.test(text) && /会员|办卡|会籍/.test(text)) types.add("membership");
    if (transportValue.test(text) && !(durationValue.test(text) && /多久|要花|一般要|从.{0,30}去/.test(text))) types.add("transport");
    if (experience.test(text)) types.add("experience");
    if (dateValue.test(text) && domains.exam.test(text)) types.add("exam-date");
    if (/周[一二三四五六日天]|星期|礼拜|工作日|周末/.test(text) && /有空|没空|方便|不可用|不在/.test(text)) types.add("availability");
    if (/这学期|正在|最近|目前在|目标|科目/.test(text) && !types.size) types.add("subject");
  } else {
    if (/哪门|什么课|(?:哪个|什么)科目|(?:在|正)复习什么/.test(text)) types.add("subject");
    if (/上限|顶多|最长|多久|多少分钟|多长时间|时长|每次.{0,5}半小时/.test(text)) types.add("duration");
    if (/练习方式|复习方式|用什么.{0,4}自测|拿什么|怎么.{0,4}小测/.test(text)) types.add("format");
    if (/怎么走|怎么去|去公司的方式|通勤方式/.test(text)) types.add("transport");
    if (/哪天|几月几号|哪一天|哪一日|考试日期/.test(text) && domains.exam.test(text)) types.add("exam-date");
    if (/时段|没空|有空|时间.{0,4}方便|什么时候方便/.test(text)) types.add("availability");
    if (/器械|器材|设备|有.{0,5}可以练/.test(text) && domains.training.test(text)) types.add("equipment");
    if (domains.training.test(text) && /会员|办卡|会籍/.test(text)) types.add("membership");
    if (/(规划|安排|制定|计划)/.test(text) && domains.training.test(text)) types.add("experience");
  }
  return types;
}

export function rankMemoryRecords(records, rawQuery, { limit = 5, scores = new Map() } = {}) {
  const query = String(rawQuery || "").normalize("NFKC");
  if (!query.trim()) return [];
  const qTerms = terms(query);
  const qDomains = Object.entries(domains).filter(([, re]) => re.test(query)).map(([name]) => name);
  const wanted = attributes(query);
  const expectedOwner = fetchScope(query);
  const requestedDay = query.match(/(?:周|星期|礼拜)([一二三四五六日天])/)?.[1];
  const studyTopics = new Set(["vocabulary", "exam", "podcast"]);
  const questionStudies = qDomains.filter((domain) => studyTopics.has(domain));
  const results = [];
  for (const item of records) {
    const text = [...new Set([item.title, item.content].filter(Boolean))].join(" ").normalize("NFKC");
    const owner = item.fact?.subject && item.fact.subject !== "other" ? item.fact.subject : fetchScope(text);
    if (owner !== expectedOwner) continue;
    if (isHistoricalMemory(text)) continue;
    const types = attributes(text, true);
    const matchCount = [...wanted].filter((attribute) => types.has(attribute)).length;
    if (wanted.size && !matchCount) continue;
    const active = Object.entries(domains).filter(([, re]) => re.test(text)).map(([name]) => name);
    if (questionStudies.length && active.some((domain) => studyTopics.has(domain) && !questionStudies.includes(domain))
        && !questionStudies.some((domain) => active.includes(domain))) continue;
    if (wanted.has("availability") && requestedDay && types.has("availability")) {
      const candidateDay = text.match(/(?:周|星期|礼拜)([一二三四五六日天])/)?.[1];
      const sameDay = candidateDay && candidateDay.replace("天", "日") === requestedDay.replace("天", "日");
      if (!sameDay && (candidateDay || /工作日/.test(text) && /[六日天]/.test(requestedDay))) continue;
    }
    const overlap = [...qTerms].filter((term) => text.includes(term) || item.fact?.aliases?.includes(term)).length;
    const semanticAliases = aliasGroups.filter((re) => re.test(query) && re.test(text)).length;
    const sameDomain = qDomains.filter((domain) => active.includes(domain)).length;
    const vectorScore = scores.get(item.id) || 0;
    const typedMatch = matchCount > 0 && (sameDomain > 0 || qDomains.length === 0);
    if (!typedMatch && !overlap && !semanticAliases && !sameDomain && vectorScore < 0.65) continue;
    const score = 5 * matchCount + 2 * sameDomain + overlap + semanticAliases + vectorScore;
    results.push({ item, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, Math.min(5, Math.max(0, limit))).map(({ item }) => item);
}
