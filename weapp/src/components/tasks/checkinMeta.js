// 打卡约定的里程碑、鼓励语与文案（与 Web 端 CheckinShareCard/CheckinWidget 口径一致）

export const CHECKIN_MILESTONES = [1, 7, 21, 50, 100, 365];

export const MILESTONE_QUOTES = {
  1: "第一次赴约，从这里开始。",
  7: "7 次了。这一周的自己，都被认真度过。",
  21: "21 次，习惯已成。你已经是那个会赴约的人。",
  50: "50 次奔赴。这件事，已经长在你身上。",
  100: "100 次。百次之约，万次也不远。",
  365: "365 次。一整年的约定，你都兑现了。",
};

export function milestoneQuote(total) {
  return MILESTONE_QUOTES[total] || "每一次都算数。";
}

export function nextMilestone(total) {
  return CHECKIN_MILESTONES.find((m) => total < m) || null;
}

// 打卡按钮下方/打卡后的鼓励话：命中里程碑给金句，否则给下一里程碑进度
export function checkinEncourage(total) {
  if (MILESTONE_QUOTES[total]) return MILESTONE_QUOTES[total];
  const nm = nextMilestone(total);
  return nm ? `再赴约 ${nm - total} 次，就到 ${nm} 次里程碑。` : "已集齐全部里程碑，继续！";
}
