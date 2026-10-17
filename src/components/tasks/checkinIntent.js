// 识别输入内容中的打卡意图：命中即建议归入「打卡」类别（checkin）。
// 规则保持保守，宁缺勿滥；更细的判断交给各输入路径的 AI 分类（prompt/enum 已含 checkin）。
export function detectCheckinIntent(text) {
  if (!text) return false;
  const t = String(text);
  return /打卡|签到|签个到/.test(t)
    || /坚持.{0,8}\d+\s*天/.test(t)
    || /每日一|日更|每日打卡|天天练/.test(t);
}
