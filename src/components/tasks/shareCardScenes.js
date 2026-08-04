// 分享卡片场景风格配置：不同场景不同传播气质
export const SHARE_CARD_SCENES = [
  {
    id: "brand",
    emoji: "🛡️",
    name: { zh: "经典守护", en: "Classic" },
    accent: "#384877",
    bg: "#EEF1F8",
    headerLabel: { zh: "每日打卡", en: "DAILY CHECK-IN" },
    tagline: { zh: "坚定守护 · 适时轻唤", en: "Focus & Achieve" },
    headerImage: null,
    aiStyle: "minimalist, artistic, calm deep blue tones",
    quotes: {
      zh: [
        "每一个不曾起舞的日子，都是对生命的辜负。",
        "星光不问赶路人，时光不负有心人。",
        "种一棵树最好的时间是十年前，其次是现在。",
        "每天进步一点点，坚持带来大改变。",
        "专注当下，未来可期。",
      ],
      en: [
        "The secret of getting ahead is getting started.",
        "Small daily improvements are the key to staggering long-term results.",
        "Focus on being productive instead of busy.",
      ],
    },
  },
  {
    id: "date",
    emoji: "💗",
    name: { zh: "心动约定", en: "Sweet Date" },
    accent: "#E0526E",
    bg: "#FDF0F3",
    headerLabel: { zh: "我们的约定", en: "OUR PROMISE" },
    tagline: { zh: "山水迢迢 · 如约而至", en: "Miles apart, hearts together" },
    headerImage: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800&q=80",
    aiStyle: "romantic, warm pink and sunset tones, dreamy, soft light",
    quotes: {
      zh: [
        "所有的等待，都是为了更好的相见。",
        "我们隔着距离，却共享同一个约定。",
        "最浪漫的事，是把说好的事一件件做到。",
        "你一句“到时见”，我记到心里、写进日程。",
        "跨过山海，也要赴你的约。",
      ],
      en: [
        "Every wait is for a better reunion.",
        "Distance means so little when a promise means so much.",
        "The most romantic thing is keeping the little promises.",
      ],
    },
  },
  {
    id: "work",
    emoji: "💼",
    name: { zh: "工作协作", en: "Teamwork" },
    accent: "#0F766E",
    bg: "#ECFDF5",
    headerLabel: { zh: "协作任务单", en: "TEAM TASK" },
    tagline: { zh: "目标对齐 · 进度透明", en: "Aligned & On Track" },
    headerImage: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80",
    aiStyle: "professional, clean geometric shapes, teal and slate business tones",
    quotes: {
      zh: [
        "把事情说清楚，是最高效的协作。",
        "一个人走得快，一群人走得远。",
        "对齐目标，剩下的交给执行。",
        "透明的进度，是团队最好的信任。",
        "今日复盘一小步，项目推进一大步。",
      ],
      en: [
        "Clarity is the best collaboration tool.",
        "Alone we go fast, together we go far.",
        "Transparent progress builds team trust.",
      ],
    },
  },
  {
    id: "roommate",
    emoji: "🏠",
    name: { zh: "室友生活", en: "Roomies" },
    accent: "#D97706",
    bg: "#FFFBEB",
    headerLabel: { zh: "室友公约", en: "HOME PACT" },
    tagline: { zh: "同一屋檐 · 各自靠谱", en: "One roof, zero drama" },
    headerImage: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80",
    aiStyle: "cozy, playful flat illustration, warm orange and cream home vibes",
    quotes: {
      zh: [
        "谁洗碗不重要，说到做到才重要。",
        "好室友，是把公共区域当自己家收拾。",
        "分工写下来，友谊才长久。",
        "垃圾不过夜，快乐不打折。",
        "室友之间最好的默契：按约定来。",
      ],
      en: [
        "Chores written down keep friendships around.",
        "Good roommates keep promises, not just schedules.",
        "Trash out on time, good vibes all the time.",
      ],
    },
  },
];

export const getScene = (id) => SHARE_CARD_SCENES.find((s) => s.id === id) || SHARE_CARD_SCENES[0];