import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock3, ExternalLink, Globe2, Lightbulb, Sparkles, Volume2 } from "lucide-react";

const domainOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * 智能功能的结构化结果卡：
 * 用图文头图 + 横向方案卡 + 可勾选操作步骤 + 来源卡片来呈现，
 * 避免把可执行的内容铺成一大段纯文字。
 */
export default function FeatureArtifact({ artifact, tint, featureMode = "guide", onFollowup, onSpeak }) {
  const [doneSteps, setDoneSteps] = useState(() => new Set());
  const accent = tint?.[2] || "#384877";
  const cards = Array.isArray(artifact?.cards) ? artifact.cards : [];
  const steps = Array.isArray(artifact?.steps) ? artifact.steps : [];
  const tips = Array.isArray(artifact?.tips) ? artifact.tips : [];
  const followups = Array.isArray(artifact?.followups) ? artifact.followups : [];
  const references = (Array.isArray(artifact?.references) ? artifact.references : [])
    .filter((reference) => reference?.url);
  const phrases = (Array.isArray(artifact?.phrases) ? artifact.phrases : [])
    .filter((phrase) => phrase?.en || phrase?.zh);
  const feedback = artifact?.feedback && typeof artifact.feedback === "object" ? artifact.feedback : null;
  const languageMode = featureMode === "language" || phrases.length > 0 || Boolean(feedback);
  const heroImage = references.find((reference) => reference.image)?.image || "";
  const doneCount = steps.filter((_, index) => doneSteps.has(index)).length;
  const progress = steps.length ? (doneCount / steps.length) * 100 : 0;

  useEffect(() => {
    setDoneSteps(new Set());
  }, [artifact]);

  const toggleStep = (index) => {
    setDoneSteps((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const badges = useMemo(
    () => (Array.isArray(artifact?.badges) ? artifact.badges.filter(Boolean) : []),
    [artifact]
  );

  if (!artifact) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div
        className="relative overflow-hidden px-4 pb-3.5 pt-4 text-white"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}d9 62%, #1f2d4d 100%)` }}
      >
        {heroImage && (
          <img
            src={heroImage}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover opacity-45"
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
        )}
        <div className="absolute -right-6 -top-10 h-28 w-28 rounded-full border border-white/15" />
        <div className="absolute -bottom-12 left-20 h-24 w-24 rounded-full bg-white/5" />
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[9px] tracking-[0.18em] text-white/65">
            <Sparkles className="h-3 w-3" /> 功能结果
          </div>
          <h3 className="mt-1.5 text-[18px] font-semibold leading-snug">{artifact.title}</h3>
          {artifact.subtitle && <p className="mt-1 text-[11px] leading-relaxed text-white/80">{artifact.subtitle}</p>}
          {languageMode && artifact.scenario && (
            <p className="mt-1 text-[10px] leading-relaxed text-white/65">场景：{artifact.scenario}</p>
          )}
          {badges.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {badges.map((badge) => (
                <span key={badge} className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[9px] text-white/90">
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3.5 p-3.5">
        {languageMode && phrases.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10px] tracking-widest text-stone-400">双语表达</div>
            <div className="space-y-1.5">
              {phrases.map((phrase, index) => (
                <div key={`${phrase.en}-${index}`} className="rounded-xl border border-stone-100 bg-[#FAF9F7] p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium leading-snug text-stone-800">{phrase.en}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">{phrase.zh}</p>
                      {phrase.tip && <p className="mt-1 text-[9px] leading-relaxed text-stone-400">{phrase.tip}</p>}
                    </div>
                    {phrase.en && (
                      <button
                        type="button"
                        onClick={() => onSpeak?.(phrase.en)}
                        aria-label={`朗读 ${phrase.en}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-stone-400 hover:text-stone-700"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {languageMode && feedback && (
          <div className="space-y-1.5">
            <div className="text-[10px] tracking-widest text-stone-400">本轮反馈</div>
            {feedback.good && (
              <div className="rounded-xl bg-[#eef6ef] px-3 py-2">
                <span className="text-[9px] font-medium text-[#456852]">做得好</span>
                <p className="mt-0.5 text-[10px] leading-relaxed text-stone-600">{feedback.good}</p>
              </div>
            )}
            {feedback.improve && (
              <div className="rounded-xl bg-[#fbf7ee] px-3 py-2">
                <span className="text-[9px] font-medium text-[#8a6f48]">可以更好</span>
                <p className="mt-0.5 text-[10px] leading-relaxed text-stone-600">{feedback.improve}</p>
              </div>
            )}
            {feedback.next && (
              <div className="rounded-xl bg-[#eef2f8] px-3 py-2">
                <span className="text-[9px] font-medium text-[#4d6180]">下一步</span>
                <p className="mt-0.5 text-[10px] leading-relaxed text-stone-600">{feedback.next}</p>
              </div>
            )}
          </div>
        )}

        {cards.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10px] tracking-widest text-stone-400">方案参考</div>
            <div className="flex snap-x gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {cards.map((card, index) => (
                <article
                  key={`${card.title}-${index}`}
                  className="min-w-[190px] max-w-[230px] shrink-0 snap-start rounded-xl border border-stone-100 bg-[#FAF9F7] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[12px] font-semibold leading-snug text-stone-800">{card.title}</h4>
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[9px] text-stone-400">
                      {index + 1}
                    </span>
                  </div>
                  {card.subtitle && <p className="mt-0.5 text-[9px] text-stone-500">{card.subtitle}</p>}
                  {Array.isArray(card.tags) && card.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {card.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white px-1.5 py-0.5 text-[8px] text-stone-500">{tag}</span>
                      ))}
                    </div>
                  )}
                  {card.body && <p className="mt-1.5 text-[10px] leading-relaxed text-stone-600">{card.body}</p>}
                </article>
              ))}
            </div>
          </div>
        )}

        {steps.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] tracking-widest text-stone-400">操作步骤</div>
              <span className="text-[9px] text-stone-400">{doneCount}/{steps.length}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: accent }} />
            </div>
            <div className="mt-2 space-y-1.5">
              {steps.map((step, index) => {
                const done = doneSteps.has(index);
                return (
                  <button
                    key={`${step.title}-${index}`}
                    type="button"
                    onClick={() => toggleStep(index)}
                    className="flex w-full items-start gap-2.5 rounded-xl border border-stone-100 bg-white px-2.5 py-2 text-left transition-colors hover:border-stone-200"
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
                      style={done ? { background: accent, borderColor: accent } : { borderColor: "#d6d3d1" }}
                    >
                      {done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[11px] font-medium ${done ? "text-stone-400 line-through" : "text-stone-700"}`}>
                        {step.title}
                      </span>
                      {step.detail && (
                        <span className={`mt-0.5 block text-[10px] leading-relaxed ${done ? "text-stone-300" : "text-stone-500"}`}>
                          {step.detail}
                        </span>
                      )}
                    </span>
                    {step.minutes != null && (
                      <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-[8px] text-stone-400">
                        <Clock3 className="h-2.5 w-2.5" /> {step.minutes} 分
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tips.length > 0 && (
          <div className="rounded-xl bg-[#fbf7ee] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#8a6f48]">
              <Lightbulb className="h-3 w-3" /> 关键提醒
            </div>
            <ul className="mt-1 space-y-1">
              {tips.map((tip) => (
                <li key={tip} className="text-[10px] leading-relaxed text-stone-600">· {tip}</li>
              ))}
            </ul>
          </div>
        )}

        {followups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {followups.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => onFollowup?.(question)}
                className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[9px] text-stone-500 hover:border-stone-300 hover:text-stone-700"
              >
                {question}
              </button>
            ))}
          </div>
        )}

        {references.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-widest text-stone-400">
              <Globe2 className="h-3 w-3" /> 参考来源
            </div>
            <div className="space-y-1">
              {references.slice(0, 4).map((reference) => (
                <a
                  key={reference.url}
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-stone-100 bg-white px-2 py-1.5 transition-colors hover:border-stone-200"
                >
                  {reference.image ? (
                    <img
                      src={reference.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 shrink-0 rounded-lg object-cover"
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FAF9F7] text-stone-400">
                      <Globe2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] text-stone-700">{reference.title || domainOf(reference.url)}</span>
                    <span className="block truncate text-[8px] text-stone-400">{domainOf(reference.url)}</span>
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-stone-300" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
