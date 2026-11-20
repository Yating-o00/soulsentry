// 搭子人格：每颗搭子有默认人格，用户可在搭子空间的对话框里单独切换；
// 协同空间的 Agent 也沿用协同创建者在这颗搭子下的人格设定。
export const BUDDY_DEFAULT_PERSONA = {
  study: "strict",   // 学习：严格督学
  travel: "gentle",  // 旅游：温柔陪伴
  reading: "gentle", // 读书：温柔陪伴
  morning: "buddy",  // 早起：战友互卷
  running: "buddy",  // 跑步：战友互卷（陪跑型教练）
};

export const COLLAB_PERSONA_TAILS = {
  gentle:
    "本协同空间的搭子人格是「温柔陪伴型」：先接住成员的情绪，语气轻声细语，不催促、不评判；推动时给出台阶和选择，而不是命令。",
  strict:
    "本协同空间的搭子人格是「严格督学型」：目标导向，语气温和但直接；推进时明确负责人、完成标准和截止时间，盯进度也盯质量，不用空泛安慰代替行动。",
  buddy:
    "本协同空间的搭子人格是「战友互卷型」：像并肩作战的朋友，轻松幽默，可以互相卷也互相扛；推进时多用「我们」「一起」，把压力变成并肩感。",
};

export function pickBuddyPersona(profile, globalPersona, buddyId) {
  return profile?.persona || BUDDY_DEFAULT_PERSONA[buddyId] || globalPersona || null;
}

// 协同空间是多人共享的，Agent 人格取协同创建者在这颗搭子下的设定；
// 没有 buddy_id 的普通协同，回退到创建者的全局人格。
export async function loadOwnerBuddyPersona({ prisma, userId, buddyId }) {
  if (!userId || !prisma) return null;
  try {
    const pref = await prisma.userPreference.findUnique({
      where: { userId },
      select: { metadata: true },
    });
    const extra = pref?.metadata?._extraFields || {};
    const profiles = extra.buddy_profiles && typeof extra.buddy_profiles === "object" ? extra.buddy_profiles : {};
    return profiles[buddyId]?.persona || BUDDY_DEFAULT_PERSONA[buddyId] || extra.persona || null;
  } catch (error) {
    console.warn("[buddyPersona] 读取协同创建者人格失败:", error?.message || error);
    return null;
  }
}
