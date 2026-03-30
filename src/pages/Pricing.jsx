import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap, Crown, Coins, History, Package } from "lucide-react";
import { SUBSCRIPTION_PLANS, CREDIT_PACKS, AI_FEATURES } from "@/components/credits/creditConfig";
import { useAICredits } from "@/components/credits/useAICredits";
import CreditHistoryDialog from "@/components/credits/CreditHistoryDialog";
import { toast } from "sonner";

const PLAN_META = {
  free: { icon: Sparkles, color: "from-slate-500 to-slate-600" },
  pro: { icon: Zap, color: "from-[#384877] to-[#3b5aa2]", badge: "推荐" },
  team: { icon: Crown, color: "from-purple-500 to-purple-600" },
};

export default function Pricing() {
  const { credits, plan, addCredits, refreshCredits, loading } = useAICredits();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [purchasing, setPurchasing] = useState(null);

  const handleBuyCredits = async (pack) => {
    setPurchasing(pack.id);
    // 模拟支付流程（实际需要接入Stripe等支付系统）
    await new Promise(r => setTimeout(r, 1000));
    await addCredits(pack.credits, "purchase", `购买「${pack.name}」${pack.credits} 点`);
    await refreshCredits();
    setPurchasing(null);
    toast.success(`成功购买 ${pack.credits} AI 点数！`);
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
          <Badge className="mb-4 bg-gradient-to-r from-amber-400 to-amber-500 text-white border-0 text-sm px-4 py-1.5">
            🚀 智能增强 · AI驱动
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">选择适合你的计划</h1>
          <p className="text-base text-slate-600 max-w-2xl mx-auto">订阅解锁高级功能，按需购买AI点数驱动智能服务</p>
        </motion.div>

        {/* 当前余额卡片 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="mb-8 border-0 shadow-lg bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 overflow-hidden">
            <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                  <Coins className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-sm text-amber-700 font-medium">我的 AI 点数</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">
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
              <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="text-amber-700 border-amber-300 hover:bg-amber-100">
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
                        <Badge className="bg-gradient-to-r from-amber-400 to-amber-500 text-white border-0 text-xs">{meta.badge}</Badge>
                      </div>
                    )}
                    <div className="p-6">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${meta.color} flex items-center justify-center mb-3 shadow-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mb-1">{planConfig.name}</h3>
                      <div className="mb-4">
                        <span className="text-3xl font-bold text-slate-900">¥{planConfig.monthlyPrice}</span>
                        <span className="text-slate-500 text-sm"> /月</span>
                      </div>
                      {planConfig.monthlyBonus > 0 && (
                        <div className="mb-4 flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
                          <Coins className="w-4 h-4" />
                          每月赠送 {planConfig.monthlyBonus} AI 点数
                        </div>
                      )}
                      <ul className="space-y-2.5 mb-6">
                        {planConfig.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <div className={`rounded-full p-0.5 bg-gradient-to-br ${meta.color} mt-0.5 flex-shrink-0`}>
                              <Check className="w-3 h-3 text-white" />
                            </div>
                            <span className="text-slate-700">{f}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className={`w-full h-10 font-semibold ${
                          isCurrent ? "bg-slate-100 text-slate-500 cursor-default" :
                          isHighlighted ? `bg-gradient-to-r ${meta.color} text-white hover:opacity-90` :
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
            <Package className="w-5 h-5 text-amber-600" />
            AI 点数包
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {CREDIT_PACKS.map((pack, index) => (
              <motion.div key={pack.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + index * 0.06 }}>
                <Card className={`relative overflow-hidden hover:shadow-lg transition-all duration-300 ${
                  pack.tag === "最划算" ? "ring-2 ring-amber-400" : ""
                }`}>
                  {pack.tag && (
                    <div className="absolute top-2 right-2">
                      <Badge className={`border-0 text-[10px] ${
                        pack.tag === "最划算" ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white" :
                        pack.tag === "超值" ? "bg-purple-100 text-purple-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>{pack.tag}</Badge>
                    </div>
                  )}
                  <div className="p-5 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mx-auto mb-3">
                      <Coins className="w-6 h-6 text-amber-600" />
                    </div>
                    <h4 className="font-bold text-slate-900 mb-1">{pack.name}</h4>
                    <p className="text-2xl font-bold text-slate-900 mb-0.5">{pack.credits.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 mb-3">AI 点数</p>
                    {pack.savings && (
                      <p className="text-xs text-green-600 font-medium mb-2">节省 {pack.savings}</p>
                    )}
                    <Button
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white h-9 text-sm"
                      onClick={() => handleBuyCredits(pack)}
                      disabled={purchasing === pack.id}
                    >
                      {purchasing === pack.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      ) : (
                        pack.priceDisplay
                      )}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* AI功能消耗参考 */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#384877]" />
            AI 功能点数消耗参考
          </h2>
          <Card className="border-0 shadow-md overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(AI_FEATURES).map(([key, feature], index) => (
                <div key={key} className="flex items-center gap-3 p-4 border-b border-r border-slate-100 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Coins className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{feature.name}</p>
                    <p className="text-xs text-slate-500 truncate">{feature.description}</p>
                  </div>
                  <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 text-xs flex-shrink-0">
                    {feature.cost} 点
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
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
      </div>
    </div>
  );
}