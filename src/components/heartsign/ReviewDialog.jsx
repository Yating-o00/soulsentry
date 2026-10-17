import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Dices, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { notePlainText, isVaultNote, getNoteType, TYPE_META } from "./heartSignMeta";

function relTime(ts) {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: zhCN });
  } catch {
    return "";
  }
}

function highlight(text, q) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#fef3c7] text-inherit rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// 回顾：抽一签 / 按词回顾（与小程序「回顾」口径一致）
export default function ReviewDialog({ open, onOpenChange, notes, onLocate }) {
  const [tab, setTab] = useState("draw");
  const [drawn, setDrawn] = useState(null);
  const [lastDrawIdx, setLastDrawIdx] = useState(-1);
  const [kw, setKw] = useState("");

  // 抽签池：排除保险柜内容
  const pool = useMemo(() => notes.filter((n) => !isVaultNote(n) && notePlainText(n)), [notes]);
  const kwHits = useMemo(() => {
    const q = kw.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    return pool.filter((n) => notePlainText(n).toLowerCase().includes(lower));
  }, [pool, kw]);

  const drawOne = () => {
    if (!pool.length) { setDrawn(null); return; }
    let i;
    do {
      i = Math.floor(Math.random() * pool.length);
    } while (pool.length > 1 && i === lastDrawIdx);
    setLastDrawIdx(i);
    setDrawn(pool[i]);
  };

  const onOpen = (o) => {
    onOpenChange(o);
    if (o) {
      setTab("draw");
      setKw("");
      setDrawn(null);
      setLastDrawIdx(-1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="max-w-md w-[92vw]">
        <DialogHeader>
          <DialogTitle className="text-base">与过去的自己重逢</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 bg-slate-100 rounded-full p-1 mb-4">
          {[
            { key: "draw", label: "抽一签", icon: <Dices className="w-3.5 h-3.5" /> },
            { key: "keyword", label: "按词回顾", icon: <Search className="w-3.5 h-3.5" /> },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-full text-[13px] transition-colors ${
                tab === t.key ? "bg-white text-slate-800 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === "draw" && (
          <div>
            {drawn ? (
              <div className="bg-[#fafbfb] border border-slate-200 rounded-2xl px-5 py-6 text-center">
                <p className="text-[15px] leading-[1.9] text-slate-800 whitespace-pre-wrap break-words">
                  {notePlainText(drawn).slice(0, 300)}
                </p>
                <p className="mt-3 text-[11px] text-slate-400">
                  —— {relTime(drawn.created_date)} · 来自那天的你 ——
                </p>
                <button
                  onClick={() => onLocate?.(drawn.id)}
                  className="mt-4 text-xs text-[#384877] hover:underline"
                >
                  回到这条心签 →
                </button>
              </div>
            ) : (
              <div className="bg-[#fafbfb] border border-slate-200 rounded-2xl px-5 py-10 text-center text-sm text-slate-500">
                {pool.length ? "心里默念一件事，然后抽一签" : "还没有心签可抽，先去写下第一条吧"}
              </div>
            )}
            <button
              onClick={drawOne}
              disabled={!pool.length}
              className="mt-4 w-full py-2.5 rounded-full bg-[#384877] text-white text-sm font-medium tracking-[0.3em] hover:bg-[#2f3d63] transition-colors disabled:opacity-50"
            >
              {drawn ? "再 抽 一 签" : "抽 一 签"}
            </button>
          </div>
        )}

        {tab === "keyword" && (
          <div>
            <div className="flex gap-2 mb-3">
              <input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                placeholder="输入一个词，比如「跑步」「妈妈」「辞职」…"
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-sm outline-none focus:border-[#384877]/50"
              />
            </div>
            <div className="max-h-72 overflow-y-auto">
              {!kw.trim() ? (
                <div className="text-center text-xs text-slate-400 py-8">输入关键词，寻找过去的自己写过什么</div>
              ) : kwHits.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-8">
                  过去的你还没有提过「{kw.trim()}」<br />今天，要不要写下第一句？
                </div>
              ) : (
                <div className="text-[10.5px] uppercase tracking-wider text-slate-400 px-1 pb-2">
                  找到 {kwHits.length} 条与「{kw.trim()}」有关的过去
                </div>
              )}
              {kwHits.map((n) => {
                const text = notePlainText(n);
                const idx = text.toLowerCase().indexOf(kw.trim().toLowerCase());
                const excerpt = idx >= 0 ? text.slice(Math.max(0, idx - 16), idx + 56) : text.slice(0, 72);
                const meta = TYPE_META[getNoteType(n)];
                return (
                  <button
                    key={n.id}
                    onClick={() => onLocate?.(n.id)}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-[13px] text-slate-700 leading-relaxed break-words">
                      …{highlight(excerpt, kw.trim())}…
                    </div>
                    <div className="mt-1 text-[10.5px] text-slate-400">
                      {relTime(n.created_date)} · {meta?.label}签
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
