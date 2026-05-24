import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Wallet, AlertCircle, Repeat } from "lucide-react";

// 分类视觉
const CAT_META = {
  餐饮:   { icon: "🍜", color: "#f59e0b", bg: "#fffbeb" },
  交通:   { icon: "🚇", color: "#3b82f6", bg: "#eff6ff" },
  购物:   { icon: "🛍️", color: "#8b5cf6", bg: "#f5f3ff" },
  居住:   { icon: "🏠", color: "#059669", bg: "#ecfdf5" },
  娱乐:   { icon: "🎬", color: "#ec4899", bg: "#fdf2f8" },
  医疗:   { icon: "🏥", color: "#ef4444", bg: "#fef2f2" },
  转账:   { icon: "🔁", color: "#6366f1", bg: "#eef2ff" },
  工资:   { icon: "💰", color: "#10b981", bg: "#ecfdf5" },
  理财:   { icon: "📈", color: "#06b6d4", bg: "#ecfeff" },
  教育:   { icon: "📚", color: "#f97316", bg: "#fff7ed" },
  宠物:   { icon: "🐱", color: "#84cc16", bg: "#f7fee7" },
  其他:   { icon: "📝", color: "#94a3b8", bg: "#f8fafc" },
};

function fmtAmount(n) {
  const v = Number(n) || 0;
  return v.toFixed(v % 1 === 0 ? 0 : 2);
}

export default function LedgerResultView({ data = {}, preview }) {
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const stats = data.stats || {};
  const totalIncome = Number(stats.total_income) || 0;
  const totalExpense = Number(stats.total_expense) || 0;
  const balance = totalIncome - totalExpense;
  const [tab, setTab] = useState("list"); // list | analysis

  // 按日期分组
  const groups = useMemo(() => {
    const map = {};
    for (const e of entries) {
      const k = e.date || "未分类";
      if (!map[k]) map[k] = [];
      map[k].push(e);
    }
    return Object.entries(map);
  }, [entries]);

  // 支出分类排序（用于"分析"标签）
  const expCats = useMemo(() => {
    const byCat = stats.by_category || {};
    return Object.entries(byCat)
      .filter(([, v]) => (v?.expense || 0) > 0)
      .sort((a, b) => (b[1].expense || 0) - (a[1].expense || 0));
  }, [stats.by_category]);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
        {preview || "AI 未从输入中识别出账目，请检查输入文本里是否包含金额。"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 顶部汇总 */}
      <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50/60 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">本次整理结余</div>
            <div className={`text-2xl font-bold tabular-nums ${balance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {balance >= 0 ? "+" : ""}¥{fmtAmount(balance)}
            </div>
          </div>
          <Badge variant="outline" className="text-[11px]">{entries.length} 笔</Badge>
        </div>
        <div className="flex gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            收入 <span className="text-slate-700 font-medium tabular-nums">¥{fmtAmount(totalIncome)}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-red-500" />
            支出 <span className="text-slate-700 font-medium tabular-nums">¥{fmtAmount(totalExpense)}</span>
          </span>
        </div>
      </Card>

      {/* Tab 切换 */}
      <div className="flex gap-1 p-1 rounded-lg bg-slate-100 w-fit">
        <button
          onClick={() => setTab("list")}
          className={`px-3 py-1 text-xs rounded-md transition ${tab === "list" ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-500"}`}
        >明细</button>
        <button
          onClick={() => setTab("analysis")}
          className={`px-3 py-1 text-xs rounded-md transition ${tab === "analysis" ? "bg-white shadow-sm text-slate-900 font-medium" : "text-slate-500"}`}
        >分析</button>
      </div>

      {/* 明细 */}
      {tab === "list" && (
        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {groups.map(([date, items]) => {
            const dayInc = items.filter(i => i.type === "income").reduce((a, b) => a + (Number(b.amount) || 0), 0);
            const dayExp = items.filter(i => i.type === "expense").reduce((a, b) => a + (Number(b.amount) || 0), 0);
            return (
              <div key={date}>
                <div className="flex items-baseline justify-between pb-1.5 mb-1 border-b border-slate-100">
                  <div className="text-xs font-semibold text-slate-700">{date}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    {dayExp > 0 && <span className="text-red-500">-¥{fmtAmount(dayExp)}</span>}
                    {dayExp > 0 && dayInc > 0 && " · "}
                    {dayInc > 0 && <span className="text-emerald-600">+¥{fmtAmount(dayInc)}</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  {items.map((e, idx) => {
                    const meta = CAT_META[e.category] || CAT_META.其他;
                    const isInc = e.type === "income";
                    const sign = isInc ? "+" : "-";
                    return (
                      <div key={idx} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50 transition">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                          style={{ background: meta.bg, color: meta.color }}
                        >{meta.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-800 truncate">{e.item || "未命名"}</div>
                          <div className="text-[10px] text-slate-400 flex gap-1.5 items-center">
                            <span>{e.category}</span>
                            {Array.isArray(e.tags) && e.tags.length > 0 && e.tags.map((t, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t}</span>
                            ))}
                          </div>
                        </div>
                        <div className={`text-sm font-semibold tabular-nums whitespace-nowrap ${isInc ? "text-emerald-600" : "text-red-500"}`}>
                          {sign}¥{fmtAmount(e.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 分析 */}
      {tab === "analysis" && (
        <div className="space-y-3">
          {expCats.length > 0 && (
            <Card className="border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">支出分类</div>
              <div className="space-y-2">
                {expCats.map(([cat, val]) => {
                  const meta = CAT_META[cat] || CAT_META.其他;
                  const pct = totalExpense > 0 ? ((val.expense / totalExpense) * 100) : 0;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <div className="w-14 text-xs text-slate-600 text-right">{cat}</div>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                      </div>
                      <div className="w-16 text-xs font-semibold text-slate-700 text-right tabular-nums">¥{fmtAmount(val.expense)}</div>
                      <div className="w-9 text-[11px] text-slate-400 text-right">{pct.toFixed(0)}%</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {Array.isArray(stats.alerts) && stats.alerts.length > 0 && (
            <Card className="border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">智能提醒</div>
              <div className="space-y-2">
                {stats.alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                    <div className="text-slate-700 leading-relaxed">{a}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {Array.isArray(stats.recurring) && stats.recurring.length > 0 && (
            <Card className="border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Repeat className="w-3 h-3" /> 周期账单识别
              </div>
              <div className="space-y-1">
                {stats.recurring.map((r, i) => (
                  <div key={i} className="text-xs text-slate-600 flex justify-between">
                    <span>{r.item}</span>
                    <span className="tabular-nums text-slate-500">¥{fmtAmount(r.amount)} / {r.cycle || "月"}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(!expCats.length && !(stats.alerts || []).length && !(stats.recurring || []).length) && (
            <div className="text-xs text-slate-400 py-6 text-center">
              <Wallet className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
              数据较少，暂无可分析的统计指标
            </div>
          )}
        </div>
      )}
    </div>
  );
}