import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, FileText, Loader2, Sparkles, Upload, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import { updateCachedUser } from "@/lib/userCache";
import Orb from "@/components/buddy/Orb";
import { BUDDY_TINTS, personaName } from "@/lib/buddies";

const EXAMPLES = [
  "厨房搭子：帮我规划一周健康饮食，教我用手头食材做菜，最好能一步步指导",
  "摄影搭子：帮我从随手拍开始，每周一个主题，慢慢拍出自己的风格",
  "写作搭子：陪我每天写 200 字，卡住时给我一个开头，不催我",
  "理财搭子：帮我看清每月支出，先养成记账习惯，不做投资建议",
  "健身搭子：每周练三次，根据我的状态调整强度，别让我硬撑",
];

const MATERIAL_ACCEPT = ".pdf,.docx,.txt,.md,.csv,.json,.html,.htm,.xlsx,.xls,.png,.jpg,.jpeg,.webp";
const MATERIAL_LIMIT = 5;
const MATERIAL_MAX_SIZE = 20 * 1024 * 1024;

function DesignMaterials({ materials, existingCount = 0, uploading, onAdd, onRemove, className = "" }) {
  const inputRef = useRef(null);
  const total = existingCount + materials.length;
  const full = total >= MATERIAL_LIMIT;
  return (
    <div className={`rounded-2xl border border-stone-200 bg-white p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600">
          <FileText className="h-3.5 w-3.5 text-stone-400" />
          给它几份参考资料（可选）
        </div>
        <span className="text-[10px] tabular-nums text-stone-400">{total}/{MATERIAL_LIMIT}</span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-stone-400">
        比如菜谱、营养笔记、你的做菜心得。心栈会先读一遍，把里面的方法和标准融进它的专业能力。
      </p>
      {existingCount > 0 && (
        <p className="mt-1.5 text-[10px] text-[#384877]">这颗搭子已有 {existingCount} 份资料，会一起用于本次调整。</p>
      )}
      {materials.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {materials.map((item, index) => (
            <li key={`${item.file_url}-${index}`} className="flex items-center gap-2 rounded-xl bg-[#FAF9F7] px-2.5 py-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-stone-400" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-stone-600">{item.name}</span>
              <span className="shrink-0 text-[9px] text-stone-400">{item.chars} 字</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-white hover:text-stone-600"
                aria-label={`移除 ${item.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={MATERIAL_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files;
          onAdd(files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || full}
        className="mt-2 flex min-h-[32px] w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-stone-300 text-[11px] text-stone-500 hover:border-[#384877] hover:text-[#384877] disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? "正在读资料…" : full ? `最多 ${MATERIAL_LIMIT} 份资料` : "添加资料"}
      </button>
    </div>
  );
}

/**
 * 设计搭子：
 * 自然语言描述 → AI 生成六要素配置 → 预览 → 继续用自然语言调整 → 确认上架。
 * 只生成配置，不上架；确认后才写入自己的 custom_buddies。
 */
export default function CustomBuddyDesigner({ open, onClose, editingBuddy = null, claimed = false }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [buddy, setBuddy] = useState(null);
  // 已保存/已上架的搭子 id：有了它之后，后续保存都走 PUT，支持无限次调整
  const [activeId, setActiveId] = useState(editingBuddy?.id || null);
  const [createdNow, setCreatedNow] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedThisSession, setSavedThisSession] = useState(false);
  const [savedMaterialCount, setSavedMaterialCount] = useState(0);
  const [materials, setMaterials] = useState([]);
  const [existingMaterials, setExistingMaterials] = useState([]);
  const [materialUploading, setMaterialUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasSaved = Boolean(activeId);
  const shouldClaim = createdNow || !claimed;

  useEffect(() => {
    if (!open) return;
    setAdjustment("");
    setActiveId(editingBuddy?.id || null);
    setCreatedNow(false);
    setDirty(false);
    setSavedThisSession(false);
    setSavedMaterialCount(0);
    setMaterials([]);
    setExistingMaterials([]);
    setLoading(false);
    setSaving(false);
    setMaterialUploading(false);
    if (editingBuddy?.id) {
      // 已上架的搭子：直接进入预览，继续用自然语言调整，保存时走 PUT 覆盖原配置
      setDescription(editingBuddy.description || "");
      setBuddy(editingBuddy);
      httpRequest(`/api/buddies/${editingBuddy.id}/materials`)
        .then((data) => setExistingMaterials(data?.materials || []))
        .catch(() => setExistingMaterials([]));
    } else {
      setDescription("");
      setBuddy(null);
    }
  }, [open, editingBuddy]);

  const addMaterials = async (fileList) => {
    const room = MATERIAL_LIMIT - existingMaterials.length - materials.length;
    if (room <= 0) {
      toast.info(`最多 ${MATERIAL_LIMIT} 份参考资料`);
      return;
    }
    const files = Array.from(fileList || []).slice(0, room);
    if (files.length === 0) return;
    setMaterialUploading(true);
    const added = [];
    for (const file of files) {
      if (file.size > MATERIAL_MAX_SIZE) {
        toast.error(`「${file.name}」超过 20MB，换个小一点的文件`);
        continue;
      }
      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploaded = await httpRequest("/api/uploads", { method: "POST", body: formData });
        const inspected = await httpRequest("/api/buddies/custom/materials/inspect", {
          method: "POST",
          body: {
            file_url: uploaded.file_url,
            name: uploaded.file_name || file.name,
            type: uploaded.file_type || file.type,
          },
        });
        if (inspected?.material) added.push(inspected.material);
      } catch (error) {
        toast.error(error?.message || `「${file.name}」没能读出来`);
      }
    }
    if (added.length > 0) setMaterials((current) => [...current, ...added].slice(0, MATERIAL_LIMIT));
    setMaterialUploading(false);
  };

  if (!open) return null;

  const design = async (feedback = "") => {
    const text = description.trim();
    if (text.length < 4) {
      toast.error("先多描述一点你想要什么");
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const result = await httpRequest("/api/buddies/custom/design", {
        method: "POST",
        body: {
          description: text,
          materials,
          ...(feedback.trim() ? { feedback: feedback.trim(), current: buddy } : {}),
        },
      });
      if (result?.buddy) {
        setAdjustment("");
        // 左侧点数由全局余额自动刷新，不在设计流程里提示扣费
        if (result.usage?.balance != null) {
          updateCachedUser({ ai_credits: result.usage.balance });
          window.dispatchEvent(new CustomEvent("credits-updated", { detail: { credits: result.usage.balance } }));
        }
        if (result.degraded && buddy) {
          // 调整失败时不能拿兜底版覆盖用户已经满意的搭子
          toast.info("AI 暂时有点忙，这次调整没有生效，原来的设定保留着");
          return;
        }
        setBuddy(result.buddy);
        setDirty(true);
        if (result.degraded) {
          toast.info("AI 暂时有点忙，先给你一个可用版本，你可以继续描述调整");
        }
      }
    } catch (error) {
      toast.error(error?.message || "设计搭子失败了，再试一次");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!buddy || saving) return;
    setSaving(true);
    const isUpdate = Boolean(activeId);
    try {
      const result = await httpRequest(
        isUpdate ? `/api/buddies/custom/${activeId}` : "/api/buddies/custom",
        {
          method: isUpdate ? "PUT" : "POST",
          body: { buddy, description, materials },
        }
      );
      queryClient.invalidateQueries({ queryKey: ["buddies", "mine"] });
      if (isUpdate) queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["buddy", result.buddy?.id || activeId, "materials"] });
      setActiveId(result.buddy.id);
      if (!isUpdate) setCreatedNow(true);
      setBuddy(result.buddy);
      setDirty(false);
      setSavedThisSession(true);
      setSavedMaterialCount(result.materials_added || 0);
      setMaterials([]);
      // 刷新资料列表，连续调整时资料计数仍然准确
      httpRequest(`/api/buddies/${result.buddy.id}/materials`)
        .then((data) => setExistingMaterials(data?.materials || []))
        .catch(() => {});
      toast.success(
        isUpdate
          ? `${result.buddy.name} 已更新，后续对话会按新设定来`
          : `${result.buddy.name} 已上架到你的搭子 Store，可继续调整`
      );
    } catch (error) {
      toast.error(error?.message || (isUpdate ? "保存修改失败，再试一次" : "上架失败，再试一次"));
    } finally {
      setSaving(false);
    }
  };

  const tint = Array.isArray(buddy?.tint) ? buddy.tint : BUDDY_TINTS.study;
  // 预览计划时用每个问题的第一个选项当示例答案，避免把 {goal} 这类占位符直接露给用户
  const sampleAnswers = Object.fromEntries(
    (buddy?.questions || []).map((q) => [q.key, (q.chips || [])[0] || "你的目标"])
  );
  const previewPlan = (value) =>
    String(value || "").replace(/\{([a-z0-9_]+)\}/gi, (_, key) => sampleAnswers[key] || "你的计划");

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-[#384877]/45 p-0 sm:items-center sm:p-5" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-[#FAF9F7] p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {buddy && !hasSaved && (
              <button
                type="button"
                onClick={() => { setBuddy(null); setAdjustment(""); }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                aria-label="返回描述"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h3 className="text-lg font-semibold text-stone-900">
                {buddy ? (hasSaved ? "预览与调整" : "预览你的搭子") : "设计一颗搭子"}
              </h3>
              <p className="mt-0.5 text-xs text-stone-400">
                {buddy
                  ? hasSaved
                    ? "继续用自然语言调整，保存后立即生效"
                    : "觉得哪里不对，继续用自然语言告诉心栈"
                  : "用一句自然语言，描述你想要一个怎样的搭子"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-stone-400 hover:text-stone-600">关闭</button>
        </div>

        {/* 描述 / 生成 */}
        {!buddy && (
          <div className="mt-4 space-y-3">
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={1200}
              placeholder="比如：我想要一个厨房搭子，帮我规划一周健康饮食，教我用冰箱里现有的食材做菜；我有些菜谱和营养笔记，也可以给它参考。"
              className="w-full resize-none rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-relaxed text-stone-800 outline-none focus:border-[#384877]"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setDescription(example)}
                  className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-500 hover:border-[#384877] hover:text-[#384877]"
                >
                  {example.split("：")[0]}
                </button>
              ))}
            </div>
            <DesignMaterials
              materials={materials}
              existingCount={existingMaterials.length}
              uploading={materialUploading}
              onAdd={addMaterials}
              onRemove={(index) => setMaterials((current) => current.filter((_, i) => i !== index))}
            />
            <button
              type="button"
              onClick={() => design("")}
              disabled={loading || description.trim().length < 4}
              className="mt-1 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#384877] text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {loading ? "正在理解你的想法…" : "让心栈设计"}
            </button>
            <p className="text-center text-[10px] leading-relaxed text-stone-400">
              心栈会按这个领域真正要做的事，设计它的专业能力、计划和对话方式；生成后可以继续调整，确认后才上架。
            </p>
          </div>
        )}

        {/* 预览与调整：调整区放在顶部，随时可以继续用自然语言改 */}
        {buddy && (
          <div className="mt-4 flex flex-col gap-3">
            {hasSaved && savedThisSession && (
              <div className={`order-1 rounded-2xl border px-3 py-2.5 text-[11px] leading-relaxed ${
                dirty
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}>
                {dirty
                  ? "有未保存的调整，确认后点「保存修改」。"
                  : createdNow
                    ? "已上架到你的搭子 Store。可以继续用自然语言调整，改完再保存。"
                    : "修改已保存。可以继续用自然语言调整，改完再保存。"}
                {!dirty && savedMaterialCount > 0 ? ` 新增的 ${savedMaterialCount} 份资料已收进它的「资料」里。` : ""}
              </div>
            )}
            <div className="order-5 rounded-3xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <Orb size={52} tint={tint} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="truncate text-[17px] font-semibold text-stone-900">{buddy.name}</h4>
                    <span className="shrink-0 rounded-full bg-[#eef2ff] px-1.5 py-0.5 text-[9px] text-[#384877]">我的设计</span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-stone-500">{buddy.slogan}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2.5 text-[12px] leading-relaxed">
                <div>
                  <span className="text-[10px] tracking-widest text-stone-400">适合谁</span>
                  <p className="mt-0.5 text-stone-600">{buddy.forWhom}</p>
                </div>
                {(buddy.abilities || []).length > 0 && (
                  <div>
                    <span className="text-[10px] tracking-widest text-stone-400">它能帮你</span>
                    <ul className="mt-1 space-y-1">
                      {(buddy.abilities || []).map((ability) => (
                        <li key={ability} className="flex items-start gap-1.5 text-stone-700">
                          <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: tint[1] }} />
                          {ability}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <span className="text-[10px] tracking-widest text-stone-400">陪伴动作</span>
                  <ul className="mt-1 space-y-1">
                    {(buddy.actions || []).map((action) => (
                      <li key={action} className="flex items-start gap-1.5 text-stone-600">
                        <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: tint[2] }} />
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[#FAF9F7] p-2.5">
                    <div className="text-[10px] text-stone-400">它会记住</div>
                    <p className="mt-0.5 text-[11px] text-stone-600">{buddy.memory}</p>
                  </div>
                  <div className="rounded-xl bg-[#FAF9F7] p-2.5">
                    <div className="text-[10px] text-stone-400">关系时长</div>
                    <p className="mt-0.5 text-[11px] text-stone-600">{buddy.duration}</p>
                  </div>
                </div>
                <div className="rounded-xl bg-[#F5F7FC] p-2.5">
                  <div className="text-[10px] text-stone-400">默认陪伴方式</div>
                  <p className="mt-0.5 text-[11px] text-stone-600">{personaName(buddy.defaultPersona)}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-stone-400">{buddy.expertise}</p>
                </div>
                {buddy.plan?.title && (
                  <div className="rounded-xl bg-[#FAF9F7] p-2.5">
                    <div className="text-[10px] text-stone-400">计划样式</div>
                    <p className="mt-0.5 text-[12px] font-medium text-stone-700">{previewPlan(buddy.plan.title)}</p>
                    <ul className="mt-1 space-y-0.5">
                      {(buddy.plan.lines || []).slice(0, 3).map((line) => (
                        <li key={line} className="text-[10px] text-stone-500">· {previewPlan(line)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(buddy.questions || []).length > 0 && (
                  <div>
                    <div className="text-[10px] tracking-widest text-stone-400">认领时会问</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {buddy.questions.map((q) => (
                        <span key={q.key} className="rounded-full bg-[#FAF9F7] px-2 py-1 text-[10px] text-stone-500">{q.ask}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DesignMaterials
              className="order-6"
              materials={materials}
              existingCount={existingMaterials.length}
              uploading={materialUploading}
              onAdd={addMaterials}
              onRemove={(index) => setMaterials((current) => current.filter((_, i) => i !== index))}
            />
            <p className="order-7 text-center text-[10px] text-stone-400">
              新加的资料会随保存留在搭子里；如果想让它们也融入能力设计，再加一句调整让它重读一遍。
            </p>

            <div className="order-2 rounded-2xl border border-dashed border-stone-300 bg-white p-3">
              <div className="text-[11px] text-stone-500">想改哪里？继续用自然语言说</div>
              <textarea
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
                rows={2}
                maxLength={600}
                placeholder="比如：名字再温柔一点；不要每天提醒；加一个「每周复盘」的动作；把计划改成 14 天…"
                className="mt-2 w-full resize-none rounded-xl border border-stone-200 bg-[#FAF9F7] p-3 text-[12px] leading-relaxed text-stone-700 outline-none focus:border-[#384877]"
              />
              <button
                type="button"
                onClick={() => design(adjustment)}
                disabled={loading || !adjustment.trim()}
                className="mt-2 flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-full border border-[#384877] text-[12px] font-medium text-[#384877] disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {loading ? "正在调整…" : "继续调整"}
              </button>
            </div>

            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="order-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#384877] text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving
                ? (hasSaved ? "正在保存…" : "正在上架…")
                : (hasSaved ? "保存修改" : "确认生成，上架到我的 Store")}
            </button>
            <p className="order-4 text-center text-[10px] text-stone-400">
              {hasSaved
                ? "保存后，下一次对话就会按新的设定来；还可以继续调整。"
                : "上架后仍需认领，回答几个问题就会开始陪伴。"}
            </p>
            {hasSaved && (
              <div className="order-8 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-full border border-stone-200 bg-white py-2.5 text-sm text-stone-600"
                >
                  完成
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(shouldClaim
                      ? `${createPageUrl("BuddyClaim")}?buddy=${activeId}`
                      : `${createPageUrl("BuddySpace")}?buddy=${activeId}`);
                  }}
                  className="flex-1 rounded-full bg-[#384877] py-2.5 text-sm font-medium text-white"
                >
                  {shouldClaim ? "现在认领" : "进入搭子空间"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
