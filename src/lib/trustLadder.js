// 信任阶梯 —— 按自动执行类型分级的默认托管档位
// confirm_first = 需我确认后才动手；auto_draft = 低风险自动做出草稿；full_auto = 完全托管

export const TIERS = {
  confirm_first: {
    key: "confirm_first",
    label: "需我确认",
    short: "确认",
    description: "只生成方案，等你点头后才动手",
    color: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  auto_draft: {
    key: "auto_draft",
    label: "自动出草稿",
    short: "草稿",
    description: "低风险的活先替你做完，成稿等你验收",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  full_auto: {
    key: "full_auto",
    label: "完全托管",
    short: "托管",
    description: "这类事交给心栈，不用再问我",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
};

export const TIER_ORDER = ["confirm_first", "auto_draft", "full_auto"];

// 默认档位：产出型（只生成文件/草稿，不对外发生动作）默认自动；
// 对外发送与改动既有数据默认需要确认。
export const DEFAULT_TIERS = {
  email_draft: "auto_draft",
  web_research: "auto_draft",
  office_doc: "auto_draft",
  ppt_doc: "auto_draft",
  summary_note: "auto_draft",
  ledger_organize: "auto_draft",
  calendar_event: "auto_draft",
  file_organize: "confirm_first",
};

export const TRUST_TYPE_NOTE = {
  email_draft: "起草可以自动，真正发送永远需要你确认",
  web_research: "联网调研并生成报告，不会对外发生动作",
  office_doc: "生成文档初稿，随时可改",
  ppt_doc: "生成演示稿初稿",
  summary_note: "整理成心签或结构化文档",
  ledger_organize: "把零散记账整理成账本",
  calendar_event: "解析时间并加入约定列表",
  file_organize: "会改动既有文件的命名与归档，建议保留确认",
};

export function tierOf(policies, automationType) {
  const hit = (policies || []).find((p) => p.automation_type === automationType);
  return hit?.tier || DEFAULT_TIERS[automationType] || "confirm_first";
}

// 该档位 + 风险等级下，是否允许直接执行（不等用户点头）
export function shouldAutoRun(tier, risk) {
  if (tier === "full_auto") return true;
  if (tier === "auto_draft") return risk !== "high";
  return false;
}