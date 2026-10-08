import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Shield, RefreshCw, Bell, Compass, MapPin, HeartHandshake, Sparkles, AlarmClock, X, Home, Building2 } from "lucide-react";

/**
 * 时空感知守护面板 - 聚合地理感知 + 遗忘拯救两类真实数据卡片
 */
// 模块级缓存：会话内常驻，不再按时间过期。
// 刷新由 Task / Note / SavedLocation 的实时订阅事件驱动，或用户手动点击"重新分析"。
const GUARD_CACHE = { ts: 0, data: null, assoc: null, dwell: null, dirty: false };
const GUARD_TTL_MS = Infinity;
// 单次请求最长 12 秒：超时则静默回退，不再让用户长时间盯着 loading
const REQUEST_TIMEOUT_MS = 12000;

export default function SentinelGuardPanel() {
  const [data, setData] = useState(GUARD_CACHE.data);
  const [assoc, setAssoc] = useState(GUARD_CACHE.assoc);
  const [dwell, setDwell] = useState(GUARD_CACHE.dwell);
  const [loading, setLoading] = useState(!GUARD_CACHE.data);
  const [errored, setErrored] = useState(false);
  const [dismissed, setDismissed] = useState({ geo: false, forget: false });
  const fetchedRef = useRef(false);

  // 常驻点学习动作：确认（设家/公司/常去）或忽略（不再问），只刷新轻量学习状态，不重拉两个高消耗后端
  const refreshDwell = async () => {
    try {
      const res = await base44.functions.invoke('sentinelDwellLearn');
      GUARD_CACHE.dwell = res?.data || null;
      setDwell(GUARD_CACHE.dwell);
    } catch { /* 静默：学习是锦上添花 */ }
  };
  const confirmDwell = async (c) => {
    try {
      await base44.functions.invoke('sentinelDwellLearn', { action: 'confirm', candidate: c });
      toast.success('已记下，之后会用这个地点守护你');
      await refreshDwell();
    } catch {
      toast.error('操作失败，请稍后再试');
    }
  };
  const ignoreDwell = async (c) => {
    try {
      await base44.functions.invoke('sentinelDwellLearn', { action: 'ignore', candidate: c });
      await refreshDwell();
    } catch { /* 静默 */ }
  };

  const fetchGuard = async (force = false) => {
    // 命中模块缓存就直接复用：除非数据被订阅事件标记为 dirty，或调用方明确 force
    if (!force && !GUARD_CACHE.dirty && GUARD_CACHE.data) {
      setData(GUARD_CACHE.data);
      setAssoc(GUARD_CACHE.assoc);
      setDwell(GUARD_CACHE.dwell);
      setLoading(false);
      return;
    }
    GUARD_CACHE.dirty = false;
    setLoading(true);
    setErrored(false);

    // 静默拿一次定位（不阻塞主流程：拿不到就用空坐标）
    let coords = {};
    if ('geolocation' in navigator) {
      coords = await new Promise((resolve) => {
        const t = setTimeout(() => resolve({}), 1200);
        navigator.geolocation.getCurrentPosition(
          (pos) => { clearTimeout(t); resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); },
          () => { clearTimeout(t); resolve({}); },
          { enableHighAccuracy: false, timeout: 1200, maximumAge: 300000 }
        );
      });
    }

    // 单请求超时保护：任一后端 15 秒内未返回，立即放弃 loading
    const withTimeout = (p) => Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), REQUEST_TIMEOUT_MS))
    ]);

    const isMissingCapability = (reason) => {
      const status = reason?.status || reason?.response?.status;
      const code = reason?.data?.error;
      return status === 404 || code === "NOT_FOUND" || /未找到函数|not found/i.test(reason?.message || "");
    };

    try {
      // 用 allSettled 而不是 all：一个失败不应该让另一个的结果也丢失
      // 第三个调用（常驻点学习）是轻量本地统计，失败静默——绝不拖累面板主体
      const [guardRes, assocRes, dwellRes] = await Promise.allSettled([
        withTimeout(base44.functions.invoke('getSentinelGuard', coords)),
        withTimeout(base44.functions.invoke('getAssociationRecommendations', coords)),
        base44.functions.invoke('sentinelDwellLearn')
      ]);
      const g = guardRes.status === 'fulfilled' ? (guardRes.value?.data || null) : null;
      const a = assocRes.status === 'fulfilled' ? (assocRes.value?.data || null) : null;
      const d = dwellRes.status === 'fulfilled' ? (dwellRes.value?.data || null) : null;

      // 只有两个都失败、且都不是限流时才显示错误；任一成功即写入缓存并正常展示
      const guardFailed = guardRes.status === 'rejected';
      const assocFailed = assocRes.status === 'rejected';
      if (guardFailed && assocFailed) {
        const guardMsg = guardRes.reason?.message || '';
        const assocMsg = assocRes.reason?.message || '';
        const isRateLimit =
          /rate limit/i.test(guardMsg) || (guardRes.reason?.status || guardRes.reason?.response?.status) === 429 ||
          /rate limit/i.test(assocMsg) || (assocRes.reason?.status || assocRes.reason?.response?.status) === 429;
        const isTimeout = guardMsg === 'TIMEOUT' && assocMsg === 'TIMEOUT';
        const isMissing =
          isMissingCapability(guardRes.reason) &&
          isMissingCapability(assocRes.reason);
        if (isRateLimit) {
          GUARD_CACHE.ts = Date.now();
          console.warn('[sentinel-guard] 命中限流，5 分钟内不再重试');
        } else if (isTimeout || isMissing) {
          GUARD_CACHE.ts = Date.now();
          GUARD_CACHE.data = null;
          GUARD_CACHE.assoc = null;
        } else {
          console.warn('[sentinel-guard] 拉取失败', guardRes.reason, assocRes.reason);
          setErrored(true);
        }
      } else {
        GUARD_CACHE.ts = Date.now();
        GUARD_CACHE.data = g;
        GUARD_CACHE.assoc = a;
        GUARD_CACHE.dwell = d;
        if (guardFailed && !isMissingCapability(guardRes.reason)) console.warn('[sentinel-guard] guard 失败但 assoc 成功', guardRes.reason);
        if (assocFailed && !isMissingCapability(assocRes.reason)) console.warn('[sentinel-guard] assoc 失败但 guard 成功', assocRes.reason);
      }
      setData(g);
      setAssoc(a);
      setDwell(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchGuard();
  }, []);

  // 事件驱动:Task / Note / SavedLocation 任一变化只把缓存标记为 dirty,
  // 不立即 refetch —— 避免在 executeAutomation 等长流程中频繁调用 2 个高消耗后端,
  // 把 base44 quota 打到 429,反过来又让关键调用 500。
  // 用户下次手动点击"重新分析"或重新进入页面时才会真正拉取最新结果。
  useEffect(() => {
    const markDirty = () => { GUARD_CACHE.dirty = true; };
    const unsubs = [];
    try { const u = base44.entities.Task?.subscribe?.(markDirty); if (u) unsubs.push(u); } catch (_error) { void _error; }
    try { const u = base44.entities.Note?.subscribe?.(markDirty); if (u) unsubs.push(u); } catch (_error) { void _error; }
    try { const u = base44.entities.SavedLocation?.subscribe?.(markDirty); if (u) unsubs.push(u); } catch (_error) { void _error; }
    return () => { unsubs.forEach((u) => { try { u?.(); } catch (_error) { void _error; } }); };
  }, []);

  const handleSnooze = (type) => {
    setDismissed((prev) => ({ ...prev, [type]: true }));
    toast('已稍后提醒');
  };

  const navigate = useNavigate();
  const goTask = (id) => { if (id) navigate(`/Tasks?taskId=${id}`); };

  // 查看约定：多个时先弹清单（点具体约定再跳转），单个时直接跳到约定本身
  const [taskList, setTaskList] = useState(null); // { title, tasks: [{id,title,time,priority,overdue}] }
  const openTasks = (title, tasks) => {
    const list = (Array.isArray(tasks) ? tasks : []).filter((t) => t?.id);
    if (list.length === 0) return;
    if (list.length === 1) { goTask(list[0].id); return; }
    setTaskList({ title, tasks: list });
  };
  const pickTask = (id) => { setTaskList(null); goTask(id); };

  const PRIORITY_META = {
    urgent: { label: '紧要', color: '#b45309' },
    high: { label: '高', color: '#b45309' },
    medium: { label: '中', color: '#64748b' },
    low: { label: '低', color: '#94a3b8' },
  };
  const fmtTaskTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const hasGeo = data?.geo_context && !dismissed.geo;
  const hasForget = data?.forgetting_rescue?.primary && !dismissed.forget;
  const hasAssoc = !!(assoc?.sequential_recommendation || assoc?.location_pattern);
  const hasDwellCandidate = (dwell?.candidates || []).length > 0;

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-slate-400">
        <div className="inline-flex items-center gap-2">
          <Shield className="w-4 h-4 animate-pulse" />
          分析时空情境中…
        </div>
        <button
          onClick={() => { fetchedRef.current = true; fetchGuard(true); }}
          className="mt-3 block mx-auto text-xs text-[#384877] hover:underline"
        >
          太慢了？点此重试
        </button>
      </div>
    );
  }

  if (errored || (!hasGeo && !hasForget && !hasAssoc && !hasDwellCandidate)) {
    return (
      <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <Shield className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-slate-600 text-sm font-medium mb-1">一切安好</p>
        <p className="text-xs text-slate-400 mb-2">没有检测到需要守护的情境事件</p>
        <button
          onClick={() => { fetchedRef.current = true; fetchGuard(true); }}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#384877]"
        >
          <RefreshCw className="w-3 h-3" />
          重新分析
        </button>
      </div>
    );
  }

  // —— 守护动态卡片流：每张卡是一类「当前情境」（蓝紫灰冷色阶，与产品主色一致） ——
  const LEVEL_META = {
    urgent: { label: '紧要', color: '#6d5fd3', Icon: Shield },  // 紫：需要立即留意
    call:   { label: '轻唤', color: '#3b5aa2', Icon: Bell },    // 蓝：品牌色轻提醒
    calm:   { label: '忆起', color: '#64748b', Icon: Compass }, // 灰：温柔的回忆线索
  };

  const cards = [];

  // 常驻点学习卡：放在最前——理解"你在哪里"是其他守护的地基；一次只展示一个候选，处理完下一个自动浮现
  if (hasDwellCandidate) {
    const DWELL_META = {
      home: { label: '疑似家', Icon: Home },
      office: { label: '疑似公司', Icon: Building2 },
      frequent: { label: '常去地点', Icon: Compass },
    };
    const c = dwell.candidates[0];
    const meta = DWELL_META[c.type] || DWELL_META.frequent;
    cards.push({
      key: `dwell-${c.key}`,
      level: 'call',
      Icon: meta.Icon,
      title: `${meta.label} · 我对这里的判断`,
      detail: c.explanation,
      basis: `近 ${Math.min(dwell.sessions || 0, 60)} 天的停留会话 × 自动学习（可检查、可否决）`,
      action: { label: c.type === 'frequent' ? '记下来' : '是的，就是它', onClick: () => confirmDwell(c) },
      snooze: () => ignoreDwell(c),
      snoozeLabel: '不对',
    });
  }

  if (hasGeo) {
    const g = data.geo_context;
    const urgent = (g.tasks || []).some((t) => t.overdue || t.priority === 'urgent');
    const level = urgent ? 'urgent' : 'call';
    cards.push({
      key: 'geo',
      level,
      Icon: MapPin,
      title: `${g.event === 'exit' ? '离开' : '进入'} · ${g.location_name || '附近'}`,
      detail: g.contextual_reason || '这里有与你相关的约定，可以顺手处理。',
      basis: `时空情境 × ${(g.tasks || []).length} 个相关约定${g.distance != null ? ` · 约 ${g.distance}m` : ''}`,
      action: { label: '查看约定', onClick: () => openTasks(`${g.event === 'exit' ? '离开' : '进入'} · ${g.location_name || '附近'}`, g.tasks) },
      snooze: () => handleSnooze('geo'),
    });
  }

  if (hasForget) {
    const f = data.forgetting_rescue;
    const p = f.primary;
    const others = [
      ...(f.others || []).map((o) => `${o.title}（${o.days} 天）`),
      ...(f.silent_notes || []).map((n) => `心签 · ${n.title}（${n.days} 天）`),
    ];
    cards.push({
      key: 'forget',
      level: p.overdue_days > 0 ? 'urgent' : 'call',
      Icon: HeartHandshake,
      title: `「${p.title}」已沉睡 ${p.days} 天`,
      detail: p.context || '它可能被日子埋住了，轻轻捞起它。',
      basis: `遗忘率 ${p.forget_rate ?? 0}%${p.overdue_days ? ` · 已逾期 ${p.overdue_days} 天` : ''}`,
      extra: others.length > 0 ? `还有 ${others.length} 条在安静等待：${others.slice(0, 3).join('、')}` : null,
      action: { label: '去看看', onClick: () => goTask(p.id) },
      snooze: () => handleSnooze('forget'),
    });
  }

  if (assoc?.sequential_recommendation) {
    const s = assoc.sequential_recommendation;
    const rules = (s.suggestions || [])
      .map((r) => `${r.from_label} → ${r.to_label}（${r.confidence}%）`)
      .join('、');
    cards.push({
      key: 'seq',
      level: 'calm',
      Icon: Sparkles,
      title: s.trigger_task?.title ? `「${s.trigger_task.title}」之后，你通常会——` : '你的约定里藏着一条线索',
      detail: rules ? `完成前者后，你接着做后者的概率很高：${rules}` : '有些约定总是前后脚出现。',
      basis: '近 180 次兑现的约定 × 序贯规律',
      action: (() => {
        // 汇总所有序贯建议里的约定（去重）：1 个直接跳，多个先弹清单
        const seen = new Set();
        const tasks = (s.suggestions || []).flatMap((r) => r.tasks || []).filter((t) => t?.id && !seen.has(t.id) && seen.add(t.id));
        return tasks.length
          ? { label: '查看约定', onClick: () => openTasks('前后脚出现的约定', tasks) }
          : null;
      })(),
    });
  }

  if (assoc?.location_pattern) {
    const l = assoc.location_pattern;
    const cats = (l.top_categories || []).map((c) => c.label).join('、');
    cards.push({
      key: 'loc',
      level: 'calm',
      Icon: Compass,
      title: `在${l.location_name || '这里'}，你常做这些事`,
      detail: [
        cats && `常触及：${cats}`,
        (l.top_titles || []).length > 0 && `出现过：${l.top_titles.map((t) => t.title).slice(0, 3).join('、')}`,
      ].filter(Boolean).join('；'),
      basis: `${l.history_sample_size ?? 0} 条此地记忆 × 地点规律`,
      action: (l.suggested_tasks || []).length
        ? { label: '查看约定', onClick: () => openTasks(`在${l.location_name || '这里'}可顺手处理的约定`, l.suggested_tasks) }
        : null,
    });
  }

  return (
    <div className="space-y-3.5">
      {cards.map((c) => {
        const meta = LEVEL_META[c.level];
        return (
          <div
            key={c.key}
            className="guard-card echo-born rounded-2xl p-4 sm:p-5"
            style={{ '--gc': meta.color }}
          >
            {/* 顶部一行:情境图标 + 标题 + 等级点标 */}
            <div className="flex items-center gap-3">
              <div className="guard-medallion" style={{ '--gc': meta.color }}>
                <span>
                  <c.Icon className="w-[18px] h-[18px]" />
                </span>
              </div>
              <h4 className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-[var(--ink)]">{c.title}</h4>
              <span className="guard-tag" style={{ '--gc': meta.color }}>
                <i />
                {meta.label}
              </span>
            </div>
            <div className="mt-2.5">
              {c.detail && <p className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">{c.detail}</p>}
              {c.extra && <p className="mt-1 text-[11.5px] text-[var(--ink-3)]">{c.extra}</p>}
              {/* 底部一行:左侧情境依据,右侧操作按钮 */}
              <div className="mt-3.5 flex items-center justify-between gap-3">
                {c.basis ? (
                  <p className="num min-w-0 truncate text-[10.5px] tracking-wide text-[var(--ink-4)]">情境依据 · {c.basis}</p>
                ) : (
                  <span />
                )}
                {(c.action || c.snooze) && (
                  <div className="ml-auto flex flex-shrink-0 items-center gap-2">
                    {c.action && (
                      <button
                        onClick={c.action.onClick}
                        className="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-85"
                        style={{ background: 'var(--sentinel)' }}
                      >
                        {c.action.label}
                      </button>
                    )}
                    {c.snooze && (
                      <button
                        onClick={c.snooze}
                        className="rounded-full border border-[var(--hairline)] px-3.5 py-1.5 text-[12px] text-[var(--ink-3)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--ink-2)]"
                      >
                        {c.snoozeLabel || '稍后'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* 约定清单弹层：从守护卡片「查看约定」进入，点具体约定跳到约定本身 */}
      {taskList && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[2px]"
          onClick={() => setTaskList(null)}
        >
          <div
            className="w-full sm:w-[420px] max-h-[72vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h4 className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-slate-800">{taskList.title}</h4>
              <button
                onClick={() => setTaskList(null)}
                className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[58vh] overflow-y-auto px-3 py-2">
              {taskList.tasks.map((t) => {
                const pm = PRIORITY_META[t.priority] || PRIORITY_META.medium;
                const timeText = fmtTaskTime(t.time);
                return (
                  <button
                    key={t.id}
                    onClick={() => pickTask(t.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ background: t.overdue ? '#dc2626' : 'var(--sentinel, #384877)' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13.5px] ${t.overdue ? 'text-red-600' : 'text-slate-800'}`}>
                        {t.title}
                      </span>
                      {timeText && (
                        <span className="mt-0.5 block text-[11.5px] text-slate-400">
                          {t.overdue ? '已到期 · ' : ''}{timeText}
                        </span>
                      )}
                    </span>
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 text-[10.5px]"
                      style={{ color: pm.color, borderColor: `${pm.color}55`, background: `${pm.color}0f` }}
                    >
                      {pm.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-slate-100 px-5 py-3 text-center text-[11px] text-slate-400">
              点选一条约定，直接跳转到它
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
