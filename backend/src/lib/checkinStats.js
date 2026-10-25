/**
 * 约定打卡计数口径。
 *
 * 分享落地页（/api/public/share/:token/toggle）允许任何人点"打卡"：
 * 拥有者与共有成员（登录态）的打卡与 App 内打卡一致，计入累计；
 * 访客（匿名或登录但未加入共有的用户）的打卡保留记录（附言可见、留痕 SharedActionLog），
 * 但不计入约定卡片的打卡计数 —— 用 source 标记，计数统一走 countedCheckinsWhere 排除。
 */
export const VISITOR_CHECKIN_SOURCE = "public_share_visitor";

export function countedCheckinsWhere(taskId) {
  return { taskId, source: { not: VISITOR_CHECKIN_SOURCE } };
}
