// 访客评论的展示标签：优先访客填写的名字，否则用访客 token 前 6 位生成匿名标签
export function visitorLabelOf(comment) {
  return comment.visitorName || (comment.visitorToken ? `访客 #${comment.visitorToken.slice(0, 6)}` : null);
}
