import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { httpRequest } from "@/api/httpClient";
import Orb from "@/components/buddy/Orb";
import { PERSONAS, DEFAULT_PERSONA } from "@/lib/buddies";
import { cn } from "@/lib/utils";

// 注册后的四步身份识别：不是问卷，是真实配置——每一步的答案都直接写入主档案并立即生效
const AGE_BANDS = ["00后", "90后", "80后", "70后", "其他"];
const LIKE_OPTIONS = ["阅读", "音乐", "运动", "旅行", "美食", "电影", "游戏", "写作", "摄影", "冥想"];
const WANT_OPTIONS = [
  "帮我管日程，到点提醒",
  "情绪陪伴，随时能聊",
  "陪我学习成长，盯目标",
  "跑腿办事：订票购物运营",
  "记录生活，沉淀心签",
  "定期复盘，给我简报",
];

const STEPS = [
  { key: "age", title: "你大概是哪个年龄段？", desc: "我会调整说话的节奏和关心的议题", multi: false },
  { key: "likes", title: "平时喜欢什么？（可多选）", desc: "搭子推荐和节奏安排会参考", multi: true, options: LIKE_OPTIONS },
  { key: "wants", title: "最希望心栈帮你做什么？（可多选）", desc: "我会优先亮出这些能力", multi: true, options: WANT_OPTIONS },
  { key: "persona", title: "最后一件重要的事——你希望我用什么方式陪你？", desc: "这就是全平台的人格，之后随时可在「我的」页切换", multi: false },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [age, setAge] = useState("");
  const [likes, setLikes] = useState([]);
  const [wants, setWants] = useState([]);
  const [persona, setPersona] = useState("");
  const [saving, setSaving] = useState(false);

  const current = STEPS[step];

  const toggleMulti = (list, setList, v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const canContinue =
    current.key === "age" ? !!age
    : current.key === "likes" ? likes.length > 0
    : current.key === "wants" ? wants.length > 0
    : !!persona;

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await httpRequest("/api/buddies/profile", {
        method: "POST",
        body: {
          persona: persona || DEFAULT_PERSONA,
          id_profile: { age, likes, wants },
        },
      });
      navigate(createPageUrl("AgentIntro"));
    } catch (e) {
      toast.error(e?.message || "保存失败，请再试一次");
      setSaving(false);
    }
  };

  const next = () => {
    if (!canContinue) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  };

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col items-center px-5 pt-[max(3rem,env(safe-area-inset-top))] pb-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center"><Orb size={72} /></div>
        <h1 className="mt-4 text-center text-lg font-semibold text-[#1c1917]">让心栈认识你</h1>
        <p className="mt-1 text-center text-xs text-[#a8a29e]">四个小问题，答案会直接生效，不是问卷</p>

        {/* 进度点 */}
        <div className="mt-4 flex justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s.key}
              className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-[#384877]" : "w-1.5 bg-[#e7e5e4]")}
            />
          ))}
        </div>

        <div className="mt-6 rounded-3xl bg-[#FFFFFF] border border-[#e7e5e4] p-6 shadow-[0_1px_3px_rgba(36,36,36,0.05)]">
          <h2 className="text-[16px] font-semibold text-[#1c1917]">{current.title}</h2>
          <p className="mt-1 text-xs text-[#a8a29e]">{current.desc}</p>

          <div className="mt-4 space-y-2.5">
            {current.key === "age" && (
              <div className="flex flex-wrap gap-2">
                {AGE_BANDS.map((a) => (
                  <OptionChip key={a} active={age === a} onClick={() => setAge(a)}>{a}</OptionChip>
                ))}
              </div>
            )}

            {current.key === "likes" && (
              <div className="flex flex-wrap gap-2">
                {LIKE_OPTIONS.map((l) => (
                  <OptionChip key={l} active={likes.includes(l)} onClick={() => toggleMulti(likes, setLikes, l)}>{l}</OptionChip>
                ))}
              </div>
            )}

            {current.key === "wants" && (
              <div className="flex flex-col gap-2">
                {WANT_OPTIONS.map((w) => (
                  <button
                    key={w}
                    onClick={() => toggleMulti(wants, setWants, w)}
                    className={cn(
                      "rounded-2xl border px-4 py-2.5 text-left text-[14px] transition-all",
                      wants.includes(w)
                        ? "border-[#1c1917] bg-[#384877] text-[#FAF9F7]"
                        : "border-[#e7e5e4] bg-white text-[#57534e] hover:border-[#1c1917]"
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            )}

            {current.key === "persona" && (
              <div className="flex flex-col gap-2.5">
                {PERSONAS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPersona(p.key)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-all",
                      persona === p.key
                        ? "border-[#1c1917] bg-white ring-1 ring-[#1c1917]"
                        : "border-[#e7e5e4] bg-white hover:border-[#1c1917]"
                    )}
                  >
                    <div className="font-medium text-[#1c1917]">{p.name}</div>
                    <div className="mt-0.5 text-sm text-[#a8a29e]">{p.desc}</div>
                    <div className="mt-2 border-l-2 border-[#e7e5e4] pl-3 text-sm text-[#57534e] italic">
                      “{p.sample}”
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={next}
            disabled={!canContinue || saving}
            className="mt-6 min-h-[48px] w-full rounded-full bg-[#384877] text-[15px] font-medium text-[#FAF9F7] transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? "写入主档案…" : step < STEPS.length - 1 ? "下一步" : "认识完毕，见一见你的心栈"}
          </button>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="mt-2 w-full text-center text-xs text-[#a8a29e] hover:text-[#57534e] py-2"
            >
              返回上一步
            </button>
          )}
        </div>

        <button
          onClick={() => navigate(createPageUrl("Dashboard"))}
          className="mt-4 w-full text-center text-xs text-[#a8a29e] hover:text-[#57534e]"
        >
          先跳过，稍后再说
        </button>
      </div>
    </div>
  );
}

function OptionChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-[14px] transition-all active:scale-95",
        active
          ? "border-[#1c1917] bg-[#384877] text-[#FAF9F7]"
          : "border-[#e7e5e4] bg-white text-[#57534e] hover:border-[#1c1917]"
      )}
    >
      {children}
    </button>
  );
}
