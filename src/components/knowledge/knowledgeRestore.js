import { httpRequest } from "@/api/httpClient";

// 知识库沉淀返还：约定回到进行中列表、心签去掉已沉淀标记，知识副本随之移除
export async function restoreKnowledgeItem(id) {
  return httpRequest(`/api/knowledge-bases/${id}/restore`, { method: "POST" });
}

export function canRestoreKnowledge(item) {
  return ["task", "note"].includes(item?.source_type) && !!item?.source_id;
}

export function restoreHint(item) {
  return item?.source_type === "task"
    ? "返还后，这条约定会回到进行中列表，知识库中的副本将被移除。确定返还吗？"
    : "返还后，这条心签会回到心签列表，知识库中的副本将被移除。确定返还吗？";
}
