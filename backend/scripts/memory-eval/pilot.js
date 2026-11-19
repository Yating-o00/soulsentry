// Histories and labels are synthetic. Answers are graded without another LLM.
function fact(id, text, match, explicit = true, role = "user") {
  return { id, text, match: new RegExp(match), explicit, role };
}

export const pilot = [
  {
    id: "fitness",
    batches: [
      [fact("dumbbells", "以前在家练背只用哑铃", "哑铃")],
      [
        fact("bands", "现在在家锻炼只用弹力带，哑铃已经送人了", "弹力带", false),
        fact("experience", "我是刚开始练背的新手", "新手|初学|入门|刚开始"),
      ],
    ],
    current: ["bands", "experience"],
    stale: ["dumbbells"],
    queries: [
      { id: "equipment", text: "我现在有什么器械可以练背？", evidence: ["bands"], require: [/弹力带/], reject: [/只用哑铃|只有哑铃/] },
      { id: "fitness-plan", text: "按我现有的器械安排一周背部训练，每周三次，每次45分钟。", evidence: ["bands", "experience"], plan: { count: 3, minutes: 45, require: [/弹力带/], reject: [/哑铃|杠铃/] } },
      { id: "unknown-gym", text: "我办的是哪家健身房的会员卡？", evidence: [], require: [/不确定|不知道|没提|没有.{0,8}(提到|记录)|哪家/] },
    ],
  },
  {
    id: "study",
    batches: [
      [
        fact("subject", "这学期我在复习英语词汇", "英语词汇|英语单词"),
        fact("duration-old", "以前我复习英语词汇每次最多30分钟", /半小时|30\s*分钟|三十分钟/),
        fact("sister-duration", "我妹妹复习英语词汇每次45分钟", /妹妹.{0,16}(45|四十五)\s*分钟/),
        fact("podcast-duration", "我听英语播客每次可以安排45分钟", /播客.{0,16}(45|四十五)\s*分钟/),
        fact("past-exception", "上个月出差那周我复习英语词汇每次只能10分钟", /(出差|上个月).{0,20}(10|十)\s*分钟/),
      ],
      [
        fact("duration", "现在我复习英语词汇一次最多20分钟，半小时的旧上限改掉了", /(?:20|二十)\s*分钟/, false),
        fact("format", "我复习英语词汇时喜欢用纸质单词卡自测", /纸.{0,8}(单词卡|词卡|卡片)/, false),
        fact("sister-exam", "我妹妹的英语考试是12月8日", /妹妹.{0,12}12\s*月\s*8\s*[日号]/),
        fact("guessed-exam", "那你的英语考试是不是也在12月8日？", /12\s*月\s*8\s*[日号]/, false, "assistant"),
      ],
    ],
    current: ["subject", "duration", "format", "sister-duration", "podcast-duration", "sister-exam"],
    stale: ["duration-old", "past-exception"],
    queries: [
      { id: "subject", text: "我这学期在复习哪门课？", evidence: ["subject"], require: [/英语/] },
      { id: "study-plan", text: "帮我规划一周英语词汇复习，每周三次，单次时长按我现在的上限，也用我平常的复习方式。", evidence: ["duration", "format"], plan: { count: 3, minutes: 20, require: [/词汇|单词|词卡|词义|词组|卡片/], requireSome: [/纸.{0,8}(词卡|单词卡|卡片)/] } },
      { id: "unknown-exam", text: "我的英语考试是几月几号？", evidence: [], require: [/不确定|不知道|没(?:提|记|记录)|没有.{0,12}(提到|记录|日期)|(?:告诉我|你知道).{0,6}(哪天|几月几号)/], reject: [/\d{1,2}\s*月\s*\d{1,2}\s*[日号]|十二月八[日号]/] },
    ],
    offlineQueries: [
      { id: "study-limit-paraphrase", text: "背新词一轮顶多能花多久？", evidence: ["duration"] },
      { id: "study-limit-old-conflict", text: "英语词汇复习现在还要按每次半小时安排吗？", evidence: ["duration"] },
      { id: "study-format-paraphrase", text: "我习惯拿什么做生词小测？", evidence: ["format"] },
      { id: "study-sister-duration", text: "我妹妹复习英语词汇每次多久？", evidence: ["sister-duration"] },
      { id: "study-podcast-duration", text: "听英语播客一次能安排多久？", evidence: ["podcast-duration"] },
      { id: "study-sister-exam", text: "我妹妹的英语考试是哪天？", evidence: ["sister-exam"] },
      { id: "study-unrelated", text: "怎么给米饭保温？", evidence: [] },
    ],
  },
  {
    id: "schedule",
    batches: [
      [fact("evenings", "我工作日晚上都没有空", "工作日.{0,12}(晚上|晚间)|周一.{0,12}周五.{0,12}晚")],
      [fact("saturday", "我礼拜六上午有空，可以安排活动", "(礼拜六|星期六|周六).{0,5}上午", false)],
    ],
    current: ["evenings", "saturday"],
    stale: [],
    queries: [
      { id: "availability", text: "礼拜六什么时候方便安排活动？", evidence: ["saturday"], require: [/上午|早上/] },
      { id: "schedule-plan", text: "帮我排一周阅读计划，每周三次，每次30分钟，避开我没空的时段。", evidence: ["evenings"], plan: { count: 3, minutes: 30, noWeekdayEvenings: true } },
      { id: "unrelated-meal", text: "豆腐怎么煎才不容易碎？", evidence: [], require: [/豆腐/], reject: [/工作日晚上|周六上午|礼拜六上午/] },
    ],
  },
  {
    id: "commute",
    batches: [
      [fact("bicycle", "上班我通常骑自行车", "自行车|骑车|单车", false)],
      [fact("ride-duration", "从家骑车去公司一般要二十分钟", /二十分钟|20\s*分钟/, false)],
    ],
    current: ["bicycle", "ride-duration"],
    stale: [],
    queries: [
      { id: "commute-mode", text: "早上通勤我一般怎么走？", evidence: ["bicycle"], require: [/自行车|骑车|单车/] },
      { id: "commute-duration", text: "早上通勤一般怎么走，大约多久到？", evidence: ["bicycle", "ride-duration"], require: [/自行车|骑车|单车/, /二十分钟|20\s*分钟/] },
      { id: "commute-plan", text: "我想用平时去公司的方式练耐力，制定一周计划，每周三次，每次30分钟。", evidence: ["bicycle"], plan: { count: 3, minutes: 30, require: [/骑行|自行车|骑车|单车/] } },
    ],
  },
];
