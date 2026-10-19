/**
 * 把约定的子约定树按层级展平（DFS 前序），供打卡弹层 / 分享卡只读展示。
 * - 含任意层级：直接子约定 depth=0，其下逐级 +1
 * - limit：最多返回的行数（超出截断，用于分享卡控制图片高度）；弹层传空表示全量
 * - 带访问保护，异常成环的数据不会死循环
 */
export function flattenSubtasks(getSubtasks, rootId, { limit } = {}) {
  const result = [];
  const visited = new Set([rootId]);
  const walk = (parentId, depth) => {
    if (limit && result.length >= limit) return;
    const children = getSubtasks(parentId) || [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      result.push({ ...child, depth });
      walk(child.id, depth + 1);
      if (limit && result.length >= limit) return;
    }
  };
  walk(rootId, 0);
  return result;
}
