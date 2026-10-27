import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { httpRequest } from "@/api/httpClient";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  Users,
  UserPlus,
  Activity,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ShieldAlert,
  BarChart3,
  Clock3,
  Filter,
} from "lucide-react";

const BRAND = "#384877";

const QUERY_OPTIONS = {
  refetchInterval: 30000,
  retry: 1,
};

function ErrorBar({ message, onRetry }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="truncate">{message || "数据加载失败，请稍后重试"}</span>
      <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RefreshCw className="mr-1 h-3.5 w-3.5" />
        重试
      </Button>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, delta }) {
  return (
    <Card className="border-[#c9d5ef] bg-white">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs text-[#384877]/70">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="text-2xl sm:text-3xl font-bold text-[#384877]">{value}</div>
          {delta != null && (
            <div
              className={`flex items-center gap-0.5 text-xs font-medium ${
                delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-[#384877]/50"
              }`}
            >
              {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {Math.abs(delta)}
            </div>
          )}
        </div>
        {sub && <div className="mt-1 text-xs text-[#384877]/60">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value, hint }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[#384877]/70">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-[#384877]">{value}</span>
        {hint && <span className="ml-1 text-xs text-[#384877]/50">{hint}</span>}
      </div>
    </div>
  );
}

function retentionCellStyle(p) {
  if (!p || p <= 0) return { backgroundColor: "#ffffff", color: "#384877" };
  const alpha = Math.min(1, p / 100);
  return {
    backgroundColor: `rgba(56, 72, 119, ${alpha.toFixed(2)})`,
    color: p >= 40 ? "#ffffff" : "#384877",
  };
}

export default function AdminStats() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const overviewQuery = useQuery({
    queryKey: ["admin-stats", "overview"],
    queryFn: () => httpRequest("/api/admin/stats/overview"),
    ...QUERY_OPTIONS,
    enabled: isAdmin,
  });

  const trendQuery = useQuery({
    queryKey: ["admin-stats", "trend"],
    queryFn: () => httpRequest("/api/admin/stats/trend?days=30"),
    ...QUERY_OPTIONS,
    enabled: isAdmin,
  });

  const retentionQuery = useQuery({
    queryKey: ["admin-stats", "retention"],
    queryFn: () => httpRequest("/api/admin/stats/retention?weeks=8"),
    ...QUERY_OPTIONS,
    enabled: isAdmin,
  });

  const featuresQuery = useQuery({
    queryKey: ["admin-stats", "features"],
    queryFn: () => httpRequest("/api/admin/stats/features?days=14"),
    ...QUERY_OPTIONS,
    enabled: isAdmin,
  });

  const funnelQuery = useQuery({
    queryKey: ["admin-stats", "funnel"],
    queryFn: () => httpRequest("/api/admin/stats/funnel"),
    ...QUERY_OPTIONS,
    enabled: isAdmin,
  });

  const overview = overviewQuery.data;
  const trendDays = useMemo(() => trendQuery.data?.days || [], [trendQuery.data]);
  const cohorts = useMemo(
    () => (retentionQuery.data?.cohorts || []).filter((c) => c.users > 0),
    [retentionQuery.data]
  );
  const featureEvents = useMemo(() => (featuresQuery.data?.events || []).slice(0, 8), [featuresQuery.data]);
  const sources = featuresQuery.data?.sources || {};
  const hourly = useMemo(() => featuresQuery.data?.hourly || [], [featuresQuery.data]);
  const funnel = funnelQuery.data;

  const hourlyMax = useMemo(
    () => Math.max(1, ...hourly.map((h) => h.count || 0)),
    [hourly]
  );

  const activationSteps = useMemo(() => {
    const a = funnel?.activation;
    if (!a) return [];
    const base = Math.max(1, a.registered);
    return [
      { label: "注册", value: a.registered, pct: 100 },
      { label: "建过约定", value: a.withTask, pct: (a.withTask / base) * 100 },
      { label: "打过卡", value: a.withCheckin, pct: (a.withCheckin / base) * 100 },
    ];
  }, [funnel]);

  if (isLoadingAuth) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-[#384877]" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldAlert className="h-10 w-10 text-[#384877]/40" />
        <div className="text-lg font-semibold text-[#384877]">需要管理员权限</div>
        <div className="text-sm text-[#384877]/60">当前账号无权访问数据看板，请使用管理员账号登录。</div>
      </div>
    );
  }

  const today = overview?.today;
  const totals = overview?.totals;
  const yesterdayNewUsers = overview?.yesterday?.newUsers ?? 0;

  return (
    <div className="min-h-screen bg-[#EEF2FF]/40 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#384877]">数据看板</h1>
          <p className="mt-1 text-sm text-[#384877]/60">30 秒自动刷新</p>
        </div>

        {overviewQuery.isError && <ErrorBar message={overviewQuery.error?.message} onRetry={() => overviewQuery.refetch()} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            icon={UserPlus}
            label="今日新增"
            value={today?.newUsers ?? "-"}
            delta={
              today?.newUsers != null
                ? today.newUsers - yesterdayNewUsers
                : undefined
            }
            sub={`昨日新增 ${yesterdayNewUsers}`}
          />
          <KpiCard icon={Users} label="累计用户" value={totals?.totalUsers ?? "-"} sub="全部注册用户" />
          <KpiCard
            icon={Activity}
            label="今日活跃"
            value={today?.activeUsers ?? "-"}
            sub={`今日打卡 ${today?.checkins ?? 0} 次`}
          />
          <KpiCard icon={CalendarDays} label="WAU" value={totals?.wau ?? "-"} sub="近 7 天活跃用户" />
          <KpiCard icon={CalendarRange} label="MAU" value={totals?.mau ?? "-"} sub="近 30 天活跃用户" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-[#c9d5ef] bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-[#384877]">
                <TrendingUp className="h-4 w-4" />
                30 天趋势
              </CardTitle>
              <CardDescription className="text-xs text-[#384877]/60">活跃用户与新增用户走势</CardDescription>
            </CardHeader>
            <CardContent>
              {trendQuery.isError ? (
                <ErrorBar message={trendQuery.error?.message} onRetry={() => trendQuery.refetch()} />
              ) : trendQuery.isLoading ? (
                <div className="flex h-[280px] items-center justify-center">
                  <RefreshCw className="h-5 w-5 animate-spin text-[#384877]/50" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendDays} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#c9d5ef" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => (d ? d.slice(5) : "")}
                      tick={{ fontSize: 11, fill: "#384877" }}
                      stroke="#c9d5ef"
                    />
                    <YAxis tick={{ fontSize: 11, fill: "#384877" }} stroke="#c9d5ef" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #c9d5ef", fontSize: 12 }}
                      labelFormatter={(d) => (d ? d.slice(5) : "")}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="activeUsers"
                      name="活跃用户"
                      stroke={BRAND}
                      strokeWidth={2}
                      dot={false}
                      fill="#EEF2FF"
                    />
                    <Line
                      type="monotone"
                      dataKey="newUsers"
                      name="新增用户"
                      stroke="#3b5aa2"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#c9d5ef] bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-[#384877]">
                <Users className="h-4 w-4" />
                留存 cohort
              </CardTitle>
              <CardDescription className="text-xs text-[#384877]/60">近 8 周注册用户的次日 / 3 日 / 7 日留存</CardDescription>
            </CardHeader>
            <CardContent>
              {retentionQuery.isError ? (
                <ErrorBar message={retentionQuery.error?.message} onRetry={() => retentionQuery.refetch()} />
              ) : cohorts.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#384877]/50">暂无留存数据</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#c9d5ef] text-left text-xs text-[#384877]/60">
                        <th className="py-2 pr-3 font-medium">注册日期</th>
                        <th className="py-2 pr-3 text-right font-medium">新增用户</th>
                        <th className="py-2 pr-2 text-right font-medium">次留</th>
                        <th className="py-2 pr-2 text-right font-medium">3 日留</th>
                        <th className="py-2 text-right font-medium">7 日留</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohorts.map((c) => (
                        <tr key={c.date} className="border-b border-[#c9d5ef]/50 last:border-0">
                          <td className="py-2 pr-3 text-[#384877]">{c.date}</td>
                          <td className="py-2 pr-3 text-right text-[#384877]">{c.users}</td>
                          {["d1", "d3", "d7"].map((k) => (
                            <td key={k} className="py-2 pl-1">
                              <div
                                className="rounded-md px-2 py-1 text-right text-xs font-medium"
                                style={retentionCellStyle(c[k])}
                              >
                                {c[k] != null ? `${c[k]}%` : "-"}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[#c9d5ef] bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-[#384877]">
                <BarChart3 className="h-4 w-4" />
                功能使用
              </CardTitle>
              <CardDescription className="text-xs text-[#384877]/60">近 14 天事件 Top {featureEvents.length || 8}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {featuresQuery.isError ? (
                <ErrorBar message={featuresQuery.error?.message} onRetry={() => featuresQuery.refetch()} />
              ) : featureEvents.length === 0 ? (
                <div className="py-6 text-center text-sm text-[#384877]/50">暂无事件数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={featureEvents} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#c9d5ef" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#384877" }} stroke="#c9d5ef" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="event_type"
                      width={130}
                      tick={{ fontSize: 11, fill: "#384877" }}
                      stroke="#c9d5ef"
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #c9d5ef", fontSize: 12 }}
                    />
                    <Bar dataKey="count" name="次数" fill={BRAND} radius={[0, 6, 6, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="divide-y divide-[#c9d5ef]/60 border-t border-[#c9d5ef]/60">
                <StatRow label="打卡" value={sources.checkins ?? 0} />
                <StatRow label="加油" value={sources.cheers ?? 0} />
                <StatRow label="评论" value={sources.comments ?? 0} />
                <StatRow label="加入共有" value={sources.joins ?? 0} />
                <StatRow label="规划子约定" value={sources.planChildren ?? 0} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#c9d5ef] bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-[#384877]">
                <Clock3 className="h-4 w-4" />
                活跃时段
              </CardTitle>
              <CardDescription className="text-xs text-[#384877]/60">近 14 天 24 小时活跃分布</CardDescription>
            </CardHeader>
            <CardContent>
              {featuresQuery.isError ? (
                <ErrorBar message={featuresQuery.error?.message} onRetry={() => featuresQuery.refetch()} />
              ) : hourly.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#384877]/50">暂无活跃数据</div>
              ) : (
                <div>
                  <div className="flex h-36 items-end gap-1">
                    {hourly.map((h) => (
                      <div
                        key={h.hour}
                        title={`${h.hour} 点 · ${h.count} 次`}
                        className="flex-1 rounded-t-sm bg-[#384877] transition-all hover:bg-[#3b5aa2]"
                        style={{ height: `${Math.max(3, ((h.count || 0) / hourlyMax) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-[#384877]/50">
                    <span>0 点</span>
                    <span>6 点</span>
                    <span>12 点</span>
                    <span>18 点</span>
                    <span>23 点</span>
                  </div>
                </div>
              )}

              <div className="mt-8 border-t border-[#c9d5ef]/60 pt-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#384877]">
                  <Filter className="h-4 w-4" />
                  激活漏斗
                </div>
                {funnelQuery.isError ? (
                  <ErrorBar message={funnelQuery.error?.message} onRetry={() => funnelQuery.refetch()} />
                ) : (
                  <div className="space-y-3">
                    {activationSteps.map((s) => (
                      <div key={s.label}>
                        <div className="mb-1 flex items-center justify-between text-xs text-[#384877]/70">
                          <span>{s.label}</span>
                          <span>
                            {s.value} 人{s.pct < 100 ? ` · ${s.pct.toFixed(1)}%` : ""}
                          </span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-[#EEF2FF]">
                          <div
                            className="h-3 rounded-full bg-[#384877]"
                            style={{ width: `${Math.max(2, s.pct)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#c9d5ef] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-[#384877]">
              <Users className="h-4 w-4" />
              分享漏斗
            </CardTitle>
            <CardDescription className="text-xs text-[#384877]/60">
              近 {funnel?.share?.days ?? 14} 天：互动访客 → 加油 / 评论 / 加入共有
            </CardDescription>
          </CardHeader>
          <CardContent>
            {funnelQuery.isError ? (
              <ErrorBar message={funnelQuery.error?.message} onRetry={() => funnelQuery.refetch()} />
            ) : !funnel?.share ? (
              <div className="py-8 text-center text-sm text-[#384877]/50">暂无分享数据</div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl bg-[#EEF2FF] p-4">
                  <div className="text-xs text-[#384877]/60">互动访客</div>
                  <div className="mt-1 text-xl font-bold text-[#384877]">{funnel.share.visitors}</div>
                </div>
                <div className="rounded-xl border border-[#c9d5ef] p-4">
                  <div className="text-xs text-[#384877]/60">加油</div>
                  <div className="mt-1 text-xl font-bold text-[#384877]">{funnel.share.cheers}</div>
                </div>
                <div className="rounded-xl border border-[#c9d5ef] p-4">
                  <div className="text-xs text-[#384877]/60">评论</div>
                  <div className="mt-1 text-xl font-bold text-[#384877]">{funnel.share.comments}</div>
                </div>
                <div className="rounded-xl border border-[#c9d5ef] p-4">
                  <div className="text-xs text-[#384877]/60">加入共有</div>
                  <div className="mt-1 text-xl font-bold text-[#384877]">{funnel.share.joins}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
