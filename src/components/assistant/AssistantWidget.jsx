// 心栈小助手（Web 端）：右下角机器人入口 + 持续对话面板
// - 对话历史走 /api/companion（老后端自动降级 /api/chat，仅当次有效）
// - 两类提案，用户确认后才落库：
//   创建提案（约定/心签/链接/智能规划）与动作提案（勾掉子约定、改约定/心签内容等）
// - 确认执行后失效 react-query 缓存，产品各页面数据即时刷新
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { httpRequest } from "@/api/httpClient";
import { Bot } from "lucide-react";
import assistantAvatar from "@/assets/xinzhan-orb.jpg";

// 小助手品牌图标：主题色打底 + 白色图标（浮动入口/面板内使用；今日页对话保留心栈 orb）
function BrandBot({ size = 32, icon = 16, className = "", style = {} }) {
  return (
    <span
      className={`rounded-full inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, background: "#384877", ...style }}
    >
      <Bot style={{ width: icon, height: icon, color: "#fff" }} />
    </span>
  );
}

const TYPE_LABEL = { task: "约定", heart: "心签", link: "链接", plan: "智能规划" };
const TYPE_ICON = { task: "🤝", heart: "💌", link: "🔗", plan: "🗓️" };

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? hm : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

function extractUrl(text) {
  const m = String(text || "").match(/https?:\/\/[^\s"'，。）)]+/i);
  return m ? m[0] : null;
}

function detectLedgerLike(t) {
  const s = String(t || "");
  const moneyHits = (s.match(/\d+(?:\.\d{1,2})?\s*(?:元|块|¥|RMB|rmb)/g) || []).length;
  const consumeWords = /(饭|餐|咖啡|奶茶|外卖|超市|买菜|打车|地铁|火车|机票|房租|水电|电影|游戏|会员|充值|门票|旅行|酒店|工资|报销|退款|红包|转账|购物|淘宝|京东|拼多多|衣服|鞋|数码|手机|耳机)/.test(s);
  if (moneyHits >= 2) return true;
  if (moneyHits >= 1 && consumeWords) return true;
  return false;
}

export default function AssistantWidget({ inline = false, newUser = false, summary = "" }) {
  const queryClient = useQueryClient();
  // inline 模式：内嵌在首页（通用 Agent 对话层），无浮动按钮、面板常开
  const [open, setOpen] = useState(inline);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // 创建提案
  const [actions, setActions] = useState(null); // 动作提案
  const [acting, setActing] = useState(false);
  const [unread, setUnread] = useState(0);
  const supportedRef = useRef(true);
  const messagesRef = useRef([]);
  const scrollRef = useRef(null);
  const lastIdRef = useRef("");

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const appendMessage = useCallback((m) => {
    messagesRef.current = [...messagesRef.current, m];
    setMessages(messagesRef.current);
    lastIdRef.current = m.id;
  }, []);

  const markUnsupported = useCallback(() => {
    supportedRef.current = false;
  }, []);

  // ── 数据 ──
  const fetchHistory = useCallback(async ({ quiet = false } = {}) => {
    if (!supportedRef.current) return;
    try {
      const list = await httpRequest("/api/companion/messages?limit=100");
      if (!Array.isArray(list)) return;
      if (quiet && list.length && list[list.length - 1].id === lastIdRef.current) return;
      messagesRef.current = list;
      setMessages(list);
      if (list.length) lastIdRef.current = list[list.length - 1].id;
      httpRequest("/api/companion/read", { method: "POST", body: {} }).catch(() => {});
      setUnread(0);
    } catch (err) {
      if (err?.status === 404) markUnsupported();
    }
  }, [markUnsupported]);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await httpRequest("/api/companion/unread");
      setUnread(res?.count || 0);
    } catch (_err) {
      // 老后端/网络异常：不显示角标
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    const timer = setInterval(fetchUnread, 30000);
    return () => clearInterval(timer);
  }, [fetchUnread]);

  useEffect(() => {
    if (!open) return undefined;
    fetchHistory().then(scrollToBottom);
    const timer = setInterval(() => fetchHistory({ quiet: true }), 10000);
    return () => clearInterval(timer);
  }, [open, fetchHistory, scrollToBottom]);

  // ── 发送 ──
  const sendViaLegacyChat = async (t, lastExtracted) => {
    const history = messagesRef.current
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-29)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1500) }));
    const res = await httpRequest("/api/chat", {
      method: "POST",
      body: { messages: history, last_extracted: lastExtracted || undefined }
    });
    const reply = String(res?.reply || "").trim() || "我在听，你继续说～";
    appendMessage({ id: `local-a-${Date.now()}`, role: "assistant", content: reply, kind: "chat", created_date: new Date().toISOString() });
    setPending(res?.extracted || null);
    setActions(null);
    scrollToBottom();
    return true;
  };

  const sendText = useCallback(async (text, lastExtracted = null) => {
    const t = String(text || "").trim();
    if (!t || busy) return false;
    setBusy(true);
    const optimistic = { id: `local-${Date.now()}`, role: "user", content: t, kind: "chat", created_date: new Date().toISOString() };
    appendMessage(optimistic);
    scrollToBottom();
    try {
      if (supportedRef.current) {
        try {
          const res = await httpRequest("/api/companion/messages", {
            method: "POST",
            body: { content: t, last_extracted: lastExtracted || undefined }
          });
          if (res?.reply) {
            const next = [...messagesRef.current.filter((m) => m.id !== optimistic.id), res.message || optimistic, res.reply];
            messagesRef.current = next;
            setMessages(next);
            lastIdRef.current = res.reply.id;
          }
          setPending(res?.extracted || null);
          setActions(Array.isArray(res?.actions) && res.actions.length > 0 ? res.actions : null);
          scrollToBottom();
          return true;
        } catch (err) {
          if (err?.status !== 404) throw err;
          markUnsupported();
        }
      }
      return await sendViaLegacyChat(t, lastExtracted);
    } catch (_err) {
      appendMessage({ id: `local-err-${Date.now()}`, role: "assistant", content: "网络好像不太顺…等下再跟我说一次好吗？", kind: "chat", created_date: new Date().toISOString() });
      scrollToBottom();
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, appendMessage, markUnsupported, scrollToBottom]);

  const send = async () => {
    const t = input.trim();
    if (!t) return;
    const ok = await sendText(t, pending);
    if (ok) setInput("");
  };

  // 「不对，再聊聊」：创建提案收回，继续对话
  const rejectPending = () => {
    if (!pending || busy) return;
    const last = pending;
    setPending(null);
    sendText("这个不对，我想改一下", last);
  };

  // ── 创建提案确认：真正落库 ──
  const confirmCreate = async () => {
    if (!pending || acting) return;
    setActing(true);
    try {
      let doneLabel = "";
      let planChildCount = 0;
      if (pending.type === "task") {
        const firstUserText = messagesRef.current.find((m) => m.role === "user")?.content || "";
        await httpRequest("/api/tasks", {
          method: "POST",
          body: {
            title: pending.title,
            description: pending.description || firstUserText || undefined,
            category: pending.category || "personal",
            priority: pending.priority || "medium",
            due_at: pending.due_at || undefined
          }
        });
        doneLabel = pending.title;
      } else if (pending.type === "heart") {
        const isLedger = detectLedgerLike(pending.content);
        await httpRequest("/api/notes", {
          method: "POST",
          body: {
            title: isLedger ? "账本" : "心签",
            content: pending.content,
            plain_text: pending.content,
            source_type: isLedger ? "ledger" : "emotion",
            tags: isLedger ? ["账本", "心签"] : ["情绪", "心签"]
          }
        });
        doneLabel = isLedger ? "账本" : "心签";
      } else if (pending.type === "link") {
        const url = extractUrl(pending.text) || "";
        await httpRequest("/api/notes", {
          method: "POST",
          body: {
            title: pending.text.slice(0, 60).replace(url, "").trim() || "外部链接",
            content: pending.text,
            tags: ["外部信息", "链接"]
          }
        });
        doneLabel = "链接";
      } else if (pending.type === "plan") {
        const pl = pending.plan || {};
        const p = pl.parent || {};
        const children = Array.isArray(pl.children) ? pl.children : [];
        const parentTask = await httpRequest("/api/tasks", {
          method: "POST",
          body: {
            title: p.title,
            description: p.description || undefined,
            category: p.category || "personal",
            priority: p.priority || "medium",
            status: "pending"
          }
        });
        const parentId = parentTask?.id || parentTask?.data?.id;
        for (const c of children) {
          await httpRequest("/api/tasks", {
            method: "POST",
            body: {
              title: c.title,
              description: c.description || undefined,
              category: p.category || "personal",
              priority: p.priority || "medium",
              parent_task_id: parentId,
              reminder_time: `${c.date}T${c.start_time}:00+08:00`,
              end_time: `${c.date}T${c.end_time}:00+08:00`,
              tags: ["智能规划"]
            }
          }).catch(() => {});
        }
        doneLabel = p.title;
        planChildCount = children.length;
      } else {
        return;
      }
      const echo = planChildCount
        ? `「${doneLabel}」的智能规划已生成 ✓ 共 ${planChildCount} 条子约定排在接下来的日子里。`
        : `「${doneLabel}」已为你记下了 ✓ 还想聊点什么吗？`;
      setPending(null);
      await appendEcho(echo);
      queryClient.invalidateQueries();
    } catch (err) {
      appendMessage({ id: `local-err-${Date.now()}`, role: "assistant", content: `生成时出了点问题：${err?.message || "请再试一次"}`, kind: "chat", created_date: new Date().toISOString() });
    } finally {
      setActing(false);
    }
  };

  // ── 动作提案确认：服务端校验权限并落库 ──
  const confirmActions = async () => {
    if (!actions?.length || acting) return;
    setActing(true);
    try {
      const res = await httpRequest("/api/companion/actions", {
        method: "POST",
        body: { actions }
      });
      const results = Array.isArray(res?.results) ? res.results : [];
      const okList = results.filter((r) => r.ok);
      const failList = results.filter((r) => !r.ok);
      const lines = [];
      if (okList.length > 0) lines.push(okList.map((r) => `✓ ${r.label || "已完成"}`).join("\n"));
      if (failList.length > 0) lines.push(failList.map((r) => `✗ ${r.label || "有一项"}：${r.error || "没成功"}`).join("\n"));
      const echo = lines.join("\n") || "处理好了。";
      setActions(null);
      await appendEcho(echo);
      queryClient.invalidateQueries();
    } catch (err) {
      appendMessage({ id: `local-err-${Date.now()}`, role: "assistant", content: `执行时出了点问题：${err?.message || "请再试一次"}`, kind: "chat", created_date: new Date().toISOString() });
    } finally {
      setActing(false);
    }
  };

  const appendEcho = async (echo) => {
    if (supportedRef.current) {
      const res = await httpRequest("/api/companion/messages", {
        method: "POST",
        body: { assistant_echo: echo }
      }).catch(() => null);
      if (res?.message) {
        appendMessage(res.message);
      }
    } else {
      appendMessage({ id: `local-e-${Date.now()}`, role: "assistant", content: echo, kind: "chat", created_date: new Date().toISOString() });
    }
    scrollToBottom();
  };

  // ── 渲染 ──
  const renderMessage = (m) => {
    const mine = m.role === "user";
    return (
      <div key={m.id} className={`flex items-start gap-2 px-4 mb-4 ${mine ? "flex-row-reverse" : ""}`}>
        {!mine && (
          inline ? (
            <img
              src={assistantAvatar}
              alt="心栈小助手"
              className="assistant-avatar w-8 h-8 rounded-full shrink-0 object-cover"
            />
          ) : (
            <BrandBot size={32} icon={16} className="assistant-avatar" />
          )
        )}
        <div className={`max-w-[78%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
          {m.kind === "proactive" && (
            <span className="text-[10px] mb-1" style={{ color: "#384877" }}>小助手主动来聊</span>
          )}
          <div
            className="rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-all"
            style={
              mine
                ? { background: "#384877", color: "#fff", borderTopRightRadius: 6 }
                : { background: "#eef1f9", color: "#1c1c1e", border: "1px solid #dbe3f2", borderTopLeftRadius: 6 }
            }
          >
            {m.content}
          </div>
          <span className="text-[10px] mt-1" style={{ color: "#9ca0a8" }}>{fmtTime(m.created_date)}</span>
        </div>
      </div>
    );
  };

  // 面板主体（浮动与内嵌两种形态共用）
  const panelBody = (
    <>
      {/* 头部（浮动形态；内嵌形态用问候区代替） */}
      {!inline && (
      <div className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ background: "#fff", borderBottom: "1px solid #e8ecef" }}>
        <BrandBot size={36} icon={18} className={`assistant-avatar ${busy ? "assistant-avatar--active" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold" style={{ color: "#1c1c1e" }}>心栈小助手</div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: busy ? "#f0c36d" : "#1f9d55" }} />
            <span className="text-[11px]" style={{ color: "#63666e" }}>
              {busy ? "正在思考…" : "24 小时陪伴中 · 说事、记事、办事都可以找我"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-lg px-2"
          style={{ color: "#9ca0a8", background: "none", border: "none", cursor: "pointer" }}
          aria-label="收起"
        >
          ×
        </button>
      </div>
      )}

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4" style={{ minHeight: 0 }}>
        {messages.length === 0 && !inline && (
          <div className="flex flex-col items-center px-6 pb-2">
            <BrandBot size={80} icon={38} className="assistant-avatar mb-3" />
            <div className="rounded-2xl px-4 py-3 text-[13px] leading-relaxed" style={{ background: "#eef1f9", border: "1px solid #dbe3f2", color: "#384877" }}>
              你好呀，我是心栈小助手。想记的、想定的都可以说给我听；也可以直接让我改东西——比如「勾掉子约定『订酒店』」「把『周报』的标题改成『周报第45周』」，确认后我就会动手。
            </div>
          </div>
        )}
        {inline && (
          /* 问候（常驻页首）：新用户给引导，老用户给今日总结；之后的提醒与沟通都在本窗口继续 */
          <div className="px-4 pb-3">
            <div className="flex items-start gap-3">
              <img src={assistantAvatar} alt="心栈" className="assistant-avatar w-10 h-10 rounded-full object-cover shrink-0 mt-0.5" style={{ border: "2px solid #d8e0f0" }} />
              <p className="text-[15px] leading-relaxed" style={{ color: "#1c1c1e" }}>
                {newUser
                  ? "今天想做点什么？日程、情绪、随便聊聊都可以找我；你的搭子们也在各自的岗位上待命。"
                  : summary || "欢迎回来。想从哪件开始，还是先说点别的？"}
              </p>
            </div>
          </div>
        )}
        {messages.map(renderMessage)}
        {busy && (
          <div className="flex items-center gap-2 px-4 mb-4">
            {inline ? (
              <img src={assistantAvatar} alt="" className="assistant-avatar assistant-avatar--active w-8 h-8 rounded-full shrink-0 object-cover" />
            ) : (
              <BrandBot size={32} icon={16} className="assistant-avatar assistant-avatar--active" />
            )}
            <div className="rounded-2xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "#eef1f9", border: "1px solid #dbe3f2", color: "#384877" }}>
              正在输入…
            </div>
          </div>
        )}
      </div>

      {inline && (
        /* 案例模版：固定在输入区上方（不随消息滚动、不随历史加载消失），品牌蓝描边 */
        <div className="shrink-0 px-4 pt-2 pb-1" style={{ background: "#FAF9F7", borderTop: "1px solid #efeae4" }}>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] tracking-widest font-medium" style={{ color: "#384877" }}>和心栈说事</span>
            <span className="text-[10px]" style={{ color: "#c4c6cc" }}>不用认领搭子，直接说</span>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {(newUser
              ? [
                  "提醒我每周日给妈妈打电话",
                  "把「先做最重要的一件事」记成心签",
                  "帮我做一个 7 天晨读计划",
                  "拉个协同约定，和朋友一起背单词",
                  "帮我订一张明天去上海的高铁票",
                  "心里有点乱，陪我聊聊",
                ]
              : [
                  "帮我安排今天的计划",
                  "把现在脑子里的事记成心签",
                  "这周我做得怎么样？",
                  "拉个协同约定，和朋友一起推进",
                  "帮我订一张明天去上海的高铁票",
                  "心里有点乱，陪我聊聊",
                ]
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => sendText(s, null)}
                disabled={busy}
                className="w-full text-left rounded-full px-4 py-2 text-[13px] transition-all active:scale-[0.99]"
                style={{ border: "1px solid #d8e0f0", color: "#384877", background: "#fff", cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 动作提案卡片 */}
      {actions && actions.length > 0 && (
        <div className="mx-3 mb-3 rounded-2xl p-4 shrink-0" style={{ background: "#fff", border: "1.5px solid #4a5d8f", boxShadow: "0 4px 16px rgba(56,72,119,0.10)" }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: "#384877" }}>✋ 确认后我将执行这些修改</div>
          {actions.map((a) => (
            <div key={a.id} className="text-[13px] py-1" style={{ color: "#1c1c1e" }}>· {a.label}</div>
          ))}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setActions(null)}
              className="flex-1 rounded-full py-2 text-[12.5px]"
              style={{ border: "1px solid #e8ecef", color: "#63666e", background: "#fff", cursor: "pointer" }}
            >
              先不了
            </button>
            <button
              type="button"
              onClick={confirmActions}
              disabled={acting}
              className="rounded-full py-2 text-[12.5px] font-semibold text-white"
              style={{ flex: 1.4, background: "#384877", border: "none", cursor: "pointer", opacity: acting ? 0.6 : 1 }}
            >
              {acting ? "执行中…" : "确认执行"}
            </button>
          </div>
        </div>
      )}

      {/* 创建提案卡片 */}
      {pending && (
        <div className="mx-3 mb-3 rounded-2xl p-4 shrink-0" style={{ background: "#fff", border: "1.5px solid #4a5d8f", boxShadow: "0 4px 16px rgba(56,72,119,0.10)" }}>
          <div className="text-[12px] font-semibold mb-2" style={{ color: "#384877" }}>
            {TYPE_ICON[pending.type] || "✨"} 帮你整理好了 · {TYPE_LABEL[pending.type] || "提案"}
          </div>
          {pending.type === "plan" ? (
            <div className="text-[13px]" style={{ color: "#1c1c1e" }}>
              <div className="font-semibold">{pending.plan?.parent?.title || "智能规划"}</div>
              <div className="text-[11.5px] mt-1" style={{ color: "#63666e" }}>
                共 {(pending.plan?.children || []).length} 条子约定，按天排好具体时刻
              </div>
            </div>
          ) : (
            <div className="text-[13px]" style={{ color: "#1c1c1e" }}>
              <div className="font-semibold">{pending.title || pending.content || pending.text}</div>
              {pending.description && (
                <div className="text-[11.5px] mt-1" style={{ color: "#63666e" }}>{pending.description}</div>
              )}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={rejectPending}
              className="flex-1 rounded-full py-2 text-[12.5px]"
              style={{ border: "1px solid #e8ecef", color: "#63666e", background: "#fff", cursor: "pointer" }}
            >
              不对，再聊聊
            </button>
            <button
              type="button"
              onClick={confirmCreate}
              disabled={acting}
              className="rounded-full py-2 text-[12.5px] font-semibold text-white"
              style={{ flex: 1.4, background: "#384877", border: "none", cursor: "pointer", opacity: acting ? 0.6 : 1 }}
            >
              {acting ? "生成中…" : "确认生成"}
            </button>
          </div>
        </div>
      )}

      {/* 输入区 */}
      <div className="shrink-0 px-3 py-2.5" style={inline ? { background: "transparent" } : { background: "#fff", borderTop: "1px solid #e8ecef" }}>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={inline ? "立约定、写心签、订票购物…都可以说" : "和小助手说点什么…"}
            className="flex-1 resize-none px-3.5 py-2.5 text-[13.5px] outline-none"
            style={
              inline
                ? { background: "#fff", border: "1px solid #e8ecef", borderRadius: 9999, maxHeight: 120, color: "#1c1c1e" }
                : { background: "#eef0f5", border: "none", borderRadius: 16, maxHeight: 120, color: "#1c1c1e" }
            }
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="rounded-full text-white text-[13px] font-semibold shrink-0"
            style={
              inline
                ? { minWidth: 56, height: 40, padding: "0 14px", background: input.trim() ? "#384877" : "#c6c9cf", border: "none", cursor: input.trim() ? "pointer" : "default", opacity: busy ? 0.6 : 1 }
                : { width: 40, height: 40, background: input.trim() ? "#384877" : "#c6c9cf", border: "none", cursor: input.trim() ? "pointer" : "default", opacity: busy ? 0.6 : 1 }
            }
            aria-label="发送"
          >
            {inline ? "发送" : "➤"}
          </button>
        </div>
      </div>
    </>
  );

  // 内嵌形态（首页通用 Agent 对话层）：无浮动按钮，面板常开
  if (inline) {
    return (
      <div
        className="flex flex-col overflow-hidden rounded-3xl h-[600px] lg:h-[720px]"
        style={{ background: "#FAF9F7", border: "1px solid #e7e5e4" }}
      >
        {panelBody}
      </div>
    );
  }

  return (
    <>
      {/* 右下角机器人入口 */}
      <button
        type="button"
        aria-label="心栈小助手"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[90] rounded-full focus:outline-none"
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      >
        <BrandBot
          size={56}
          icon={26}
          className="assistant-avatar"
          style={{ border: "2px solid #fff", boxShadow: "0 8px 24px rgba(56,72,119,0.35)" }}
        />
        {unread > 0 && (
          <span
            className="absolute flex items-center justify-center text-white text-[10px] rounded-full"
            style={{ top: -2, right: -2, minWidth: 18, height: 18, padding: "0 5px", background: "#db3356", border: "2px solid #fff" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* 聊天面板 */}
      {open && (
        <div
          className="fixed z-[90] flex flex-col overflow-hidden rounded-3xl"
          style={{
            right: 20,
            bottom: 84,
            width: "min(400px, calc(100vw - 40px))",
            height: "min(620px, calc(100dvh - 120px))",
            background: "#f5f6fa",
            boxShadow: "0 20px 60px rgba(30,42,64,0.25)",
            border: "1px solid #e8ecef"
          }}
        >
          {panelBody}
        </div>
      )}
    </>
  );
}
