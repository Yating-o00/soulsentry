import React, { useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import BuddyModuleIcon from "@/components/buddy/BuddyModuleIcon";
import { useBuddyState } from "./shared";

const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function dateLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function numberLabel(value, unit = "") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const text = Math.abs(number) >= 1000
    ? number.toLocaleString("zh-CN", { maximumFractionDigits: 1 })
    : String(Math.round(number * 10) / 10);
  return unit ? `${text} ${unit}` : text;
}

function ModuleHeader({ module, tint, children }) {
  const accent = tint?.[2] || "#384877";
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${accent}12`, color: accent }}
      >
        <BuddyModuleIcon module={module} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold text-stone-900">{module.label}</h2>
        {module.hint && <p className="mt-0.5 text-[11px] leading-relaxed text-stone-400">{module.hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ChecklistModule({ module, tint, data, save }) {
  const accent = tint?.[2] || "#384877";
  const [draft, setDraft] = useState("");
  const seeded = useMemo(
    () => (Array.isArray(module.items) ? module.items : []).map((text, index) => ({
      id: `seed_${index}`,
      text,
      done: false,
    })),
    [module.items]
  );
  const stored = Array.isArray(data.items) ? data.items : null;
  const items = stored || seeded;
  const doneCount = items.filter((item) => item.done).length;

  const persist = (next) => save({ ...data, items: next });
  const add = () => {
    const text = draft.trim().slice(0, 40);
    if (!text) return;
    persist([...items, { id: uid(), text, done: false }]);
    setDraft("");
  };
  const toggle = (id) => persist(items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  const remove = (id) => persist(items.filter((item) => item.id !== id));

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <ModuleHeader module={module} tint={tint}>
        <span className="shrink-0 text-[11px] text-stone-400">{doneCount}/{items.length}</span>
      </ModuleHeader>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%`, background: accent }}
        />
      </div>

      <ul className="mt-2.5 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2.5 rounded-xl px-1 py-1">
            <button
              type="button"
              onClick={() => toggle(item.id)}
              aria-label={item.done ? `取消完成 ${item.text}` : `完成 ${item.text}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
              style={item.done
                ? { background: accent, borderColor: accent }
                : { borderColor: "#d6d3d1" }}
            >
              {item.done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </button>
            <span className={`min-w-0 flex-1 text-[13px] ${item.done ? "text-stone-400 line-through" : "text-stone-700"}`}>
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              aria-label={`删除 ${item.text}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-300 hover:bg-stone-50 hover:text-rose-500"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="mt-3 rounded-xl bg-[#FAF9F7] px-3 py-3 text-center text-[11px] text-stone-400">
          还没有项目，从下面加一条开始。
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 40))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="添加一项…"
          className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px] text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
          style={{ background: accent }}
          aria-label="添加清单项"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function NotesModule({ module, tint, data, save }) {
  const accent = tint?.[2] || "#384877";
  const [draft, setDraft] = useState("");
  const entries = Array.isArray(data.entries) ? data.entries : [];

  const add = () => {
    const text = draft.trim().slice(0, 500);
    if (!text) return;
    save({
      ...data,
      entries: [...entries, { id: uid(), text, created_at: new Date().toISOString() }],
    });
    setDraft("");
  };
  const remove = (id) => save({ ...data, entries: entries.filter((entry) => entry.id !== id) });

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <ModuleHeader module={module} tint={tint}>
        <span className="shrink-0 text-[11px] text-stone-400">{entries.length} 条</span>
      </ModuleHeader>

      <div className="mt-3 rounded-xl border border-stone-200 bg-[#FAF9F7] p-2.5">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 500))}
          rows={2}
          placeholder="写一条记录…"
          className="w-full resize-none bg-transparent text-[12px] leading-relaxed text-stone-700 placeholder:text-stone-400 focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="inline-flex min-h-[30px] items-center gap-1 rounded-full px-3 text-[11px] font-medium text-white disabled:opacity-40"
            style={{ background: accent }}
          >
            <Plus className="h-3.5 w-3.5" /> 记下
          </button>
        </div>
      </div>

      <div className="mt-2.5 space-y-2">
        {[...entries].reverse().map((entry) => (
          <article key={entry.id} className="group rounded-xl border border-stone-100 bg-white px-3 py-2.5">
            <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-stone-700">{entry.text}</p>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[9px] text-stone-400">{dateLabel(entry.created_at)}</span>
              <button
                type="button"
                onClick={() => remove(entry.id)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-stone-300 hover:bg-stone-50 hover:text-rose-500"
                aria-label="删除这条记录"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </article>
        ))}
        {entries.length === 0 && (
          <p className="rounded-xl bg-[#FAF9F7] px-3 py-4 text-center text-[11px] text-stone-400">
            还没有记录，先写下第一条。
          </p>
        )}
      </div>
    </section>
  );
}

function TrackerModule({ module, tint, data, save }) {
  const accent = tint?.[2] || "#384877";
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const values = entries.map((entry) => Number(entry.value)).filter((item) => Number.isFinite(item));
  const sum = values.reduce((total, item) => total + item, 0);
  const average = values.length ? sum / values.length : 0;
  const latest = values.length ? values[values.length - 1] : null;
  const aggregate = module.aggregate || "latest";
  const headline = aggregate === "sum" ? sum : aggregate === "avg" ? average : latest;
  const metric = module.metric || "数值";
  const headlineLabel = aggregate === "sum" ? `累计${metric}` : aggregate === "avg" ? `平均${metric}` : `最近${metric}`;

  const add = () => {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    save({
      ...data,
      entries: [
        ...entries,
        {
          id: uid(),
          value: number,
          note: note.trim().slice(0, 80),
          created_at: new Date().toISOString(),
        },
      ],
    });
    setValue("");
    setNote("");
  };
  const remove = (id) => save({ ...data, entries: entries.filter((entry) => entry.id !== id) });

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <ModuleHeader module={module} tint={tint}>
        <span className="shrink-0 text-[11px] text-stone-400">{entries.length} 次</span>
      </ModuleHeader>

      <div className="mt-3 rounded-2xl px-3.5 py-3" style={{ background: `${accent}0d` }}>
        <div className="text-[10px] tracking-widest text-stone-500">{headlineLabel}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold" style={{ color: accent }}>
            {headline == null ? "—" : numberLabel(headline)}
          </span>
          {module.unit && <span className="text-[11px] text-stone-500">{module.unit}</span>}
        </div>
        {aggregate !== "latest" && (
          <p className="mt-0.5 text-[10px] text-stone-400">最近一次：{latest == null ? "—" : numberLabel(latest, module.unit)}</p>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-[minmax(0,92px)_minmax(0,1fr)_36px] gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={metric}
          className="min-w-0 rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-[12px] text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
        />
        <input
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 80))}
          placeholder="备注（可选）"
          className="min-w-0 rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-[12px] text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={value === "" || !Number.isFinite(Number(value))}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40"
          style={{ background: accent }}
          aria-label="添加记录"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2.5 space-y-1.5">
        {[...entries].reverse().slice(0, 30).map((entry) => (
          <div key={entry.id} className="flex items-center gap-2 rounded-xl bg-[#FAF9F7] px-3 py-2">
            <span className="shrink-0 text-[12px] font-semibold" style={{ color: accent }}>
              {numberLabel(entry.value, module.unit)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-stone-500">{entry.note || "—"}</span>
            <span className="shrink-0 text-[9px] text-stone-400">{dateLabel(entry.created_at)}</span>
            <button
              type="button"
              onClick={() => remove(entry.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-stone-300 hover:bg-white hover:text-rose-500"
              aria-label="删除这条记录"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="rounded-xl bg-[#FAF9F7] px-3 py-4 text-center text-[11px] text-stone-400">
            还没有记录，从上面记一笔开始。
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * 用户自定义的模块：清单、笔记、数值追踪。
 * 数据存到本搭子 profile.state.module_data[module.id]，换设备仍保留。
 */
export default function BuddyModulePanel({ module, buddy, tint }) {
  const { state, patch, patching } = useBuddyState(buddy.id);
  const data = state?.module_data?.[module.id] && typeof state.module_data[module.id] === "object"
    ? state.module_data[module.id]
    : {};
  const save = (next) => patch({ module_data: { [module.id]: next } });

  if (module.type === "checklist") {
    return <ChecklistModule module={module} tint={tint} data={data} save={save} />;
  }
  if (module.type === "notes") {
    return <NotesModule module={module} tint={tint} data={data} save={save} />;
  }
  if (module.type === "tracker") {
    return <TrackerModule module={module} tint={tint} data={data} save={save} />;
  }
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FAF9F7] text-stone-400">
        {patching ? <Loader2 className="h-4 w-4 animate-spin" /> : <BuddyModuleIcon module={module} className="h-4 w-4" />}
      </div>
      <p className="mt-2 text-[12px] text-stone-500">这个模块还在准备中。</p>
    </section>
  );
}
