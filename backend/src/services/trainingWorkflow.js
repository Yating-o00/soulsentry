export function isTrainingGoal(goal) {
  const text = String(goal || "");
  if (/(健身|锻炼|力量|增肌|减脂|运动|体能|练背|练腿|练胸|哑铃|杠铃|workout|strength training)/i.test(text)) return true;
  return /训练/.test(text) && !/(英语|语言|口语|学习|考试|技能|打字|模型|ai)/i.test(text);
}

// Ask only for details needed to tailor an exercise plan. Context contains the
// user's conversation and any relevant, explicitly saved preferences.
export function trainingClarification({ goal, context, oneAtATime = false }) {
  if (!isTrainingGoal(goal)) return null;
  const text = String(context || "");
  const equipment = /(哑铃|杠铃|弹力带|器械|健身房|徒手|无器械|自重|跑步机|壶铃|有氧|dumbbell|gym|bodyweight|equipment)/i.test(text);
  const experience = /(新手|初学|零基础|刚开始|入门|经验|练过|训练了|训练过|训练\s*\d+\s*年|多年|进阶|中级|高级|beginner|experienced|intermediate|advanced)/i.test(text);
  if (!equipment && !experience && !oneAtATime) return "为了安排合适的训练，你有哪些器械或是在健身房训练？你是新手还是有训练经验？";
  if (!equipment) return "你有哪些器械，或者是在健身房训练？";
  if (!experience) return "你是训练新手，还是已经有一些训练经验？";
  return null;
}

export function validateTrainingSessions(sessions, { dumbbellOnly } = {}) {
  const errors = [];
  if (dumbbellOnly && sessions.some(({ title, description }) => /器械划船|高位下拉|史密斯机|引体向上杆|坐姿划船机|跑步机|杠铃|壶铃|弹力带/.test(title + " " + description))) {
    errors.push("EQUIPMENT：用户只有哑铃，请使用哑铃或徒手动作");
  }
  if (!sessions.length) errors.push("计划中没有主要训练安排");
  if (sessions.some((session) => {
    const details = String(session.description || "");
    return !/\d+\s*组/.test(details) || !/(\d+\s*(?:次|下)|\d+\s*[-–至~]\s*\d+\s*(?:次|下))/.test(details);
  })) errors.push("每次训练须列出具体动作、组数和每组次数");
  return errors;
}
