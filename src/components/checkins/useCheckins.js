import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { httpRequest } from "@/api/httpClient";

/**
 * 约定打卡（Checkin）数据钩子。
 * 打卡是"履约记录"：同一个约定可多次打卡，每次可附带一句话或一张照片；
 * 与"盖章完成"相互独立——打卡不完成约定。
 */
export function useCheckins(taskId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["checkins", taskId],
    queryFn: () => httpRequest(`/api/tasks/${taskId}/checkins`),
    enabled: enabled && !!taskId,
    staleTime: 60 * 1000,
  });
}

export function useCreateCheckin(taskId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      httpRequest(`/api/tasks/${taskId}/checkins`, { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkins", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function usePatchCheckin(taskId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ checkinId, data }) =>
      httpRequest(`/api/tasks/${taskId}/checkins/${checkinId}`, { method: "PATCH", body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checkins", taskId] }),
  });
}

// 上传打卡照片，返回 /uploads/ 相对路径
export async function uploadCheckinPhoto(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await httpRequest("/api/uploads", { method: "POST", body: form });
  return res?.file_url || null;
}
