// 自动执行前置参数校验：识别"缺什么"，让卡片可以就地标红「待补充」
// 不调用 AI，纯规则判断 —— 快、便宜、可解释
//
// 返回 { missing: [{key,label,placeholder}], hint: string }
// missing 为空数组表示参数齐全可直接执行。

const RULES = {
  email_draft: [
    {
      key: 'recipient',
      label: '收件人邮箱',
      placeholder: '如：zhang@example.com',
      detect: (text) => /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text),
    },
  ],
  calendar_event: [
    {
      key: 'time',
      label: '具体时间',
      placeholder: '如：明天下午3点',
      detect: (text) =>
        /(今天|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}[:：]\d{2}|\d{1,2}点|上午|下午|晚上|早上|中午|凌晨|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日)/.test(
          text
        ),
    },
  ],
  file_organize: [
    {
      key: 'target',
      label: '要整理的对象',
      placeholder: '如：按月份归档 / 重命名为 项目-日期',
      detect: (text) => text.replace(/\s/g, '').length >= 6,
    },
  ],
  web_research: [
    {
      key: 'topic',
      label: '调研主题',
      placeholder: '如：2026年AI硬件市场规模',
      detect: (text) => text.replace(/\s/g, '').length >= 4,
    },
  ],
  ppt_doc: [
    {
      key: 'topic',
      label: 'PPT主题',
      placeholder: '如：Q4业绩汇报，给管理层',
      detect: (text) => text.replace(/\s/g, '').length >= 4,
    },
  ],
  office_doc: [
    {
      key: 'topic',
      label: '文档主题',
      placeholder: '如：年度总结报告',
      detect: (text) => text.replace(/\s/g, '').length >= 4,
    },
  ],
  // summary_note / ledger_organize 没有强制参数 —— 直接放行
};

/**
 * 检测自动执行任务是否缺少关键参数
 * @param {string} automationType
 * @param {string} userText  用户原始输入（标题+描述拼接）
 * @returns {{missing: Array, hint: string}}
 */
export function detectAutomationGaps(automationType, userText) {
  const rules = RULES[automationType];
  if (!rules || rules.length === 0) return { missing: [], hint: '' };
  const text = String(userText || '');
  const missing = rules
    .filter((r) => !r.detect(text))
    .map(({ key, label, placeholder }) => ({ key, label, placeholder }));
  const hint =
    missing.length > 0
      ? `补充${missing.map((m) => m.label).join('、')}后即可自动执行`
      : '';
  return { missing, hint };
}

/**
 * 把用户行内补充的字段拼回原指令，让后续 plan/execute 拿到完整信息
 */
export function mergeGapAnswers(originalText, answers) {
  const parts = [String(originalText || '').trim()];
  Object.entries(answers || {}).forEach(([key, value]) => {
    const v = String(value || '').trim();
    if (!v) return;
    const label = {
      recipient: '收件人',
      time: '时间',
      target: '目标',
      topic: '主题',
    }[key] || key;
    parts.push(`${label}：${v}`);
  });
  return parts.filter(Boolean).join('\n');
}