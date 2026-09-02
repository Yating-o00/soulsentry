// 估算校准：把统计出的平均偏差翻译成人话，并给出建议缓冲

export function formatOffset(minutes) {
  const m = Math.abs(Math.round(minutes || 0));
  if (m < 60) return `${m} 分钟`;
  if (m < 60 * 24) {
    const h = Math.round((m / 60) * 10) / 10;
    return `${h} 小时`;
  }
  const d = Math.round((m / (60 * 24)) * 10) / 10;
  return `${d} 天`;
}

export const CATEGORY_LABELS = {
  work: "工作",
  personal: "个人",
  health: "健康",
  study: "学习",
  family: "家庭",
  shopping: "采购",
  finance: "财务",
  other: "这类",
};

// 建议缓冲：取平均偏差，但最多提前 4 小时，避免历史离群值把提醒推得离谱
export function suggestedBufferMinutes(averageOffsetMinutes) {
  const late = Math.max(0, Math.round(averageOffsetMinutes || 0));
  return Math.min(late, 240);
}

export function calibrationSentence(calibration) {
  if (!calibration) return "";
  const label = CATEGORY_LABELS[calibration.category] || "这类";
  const offset = calibration.average_offset_minutes || 0;
  if (offset <= 0) {
    return `${label}的事你通常能提前 ${formatOffset(offset)} 完成`;
  }
  const buffer = suggestedBufferMinutes(offset);
  return `${label}的事你平均晚 ${formatOffset(offset)} 完成，帮你提前 ${formatOffset(buffer)} 提醒`;
}