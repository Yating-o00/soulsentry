import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Globe2, Loader2, Mic, MicOff, Send, Trash2, Upload, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { cn } from "@/lib/utils";
import BuddyModuleIcon from "@/components/buddy/BuddyModuleIcon";
import FeatureArtifact from "./FeatureArtifact";
import { useBuddyAgent, useBuddyState } from "./shared";

const MAX_MATERIALS = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.json,.html,.htm,.xlsx,.xls,.png,.jpg,.jpeg,.webp";

const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function materialDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

/**
 * 自定义搭子的智能功能入口：
 * 功能说明来自用户（或 AI 帮忙生成），执行时带上该功能专属的参考资料。
 * 对话记录落在这个搭子的领域状态里，不与其他搭子混在一起。
 */
export default function BuddyFeaturePanel({ module, buddy, tint }) {
  const queryClient = useQueryClient();
  const { call, calling } = useBuddyAgent(buddy.id);
  const { state, patchAsync } = useBuddyState(buddy.id);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [listening, setListening] = useState(false);
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const accent = tint?.[2] || "#384877";
  const isLanguage = module.mode === "language";
  const speechLang = /日语|Japanese/i.test(`${module.label} ${module.instructions}`) ? "ja-JP"
    : /韩语|Korean/i.test(`${module.label} ${module.instructions}`) ? "ko-KR"
      : /法语|French/i.test(`${module.label} ${module.instructions}`) ? "fr-FR"
        : /西班牙语|Spanish/i.test(`${module.label} ${module.instructions}`) ? "es-ES"
          : "en-US";
  const thread = Array.isArray(state?.feature_threads?.[module.id]) ? state.feature_threads[module.id] : [];
  const artifact = state?.feature_artifacts?.[module.id] && typeof state.feature_artifacts[module.id] === "object"
    ? state.feature_artifacts[module.id]
    : null;

  const { data, isLoading } = useQuery({
    queryKey: ["buddy", buddy.id, "feature-materials", module.id],
    queryFn: () => httpRequest(`/api/buddies/${buddy.id}/features/${module.id}/materials`),
    enabled: !!buddy?.id && !!module?.id,
  });
  const materials = data?.materials || [];
  const full = materials.length >= MAX_MATERIALS;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [thread.length, sending]);

  useEffect(() => () => {
    try {
      recognitionRef.current?.abort?.();
    } catch {
      // 浏览器退出时忽略语音识别清理错误
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
  }, []);

  const saveThread = async (messages, artifactPatch = undefined) => {
    // 功能回答可能很长，控制落库体积；保留最近 12 条，足够接着聊。
    const compact = messages.slice(-12).map((message) => ({
      ...message,
      content: String(message.content || "").slice(0, 2500),
    }));
    await patchAsync({
      feature_threads: { [module.id]: compact },
      ...(artifactPatch !== undefined
        ? { feature_artifacts: { [module.id]: artifactPatch } }
        : {}),
    });
  };

  const speak = (text, lang = speechLang) => {
    const clean = String(text || "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_#`>]/g, "")
      .trim();
    if (!clean) return;
    if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      toast.info("当前浏览器不支持语音朗读，可以先用文字练习");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    utterance.rate = 0.92;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      toast.info("当前浏览器不支持语音识别，先用键盘输入也可以");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = speechLang;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        let text = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          text += event.results[index][0]?.transcript || "";
        }
        if (text.trim()) setInput(text.trim().slice(0, 2000));
      };
      recognition.onerror = (event) => {
        setListening(false);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          toast.error("需要麦克风权限才能语音输入");
        } else if (event.error !== "aborted" && event.error !== "no-speech") {
          toast.error("没有听清，再说一次试试");
        }
      };
      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch (_error) {
      setListening(false);
      toast.error("语音识别启动失败，先用键盘输入也可以");
    }
  };

  const send = async (override) => {
    const text = String(typeof override === "string" ? override : input).trim();
    if (!text || sending || calling) return;
    const history = thread
      .filter((message) => message && (message.role === "user" || message.role === "assistant"))
      .slice(-8)
      .map((message) => ({
        role: message.role,
        content: String(message.content || "").slice(0, 800),
      }));
    const userMessage = { role: "user", content: text.slice(0, 2000), at: new Date().toISOString() };
    const next = [...thread, userMessage].slice(-40);
    setInput("");
    setSending(true);
    try {
      await saveThread(next);
      const result = await call({
        mode: "feature",
        payload: {
          feature_id: module.id,
          message: text.slice(0, 2000),
          history,
        },
      });
      const nextArtifact = result?.artifact && typeof result.artifact === "object"
        ? {
            ...result.artifact,
            references: Array.isArray(result.references) ? result.references.slice(0, 5) : [],
          }
        : null;
      const reply = String(
        result?.reply || result?.text || nextArtifact?.subtitle || nextArtifact?.title || ""
      ).trim();
      if (!reply && !nextArtifact) throw new Error("empty feature reply");
      const translation = isLanguage ? String(result?.translation || "").trim().slice(0, 1000) : "";
      await saveThread([
        ...next,
        {
          role: "assistant",
          content: reply || "已经按你的资料整理好了。",
          translation,
          at: new Date().toISOString(),
        },
      ], nextArtifact);
    } catch (error) {
      setInput(text);
      toast.error(error?.data?.message || error?.message || "这个功能暂时没答上来，再试一次");
    } finally {
      setSending(false);
    }
  };

  const upload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (full) {
      toast.info(`这个功能最多保留 ${MAX_MATERIALS} 份参考资料，先删掉一份再加`);
      return;
    }
    setUploading(true);
    let added = 0;
    for (const file of files.slice(0, MAX_MATERIALS - materials.length)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`「${file.name}」超过 20MB，换个小一点的文件`);
        continue;
      }
      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploaded = await httpRequest("/api/uploads", { method: "POST", body: formData });
        await httpRequest(`/api/buddies/${buddy.id}/features/${module.id}/materials`, {
          method: "POST",
          body: {
            file_url: uploaded.file_url,
            name: uploaded.file_name || file.name,
            type: uploaded.file_type || file.type,
          },
        });
        added += 1;
      } catch (error) {
        toast.error(error?.data?.message || error?.message || `「${file.name}」没能加进参考资料`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (added > 0) {
      await queryClient.invalidateQueries({ queryKey: ["buddy", buddy.id, "feature-materials", module.id] });
      toast.success(`已收下 ${added} 份参考资料，之后会优先按它来回答`);
    }
  };

  const removeMaterial = async (id) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await httpRequest(`/api/buddies/${buddy.id}/features/${module.id}/materials/${id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["buddy", buddy.id, "feature-materials", module.id] });
      toast.success("参考资料已移除");
    } catch (error) {
      toast.error(error?.data?.message || error?.message || "移除失败，再试一次");
    } finally {
      setDeletingId(null);
    }
  };

  const busy = sending || calling;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${accent}12`, color: accent }}
          >
            <BuddyModuleIcon module={module} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[15px] font-semibold text-stone-900">{module.label}</h2>
              <span className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[8px]",
                isLanguage ? "bg-[#eaf3ec] text-[#456852]" : "bg-[#eef2ff] text-[#384877]"
              )}>
                {isLanguage ? "双语口语" : "智能功能"}
              </span>
              {module.web_research !== false && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#fbf7ee] px-1.5 py-0.5 text-[8px] text-[#8a6f48]">
                  <Globe2 className="h-2.5 w-2.5" /> 联网
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-stone-400">
              {module.hint || "按你的需要，给出可以直接执行的结果。"}
            </p>
          </div>
        </div>

        {artifact && (
          <div className="mt-3">
            <FeatureArtifact
              artifact={artifact}
              tint={tint}
              featureMode={module.mode}
              onFollowup={send}
              onSpeak={speak}
            />
          </div>
        )}

        <div className="mt-3 rounded-xl border border-stone-100 bg-[#FAF9F7] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-stone-600">
              <FileText className="h-3 w-3" /> 参考资料
              <span className="font-normal text-stone-400">{materials.length}/{MAX_MATERIALS}</span>
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || full}
              className="inline-flex min-h-[26px] items-center gap-1 rounded-full border border-stone-200 bg-white px-2 text-[9px] text-stone-500 disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {uploading ? "上传中" : "上传"}
            </button>
          </div>
          {isLoading ? (
            <p className="mt-2 flex items-center gap-1 text-[10px] text-stone-400">
              <Loader2 className="h-3 w-3 animate-spin" /> 正在读资料…
            </p>
          ) : materials.length === 0 ? (
            <p className="mt-1.5 text-[10px] leading-relaxed text-stone-400">
              上传你的方案、菜单或训练资料；没有专属资料时，会参考「资料」里的内容。
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {materials.map((material) => (
                <li key={material.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5">
                  <FileText className="h-3 w-3 shrink-0 text-stone-400" />
                  <span className="min-w-0 flex-1 truncate text-[10px] text-stone-600">{material.name}</span>
                  <span className="shrink-0 text-[8px] text-stone-400">{materialDate(material.created_at)}</span>
                  <button
                    type="button"
                    onClick={() => removeMaterial(material.id)}
                    disabled={deletingId === material.id}
                    aria-label={`移除 ${material.name}`}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-stone-300 hover:bg-stone-50 hover:text-rose-500 disabled:opacity-40"
                  >
                    {deletingId === material.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => upload(event.target.files)}
          />
        </div>

        <div
          ref={scrollRef}
          className="mt-3 max-h-[min(380px,44dvh)] min-h-[110px] space-y-2.5 overflow-y-auto pr-0.5"
        >
          {thread.length === 0 ? (
            <div className="rounded-xl bg-[#FAF9F7] px-3 py-4 text-center">
              <p className="text-[11px] leading-relaxed text-stone-500">
                {isLanguage
                  ? "点麦克风说英语，或直接输入一句；我会用英语回应，并给中文翻译和表达建议。"
                  : `说说你的需求，我会按「${module.label}」的方式给出结果。`}
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {isLanguage && (
                  <button
                    type="button"
                    onClick={() => send("开始练习")}
                    className="rounded-full px-2.5 py-1 text-[9px] font-medium text-white"
                    style={{ background: accent }}
                  >
                    开始对话
                  </button>
                )}
                {(Array.isArray(module.examples) && module.examples.length > 0
                  ? module.examples
                  : isLanguage
                    ? ["开始一段点餐对话", "模拟一次面试开场", "帮我纠正这句话的说法"]
                    : []
                ).slice(0, 4).map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setInput(example)}
                    className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[9px] text-stone-500 hover:border-stone-300 hover:text-stone-700"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            thread.map((message, index) => (
              <div
                key={`${message.at || index}-${index}`}
                className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                {message.role === "user" ? (
                  <div
                    className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3 py-2 text-[12px] leading-relaxed text-white"
                    style={{ background: accent }}
                  >
                    {message.content}
                  </div>
                ) : (
                  <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-stone-100 bg-[#FAF9F7] px-3 py-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 prose prose-sm max-w-none break-words overflow-x-auto text-[12px] leading-relaxed text-stone-700 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:mb-1 prose-headings:mt-2 prose-headings:text-[13px] prose-strong:text-stone-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(message.content || "")}</ReactMarkdown>
                      </div>
                      {isLanguage && (
                        <button
                          type="button"
                          onClick={() => speak(message.content)}
                          aria-label="朗读英文"
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-white hover:text-stone-600"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {isLanguage && message.translation && (
                      <p className="mt-1.5 border-t border-stone-200/70 pt-1.5 text-[10px] leading-relaxed text-stone-500">
                        {message.translation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          {busy && (
            <div className="flex items-center gap-1.5 text-[10px] text-stone-400">
              <Loader2 className="h-3 w-3 animate-spin" /> 正在查资料并整理结果…
            </div>
          )}
        </div>

        <div className="mt-2.5 rounded-xl border border-stone-200 bg-white p-1.5">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, 2000))}
            rows={2}
            placeholder={module.placeholder || (isLanguage ? "用英语回答，或点麦克风说…" : "说说你的需求…")}
            className="w-full resize-none bg-transparent px-2 py-1 text-[12px] leading-relaxed text-stone-700 placeholder:text-stone-400 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="truncate text-[9px] text-stone-400">
              {isLanguage
                ? (listening ? "正在听，说完点一下麦克风停止" : "可朗读英文，也可点麦克风说英语")
                : (module.web_research !== false ? "优先参考资料，联网核对来源" : "优先参考上面的资料")}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              {isLanguage && (
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={busy}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-40",
                    listening
                      ? "border-rose-200 bg-rose-50 text-rose-500"
                      : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700"
                  )}
                  aria-label={listening ? "停止语音输入" : "语音输入"}
                  title={listening ? "停止语音输入" : "语音输入"}
                >
                  {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => send()}
                disabled={!input.trim() || busy}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
                style={{ background: accent }}
                aria-label={`发送给${module.label}`}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
