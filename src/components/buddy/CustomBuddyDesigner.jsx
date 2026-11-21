import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import { updateCachedUser } from "@/lib/userCache";
import Orb from "@/components/buddy/Orb";
import { BUDDY_TINTS, personaName } from "@/lib/buddies";

const EXAMPLES = [
  "摄影搭子：帮我从随手拍开始，每周一个主题，慢慢拍出自己的风格",
  "写作搭子：陪我每天写 200 字，卡住时给我一个开头，不催我",
  "理财搭子：帮我看清每月支出，先养成记账习惯，不做投资建议",
  "健身搭子：每周练三次，根据我的状态调整强度，别让我硬撑",
];

/**
 * 设计搭子：
 * 自然语言描述 → AI 生成六要素配置 → 预览 → 继续用自然语言调整 → 确认上架。
 * 只生成配置，不上架；确认后才写入自己的 custom_buddies。
 */
export default function CustomBuddyDesigner({ open, onClose, editingBuddy = null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = Boolean(editingBuddy?.id);
  const [description, setDescription] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [buddy, setBuddy] = useState(null);
  const [savedBuddy, setSavedBuddy] = useState(null);
  const [usage, setUsage] = useState(null);
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAdjustment("");
    setSavedBuddy(null);
    setUsage(null);
    setLoading(false);
    setSaving(false);
    if (editingBuddy?.id) {
      // 已上架的搭子：直接进入预览，继续用自然语言调整，保存时走 PUT 覆盖原配置
      setDescription(editingBuddy.description || "");
      setBuddy(editingBuddy);
    } else {
      setDescription("");
      setBuddy(null);
    }
    httpRequest("/api/credits/balance")
      .then((data) => setCredits(data?.ai_credits ?? null))
      .catch(() => setCredits(null));
  }, [open, editingBuddy]);

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
          ...(feedback.trim() ? { feedback: feedback.trim(), current: buddy } : {}),
        },
      });
      if (result?.buddy) {
        setAdjustment("");
        setUsage(result.usage || null);
        if (result.usage?.balance != null) {
          setCredits(result.usage.balance);
          updateCachedUser({ ai_credits: result.usage.balance });
          window.dispatchEvent(new CustomEvent("credits-updated", { detail: { credits: result.usage.balance } }));
        }
        if (result.degraded && buddy) {
          // 调整失败时不能拿兜底版覆盖用户已经满意的搭子
          toast.info("AI 暂时有点忙，这次调整没有生效，原来的设定保留着；本次不扣点数");
          return;
        }
        setBuddy(result.buddy);
        if (result.degraded) {
          toast.info("AI 暂时有点忙，先给你一个可用版本，你可以继续描述调整；本次不扣点数");
        } else if (result.usage?.charged > 0) {
          toast.success(`已按实际用量扣 ${result.usage.charged} AI 点数`);
        }
      }
    } catch (error) {
      if (error?.data?.balance != null) setCredits(error.data.balance);
      toast.error(error?.message || "设计搭子失败了，再试一次");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!buddy || saving) return;
    setSaving(true);
    try {
      const result = await httpRequest(
        isEditing ? `/api/buddies/custom/${editingBuddy.id}` : "/api/buddies/custom",
        {
          method: isEditing ? "PUT" : "POST",
          body: { buddy, description },
        }
      );
      queryClient.invalidateQueries({ queryKey: ["buddies", "mine"] });
      if (isEditing) queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSavedBuddy(result.buddy);
      toast.success(
        isEditing
          ? `${result.buddy.name} 已更新，下一次对话就会生效`
          : `${result.buddy.name} 已上架到你的搭子 Store`
      );
    } catch (error) {
      toast.error(error?.message || (isEditing ? "保存修改失败，再试一次" : "上架失败，再试一次"));
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
            {buddy && !savedBuddy && (
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
                {savedBuddy ? (isEditing ? "搭子已更新" : "搭子已上架") : buddy ? "预览你的搭子" : "设计一颗搭子"}
              </h3>
              <p className="mt-0.5 text-xs text-stone-400">
                {savedBuddy
                  ? (isEditing ? "调整已保存，资料、项目和协同都还在" : "它已经出现在你的搭子 Store 里了")
                  : buddy
                    ? "觉得哪里不对，继续用自然语言告诉心栈"
                    : "用一句自然语言，描述你想要一个怎样的搭子"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-stone-400 hover:text-stone-600">关闭</button>
        </div>

        {/* 描述 / 生成 */}
        {!buddy && !savedBuddy && (
          <div className="mt-4 space-y-3">
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={1200}
              placeholder="比如：我想要一个摄影搭子，陪我从随手拍开始，每周一个主题，慢慢拍出自己的风格。不催我，但每次都能给我一个具体的小练习。"
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
              {credits != null ? `当前余额 ${credits} 点；` : ""}会参考现在搭子的六要素结构；每次生成或调整按实际 token 扣 AI 点数（1 点 / 1000 token），AI 不可用时本次不扣点。生成后可以继续调整，确认后才上架。
            </p>
          </div>
        )}

        {/* 预览 */}
        {buddy && !savedBuddy && (
          <div className="mt-4 space-y-3">
            <div className="rounded-3xl border border-stone-200 bg-white p-4">
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

            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-3">
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

            {usage && (
              <p className="text-center text-[10px] text-stone-400">
                {usage.charged > 0
                  ? `本次消耗 ${usage.charged} AI 点数（${usage.billable_tokens || 0} token）${usage.balance != null ? `，余额 ${usage.balance} 点` : ""}`
                  : usage.billable_tokens > 0
                    ? "本次生成已完成，余额不足未扣点"
                    : "本次 AI 暂不可用，未扣点数"}
              </p>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#384877] text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? (isEditing ? "正在保存…" : "正在上架…") : (isEditing ? "保存修改" : "确认生成，上架到我的 Store")}
            </button>
            <p className="text-center text-[10px] text-stone-400">
              {isEditing ? "保存不消耗 AI 点数；只有继续让 AI 调整时才按 token 扣点。" : "上架后仍需认领，回答几个问题就会开始陪伴。"}
            </p>
          </div>
        )}

        {/* 已保存 */}
        {savedBuddy && (
          <div className="mt-5 text-center">
            <div className="flex justify-center">
              <Orb size={68} tint={Array.isArray(savedBuddy.tint) ? savedBuddy.tint : tint} />
            </div>
            <h4 className="mt-3 text-[17px] font-semibold text-stone-900">{savedBuddy.name}</h4>
            <p className="mt-1 text-[12px] leading-relaxed text-stone-500">
              {isEditing
                ? "新的设定已经保存。已上传的资料、项目和协同都保留着，下一次对话会按新的设定来。"
                : "已经出现在你的搭子 Store。现在认领它，回答几个问题就能开始使用，也可以随时在 Store 里找到它。"}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-stone-200 bg-white py-2.5 text-sm text-stone-600"
              >
                {isEditing ? "完成" : "先看看 Store"}
              </button>
              <button
                type="button"
                onClick={() => navigate(isEditing
                  ? `${createPageUrl("BuddySpace")}?buddy=${savedBuddy.id}`
                  : `${createPageUrl("BuddyClaim")}?buddy=${savedBuddy.id}`)}
                className="flex-1 rounded-full bg-[#384877] py-2.5 text-sm font-medium text-white"
              >
                {isEditing ? "进入搭子空间" : "现在认领"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
