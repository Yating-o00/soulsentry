import React, { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * 鼠标悬停高亮、点击即可直接修改的行内编辑文本。
 * multiline=false：Enter 保存，Esc 取消；multiline=true：失焦保存，Esc 取消。
 */
export default function InlineEditableText({
  value,
  onSave,
  multiline = false,
  placeholder = "点击填写...",
  className = "",
  inputClassName = "",
  required = false,
  children,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const start = () => {
    setDraft(value || "");
    setEditing(true);
  };

  const commit = async () => {
    const next = multiline ? draft : draft.trim();
    if (required && !next.trim()) {
      toast.error("内容不能为空");
      return;
    }
    if (next === (value || "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    const Tag = multiline ? "textarea" : "input";
    return (
      <div className="relative w-full">
        <Tag
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
            if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
            if (e.key === "Enter" && multiline && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
          }}
          placeholder={placeholder}
          rows={multiline ? 6 : undefined}
          className={`w-full bg-white rounded-xl border border-[#384877]/40 outline-none ring-2 ring-[#384877]/10 px-3 py-2 resize-y ${inputClassName}`}
        />
        {saving && (
          <Loader2 className="w-4 h-4 animate-spin text-[#384877] absolute right-3 top-3" />
        )}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={start}
      onKeyDown={(e) => { if (e.key === "Enter") start(); }}
      title="点击修改"
      className={`cursor-text rounded-xl -mx-1.5 px-1.5 transition-colors hover:bg-[#eef0fa] ${className}`}
    >
      {value ? children : <span className="text-slate-400">{placeholder}</span>}
    </div>
  );
}