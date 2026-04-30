import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap, Crown, Coins, History, Package, Flag, ListTree, FileText, CalendarClock, Heart, Sunrise, CalendarRange, CalendarDays, MessageCircle, Cpu } from "lucide-react";
import { SUBSCRIPTION_PLANS, CREDIT_PACKS, AI_FEATURES } from "@/components/credits/creditConfig";
import { useAICredits } from "@/components/credits/useAICredits";
import CreditHistoryDialog from "@/components/credits/CreditHistoryDialog";
import PaymentMethodDialog from "@/components/credits/PaymentMethodDialog";
import { toast } from "sonner";

const PLAN_META = {
  free: { icon: Sparkles, bg: "from-slate-100 to-slate-200", iconColor: "text-slate-600", checkBg: "bg-slate-500" },
  pro: { icon: Zap, bg: "from-[#384877]/10 to-[#3b5aa2]/15", iconColor: "text-[#384877]", checkBg: "bg-[#384877]", badge: "推荐", btnGradient: "from-[#384877] to-[#3b5aa2]" },
  team: { icon: Crown, bg: "from-purple-100 to-purple-200", iconColor: "text-purple-600", checkBg: "bg-purple-500" },
};

export default function Pricing() {
  const { credits, plan, addCredits, refreshCredits, loading } = useAICredits();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [paymentPack, setPaymentPack] = useState(null);

  // Handle Stripe payment callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    const creditsParam = params.get("credits");
    if (paymentStatus === "success" && creditsParam) {
      toast.success(`支付成功！${creditsParam} AI 点数将很快到账`);
      // Clear URL params
      window.history.replaceState({}, "", window.location.pathname);
      // Refresh credits after a short delay to allow webhook processing
      setTimeout(() => refreshCredits(), 2000);
    } else if (paymentStatus === "cancelled") {
      toast.info("支付已取消");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refreshCredits]);

  const handleBuyCredits = (pack) => {
    setPaymentPack(pack);
  };

  const handleSubscribe = (planKey) => {
    if (planKey === "team") {
      toast.info("团队版请联系销售团队定制方案");
      return;
    }
    if (planKey === plan) return;
    // 模拟订阅（实际需要接入支付系统）
    toast.info("订阅功能即将上线，敬请期待！");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <Badge className="mb-4 bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white border-0 text-sm px-4 py-1.5">
            🚀 智能增强 · AI驱动
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">选择适合你的计划</h1>
          <p className="text-base text-slate-600 max-w-2xl mx-auto">订阅解锁高级功能，按需购买AI点数驱动智能服务</p>
        </motion.div>

        {/* 当前余额卡片 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="mb-8 border-0 shadow-lg bg-gradient-to-r from-[#384877]/5 via-[#3b5aa2]/8 to-[#384877]/5 overflow-hidden">
            <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
                  <Coins className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-sm text-[#384877] font-medium">我的 AI 点数</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-[#384877]">
                      {loading ? "..." : credits ?? 0}
                    </span>
                    <span className="text-slate-500 text-sm">点可用</span>
                    {plan !== "free" && (
                      <Badge className="bg-[#384877] text-white text-[10px] border-0 ml-1">
                        {SUBSCRIPTION_PLANS[plan]?.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="text-[#384877] border-[#384877]/30 hover:bg-[#384877]/5">
                <History className="w-4 h-4 mr-1" />
                消费明细
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* 订阅计划 */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#384877]" />
            订阅计划
          </h2>
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {Object.entries(SUBSCRIPTION_PLANS).map(([key, planConfig], index) => {
              const meta = PLAN_META[key];
              const Icon = meta.icon;
              const isCurrent = plan === key;
              const isHighlighted = key === "pro";
              return (
                <motion.div key={key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + index * 0.08 }}>
                  <Card className={`relative overflow-hidden h-full ${
                    isHighlighted ? "ring-2 ring-[#384877] shadow-xl" : "shadow-md hover:shadow-lg"
                  } transition-all duration-300`}>
                    {meta.badge && (
                      <div className="absolute top-3 right-3">
                        <Badge className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white border-0 text-xs shadow-sm">{meta.badge}</Badge>
                      </div>
                    )}
                    <div className="p-6">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${meta.bg} flex items-center justify-center mb-3`}>
                        <Icon className={`w-6 h-6 ${meta.iconColor}`} />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mb-1">{planConfig.name}</h3>
                      <div className="mb-4">
                        <span className="text-3xl font-bold text-slate-900">¥{planConfig.monthlyPrice}</span>
                        <span className="text-slate-500 text-sm"> /月</span>
                      </div>
                      {planConfig.monthlyBonus > 0 && (
                        <div className="mb-4 flex items-center gap-1.5 text-sm text-[#384877] bg-[#384877]/5 px-3 py-1.5 rounded-lg">
                          <Coins className="w-4 h-4" />
                          每月赠送 {planConfig.monthlyBonus} AI 点数
                        </div>
                      )}
                      <ul className="space-y-2.5 mb-6">
                        {planConfig.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <div className={`rounded-full p-0.5 ${meta.checkBg} mt-0.5 flex-shrink-0`}>
                              <Check className="w-3 h-3 text-white" />
                            </div>
                            <span className="text-slate-700">{f}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className={`w-full h-10 font-semibold ${
                          isCurrent ? "bg-slate-100 text-slate-500 cursor-default" :
                          isHighlighted ? `bg-gradient-to-r ${meta.btnGradient} text-white hover:opacity-90` :
                          key === "team" ? "bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300" :
                          "bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300"
                        }`}
                        disabled={isCurrent}
                        onClick={() => handleSubscribe(key)}
                      >
                        {isCurrent ? "当前计划" : key === "team" ? "联系销售" : "立即升级"}
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* AI 点数包 */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-[#384877]" />
            AI 点数包
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
           {CREDIT_PACKS.map((pack, index) => {
             const packColors = [
               { iconBg: "from-blue-100 to-indigo-100", icon: "text-blue-600", btn: "from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600", ring: "ring-blue-400", badge: "bg-blue-100 text-blue-700" },
               { iconBg: "from-indigo-100 to-violet-100", icon: "text-indigo-600", btn: "from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600", ring: "ring-indigo-400", badge: "bg-indigo-100 text-indigo-700" },
               { iconBg: "from-slate-100 to-blue-100", icon: "text-slate-600", btn: "from-slate-500 to-blue-500 hover:from-slate-600 hover:to-blue-600", ring: "ring-slate-400", badge: "bg-slate-100 text-slate-700" },
               { iconBg: "from-violet-100 to-purple-100", icon: "text-violet-600", btn: "from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600", ring: "ring-violet-400", badge: "bg-violet-100 text-violet-700" },
             ];
             const c = packColors[index % packColors.length];
             return (
             <motion.div key={pack.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + index * 0.06 }}>
               <Card className={`relative overflow-hidden hover:shadow-lg transition-all duration-300 ${
                 pack.tag === "最划算" ? `ring-2 ${c.ring}` : ""
               }`}>
                 {pack.tag && (
                   <div className="absolute top-2 right-2">
                     <Badge className={`border-0 text-[10px] ${
                       pack.tag === "最划算" ? `bg-gradient-to-r ${c.btn} text-white` : c.badge
                     }`}>{pack.tag}</Badge>
                   </div>
                 )}
                 <div className="p-5 text-center">
                   <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${c.iconBg} flex items-center justify-center mx-auto mb-3`}>
                     <Coins className={`w-6 h-6 ${c.icon}`} />
                   </div>
                   <h4 className="font-bold text-slate-900 mb-1">{pack.name}</h4>
                   <p className="text-2xl font-bold text-slate-900 mb-0.5">{pack.credits.toLocaleString()}</p>
                   <p className="text-xs text-slate-500 mb-3">AI 点数</p>
                   {pack.savings && (
                     <p className="text-xs text-emerald-600 font-medium mb-2">节省 {pack.savings}</p>
                   )}
                   <Button
                     className={`w-full bg-gradient-to-r ${c.btn} text-white h-9 text-sm font-semibold shadow-md border-0`}
                     onClick={() => handleBuyCredits(pack)}
                   >
                     {pack.priceDisplay}
                   </Button>
                 </div>
               </Card>
             </motion.div>
             );
           })}
          </div>
        </motion.div>

        {/* AI功能消耗参考 */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#384877]" />
                AI 功能点数消耗参考
              </h2>
              <p className="text-sm text-slate-500 mt-1.5">
                按真实 token 用量动态计费 · 不同功能有不同复杂度倍率
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#384877]/8 to-[#3b5aa2]/8 border border-[#384877]/15">
              <Cpu className="w-3.5 h-3.5 text-[#384877]" />
              <span className="text-xs text-[#384877] font-medium">1 点 ≈ 100 tokens</span>
            </div>
          </div>

          {(() => {
            // 统一使用品牌主题色系 #384877 → #3b5aa2，仅通过图标区分功能
            const PRIMARY = "#384877";
            const PRIMARY_LIGHT = "#3b5aa2";
            const featureIcons = {
              smart_priority: Flag,
              task_breakdown: ListTree,
              note_summary: FileText,
              schedule_optimize: CalendarClock,
              emotional_reminder: Heart,
              daily_briefing: Sunrise,
              weekly_plan: CalendarRange,
              monthly_plan: CalendarDays,
              general_ai: MessageCircle,
            };
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(AI_FEATURES).map(([key, feature]) => {
                  const Icon = featureIcons[key] || MessageCircle;
                  const m = feature.multiplier || 1;
                  const pct = Math.min(100, Math.round((m / 3) * 100));
                  return (
                    <div
                      key={key}
                      className="group relative rounded-2xl border border-[#384877]/10 bg-gradient-to-br from-white to-[#f5f7fb] p-4 hover:shadow-lg hover:shadow-[#384877]/5 hover:-translate-y-0.5 hover:border-[#384877]/20 transition-all duration-300 overflow-hidden"
                    >
                      {/* Decorative gradient orb in theme color */}
                      <div
                        className="absolute -right-10 -top-10 w-28 h-28 rounded-full opacity-[0.07] blur-2xl pointer-events-none"
                        style={{ backgroundColor: PRIMARY }}
                      />

                      <div className="relative">
                        <div className="flex items-start gap-3 mb-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                            style={{
                              background: `linear-gradient(135deg, ${PRIMARY}15, ${PRIMARY_LIGHT}10)`,
                              color: PRIMARY,
                            }}
                          >
                            <Icon className="w-5 h-5" strokeWidth={2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 leading-tight">{feature.name}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{m.toFixed(1)}x 复杂度</p>
                          </div>
                          <div
                            className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: `${PRIMARY}12`, color: PRIMARY }}
                          >
                            {feature.estimated?.replace(/\s?点\/次$/, "") || `${m}x`}
                          </div>
                        </div>

                        {/* Complexity bar - theme gradient */}
                        <div className="h-1.5 rounded-full bg-[#384877]/8 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, ${PRIMARY}, ${PRIMARY_LIGHT})`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </motion.div>

        {/* FAQ */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="max-w-3xl mx-auto mt-10">
          <h2 className="text-xl font-bold text-slate-900 mb-4 text-center">常见问题</h2>
          <div className="space-y-3">
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 mb-1 text-sm">AI 点数有有效期吗？</h3>
              <p className="text-slate-600 text-sm">购买的AI点数永久有效，不会过期。订阅赠送的点数也不会随订阅到期而失效。</p>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 mb-1 text-sm">免费版可以使用AI功能吗？</h3>
              <p className="text-slate-600 text-sm">可以！新用户赠送200AI点数，您可以体验所有AI功能。用完后可以直接购买点数包，无需订阅。</p>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-slate-900 mb-1 text-sm">订阅Pro和直接买点数有什么区别？</h3>
              <p className="text-slate-600 text-sm">Pro订阅除了每月赠送500点数外，还解锁无限任务/笔记、高级提醒策略、团队协作等非AI功能。如果您只需AI服务，可以只买点数包。</p>
            </Card>
          </div>
        </motion.div>

        <CreditHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
        <PaymentMethodDialog
          open={!!paymentPack}
          onOpenChange={(open) => { if (!open) setPaymentPack(null); }}
          pack={paymentPack}
          onPaymentSuccess={() => { setPaymentPack(null); refreshCredits(true); }}
        />
      </div>
    </div>
  );
}