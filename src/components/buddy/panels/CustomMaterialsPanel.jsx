import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";

const MAX_MATERIALS = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.json,.html,.htm,.xlsx,.xls,.png,.jpg,.jpeg,.webp";

/**
 * 专属搭子的「资料」板块：
 * 用户上传自己领域的资料（PDF/Word/表格/文本/图片），服务端提取文字后存为搭子记忆，
 * 之后在对话和协同 Agent 里优先依据这些资料回答，让搭子在该方向上更专业。
 */
export default function CustomMaterialsPanel({ buddy, tint }) {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const accent = tint?.[2] || "#384877";

  const { data, isLoading } = useQuery({
    queryKey: ["buddy", buddy.id, "materials"],
    queryFn: () => httpRequest(`/api/buddies/${buddy.id}/materials`),
    enabled: !!buddy?.id,
  });
  const materials = data?.materials || [];
  const full = materials.length >= MAX_MATERIALS;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["buddy", buddy.id, "materials"] });

  const upload = async (files) => {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    if (full) {
      toast.info(`最多 ${MAX_MATERIALS} 份资料，先删掉一份再加`);
      return;
    }
    setUploading(true);
    let added = 0;
    for (const file of list.slice(0, MAX_MATERIALS - materials.length)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`「${file.name}」超过 20MB，换个小一点的文件`);
        continue;
      }
      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploaded = await httpRequest("/api/uploads", { method: "POST", body: formData });
        await httpRequest(`/api/buddies/${buddy.id}/materials`, {
          method: "POST",
          body: {
            file_url: uploaded.file_url,
            name: uploaded.file_name || file.name,
            type: uploaded.file_type || file.type,
          },
        });
        added += 1;
      } catch (error) {
        toast.error(error?.message || `「${file.name}」没能加进资料`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (added > 0) {
      refresh();
      toast.success(`已收下 ${added} 份资料，${buddy.name}会先读这些再回答`);
    }
  };

  const remove = async (id) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await httpRequest(`/api/buddies/${buddy.id}/materials/${id}`, { method: "DELETE" });
      refresh();
      toast.success("资料已移除");
    } catch (error) {
      toast.error(error?.message || "移除失败，再试一次");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-stone-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${accent}14`, color: accent }}
          >
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-stone-900">给{buddy.name}的资料</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-stone-500">
              上传你熟悉的领域资料，{buddy.name}会先读这些再回答。最多 {MAX_MATERIALS} 份，支持 PDF、Word、表格、文本和图片。
            </p>
          </div>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" /> 正在读取资料…
            </div>
          ) : materials.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed p-5 text-center"
              style={{ borderColor: `${accent}45`, backgroundColor: `${accent}08` }}
            >
              <p className="text-[12px] leading-relaxed text-stone-500">
                还没有资料。先放一份你最常用的笔记、规范或手册，它回答会更有依据。
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {materials.map((material) => (
                <li key={material.id} className="flex items-center gap-3 rounded-2xl bg-[#FAF9F7] px-3.5 py-3">
                  <FileText className="h-4 w-4 shrink-0" style={{ color: accent }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-stone-700">{material.name}</p>
                    <p className="mt-0.5 text-[10px] text-stone-400">
                      已提取 {material.chars || 0} 字
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(material.id)}
                    disabled={deletingId === material.id}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-white hover:text-rose-500 disabled:opacity-50"
                    aria-label={`移除 ${material.name}`}
                  >
                    {deletingId === material.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => upload(event.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || full}
          className="mt-4 flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full border text-[13px] font-medium disabled:opacity-50"
          style={{ borderColor: accent, color: accent }}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "正在读这份资料…" : full ? `已满 ${MAX_MATERIALS} 份` : "上传一份资料"}
        </button>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-stone-400">
          资料只供你这颗搭子使用；在你发起的协同里，Agent 会按它给出建议，但不会把原文展示给伙伴。上传和删除不消耗 AI 点数。
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="text-[12px] font-medium text-stone-700">资料会用在哪里</h3>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-stone-500">
          <li>· 在「今天」聊天时，优先按资料里的方法和标准回答</li>
          <li>· 在协同 Agent 里给伙伴建议时，沿用同样的专业口径</li>
          <li>· 资料没写到的地方，它会直接说不确定，不编造</li>
        </ul>
      </section>
    </div>
  );
}
