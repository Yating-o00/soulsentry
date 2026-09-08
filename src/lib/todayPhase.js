// 时空相位：页面本身即情境感知
// 从参考稿 lib/sentry.ts 移植
export function phaseOf(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 12) return 'morning';
  if (h >= 12 && h < 14) return 'midday';
  if (h >= 14 && h < 18) return 'dusk';
  return 'night';
}

export const PHASE_GREETING = {
  dawn: '天快亮了',
  morning: '上午好',
  midday: '午安',
  dusk: '下午好',
  night: '夜深了',
};
