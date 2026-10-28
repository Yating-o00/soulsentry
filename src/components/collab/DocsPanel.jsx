// 沉淀面板：文件选择器 + 编辑 / 保存新版本 / 确认文件
import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, FileText, Link2, PencilLine, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { httpRequest } from "@/api/httpClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { C, DOC_TYPE_LABELS, formatTime } from "./constants";
import { EmptyState, PanelHeader } from "./Common";

// 共同文件正文渲染：markdown 链接与裸 URL 转为可点击链接（附件沉淀后可下载）
function renderLinkedContent(content) {
  const text = String(content || "");
  const re = /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)|((?:https?:\/\/|\/uploads\/)\S+)/g;
  const parts = [];
  let last = 0;
  let match;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const label = match[1] || match[3];
    const url = match[2] || match[3];
    parts.push(
      <a key={key} href={url} target="_blank" rel="noreferrer" className="text-[#384877] underline underline-offset-2 break-all hover:opacity-80">
        {label}
      </a>
    );
    key += 1;
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function DocsPanel({ docs, taskId, onJumpToSource }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(docs[0]?.id ?? "");
  const [draftContent, setDraftContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const selected = docs.find((d) => d.id === selectedId) ?? docs[0];
  const dirty = selected ? draftContent !== (selected.content || "") : false;

  useEffect(() => {
    if (!docs.some((d) => d.id === selectedId)) setSelectedId(docs[0]?.id ?? "");
  }, [docs, taskId]);

  useEffect(() => {
    setDraftContent(selected?.content || "");
    setEditing(false);
    setExpanded(false);
  }, [selected?.id, selected?.content, selected?.version]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['collab', taskId] });
  };

  const handleSave = async () => {
    if (!selected || !dirty || saving) return;
    setSaving(true);
    try {
      await httpRequest(`/api/collab/${taskId}/docs/${selected.id}`, {
        method: "PATCH",
        body: { content: draftContent },
      });
      invalidateAll();
      toast.success(`已保存为新版本（v${selected.version + 1}）`);
    } catch (error) {
      toast.error(error?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!selected || confirming) return;
    setConfirming(true);
    try {
      if (dirty) {
        await httpRequest(`/api/collab/${taskId}/docs/${selected.id}`, {
          method: "PATCH",
          body: { content: draftContent },
        });
      }
      await httpRequest(`/api/collab/${taskId}/docs/${selected.id}/confirm`, { method: "POST" });
      setEditing(false);
      invalidateAll();
      toast.success(`「${selected.title}」已确认（v${selected.version + 1}）`);
    } catch (error) {
      toast.error(error?.message || "确认失败");
    } finally {
      setConfirming(false);
    }
  };

  const isDraft = selected?.status === "draft";
  const lineCount = (selected?.content || "").split("\n").length;

  return (
    <section id="content-docs" className="px-4 py-5 sm:px-6">
      <PanelHeader
        eyebrow="Shared memory"
        title={`主要沉淀 · ${docs.length}`}
        description="共同认可的方案、纪要与执行清单。"
      />
      {!selected ? (
        <EmptyState document title="还没有共同文件" description="在讨论里「存为文件」，或让 Agent 整理 / 生成纪要。" />
      ) : (
        <div className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor="collab-doc-select" className="sr-only">选择共同文件</label>
            <select
              id="collab-doc-select"
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="min-w-0 flex-1 rounded-md border bg-[#f7f6f2] px-3 py-2.5 text-xs font-medium outline-none focus:border-[#384877] min-h-9"
              style={{ borderColor: "#cfcdc6", color: "#45413d" }}
            >
              {docs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title} · v{doc.version}（{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}）
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors hover:border-[#384877] hover:text-[#384877] min-h-9"
              style={{ borderColor: "#d4d2cb", color: "#5b5751" }}
            >
              <PencilLine className="h-3.5 w-3.5" />{editing ? "退出编辑" : "编辑"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4" style={{ color: "#77736c" }} />
            <h3 className="text-base font-semibold" style={{ color: "#35312f" }}>{selected.title}</h3>
            <span
              className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium")}
              style={isDraft ? { backgroundColor: C.amberBg, color: C.amberInk } : { backgroundColor: C.greenBg, color: C.greenInk }}
            >
              {isDraft ? "待确认" : "已确认"}
            </span>
            <span className="font-mono text-[9px]" style={{ color: "#8a867e" }}>v{selected.version}</span>
            <span className="font-mono text-[9px]" style={{ color: "#8a867e" }}>{DOC_TYPE_LABELS[selected.doc_type] || selected.doc_type}</span>
          </div>

          <div className="mt-4 border-y py-4" style={{ borderColor: C.line }}>
            {editing ? (
              <Textarea
                aria-label="编辑共同文件内容"
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                className="min-h-56 w-full resize-y rounded-md border bg-[#f7f6f2] p-3 font-mono text-xs leading-6 outline-none focus:border-[#384877]"
                style={{ borderColor: "#cfcdc6" }}
              />
            ) : (
              <div
                className={cn("text-[13px] leading-6 whitespace-pre-wrap break-words", !expanded && "line-clamp-[12]")}
                style={{ color: "#57534d" }}
              >
                {selected.content ? renderLinkedContent(selected.content) : "（空文档）"}
              </div>
            )}
          </div>

          {!editing && lineCount > 12 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#384877] min-h-8 focus-visible:outline-none"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {expanded ? "收起全文" : "展开全文"}
            </button>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] leading-5" style={{ color: "#858179" }}>
            <span>更新于 {formatTime(selected.updated_date)}</span>
            {selected.source_comment_id && (
              <button
                type="button"
                onClick={() => onJumpToSource?.(selected.source_comment_id)}
                className="flex items-center gap-1 text-[#384877] hover:underline underline-offset-2"
              >
                <Link2 className="h-3 w-3" /> 来源讨论
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={handleSave}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors disabled:opacity-40 min-h-9"
              style={{ borderColor: "#d4d2cb", color: "#5b5751" }}
            >
              <Save className="h-3.5 w-3.5" />{saving ? "保存中…" : dirty ? "保存新版本" : "已保存"}
            </button>
            <button
              type="button"
              disabled={confirming || (!isDraft && !dirty)}
              onClick={handleConfirm}
              className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 text-xs font-medium text-[#faf9f5] transition-all disabled:opacity-40 min-h-9"
              style={{ backgroundColor: C.ink }}
            >
              <Check className="h-3.5 w-3.5" />{confirming ? "确认中…" : isDraft ? "确认文件" : "再次确认"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
